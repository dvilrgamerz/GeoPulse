# Changelog

All notable GeoPulse milestones are documented here.

## v0.3.1 — Open-source architecture polish — 2026-09-18

### Added
- In-app data-source and license panel.
- Cesium data-credit registration for active GeoPulse providers.
- Photon/OpenStreetMap keyless geocoder fallback.
- God's Eye View acknowledgement and third-party notice.

### Improved
- Aircraft requests become viewport-bounded when zoomed in, reducing unnecessary OpenSky payload.
- Search results identify their provider.
- GeoPulse explicitly separates architecture inspiration from upstream restricted datasets/assets.

## v0.3 — Global Command Center — 2026-09-18

### Added
- Live AIS ship provider integration, scoped to the current map viewport.
- GDELT near-live conflict-related news-location layer with explicit non-verification disclaimer.
- Ticketmaster major scheduled events provider.
- Detailed address / house-number / place geocoding provider.
- Coordinate search with no API key required.
- Satellite, Streets and Topographic map layouts.
- Dual top-right clock: UTC seconds/date + visitor local seconds/date/time zone.
- Six-column global activity counters.
- Expanded source-health panel and latest-feed filters.
- Responsive mobile command-center redesign.

### Improved
- Natural disasters now combine NASA EONET with GDACS multi-hazard alerts.
- Source freshness is surfaced more clearly.
- Live ships only query a focused geographic viewport to avoid pretending global AIS is one static poll.
- Conflict markers are explicitly described as reporting signals rather than verified conflict events.

## v0.2 — Earth Intelligence — 2026-09-18

### Added
- CelesTrak orbital data proxy.
- satellite.js SGP4 browser propagation.
- GDACS disaster service.
- ArcGIS geocoding service.
- Provider-ready serverless architecture for richer real-time layers.

## v0.1 — Foundation — 2026-09-18

### Added
- GeoPulse branding, SVG mark and animated startup screen.
- CesiumJS 3D globe.
- Live OpenSky aircraft layer.
- USGS earthquakes.
- NASA EONET natural events.
- Global trade-corridor reference layer.
- Latest global feed, source health, responsive UI and Netlify configuration.
