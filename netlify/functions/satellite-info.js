const CACHE_MS = 6 * 60 * 60 * 1000;
const cache = new Map();

function json(statusCode, body, cacheControl = "public, max-age=300, s-maxage=21600, stale-while-revalidate=21600") {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": cacheControl,
      "Access-Control-Allow-Origin": "*"
    },
    body: JSON.stringify(body)
  };
}

function validCatnr(value) {
  const text = String(value || "").trim();
  return /^\d{1,9}$/.test(text) ? text : null;
}

exports.handler = async function handler(event) {
  if (event.httpMethod !== "GET") return json(405, { error: "Method not allowed" }, "no-store");

  const catnr = validCatnr((event.queryStringParameters || {}).catnr);
  if (!catnr) return json(400, { error: "A valid NORAD catalog number is required." }, "no-store");

  const cached = cache.get(catnr);
  if (cached && Date.now() - cached.at < CACHE_MS) {
    return json(200, { ...cached.data, cached: true });
  }

  try {
    const satcatUrl = "https://celestrak.org/satcat/records.php?CATNR=" + encodeURIComponent(catnr) + "&FORMAT=JSON";
    const gpUrl = "https://celestrak.org/NORAD/elements/gp.php?CATNR=" + encodeURIComponent(catnr) + "&FORMAT=JSON";

    const [satcatResponse, gpResponse] = await Promise.all([
      fetch(satcatUrl, {
        headers: { "User-Agent": "GeoPulse/0.5 (+https://github.com/dvilrgamerz/GeoPulse)" },
        signal: AbortSignal.timeout(10000)
      }),
      fetch(gpUrl, {
        headers: { "User-Agent": "GeoPulse/0.5 (+https://github.com/dvilrgamerz/GeoPulse)" },
        signal: AbortSignal.timeout(10000)
      })
    ]);

    const satcat = satcatResponse.ok ? await satcatResponse.json() : [];
    const gp = gpResponse.ok ? await gpResponse.json() : [];
    const catalog = Array.isArray(satcat) ? satcat[0] : null;
    const orbital = Array.isArray(gp) ? gp[0] : null;

    if (!catalog && !orbital) {
      return json(404, { error: "Satellite information not found", catnr }, "no-store");
    }

    const data = {
      source: "CelesTrak SATCAT + GP",
      fetchedAt: new Date().toISOString(),
      catnr,
      catalog,
      orbital
    };
    cache.set(catnr, { at: Date.now(), data });
    return json(200, data);
  } catch (error) {
    console.error("GeoPulse satellite info error", error);
    return json(502, { error: "Satellite information unavailable", message: error.message }, "no-store");
  }
};