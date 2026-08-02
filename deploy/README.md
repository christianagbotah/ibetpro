# iBetPro — VPS Deployment Guide

Deploy to a VPS running **Webuzo** with **Nginx** reverse proxy and **PM2** process manager.

## Architecture

```
Internet → Nginx (443/80) → Next.js Standalone (3000) → SQLite
               ↑ SSL              ↑ PM2 manages
          Let's Encrypt          auto-restart
```

## Quick Start

### 1. First-Time VPS Setup (run as root)

```bash
# SSH into your VPS
ssh root@YOUR_VPS_IP

# Upload and run the setup script
# (or run it directly from the repo)
sudo bash deploy/setup-vps.sh
```

This installs: Node.js 20, PM2, Nginx, Certbot, creates the `ibetpro` user, and configures the firewall.

### 2. Build & Deploy (from your local machine)

```bash
# On your local machine, build the app
npm run build

# Deploy to VPS (replace with your domain)
bash deploy/deploy.sh ibetpro.yourdomain.com
```

### 3. Set Up SSL

```bash
# On the VPS
sudo certbot --nginx -d ibetpro.yourdomain.com -d www.ibetpro.yourdomain.com
```

### 4. Register Telegram Webhook

```bash
# Login as admin, get your session cookie, then:
curl -X POST https://ibetpro.yourdomain.com/api/telegram/setup \
  -H 'Content-Type: application/json' \
  -H 'Cookie: next-auth.session-token=YOUR_SESSION_TOKEN' \
  -d '{"webhookUrl": "https://ibetpro.yourdomain.com"}'
```

### 5. Connect Your Telegram

1. Go to **Settings** → **Telegram Notifications**
2. Click **Connect Telegram**
3. Send `/start` in the bot chat
4. Done — you'll receive AI tip alerts!

---

## Manual Deployment (step-by-step)

If you prefer to do things manually:

### On the VPS

```bash
# 1. Create directories
sudo mkdir -p /home/ibetpro/{app,db,logs}
sudo chown -R ibetpro:ibetpro /home/ibetpro

# 2. Copy files from your local machine
scp -r .next/standalone/ ibetpro@YOUR_VPS:/home/ibetpro/app/.next/standalone/
scp -r .next/static/ ibetpro@YOUR_VPS:/home/ibetpro/app/.next/standalone/.next/static/
scp -r public/ ibetpro@YOUR_VPS:/home/ibetpro/app/.next/standalone/public/
scp -r src/generated/ ibetpro@YOUR_VPS:/home/ibetpro/app/.next/standalone/src/generated/
scp ecosystem.config.js ibetpro@YOUR_VPS:/home/ibetpro/app/
scp .env.production ibetpro@YOUR_VPS:/home/ibetpro/app/.next/standalone/.env
scp db/custom.db ibetpro@YOUR_VPS:/home/ibetpro/db/

# 3. Start with PM2
cd /home/ibetpro/app
pm2 start ecosystem.config.js --env production
pm2 save
```

### Nginx Setup

```bash
# Copy the HTTP config first (before SSL)
sudo cp deploy/nginx/ibetpro-http.conf /etc/nginx/sites-available/ibetpro
# Edit the domain
sudo sed -i 's/yourdomain.com/YOUR_ACTUAL_DOMAIN/g' /etc/nginx/sites-available/ibetpro
sudo ln -s /etc/nginx/sites-available/ibetpro /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

### SSL with Let's Encrypt

```bash
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
# Certbot will automatically update the Nginx config with SSL
```

---

## Updating the App

After making code changes:

```bash
# Build locally, then:
bash deploy/update.sh

# Or on the VPS directly:
cd /home/ibetpro/app
pm2 restart ibetpro
```

---

## Useful Commands

```bash
# PM2
pm2 status                    # Check process status
pm2 logs ibetpro              # View logs
pm2 logs ibetpro --lines 100  # Last 100 lines
pm2 restart ibetpro           # Restart app
pm2 stop ibetpro              # Stop app
pm2 monit                     # Live resource monitor
pm2 describe ibetpro          # Detailed process info

# Nginx
sudo nginx -t                 # Test config
sudo systemctl reload nginx   # Reload config
sudo systemctl restart nginx  # Full restart
sudo tail -f /var/log/nginx/ibetpro_access.log  # Access log
sudo tail -f /var/log/nginx/ibetpro_error.log    # Error log

# Systemd (alternative to PM2)
sudo systemctl start ibetpro
sudo systemctl stop ibetpro
sudo systemctl restart ibetpro
sudo systemctl status ibetpro
sudo journalctl -u ibetpro -f  # Follow logs

# Certbot
sudo certbot renew            # Renew certificates
sudo certbot certificates     # List certificates
```

---

## File Structure on VPS

```
/home/ibetpro/
├── app/
│   ├── .next/
│   │   └── standalone/     # Production server
│   │       ├── server.js   # Entry point
│   │       ├── .next/      # Static + rendered
│   │       ├── public/     # Static assets
│   │       ├── src/generated/  # Prisma client
│   │       └── .env        # Production env vars
│   ├── prisma/
│   │   └── schema.prisma
│   └── ecosystem.config.js
├── db/
│   └── custom.db           # SQLite database
└── logs/
    ├── out.log
    └── error.log
```

---

## Troubleshooting

### App won't start
```bash
pm2 logs ibetpro --err --lines 50
# Common issues:
# - DATABASE_URL path wrong (must be absolute)
# - NEXTAUTH_SECRET not set
# - Port 3000 already in use
```

### 502 Bad Gateway
```bash
# Check if the app is running
pm2 status
# Check if Nginx can reach the app
curl http://localhost:3000
# Check Nginx error log
sudo tail -50 /var/log/nginx/ibetpro_error.log
```

### Telegram webhook not working
```bash
# Check webhook info
curl https://yourdomain.com/api/telegram/webhook
# Should return bot username and webhook URL
# If webhook URL is empty, register it again
```

### Database issues
```bash
# Check database file
ls -la /home/ibetpro/db/custom.db
# Check permissions
sudo chown ibetpro:ibetpro /home/ibetpro/db/custom.db
```

---

## Security Checklist

- [ ] Change `NEXTAUTH_SECRET` to a random 64-char string
- [ ] Set `NEXTAUTH_URL` to your actual domain
- [ ] Enable UFW firewall (SSH + HTTP/HTTPS only)
- [ ] Set up SSL with Let's Encrypt
- [ ] Disable root SSH login
- [ ] Use SSH keys instead of passwords
- [ ] Run the app as `ibetpro` user (not root)
- [ ] Keep system updated: `apt-get update && apt-get upgrade`
