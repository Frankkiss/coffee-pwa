# PWA Coffee Theme Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Android PWA install support and apply the `咖Day` coffee theme.

**Architecture:** Static PWA files live under `app/public`. Service worker registration lives in `app/src/pwa`. A small React status component reports online/offline state. Existing feature CSS is adjusted through shared CSS variables in `index.css`.

**Tech Stack:** Vite, React, TypeScript, plain service worker, web app manifest.

---

### Task 1: PWA Static Assets

**Files:**
- Create: `app/public/manifest.webmanifest`
- Create: `app/public/sw.js`
- Create: `app/public/icons/icon.svg`
- Generate: `app/public/icons/icon-192.png`
- Generate: `app/public/icons/icon-512.png`
- Modify: `app/index.html`

- [ ] Add manifest metadata for `咖Day`.
- [ ] Add icon files and theme color metadata.
- [ ] Add service worker cache shell.

### Task 2: Service Worker Registration and Status

**Files:**
- Create: `app/src/pwa/registerServiceWorker.ts`
- Create: `app/src/pwa/OnlineStatus.tsx`
- Create: `app/src/pwa/pwa.css`
- Modify: `app/src/main.tsx`
- Modify: `app/src/App.tsx`

- [ ] Register the service worker only in production-capable browser contexts.
- [ ] Show online/offline status at the top of the app.

### Task 3: Coffee Theme

**Files:**
- Modify: `app/src/index.css`
- Modify: `app/src/App.css`
- Modify feature CSS files under `app/src/features`

- [ ] Add CSS variables for cream, coffee, caramel, and muted text.
- [ ] Replace the dark green theme with coffee colors.
- [ ] Keep layout dense and mobile-friendly.

### Task 4: Verification and Publish

- [ ] Run `npm test --prefix app`.
- [ ] Run `npm run build --prefix app`.
- [ ] Scan for secrets.
- [ ] Commit and push.
- [ ] Verify GitHub Pages HTML, manifest, service worker, and latest assets return HTTP 200.
