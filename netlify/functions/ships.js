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

function finite(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function safeText(value) {
  const text = String(value ?? "").trim();
  return text || null;
}

function extractStatic(message) {
  const payload = message && (
    message.ShipStaticData ||
    message.StaticDataReport
  );
  if (!payload || typeof payload !== "object") return null;

  const dim = payload.Dimension || payload.DimensionToBow !== undefined ? {
    toBow: finite(payload.DimensionToBow ?? payload.Dimension?.A),
    toStern: finite(payload.DimensionToStern ?? payload.Dimension?.B),
    toPort: finite(payload.DimensionToPort ?? payload.Dimension?.C),
    toStarboard: finite(payload.DimensionToStarboard ?? payload.Dimension?.D)
  } : null;

  return {
    callSign: safeText(payload.CallSign),
    imo: finite(payload.ImoNumber ?? payload.IMO),
    vesselName: safeText(payload.Name ?? payload.VesselName),
    shipType: finite(payload.Type ?? payload.ShipType),
    destination: safeText(payload.Destination),
    draught: finite(payload.MaximumStaticDraught ?? payload.Draught),
    etaMonth: finite(payload.Eta?.Month ?? payload.ETA?.Month),
    etaDay: finite(payload.Eta?.Day ?? payload.ETA?.Day),
    etaHour: finite(payload.Eta?.Hour ?? payload.ETA?.Hour),
    etaMinute: finite(payload.Eta?.Minute ?? payload.ETA?.Minute),
    dimensions: dim
  };
}

exports.handler = async function handler(event) {
  if (event.httpMethod !== "GET") return json(405, { error: "Method not allowed" });

  const apiKey = process.env.AISSTREAM_API_KEY;
  if (!apiKey) {
    return json(503, {
      error: "Live AIS provider not configured",
      setup: "Set AISSTREAM_API_KEY in Netlify. AISStream requires a server-side key."
    });
  }

  const q = event.queryStringParameters || {};
  const north = Math.min(90, finite(q.north, 70));
  const south = Math.max(-90, finite(q.south, -60));
  const west = Math.max(-180, finite(q.west, -180));
  const east = Math.min(180, finite(q.east, 180));
  if (south >= north || west >= east) return json(400, { error: "Invalid bounding box" });

  try {
    const ships = new Map();
    const staticByMmsi = new Map();
    const socket = new WebSocket("wss://stream.aisstream.io/v0/stream");
    let settled = false;

    const result = await new Promise((resolve, reject) => {
      const finish = () => {
        if (settled) return;
        settled = true;
        try { socket.close(); } catch {}
        resolve(Array.from(ships.values()).slice(0, 700));
      };

      const timer = setTimeout(finish, 4200);
      const hardTimer = setTimeout(() => {
        clearTimeout(timer);
        if (!settled) {
          settled = true;
          try { socket.close(); } catch {}
          reject(new Error("AIS snapshot timeout"));
        }
      }, 6500);

      socket.addEventListener("open", () => {
        socket.send(JSON.stringify({
          APIKey: apiKey,
          BoundingBoxes: [[[north, west], [south, east]]],
          FilterMessageTypes: [
            "PositionReport",
            "StandardClassBPositionReport",
            "ExtendedClassBPositionReport",
            "ShipStaticData",
            "StaticDataReport"
          ]
        }));
      });

      socket.addEventListener("message", (evt) => {
        try {
          const msg = JSON.parse(String(evt.data));
          const meta = msg.MetaData || {};
          const messageType = msg.MessageType || "AIS";

          if (messageType === "ShipStaticData" || messageType === "StaticDataReport") {
            const mmsi = String(meta.MMSI || "");
            const staticInfo = extractStatic(msg.Message);
            if (mmsi && staticInfo) {
              staticByMmsi.set(mmsi, staticInfo);
              if (ships.has(mmsi)) Object.assign(ships.get(mmsi), staticInfo);
            }
            return;
          }

          const payload = msg.Message && (
            msg.Message.PositionReport ||
            msg.Message.StandardClassBPositionReport ||
            msg.Message.ExtendedClassBPositionReport
          ) || {};
          const lat = finite(meta.Latitude ?? payload.Latitude);
          const lon = finite(meta.Longitude ?? payload.Longitude);
          if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;

          const mmsi = String(meta.MMSI || payload.UserID || lat + ":" + lon);
          const staticInfo = staticByMmsi.get(mmsi) || {};
          ships.set(mmsi, {
            mmsi,
            name: safeText(meta.ShipName) || staticInfo.vesselName || "AIS vessel",
            latitude: lat,
            longitude: lon,
            speed: finite(payload.Sog),
            course: finite(payload.Cog),
            heading: finite(payload.TrueHeading),
            navigationalStatus: finite(payload.NavigationalStatus),
            rateOfTurn: finite(payload.RateOfTurn),
            positionAccuracy: typeof payload.PositionAccuracy === "boolean" ? payload.PositionAccuracy : null,
            aisTimestampSecond: finite(payload.Timestamp),
            messageType,
            receivedAt: new Date().toISOString(),
            ...staticInfo
          });

          if (ships.size >= 700) finish();
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
      coverage: "live viewport snapshot",
      fetchedAt: new Date().toISOString(),
      bounds: { north, south, west, east },
      count: result.length,
      ships: result
    }, "private, max-age=8");
  } catch (error) {
    console.error("GeoPulse AIS snapshot error", error);
    return json(502, { error: "Live ship source unavailable", message: error.message });
  }
};