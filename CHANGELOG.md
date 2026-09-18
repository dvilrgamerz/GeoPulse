# Changelog

All notable GeoPulse milestones are documented here.

## v0.5 — Interactive Live Objects — 2026-09-18

### Added
- Clickable **Aircraft**, **Ship**, and **Satellite** markers.
- Slide-in GeoPulse Object Inspector with readable live/provider metadata.
- On-demand CelesTrak SATCAT + GP lookup for selected satellites.
- Aircraft registration, type, description, emergency and feed-age fields when supplied by adsb.lol.
- AIS navigation status, heading, course, position accuracy and static/voyage fields when those AIS messages are observed.

### Improved
- Focused map views prefer bounded adsb.lol live aircraft data before falling back to OpenSky.
- Aircraft and ship markers are slightly larger and easier to select.
- Satellite count wording now says **trackable satellites** rather than implying the rendered public GP/TLE set equals all active objects in SATCAT.
- Object panels always identify their source and data age.

### Required configuration
- Live ships still require `AISSTREAM_API_KEY`; GeoPulse does not fabricate ship positions when the key is absent.

## v0.4 — Data Scale & Reliability — 2026-09-18

### Fixed
- Replaced the small 159-ish satellite sample with CelesTrak's full ACTIVE TLE catalog.
- Added an adsb.lol bounded live-flight fallback when OpenSky is unavailable or returns no usable snapshot.
- Removed earthquakes from the combined Disaster layer so seismic events do not appear twice.
- Stopped presenting an unconfigured AIS ship provider as a real zero count.

### Added
- High-performance Cesium PointPrimitiveCollection satellite renderer for thousands of active objects.
- Batched SGP4 satellite position updates to reduce UI stalls.
- 32 major global trade-corridor reference routes.
- Aircraft source and coverage labeling in the layer status.

### Clarified
- Full ACTIVE satellites are not the same thing as every cataloged payload/object/debris item.
- AISStream still requires a server-side API key.
- Trade corridors are a reference network, not live vessel tracks.

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
