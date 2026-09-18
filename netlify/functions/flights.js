const OPENSKY_STATES = "https://opensky-network.org/api/states/all";
const OPENSKY_TOKEN = "https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token";

let tokenCache = { token: null, expiresAt: 0 };

function json(statusCode, body, extraHeaders = {}) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=10, s-maxage=15, stale-while-revalidate=30",
      "Access-Control-Allow-Origin": "*",
      ...extraHeaders
    },
    body: JSON.stringify(body)
  };
}

function numberParam(value, min, max) {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) return null;
  return n;
}

async function getAccessToken() {
  const clientId = process.env.OPENSKY_CLIENT_ID;
  const clientSecret = process.env.OPENSKY_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  if (tokenCache.token && Date.now() < tokenCache.expiresAt - 30000) {
    return tokenCache.token;
  }

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

  if (!response.ok) {
    throw new Error("OpenSky auth failed: " + response.status);
  }

  const data = await response.json();
  tokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + Number(data.expires_in || 300) * 1000
  };
  return tokenCache.token;
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

  if (event.httpMethod !== "GET") {
    return json(405, { error: "Method not allowed" });
  }

  try {
    const q = event.queryStringParameters || {};
    const lamin = numberParam(q.lamin, -90, 90);
    const lomin = numberParam(q.lomin, -180, 180);
    const lamax = numberParam(q.lamax, -90, 90);
    const lomax = numberParam(q.lomax, -180, 180);

    const url = new URL(OPENSKY_STATES);
    if ([lamin, lomin, lamax, lomax].every((v) => v !== null) && lamin < lamax && lomin < lomax) {
      url.searchParams.set("lamin", String(lamin));
      url.searchParams.set("lomin", String(lomin));
      url.searchParams.set("lamax", String(lamax));
      url.searchParams.set("lomax", String(lomax));
    }

    const token = await getAccessToken();
    const headers = token ? { Authorization: "Bearer " + token } : {};

    const response = await fetch(url.toString(), {
      headers,
      signal: AbortSignal.timeout(10000)
    });

    if (!response.ok) {
      const text = await response.text();
      return json(response.status, {
        error: "OpenSky request failed",
        status: response.status,
        detail: text.slice(0, 300)
      }, { "Cache-Control": "no-store" });
    }

    const data = await response.json();
    const rawStates = Array.isArray(data.states) ? data.states : [];

    const aircraft = rawStates
      .filter((s) => Number.isFinite(s[5]) && Number.isFinite(s[6]))
      .slice(0, 1200)
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

    return json(200, {
      source: "OpenSky Network",
      fetchedAt: new Date().toISOString(),
      sourceTime: data.time || null,
      count: aircraft.length,
      aircraft
    });
  } catch (error) {
    console.error("GeoPulse OpenSky proxy error", error);
    return json(502, {
      error: "Aircraft source unavailable",
      message: error && error.message ? error.message : "Unknown upstream error"
    }, { "Cache-Control": "no-store" });
  }
};