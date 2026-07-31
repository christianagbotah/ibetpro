#!/bin/bash
# Start the Next.js production server with auto-restart
# Uses double-fork to detach from the shell

cd /home/z/my-project

# Kill any existing server
pkill -f "standalone/server.js" 2>/dev/null
sleep 2

# Start the server with double-fork
(node --max-old-space-size=128 .next/standalone/server.js > /tmp/next-server.log 2>&1 &)&

echo "Next.js server started on port 3000"
echo "Access via Caddy: http://localhost:81/"
echo "Direct access: http://localhost:3000/"
