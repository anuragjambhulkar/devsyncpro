package main

import (
	"fmt"
	"log"
	"net/http"
	"os"
)

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "10000"
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		log.Printf("DEBUG_ROOT_HIT: %s", r.URL.Path)
		fmt.Fprintf(w, "DEBUG: DevSyncPro Orchestrator is ACTIVE on Port %s", port)
	})
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprintf(w, `{"status":"up"}`)
	})
	mux.HandleFunc("/incidents", func(w http.ResponseWriter, r *http.Request) {
		log.Printf("DEBUG_INCIDENTS_HIT: %s", r.Method)
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Access-Control-Allow-Origin", "*")
		fmt.Fprintf(w, `[]`)
	})

	log.Printf("DEBUG: Server starting on :%s", port)
	if err := http.ListenAndServe(":"+port, mux); err != nil {
		log.Fatalf("DEBUG: ListenAndServe failed: %v", err)
	}
}
