package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/anuragjambhulkar/devsyncpro-backend/backend/pkg/middleware"
)

// Contract represents an API documentation contract
type Contract struct {
	ID          string    `json:"id"`
	ServiceName string    `json:"service_name"`
	Version     string    `json:"version"`
	Content     string    `json:"content"` // Open/Swagger Spec or Markdown
	CreatedAt   time.Time `json:"created_at"`
}

var contracts = []Contract{}

func healthHandler(w http.ResponseWriter, r *http.Request) {
	fmt.Fprintln(w, "Contract Service is Healthy")
}

func contractsHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	if r.Method == "GET" {
		json.NewEncoder(w).Encode(contracts)
	} else if r.Method == "POST" {
		var c Contract
		if err := json.NewDecoder(r.Body).Decode(&c); err != nil {
			http.Error(w, err.Error(), 400)
			return
		}
		c.CreatedAt = time.Now()
		c.ID = fmt.Sprintf("con-%d", time.Now().Unix())
		contracts = append(contracts, c)
		json.NewEncoder(w).Encode(c)
	}
}

func syncHandler(w http.ResponseWriter, r *http.Request) {
	// Stub for Sync Engine
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"status":  "synced",
		"message": "Contracts synchronized with repository",
	})
}

func subscribeHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	// Stub for Stripe Checkout Session Creation
	// In production, use stripe-go library here
	json.NewEncoder(w).Encode(map[string]string{
		"checkout_url": "https://checkout.stripe.com/pay/cs_test_mock_session_id",
		"message":      "Redirect user to checkout_url to collect payment",
	})
}

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8084"
	}

	http.HandleFunc("/health", healthHandler)
	http.HandleFunc("/contracts", middleware.AuthMiddleware(contractsHandler))
	http.HandleFunc("/sync", middleware.AuthMiddleware(syncHandler))
	http.HandleFunc("/subscribe", middleware.AuthMiddleware(subscribeHandler))

	log.Printf("Contract Service listening on port %s", port)
	log.Fatal(http.ListenAndServe(":"+port, nil))
}
