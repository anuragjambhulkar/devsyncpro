#!/bin/bash
# DevSyncPro Cloud Deployment Script
# Usage: ./deploy_gcp.sh [PROJECT_ID]

PROJECT_ID=$1

if [ -z "$PROJECT_ID" ]; then
    echo "Usage: ./deploy_gcp.sh [PROJECT_ID]"
    exit 1
fi

echo "🚀 Deploying DevSyncPro to Google Cloud (Project: $PROJECT_ID)..."

# 1. Enable Services
gcloud services enable run.googleapis.com \
    artifactregistry.googleapis.com \
    cloudbuild.googleapis.com \
    --project $PROJECT_ID

# 2. Build & Push Images
echo "📦 Building Docker Images..."
gcloud builds submit --tag gcr.io/$PROJECT_ID/repo-scanner backend/repo-scanner
gcloud builds submit --tag gcr.io/$PROJECT_ID/contract-service backend/contract-service
gcloud builds submit --tag gcr.io/$PROJECT_ID/orchestrator backend/orchestrator
gcloud builds submit --tag gcr.io/$PROJECT_ID/frontend frontend/devsyncpro-ui

# 3. Deploy Cloud Run Services
echo "☁️ Deploying Services..."

# Database (Using Cloud SQL is recommended, but for MVP using a container with volume)
# Note: For strict production, use gcloud sql instances create
gcloud run deploy postgres \
    --image postgres:15-alpine \
    --set-env-vars POSTGRES_PASSWORD=devsync_secret \
    --port 5432 \
    --region us-central1 \
    --platform managed \
    --allow-unauthenticated

# Contract Service
gcloud run deploy contract-service \
    --image gcr.io/$PROJECT_ID/contract-service \
    --set-env-vars PROJECT_ID=$PROJECT_ID,DB_HOST=postgres \
    --region us-central1 \
    --platform managed \
    --allow-unauthenticated

# Repo Scanner
gcloud run deploy repo-scanner \
    --image gcr.io/$PROJECT_ID/repo-scanner \
    --set-env-vars PROJECT_ID=$PROJECT_ID,DB_HOST=postgres \
    --region us-central1 \
    --platform managed \
    --allow-unauthenticated

echo "✅ Deployment Complete! Your API Marketplace is LIVE."
