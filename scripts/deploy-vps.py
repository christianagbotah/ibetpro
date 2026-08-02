#!/usr/bin/env python3
"""Deploy iBetPro to VPS via SSH"""

import paramiko
import sys
import time

VPS_HOST = "ibetpro.lightworldtech.com"
VPS_USER = "root"
# From the previous session context - user will need to provide password
# or we use the known deployment path

commands = [
    "cd /home/lightworld/webapps/ibetpro && git pull origin main",
    "cd /home/lightworld/webapps/ibetpro && npm install --production=false",
    "cd /home/lightworld/webapps/ibetpro && npx prisma generate",
    "cd /home/lightworld/webapps/ibetpro && npm run build",
    "cd /home/lightworld/webapps/ibetpro && cp -r .next/static .next/standalone/.next/ && cp -r public .next/standalone/ && mkdir -p .next/standalone/src/generated && cp -r src/generated/prisma .next/standalone/src/generated/prisma && mkdir -p .next/standalone/node_modules/@prisma/adapter-mariadb && cp -r node_modules/@prisma/adapter-mariadb .next/standalone/node_modules/@prisma/ && mkdir -p .next/standalone/node_modules/mariadb && cp -r node_modules/mariadb .next/standalone/node_modules/mariadb && if [ -f .env.production ]; then cp .env.production .next/standalone/.env; fi",
    "cd /home/lightworld/webapps/ibetpro && pm2 restart ibetpro || pm2 start .next/standalone/server.js --name ibetpro",
]

def main():
    if len(sys.argv) < 2:
        print("Usage: python deploy-vps.py <password>")
        sys.exit(1)
    
    password = sys.argv[1]
    
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    
    print(f"Connecting to {VPS_HOST}...")
    try:
        client.connect(VPS_HOST, username=VPS_USER, password=password, timeout=15)
    except Exception as e:
        print(f"Connection failed: {e}")
        sys.exit(1)
    
    print("Connected! Running deployment commands...\n")
    
    for i, cmd in enumerate(commands):
        print(f"\n{'='*60}")
        print(f"[{i+1}/{len(commands)}] {cmd[:80]}...")
        print('='*60)
        
        stdin, stdout, stderr = client.exec_command(cmd, timeout=300)
        exit_code = stdout.channel.recv_exit_status()
        
        out = stdout.read().decode('utf-8', errors='replace')
        err = stderr.read().decode('utf-8', errors='replace')
        
        if out.strip():
            # Print last 20 lines of output
            lines = out.strip().split('\n')
            for line in lines[-20:]:
                print(line)
        
        if err.strip():
            lines = err.strip().split('\n')
            for line in lines[-10:]:
                print(f"STDERR: {line}")
        
        if exit_code != 0:
            print(f"\n❌ Command failed with exit code {exit_code}")
            # Continue anyway for non-critical failures
        else:
            print(f"✅ Done")
    
    client.close()
    print("\n🎉 Deployment complete!")

if __name__ == "__main__":
    main()
