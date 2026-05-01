# Aether — Cinematic Weather Intelligence

A futuristic, AI-powered weather dashboard built like a premium native app.
Hyper-local conditions, distilled "weatherman" forecasts, animated radar &
satellite loops on a dark WebGL map, and a glassy, Apple-Weather-meets-NASA
visual language.

> **Status:** starter scaffold, fully runnable. Designed to be packaged into a
> PWA today and wrapped with **Capacitor** or **Tauri** when you're ready to
> ship native.

---

## Highlights

- **React 19 + TypeScript + Vite 5** (SWC-powered)
- **MapLibre GL** vector basemap (CARTO dark by default; MapTiler when keyed)
- **RainViewer** animated radar + IR satellite tile loops with nowcast frames
- **Open-Meteo** ECMWF/GFS/ICON ensemble data, plus air quality + pollen
- **TanStack Query v5** for caching, background refresh, and offline-first behavior
- **Zustand** persisted store (units, theme, locations, layer prefs)
- **Tailwind v4 + Radix UI primitives + Framer Motion** for the cinematic glass UI
- **vite-plugin-pwa** for installable, offline-capable production builds
- A pure-TS **AI weatherman** summarizer (no API key), with a **streaming Claude
  briefing** layered on top when `VITE_ANTHROPIC_API_KEY` is set
- **NOAA / NWS** severe-weather alerts (US + territories), keyless and zero-cost
  for the rest of the world (skipped via cheap bounding-box pre-filter)

---

## Quickstart

```bash
pnpm install        # or npm/yarn/bun
pnpm dev
```

Open http://localhost:5173.

```bash
pnpm build && pnpm preview
```

No environment variables are required out of the box — Open-Meteo, RainViewer,
NWS, and CARTO basemap tiles are all keyless. To upgrade providers, copy
`.env.example` → `.env.local` and fill in the relevant keys (Anthropic,
Tomorrow.io, Visual Crossing, MapTiler, etc.).

---

## AI Forecast Briefing (Claude)

The dashboard's "AI Forecast Briefing" card paints structured fields
(headline, key timing, today's call) instantly from the deterministic
rule-based summarizer, then *streams* a flowing prose narrative from
**Claude Opus 4.6** when configured.

```bash
# .env.local
VITE_LLM_PROVIDER=anthropic
VITE_ANTHROPIC_API_KEY=sk-ant-...
VITE_ANTHROPIC_MODEL=claude-opus-4-6   # or claude-sonnet-4-6, claude-haiku-4-5
```

What you get:

- **Streaming prose** that types in like a teleprompter, with a live LIVE/CLAUDE/OFFLINE pill
- **Five tones** via the dropdown: *Broadcast*, *Quick*, *Deep dive*, *Outdoors*, *Commuter*
- **Regenerate** button to re-roll the briefing on demand
- **Bulletproof fallback** to the rule-based narrative on any failure
- **sessionStorage caching** keyed by `location:units:tone:30-min bucket` so
  re-renders / nav / focus swaps don't burn API credits
- **Prompt caching** on the system block to keep cost low across regenerations

> ⚠️ **Browser exposure.** Vite bundles every `VITE_`-prefixed env var into the
> client. The included integration uses `dangerouslyAllowBrowser: true` for
> local dev and personal builds only. For production, proxy through a tiny
> serverless function (Cloudflare Worker, Vercel Edge, etc.) that adds the
> `Authorization` header server-side, and remove the in-browser SDK call.

---

## Severe Weather Alerts (NOAA / NWS)

Active alerts ride along the top of the dashboard whenever the National
Weather Service has anything live for the active location. The adapter is
keyless and live-tested against `api.weather.gov/alerts/active`.

Coverage: CONUS, Alaska, Hawaii, Puerto Rico/USVI, Guam/CNMI, American Samoa.
Outside US territories the adapter short-circuits to `[]` via a cheap
bounding-box check — no wasted round trip — so the hook is safe to mount
globally. Polls every 5 min with a 2-min stale window.

---

## Architecture

```
src/
├── App.tsx                      QueryClient provider + root
├── main.tsx                     Mount + global styles
├── index.css                    Tailwind tokens, glass utilities, MapLibre overrides
│
├── types/weather.ts             Provider-agnostic domain types
│
├── lib/
│   ├── api/
│   │   ├── http.ts              Tiny fetch wrapper with timeout + typed errors
│   │   ├── openMeteo.ts         Forecast + air quality adapter
│   │   ├── geocoding.ts         Search + reverse geocoding
│   │   ├── nws.ts               NOAA severe-weather alerts (US + territories)
│   │   └── rainviewer.ts        Radar / satellite manifest + tile URL builder
│   ├── ai/
│   │   ├── summarize.ts         Rule-based natural-language "weatherman"
│   │   └── llmSummarize.ts      Streaming Claude briefing (provider-gated)
│   └── utils/                   format, cn, WMO weather code → icon/gradient/mood
│
├── store/appStore.ts            Persisted Zustand store
├── hooks/                       useWeather, useAirQuality, useRadarManifest,
│                                useAlerts, useWeathermanBriefing, useGeolocation
│
└── components/
    ├── layout/                  Dashboard, Header, LocationStrip
    ├── effects/                 DynamicBackground, ParticleLayer (canvas rain/snow)
    ├── map/                     WeatherMap (MapLibre + RainViewer), LayerControl, RadarTimeline, basemap.ts
    ├── weather/                 CurrentConditions, WeatherSummary (AI), HourlyForecast, DailyForecast,
    │                            AirQualityCard, SunMoonCard, AlertsBanner
    └── ui/                      GlassCard, AnimatedNumber, WeatherIcon, LocationSearch
```

### Data flow

1. **`appStore`** persists the user's saved locations, units, theme, and map prefs.
2. **`useWeather` / `useAirQuality`** call the Open-Meteo adapter through TanStack Query.
3. **`summarize()`** turns the bundle into a `WeatherStory` (`headline`, `narrative`, `highlights`, `advice`).
4. **`<WeatherMap>`** loads the RainViewer manifest, mounts every frame as a hidden raster source, and animates the radar by toggling `raster-opacity` per frame — buttery smooth, no source swapping.
5. **`<DynamicBackground>`** + **`<ParticleLayer>`** react to the active weather code so the canvas itself reflects the sky.

---

## Swapping data providers

Every UI component depends only on `WeatherBundle`. To add **Tomorrow.io** or
**Visual Crossing**, drop a new adapter in `src/lib/api/` that returns the same
shape and swap the call inside `useWeather`. No UI changes required.

---

## Going native

This project is intentionally PWA-first. To package it as a real native app:

- **Capacitor** — `npx cap init && npx cap add ios && npx cap add android`. The
  PWA manifest and service worker are already configured.
- **Tauri 2** — point Tauri at `dist/` and ship as a desktop app with system-tray
  weather chips.

---

## Roadmap (already wired in spirit)

- **Voice input** — `voiceEnabled` flag in the store, ready for `SpeechRecognition`
- **3D globe** — `react-three-fiber` is on the dependency list for a future view
- **Severe alerts** — ✅ NWS wired (US/territories); EUMETNET / Meteoalarm next for EU
- **LLM summarizer** — ✅ Claude streaming briefing with five tones + regenerate
- **Shareable snapshots** — `html-to-image` over the dashboard root
- **Production proxy** — Cloudflare Worker / Vercel Edge to keep the Anthropic key off the client

Built with care. ☀️ 🌧 ⛈ ❄️
