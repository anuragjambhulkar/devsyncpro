#!/bin/bash

# DevSyncPro One-Click Deployment Script
# Targets: Google Cloud Run

set -e

PROJECT_ID=$(gcloud config get-value project)
REGION="us-central1"

echo "🚀 Starting DevSyncPro Production Deployment for project: $PROJECT_ID"

# 1. Enable APIs
echo "📡 Enabling Google Cloud APIs..."
gcloud services enable run.googleapis.com pubsub.googleapis.com bigquery.googleapis.com artifactregistry.googleapis.com

# 2. Build and Push Repo Scanner
echo "📦 Deploying Repo Scanner..."
gcloud builds submit --tag gcr.io/$PROJECT_ID/repo-scanner ./backend/repo-scanner
gcloud run deploy repo-scanner \
  --image gcr.io/$PROJECT_ID/repo-scanner \
  --platform managed \
  --region $REGION \
  --allow-unauthenticated \
  --port 8081

# 3. Build and Push Orchestrator
echo "📦 Deploying Orchestrator..."
gcloud builds submit --tag gcr.io/$PROJECT_ID/orchestrator ./backend/orchestrator
gcloud run deploy orchestrator \
  --image gcr.io/$PROJECT_ID/orchestrator \
  --platform managed \
  --region $REGION \
  --allow-unauthenticated \
  --port 8082

# 4. Build and Push AI Analyzer
echo "📦 Deploying AI Analyzer..."
gcloud builds submit --tag gcr.io/$PROJECT_ID/ai-analyzer ./backend/ai-analyzer
gcloud run deploy ai-analyzer \
  --image gcr.io/$PROJECT_ID/ai-analyzer \
  --platform managed \
  --region $REGION \
  --allow-unauthenticated \
  --port 8083

# 5. Build and Push Event Relay
echo "📦 Deploying Event Relay..."
gcloud builds submit --tag gcr.io/$PROJECT_ID/event-relay ./websocket-server
gcloud run deploy event-relay \
  --image gcr.io/$PROJECT_ID/event-relay \
  --platform managed \
  --region $REGION \
  --allow-unauthenticated \
  --port 9000

echo "✅ All services deployed successfully!"
echo "📍 Dashboard: http://localhost:3000 (Update your config.ts with the new service URLs above)"
