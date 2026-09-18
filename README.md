# 🌎 GeoPulse v0.3.1

**Live Earth Intelligence**

GeoPulse is an open-source 3D Earth command center for live, near-live, scheduled, and reference global data. Every layer is independently switchable and the UI labels source freshness instead of pretending every provider is truly real-time.

## Current v0.3.1

### Architecture improvements inspired by God's Eye View

GeoPulse studies useful open-source patterns from [Bilawal Sidhu's God's Eye View](https://github.com/bilawalsidhu/gods-eye-view) without turning GeoPulse into a fork or visual clone.

- Data credits are visible inside the app and registered with Cesium.
- Address search falls back to keyless Photon/OpenStreetMap when ArcGIS is not configured or unavailable.
- Aircraft queries become viewport-bounded when the camera is zoomed in, reducing unnecessary upstream data.
- GeoPulse continues to use its own branding, UI, data model, serverless architecture and curated trade-route implementation.
- GeoPulse does **not** bundle God's Eye View's restricted third-party datasets, models, promotional media or branding.

See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Current v0.3

- 🌎 Interactive CesiumJS Earth with **Satellite / Streets / Topographic** map layouts
- 🔎 Search by **address, house number, city, place, or latitude/longitude**
- ✈️ Live aircraft via OpenSky
- 🛰️ Moving satellite positions propagated from CelesTrak orbital data
- 🚢 Live AIS vessel snapshots for the area currently in view (provider key required)
- ⇄ Global trade corridors, clearly labeled as reference routes
- ⚠️ Multi-hazard disaster layer combining NASA EONET + GDACS
- ◎ USGS earthquakes
- ◇ Near-live conflict-related **news-location signals** from GDELT, with explicit sourcing/disclaimer
- ★ Major scheduled sports, music, and other events via Ticketmaster (provider key required)
- 🕒 Top-right UTC clock **with seconds + full date**
- 🕒 Visitor-local clock/date/time zone, synchronized from the browser
- 📰 Global newest feed with filters and click-to-fly navigation
- 🟢 Per-provider source-health indicators
- 📱 Responsive desktop/mobile command-center UI
- ✨ GeoPulse logo + animated loading screen

> **Important:** GeoPulse distinguishes **live**, **near-live**, **scheduled**, and **reference** data. Conflict points are geolocated reporting signals, not independently verified battlefield events. Trade corridors are not live ships.

## Version history

### v0.1 — Foundation
- GeoPulse identity and loading screen
- Cesium 3D Earth
- OpenSky aircraft
- USGS earthquakes
- NASA EONET natural events
- Reference trade routes
- Global newest feed
- Responsive layer controls

### v0.2 — Earth Intelligence
- CelesTrak satellite data service
- Satellite.js SGP4 propagation
- Multi-hazard GDACS service
- Detailed geocoding service
- Expanded serverless data architecture
- Multiple map styles

### v0.3 — Global Command Center
- Live AIS ship provider integration
- GDELT conflict-related reporting layer
- Major-event discovery provider
- Detailed address + coordinate search UI
- UTC + local date/time synchronization
- Expanded source health, counters, filters, and mobile UI

See [CHANGELOG.md](CHANGELOG.md) for the detailed release notes.

## Provider setup

GeoPulse runs without every optional key, but these environment variables unlock the full experience:

```text
# Recommended for aircraft reliability / higher OpenSky allowance
OPENSKY_CLIENT_ID=
OPENSKY_CLIENT_SECRET=

# Detailed address and house-number geocoding
ARCGIS_API_KEY=

# Live AIS vessel positions
AISSTREAM_API_KEY=

# Major scheduled sports/music/entertainment events
TICKETMASTER_API_KEY=
```

Copy `.env.example` locally or add the variables in your Netlify environment settings. **Never commit real secrets.**

### What works without optional keys?

| Layer | Provider | Key required? | GeoPulse label |
| --- | --- | ---: | --- |
| Earthquakes | USGS | No | Real-time feed |
| Natural disasters | NASA EONET | No | Near-live/source dependent |
| Disaster alerts | GDACS | No | Frequently refreshed |
| Satellites | CelesTrak | No | Orbital data + locally propagated position |
| Conflict-related reporting | GDELT GEO | No | Near-live news-location signal |
| Aircraft | OpenSky | Optional/recommended | Live, rate-limited |
| Live ships | AISStream | Yes | Live stream snapshot |
| Detailed address search | ArcGIS World Geocoding → Photon/OpenStreetMap fallback | ArcGIS key optional | Search service |
| Major scheduled events | Ticketmaster Discovery | Yes | Scheduled/latest event listings |
| Trade routes | GeoPulse | No | Reference only |

## Run locally

The frontend itself is build-free:

```bash
python -m http.server 8080
```

For the serverless providers, use Netlify Dev so `/.netlify/functions/*` is available.

## Deploy

The repository is configured for Netlify and pins Node.js 22 for the serverless functions.

```text
publish = "."
functions = "netlify/functions"
```

## Data-source notes

See [docs/DATA_SOURCES.md](docs/DATA_SOURCES.md) for freshness, limitations, and provider notes.

## Safety / accuracy principles

1. **Never fake live data.**
2. **Show source + freshness.**
3. **Treat conflict reporting as sourced reporting, not GeoPulse verification.**
4. **Keep secret keys server-side.**
5. **Degrade gracefully if a provider is unavailable or rate-limited.**
6. **Do not use GeoPulse as an aviation, maritime, disaster-response, or personal-safety system.**

## Technology

- CesiumJS 1.145
- satellite.js 6.0.2
- Vanilla JavaScript / HTML / CSS
- Netlify Functions on Node.js 22
- Public JSON / GeoJSON / WebSocket data providers

## License

MIT for GeoPulse source code. External data remains subject to each provider's own terms and licenses.
