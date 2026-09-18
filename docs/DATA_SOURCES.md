# GeoPulse Data Sources

GeoPulse treats freshness as a property of each layer. A moving marker is not automatically called “live.”

## USGS — Earthquakes
- GeoPulse: all earthquakes in the USGS last-24-hours GeoJSON feed.
- Display: magnitude, location, depth, timestamp.
- UI classification: **real-time feed**.
- Source: https://earthquake.usgs.gov/earthquakes/feed/

## NASA EONET — Open natural events
- GeoPulse: open events with geospatial point geometry.
- Examples can include wildfires, severe storms, volcanoes, floods, landslides, sea/lake ice and other categories depending on the current EONET catalog.
- UI classification: **near-live / source-dependent**.
- Source: https://eonet.gsfc.nasa.gov/docs/v3

## GDACS — Multi-hazard disaster alerts
- GeoPulse queries recent alerts through the GDACS GeoJSON API.
- GDACS covers multiple sudden-onset hazard families, including earthquakes, tropical cyclones, floods, volcanoes and wildfires where data are available.
- UI classification: **frequently refreshed disaster alert feed**.
- Source: https://www.gdacs.org/gdacsapi/swagger/index.html
- Acknowledgement: Global Disaster Awareness and Coordination System (GDACS).

## OpenSky Network — Aircraft
- GeoPulse: state vectors proxied through a Netlify Function.
- Fields used: callsign, position, altitude and track.
- Optional credentials: `OPENSKY_CLIENT_ID`, `OPENSKY_CLIENT_SECRET`.
- UI classification: **live, provider/rate-limit dependent**.
- Source: https://opensky-network.org/data/api
- Not suitable for aviation safety.

## CelesTrak + satellite.js — Satellites
- GeoPulse fetches current GP data as JSON OMM for selected CelesTrak groups.
- The browser uses satellite.js/SGP4 to propagate current display positions from those orbital elements.
- GeoPulse caches orbital-data requests and refreshes much less often than marker positions.
- UI classification: **modeled current position from recent orbital elements**, not a direct GPS stream from the spacecraft.
- Source: https://celestrak.org/NORAD/documentation/gp-data-formats.php

## AISStream — Live ships
- GeoPulse uses a server-side WebSocket connection because AISStream does not allow direct browser connections.
- The request is bounded to the current map view and collects a short snapshot of position reports.
- Required environment variable: `AISSTREAM_API_KEY`.
- UI classification: **live AIS stream snapshot**.
- Source: https://aisstream.io/documentation
- Coverage depends on upstream AIS receivers and vessel activity.

## GDELT GEO 2.0 — Conflict-related reporting
- GeoPulse queries a conflict-related keyword set and maps geolocated recent news coverage.
- It is intentionally labeled **Conflict Reporting**, not “verified battles.”
- Each point is a media/geolocation signal. It can be incomplete, duplicated, delayed, inaccurate, or unrelated to an independently verified event.
- UI classification: **near-live news-location signal**.
- Source: https://blog.gdeltproject.org/gdelt-geo-2-0-api-debuts/

## Ticketmaster Discovery — Major events
- GeoPulse can map upcoming sports, music and other Ticketmaster-discovered events that include venue coordinates.
- Required environment variable: `TICKETMASTER_API_KEY`.
- UI classification: **scheduled/latest event listings**, not a live scoreboard.
- Source: https://developer.ticketmaster.com/products-and-docs/apis/discovery-api/v2/

## ArcGIS World Geocoding + Photon — Address search
- GeoPulse first uses ArcGIS World Geocoding when `ARCGIS_API_KEY` is configured.
- ArcGIS can return provider match types such as PointAddress, StreetAddress and Subaddress when coverage exists.
- If ArcGIS is unavailable, unconfigured, or has no result, GeoPulse falls back to Photon over OpenStreetMap.
- Photon is a public best-effort demo service; GeoPulse limits each interactive request to a small result set and does not bulk query it.
- GeoPulse does **not** guarantee rooftop-level precision for every home; precision depends on provider coverage and match quality.
- Sources: https://developers.arcgis.com/rest/geocode/find-address-candidates/ and https://photon.komoot.io/

## GeoPulse Trade Corridors
- Curated geodesic reference lines between major trade gateways.
- UI classification: **reference**.
- They are not AIS positions and are not a claim that every ship follows the exact line shown.

## Refresh design

| Data | Client refresh target |
| --- | ---: |
| Satellite marker propagation | 1 second |
| Aircraft | 30 seconds |
| Ships | 60 seconds / map movement |
| USGS earthquakes | 5 minutes |
| NASA + GDACS disasters | 5 minutes |
| GDELT reporting | 10 minutes |
| Major scheduled events | 15 minutes |
| CelesTrak orbital elements | 2 hours |

These are GeoPulse refresh intervals, not guarantees that the upstream provider produced new observations at the same frequency.
