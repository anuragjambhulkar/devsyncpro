package main

import (
    "encoding/json"
    "log"
    "net/http"
)

type Repo struct {
    Name          string   `json:"name"`
    Dependencies  []string `json:"dependencies"`
    LastCommit    string   `json:"last_commit"`
    BlastRadius   int      `json:"blast_radius"`
}

func reposHandler(w http.ResponseWriter, r *http.Request) {
    data := []Repo{
        {"auth-service", []string{"db-lib"}, "a1b2c3", 6},
        {"user-service", []string{"auth-service"}, "d4e5f6", 3},
        {"web-app", []string{"user-service", "auth-service"}, "g7h8i9", 8},
    }
    json.NewEncoder(w).Encode(data)
}

func dependenciesHandler(w http.ResponseWriter, r *http.Request) {
    depGraph := map[string][]string{
        "web-app":     {"user-service", "auth-service"},
        "user-service": {"auth-service"},
        "auth-service": {"db-lib"},
        "db-lib":      {},
    }
    json.NewEncoder(w).Encode(depGraph)
}

func main() {
    http.HandleFunc("/repos", reposHandler)
    http.HandleFunc("/dependencies", dependenciesHandler)
    log.Println("Backend running on :8080")
    log.Fatal(http.ListenAndServe(":8080", nil))
}
