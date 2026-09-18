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

exports.handler = async function handler(event) {
  if (event.httpMethod !== "GET") return json(405, { error: "Method not allowed" });
  const query = String((event.queryStringParameters || {}).q || "").trim();
  if (query.length < 3 || query.length > 200) return json(400, { error: "Enter a fuller address or place name." });

  const token = process.env.ARCGIS_API_KEY;
  if (!token) {
    return json(503, {
      error: "Address search is not configured",
      setup: "Set ARCGIS_API_KEY in Netlify. Coordinate search still works without a key."
    });
  }

  try {
    const url = new URL("https://geocode-api.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates");
    url.searchParams.set("SingleLine", query);
    url.searchParams.set("outFields", "Match_addr,Addr_type,City,Region,Country,Postal");
    url.searchParams.set("maxLocations", "6");
    url.searchParams.set("forStorage", "false");
    url.searchParams.set("f", "json");
    url.searchParams.set("token", token);

    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error("ArcGIS geocoder HTTP " + response.status);
    const data = await response.json();
    const results = (data.candidates || []).map((c) => ({
      label: c.address,
      score: c.score,
      longitude: c.location && c.location.x,
      latitude: c.location && c.location.y,
      type: c.attributes && c.attributes.Addr_type
    })).filter((r) => Number.isFinite(r.latitude) && Number.isFinite(r.longitude));

    return json(200, { source: "ArcGIS World Geocoding Service", results }, "private, max-age=0");
  } catch (error) {
    console.error("GeoPulse geocoder error", error);
    return json(502, { error: "Address search unavailable", message: error.message });
  }
};