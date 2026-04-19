# Staging Deploy Guide — Quantika Demo

## Server Requirements
- Node.js v22+
- PM2 (`npm install -g pm2`)
- Caddy (already running on this server)
- DNS: `staging.quantika.org` A record → VPS IP `185.249.225.169`

## Initial Deploy

### 1. Clone repository
```bash
git clone https://github.com/Vitali2011/quantika-demo.git /root/quantika-demo-staging
cd /root/quantika-demo-staging
```

### 2. Install dependencies
```bash
npm install --include=dev
```

### 3. Configure environment
```bash
cp .env.staging.example .env.local
# Edit .env.local — add GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and other required vars
nano .env.local
```

> **Note:** Staging uses its own `.env.local` fully isolated from production.
> Never copy or share env files between staging and production.

### 4. Build
```bash
npm run build
```

### 5. Start with PM2
```bash
pm2 start ecosystem.config.js --only quantika-demo-staging
pm2 save
pm2 startup  # follow the output instructions
```

### 6. Add Caddy site block
```bash
# Append staging vhost to /etc/caddy/Caddyfile:
cat deploy/Caddyfile.staging >> /etc/caddy/Caddyfile
caddy reload --config /etc/caddy/Caddyfile
```

### 7. Verify
```bash
curl -I https://staging.quantika.org
# Should return 200 OK
```

## Updates / Redeployment
```bash
cd /root/quantika-demo-staging
git pull
npm install --include=dev
npm run build
pm2 restart quantika-demo-staging
```

## Monitoring
```bash
pm2 status
pm2 logs quantika-demo-staging
pm2 monit
```

## Differences from Production

| | Production | Staging |
|---|---|---|
| **Directory** | `/root/quantika-demo` | `/root/quantika-demo-staging` |
| **PM2 app name** | `quantika-demo` | `quantika-demo-staging` |
| **Port** | `3000` | `3001` |
| **NODE_ENV** | `production` | `staging` |
| **Domain** | `demo.quantika.org` | `staging.quantika.org` |
| **Caddy config** | `ops/Caddyfile.demo.quantika.org` | `deploy/Caddyfile.staging` |
| **Env template** | `.env.local.example` | `.env.staging.example` |

Staging is fully isolated from production: separate directory, separate PM2 process,
separate port, separate env vars, and separate Caddy vhost.

## Troubleshooting
- **Port 3001 already in use**: `ss -tlnp | grep 3001` — kill the process, then `pm2 start ecosystem.config.js --only quantika-demo-staging`
- **Caddy not reloading**: `systemctl status caddy` — check logs; verify `deploy/Caddyfile.staging` syntax with `caddy validate --config /etc/caddy/Caddyfile`
- **Build fails**: check Node.js version, `node --version` should be v22+
- **Staging hitting prod data**: verify `.env.local` uses staging-specific secrets and DB path — never share env vars between environments
- **PM2 shows wrong NODE_ENV**: confirm `ecosystem.config.js` contains `quantika-demo-staging` app with `env_staging: { NODE_ENV: "staging", PORT: 3001 }`
