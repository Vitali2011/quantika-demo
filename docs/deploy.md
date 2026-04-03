# Deploy Guide — Quantika Demo

## Server Requirements
- Node.js v22+
- PM2 (`npm install -g pm2`)
- Caddy (already running on this server)
- DNS: `demo.quantika.org` A record → VPS IP `185.249.225.169`

## Initial Deploy

### 1. Clone/copy project
```bash
cp -r /root/.openclaw/workspace-dev-coach/projects/quantika-demo /root/quantika-demo
cd /root/quantika-demo
```

### 2. Install dependencies
```bash
npm install --include=dev
```

### 3. Configure environment
```bash
cp .env.local.example .env.local
# Edit .env.local — add GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
nano .env.local
```

### 4. Build
```bash
npm run build
```

### 5. Start with PM2
```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup  # follow the output instructions
```

### 6. Add Caddy site block
```bash
# Append to /etc/caddy/Caddyfile:
cat ops/Caddyfile.demo.quantika.org >> /etc/caddy/Caddyfile
caddy reload --config /etc/caddy/Caddyfile
```

### 7. Verify
```bash
curl -I https://demo.quantika.org
# Should return 200 OK
```

## Updates / Redeployment
```bash
cd /root/quantika-demo
git pull  # or copy new files
npm install --include=dev
npm run build
pm2 restart quantika-demo
```

## Monitoring
```bash
pm2 status
pm2 logs quantika-demo
pm2 monit
```

## Troubleshooting
- **Port 3000 already in use**: `ss -tlnp | grep 3000` — kill the process
- **Caddy not reloading**: `systemctl status caddy` — check logs
- **Build fails**: check Node.js version, `node --version` should be v22+
- **OAuth redirect mismatch**: verify redirect URI in Google Cloud Console matches `https://demo.quantika.org/api/auth/google`
