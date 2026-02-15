package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"cloud.google.com/go/pubsub"
	"github.com/anuragjambhulkar/devsyncpro-backend/backend/pkg/scanner"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

var (
	pubsubClient *pubsub.Client
	topicID      = os.Getenv("PUBSUB_TOPIC_SCAN")
)

func initPubSub() {
	if topicID == "" {
		log.Println("PUBSUB_TOPIC_SCAN not set, skipping Pub/Sub init")
		// don't return, allow app to start without pubsub
	} else {
		ctx := context.Background()
		projectID := os.Getenv("GOOGLE_CLOUD_PROJECT")
		client, err := pubsub.NewClient(ctx, projectID)
		if err != nil {
			log.Printf("Failed to create pubsub client: %v", err)
		} else {
			pubsubClient = client
			log.Printf("Pub/Sub initialized for project %s, topic %s", projectID, topicID)
		}
	}
}

func initDB() {
	dsn := fmt.Sprintf("host=%s user=%s password=%s dbname=%s port=5432 sslmode=disable",
		os.Getenv("DB_HOST"),
		os.Getenv("DB_USER"),
		os.Getenv("DB_PASS"),
		os.Getenv("DB_NAME"),
	)
	var err error
	db, err = gorm.Open(postgres.Open(dsn), &gorm.Config{})
	if err != nil {
		log.Printf("Failed to connect to database: %v. Running in MEMORY-ONLY mode (legacy).", err)
		return
	}
	log.Println("Connected to PostgreSQL successfully.")

	// Auto Migrate
	err = db.AutoMigrate(&Scan{}, &NodeModel{}, &EdgeModel{})
	if err != nil {
		log.Fatalf("Failed to migrate database schema: %v", err)
	}
	log.Println("Database migration completed.")
}

func publishScanEvent(repo string, nodes int) {
	if pubsubClient == nil {
		return
	}
	ctx := context.Background()
	topic := pubsubClient.Topic(topicID)
	msg := map[string]interface{}{
		"event":     "scan_completed",
		"repo":      repo,
		"nodes":     nodes,
		"timestamp": time.Now().Format(time.RFC3339),
	}
	data, _ := json.Marshal(msg)
	res := topic.Publish(ctx, &pubsub.Message{Data: data})
	id, err := res.Get(ctx)
	if err != nil {
		log.Printf("Failed to publish to pubsub: %v", err)
		return
	}
	log.Printf("Published scan event to pubsub, msg ID: %s", id)
}

// --- Dependency Graph Types/APIs ---
// --- Database Models ---
var db *gorm.DB

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

// --- JSON Response Models (Frontend Contract) ---
type Edge struct {
	From string `json:"from"`
	To   string `json:"to"`
}

type DepGraph struct {
	Nodes []string `json:"nodes"`
	Edges []Edge   `json:"edges"`
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
			log.Printf("Clone failed for %s: %v", req.RepoURL, err)
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
		log.Printf("Scan failed for %s: %v", scanRoot, err)
		http.Error(w, "scan error: "+err.Error(), 500)
		return
	}

	// --- Persist to Database ---
	if db != nil {
		scanRec := Scan{
			RepoURL: req.RepoURL, // might be empty if local path
		}
		// Insert basic nodes/edges
		nodes := []NodeModel{}
		for _, n := range graph.Nodes {
			meta := meta[n]
			nodes = append(nodes, NodeModel{Name: n, Type: meta.Language})
		}
		// Edges need mapping names to IDs implicitly handled by creating Scan with nested structs
		// Actually, GORM saves related data if we populate the struct hierarchy.
		// However, edges refer to Node names. For visualization, we store string references (From/To).
		edges := []EdgeModel{}
		for _, e := range graph.Edges {
			edges = append(edges, EdgeModel{From: e.From, To: e.To})
		}

		scanRec.Nodes = nodes
		scanRec.Edges = edges

		if err := db.Create(&scanRec).Error; err != nil {
			log.Printf("Failed to save scan to DB: %v", err)
		} else {
			log.Printf("Saved scan ID %d to DB", scanRec.Model.ID)
		}
	} else {
		log.Println("DB not connected, skipping persistence (data will be lost 😢)")
	}

	// Trigger Pub/Sub event
	go publishScanEvent(scanRoot, len(graph.Nodes))

	// Build enriched response: graph + node metadata
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
		// Fallback (empty)
		json.NewEncoder(w).Encode(DepGraph{Nodes: []string{}, Edges: []Edge{}})
		return
	}

	var lastScan Scan
	// Get latest scan with preload
	result := db.Preload("Nodes").Preload("Edges").Order("created_at desc").First(&lastScan)
	if result.Error != nil {
		json.NewEncoder(w).Encode(DepGraph{Nodes: []string{}, Edges: []Edge{}})
		return
	}

	// Convert DB model to JSON response model
	resp := DepGraph{
		Nodes: []string{},
		Edges: []Edge{},
	}
	for _, n := range lastScan.Nodes {
		resp.Nodes = append(resp.Nodes, n.Name)
	}
	for _, e := range lastScan.Edges {
		resp.Edges = append(resp.Edges, Edge{From: e.From, To: e.To})
	}

	json.NewEncoder(w).Encode(resp)
}

func withCORS(h http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		log.Printf("CORS_DEBUG: %s %s (Origin: %s)", r.Method, r.URL.Path, r.Header.Get("Origin"))
		origin := r.Header.Get("Origin")
		if origin == "" {
			origin = "*"
		}
		w.Header().Set("Access-Control-Allow-Origin", origin)
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With, Origin, Accept")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS, PUT, DELETE")
		w.Header().Set("Access-Control-Allow-Credentials", "true")

		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		h.ServeHTTP(w, r)
	})
}

func rootHandler(w http.ResponseWriter, r *http.Request) {
	log.Printf("ROOT_HIT: %s from %s", r.URL.Path, r.RemoteAddr)
	w.WriteHeader(http.StatusOK)
	fmt.Fprintf(w, "DevSyncPro Repo Scanner Live - OK")
}

func main() {
	initPubSub()
	initDB()
	mux := http.NewServeMux()
	mux.HandleFunc("/", rootHandler)
	mux.HandleFunc("/scan", scanHandler)
	mux.HandleFunc("/graph", graphHandler)
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"status": "healthy", "service": "repo-scanner", "v": "2.0"})
	})
	mux.HandleFunc("/any", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"debug": "catch-all", "path": r.URL.Path})
	})

	port := os.Getenv("PORT")
	if port == "" {
		port = "10000" // Standard Render Port
	}

	log.Printf("DevSyncPro Repo Scanner running on :%s", port)
	log.Fatal(http.ListenAndServe(":"+port, withCORS(mux)))
}
