(() => {
  "use strict";

  const C = window.Cesium;
  const $ = (id) => document.getElementById(id);
  const progressBar = $("loadingProgress");
  const progressPercent = $("loadingPercent");
  const progressMessage = $("loadingMessage");
  const app = $("app");
  const loadingScreen = $("loadingScreen");

  let viewer;
  let feedFilter = "all";
  let feedItems = [];
  let flightRefreshTimer;

  const layers = {
    flights: new C.CustomDataSource("GeoPulse Aircraft"),
    trade: new C.CustomDataSource("GeoPulse Trade Corridors"),
    earthquakes: new C.CustomDataSource("GeoPulse Earthquakes"),
    events: new C.CustomDataSource("GeoPulse Natural Events")
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

  function setProgress(value, message) {
    const v = Math.max(0, Math.min(100, Math.round(value)));
    progressBar.style.width = v + "%";
    progressPercent.textContent = v + "%";
    if (message) progressMessage.textContent = message;
  }

  function setHealth(id, ok) {
    const node = $(id);
    node.classList.remove("good", "bad");
    node.classList.add(ok ? "good" : "bad");
  }

  function setStatus(id, text) {
    const node = $(id);
    if (node) node.textContent = text;
  }

  function formatAge(timestamp) {
    const age = Math.max(0, Date.now() - timestamp);
    if (age < 60000) return Math.max(1, Math.floor(age / 1000)) + "s ago";
    if (age < 3600000) return Math.floor(age / 60000) + "m ago";
    if (age < 86400000) return Math.floor(age / 3600000) + "h ago";
    return Math.floor(age / 86400000) + "d ago";
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  async function createViewer() {
    setProgress(12, "Starting 3D Earth…");

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
    viewer.scene.fog.enabled = true;
    viewer.scene.skyAtmosphere.show = true;
    viewer.scene.globe.enableLighting = true;
    viewer.scene.backgroundColor = C.Color.fromCssColorString("#01060d");

    try {
      const imagery = await C.ArcGisMapServerImageryProvider.fromUrl(
        "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer"
      );
      viewer.imageryLayers.addImageryProvider(imagery);
    } catch (error) {
      console.warn("Satellite imagery provider unavailable, using Natural Earth fallback.", error);
      const fallback = await C.TileMapServiceImageryProvider.fromUrl(
        C.buildModuleUrl("Assets/Textures/NaturalEarthII")
      );
      viewer.imageryLayers.addImageryProvider(fallback);
    }

    Object.values(layers).forEach((source) => viewer.dataSources.add(source));

    viewer.camera.setView({
      destination: C.Cartesian3.fromDegrees(-20, 22, 21000000)
    });

    setProgress(31, "Drawing global layers…");
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
          width: 2.1,
          arcType: C.ArcType.GEODESIC,
          material: new C.PolylineGlowMaterialProperty({
            glowPower: 0.18,
            taperPower: 0.9,
            color: color.withAlpha(0.82)
          })
        }
      });
    });

    $("routeCount").textContent = tradeRoutes.length.toLocaleString();
  }

  function quakeColor(magnitude) {
    if (magnitude >= 6) return C.Color.fromCssColorString("#ff4d67");
    if (magnitude >= 4.5) return C.Color.fromCssColorString("#ffb347");
    if (magnitude >= 3) return C.Color.fromCssColorString("#ffe66b");
    return C.Color.fromCssColorString("#54e8ff");
  }

  async function loadEarthquakes() {
    try {
      const response = await fetch("https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson", {
        cache: "no-store"
      });
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
          position: C.Cartesian3.fromDegrees(lon, lat, Math.max(6000, mag * 3500)),
          point: {
            pixelSize: Math.max(5, Math.min(18, 5 + mag * 1.7)),
            color: quakeColor(mag).withAlpha(0.86),
            outlineColor: C.Color.WHITE.withAlpha(0.65),
            outlineWidth: 1,
            disableDepthTestDistance: Number.POSITIVE_INFINITY
          }
        });

        feedItems.push({
          type: "earthquake",
          title: "M" + mag.toFixed(1) + " · " + title,
          source: "USGS",
          time: time,
          lat: lat,
          lon: lon,
          altitude: 1800000,
          detail: "Depth " + depthKm.toFixed(0) + " km"
        });
      });

      $("quakeCount").textContent = (data.features || []).length.toLocaleString();
      const generated = data.metadata && data.metadata.generated ? Number(data.metadata.generated) : Date.now();
      setStatus("earthquakesStatus", "Updated " + formatAge(generated));
      setHealth("usgsHealth", true);
      renderFeed();
      return true;
    } catch (error) {
      console.error(error);
      setStatus("earthquakesStatus", "Source unavailable");
      setHealth("usgsHealth", false);
      return false;
    }
  }

  function findPointGeometry(event) {
    const geometries = Array.isArray(event.geometry) ? event.geometry : [];
    for (let i = geometries.length - 1; i >= 0; i -= 1) {
      const geometry = geometries[i];
      if (geometry && geometry.type === "Point" && Array.isArray(geometry.coordinates)) {
        return geometry;
      }
    }
    return null;
  }

  async function loadNaturalEvents() {
    try {
      const response = await fetch("https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=100", {
        cache: "no-store"
      });
      if (!response.ok) throw new Error("EONET HTTP " + response.status);
      const data = await response.json();

      layers.events.entities.removeAll();
      feedItems = feedItems.filter((item) => item.type !== "event");

      let mapped = 0;
      (data.events || []).forEach((event) => {
        const geometry = findPointGeometry(event);
        if (!geometry) return;

        const lon = Number(geometry.coordinates[0]);
        const lat = Number(geometry.coordinates[1]);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;

        const category = (event.categories || []).map((c) => c.title).join(", ") || "Natural event";
        const when = geometry.date ? Date.parse(geometry.date) : Date.now();

        layers.events.entities.add({
          id: "eonet-" + event.id,
          name: event.title,
          position: C.Cartesian3.fromDegrees(lon, lat, 11000),
          point: {
            pixelSize: 9,
            color: C.Color.fromCssColorString("#66ffc7").withAlpha(0.82),
            outlineColor: C.Color.fromCssColorString("#d9fff4"),
            outlineWidth: 1,
            disableDepthTestDistance: Number.POSITIVE_INFINITY
          }
        });

        feedItems.push({
          type: "event",
          title: event.title,
          source: "NASA EONET · " + category,
          time: Number.isFinite(when) ? when : Date.now(),
          lat: lat,
          lon: lon,
          altitude: 2500000,
          detail: category
        });
        mapped += 1;
      });

      $("eventCount").textContent = mapped.toLocaleString();
      setStatus("eventsStatus", mapped + " mapped open events");
      setHealth("eonetHealth", true);
      renderFeed();
      return true;
    } catch (error) {
      console.error(error);
      setStatus("eventsStatus", "Source unavailable");
      setHealth("eonetHealth", false);
      return false;
    }
  }

  const planeSvg = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><path fill="#7df5ff" stroke="#061522" stroke-width="1.2" d="M16 1l3 10 9 5v3l-9-2-2 10 4 2v2l-5-1-5 1v-2l4-2-2-10-9 2v-3l9-5z"/></svg>'
  );

  async function loadFlights(silent) {
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
          : Number.isFinite(flight.baroAltitude)
            ? Math.max(120, flight.baroAltitude)
            : 1000;

        layers.flights.entities.add({
          id: "flight-" + (flight.icao24 || index),
          name: (flight.callsign || flight.icao24 || "Aircraft").trim(),
          position: C.Cartesian3.fromDegrees(flight.longitude, flight.latitude, altitude),
          billboard: {
            image: planeSvg,
            width: 17,
            height: 17,
            rotation: C.Math.toRadians(-Number(flight.track || 0)),
            alignedAxis: C.Cartesian3.ZERO,
            disableDepthTestDistance: 9000000,
            distanceDisplayCondition: new C.DistanceDisplayCondition(0, 15000000)
          }
        });
      });

      $("flightCount").textContent = Number(data.count || 0).toLocaleString();
      setStatus("flightsStatus", Number(data.count || 0).toLocaleString() + " received · " + formatAge(Date.parse(data.fetchedAt)));
      setHealth("openskyHealth", true);
      $("lastRefresh").textContent = "Aircraft refreshed " + new Date().toLocaleTimeString();
      return true;
    } catch (error) {
      if (!silent) console.warn("Aircraft source unavailable.", error);
      setStatus("flightsStatus", "Needs Netlify/OpenSky");
      setHealth("openskyHealth", false);
      $("flightCount").textContent = "—";
      return false;
    }
  }

  function renderFeed() {
    const feed = $("feed");
    const filtered = feedItems
      .filter((item) => feedFilter === "all" || item.type === feedFilter)
      .sort((a, b) => b.time - a.time)
      .slice(0, 80);

    if (!filtered.length) {
      feed.innerHTML = '<div class="feed-empty">Waiting for live sources…</div>';
      return;
    }

    feed.innerHTML = filtered.map((item, index) => {
      const typeLabel = item.type === "earthquake" ? "EARTHQUAKE" : "GLOBAL EVENT";
      return '<button class="feed-card" type="button" data-feed-index="' + index + '">' +
        '<div class="feed-top"><span class="feed-type">' + typeLabel + '</span><span class="feed-time">' + escapeHtml(formatAge(item.time)) + '</span></div>' +
        '<div class="feed-title">' + escapeHtml(item.title) + '</div>' +
        '<div class="feed-source">' + escapeHtml(item.source) + '</div>' +
      '</button>';
    }).join("");

    feed.querySelectorAll("[data-feed-index]").forEach((button) => {
      button.addEventListener("click", () => {
        const item = filtered[Number(button.dataset.feedIndex)];
        if (!item) return;
        viewer.camera.flyTo({
          destination: C.Cartesian3.fromDegrees(item.lon, item.lat, item.altitude || 2200000),
          duration: 1.8
        });
      });
    });
  }

  function bindControls() {
    document.querySelectorAll(".layer-toggle[data-layer]").forEach((input) => {
      input.addEventListener("change", () => {
        const source = layers[input.dataset.layer];
        if (source) source.show = input.checked;
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

    viewer.camera.moveEnd.addEventListener(updateCameraReadout);
    window.addEventListener("online", updateNetworkState);
    window.addEventListener("offline", updateNetworkState);
  }

  function updateCameraReadout() {
    if (!viewer) return;
    const cartographic = C.Cartographic.fromCartesian(viewer.camera.positionWC);
    const lat = C.Math.toDegrees(cartographic.latitude);
    const lon = C.Math.toDegrees(cartographic.longitude);
    const altitudeKm = cartographic.height / 1000;
    $("cameraReadout").textContent =
      "LAT " + lat.toFixed(2) + " · LON " + lon.toFixed(2) + " · ALT " +
      (altitudeKm >= 1000 ? (altitudeKm / 1000).toFixed(1) + "K KM" : altitudeKm.toFixed(0) + " KM");
  }

  function updateNetworkState() {
    const online = navigator.onLine;
    $("networkStatus").textContent = online ? "SYSTEM ONLINE" : "NETWORK OFFLINE";
  }

  function startClock() {
    const tick = () => {
      const now = new Date();
      $("utcClock").textContent = now.toISOString().slice(11, 19) + " UTC";
      document.querySelectorAll(".feed-time").forEach(() => {});
    };
    tick();
    setInterval(tick, 1000);
  }

  async function start() {
    if (!C) {
      progressMessage.textContent = "Cesium failed to load.";
      return;
    }

    try {
      setProgress(5, "Booting GeoPulse…");
      await createViewer();
      addTradeRoutes();
      bindControls();
      startClock();
      updateNetworkState();
      updateCameraReadout();

      setProgress(48, "Connecting trusted global sources…");

      const quakePromise = loadEarthquakes();
      const eventPromise = loadNaturalEvents();
      const flightPromise = loadFlights(false);

      await quakePromise;
      setProgress(66, "USGS earthquake stream connected…");
      await eventPromise;
      setProgress(82, "NASA global events connected…");
      await flightPromise;
      setProgress(94, "Finalizing live layers…");

      flightRefreshTimer = setInterval(() => {
        const toggle = document.querySelector('.layer-toggle[data-layer="flights"]');
        if (!document.hidden && toggle && toggle.checked && navigator.onLine) loadFlights(true);
      }, 30000);

      setTimeout(() => {
        setProgress(100, "GeoPulse online");
        app.classList.add("ready");
        app.setAttribute("aria-hidden", "false");
        setTimeout(() => loadingScreen.classList.add("done"), 450);
      }, 450);
    } catch (error) {
      console.error("GeoPulse startup failure", error);
      setProgress(100, "Started with limited functionality");
      app.classList.add("ready");
      app.setAttribute("aria-hidden", "false");
      setTimeout(() => loadingScreen.classList.add("done"), 700);
    }
  }

  window.addEventListener("beforeunload", () => {
    if (flightRefreshTimer) clearInterval(flightRefreshTimer);
  });

  start();
})();