#!/bin/sh

# Auto-detect service type based on RENDER_SERVICE_NAME or SERVICE_TYPE env var
SERVICE_NAME_LOWER=$(echo "$RENDER_SERVICE_NAME" | tr '[:upper:]' '[:lower:]')

echo "LAUNCHER: Detected RENDER_SERVICE_NAME=$RENDER_SERVICE_NAME"

# Priority 1: Manual override via SERVICE_TYPE env var
if [ -n "$SERVICE_TYPE" ]; then
    SERVICE_TYPE_LOWER=$(echo "$SERVICE_TYPE" | tr '[:upper:]' '[:lower:]')
    echo "LAUNCHER: Using manual override SERVICE_TYPE=$SERVICE_TYPE_LOWER"
    if [ "$SERVICE_TYPE_LOWER" = "orchestrator" ]; then
        exec ./orchestrator
    else
        exec ./scanner
    fi
fi

# Priority 2: Auto-detect based on Render name
if echo "$SERVICE_NAME_LOWER" | grep -q "orchestrator" || echo "$SERVICE_NAME_LOWER" | grep -q "devsyncpro-1"; then
    echo "LAUNCHER: Detected orchestrator/1 from name. Starting Orchestrator..."
    exec ./orchestrator
elif echo "$SERVICE_NAME_LOWER" | grep -q "scanner" || echo "$SERVICE_NAME_LOWER" | grep -q "devsyncpro-3"; then
    echo "LAUNCHER: Detected scanner/3 from name. Starting Scanner..."
    exec ./scanner
else
    echo "LAUNCHER: No specific role detected for name [$SERVICE_NAME_LOWER]. Defaulting to Scanner..."
    exec ./scanner
fi
