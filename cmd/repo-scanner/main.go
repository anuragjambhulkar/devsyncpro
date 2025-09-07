package main

import (
	"bytes"
	"encoding/json"
	"io"
	"log"
	"net/http"
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
	ID        int       `json:"id"`
	Type      string    `json:"type"`
	Service   string    `json:"service"`
	Status    string    `json:"status"`
	Message   string    `json:"message"`
	Timestamp time.Time `json:"timestamp"`
}

var (
	incidentStore []Incident
	incidentLock  sync.Mutex
	incidentCount int

	upgrader  = websocket.Upgrader{}
	wsClients = make(map[*websocket.Conn]bool)
	wsLock    sync.Mutex
)

// POST /incidents -- adds a new incident, pushes via websocket
func handlePostIncident(w http.ResponseWriter, r *http.Request) {
	var inc Incident
	if err := json.NewDecoder(r.Body).Decode(&inc); err != nil {
		http.Error(w, "Invalid json", 400)
		return
	}
	incidentLock.Lock()
	incidentCount++
	inc.ID = incidentCount
	inc.Status = "active"
	inc.Timestamp = time.Now()
	incidentStore = append(incidentStore, inc)
	incidentLock.Unlock()
	go broadcastIncident(inc)
	go notifySlack("🚨 INCIDENT: " + inc.Type + " in " + inc.Service + ": " + inc.Message)
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
	// Simulate avg detection/metrics (improve as needed)
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

// --- Slack Webhook Integration ---
// Uncomment below and insert your real Slack Webhook URL
func notifySlack(msg string) {
	webhookURL := "https://hooks.slack.com/services/XXX/YYY/ZZZ"
	payload := []byte(`{"text": "` + msg + `"}`)
	http.Post(webhookURL, "application/json", bytes.NewBuffer(payload))
}

// --- main(): register everything! ---
func main() {
	http.HandleFunc("/scan", withCORS(scanHandler))
	http.HandleFunc("/graph", withCORS(graphHandler))
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
