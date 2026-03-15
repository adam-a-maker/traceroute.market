```
  __________  ___   ________________  ____  __  ______________
 /_  __/ __ \/   | / ____/ ____/ __ \/ __ \/ / / /_  __/ ____/
  / / / /_/ / /| |/ /   / __/ / /_/ / / / / / / / / / / __/   
 / / / _, _/ ___ / /___/ /___/ _, _/ /_/ / /_/ / / / / /___   
/_/ /_/ |_/_/  |_\____/_____/_/ |_|\____/\____/ /_/ /_____/   
                              .market
```

<div align="center">

**Trace the path of every order — from client to exchange — across the real undersea cable network.**

[![Live](https://img.shields.io/badge/LIVE-traceroute.market-00dcb8?style=flat-square&labelColor=020508)](https://traceroute.market)
[![Yahoo Finance](https://img.shields.io/badge/data-Yahoo_Finance-00dcb8?style=flat-square&labelColor=020508)](https://finance.yahoo.com)
[![Vercel](https://img.shields.io/badge/deployed-Vercel-00dcb8?style=flat-square&labelColor=020508&logo=vercel&logoColor=00dcb8)](https://vercel.com)
[![License](https://img.shields.io/badge/license-MIT-00dcb8?style=flat-square&labelColor=020508)](LICENSE)

</div>

---

## What is this?

`traceroute` is the Unix command that shows you every network hop a packet takes from your machine to a destination server.

**traceroute.market** does the same thing — but for stock orders.

Every order that goes from a trader in Singapore to the NYSE travels through real undersea fiber-optic cables. This site makes that visible: watch live order flow arc across the globe, following the actual submarine cable corridors that carry ~97% of all international internet traffic.

---

## Features

| | |
|---|---|
| 🌍 **Live world map** | CartoDB dark tiles · Leaflet 1.9.4 |
| 📈 **Real market prices** | Yahoo Finance · S&P 500, NASDAQ, CAC 40, FTSE 100, Nikkei, SSE · refresh every 15s |
| ⚡ **Animated order arcs** | Canvas 2D · Catmull-Rom splines · constant speed (proportional to geographic distance) |
| 🌊 **Submarine cable routing** | BFS pathfinding over 35 cable nodes · 60+ real cable segments · Trans-Atlantic, SEA-ME-WE, Trans-Pacific |
| 🛰 **Toggle: arc / cable** | Switch between great-circle arcs and realistic undersea cable routes |
| 📊 **Price chart** | Per-market Chart.js panel with real price history, open/high/low/volume |
| 🔍 **Ticker search** | Real-time filter on the order feed |
| ↔️ **Resizable panels** | Drag handles on both sides |
| ⌨️ **Keyboard shortcuts** | `1`–`6` open market · `Space` toggle mode · `/` search · `Esc` close |
| 📡 **Vercel Analytics** | Event tracking + Core Web Vitals (Speed Insights) |

---

## Markets

| Color | Exchange | Index | City |
|---|---|---|---|
| 🔵 `#22d4f0` | NYSE | S&P 500 | New York |
| 🟠 `#ff7a3d` | NASDAQ | NASDAQ Composite | New York |
| 🟣 `#8b7fef` | EURONEXT | CAC 40 | Paris |
| 🟢 `#3dd68c` | LSE | FTSE 100 | London |
| 🟡 `#f0c830` | TSE | Nikkei 225 | Tokyo |
| 🔴 `#f07272` | SSE | SSE Composite | Shanghai |

---

## Cable network

The cable mode follows real submarine cable corridors:

```
Trans-Atlantic    NYC ──── Açores ──── LON / LIS / MAD
SEA-ME-WE         MUM ─── DXB ─── CAI ─── ADE  (Red Sea corridor)
Trans-Pacific     LAX / SEA ─── HAW ─── TYO / GUM / SYD
Southeast Asia    SIN ─── HKG ─── SHA ─── SEO ─── TYO
Europe mesh       LON ─── PAR ─── FRA ─── ZUR ─── ROM ─── ATH
```

35 cable nodes · 60+ segments · BFS shortest-path routing

---

## Stack

```
index.html      ← entire frontend (no framework, no build step)
api/quotes.js   ← Vercel serverless function · CORS proxy → Yahoo Finance
vercel.json     ← static + serverless hybrid routing
```

- **Map** — Leaflet 1.9.4 + CartoDB Dark tiles
- **Arcs** — Canvas 2D, Catmull-Rom spline interpolation, `requestAnimationFrame`
- **Charts** — Chart.js 4.4.0
- **Data** — Yahoo Finance v7 API (via `/api/quotes` to avoid CORS)
- **Hosting** — Vercel (static HTML + Node 18 serverless)
- **Analytics** — Vercel Analytics + Speed Insights

---

## Getting started

**Run locally**

```bash
git clone https://github.com/adam-a-maker/traceroute.market.git
cd traceroute.market
npm install -g vercel
vercel dev
# → http://localhost:3000  (real data, /api/quotes works locally)
```

**Deploy to Vercel**

```bash
vercel --prod
```

Or connect your GitHub repo on [vercel.com](https://vercel.com) — Vercel auto-detects `vercel.json` and wires the serverless function.

> **Enable analytics** after deploying:
> Vercel dashboard → your project → **Analytics** → Enable
> Vercel dashboard → your project → **Speed Insights** → Enable

---

## Keyboard shortcuts

| Key | Action |
|---|---|
| `1` – `6` | Open market chart (NYSE → SSE) |
| `Esc` | Close chart |
| `Space` | Toggle arc / cable mode |
| `/` | Focus ticker search |

---

## Project structure

```
traceroute.market/
├── index.html          ← map, panels, arcs, chart, all in one file
├── api/
│   └── quotes.js       ← serverless Yahoo Finance proxy
├── vercel.json
├── package.json
├── .gitignore
└── README.md
```

---

## Roadmap

- [ ] WebSocket live feed — replace 15s polling (FinnHub free tier)
- [ ] Volatility alerts — notification when index moves >0.5% in 60s
- [ ] Order density heatmap — heat overlay by origin region
- [ ] Historical replay — 30-minute scrubber
- [ ] Mini order book — bid/ask in chart panel
- [ ] PWA — installable, offline-capable
- [ ] Web Audio API — subtle ping on arc landing

---

## Author

Built by **Adam Abdo** — lycéen, embedded systems & robotics (RoboCup Junior 2024, top 11/55 worldwide), CTF competitor, CS50 graduate.

[![GitHub](https://img.shields.io/badge/github-adam--a--maker-00dcb8?style=flat-square&labelColor=020508&logo=github&logoColor=00dcb8)](https://github.com/adam-a-maker)
[![Portfolio](https://img.shields.io/badge/portfolio-adam--abdo.vercel.app-00dcb8?style=flat-square&labelColor=020508)](https://adam-abdo.vercel.app)

---

MIT — © 2025 Adam Abdo