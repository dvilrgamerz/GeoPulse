const OPENSKY_STATES = "https://opensky-network.org/api/states/all";
const OPENSKY_TOKEN = "https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token";
const ADSB_RADIUS_NM = 250;
const CACHE_MS = 15000;

let tokenCache = { token: null, expiresAt: 0 };
let lastGood = { at: 0, payload: null };

function json(statusCode, body, extraHeaders = {}) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=8, s-maxage=12, stale-while-revalidate=30",
      "Access-Control-Allow-Origin": "*",
      ...extraHeaders
    },
    body: JSON.stringify(body)
  };
}

function finite(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

async function getAccessToken() {
  const clientId = process.env.OPENSKY_CLIENT_ID;
  const clientSecret = process.env.OPENSKY_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  if (tokenCache.token && Date.now() < tokenCache.expiresAt - 60000) return tokenCache.token;

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret
  });
  const response = await fetch(OPENSKY_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(8000)
  });
  if (!response.ok) throw new Error("OpenSky auth failed: " + response.status);
  const data = await response.json();
  tokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + Number(data.expires_in || 300) * 1000
  };
  return tokenCache.token;
}

function normalizeOpenSky(data) {
  const sourceTime = Number(data && data.time) || null;
  return (Array.isArray(data && data.states) ? data.states : [])
    .filter((s) => Number.isFinite(s[5]) && Number.isFinite(s[6]))
    .slice(0, 6000)
    .map((s) => ({
      icao24: s[0] || null,
      callsign: s[1] ? String(s[1]).trim() : null,
      registration: null,
      aircraftType: null,
      description: null,
      originCountry: s[2] || null,
      timePosition: finite(s[3]),
      lastContact: finite(s[4]),
      longitude: finite(s[5]),
      latitude: finite(s[6]),
      baroAltitude: finite(s[7]),
      onGround: Boolean(s[8]),
      velocity: finite(s[9]),
      track: finite(s[10]),
      verticalRate: finite(s[11]),
      geoAltitude: finite(s[13]),
      squawk: s[14] || null,
      category: finite(s[17]),
      emergency: null,
      seenSeconds: sourceTime && Number.isFinite(s[4]) ? Math.max(0, sourceTime - s[4]) : null
    }));
}

function normalizeAdsbLol(payload) {
  const nowRaw = finite(payload && payload.now);
  const nowSeconds = nowRaw === null
    ? Math.floor(Date.now() / 1000)
    : Math.floor(nowRaw > 1e10 ? nowRaw / 1000 : nowRaw);

  return (Array.isArray(payload && payload.ac) ? payload.ac : [])
    .map((a) => {
      const latitude = finite(a.lat);
      const longitude = finite(a.lon);
      if (!a.hex || latitude === null || longitude === null) return null;

      const onGround = a.alt_baro === "ground";
      const baroFeet = onGround ? null : finite(a.alt_baro);
      const geomFeet = finite(a.alt_geom);
      const gsKnots = finite(a.gs);
      const vrFpm = finite(a.baro_rate) ?? finite(a.geom_rate);
      const seen = finite(a.seen);
      const seenPos = finite(a.seen_pos);

      return {
        icao24: String(a.hex).toLowerCase(),
        callsign: String(a.flight || "").trim() || null,
        registration: String(a.r || "").trim() || null,
        aircraftType: String(a.t || "").trim() || null,
        description: String(a.desc || "").trim() || null,
        originCountry: null,
        timePosition: seenPos === null ? null : nowSeconds - seenPos,
        lastContact: seen === null ? null : nowSeconds - seen,
        longitude,
        latitude,
        baroAltitude: baroFeet === null ? null : baroFeet * 0.3048,
        onGround,
        velocity: gsKnots === null ? null : gsKnots * 0.514444,
        track: finite(a.track),
        verticalRate: vrFpm === null ? null : vrFpm * 0.00508,
        geoAltitude: geomFeet === null ? null : geomFeet * 0.3048,
        squawk: a.squawk || null,
        category: a.category || null,
        emergency: a.emergency && a.emergency !== "none" ? a.emergency : null,
        seenSeconds: seen,
        messages: finite(a.messages),
        rssi: finite(a.rssi)
      };
    })
    .filter(Boolean);
}

async function fetchAdsbLol(lat, lon) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const roundedLat = Math.round(clamp(lat, -90, 90) * 4) / 4;
  const roundedLon = Math.round(clamp(lon, -180, 180) * 4) / 4;
  const url = "https://api.adsb.lol/v2/lat/" + roundedLat + "/lon/" + roundedLon + "/dist/" + ADSB_RADIUS_NM;

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "GeoPulse-aircraft/0.5 (+https://github.com/dvilrgamerz/GeoPulse)"
    },
    signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) throw new Error("adsb.lol HTTP " + response.status);

  const aircraft = normalizeAdsbLol(await response.json());
  return {
    source: "adsb.lol",
    coverage: ADSB_RADIUS_NM + "nm live regional",
    fetchedAt: new Date().toISOString(),
    count: aircraft.length,
    aircraft
  };
}

async function fetchOpenSky(bounds) {
  const url = new URL(OPENSKY_STATES);
  url.searchParams.set("extended", "1");
  if (bounds) {
    url.searchParams.set("lamin", String(clamp(bounds.lamin, -90, 90)));
    url.searchParams.set("lomin", String(clamp(bounds.lomin, -180, 180)));
    url.searchParams.set("lamax", String(clamp(bounds.lamax, -90, 90)));
    url.searchParams.set("lomax", String(clamp(bounds.lomax, -180, 180)));
  }

  let token = null;
  try { token = await getAccessToken(); } catch (error) {
    console.warn("OpenSky auth unavailable", error.message);
  }

  const response = await fetch(url.toString(), {
    headers: token ? { Authorization: "Bearer " + token } : {},
    signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) throw new Error("OpenSky HTTP " + response.status);

  const raw = await response.json();
  const aircraft = normalizeOpenSky(raw);
  return {
    source: "OpenSky Network",
    coverage: bounds ? "live viewport" : "live global",
    fetchedAt: new Date().toISOString(),
    sourceTime: raw.time || null,
    count: aircraft.length,
    aircraft
  };
}

exports.handler = async function handler(event) {
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type"
      },
      body: ""
    };
  }
  if (event.httpMethod !== "GET") return json(405, { error: "Method not allowed" });

  const q = event.queryStringParameters || {};
  const lamin = finite(q.lamin);
  const lomin = finite(q.lomin);
  const lamax = finite(q.lamax);
  const lomax = finite(q.lomax);
  const anchorLat = finite(q.lat);
  const anchorLon = finite(q.lon);
  const hasBounds = [lamin, lomin, lamax, lomax].every(Number.isFinite) && lamin < lamax && lomin < lomax;
  const bounds = hasBounds ? { lamin, lomin, lamax, lomax } : null;

  // Focused map views prefer adsb.lol because it provides current regional ADS-B data
  // plus useful aircraft metadata such as registration/type when available.
  if (bounds && Number.isFinite(anchorLat) && Number.isFinite(anchorLon)) {
    try {
      const regional = await fetchAdsbLol(anchorLat, anchorLon);
      if (regional && regional.count > 0) {
        lastGood = { at: Date.now(), payload: regional };
        return json(200, regional, { "X-Flight-Source": "adsb.lol" });
      }
    } catch (error) {
      console.warn("adsb.lol regional source unavailable", error.message);
    }
  }

  try {
    const opensky = await fetchOpenSky(bounds);
    if (opensky.count > 0) {
      lastGood = { at: Date.now(), payload: opensky };
      return json(200, opensky, { "X-Flight-Source": "OpenSky" });
    }
  } catch (error) {
    console.warn("OpenSky unavailable", error.message);
  }

  // At world view or after OpenSky failure, still try a real regional live snapshot
  // centered on what the user is looking at rather than returning a fake zero.
  try {
    const regional = await fetchAdsbLol(anchorLat, anchorLon);
    if (regional && regional.count > 0) {
      lastGood = { at: Date.now(), payload: regional };
      return json(200, regional, { "X-Flight-Source": "adsb.lol" });
    }
  } catch (error) {
    console.warn("adsb.lol fallback unavailable", error.message);
  }

  if (lastGood.payload && Date.now() - lastGood.at < CACHE_MS) {
    return json(200, { ...lastGood.payload, stale: true }, { "X-Flight-Source": "stale-last-good" });
  }

  return json(502, {
    error: "No live aircraft source is currently available",
    source: "OpenSky + adsb.lol",
    hint: "Zoom toward a populated region for bounded adsb.lol coverage."
  }, { "Cache-Control": "no-store" });
};