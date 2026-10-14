# GeoPulse Close-Range Earth Modes

## Map modes

GeoPulse now supports three ground-view experiences:

1. **Satellite globe:** An actively requested Esri World Imagery basemap with normal pan, zoom and layer overlays. The tile service is current, but **individual photograph capture dates vary by location**; no imagery service supplies real-time street photographs worldwide.
2. **3D elevation:** A built-in ArcGIS WorldElevation3D terrain provider is attempted automatically. The globe keeps working with the normal ellipsoid if that public service requires authorization or is unavailable. This gives hills, valleys and terrain relief, **not 3D buildings**.
3. **Photorealistic 3D buildings:** When **PHOTO 3D** is explicitly enabled with the visitor's Google Maps Platform *Map Tiles API* key, GeoPulse begins streaming Google's Photorealistic 3D Tiles when the camera comes within 35 km of the ground, and switches back to the regular globe beyond 65 km. This requires a Google billing account; the visitor may incur charges. No Google service is called without clicking Enable.

The 3D API key is kept only in this browser tab's JavaScript memory, is never sent to GeoPulse's backend, saved in local storage or added to share links, and is cleared when the mode is switched off. It **must** be restricted at Google Cloud to the allowed web origin and Map Tiles API with appropriate request quotas. Google receives it on the tile requests, as normal for browser API keys.

## Controls

- Mouse wheel or touch pinch: zoom from Earth orbit to approximately **2 m** camera minimum; terrain/collision limitations and underlying imagery resolution may constrain the actual visible detail.
- **+** / **−**: zoom.
- Drag: move the globe.
- Right-drag or Ctrl+drag: tilt/rotate camera.
- **3D VIEW**: fly to an oblique camera viewpoint around the map's ground point. When zooming below 3.5 km, GeoPulse automatically enters an oblique camera orientation once per descent.
- **PHOTO 3D**: optional paid Google Photorealistic 3D Tiles; click **3D ON** again to turn it off and clear the key.
- **SHARE**: preserves allowed camera/basemap state but excludes the API key.

## Data freshness and coverage

- Public imagery providers update source tiles asynchronously; **latest available** does not mean photographed today.
- Satellite/terrain detail is bounded by the imagery service's source resolution and elevation accuracy.
- Photorealistic buildings are not available everywhere; 3D map content can be older than the underlying street grid.
- Attribution for Google 3D Tiles is displayed in the Cesium canvas credit overlay with `showCreditsOnScreen: true`. Never hide/cover it.
- Google 3D Tiles can use significant GPU/CPU and cellular data. Google bills based on current API pricing, not a fixed fee.

## QA

```sh
node --check globe-depth.js
node --check app.js
node --test tests/globe-depth.test.cjs
```

In a real browser, verify the public elevation tile service actually responds; then test 3D terrain, 2 m zoom control, desktop right-drag, mobile pinch, and search-to-oblique. For Google 3D, use a rate-limited/restricted key and test at a location that supports 3D coverage. With invalid/missing Google credentials, verify that the globe remains usable. Do not claim successful photorealistic loading based only on the unit tests.

## Official reference

- [Cesium ArcGIS elevation terrain provider](https://cesium.com/learn/cesiumjs/ref-doc/ArcGISTiledElevationTerrainProvider.html)
- [Cesium minimum zoom and camera controls](https://cesium.com/learn/cesiumjs/ref-doc/ScreenSpaceCameraController.html)
- [Google Photorealistic 3D Tiles and renderer policy](https://developers.google.com/maps/documentation/tile/use-renderer)
- [Google Map Tiles API billing and key setup](https://developers.google.com/maps/documentation/tile/get-api-key)
- [Google Maps attribution policy](https://developers.google.com/maps/documentation/tile/policies)
