#!/usr/bin/env node
// Persistent Next.js server with auto-restart
// Restarts the server when it crashes, with a 1-second delay between restarts

const { spawn } = require('child_process');
const path = require('path');

const MAX_RESTARTS = 1000;
let restartCount = 0;

function startServer() {
  restartCount++;
  const ts = new Date().toISOString();
  console.log(`[watchdog] Starting Next.js server (attempt ${restartCount}/${MAX_RESTARTS}) at ${ts}`);
  
  const child = spawn('node', [
    '--max-old-space-size=128',
    path.join(__dirname, '..', '.next', 'standalone', 'server.js')
  ], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, PORT: '3000', NODE_ENV: 'production' },
    stdio: ['pipe', 'pipe', 'pipe']
  });

  child.stdout.on('data', (data) => {
    const line = data.toString().trim();
    if (line) console.log(`[server] ${line}`);
  });

  child.stderr.on('data', (data) => {
    const line = data.toString().trim();
    if (line) console.error(`[server] ${line}`);
  });

  child.on('exit', (code, signal) => {
    const ts = new Date().toISOString();
    console.log(`[watchdog] Server exited: code=${code} signal=${signal} at ${ts}`);
    if (restartCount < MAX_RESTARTS) {
      console.log(`[watchdog] Restarting in 1s...`);
      setTimeout(startServer, 1000);
    } else {
      console.log(`[watchdog] Max restarts reached, stopping`);
      process.exit(1);
    }
  });

  child.on('error', (err) => {
    console.error(`[watchdog] Server error:`, err);
  });

  return child;
}

// Handle signals
process.on('SIGTERM', () => {
  console.log('[watchdog] SIGTERM received, shutting down');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('[watchdog] SIGINT received, shutting down');
  process.exit(0);
});

// Start the server
startServer();

// Keep the parent process alive
setInterval(() => {
  const mem = process.memoryUsage();
  console.log(`[watchdog] Heartbeat: rss=${Math.round(mem.rss/1024/1024)}MB at ${new Date().toISOString()}`);
}, 30000);
