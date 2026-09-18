function numberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=8, s-maxage=12, stale-while-revalidate=30",
      ...headers
    }
  });
}

let tokenCache = { token: null, expiresAt: 0 };
let lastGood = { at: 0, payload: null };

async function getOpenSkyToken() {
  const clientId = Netlify.env.get("OPENSKY_CLIENT_ID");
  const clientSecret = Netlify.env.get("OPENSKY_CLIENT_SECRET");
  if (!clientId || !clientSecret) return null;
  if (tokenCache.token && Date.now() < tokenCache.expiresAt - 60000) return tokenCache.token;

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret
  });

  const response = await fetch(
    "https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(8000)
    }
  );

  if (!response.ok) throw new Error("OpenSky auth failed: " + response.status);
  const data = await response.json();
  tokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + Number(data.expires_in || 300) * 1000
  };
  return tokenCache.token;
}

function normalizeOpenSky(data) {
  const sourceTime = Number(data?.time) || null;
  return (Array.isArray(data?.states) ? data.states : [])
    .filter((s) => Number.isFinite(s[5]) && Number.isFinite(s[6]))
    .slice(0, 6000)
    .map((s) => ({
      icao24: s[0] || null,
      callsign: s[1] ? String(s[1]).trim() : null,
      registration: null,
      aircraftType: null,
      description: null,
      originCountry: s[2] || null,
      timePosition: numberOrNull(s[3]),
      lastContact: numberOrNull(s[4]),
      longitude: numberOrNull(s[5]),
      latitude: numberOrNull(s[6]),
      baroAltitude: numberOrNull(s[7]),
      onGround: Boolean(s[8]),
      velocity: numberOrNull(s[9]),
      track: numberOrNull(s[10]),
      verticalRate: numberOrNull(s[11]),
      geoAltitude: numberOrNull(s[13]),
      squawk: s[14] || null,
      category: numberOrNull(s[17]),
      emergency: null,
      seenSeconds:
        sourceTime && Number.isFinite(s[4])
          ? Math.max(0, sourceTime - s[4])
          : null
    }));
}

function normalizeAdsbLol(payload) {
  const nowRaw = numberOrNull(payload?.now);
  const nowSeconds =
    nowRaw === null
      ? Math.floor(Date.now() / 1000)
      : Math.floor(nowRaw > 1e10 ? nowRaw / 1000 : nowRaw);

  return (Array.isArray(payload?.ac) ? payload.ac : [])
    .map((a) => {
      const latitude = numberOrNull(a?.lat);
      const longitude = numberOrNull(a?.lon);
      if (!a?.hex || latitude === null || longitude === null) return null;

      const onGround = a.alt_baro === "ground";
      const baroFeet = onGround ? null : numberOrNull(a.alt_baro);
      const geomFeet = numberOrNull(a.alt_geom);
      const gsKnots = numberOrNull(a.gs);
      const vrFpm = numberOrNull(a.baro_rate) ?? numberOrNull(a.geom_rate);
      const seen = numberOrNull(a.seen);
      const seenPos = numberOrNull(a.seen_pos);

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
        track: numberOrNull(a.track),
        verticalRate: vrFpm === null ? null : vrFpm * 0.00508,
        geoAltitude: geomFeet === null ? null : geomFeet * 0.3048,
        squawk: a.squawk || null,
        category: a.category || null,
        emergency: a.emergency && a.emergency !== "none" ? a.emergency : null,
        seenSeconds: seen,
        messages: numberOrNull(a.messages),
        rssi: numberOrNull(a.rssi)
      };
    })
    .filter(Boolean);
}

async function fetchAdsbLol(lat, lon, coverageLabel) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const roundedLat = Math.round(clamp(lat, -90, 90) * 4) / 4;
  const roundedLon = Math.round(clamp(lon, -180, 180) * 4) / 4;
  const radiusNm = 250;
  const url =
    "https://api.adsb.lol/v2/lat/" +
    roundedLat +
    "/lon/" +
    roundedLon +
    "/dist/" +
    radiusNm;

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
    coverage: coverageLabel || radiusNm + "nm live regional",
    fetchedAt: new Date().toISOString(),
    count: aircraft.length,
    aircraft
  };
}

async function fetchOpenSky(bounds) {
  const url = new URL("https://opensky-network.org/api/states/all");
  url.searchParams.set("extended", "1");

  if (bounds) {
    url.searchParams.set("lamin", String(clamp(bounds.lamin, -90, 90)));
    url.searchParams.set("lomin", String(clamp(bounds.lomin, -180, 180)));
    url.searchParams.set("lamax", String(clamp(bounds.lamax, -90, 90)));
    url.searchParams.set("lomax", String(clamp(bounds.lomax, -180, 180)));
  }

  let token = null;
  try {
    token = await getOpenSkyToken();
  } catch (error) {
    console.warn("OpenSky auth unavailable", error.message);
  }

  const response = await fetch(url, {
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

export default async (req, context) => {
  if (req.method !== "GET") return json({ error: "Method not allowed" }, 405);

  const url = new URL(req.url);
  const lamin = numberOrNull(url.searchParams.get("lamin"));
  const lomin = numberOrNull(url.searchParams.get("lomin"));
  const lamax = numberOrNull(url.searchParams.get("lamax"));
  const lomax = numberOrNull(url.searchParams.get("lomax"));
  const requestedLat = numberOrNull(url.searchParams.get("lat"));
  const requestedLon = numberOrNull(url.searchParams.get("lon"));

  const hasBounds =
    [lamin, lomin, lamax, lomax].every(Number.isFinite) &&
    lamin < lamax &&
    lomin < lomax;

  const bounds = hasBounds ? { lamin, lomin, lamax, lomax } : null;

  const geoLat = numberOrNull(context?.geo?.latitude);
  const geoLon = numberOrNull(context?.geo?.longitude);
  const fallbackLat = Number.isFinite(requestedLat) ? requestedLat : geoLat;
  const fallbackLon = Number.isFinite(requestedLon) ? requestedLon : geoLon;
  const fallbackCoverage =
    Number.isFinite(requestedLat) && Number.isFinite(requestedLon)
      ? "250nm live map-view region"
      : Number.isFinite(geoLat) && Number.isFinite(geoLon)
        ? "250nm live visitor region"
        : "250nm live regional";

  if (hasBounds && Number.isFinite(fallbackLat) && Number.isFinite(fallbackLon)) {
    try {
      const regional = await fetchAdsbLol(fallbackLat, fallbackLon, fallbackCoverage);
      if (regional && regional.count > 0) {
        lastGood = { at: Date.now(), payload: regional };
        return json(regional, 200, { "X-Flight-Source": "adsb.lol" });
      }
    } catch (error) {
      console.warn("adsb.lol regional source unavailable", error.message);
    }
  }

  try {
    const opensky = await fetchOpenSky(bounds);
    if (opensky.count > 0) {
      lastGood = { at: Date.now(), payload: opensky };
      return json(opensky, 200, { "X-Flight-Source": "OpenSky" });
    }
  } catch (error) {
    console.warn("OpenSky unavailable", error.message);
  }

  try {
    const regional = await fetchAdsbLol(fallbackLat, fallbackLon, fallbackCoverage);
    if (regional && regional.count > 0) {
      lastGood = { at: Date.now(), payload: regional };
      return json(regional, 200, { "X-Flight-Source": "adsb.lol" });
    }
  } catch (error) {
    console.warn("adsb.lol fallback unavailable", error.message);
  }

  if (lastGood.payload && Date.now() - lastGood.at < 15000) {
    return json(
      { ...lastGood.payload, stale: true },
      200,
      { "X-Flight-Source": "stale-last-good" }
    );
  }

  return json(
    {
      error: "No live aircraft source is currently available",
      source: "OpenSky + adsb.lol",
      hasVisitorGeo: Number.isFinite(geoLat) && Number.isFinite(geoLon),
      hint: "Zoom toward a populated region or configure OpenSky credentials."
    },
    502,
    { "Cache-Control": "no-store" }
  );
};

export const config = {
  path: "/.netlify/functions/flights"
};
