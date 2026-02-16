#!/bin/sh

# Auto-detect service type based on RENDER_SERVICE_NAME or SERVICE_TYPE env var
SERVICE_NAME_LOWER=$(echo "$RENDER_SERVICE_NAME" | tr '[:upper:]' '[:lower:]')

echo "LAUNCHER: Detected RENDER_SERVICE_NAME=$RENDER_SERVICE_NAME"

if echo "$SERVICE_NAME_LOWER" | grep -q "orchestrator"; then
    echo "LAUNCHER: Starting Orchestrator..."
    exec ./orchestrator
elif echo "$SERVICE_NAME_LOWER" | grep -q "analyzer"; then
    echo "LAUNCHER: Starting AI Analyzer (Warning: Expecting Python)..."
    # Note: If this is the Go Dockerfile, it won't have the Python analyzer
    exec ./scanner
elif echo "$SERVICE_NAME_LOWER" | grep -q "relay"; then
    echo "LAUNCHER: Starting Relay (Warning: Expecting Node)..."
    exec ./scanner
else
    echo "LAUNCHER: Defaulting to Scanner..."
    exec ./scanner
fi
