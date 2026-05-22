# Quantika Demo — systemd takeover runbook

**Status:** unit installed on outreach-vps, **NOT yet activated.** Production
process (PID 88073) is still PM2-managed. This runbook describes the controlled
handover from PM2 to systemd.

**Date:** 2026-05-15
**VPS:** outreach-vps (185.249.225.169)
**Service file:** `/etc/systemd/system/quantika-demo.service`
**Takeover script:** `/usr/local/bin/quantika-demo-takeover.sh`

---

## Why this exists

Currently `demo.quantika.org` is served by `next-server` PID 88073, a child of
PM2 God Daemon (PID 3698524). PM2 itself is **not** registered as a systemd
service (no `pm2-root.service`), so if the VPS reboots or the daemon dies, the
process will not come back automatically. The takeover replaces this fragile
setup with a real systemd unit that has `Restart=on-failure` and
`WantedBy=multi-user.target` (auto-start on boot).

---

## What the unit does

`/etc/systemd/system/quantika-demo.service`:

```ini
[Unit]
Description=Quantika Demo (Next.js)
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/root/quantika-demo
EnvironmentFile=/root/quantika-demo/.env.local
Environment=NODE_OPTIONS=--max-old-space-size=4096
ExecStart=/root/quantika-demo/node_modules/.bin/next start -p 3000
Restart=on-failure
RestartSec=5
StandardOutput=append:/var/log/quantika-demo.log
StandardError=append:/var/log/quantika-demo.err.log

[Install]
WantedBy=multi-user.target
```

Diff vs `allegro-lister.service` (the template):

| Field | allegro-lister | quantika-demo | Why different |
|---|---|---|---|
| `Type` | `notify` | `simple` | Next.js does not implement `sd_notify`; uvicorn does |
| `NotifyAccess` | `main` | _omitted_ | only meaningful with Type=notify |
| `WatchdogSec` | `30s` | _omitted_ | watchdog needs Type=notify |
| `Restart` | `on-watchdog` | `on-failure` | no watchdog → restart on non-zero exit |
| `WorkingDirectory` | `/root/allegro-lister` | `/root/quantika-demo` | obvious |
| `ExecStart` | `/usr/local/bin/uvicorn api.app:app --host 127.0.0.1 --port 8100` | `/root/quantika-demo/node_modules/.bin/next start -p 3000` | absolute path to local-installed `next` binary |
| `EnvironmentFile` | _none_ | `/root/quantika-demo/.env.local` | quantika-demo needs ~67 env vars (AWS/Google/feature flags); allegro-lister reads its own config |
| `Environment=` | _none_ | `NODE_OPTIONS=--max-old-space-size=4096` | match current PM2 setting (heap OOM guard) |
| `User` | _omitted_ (defaults to root) | `User=root` (explicit) | matches current process owner |
| Logging | _omitted_ (journald default) | `append:/var/log/quantika-demo.{log,err.log}` | explicit log files for tail-ability |

`systemd-analyze verify` passes. `daemon-reload` was already run; the unit shows
`loaded / inactive (dead) / disabled` — exactly what we want before takeover.

---

## Risks before flipping the switch

1. **`.env.local` completeness.** systemd will only inject what's in
   `/root/quantika-demo/.env.local`. PM2 currently also inherits the shell env
   from whoever started it. If any var is set in `~/.bashrc` or
   `ecosystem.config.js` but **not** in `.env.local`, the systemd-managed
   process will crash on first request that touches it. **Mitigation:** before
   takeover, diff env vars between PID 88073 (`cat /proc/88073/environ | tr '\0'
   '\n'`) and `.env.local`. Anything app-level missing must be added.
2. **PM2 will resurrect the process if not deleted first.** The takeover
   script handles this: it calls `pm2 delete quantika-demo` (not just
   `pm2 stop`), which removes the entry from the live PM2 process list and
   prevents auto-restart. Backup of `dump.pm2` is taken before deletion for
   rollback.
3. **Brief downtime: ~5–30s.** Between `pm2 delete` and systemd unit reaching
   healthy state, port 3000 is unbound. Plan the takeover for a low-traffic
   window. Caddy will return 502 during this gap.
4. **No active health probe in the unit itself.** `Restart=on-failure` only
   triggers on process exit, not on stuck/unresponsive next-server. If the
   process hangs (event loop blocked) systemd will not restart it. Acceptable
   for now; a `WatchdogSec` would require modifying Next.js to ping
   `sd_notify`.
5. **tmux `bakeoff` session is unrelated and untouched.** The eval cycle in
   `/root/quantika-demo` on branch `feat/parse-cargo-phase3a-config-bakeoff` is
   separate from production. The unit's `WorkingDirectory` is `/root/quantika-demo`
   but the unit only starts the `.next/` built artifact via `next start` — it
   doesn't compete with the eval cycle.

---

## Takeover (when orchestrator approves)

```bash
# pre-flight: verify env vars are in .env.local
ssh outreach-vps "comm -23 \
  <(cat /proc/88073/environ | tr '\0' '\n' | grep -E '^[A-Z][A-Z_]+=' | cut -d= -f1 | sort -u) \
  <(grep -E '^[A-Z_]+=' /root/quantika-demo/.env.local | cut -d= -f1 | sort -u)"
# Expected output: only PM2-internal / shell vars (NODE_*, npm_*, PM2_*, PATH, HOME, USER, etc.)
# If you see any APP-level var (e.g. STRIPE_KEY) → STOP, add it to .env.local first.

# execute takeover
ssh outreach-vps "CONFIRM=YES bash /usr/local/bin/quantika-demo-takeover.sh"

# after success — finalize PM2 state so reboot can't resurrect a duplicate
ssh outreach-vps "cd /root/quantika-demo && npx pm2 save"
```

The takeover script logs every step. It will:
1. preflight (unit, env file, port, PM2 control, dump backup file)
2. snapshot PID + backup `/root/.pm2/dump.pm2` → `dump.pm2.pre-takeover`
3. `npx pm2 delete quantika-demo` (kills the child, removes from autorestart)
4. wait up to 30s for port 3000 to be released
5. `systemctl enable --now quantika-demo`
6. poll `http://127.0.0.1:3000/api/health` up to 30s for HTTP 200
7. on success: print `systemctl status`
8. on health failure: auto-rollback (disable unit + restore dump + `pm2 resurrect`)

---

## Rollback

### Automatic (during takeover)
If `/api/health` doesn't return 200 within 30s of systemd start, the script
disables the unit, restores `dump.pm2` from backup, and runs `pm2 resurrect`.
Verify with `npx pm2 list` and `ss -ltn 'sport = :3000'`.

### Manual (after successful takeover, hours/days later)
```bash
ssh outreach-vps
systemctl stop quantika-demo
systemctl disable quantika-demo
# option A — restore from pre-takeover dump
cp /root/.pm2/dump.pm2.pre-takeover /root/.pm2/dump.pm2
cd /root/quantika-demo && npx pm2 resurrect
# option B — start fresh from ecosystem.config.js
cd /root/quantika-demo && npx pm2 start ecosystem.config.js
# option C — manual one-shot in screen (last resort)
screen -dmS quantika-demo bash -c "cd /root/quantika-demo && NODE_OPTIONS=--max-old-space-size=4096 ./node_modules/.bin/next start -p 3000"
```

In all three cases, verify: `ss -ltn 'sport = :3000'` shows LISTEN and
`curl -fsS http://127.0.0.1:3000/api/health` returns 200.

---

## Post-takeover verification

```bash
ssh outreach-vps "
  systemctl is-enabled quantika-demo
  systemctl is-active  quantika-demo
  ss -ltn 'sport = :3000' | grep LISTEN
  curl -fsS http://127.0.0.1:3000/api/health
  tail -20 /var/log/quantika-demo.log
  tail -20 /var/log/quantika-demo.err.log
  npx -C /root/quantika-demo pm2 list  # should NOT show quantika-demo
"
```

External smoke (from MacBook):
```bash
curl -fsS https://demo.quantika.org/api/health
```

---

## Operating notes (post-takeover)

- **logs:** `/var/log/quantika-demo.log` (stdout), `/var/log/quantika-demo.err.log`
  (stderr). Add to logrotate if growth becomes an issue.
- **restart after `.env.local` change:** `systemctl restart quantika-demo`
  (systemd re-reads `EnvironmentFile` on start).
- **restart after code deploy:** `systemctl restart quantika-demo`. The unit
  does not rebuild — `.next/` must already be built (current deploy workflow is
  unchanged: `git pull && npm install && npm run build && systemctl restart
  quantika-demo`).
- **reboot survival:** systemd starts the unit at boot via
  `WantedBy=multi-user.target` (active after `enable`). PM2 daemon is no longer
  needed for quantika-demo (still used for other PM2-managed apps if any —
  check `npx pm2 list`).
