function json(statusCode, body, cache = "no-store") {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": cache,
      "Access-Control-Allow-Origin": "*"
    },
    body: JSON.stringify(body)
  };
}

function normalizeArcGIS(data) {
  return (data.candidates || []).map((c) => ({
    label: c.address,
    score: Number(c.score || 0),
    longitude: c.location && Number(c.location.x),
    latitude: c.location && Number(c.location.y),
    type: c.attributes && c.attributes.Addr_type,
    provider: "ArcGIS"
  })).filter((r) => Number.isFinite(r.latitude) && Number.isFinite(r.longitude));
}

function normalizePhoton(data) {
  return (data.features || []).map((feature) => {
    const p = feature.properties || {};
    const coords = feature.geometry && feature.geometry.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) return null;
    const labelParts = [
      p.name || [p.housenumber, p.street].filter(Boolean).join(" "),
      p.city || p.town || p.village,
      p.state,
      p.country
    ].filter(Boolean);

    return {
      label: labelParts.join(", ") || "Search result",
      score: 75,
      longitude: Number(coords[0]),
      latitude: Number(coords[1]),
      type: p.type || p.osm_value || "Place",
      provider: "Photon / OpenStreetMap"
    };
  }).filter(Boolean).filter((r) => Number.isFinite(r.latitude) && Number.isFinite(r.longitude));
}

async function searchArcGIS(query, token) {
  const url = new URL("https://geocode-api.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates");
  url.searchParams.set("SingleLine", query);
  url.searchParams.set("outFields", "Match_addr,Addr_type,City,Region,Country,Postal");
  url.searchParams.set("maxLocations", "6");
  url.searchParams.set("forStorage", "false");
  url.searchParams.set("f", "json");
  url.searchParams.set("token", token);

  const response = await fetch(url, { signal: AbortSignal.timeout(9000) });
  if (!response.ok) throw new Error("ArcGIS geocoder HTTP " + response.status);
  return normalizeArcGIS(await response.json());
}

async function searchPhoton(query) {
  const url = new URL("https://photon.komoot.io/api/");
  url.searchParams.set("q", query);
  url.searchParams.set("limit", "6");

  const response = await fetch(url, {
    headers: {
      "User-Agent": "GeoPulse/0.3 (+https://github.com/dvilrgamerz/GeoPulse)"
    },
    signal: AbortSignal.timeout(9000)
  });
  if (!response.ok) throw new Error("Photon geocoder HTTP " + response.status);
  return normalizePhoton(await response.json());
}

exports.handler = async function handler(event) {
  if (event.httpMethod !== "GET") return json(405, { error: "Method not allowed" });
  const query = String((event.queryStringParameters || {}).q || "").trim();
  if (query.length < 3 || query.length > 200) {
    return json(400, { error: "Enter a fuller address or place name." });
  }

  const token = process.env.ARCGIS_API_KEY;
  let arcgisError = null;

  if (token) {
    try {
      const results = await searchArcGIS(query, token);
      if (results.length) {
        return json(200, {
          source: "ArcGIS World Geocoding Service",
          fallback: false,
          results
        }, "private, max-age=0");
      }
    } catch (error) {
      arcgisError = error;
      console.warn("GeoPulse ArcGIS geocoder unavailable; trying Photon fallback.", error);
    }
  }

  try {
    const results = await searchPhoton(query);
    return json(200, {
      source: "Photon / OpenStreetMap",
      fallback: true,
      note: "Keyless fallback. Search precision and availability depend on Photon/OpenStreetMap coverage.",
      results
    }, "public, max-age=60, s-maxage=300");
  } catch (photonError) {
    console.error("GeoPulse Photon geocoder error", photonError);
    return json(502, {
      error: "Address search unavailable",
      arcgis: arcgisError ? arcgisError.message : token ? "No ArcGIS matches" : "ARCGIS_API_KEY not configured",
      photon: photonError.message
    });
  }
};