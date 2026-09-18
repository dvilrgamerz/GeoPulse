const OPENSKY_STATES = "https://opensky-network.org/api/states/all";
const OPENSKY_TOKEN = "https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token";
const ADSB_RADIUS_NM = 250;
const CACHE_MS = 12000;

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
  return (Array.isArray(data.states) ? data.states : [])
    .filter((s) => Number.isFinite(s[5]) && Number.isFinite(s[6]))
    .slice(0, 5000)
    .map((s) => ({
      icao24: s[0] || null,
      callsign: s[1] ? String(s[1]).trim() : null,
      originCountry: s[2] || null,
      longitude: s[5],
      latitude: s[6],
      baroAltitude: s[7],
      onGround: Boolean(s[8]),
      velocity: s[9],
      track: s[10],
      verticalRate: s[11],
      geoAltitude: s[13],
      squawk: s[14] || null
    }));
}

function normalizeAdsbLol(payload) {
  const nowRaw = finite(payload && payload.now);
  const nowSeconds = nowRaw === null ? Math.floor(Date.now() / 1000) : Math.floor(nowRaw > 1e10 ? nowRaw / 1000 : nowRaw);

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
      return {
        icao24: String(a.hex).toLowerCase(),
        callsign: String(a.flight || a.r || "").trim() || null,
        originCountry: null,
        longitude,
        latitude,
        baroAltitude: baroFeet === null ? null : baroFeet * 0.3048,
        onGround,
        velocity: gsKnots === null ? null : gsKnots * 0.514444,
        track: finite(a.track),
        verticalRate: vrFpm === null ? null : vrFpm * 0.00508,
        geoAltitude: geomFeet === null ? null : geomFeet * 0.3048,
        squawk: a.squawk || null,
        seenSeconds: finite(a.seen),
        sourceTime: nowSeconds
      };
    })
    .filter(Boolean);
}

async function fetchAdsbFallback(lat, lon) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const roundedLat = Math.round(clamp(lat, -90, 90) * 4) / 4;
  const roundedLon = Math.round(clamp(lon, -180, 180) * 4) / 4;
  const url = "https://api.adsb.lol/v2/lat/" + roundedLat + "/lon/" + roundedLon + "/dist/" + ADSB_RADIUS_NM;
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "GeoPulse-adsblol-fallback/0.4 (+https://github.com/dvilrgamerz/GeoPulse)"
    },
    signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) throw new Error("adsb.lol HTTP " + response.status);
  const aircraft = normalizeAdsbLol(await response.json());
  return {
    source: "adsb.lol",
    coverage: ADSB_RADIUS_NM + "nm regional fallback",
    fetchedAt: new Date().toISOString(),
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

  try {
    const url = new URL(OPENSKY_STATES);
    if (hasBounds) {
      url.searchParams.set("lamin", String(clamp(lamin, -90, 90)));
      url.searchParams.set("lomin", String(clamp(lomin, -180, 180)));
      url.searchParams.set("lamax", String(clamp(lamax, -90, 90)));
      url.searchParams.set("lomax", String(clamp(lomax, -180, 180)));
    }

    let token = null;
    try { token = await getAccessToken(); } catch (authError) {
      console.warn("OpenSky auth unavailable", authError.message);
    }

    const response = await fetch(url.toString(), {
      headers: token ? { Authorization: "Bearer " + token } : {},
      signal: AbortSignal.timeout(10000)
    });

    if (response.ok) {
      const raw = await response.json();
      const aircraft = normalizeOpenSky(raw);
      if (aircraft.length) {
        const payload = {
          source: "OpenSky Network",
          coverage: hasBounds ? "viewport" : "global",
          fetchedAt: new Date().toISOString(),
          sourceTime: raw.time || null,
          count: aircraft.length,
          aircraft
        };
        lastGood = { at: Date.now(), payload };
        return json(200, payload, { "X-Flight-Source": "OpenSky" });
      }
    }

    if (lastGood.payload && Date.now() - lastGood.at < CACHE_MS) {
      return json(200, { ...lastGood.payload, stale: true }, { "X-Flight-Source": "OpenSky-stale" });
    }

    const fallbackLat = Number.isFinite(anchorLat) ? anchorLat : (hasBounds ? (lamin + lamax) / 2 : null);
    const fallbackLon = Number.isFinite(anchorLon) ? anchorLon : (hasBounds ? (lomin + lomax) / 2 : null);
    const fallback = await fetchAdsbFallback(fallbackLat, fallbackLon);
    if (fallback) return json(200, fallback, { "X-Flight-Source": "adsb.lol" });

    return json(502, { error: "No usable aircraft source", source: "OpenSky + adsb.lol fallback" }, { "Cache-Control": "no-store" });
  } catch (error) {
    console.error("GeoPulse aircraft proxy error", error);
    try {
      const fallbackLat = Number.isFinite(anchorLat) ? anchorLat : (hasBounds ? (lamin + lamax) / 2 : null);
      const fallbackLon = Number.isFinite(anchorLon) ? anchorLon : (hasBounds ? (lomin + lomax) / 2 : null);
      const fallback = await fetchAdsbFallback(fallbackLat, fallbackLon);
      if (fallback) return json(200, fallback, { "X-Flight-Source": "adsb.lol" });
    } catch (fallbackError) {
      console.error("GeoPulse adsb.lol fallback error", fallbackError);
    }

    if (lastGood.payload) {
      return json(200, { ...lastGood.payload, stale: true }, { "X-Flight-Source": "OpenSky-stale" });
    }

    return json(502, {
      error: "Aircraft source unavailable",
      message: error && error.message ? error.message : "Unknown upstream error"
    }, { "Cache-Control": "no-store" });
  }
};