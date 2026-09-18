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
  let searchMarker;
  let shipCameraTimer;
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
    { name: "Trans-Pacific", points: [-122.33, 47.60, -157.85, 21.30, 139.69, 35.68, 121.47, 31.23] },
    { name: "Asia-Europe via Suez", points: [121.47, 31.23, 103.82, 1.35, 80.27, 13.08, 43.15, 12.80, 32.55, 29.97, 14.27, 37.98, 4.48, 51.92] },
    { name: "North Atlantic", points: [-74.01, 40.71, -25.67, 37.74, -9.14, 38.72, 4.48, 51.92] },
    { name: "Panama Connector", points: [-74.01, 40.71, -79.52, 9.01, -118.24, 33.74] },
    { name: "South America-Europe", points: [-46.33, -23.96, -28.64, 38.53, -9.14, 38.72, 4.48, 51.92] },
    { name: "Cape Route", points: [103.82, 1.35, 80.27, 13.08, 18.42, -33.93, -9.14, 38.72] },
    { name: "Indian Ocean", points: [55.27, 25.20, 72.88, 19.08, 80.27, 13.08, 103.82, 1.35] },
    { name: "Australia-Asia", points: [151.21, -33.87, 115.86, -31.95, 103.82, 1.35, 121.47, 31.23] }
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

  async function loadFlights(silent = false) {
    try {
      if (!silent) setStatus("flightsStatus", "Connecting…");
      const response = await fetch("/.netlify/functions/flights", { cache: "no-store" });
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
      setStatus("flightsStatus", Number(data.count || 0).toLocaleString() + " received · " + formatAge(Date.parse(data.fetchedAt)));
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

  function updateSatellitePositions() {
    if (!layers.satellites.show || !satelliteRecords.length) return;
    const now = new Date();
    satelliteRecords.forEach((record) => {
      const pos = satellitePosition(record, now);
      if (!pos || !record.entity) return;
      record.entity.position = C.Cartesian3.fromDegrees(pos.lon, pos.lat, pos.height);
    });
  }

  async function loadSatellites() {
    if (!S || typeof S.json2satrec !== "function") {
      setStatus("satellitesStatus", "Propagation library unavailable");
      setHealth("celestrakHealth", "bad");
      return false;
    }

    try {
      const response = await fetch("/.netlify/functions/satellites", { cache: "no-store" });
      if (!response.ok) throw new Error("CelesTrak proxy HTTP " + response.status);
      const data = await response.json();

      layers.satellites.entities.removeAll();
      satelliteRecords = [];

      (data.satellites || []).forEach((raw, index) => {
        try {
          const satrec = S.json2satrec(raw);
          const record = { raw, satrec, entity: null };
          const pos = satellitePosition(record, new Date());
          if (!pos) return;
          const name = String(raw.OBJECT_NAME || "Satellite");
          const isStation = String(raw._group || "").toUpperCase() === "STATIONS" || /ISS/i.test(name);
          const entity = layers.satellites.entities.add({
            id: "sat-" + (raw.NORAD_CAT_ID || index),
            name,
            position: C.Cartesian3.fromDegrees(pos.lon, pos.lat, pos.height),
            point: {
              pixelSize: isStation ? 7 : 3.5,
              color: isStation
                ? C.Color.fromCssColorString("#ffffff")
                : C.Color.fromCssColorString("#73cfff"),
              outlineColor: C.Color.fromCssColorString("#1fe6ff").withAlpha(0.7),
              outlineWidth: isStation ? 2 : 1,
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
              distanceDisplayCondition: new C.DistanceDisplayCondition(0, 30000000)
            }
          });
          record.entity = entity;
          satelliteRecords.push(record);
        } catch {}
      });

      updateSatellitePositions();
      $("satelliteCount").textContent = satelliteRecords.length.toLocaleString();
      setStatus("satellitesStatus", satelliteRecords.length.toLocaleString() + " propagated · orbital data " + formatAge(Date.parse(data.fetchedAt)));
      setHealth("celestrakHealth", "good");
      return true;
    } catch (error) {
      console.warn("Satellite source unavailable", error);
      setStatus("satellitesStatus", "CelesTrak unavailable");
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
          setStatus("shipsStatus", "Add AISSTREAM_API_KEY");
          setHealth("aisHealth", "warn");
          $("shipCount").textContent = "KEY";
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
    shipCameraTimer = setTimeout(() => loadShips(true), 900);
  }

  function bindControls() {
    document.querySelectorAll(".layer-toggle[data-layer]").forEach((input) => {
      input.addEventListener("change", () => {
        const source = layers[input.dataset.layer];
        if (source) source.show = input.checked;
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
          '<small>' + escapeHtml((result.type || "Place") + " · match " + Math.round(result.score || 0) + "%") + '</small>' +
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
      setProgress(4, "Booting GeoPulse v0.3…");
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
        setProgress(100, "GeoPulse v0.3 online");
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