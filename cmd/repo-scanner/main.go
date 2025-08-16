package main

import (
	"encoding/json"
	"log"
	"net/http"
	"time"
)

type Repo struct {
	Name         string   `json:"name"`
	Dependencies []string `json:"dependencies"`
	LastCommit   string   `json:"last_commit"`
	BlastRadius  int      `json:"blast_radius"`
}

// CORS headers for every response
func setCorsHeaders(w http.ResponseWriter) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
}

func reposHandler(w http.ResponseWriter, r *http.Request) {
	setCorsHeaders(w)
	if r.Method == "OPTIONS" {
		return
	}

	data := []Repo{
		{"auth-service", []string{"db-lib"}, "a1b2c3", 6},
		{"user-service", []string{"auth-service"}, "d4e5f6", 3},
		{"web-app", []string{"user-service", "auth-service"}, "g7h8i9", 8},
	}
	json.NewEncoder(w).Encode(data)
}

func dependenciesHandler(w http.ResponseWriter, r *http.Request) {
	setCorsHeaders(w)
	if r.Method == "OPTIONS" {
		return
	}

	depGraph := map[string][]string{
		"web-app":      {"user-service", "auth-service"},
		"user-service": {"auth-service"},
		"auth-service": {"db-lib"},
		"db-lib":       {},
	}
	json.NewEncoder(w).Encode(depGraph)
}

func deployHandler(w http.ResponseWriter, r *http.Request) {
	setCorsHeaders(w)
	if r.Method == "OPTIONS" {
		return
	}
	if r.Method != "POST" {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		Repo string `json:"repo"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		return
	}

	// Normally you'd do a real deploy—here just log and reply!
	log.Printf("Triggered deploy for: %s\n", req.Repo)
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{
		"status":    "deploy started",
		"repo":      req.Repo,
		"timestamp": time.Now().Format(time.RFC3339),
	})
}

func main() {
	http.HandleFunc("/repos", reposHandler)
	http.HandleFunc("/dependencies", dependenciesHandler)
	http.HandleFunc("/deploy", deployHandler)
	log.Println("Backend running on :8080")
	log.Fatal(http.ListenAndServe(":8080", nil))
}
