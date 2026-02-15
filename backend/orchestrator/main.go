package main

import (
	"bytes"
	"context"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"sync"
	"time"

	"cloud.google.com/go/bigquery"
	"cloud.google.com/go/pubsub"
)

var (
	pubsubClient *pubsub.Client
	bqClient     *bigquery.Client
	topicID      = os.Getenv("PUBSUB_TOPIC_OPERATIONS")
	datasetID    = os.Getenv("BQ_DATASET")
	tableID      = os.Getenv("BQ_TABLE_METRICS")
)

func initGCP() {
	projectID := os.Getenv("GOOGLE_CLOUD_PROJECT")
	if projectID == "" {
		log.Println("GOOGLE_CLOUD_PROJECT not set, skipping GCP init")
		return
	}
	ctx := context.Background()

	// Init Pub/Sub
	if topicID != "" {
		ps, err := pubsub.NewClient(ctx, projectID)
		if err == nil {
			pubsubClient = ps
			log.Printf("Pub/Sub initialized for topic %s", topicID)
		}
	}

	// Init BigQuery
	if datasetID != "" {
		bq, err := bigquery.NewClient(ctx, projectID)
		if err == nil {
			bqClient = bq
			log.Printf("BigQuery initialized for dataset %s", datasetID)
		}
	}
}

func publishOpEvent(eventType string, data interface{}) {
	if pubsubClient == nil {
		return
	}
	ctx := context.Background()
	topic := pubsubClient.Topic(topicID)
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
	if err := inserter.Put(ctx, row); err != nil {
		log.Printf("Failed to log to BigQuery: %v", err)
	}
}

// --- Incident Types ---
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

var relayURL = os.Getenv("RELAY_URL")

func broadcastToRelay(payload interface{}) {
	if relayURL == "" {
		relayURL = "http://localhost:9000/relay"
	}

	data, _ := json.Marshal(payload)
	resp, err := http.Post(relayURL, "application/json", bytes.NewBuffer(data))
	if err != nil {
		log.Printf("Failed to relay event: %v", err)
		return
	}
	resp.Body.Close()
}

// --- Deployment Types ---
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

	// Relay via central WS server
	go broadcastToRelay(inc)
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

	paymentLock.Lock()
	var totalRevenue float64
	for _, p := range paymentStore {
		if p.Status == "paid" {
			totalRevenue += p.Amount
		}
	}
	paymentLock.Unlock()

	metrics := map[string]interface{}{
		"deploy_success_rate": func() float64 {
			if total == 0 {
				return 1.0
			}
			return float64(success) / float64(total)
		}(),
		"incident_detection_time_s": 20,
		"api_latency_ms":            180,
		"max_blast_radius":          7,
		"daily_recurring_revenue":   totalRevenue,
		"payment_count":             len(paymentStore),
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(metrics)
}

// --- Payment & Monetization ---
type Payment struct {
	ID        string    `json:"id"`
	Amount    float64   `json:"amount"`
	Currency  string    `json:"currency"`
	Status    string    `json:"status"`
	Service   string    `json:"service"`
	CreatedAt time.Time `json:"created_at"`
}

var (
	paymentStore []Payment
	paymentLock  sync.Mutex
)

func handleCreateCheckoutSession(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Service string  `json:"service"`
		Amount  float64 `json:"amount"`
	}
	json.NewDecoder(r.Body).Decode(&req)

	paymentLock.Lock()
	p := Payment{
		ID:        "pay_" + time.Now().Format("20060102150405"),
		Amount:    req.Amount,
		Currency:  "INR",
		Status:    "paid", // Mock immediate success
		Service:   req.Service,
		CreatedAt: time.Now(),
	}
	paymentStore = append(paymentStore, p)
	paymentLock.Unlock()

	// In real life, return Stripe Checkout URL. Here, return success.
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"session_id":   p.ID,
		"checkout_url": "https://stripe.com/mock_checkout/" + p.ID,
	})
}

func withCORS(h http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		log.Printf("Incoming %s request to %s from %s", r.Method, r.URL.Path, r.Header.Get("Origin"))
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
		h(w, r)
	}
}
 Broadway 
func rootHandler(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(http.StatusOK)
	fmt.Fprintf(w, "DevSyncPro Orchestrator Live")
}

func main() {
	initGCP()
	http.HandleFunc("/", withCORS(rootHandler))
	http.HandleFunc("/incidents", withCORS(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == "POST" {
			handlePostIncident(w, r)
		} else {
			handleGetIncidents(w, r)
		}
	}))
	http.HandleFunc("/resolve", withCORS(handleResolveIncident))
	http.HandleFunc("/deployments", withCORS(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == "POST" {
			handlePostDeployment(w, r)
		} else {
			handleGetDeployments(w, r)
		}
	}))
	http.HandleFunc("/metrics", withCORS(handleMetrics))
	http.HandleFunc("/payments/checkout", withCORS(handleCreateCheckoutSession))
	http.HandleFunc("/health", withCORS(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"status": "healthy", "service": "orchestrator"})
	}))

	port := os.Getenv("PORT")
	if port == "" {
		port = "8082" // Different port for Orchestrator
	}

	log.Printf("DevSyncPro Orchestrator running on :%s", port)
	log.Fatal(http.ListenAndServe(":"+port, nil))
}
