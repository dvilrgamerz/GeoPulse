const ACTIVE_TLE = "https://celestrak.org/NORAD/elements/gp.php?GROUP=ACTIVE&FORMAT=TLE";
const CACHE_MS = 2 * 60 * 60 * 1000;
let cache = { fetchedAt: 0, satellites: null };

function json(statusCode, body, cacheControl = "public, max-age=300, s-maxage=7200, stale-while-revalidate=3600") {
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

function parseTle(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean);

  const satellites = [];
  for (let i = 0; i < lines.length; ) {
    let name = "";
    let l1 = "";
    let l2 = "";

    if (lines[i].startsWith("1 ") && lines[i + 1] && lines[i + 1].startsWith("2 ")) {
      l1 = lines[i];
      l2 = lines[i + 1];
      name = "SAT " + l1.slice(2, 7).trim();
      i += 2;
    } else if (
      lines[i + 1] && lines[i + 1].startsWith("1 ") &&
      lines[i + 2] && lines[i + 2].startsWith("2 ")
    ) {
      name = lines[i].trim();
      l1 = lines[i + 1];
      l2 = lines[i + 2];
      i += 3;
    } else {
      i += 1;
      continue;
    }

    const norad = l1.slice(2, 7).trim();
    if (!norad || !l1 || !l2) continue;
    satellites.push({ n: name, id: norad, l1, l2 });
  }
  return satellites;
}

exports.handler = async function handler(event) {
  if (event.httpMethod !== "GET") return json(405, { error: "Method not allowed" }, "no-store");

  const now = Date.now();
  if (cache.satellites && now - cache.fetchedAt < CACHE_MS) {
    return json(200, {
      source: "CelesTrak",
      catalog: "ACTIVE",
      fetchedAt: new Date(cache.fetchedAt).toISOString(),
      count: cache.satellites.length,
      cached: true,
      satellites: cache.satellites
    });
  }

  try {
    const response = await fetch(ACTIVE_TLE, {
      headers: { "User-Agent": "GeoPulse/0.4 (+https://github.com/dvilrgamerz/GeoPulse)" },
      signal: AbortSignal.timeout(20000)
    });
    if (!response.ok) throw new Error("CelesTrak ACTIVE HTTP " + response.status);

    const satellites = parseTle(await response.text());
    if (satellites.length < 1000) throw new Error("CelesTrak ACTIVE returned too few objects: " + satellites.length);

    cache = { fetchedAt: Date.now(), satellites };

    return json(200, {
      source: "CelesTrak",
      catalog: "ACTIVE",
      fetchedAt: new Date(cache.fetchedAt).toISOString(),
      count: satellites.length,
      cached: false,
      satellites
    });
  } catch (error) {
    console.error("GeoPulse satellite proxy error", error);
    if (cache.satellites) {
      return json(200, {
        source: "CelesTrak",
        catalog: "ACTIVE",
        fetchedAt: new Date(cache.fetchedAt).toISOString(),
        count: cache.satellites.length,
        cached: true,
        stale: true,
        satellites: cache.satellites
      }, "public, max-age=60, s-maxage=300");
    }
    return json(502, { error: "Satellite source unavailable", message: error.message }, "no-store");
  }
};