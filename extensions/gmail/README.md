# Quantika Gmail Extension

## Build

```bash
cd extensions/gmail && npm install && npm run build
```

Or from the project root:

```bash
npm run build:extension
```

## Install in Chrome (dev)

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** → select `extensions/gmail/dist/`
4. Open Gmail — should see "⚓ Quantika ready" badge in compose dialog

## Status

v0.1.0 — scaffold only. Sidebar functionality lands in spec-12 (Wave 3).
