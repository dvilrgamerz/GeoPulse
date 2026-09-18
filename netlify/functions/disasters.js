const BASE = "https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH";

function json(statusCode, body, cache = "public, max-age=60, s-maxage=300, stale-while-revalidate=300") {
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

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function centerOfGeometry(geometry) {
  if (!geometry) return null;
  if (geometry.type === "Point" && Array.isArray(geometry.coordinates)) return geometry.coordinates;
  const coords = geometry.coordinates;
  if (!Array.isArray(coords)) return null;
  const flat = [];
  (function walk(value) {
    if (Array.isArray(value) && value.length >= 2 && typeof value[0] === "number" && typeof value[1] === "number") flat.push(value);
    else if (Array.isArray(value)) value.forEach(walk);
  })(coords);
  if (!flat.length) return null;
  const lon = flat.reduce((sum, p) => sum + p[0], 0) / flat.length;
  const lat = flat.reduce((sum, p) => sum + p[1], 0) / flat.length;
  return [lon, lat];
}

exports.handler = async function handler(event) {
  if (event.httpMethod !== "GET") return json(405, { error: "Method not allowed" }, "no-store");
  try {
    const end = new Date();
    const start = new Date(end.getTime() - 7 * 86400000);
    const url = new URL(BASE);
    url.searchParams.set("fromdate", isoDate(start));
    url.searchParams.set("todate", isoDate(end));
    url.searchParams.set("alertlevel", "green;orange;red");

    const response = await fetch(url, {
      headers: { "User-Agent": "GeoPulse/0.3 (+https://github.com/dvilrgamerz/GeoPulse)" },
      signal: AbortSignal.timeout(12000)
    });
    if (!response.ok) throw new Error("GDACS HTTP " + response.status);
    const data = await response.json();

    const features = Array.isArray(data.features) ? data.features : [];
    const events = features.map((feature, index) => {
      const p = feature.properties || {};
      const center = centerOfGeometry(feature.geometry);
      if (!center) return null;
      return {
        id: p.eventid || p.eventId || feature.id || "gdacs-" + index,
        type: p.eventtype || p.eventType || p.type || "DISASTER",
        name: p.name || p.eventname || p.title || "Global disaster alert",
        alertLevel: String(p.alertlevel || p.alertLevel || "green").toLowerCase(),
        severity: p.severitydata && p.severitydata.severity ? p.severitydata.severity : (p.severity || ""),
        country: p.country || p.countryname || "",
        fromDate: p.fromdate || p.fromDate || p.date || null,
        toDate: p.todate || p.toDate || null,
        latitude: Number(center[1]),
        longitude: Number(center[0])
      };
    }).filter(Boolean).filter((r) => Number.isFinite(r.latitude) && Number.isFinite(r.longitude));

    return json(200, {
      source: "GDACS",
      fetchedAt: new Date().toISOString(),
      count: events.length,
      events
    });
  } catch (error) {
    console.error("GeoPulse GDACS proxy error", error);
    return json(502, { error: "GDACS source unavailable", message: error.message }, "no-store");
  }
};