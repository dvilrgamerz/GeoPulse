(() => {
  "use strict";

  const C = window.Cesium;
  const S = window.satellite;
  const $ = (id) => document.getElementById(id);
  const app = $("app");
  const loadingScreen = $("loadingScreen");
  const progressBar = $("loadingProgress");
  const progressPercent = $("loadingPercent");
  const progressMessage = $("loadingMessage");

  let viewer;
  let currentBasemap = "satellite";
  let feedFilter = "all";
  let feedItems = [];
  let satelliteRecords = [];
  let satellitePoints = null;
  let satelliteBatchCursor = 0;
  let searchMarker;
  let shipCameraTimer;
  let flightCameraTimer;
  const intervals = [];

  const layers = {
    flights: new C.CustomDataSource("GeoPulse Aircraft"),
    satellites: new C.CustomDataSource("GeoPulse Satellites"),
    ships: new C.CustomDataSource("GeoPulse Ships"),
    trade: new C.CustomDataSource("GeoPulse Trade Corridors"),
    disasters: new C.CustomDataSource("GeoPulse Disasters"),
    earthquakes: new C.CustomDataSource("GeoPulse Earthquakes"),
    conflicts: new C.CustomDataSource("GeoPulse Conflict Reporting"),
    majorEvents: new C.CustomDataSource("GeoPulse Major Events"),
    search: new C.CustomDataSource("GeoPulse Search")
  };

  const basemaps = {
    satellite: {
      label: "SATELLITE",
      url: "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer"
    },
    streets: {
      label: "STREETS",
      url: "https://services.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer"
    },
    topo: {
      label: "TOPOGRAPHIC",
      url: "https://services.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer"
    }
  };

  const tradeRoutes = [
    { name: "North Atlantic Eastbound", points: [-74.01,40.71,-40.0,45.0,-9.14,38.72,4.48,51.92] },
    { name: "North Atlantic Westbound", points: [4.48,51.92,-15.0,49.0,-45.0,42.0,-74.01,40.71] },
    { name: "US Gulf-Europe", points: [-95.27,29.31,-80.1,25.7,-40.0,36.0,-9.14,38.72,4.48,51.92] },
    { name: "US East-Panama", points: [-74.01,40.71,-79.9,25.5,-79.52,9.01] },
    { name: "Panama-US West", points: [-79.52,9.01,-95.0,10.0,-118.24,33.74,-122.33,47.60] },
    { name: "Panama-East Asia", points: [-79.52,9.01,-118.24,33.74,-155.0,24.0,139.69,35.68,121.47,31.23] },
    { name: "Trans-Pacific North", points: [-122.33,47.60,-160.0,43.0,170.0,42.0,139.69,35.68,121.47,31.23] },
    { name: "Trans-Pacific South", points: [-118.24,33.74,-155.0,21.3,170.0,20.0,151.21,-33.87] },
    { name: "China-US West", points: [121.47,31.23,145.0,35.0,175.0,38.0,-150.0,40.0,-122.33,47.60] },
    { name: "Japan-US West", points: [139.69,35.68,170.0,40.0,-150.0,42.0,-122.33,47.60] },
    { name: "Korea-US West", points: [129.08,35.18,165.0,40.0,-150.0,41.0,-122.33,47.60] },
    { name: "China-Singapore", points: [121.47,31.23,114.17,22.32,103.82,1.35] },
    { name: "Japan-Singapore", points: [139.69,35.68,126.0,22.0,103.82,1.35] },
    { name: "Singapore-Suez", points: [103.82,1.35,80.27,13.08,72.88,19.08,55.27,25.20,43.15,12.80,32.55,29.97] },
    { name: "Suez-North Europe", points: [32.55,29.97,14.27,37.98,-5.6,35.9,-9.14,38.72,4.48,51.92] },
    { name: "Persian Gulf-Europe", points: [55.27,25.20,43.15,12.80,32.55,29.97,14.27,37.98,-9.14,38.72,4.48,51.92] },
    { name: "Persian Gulf-Asia", points: [55.27,25.20,72.88,19.08,80.27,13.08,103.82,1.35,121.47,31.23] },
    { name: "India-Singapore", points: [72.88,19.08,80.27,13.08,95.0,6.0,103.82,1.35] },
    { name: "India-Europe", points: [72.88,19.08,55.27,25.20,43.15,12.80,32.55,29.97,14.27,37.98,-9.14,38.72] },
    { name: "Cape of Good Hope Asia-Europe", points: [103.82,1.35,80.0,-5.0,55.0,-20.0,18.42,-33.93,-5.0,-20.0,-9.14,38.72] },
    { name: "West Africa-Europe", points: [3.38,6.45,-5.0,15.0,-9.14,38.72,4.48,51.92] },
    { name: "West Africa-US Gulf", points: [3.38,6.45,-20.0,10.0,-50.0,18.0,-80.0,25.0,-95.27,29.31] },
    { name: "Brazil-Europe", points: [-46.33,-23.96,-28.64,38.53,-9.14,38.72,4.48,51.92] },
    { name: "Brazil-US East", points: [-46.33,-23.96,-35.0,-5.0,-55.0,20.0,-74.01,40.71] },
    { name: "Chile-Asia Pacific", points: [-71.63,-33.03,-120.0,-30.0,-160.0,-20.0,170.0,-15.0,151.21,-33.87] },
    { name: "Australia-Singapore", points: [151.21,-33.87,115.86,-31.95,103.82,1.35] },
    { name: "Australia-China", points: [151.21,-33.87,130.0,-15.0,114.17,22.32,121.47,31.23] },
    { name: "Australia-Japan", points: [151.21,-33.87,145.0,-10.0,139.69,35.68] },
    { name: "New Zealand-Asia", points: [174.76,-36.85,160.0,-20.0,130.0,0.0,103.82,1.35] },
    { name: "Mediterranean West-East", points: [-5.6,35.9,2.17,41.38,9.0,39.0,14.27,37.98,24.0,35.0,32.55,29.97] },
    { name: "Black Sea-Mediterranean", points: [29.0,41.0,26.0,40.0,24.0,37.0,14.27,37.98,-5.6,35.9] },
    { name: "Baltic-North Sea", points: [18.07,59.33,12.57,55.68,8.0,56.0,4.48,51.92] }
  ];

  const flyTargets = {
    world: [-20, 20, 21500000],
    americas: [-85, 23, 11000000],
    europe: [13, 49, 6500000],
    asia: [103, 28, 9200000]
  };

  const TYPE_LABELS = {
    earthquake: "EARTHQUAKE",
    disaster: "DISASTER",
    conflict: "CONFLICT REPORTING",
    majorEvent: "MAJOR EVENT"
  };

  const DATA_CREDITS = [
    'Flights: <a href="https://opensky-network.org" target="_blank" rel="noopener">OpenSky Network</a> + <a href="https://adsb.lol" target="_blank" rel="noopener">adsb.lol</a> (ODbL fallback)',
    'Satellites: <a href="https://celestrak.org" target="_blank" rel="noopener">CelesTrak</a> + SGP4 propagation',
    'Earthquakes: data courtesy of the <a href="https://earthquake.usgs.gov" target="_blank" rel="noopener">U.S. Geological Survey</a>',
    'Natural events: <a href="https://eonet.gsfc.nasa.gov" target="_blank" rel="noopener">NASA EONET</a>',
    'Disaster alerts: <a href="https://www.gdacs.org" target="_blank" rel="noopener">GDACS</a>',
    'Conflict-related reporting: <a href="https://www.gdeltproject.org" target="_blank" rel="noopener">GDELT Project</a>',
    'Live vessels: <a href="https://aisstream.io" target="_blank" rel="noopener">AISStream</a>',
    'Major scheduled events: <a href="https://developer.ticketmaster.com" target="_blank" rel="noopener">Ticketmaster Discovery</a>',
    'Keyless place search fallback: <a href="https://photon.komoot.io" target="_blank" rel="noopener">Photon</a> over <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap contributors</a>'
  ];

  function registerDataCredits() {
    const display = viewer && viewer.creditDisplay;
    if (!display || typeof display.addStaticCredit !== "function") return;
    DATA_CREDITS.forEach((html) => display.addStaticCredit(new C.Credit(html, false)));
  }

  function setProgress(value, message) {
    const v = Math.max(0, Math.min(100, Math.round(value)));
    progressBar.style.width = v + "%";
    progressPercent.textContent = v + "%";
    if (message) progressMessage.textContent = message;
  }

  function setHealth(id, state) {
    const node = $(id);
    if (!node) return;
    node.classList.remove("good", "bad", "warn");
    if (state) node.classList.add(state === true ? "good" : state);
  }

  function setStatus(id, text) {
    const node = $(id);
    if (node) node.textContent = text;
  }

  function formatAge(timestamp) {
    const t = Number(timestamp);
    if (!Number.isFinite(t)) return "recent";
    const age = Math.max(0, Date.now() - t);
    if (age < 60000) return Math.max(1, Math.floor(age / 1000)) + "s ago";
    if (age < 3600000) return Math.floor(age / 60000) + "m ago";
    if (age < 86400000) return Math.floor(age / 3600000) + "h ago";
    return Math.floor(age / 86400000) + "d ago";
  }

  function formatScheduled(timestamp) {
    const t = Number(timestamp);
    if (!Number.isFinite(t)) return "scheduled";
    return new Intl.DateTimeFormat(undefined, {
      month: "short", day: "numeric", hour: "numeric", minute: "2-digit"
    }).format(new Date(t));
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function showNotice(message, duration = 4000) {
    const node = $("searchNotice");
    node.textContent = message;
    node.hidden = false;
    clearTimeout(showNotice.timer);
    showNotice.timer = setTimeout(() => { node.hidden = true; }, duration);
  }

  async function setBasemap(style) {
    const config = basemaps[style] || basemaps.satellite;
    try {
      const provider = await C.ArcGisMapServerImageryProvider.fromUrl(config.url);
      viewer.imageryLayers.removeAll();
      const layer = viewer.imageryLayers.addImageryProvider(provider);
      if (style === "satellite") {
        layer.brightness = 0.83;
        layer.contrast = 1.05;
      }
      currentBasemap = style;
      $("viewStatus").textContent = config.label + " MAP · LIVE LAYERS";
    } catch (error) {
      console.warn("Basemap switch failed", error);
      showNotice("Map style could not load. Keeping the current map.");
    }
  }

  async function createViewer() {
    setProgress(10, "Starting detailed 3D Earth…");

    viewer = new C.Viewer("cesiumContainer", {
      baseLayer: false,
      animation: false,
      timeline: false,
      geocoder: false,
      homeButton: false,
      sceneModePicker: false,
      baseLayerPicker: false,
      navigationHelpButton: false,
      fullscreenButton: false,
      infoBox: false,
      selectionIndicator: false,
      requestRenderMode: false,
      shouldAnimate: true
    });

    viewer.scene.globe.baseColor = C.Color.fromCssColorString("#03111f");
    viewer.scene.globe.showGroundAtmosphere = true;
    viewer.scene.globe.enableLighting = true;
    viewer.scene.skyAtmosphere.show = true;
    viewer.scene.fog.enabled = true;
    viewer.scene.backgroundColor = C.Color.fromCssColorString("#01060d");

    Object.values(layers).forEach((source) => viewer.dataSources.add(source));
    satellitePoints = viewer.scene.primitives.add(new C.PointPrimitiveCollection());
    registerDataCredits();
    await setBasemap("satellite");

    viewer.camera.setView({ destination: C.Cartesian3.fromDegrees(-20, 22, 21000000) });
    setProgress(24, "Building global command center…");
  }

  function addTradeRoutes() {
    layers.trade.entities.removeAll();
    tradeRoutes.forEach((route, index) => {
      const color = index % 2 === 0
        ? C.Color.fromCssColorString("#38ebff")
        : C.Color.fromCssColorString("#178bff");
      layers.trade.entities.add({
        id: "trade-" + index,
        name: route.name,
        polyline: {
          positions: C.Cartesian3.fromDegreesArray(route.points),
          width: 2.0,
          arcType: C.ArcType.GEODESIC,
          material: new C.PolylineGlowMaterialProperty({
            glowPower: 0.15,
            taperPower: 0.9,
            color: color.withAlpha(0.72)
          })
        }
      });
    });
    setStatus("tradeStatus", tradeRoutes.length + " major global corridors");
  }

  function quakeColor(magnitude) {
    if (magnitude >= 6) return C.Color.fromCssColorString("#ff4d67");
    if (magnitude >= 4.5) return C.Color.fromCssColorString("#ff9d55");
    if (magnitude >= 3) return C.Color.fromCssColorString("#ffe66b");
    return C.Color.fromCssColorString("#54e8ff");
  }

  async function loadEarthquakes() {
    try {
      const response = await fetch("https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson", { cache: "no-store" });
      if (!response.ok) throw new Error("USGS HTTP " + response.status);
      const data = await response.json();

      layers.earthquakes.entities.removeAll();
      feedItems = feedItems.filter((item) => item.type !== "earthquake");

      (data.features || []).forEach((feature) => {
        const coords = feature.geometry && feature.geometry.coordinates;
        if (!coords || coords.length < 2) return;
        const lon = Number(coords[0]);
        const lat = Number(coords[1]);
        const depthKm = Number(coords[2] || 0);
        const mag = Number(feature.properties.mag || 0);
        const time = Number(feature.properties.time || Date.now());
        const title = feature.properties.place || "Earthquake";

        layers.earthquakes.entities.add({
          id: "quake-" + feature.id,
          name: "M" + mag.toFixed(1) + " · " + title,
          position: C.Cartesian3.fromDegrees(lon, lat, Math.max(5000, mag * 2800)),
          point: {
            pixelSize: Math.max(5, Math.min(18, 5 + mag * 1.65)),
            color: quakeColor(mag).withAlpha(0.9),
            outlineColor: C.Color.WHITE.withAlpha(0.55),
            outlineWidth: 1,
            disableDepthTestDistance: Number.POSITIVE_INFINITY
          }
        });

        feedItems.push({
          type: "earthquake",
          title: "M" + mag.toFixed(1) + " · " + title,
          source: "USGS Earthquake Hazards Program",
          time,
          sortTime: time,
          lat,
          lon,
          altitude: 1700000,
          detail: "Depth " + depthKm.toFixed(0) + " km"
        });
      });

      const count = (data.features || []).length;
      setStatus("earthquakesStatus", count.toLocaleString() + " in last 24h");
      setHealth("usgsHealth", "good");
      renderFeed();
      return true;
    } catch (error) {
      console.error(error);
      setStatus("earthquakesStatus", "Source unavailable");
      setHealth("usgsHealth", "bad");
      return false;
    }
  }

  function findPointGeometry(event) {
    const geometries = Array.isArray(event.geometry) ? event.geometry : [];
    for (let i = geometries.length - 1; i >= 0; i -= 1) {
      const geometry = geometries[i];
      if (geometry && geometry.type === "Point" && Array.isArray(geometry.coordinates)) return geometry;
    }
    return null;
  }

  function disasterStyle(category, alertLevel) {
    const text = String(category || "").toLowerCase();
    const alert = String(alertLevel || "").toLowerCase();
    if (alert === "red") return { color: "#ff5067", size: 13 };
    if (alert === "orange") return { color: "#ff9b50", size: 11 };
    if (text.includes("wildfire") || text.includes("fire")) return { color: "#ff7a45", size: 9 };
    if (text.includes("volcano")) return { color: "#ffbf5b", size: 10 };
    if (text.includes("storm") || text.includes("cyclone")) return { color: "#a373ff", size: 10 };
    if (text.includes("flood")) return { color: "#4ea9ff", size: 10 };
    if (text.includes("landslide")) return { color: "#d9a96f", size: 9 };
    return { color: "#64ffc7", size: 8 };
  }

  function addDisasterPoint(id, title, category, lat, lon, when, source, detail, alertLevel) {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
    const style = disasterStyle(category, alertLevel);
    layers.disasters.entities.add({
      id,
      name: title,
      position: C.Cartesian3.fromDegrees(lon, lat, 9000),
      point: {
        pixelSize: style.size,
        color: C.Color.fromCssColorString(style.color).withAlpha(0.88),
        outlineColor: C.Color.WHITE.withAlpha(0.55),
        outlineWidth: 1,
        disableDepthTestDistance: Number.POSITIVE_INFINITY
      }
    });
    feedItems.push({
      type: "disaster",
      title,
      source,
      time: Number.isFinite(when) ? when : Date.now(),
      sortTime: Number.isFinite(when) ? when : Date.now(),
      lat,
      lon,
      altitude: 2200000,
      detail: detail || category
    });
    return true;
  }

  async function loadDisasters() {
    layers.disasters.entities.removeAll();
    feedItems = feedItems.filter((item) => item.type !== "disaster");
    let total = 0;
    let okCount = 0;

    try {
      const response = await fetch("https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=160", { cache: "no-store" });
      if (!response.ok) throw new Error("EONET HTTP " + response.status);
      const data = await response.json();

      (data.events || []).forEach((event) => {
        const geometry = findPointGeometry(event);
        if (!geometry) return;
        const lon = Number(geometry.coordinates[0]);
        const lat = Number(geometry.coordinates[1]);
        const category = (event.categories || []).map((c) => c.title).join(", ") || "Natural event";
        if (/earthquake|seismic/i.test(category)) return;
        const when = geometry.date ? Date.parse(geometry.date) : Date.now();
        if (addDisasterPoint(
          "eonet-" + event.id, event.title, category, lat, lon, when,
          "NASA EONET · " + category, "Open natural event", ""
        )) total += 1;
      });
      okCount += 1;
    } catch (error) {
      console.warn("NASA EONET unavailable", error);
    }

    try {
      const response = await fetch("/.netlify/functions/disasters", { cache: "no-store" });
      if (!response.ok) throw new Error("GDACS proxy HTTP " + response.status);
      const data = await response.json();
      (data.events || []).forEach((event, index) => {
        const eventType = String(event.type || "");
        if (/^(EQ|EARTHQUAKE)$/i.test(eventType) || /earthquake|seismic/i.test(String(event.name || ""))) return;
        const when = event.fromDate ? Date.parse(event.fromDate) : Date.parse(data.fetchedAt);
        const title = [event.name, event.country].filter(Boolean).join(" · ");
        if (addDisasterPoint(
          "gdacs-" + (event.id || index), title || "GDACS alert", event.type,
          Number(event.latitude), Number(event.longitude), when,
          "GDACS · " + String(event.alertLevel || "alert").toUpperCase(),
          event.severity || event.type, event.alertLevel
        )) total += 1;
      });
      okCount += 1;
    } catch (error) {
      console.warn("GDACS unavailable", error);
    }

    $("disasterCount").textContent = total.toLocaleString();
    setStatus("disastersStatus", total ? total.toLocaleString() + " mapped alerts/events" : "Sources unavailable");
    setHealth("disasterHealth", okCount === 2 ? "good" : okCount === 1 ? "warn" : "bad");
    renderFeed();
    return okCount > 0;
  }

  const planeSvg = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><path fill="#7df5ff" stroke="#061522" stroke-width="1.2" d="M16 1l3 10 9 5v3l-9-2-2 10 4 2v2l-5-1-5 1v-2l4-2-2-10-9 2v-3l9-5z"/></svg>'
  );

  function getViewAnchor() {
    if (!viewer) return null;
    try {
      const canvas = viewer.scene.canvas;
      const center = new C.Cartesian2(canvas.clientWidth / 2, canvas.clientHeight / 2);
      const hit = viewer.camera.pickEllipsoid(center, viewer.scene.globe.ellipsoid);
      if (!hit) return null;
      const geo = C.Cartographic.fromCartesian(hit);
      return { lat: C.Math.toDegrees(geo.latitude), lon: C.Math.toDegrees(geo.longitude) };
    } catch {
      return null;
    }
  }

  async function loadFlights(silent = false) {
    try {
      if (!silent) setStatus("flightsStatus", "Connecting…");
      const bounds = getCameraBounds();
      const anchor = getViewAnchor();
      const qs = new URLSearchParams();
      let scope = "global";
      if (anchor) {
        qs.set("lat", anchor.lat.toFixed(4));
        qs.set("lon", anchor.lon.toFixed(4));
      }
      if (bounds && bounds.width <= 120 && bounds.height <= 80) {
        qs.set("lamin", bounds.south.toFixed(4));
        qs.set("lomin", bounds.west.toFixed(4));
        qs.set("lamax", bounds.north.toFixed(4));
        qs.set("lomax", bounds.east.toFixed(4));
        scope = "viewport";
      }
      const flightUrl = "/.netlify/functions/flights" + (qs.toString() ? "?" + qs.toString() : "");
      const response = await fetch(flightUrl, { cache: "no-store" });
      if (!response.ok) throw new Error("OpenSky proxy HTTP " + response.status);
      const data = await response.json();

      layers.flights.entities.removeAll();
      (data.aircraft || []).forEach((flight, index) => {
        if (!Number.isFinite(flight.latitude) || !Number.isFinite(flight.longitude)) return;
        const altitude = Number.isFinite(flight.geoAltitude)
          ? Math.max(120, flight.geoAltitude)
          : Number.isFinite(flight.baroAltitude) ? Math.max(120, flight.baroAltitude) : 1000;

        layers.flights.entities.add({
          id: "flight-" + (flight.icao24 || index),
          name: (flight.callsign || flight.icao24 || "Aircraft").trim(),
          position: C.Cartesian3.fromDegrees(flight.longitude, flight.latitude, altitude),
          billboard: {
            image: planeSvg, width: 16, height: 16,
            rotation: C.Math.toRadians(-Number(flight.track || 0)),
            alignedAxis: C.Cartesian3.ZERO,
            disableDepthTestDistance: 9000000,
            distanceDisplayCondition: new C.DistanceDisplayCondition(0, 15000000)
          }
        });
      });

      $("flightCount").textContent = Number(data.count || 0).toLocaleString();
      const sourceName = data.source || "Aircraft source";
      const coverage = data.coverage || scope;
      setStatus("flightsStatus", Number(data.count || 0).toLocaleString() + " · " + sourceName + " · " + coverage);
      setHealth("openskyHealth", "good");
      return true;
    } catch (error) {
      if (!silent) console.warn("Aircraft source unavailable", error);
      setStatus("flightsStatus", "OpenSky unavailable / rate-limited");
      setHealth("openskyHealth", "bad");
      $("flightCount").textContent = "—";
      return false;
    }
  }

  function satellitePosition(record, date) {
    if (!S || !record.satrec) return null;
    try {
      const pv = S.propagate(record.satrec, date);
      if (!pv || !pv.position) return null;
      const gmst = S.gstime(date);
      const geo = S.eciToGeodetic(pv.position, gmst);
      return {
        lat: S.degreesLat(geo.latitude),
        lon: S.degreesLong(geo.longitude),
        height: Math.max(100000, Number(geo.height || 0) * 1000)
      };
    } catch {
      return null;
    }
  }

  function satelliteColor(name) {
    const n = String(name || "").toUpperCase();
    if (n.includes("STARLINK")) return C.Color.fromCssColorString("#43d9ff");
    if (n.includes("ONEWEB")) return C.Color.fromCssColorString("#b57aff");
    if (n.includes("GPS") || n.includes("NAVSTAR")) return C.Color.fromCssColorString("#65ffc7");
    if (n.includes("ISS")) return C.Color.WHITE;
    return C.Color.fromCssColorString("#79b8ff");
  }

  function updateSatellitePositions() {
    if (!satellitePoints || !satellitePoints.show || !satelliteRecords.length) return;
    const now = new Date();
    const batchSize = Math.min(4500, satelliteRecords.length);
    const start = satelliteBatchCursor % satelliteRecords.length;

    for (let offset = 0; offset < batchSize; offset += 1) {
      const index = (start + offset) % satelliteRecords.length;
      const record = satelliteRecords[index];
      const pos = satellitePosition(record, now);
      if (!pos || !record.point) continue;
      record.point.position = C.Cartesian3.fromDegrees(pos.lon, pos.lat, pos.height);
    }
    satelliteBatchCursor = (start + batchSize) % satelliteRecords.length;
  }

  async function loadSatellites() {
    if (!S || typeof S.twoline2satrec !== "function") {
      setStatus("satellitesStatus", "Propagation library unavailable");
      setHealth("celestrakHealth", "bad");
      return false;
    }

    try {
      setStatus("satellitesStatus", "Loading full ACTIVE catalog…");
      const response = await fetch("/.netlify/functions/satellites", { cache: "no-store" });
      if (!response.ok) throw new Error("CelesTrak proxy HTTP " + response.status);
      const data = await response.json();

      if (!satellitePoints) throw new Error("Satellite renderer unavailable");
      satellitePoints.removeAll();
      satelliteRecords = [];
      satelliteBatchCursor = 0;

      const now = new Date();
      (data.satellites || []).forEach((raw) => {
        try {
          const satrec = S.twoline2satrec(raw.l1, raw.l2);
          const record = { raw, satrec, point: null };
          const pos = satellitePosition(record, now);
          if (!pos) return;
          const name = String(raw.n || raw.id || "Satellite");
          const isIss = /ISS \(ZARYA\)|ISS/i.test(name);
          const point = satellitePoints.add({
            position: C.Cartesian3.fromDegrees(pos.lon, pos.lat, pos.height),
            pixelSize: isIss ? 7 : 2.5,
            color: satelliteColor(name).withAlpha(isIss ? 1 : 0.72),
            outlineColor: isIss ? C.Color.fromCssColorString("#22f0ff") : C.Color.TRANSPARENT,
            outlineWidth: isIss ? 2 : 0,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
            id: { type: "satellite", norad: raw.id, name }
          });
          record.point = point;
          satelliteRecords.push(record);
        } catch {}
      });

      satellitePoints.show = document.querySelector('.layer-toggle[data-layer="satellites"]')?.checked !== false;
      $("satelliteCount").textContent = satelliteRecords.length.toLocaleString();
      setStatus(
        "satellitesStatus",
        satelliteRecords.length.toLocaleString() + " ACTIVE · CelesTrak · TLE " + formatAge(Date.parse(data.fetchedAt))
      );
      setHealth("celestrakHealth", satelliteRecords.length > 1000 ? "good" : "warn");
      return true;
    } catch (error) {
      console.warn("Satellite source unavailable", error);
      setStatus("satellitesStatus", "CelesTrak ACTIVE unavailable");
      setHealth("celestrakHealth", "bad");
      $("satelliteCount").textContent = "—";
      return false;
    }
  }

  async function loadConflicts() {
    try {
      const response = await fetch("/.netlify/functions/conflicts", { cache: "no-store" });
      if (!response.ok) throw new Error("GDELT proxy HTTP " + response.status);
      const data = await response.json();

      layers.conflicts.entities.removeAll();
      feedItems = feedItems.filter((item) => item.type !== "conflict");
      const fetchedAt = Date.parse(data.fetchedAt) || Date.now();

      (data.reports || []).forEach((report, index) => {
        const lat = Number(report.latitude);
        const lon = Number(report.longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;

        layers.conflicts.entities.add({
          id: "conflict-" + (report.id || index),
          name: "Conflict-related reporting · " + (report.location || "reported location"),
          position: C.Cartesian3.fromDegrees(lon, lat, 12000),
          point: {
            pixelSize: Math.min(13, 6 + Math.log2(Math.max(1, Number(report.count || 1)))),
            color: C.Color.fromCssColorString("#c776ff").withAlpha(0.78),
            outlineColor: C.Color.WHITE.withAlpha(0.55),
            outlineWidth: 1,
            disableDepthTestDistance: Number.POSITIVE_INFINITY
          }
        });

        feedItems.push({
          type: "conflict",
          title: "Conflict-related reporting · " + (report.location || "reported location"),
          source: "GDELT GEO 2.0 · news coverage in the last " + (data.window || "2h"),
          time: fetchedAt,
          sortTime: fetchedAt - index,
          lat,
          lon,
          altitude: 1800000,
          detail: "News-location signal; not independently verified by GeoPulse"
        });
      });

      $("conflictCount").textContent = Number(data.count || 0).toLocaleString();
      setStatus("conflictsStatus", Number(data.count || 0).toLocaleString() + " geolocated news signals");
      setHealth("gdeltHealth", "good");
      renderFeed();
      return true;
    } catch (error) {
      console.warn("Conflict-reporting source unavailable", error);
      setStatus("conflictsStatus", "GDELT unavailable");
      setHealth("gdeltHealth", "bad");
      $("conflictCount").textContent = "—";
      return false;
    }
  }

  async function loadMajorEvents() {
    try {
      const response = await fetch("/.netlify/functions/events", { cache: "no-store" });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        if (response.status === 503) {
          setStatus("majorEventsStatus", "Add TICKETMASTER_API_KEY");
          setHealth("eventsHealth", "warn");
          $("majorEventCount").textContent = "KEY";
          return false;
        }
        throw new Error(body.error || "Events proxy HTTP " + response.status);
      }
      const data = await response.json();

      layers.majorEvents.entities.removeAll();
      feedItems = feedItems.filter((item) => item.type !== "majorEvent");
      const fetchedAt = Date.parse(data.fetchedAt) || Date.now();

      (data.events || []).forEach((event, index) => {
        const lat = Number(event.latitude);
        const lon = Number(event.longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
        const scheduled = event.dateTime ? Date.parse(event.dateTime) : NaN;

        layers.majorEvents.entities.add({
          id: "major-" + event.id,
          name: event.name,
          position: C.Cartesian3.fromDegrees(lon, lat, 9000),
          point: {
            pixelSize: 8,
            color: C.Color.fromCssColorString("#50ffc0").withAlpha(0.86),
            outlineColor: C.Color.WHITE.withAlpha(0.6),
            outlineWidth: 1,
            disableDepthTestDistance: Number.POSITIVE_INFINITY
          }
        });

        feedItems.push({
          type: "majorEvent",
          title: event.name,
          source: "Ticketmaster Discovery · " + [event.category, event.venue, event.city].filter(Boolean).join(" · "),
          time: Number.isFinite(scheduled) ? scheduled : fetchedAt,
          sortTime: fetchedAt - index,
          lat,
          lon,
          altitude: 950000,
          detail: Number.isFinite(scheduled) ? "Scheduled " + formatScheduled(scheduled) : "Scheduled event"
        });
      });

      $("majorEventCount").textContent = Number(data.count || 0).toLocaleString();
      setStatus("majorEventsStatus", Number(data.count || 0).toLocaleString() + " upcoming mapped events");
      setHealth("eventsHealth", "good");
      renderFeed();
      return true;
    } catch (error) {
      console.warn("Major event source unavailable", error);
      setStatus("majorEventsStatus", "Events source unavailable");
      setHealth("eventsHealth", "bad");
      $("majorEventCount").textContent = "—";
      return false;
    }
  }

  const shipSvg = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><path fill="#50ffc0" stroke="#041a1a" stroke-width="1.2" d="M5 13h22l-2 10c-3 4-15 4-18 0L5 13zm5-7h12v7H10V6zm3-4h6v4h-6V2z"/></svg>'
  );

  function getCameraBounds() {
    if (!viewer) return null;
    const rect = viewer.camera.computeViewRectangle(viewer.scene.globe.ellipsoid);
    if (!rect) return null;
    const north = C.Math.toDegrees(rect.north);
    const south = C.Math.toDegrees(rect.south);
    let west = C.Math.toDegrees(rect.west);
    let east = C.Math.toDegrees(rect.east);
    if (east < west) return null;
    return { north, south, west, east, width: east - west, height: north - south };
  }

  async function loadShips(silent = false) {
    const toggle = document.querySelector('.layer-toggle[data-layer="ships"]');
    if (!toggle || !toggle.checked) return false;

    const bounds = getCameraBounds();
    if (!bounds || bounds.width > 95 || bounds.height > 60) {
      setStatus("shipsStatus", "Zoom in to load live AIS ships");
      if (!silent) showNotice("Live ships load for the area you are viewing. Zoom in closer to an ocean or coast.");
      return false;
    }

    try {
      if (!silent) setStatus("shipsStatus", "Collecting live AIS snapshot…");
      const qs = new URLSearchParams({
        north: bounds.north.toFixed(4),
        south: bounds.south.toFixed(4),
        west: bounds.west.toFixed(4),
        east: bounds.east.toFixed(4)
      });
      const response = await fetch("/.netlify/functions/ships?" + qs, { cache: "no-store" });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        if (response.status === 503) {
          setStatus("shipsStatus", "KEY REQUIRED · AISStream");
          setHealth("aisHealth", "warn");
          $("shipCount").textContent = "—";
          return false;
        }
        throw new Error(body.error || "AIS proxy HTTP " + response.status);
      }
      const data = await response.json();

      layers.ships.entities.removeAll();
      (data.ships || []).forEach((ship, index) => {
        const lat = Number(ship.latitude);
        const lon = Number(ship.longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
        layers.ships.entities.add({
          id: "ship-" + (ship.mmsi || index),
          name: ship.name || "AIS vessel",
          position: C.Cartesian3.fromDegrees(lon, lat, 5),
          billboard: {
            image: shipSvg,
            width: 16,
            height: 16,
            rotation: C.Math.toRadians(-Number(ship.course || 0)),
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
            distanceDisplayCondition: new C.DistanceDisplayCondition(0, 7000000)
          }
        });
      });

      $("shipCount").textContent = Number(data.count || 0).toLocaleString();
      setStatus("shipsStatus", Number(data.count || 0).toLocaleString() + " live AIS positions · " + formatAge(Date.parse(data.fetchedAt)));
      setHealth("aisHealth", "good");
      return true;
    } catch (error) {
      console.warn("AIS source unavailable", error);
      setStatus("shipsStatus", "AIS source unavailable");
      setHealth("aisHealth", "bad");
      $("shipCount").textContent = "—";
      return false;
    }
  }

  function renderFeed() {
    const feed = $("feed");
    const filtered = feedItems
      .filter((item) => feedFilter === "all" || item.type === feedFilter)
      .sort((a, b) => Number(b.sortTime || b.time || 0) - Number(a.sortTime || a.time || 0))
      .slice(0, 100);

    if (!filtered.length) {
      feed.innerHTML = '<div class="feed-empty">Waiting for live / latest global sources…</div>';
      return;
    }

    feed.innerHTML = filtered.map((item, index) => {
      const timeText = item.type === "majorEvent" ? formatScheduled(item.time) : formatAge(item.time);
      return '<button class="feed-card" type="button" data-feed-index="' + index + '">' +
        '<div class="feed-top"><span class="feed-type ' + escapeHtml(item.type) + '">' +
          escapeHtml(TYPE_LABELS[item.type] || "GLOBAL EVENT") +
        '</span><span class="feed-time">' + escapeHtml(timeText) + '</span></div>' +
        '<div class="feed-title">' + escapeHtml(item.title) + '</div>' +
        '<div class="feed-source">' + escapeHtml(item.source) + '</div>' +
        (item.detail ? '<div class="feed-detail">' + escapeHtml(item.detail) + '</div>' : '') +
      '</button>';
    }).join("");

    feed.querySelectorAll("[data-feed-index]").forEach((button) => {
      button.addEventListener("click", () => {
        const item = filtered[Number(button.dataset.feedIndex)];
        if (!item) return;
        viewer.camera.flyTo({
          destination: C.Cartesian3.fromDegrees(item.lon, item.lat, item.altitude || 1600000),
          duration: 1.6
        });
      });
    });
  }

  function updateCameraReadout() {
    if (!viewer) return;
    const cartographic = C.Cartographic.fromCartesian(viewer.camera.positionWC);
    const lat = C.Math.toDegrees(cartographic.latitude);
    const lon = C.Math.toDegrees(cartographic.longitude);
    const altitudeKm = cartographic.height / 1000;
    $("cameraReadout").textContent =
      "LAT " + lat.toFixed(3) + " · LON " + lon.toFixed(3) + " · ALT " +
      (altitudeKm >= 1000 ? (altitudeKm / 1000).toFixed(1) + "K KM" : altitudeKm.toFixed(0) + " KM");
  }

  function scheduleShipRefreshFromCamera() {
    clearTimeout(shipCameraTimer);
    clearTimeout(flightCameraTimer);
    shipCameraTimer = setTimeout(() => loadShips(true), 900);
  }

  function scheduleFlightRefreshFromCamera() {
    clearTimeout(flightCameraTimer);
    flightCameraTimer = setTimeout(() => {
      const toggle = document.querySelector('.layer-toggle[data-layer="flights"]');
      if (toggle && toggle.checked && navigator.onLine) loadFlights(true);
    }, 700);
  }

  function bindControls() {
    document.querySelectorAll(".layer-toggle[data-layer]").forEach((input) => {
      input.addEventListener("change", () => {
        const source = layers[input.dataset.layer];
        if (source) source.show = input.checked;
        if (input.dataset.layer === "satellites" && satellitePoints) satellitePoints.show = input.checked;
        if (input.dataset.layer === "ships" && input.checked) loadShips(false);
        if (input.dataset.layer === "majorEvents" && input.checked && !layers.majorEvents.entities.values.length) loadMajorEvents();
      });
    });

    $("toggleAll").addEventListener("click", () => {
      const toggles = Array.from(document.querySelectorAll(".layer-toggle[data-layer]"));
      const shouldEnable = toggles.some((input) => !input.checked);
      toggles.forEach((input) => {
        input.checked = shouldEnable;
        const source = layers[input.dataset.layer];
        if (source) source.show = shouldEnable;
        if (input.dataset.layer === "satellites" && satellitePoints) satellitePoints.show = shouldEnable;
      });
      $("toggleAll").textContent = shouldEnable ? "ALL ON" : "ALL OFF";
      if (shouldEnable) loadShips(true);
    });

    document.querySelectorAll(".filter-btn").forEach((button) => {
      button.addEventListener("click", () => {
        document.querySelectorAll(".filter-btn").forEach((b) => b.classList.remove("active"));
        button.classList.add("active");
        feedFilter = button.dataset.filter;
        renderFeed();
      });
    });

    document.querySelectorAll("[data-fly]").forEach((button) => {
      button.addEventListener("click", () => {
        const target = flyTargets[button.dataset.fly];
        viewer.camera.flyTo({
          destination: C.Cartesian3.fromDegrees(target[0], target[1], target[2]),
          duration: 1.5
        });
      });
    });

    $("mapStyle").addEventListener("change", (event) => setBasemap(event.target.value));
    $("searchButton").addEventListener("click", runSearch);

    const creditsModal = $("creditsModal");
    $("creditsButton").addEventListener("click", () => {
      creditsModal.hidden = false;
    });
    $("creditsClose").addEventListener("click", () => {
      creditsModal.hidden = true;
    });
    creditsModal.addEventListener("click", (event) => {
      if (event.target === creditsModal) creditsModal.hidden = true;
    });
    $("locationSearch").addEventListener("keydown", (event) => {
      if (event.key === "Enter") runSearch();
      if (event.key === "Escape") $("searchResults").hidden = true;
    });

    document.addEventListener("click", (event) => {
      if (!event.target.closest(".search-wrap")) $("searchResults").hidden = true;
    });

    viewer.camera.moveEnd.addEventListener(() => {
      updateCameraReadout();
      scheduleShipRefreshFromCamera();
      scheduleFlightRefreshFromCamera();
    });
    window.addEventListener("online", updateNetworkState);
    window.addEventListener("offline", updateNetworkState);
  }

  function flyToSearchResult(result) {
    layers.search.entities.removeAll();
    searchMarker = layers.search.entities.add({
      id: "search-marker",
      name: result.label,
      position: C.Cartesian3.fromDegrees(result.longitude, result.latitude, 10),
      point: {
        pixelSize: 13,
        color: C.Color.fromCssColorString("#42eeff"),
        outlineColor: C.Color.WHITE,
        outlineWidth: 2,
        disableDepthTestDistance: Number.POSITIVE_INFINITY
      }
    });

    viewer.camera.flyTo({
      destination: C.Cartesian3.fromDegrees(result.longitude, result.latitude, result.type === "PointAddress" ? 850 : 2200),
      duration: 1.8
    });
    $("searchResults").hidden = true;
    showNotice(result.label + (result.score ? " · match " + Math.round(result.score) + "%" : ""), 6000);
  }

  async function runSearch() {
    const input = $("locationSearch");
    const query = input.value.trim();
    if (!query) return;

    const coord = query.match(/^\s*(-?\d{1,2}(?:\.\d+)?)\s*[, ]\s*(-?\d{1,3}(?:\.\d+)?)\s*$/);
    if (coord) {
      const lat = Number(coord[1]);
      const lon = Number(coord[2]);
      if (lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
        flyToSearchResult({ label: lat.toFixed(6) + ", " + lon.toFixed(6), latitude: lat, longitude: lon, type: "Coordinates" });
        return;
      }
    }

    $("searchButton").textContent = "…";
    try {
      const response = await fetch("/.netlify/functions/search?q=" + encodeURIComponent(query), { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        showNotice(data.setup || data.error || "Search unavailable", 7000);
        return;
      }

      const results = Array.isArray(data.results) ? data.results : [];
      const panel = $("searchResults");
      if (!results.length) {
        showNotice("No matching address or place found.");
        panel.hidden = true;
        return;
      }

      panel.innerHTML = results.map((result, index) =>
        '<button class="search-result" type="button" data-search-index="' + index + '">' +
          '<b>' + escapeHtml(result.label) + '</b>' +
          '<small>' + escapeHtml((result.type || "Place") + " · " + (result.provider || data.source || "Search provider") + " · match " + Math.round(result.score || 0) + "%") + '</small>' +
        '</button>'
      ).join("");
      panel.hidden = false;

      panel.querySelectorAll("[data-search-index]").forEach((button) => {
        button.addEventListener("click", () => flyToSearchResult(results[Number(button.dataset.searchIndex)]));
      });
    } catch (error) {
      console.warn("Search failed", error);
      showNotice("Address search could not connect.");
    } finally {
      $("searchButton").textContent = "SEARCH";
    }
  }

  function updateNetworkState() {
    const online = navigator.onLine;
    if (!online) showNotice("Network offline — existing globe data remains visible.", 3500);
  }

  function startClock() {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || "Local";
    $("localZone").textContent = zone;
    const localTimeFormatter = new Intl.DateTimeFormat(undefined, {
      hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false
    });
    const localDateFormatter = new Intl.DateTimeFormat(undefined, {
      weekday: "short", month: "short", day: "numeric", year: "numeric"
    });
    const utcDateFormatter = new Intl.DateTimeFormat("en-US", {
      timeZone: "UTC", weekday: "short", month: "short", day: "numeric", year: "numeric"
    });

    const tick = () => {
      const now = new Date();
      $("utcClock").textContent = now.toISOString().slice(11, 19) + " UTC";
      $("utcDate").textContent = utcDateFormatter.format(now);
      $("localClock").textContent = localTimeFormatter.format(now);
      $("localDate").textContent = localDateFormatter.format(now);
    };
    tick();
    intervals.push(setInterval(tick, 1000));
  }

  function startRefreshLoops() {
    intervals.push(setInterval(() => {
      const t = document.querySelector('.layer-toggle[data-layer="flights"]');
      if (!document.hidden && navigator.onLine && t && t.checked) loadFlights(true);
    }, 30000));

    intervals.push(setInterval(() => {
      if (!document.hidden) updateSatellitePositions();
    }, 1000));

    intervals.push(setInterval(() => {
      const t = document.querySelector('.layer-toggle[data-layer="ships"]');
      if (!document.hidden && navigator.onLine && t && t.checked) loadShips(true);
    }, 60000));

    intervals.push(setInterval(() => {
      if (!document.hidden && navigator.onLine) loadDisasters();
    }, 5 * 60 * 1000));

    intervals.push(setInterval(() => {
      if (!document.hidden && navigator.onLine) loadConflicts();
    }, 10 * 60 * 1000));

    intervals.push(setInterval(() => {
      if (!document.hidden && navigator.onLine) loadEarthquakes();
    }, 5 * 60 * 1000));

    intervals.push(setInterval(() => {
      if (!document.hidden && navigator.onLine) loadMajorEvents();
    }, 15 * 60 * 1000));

    intervals.push(setInterval(() => {
      if (!document.hidden && navigator.onLine) loadSatellites();
    }, 2 * 60 * 60 * 1000));
  }

  async function start() {
    if (!C) {
      progressMessage.textContent = "Cesium failed to load.";
      return;
    }

    try {
      setProgress(4, "Booting GeoPulse v0.4…");
      await createViewer();
      addTradeRoutes();
      bindControls();
      startClock();
      updateCameraReadout();

      setProgress(34, "Connecting aircraft and orbital systems…");
      const flightPromise = loadFlights(false);
      const satPromise = loadSatellites();

      setProgress(48, "Connecting global disaster systems…");
      const quakePromise = loadEarthquakes();
      const disasterPromise = loadDisasters();

      setProgress(63, "Connecting global reporting and event systems…");
      const conflictPromise = loadConflicts();
      const eventPromise = loadMajorEvents();

      await Promise.allSettled([flightPromise, satPromise, quakePromise, disasterPromise, conflictPromise, eventPromise]);
      setProgress(90, "Synchronizing clocks and live layers…");

      startRefreshLoops();
      $("lastRefresh").textContent = "Core sync " + new Date().toLocaleTimeString();

      setTimeout(() => {
        setProgress(100, "GeoPulse v0.4 online");
        app.classList.add("ready");
        app.setAttribute("aria-hidden", "false");
        setTimeout(() => loadingScreen.classList.add("done"), 420);
      }, 350);
    } catch (error) {
      console.error("GeoPulse startup failure", error);
      setProgress(100, "Started with limited functionality");
      app.classList.add("ready");
      app.setAttribute("aria-hidden", "false");
      setTimeout(() => loadingScreen.classList.add("done"), 700);
    }
  }

  window.addEventListener("beforeunload", () => {
    intervals.forEach((id) => clearInterval(id));
    clearTimeout(shipCameraTimer);
  });

  start();
})();