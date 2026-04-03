#!/bin/bash
set -e

echo "=== Quantika Demo — Server Setup ==="

# Check Node.js
NODE_VERSION=$(node --version 2>/dev/null || echo "not installed")
echo "Node.js: $NODE_VERSION"

# Install PM2 if not present
if ! command -v pm2 &> /dev/null; then
  echo "Installing PM2..."
  npm install -g pm2
  echo "PM2 installed: $(pm2 --version)"
else
  echo "PM2 already installed: $(pm2 --version)"
fi

# Check Caddy
if command -v caddy &> /dev/null; then
  echo "Caddy: $(caddy version)"
else
  echo "WARNING: Caddy not found"
fi

# Check ports
echo "Port 3000: $(ss -tlnp | grep ':3000' | head -1 || echo 'available')"
echo "Port 8317: $(ss -tlnp | grep ':8317' | head -1 || echo 'not running — ClipProxy required!')"

echo ""
echo "=== Setup complete. Next steps ==="
echo "1. Run: cp .env.local.example .env.local && nano .env.local"
echo "2. Run: npm install --include=dev && npm run build"
echo "3. Run: pm2 start ecosystem.config.js && pm2 save"
echo "4. Add ops/Caddyfile.demo.quantika.org to /etc/caddy/Caddyfile"
echo "5. Run: caddy reload --config /etc/caddy/Caddyfile"
