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

function finite(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

exports.handler = async function handler(event) {
  if (event.httpMethod !== "GET") return json(405, { error: "Method not allowed" });

  const apiKey = process.env.AISSTREAM_API_KEY;
  if (!apiKey) return json(503, { error: "Live AIS provider not configured", setup: "Set AISSTREAM_API_KEY in Netlify." });

  const q = event.queryStringParameters || {};
  const north = Math.min(90, finite(q.north, 70));
  const south = Math.max(-90, finite(q.south, -60));
  const west = Math.max(-180, finite(q.west, -180));
  const east = Math.min(180, finite(q.east, 180));
  if (south >= north || west >= east) return json(400, { error: "Invalid bounding box" });

  try {
    const ships = new Map();
    const socket = new WebSocket("wss://stream.aisstream.io/v0/stream");
    let settled = false;

    const result = await new Promise((resolve, reject) => {
      const finish = () => {
        if (settled) return;
        settled = true;
        try { socket.close(); } catch {}
        resolve(Array.from(ships.values()).slice(0, 450));
      };

      const timer = setTimeout(finish, 2800);
      const hardTimer = setTimeout(() => {
        clearTimeout(timer);
        if (!settled) {
          settled = true;
          try { socket.close(); } catch {}
          reject(new Error("AIS snapshot timeout"));
        }
      }, 5000);

      socket.addEventListener("open", () => {
        socket.send(JSON.stringify({
          APIKey: apiKey,
          BoundingBoxes: [[[north, west], [south, east]]],
          FilterMessageTypes: ["PositionReport", "StandardClassBPositionReport", "ExtendedClassBPositionReport"]
        }));
      });

      socket.addEventListener("message", (evt) => {
        try {
          const msg = JSON.parse(String(evt.data));
          const meta = msg.MetaData || {};
          const payload = msg.Message && (
            msg.Message.PositionReport ||
            msg.Message.StandardClassBPositionReport ||
            msg.Message.ExtendedClassBPositionReport
          ) || {};
          const lat = Number(meta.Latitude);
          const lon = Number(meta.Longitude);
          if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
          const mmsi = String(meta.MMSI || payload.UserID || lat + ":" + lon);
          ships.set(mmsi, {
            mmsi,
            name: String(meta.ShipName || "").trim() || "AIS vessel",
            latitude: lat,
            longitude: lon,
            speed: Number(payload.Sog),
            course: Number(payload.Cog),
            heading: Number(payload.TrueHeading)
          });
          if (ships.size >= 450) finish();
        } catch {}
      });

      socket.addEventListener("error", () => {
        clearTimeout(timer);
        clearTimeout(hardTimer);
        if (!settled) {
          settled = true;
          reject(new Error("AIS WebSocket connection failed"));
        }
      });

      socket.addEventListener("close", () => clearTimeout(hardTimer));
    });

    return json(200, {
      source: "AISStream",
      fetchedAt: new Date().toISOString(),
      bounds: { north, south, west, east },
      count: result.length,
      ships: result
    }, "private, max-age=10");
  } catch (error) {
    console.error("GeoPulse AIS snapshot error", error);
    return json(502, { error: "Live ship source unavailable", message: error.message });
  }
};