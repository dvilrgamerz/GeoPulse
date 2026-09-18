const GROUPS = ["STATIONS", "WEATHER", "GPS-OPS", "GALILEO"];
const BASE = "https://celestrak.org/NORAD/elements/gp.php";

function json(statusCode, body, cache = "public, max-age=300, s-maxage=7200, stale-while-revalidate=3600") {
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
  if (event.httpMethod !== "GET") return json(405, { error: "Method not allowed" }, "no-store");
  try {
    const all = [];
    for (const group of GROUPS) {
      const url = new URL(BASE);
      url.searchParams.set("GROUP", group);
      url.searchParams.set("FORMAT", "JSON");
      const response = await fetch(url, { signal: AbortSignal.timeout(12000) });
      if (!response.ok) throw new Error("CelesTrak " + group + " HTTP " + response.status);
      const rows = await response.json();
      for (const row of rows) all.push({ ...row, _group: group });
    }

    const deduped = [];
    const seen = new Set();
    for (const row of all) {
      const key = String(row.NORAD_CAT_ID || row.OBJECT_ID || row.OBJECT_NAME || "");
      if (!key || seen.has(key)) continue;
      seen.add(key);
      deduped.push(row);
    }

    return json(200, {
      source: "CelesTrak",
      fetchedAt: new Date().toISOString(),
      groups: GROUPS,
      count: deduped.length,
      satellites: deduped.slice(0, 420)
    });
  } catch (error) {
    console.error("GeoPulse satellite proxy error", error);
    return json(502, { error: "Satellite source unavailable", message: error.message }, "no-store");
  }
};