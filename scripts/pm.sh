#!/bin/bash
# Simple process manager that restarts the Next.js dev server
# when it crashes

PORT=3000
MAX_RETRIES=100
RETRY_COUNT=0

echo "[pm] Starting Next.js dev server on port $PORT"

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    echo "[pm] Attempt $((RETRY_COUNT+1))/$MAX_RETRIES"
    
    cd /home/z/my-project
    npx next dev --turbopack -p $PORT
    EXIT_CODE=$?
    
    echo "[pm] Server exited with code $EXIT_CODE"
    
    if [ $EXIT_CODE -eq 0 ]; then
        echo "[pm] Clean exit, stopping"
        break
    fi
    
    RETRY_COUNT=$((RETRY_COUNT+1))
    echo "[pm] Restarting in 3 seconds..."
    sleep 3
done

echo "[pm] Process manager stopped"
