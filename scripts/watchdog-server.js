#!/usr/bin/env node
// Persistent Next.js dev server with auto-restart
const { spawn } = require('child_process');
const path = require('path');

const MAX_RESTARTS = 50;
let restartCount = 0;
let child = null;

function startServer() {
  console.log(`[watchdog] Starting Next.js dev server (attempt ${restartCount + 1}/${MAX_RESTARTS})`);
  
  child = spawn('node', [
    '--max-old-space-size=256',
    path.join(__dirname, '..', '.next', 'standalone', 'server.js')
  ], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, PORT: '3000', NODE_ENV: 'production' },
    stdio: 'inherit'
  });

  child.on('exit', (code, signal) => {
    console.log(`[watchdog] Server exited: code=${code} signal=${signal}`);
    if (restartCount < MAX_RESTARTS) {
      restartCount++;
      console.log(`[watchdog] Restarting in 2s...`);
      setTimeout(startServer, 2000);
    } else {
      console.log(`[watchdog] Max restarts reached, stopping`);
      process.exit(1);
    }
  });

  child.on('error', (err) => {
    console.error(`[watchdog] Server error:`, err);
  });
}

// Handle signals
process.on('SIGTERM', () => {
  console.log('[watchdog] SIGTERM received, shutting down');
  if (child) child.kill('SIGTERM');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('[watchdog] SIGINT received, shutting down');
  if (child) child.kill('SIGINT');
  process.exit(0);
});

startServer();

// Keep alive
setInterval(() => {}, 60000);
