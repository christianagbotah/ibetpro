// ============================================================================
// PM2 Ecosystem Config for iBetPro
// Usage: pm2 start ecosystem.config.js --env production
// ============================================================================

module.exports = {
  apps: [
    {
      name: "ibetpro",
      script: "./.next/standalone/server.js",
      cwd: "/home/ibetpro/app",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
        HOSTNAME: "0.0.0.0",
      },
      // Production environment overrides
      env_production: {
        NODE_ENV: "production",
        PORT: 3000,
        HOSTNAME: "0.0.0.0",
      },
      // Process management
      instances: 1,               // Single instance for SQLite (not cluster-safe)
      exec_mode: "fork",          // Fork mode (not cluster) for SQLite compatibility
      max_memory_restart: "512M",  // Auto-restart if memory exceeds 512MB
      autorestart: true,           // Auto-restart on crash
      max_restarts: 10,           // Max restarts within min_uptime
      min_uptime: "10s",          // App must stay up 10s to be considered "started"
      restart_delay: 4000,        // Wait 4s between restarts
      watch: false,               // Don't watch files in production
      // Logging
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      error_file: "/home/ibetpro/logs/error.log",
      out_file: "/home/ibetpro/logs/out.log",
      merge_logs: true,
      // Graceful shutdown
      kill_timeout: 5000,
      listen_timeout: 10000,
      // Cron-like restart (optional, helps prevent memory leaks)
      cron_restart: "0 4 * * *",  // Restart daily at 4 AM
    },
  ],
};
