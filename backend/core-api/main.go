package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"sync"
	"time"

	"cloud.google.com/go/bigquery"
	"cloud.google.com/go/pubsub"
	"github.com/anuragjambhulkar/devsyncpro-backend/backend/pkg/scanner"
	"github.com/gorilla/websocket"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

// ========= Shared Setup =========
var (
	pubsubClient *pubsub.Client
	bqClient     *bigquery.Client
	db           *gorm.DB

	topicScanID = os.Getenv("PUBSUB_TOPIC_SCAN")
	topicOpID   = os.Getenv("PUBSUB_TOPIC_OPERATIONS")
	datasetID   = os.Getenv("BQ_DATASET")
	tableID     = os.Getenv("BQ_TABLE_METRICS")
)

func initGCP() {
	projectID := os.Getenv("GOOGLE_CLOUD_PROJECT")
	if projectID == "" {
		log.Println("GOOGLE_CLOUD_PROJECT not set, skipping GCP init")
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if topicScanID != "" || topicOpID != "" {
		ps, err := pubsub.NewClient(ctx, projectID)
		if err == nil {
			pubsubClient = ps
			log.Printf("Pub/Sub initialized")
		} else {
			log.Printf("Failed to init Pub/Sub: %v", err)
		}
	}

	if datasetID != "" {
		bq, err := bigquery.NewClient(ctx, projectID)
		if err == nil {
			bqClient = bq
			log.Printf("BigQuery initialized for dataset %s", datasetID)
		} else {
			log.Printf("Failed to init BigQuery: %v", err)
		}
	}
}

func initDB() {
	host := os.Getenv("DB_HOST")
	if host == "" {
		log.Println("DB_HOST not set, skipping DB init")
		return
	}
	dsn := fmt.Sprintf("host=%s user=%s password=%s dbname=%s port=5432 sslmode=disable",
		host,
		os.Getenv("DB_USER"),
		os.Getenv("DB_PASS"),
		os.Getenv("DB_NAME"),
	)
	var err error
	db, err = gorm.Open(postgres.Open(dsn), &gorm.Config{})
	if err != nil {
		log.Printf("Failed to connect to database: %v", err)
		return
	}
	log.Println("Connected to PostgreSQL successfully.")

	// Auto Migrate
	_ = db.AutoMigrate(&Scan{}, &NodeModel{}, &EdgeModel{})
}

// ========= WEBSOCKET GLOBALS =========
var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}
var clients = make(map[*websocket.Conn]bool)
var clientsLock sync.Mutex

func broadcastToWS(payload interface{}) {
	clientsLock.Lock()
	defer clientsLock.Unlock()
	for client := range clients {
		err := client.WriteJSON(payload)
		if err != nil {
			client.Close()
			delete(clients, client)
		}
	}
}

func handleWS(w http.ResponseWriter, r *http.Request) {
	ws, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("WebSocket upgrade failed: %v", err)
		return
	}
	defer ws.Close()

	clientsLock.Lock()
	clients[ws] = true
	clientsLock.Unlock()

	ws.WriteJSON(map[string]interface{}{
		"type":    "info",
		"message": "Connected to DevSyncPro Live Event Stream",
	})

	for {
		_, _, err := ws.ReadMessage()
		if err != nil {
			break
		}
	}

	clientsLock.Lock()
	delete(clients, ws)
	clientsLock.Unlock()
}

// ========= SCANNER CODE =========
type Scan struct {
	gorm.Model
	RepoURL string
	Nodes   []NodeModel `gorm:"foreignKey:ScanID"`
	Edges   []EdgeModel `gorm:"foreignKey:ScanID"`
}

type NodeModel struct {
	gorm.Model
	ScanID uint
	Name   string
	Type   string
}

type EdgeModel struct {
	gorm.Model
	ScanID uint
	From   string
	To     string
}

type Edge struct {
	From string `json:"from"`
	To   string `json:"to"`
}

type DepGraph struct {
	Nodes []string `json:"nodes"`
	Edges []Edge   `json:"edges"`
}

func publishScanEvent(repo string, nodes int) {
	if pubsubClient == nil || topicScanID == "" {
		return
	}
	ctx := context.Background()
	topic := pubsubClient.Topic(topicScanID)
	msg := map[string]interface{}{
		"event":     "scan_completed",
		"repo":      repo,
		"nodes":     nodes,
		"timestamp": time.Now().Format(time.RFC3339),
	}
	data, _ := json.Marshal(msg)
	topic.Publish(ctx, &pubsub.Message{Data: data})
}

func scanHandler(w http.ResponseWriter, r *http.Request) {
	type Req struct {
		RepoPath string `json:"repoPath,omitempty"`
		RepoURL  string `json:"repo_url,omitempty"`
		Ref      string `json:"ref,omitempty"`
		Token    string `json:"token,omitempty"`
		SubPath  string `json:"subpath,omitempty"`
	}
	var req Req
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid json: "+err.Error(), 400)
		return
	}

	var scanRoot string
	cleanup := false
	if req.RepoURL != "" {
		tmp, err := scanner.GitCloneToTemp(req.RepoURL, req.Ref, req.Token)
		if err != nil {
			http.Error(w, "clone failed: "+err.Error(), 500)
			return
		}
		scanRoot = tmp
		cleanup = true
	} else if req.RepoPath != "" {
		scanRoot = req.RepoPath
	} else {
		http.Error(w, "provide repo_url or repoPath", 400)
		return
	}

	if req.SubPath != "" {
		scanRoot = filepath.Join(scanRoot, req.SubPath)
	}

	graph, meta, err := scanner.ScanRepoPathMulti(scanRoot)
	if cleanup {
		go func(p string) { time.Sleep(2 * time.Second); _ = os.RemoveAll(p) }(scanRoot)
	}
	if err != nil {
		http.Error(w, "scan error: "+err.Error(), 500)
		return
	}

	if db != nil {
		scanRec := Scan{RepoURL: req.RepoURL}
		nodes := []NodeModel{}
		for _, n := range graph.Nodes {
			nmeta := meta[n]
			nodes = append(nodes, NodeModel{Name: n, Type: nmeta.Language})
		}
		edges := []EdgeModel{}
		for _, e := range graph.Edges {
			edges = append(edges, EdgeModel{From: e.From, To: e.To})
		}
		scanRec.Nodes = nodes
		scanRec.Edges = edges
		_ = db.Create(&scanRec)
	}

	go publishScanEvent(scanRoot, len(graph.Nodes))

	// Broadcast repo scan completion via websocket
	go broadcastToWS(map[string]interface{}{
		"type":      "repo-update",
		"repo":      req.RepoURL,
		"event":     "scanned",
		"timestamp": time.Now().Format(time.RFC3339),
	})

	resp := map[string]interface{}{
		"graph": graph,
		"meta":  meta,
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

func graphHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	if db == nil {
		json.NewEncoder(w).Encode(DepGraph{Nodes: []string{}, Edges: []Edge{}})
		return
	}
	var lastScan Scan
	if err := db.Preload("Nodes").Preload("Edges").Order("created_at desc").First(&lastScan).Error; err != nil {
		json.NewEncoder(w).Encode(DepGraph{Nodes: []string{}, Edges: []Edge{}})
		return
	}
	resp := DepGraph{Nodes: []string{}, Edges: []Edge{}}
	for _, n := range lastScan.Nodes {
		resp.Nodes = append(resp.Nodes, n.Name)
	}
	for _, e := range lastScan.Edges {
		resp.Edges = append(resp.Edges, Edge{From: e.From, To: e.To})
	}
	json.NewEncoder(w).Encode(resp)
}

// ========= ORCHESTRATOR CODE =========
func publishOpEvent(eventType string, data interface{}) {
	if pubsubClient == nil || topicOpID == "" {
		return
	}
	ctx := context.Background()
	topic := pubsubClient.Topic(topicOpID)
	payload := map[string]interface{}{
		"type":      eventType,
		"data":      data,
		"timestamp": time.Now().Format(time.RFC3339),
	}
	bytes, _ := json.Marshal(payload)
	topic.Publish(ctx, &pubsub.Message{Data: bytes})
}

type MetricRow struct {
	Timestamp   time.Time
	Service     string
	MetricName  string
	MetricValue float64
}

func logToBigQuery(service, metric string, value float64) {
	if bqClient == nil {
		return
	}
	ctx := context.Background()
	inserter := bqClient.Dataset(datasetID).Table(tableID).Inserter()
	row := MetricRow{
		Timestamp:   time.Now(),
		Service:     service,
		MetricName:  metric,
		MetricValue: value,
	}
	_ = inserter.Put(ctx, row)
}

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
)

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
	if inc.Severity == "critical" {
		inc.WarRoomUrl = "https://zoom.us/j/yourmeetingid"
	}
	incidentStore = append(incidentStore, inc)
	incidentLock.Unlock()

	// Direct broadcast instead of relaying to another service
	go broadcastToWS(inc)
	go publishOpEvent("incident_created", inc)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(inc)
}

func handleGetIncidents(w http.ResponseWriter, r *http.Request) {
	incidentLock.Lock()
	defer incidentLock.Unlock()
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(incidentStore)
}

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

type Deployment struct {
	ID      int       `json:"id"`
	Service string    `json:"service"`
	Status  string    `json:"status"`
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

	go publishOpEvent("deployment_started", d)

	go func(depID int) {
		time.Sleep(2 * time.Second)
		var serviceName string
		deployLock.Lock()
		for i := range deployments {
			if deployments[i].ID == depID {
				deployments[i].Status = "running"
				serviceName = deployments[i].Service
			}
		}
		deployLock.Unlock()
		publishOpEvent("deployment_running", map[string]interface{}{"id": depID, "service": serviceName})

		time.Sleep(2 * time.Second)
		deployLock.Lock()
		success := false
		for i := range deployments {
			if deployments[i].ID == depID {
				if depID%5 == 0 {
					deployments[i].Status = "failed"
				} else {
					deployments[i].Status = "success"
					success = true
				}
			}
		}
		deployLock.Unlock()
		publishOpEvent("deployment_finished", map[string]interface{}{"id": depID, "service": serviceName, "success": success})

		if success {
			go logToBigQuery(serviceName, "deployment_success", 1.0)
		} else {
			go logToBigQuery(serviceName, "deployment_failure", 1.0)
		}

		// Broadcast deployment status via websocket
		go broadcastToWS(map[string]interface{}{
			"type":      "repo-update",
			"repo":      serviceName,
			"event":     "deployed",
			"timestamp": time.Now().Format(time.RFC3339),
		})

	}(d.ID)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(d)
}

func handleGetDeployments(w http.ResponseWriter, r *http.Request) {
	deployLock.Lock()
	defer deployLock.Unlock()
	json.NewEncoder(w).Encode(deployments)
}

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

	metrics := map[string]interface{}{
		"deploy_success_rate": func() float64 {
			if total == 0 {
				return 1.0
			}
			return float64(success) / float64(total)
		}(),
		"incident_detection_time_s": 20,
		"api_latency_ms":            85,
		"max_blast_radius":          7,
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(metrics)
}

// ========= MIDDLEWARE & MAIN =========
func withCORS(h http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin == "" {
			origin = "*"
		}
		w.Header().Set("Access-Control-Allow-Origin", origin)
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With, Origin, Accept")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS, PUT, DELETE, PATCH")
		w.Header().Set("Access-Control-Allow-Credentials", "true")

		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		h.ServeHTTP(w, r)
	})
}

func rootHandler(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(http.StatusOK)
	fmt.Fprintf(w, "DevSyncPro Core API Live - OK")
}

func main() {
	initGCP()
	initDB()

	mux := http.NewServeMux()
	mux.HandleFunc("/", rootHandler)

	// Scanner Routes
	mux.HandleFunc("/scan", scanHandler)
	mux.HandleFunc("/graph", graphHandler)

	// Orchestrator Routes
	mux.HandleFunc("/incidents", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == "POST" {
			handlePostIncident(w, r)
		} else {
			handleGetIncidents(w, r)
		}
	})
	mux.HandleFunc("/resolve", handleResolveIncident)
	mux.HandleFunc("/deployments", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == "POST" {
			handlePostDeployment(w, r)
		} else {
			handleGetDeployments(w, r)
		}
	})
	mux.HandleFunc("/metrics", handleMetrics)

	// WebSocket Route
	mux.HandleFunc("/ws", handleWS)

	// Universal Health
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"status": "healthy", "service": "core-api", "v": "3.0.0"})
	})

	port := os.Getenv("PORT")
	if port == "" {
		port = "10000"
	}

	log.Printf("DevSyncPro Core API running on :%s", port)
	log.Fatal(http.ListenAndServe(":"+port, withCORS(mux)))
}
