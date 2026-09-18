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

exports.handler = async function handler(event) {
  if (event.httpMethod !== "GET") return json(405, { error: "Method not allowed" }, "no-store");
  const apiKey = process.env.TICKETMASTER_API_KEY;
  if (!apiKey) return json(503, { error: "Major-events provider not configured", setup: "Set TICKETMASTER_API_KEY in Netlify." }, "no-store");

  try {
    const url = new URL("https://app.ticketmaster.com/discovery/v2/events.json");
    url.searchParams.set("apikey", apiKey);
    url.searchParams.set("size", "120");
    url.searchParams.set("sort", "date,asc");
    url.searchParams.set("startDateTime", new Date().toISOString().replace(/\.\d{3}Z$/, "Z"));

    const response = await fetch(url, { signal: AbortSignal.timeout(12000) });
    if (!response.ok) throw new Error("Ticketmaster HTTP " + response.status);
    const data = await response.json();
    const raw = data._embedded && Array.isArray(data._embedded.events) ? data._embedded.events : [];

    const events = raw.map((item) => {
      const venue = item._embedded && Array.isArray(item._embedded.venues) ? item._embedded.venues[0] : null;
      const location = venue && venue.location;
      const lat = location ? Number(location.latitude) : NaN;
      const lon = location ? Number(location.longitude) : NaN;
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
      const classification = Array.isArray(item.classifications) ? item.classifications[0] : null;
      const localDate = item.dates && item.dates.start ? item.dates.start.localDate : "";
      const localTime = item.dates && item.dates.start ? item.dates.start.localTime : "";
      const dateTime = item.dates && item.dates.start && item.dates.start.dateTime
        ? item.dates.start.dateTime
        : (localDate ? localDate + "T" + (localTime || "00:00:00") : null);

      return {
        id: item.id,
        name: item.name,
        url: item.url || null,
        latitude: lat,
        longitude: lon,
        venue: venue ? venue.name : "",
        city: venue && venue.city ? venue.city.name : "",
        country: venue && venue.country ? venue.country.name : "",
        category: classification && classification.segment ? classification.segment.name : "Event",
        dateTime
      };
    }).filter(Boolean);

    return json(200, {
      source: "Ticketmaster Discovery API",
      fetchedAt: new Date().toISOString(),
      count: events.length,
      events
    });
  } catch (error) {
    console.error("GeoPulse event provider error", error);
    return json(502, { error: "Major-events source unavailable", message: error.message }, "no-store");
  }
};