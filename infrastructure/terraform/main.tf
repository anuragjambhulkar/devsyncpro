provider "google" {
  project = "your-gcp-project-id"
  region  = "us-central1"
}

# --- Cloud Run Services ---

resource "google_cloud_run_service" "repo_scanner" {
  name     = "repo-scanner"
  location = "us-central1"
  template {
    spec {
      containers {
        image = "gcr.io/your-project/repo-scanner:latest"
        ports {
          container_port = 8081
        }
      }
    }
  }
}

resource "google_cloud_run_service" "orchestrator" {
  name     = "orchestrator"
  location = "us-central1"
  template {
    spec {
      containers {
        image = "gcr.io/your-project/orchestrator:latest"
        ports {
          container_port = 8082
        }
      }
    }
  }
}

resource "google_cloud_run_service" "ai_analyzer" {
  name     = "ai-analyzer"
  location = "us-central1"
  template {
    spec {
      containers {
        image = "gcr.io/your-project/ai-analyzer:latest"
        ports {
          container_port = 8083
        }
      }
    }
  }
}

# --- Pub/Sub Topics ---

resource "google_pubsub_topic" "scan_events" {
  name = "scan-events"
}

resource "google_pubsub_topic" "deployment_events" {
  name = "deployment-events"
}

resource "google_pubsub_topic" "incident_events" {
  name = "incident-events"
}

# --- BigQuery for Analytics ---

resource "google_bigquery_dataset" "analytics" {
  dataset_id = "devsyncpro_analytics"
  location   = "US"
}

resource "google_bigquery_table" "metrics" {
  dataset_id = google_bigquery_dataset.analytics.dataset_id
  table_id   = "system_metrics"
  schema = <<EOF
[
  {"name": "timestamp", "type": "TIMESTAMP", "mode": "REQUIRED"},
  {"name": "service", "type": "STRING", "mode": "REQUIRED"},
  {"name": "metric_name", "type": "STRING", "mode": "REQUIRED"},
  {"name": "metric_value", "type": "FLOAT", "mode": "REQUIRED"}
]
EOF
}

# --- IAM Roles (Example) ---

resource "google_project_iam_member" "run_invoker" {
  project = "your-gcp-project-id"
  role    = "roles/run.invoker"
  member  = "allUsers" # For demo purposes; use restricted identities in production
}
