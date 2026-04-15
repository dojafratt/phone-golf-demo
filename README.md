# Phone Golf

A facilitator tool for running a week-long, socially-accountable phone-habits experiment.
Built with React + Vite + Tailwind. Single-file app component, local-only persistence.

## Quick start

```bash
npm install
npm run dev
```

Open http://localhost:5173.

## Build & preview

```bash
npm run build      # outputs to dist/
npm run preview    # serve the built bundle locally
```

## Deploy

### Vercel (easiest)
1. Push this repo to GitHub.
2. Go to https://vercel.com/new, import the repo.
3. Vercel auto-detects Vite — no config needed. Click Deploy.

### Netlify
1. Push to GitHub.
2. https://app.netlify.com/start → connect repo.
3. Build command: `npm run build`. Publish directory: `dist`.

### Anywhere else
`npm run build` produces a static site in `dist/`. Drop it on any static host
(Cloudflare Pages, GitHub Pages, S3 + CloudFront, etc.).

## Data

State persists to `localStorage` under the key `phonegolf:v1`. Per-browser, per-device.
Clearing site data wipes everything. There is no backend and no auth.

If you outgrow that — e.g. you want facilitators to log in and have groups follow
them across devices — Supabase is the easiest swap-in. The data shape lives in
`saveState`/`loadState` in `src/PhoneGolfApp.jsx` and maps cleanly to a `groups`
table with a JSON `days` column.

## Stack

- React 18 + Vite 6
- Tailwind CSS 3 (utility classes only, no custom plugins)
- lucide-react for icons
- html-to-image for PNG export of scorecards and leaderboards
- Google Fonts (Fraunces, Instrument Sans, JetBrains Mono) loaded via @import
  in a `<style>` tag inside the component

## Caveats

- PNG export on iOS Safari can be flaky with web fonts. Test the download on a
  real iPhone before demoing. The screenshot fallback is fine if it misbehaves.
- No tests. It's a prototype.
