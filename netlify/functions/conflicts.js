const ENDPOINT = "https://api.gdeltproject.org/api/v2/geo/geo";

function json(statusCode, body, cache = "public, max-age=120, s-maxage=600, stale-while-revalidate=600") {
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

function cleanText(value) {
  return String(value || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

exports.handler = async function handler(event) {
  if (event.httpMethod !== "GET") return json(405, { error: "Method not allowed" }, "no-store");
  try {
    const url = new URL(ENDPOINT);
    url.searchParams.set("query", '(conflict OR fighting OR clash OR airstrike OR shelling OR attack OR ceasefire)');
    url.searchParams.set("mode", "pointdata");
    url.searchParams.set("format", "geojson");
    url.searchParams.set("timespan", "2h");
    url.searchParams.set("maxpoints", "180");
    url.searchParams.set("sortby", "date");
    url.searchParams.set("geores", "2");

    const response = await fetch(url, {
      headers: { "User-Agent": "GeoPulse/0.3 (+https://github.com/dvilrgamerz/GeoPulse)" },
      signal: AbortSignal.timeout(12000)
    });
    if (!response.ok) throw new Error("GDELT HTTP " + response.status);
    const data = await response.json();

    const reports = (data.features || []).map((feature, index) => {
      const coords = feature.geometry && feature.geometry.coordinates;
      const p = feature.properties || {};
      if (!Array.isArray(coords) || coords.length < 2) return null;
      return {
        id: p.id || p.url || "gdelt-" + index,
        longitude: Number(coords[0]),
        latitude: Number(coords[1]),
        location: cleanText(p.name || p.location || p.label || "Reported location").slice(0, 160),
        count: Number(p.count || p.Count || 1),
        summary: cleanText(p.html || p.description || "").slice(0, 300)
      };
    }).filter(Boolean).filter((r) => Number.isFinite(r.latitude) && Number.isFinite(r.longitude));

    return json(200, {
      source: "GDELT GEO 2.0",
      fetchedAt: new Date().toISOString(),
      window: "2h",
      notice: "These points represent geolocated conflict-related news coverage, not independently verified conflict events.",
      count: reports.length,
      reports
    });
  } catch (error) {
    console.error("GeoPulse GDELT proxy error", error);
    return json(502, { error: "Conflict-reporting source unavailable", message: error.message }, "no-store");
  }
};