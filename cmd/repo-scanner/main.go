package main

import (
	"encoding/json"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"

	"golang.org/x/mod/modfile"
)

type Edge struct {
	From string `json:"from"`
	To   string `json:"to"`
}

type DepGraph struct {
	Nodes []string `json:"nodes"`
	Edges []Edge   `json:"edges"`
}

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

var lastGraph DepGraph

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

func main() {
	http.HandleFunc("/scan", withCORS(scanHandler))
	http.HandleFunc("/graph", withCORS(graphHandler))
	log.Println("Repo Scanner API running on :8081")
	http.ListenAndServe(":8081", nil)
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
