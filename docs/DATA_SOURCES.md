# GeoPulse Data Sources

GeoPulse treats freshness as a property of each layer rather than calling every source "live."

## Working in v0.1

### USGS Earthquakes
- Endpoint class: USGS GeoJSON summary feed
- GeoPulse view: all earthquakes from the last 24 hours
- UI label: real-time feed
- Source: https://earthquake.usgs.gov/earthquakes/feed/

### NASA EONET
- API: EONET v3
- GeoPulse view: open events with point geometry
- UI label: near-real-time / source dependent
- Source: https://eonet.gsfc.nasa.gov/docs/v3

### OpenSky Network
- API: REST states endpoint through a Netlify Function
- GeoPulse view: aircraft positions, callsign, altitude, track
- UI label: live
- Optional environment variables: OPENSKY_CLIENT_ID, OPENSKY_CLIENT_SECRET
- Source: https://opensky-network.org/data/api
- Note: rate limits and terms apply. Do not treat GeoPulse as an aviation safety product.

### Trade Corridors
- GeoPulse-curated geodesic reference routes connecting major trade gateways
- UI label: reference
- These are not live ships and are not a claim that every vessel follows the exact path shown.

## Planned

### CelesTrak
General Perturbations orbital elements for a satellite layer. CelesTrak asks clients to avoid excessive downloads and notes GP data updates on a roughly two-hour cadence.
Source: https://celestrak.org/NORAD/documentation/gp-data-formats.php

### Conflict / humanitarian reports
This layer will only ship once each mapped event retains a source, event time, publication time, and uncertainty/context. GeoPulse will not invent an authoritative classification from unsourced social posts.

### Maritime / AIS
Live ship positions need a legally usable AIS provider. Until then, the trade layer remains a clearly labeled corridor reference layer.
