# 🌎 GeoPulse

**Live Earth Intelligence**

GeoPulse is an open-source real-time / near-real-time global dashboard built around an interactive 3D Earth. It combines trustworthy public data feeds with switchable map layers, freshness indicators, a newest-events stream, and cinematic globe navigation.

## v0.1 foundation

- 🌎 3D Earth powered by CesiumJS
- ✈️ Live aircraft layer through OpenSky (Netlify proxy)
- 🌋 Live earthquake feed from USGS
- 🔥 Open natural-event feed from NASA EONET
- 🚢 Global trade corridor layer
- 📰 Global newest-event stream
- 🎛️ Per-layer ON/OFF controls
- 🕒 Source freshness + UTC clock
- 🚀 Click an event to fly the globe to it
- ✨ GeoPulse animated loading screen and custom SVG mark
- 📱 Responsive command-center UI

> **Data honesty:** GeoPulse distinguishes real-time, near-real-time, and reference/illustrative layers. The trade-corridor layer in v0.1 is a reference visualization of major corridors, not live vessel telemetry.

## Data sources

| Layer | Source | Freshness |
| --- | --- | --- |
| Earthquakes | USGS Earthquake Hazards Program | Real-time feed |
| Natural events | NASA EONET v3 | Near-real-time / source dependent |
| Aircraft | OpenSky Network REST API | Live, subject to API rate limits |
| Trade corridors | GeoPulse curated reference routes | Reference layer |
| Satellites | Planned: CelesTrak GP data | Planned |

## Run locally

Because the core frontend is build-free, you can serve the repository with any static server:

```bash
python -m http.server 8080
```

Then open `http://localhost:8080`.

The aircraft layer uses a Netlify Function. When running only a static local server, the rest of the dashboard works and the aircraft control will report that its proxy is unavailable.

## Deploy on Netlify

The repository includes `netlify.toml` and `netlify/functions/flights.js`.

For better OpenSky limits, set these environment variables in Netlify:

```text
OPENSKY_CLIENT_ID=...
OPENSKY_CLIENT_SECRET=...
```

The function can attempt anonymous access when credentials are not configured, but OpenSky may rate-limit or change anonymous access.

## Roadmap

### v0.2
- Satellite propagation using CelesTrak orbital data
- Wildfire layer using NASA FIRMS
- Severe-weather and storm layers
- Search + fly-to-place
- Better flight clustering and camera-bounded flight requests

### v0.3
- Sourced global conflict / humanitarian reports with clear attribution
- Rocket launches and space-weather layers
- Optional AIS maritime provider integration
- Historical playback
- User alerts and followed locations

## Principles

1. **Never fake “live.”** Every layer exposes a source and last-updated state.
2. **Source sensitive global events.** Conflict and political-event layers must retain attribution and timestamps.
3. **Protect credentials.** Secret API credentials belong in serverless environment variables, not browser JavaScript.
4. **Degrade gracefully.** If a provider is down or rate-limited, the rest of GeoPulse stays usable.
5. **Keep the globe fast.** Limit entities, cluster where needed, and refresh only at sensible intervals.

## Technology

- CesiumJS 1.145
- Vanilla JavaScript / HTML / CSS
- Netlify Functions
- Public JSON / GeoJSON APIs

## License

MIT. Data from external providers remains subject to each provider's own terms and licenses.
