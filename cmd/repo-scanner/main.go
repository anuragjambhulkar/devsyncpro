package main

import (
	"bytes"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"net/smtp"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"golang.org/x/mod/modfile"
)

// --- Dependency Graph Types/APIs ---
type Edge struct {
	From string `json:"from"`
	To   string `json:"to"`
}
type DepGraph struct {
	Nodes []string `json:"nodes"`
	Edges []Edge   `json:"edges"`
}

// Parse go.mod and return list of dependency module paths
func parseGoMod(path string) ([]string, error) {
	gomod := filepath.Join(path, "go.mod")
	data, err := os.ReadFile(gomod)
	if err != nil {
		return nil, err
	}
	mf, err := modfile.Parse("go.mod", data, nil)
	if err != nil {
		return nil, err
	}
	deps := []string{}
	for _, req := range mf.Require {
		deps = append(deps, req.Mod.Path)
	}
	return deps, nil
}

var lastGraph = DepGraph{
	Nodes: []string{},
	Edges: []Edge{},
}

func scanHandler(w http.ResponseWriter, r *http.Request) {
	type Req struct {
		RepoPath string `json:"repoPath"`
	}
	var req Req
	body, _ := io.ReadAll(r.Body)
	_ = json.Unmarshal(body, &req)
	deps, err := parseGoMod(req.RepoPath)
	if err != nil {
		log.Printf("scan error: %v\n", err)
		http.Error(w, "Failed to scan: "+err.Error(), 400)
		return
	}
	nodes := []string{"main"}
	edges := []Edge{}
	for _, d := range deps {
		nodes = append(nodes, d)
		edges = append(edges, Edge{From: "main", To: d})
	}
	lastGraph = DepGraph{Nodes: nodes, Edges: edges}
	w.WriteHeader(http.StatusOK)
	w.Write([]byte(`{"status":"scan complete"}`))
}

func graphHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(lastGraph)
}

func withCORS(h http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Headers", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		h(w, r)
	}
}

// --- Incident & WebSocket Types/APIs ---
type Incident struct {
	ID         int       `json:"id"`
	Type       string    `json:"type"`
	Service    string    `json:"service"`
	Status     string    `json:"status"`
	Message    string    `json:"message"`
	Timestamp  time.Time `json:"timestamp"`
	Severity   string    `json:"severity,omitempty"`
	WarRoomUrl string    `json:"warRoomUrl,omitempty"`
}

var (
	incidentStore []Incident
	incidentLock  sync.Mutex
	incidentCount int

	upgrader  = websocket.Upgrader{}
	wsClients = make(map[*websocket.Conn]bool)
	wsLock    sync.Mutex
)

// --- SLACK WEBHOOK AND EMAIL CONFIG ---
var slackWebhook = "https://hooks.slack.com/services/YOUR/WEBHOOK/PATH"
var incidentEmailRecipients = []string{
	"your@email.com",
}
var emailFrom = "your@email.com"
var emailPassword = "your_app_password" // Use env var or config in production

// --- Utility function to send Slack alert ---
func sendSlackAlert(incident Incident) {
	payload := map[string]string{
		"text": "🚨 *New Incident: " + incident.Type + "*\n" +
			"Service: " + incident.Service + "\n" +
			"Status: " + incident.Status + "\n" +
			"Message: " + incident.Message,
	}
	jsonBody, _ := json.Marshal(payload)
	http.Post(slackWebhook, "application/json", bytes.NewBuffer(jsonBody))
}

// --- Utility to send HTML email (supports Gmail SMTP with app password) ---
func sendIncidentEmail(to, subject, body string) error {
	msg := "From: " + emailFrom + "\n" +
		"To: " + to + "\n" +
		"Subject: " + subject + "\n" +
		"MIME-version: 1.0;\nContent-Type: text/html; charset=\"UTF-8\";\n\n" +
		body
	return smtp.SendMail("smtp.gmail.com:587",
		smtp.PlainAuth("", emailFrom, emailPassword, "smtp.gmail.com"),
		emailFrom, []string{to}, []byte(msg))
}

// --- POST /incidents -- adds a new incident, pushes via websocket & sends alerts ---
func handlePostIncident(w http.ResponseWriter, r *http.Request) {
	var inc Incident
	if err := json.NewDecoder(r.Body).Decode(&inc); err != nil {
		http.Error(w, "Invalid json", 400)
		return
	}
	incidentLock.Lock()
	incidentCount++
	inc.ID = incidentCount
	if inc.Status == "" {
		inc.Status = "active"
	}
	inc.Timestamp = time.Now()

	// Auto-set war room link and severity if incident is critical
	if inc.Severity == "critical" {
		inc.WarRoomUrl = "https://zoom.us/j/yourmeetingid" // Replace with real war room link if desired
	} else {
		inc.WarRoomUrl = ""
	}

	incidentStore = append(incidentStore, inc)
	incidentLock.Unlock()
	go broadcastIncident(inc)
	go sendSlackAlert(inc)

	// Send email to each recipient
	go func(incident Incident) {
		for _, to := range incidentEmailRecipients {
			sendIncidentEmail(
				to,
				"New Incident: "+incident.Type,
				"<b>Service:</b> "+incident.Service+"<br />"+
					"<b>Status:</b> "+incident.Status+"<br />"+
					"<b>Message:</b> "+incident.Message,
			)
		}
	}(inc)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(inc)
}

// GET /incidents -- fetch active and historical incidents
func handleGetIncidents(w http.ResponseWriter, r *http.Request) {
	incidentLock.Lock()
	defer incidentLock.Unlock()
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(incidentStore)
}

// WebSocket endpoint for live incident push
func wsHandler(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	wsLock.Lock()
	wsClients[conn] = true
	wsLock.Unlock()
	for {
		if _, _, err := conn.NextReader(); err != nil {
			wsLock.Lock()
			delete(wsClients, conn)
			wsLock.Unlock()
			conn.Close()
			break
		}
	}
}

func broadcastIncident(inc Incident) {
	wsLock.Lock()
	defer wsLock.Unlock()
	for conn := range wsClients {
		conn.WriteJSON(inc)
	}
}

// --- Deployments ---
type Deployment struct {
	ID      int       `json:"id"`
	Service string    `json:"service"`
	Status  string    `json:"status"` // pending, running, success, failed
	Created time.Time `json:"created"`
}

var (
	deployments []Deployment
	deployCount int
	deployLock  sync.Mutex
)

func handlePostDeployment(w http.ResponseWriter, r *http.Request) {
	var d Deployment
	_ = json.NewDecoder(r.Body).Decode(&d)
	deployLock.Lock()
	deployCount++
	d.ID = deployCount
	d.Status = "pending"
	d.Created = time.Now()
	deployments = append(deployments, d)
	deployLock.Unlock()
	// Simulated deployment progress (update after delays)
	go func(depID int) {
		time.Sleep(2 * time.Second)
		deployLock.Lock()
		for i := range deployments {
			if deployments[i].ID == depID {
				deployments[i].Status = "running"
			}
		}
		deployLock.Unlock()
		time.Sleep(2 * time.Second)
		deployLock.Lock()
		for i := range deployments {
			if deployments[i].ID == depID {
				if depID%5 == 0 {
					deployments[i].Status = "failed"
				} else {
					deployments[i].Status = "success"
				}
			}
		}
		deployLock.Unlock()
	}(d.ID)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(d)
}

func handleGetDeployments(w http.ResponseWriter, r *http.Request) {
	deployLock.Lock()
	defer deployLock.Unlock()
	json.NewEncoder(w).Encode(deployments)
}

// --- Metrics endpoint ---
func handleMetrics(w http.ResponseWriter, r *http.Request) {
	deployLock.Lock()
	total := len(deployments)
	success := 0
	for _, d := range deployments {
		if d.Status == "success" {
			success++
		}
	}
	deployLock.Unlock()
	incidentLock.Lock()
	avgDetectTime := 20
	blast := 7
	incidentLock.Unlock()
	metrics := map[string]interface{}{
		"deploy_success_rate": func() float64 {
			if total == 0 {
				return 1.0
			}
			return float64(success) / float64(total)
		}(),
		"incident_detection_time_s": avgDetectTime,
		"api_latency_ms":            180,
		"max_blast_radius":          blast,
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(metrics)
}

// --- Incident resolve & diagnose ---
func handleResolveIncident(w http.ResponseWriter, r *http.Request) {
	var d struct{ ID int }
	json.NewDecoder(r.Body).Decode(&d)
	incidentLock.Lock()
	for i, inc := range incidentStore {
		if inc.ID == d.ID {
			incidentStore[i].Status = "resolved"
		}
	}
	incidentLock.Unlock()
	w.Write([]byte("{}"))
}
func handleDiagnoseIncident(w http.ResponseWriter, r *http.Request) {
	var d struct{ ID int }
	json.NewDecoder(r.Body).Decode(&d)
	suggestion := "Check DB connection, dependency configuration, and service logs for details." // Mock AI suggestion
	json.NewEncoder(w).Encode(map[string]string{"fix": suggestion})
}

// --- main(): register everything! ---
func main() {

	http.HandleFunc("/diagnose", withCORS(handleDiagnoseIncident))
	http.HandleFunc("/scan", withCORS(scanHandler))
	http.HandleFunc("/graph", withCORS(graphHandler))
	http.HandleFunc("/resolve", withCORS(handleResolveIncident))
	http.HandleFunc("/incidents", withCORS(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == "POST" {
			handlePostIncident(w, r)
		} else if r.Method == "GET" {
			handleGetIncidents(w, r)
		} else {
			http.Error(w, "method not allowed", 405)
		}
	}))
	http.HandleFunc("/ws", wsHandler)
	http.HandleFunc("/deployments", withCORS(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == "POST" {
			handlePostDeployment(w, r)
		} else if r.Method == "GET" {
			handleGetDeployments(w, r)
		} else {
			http.Error(w, "method not allowed", 405)
		}
	}))
	http.HandleFunc("/metrics", withCORS(handleMetrics))
	log.Println("DevSyncPro API running on :8081")
	log.Fatal(http.ListenAndServe(":8081", nil))
}
