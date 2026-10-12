// URL-safe camera view serialization with strict bounds and no user identifiers.
(function (root) {
  'use strict';
  const MAPS = new Set(['satellite', 'streets', 'topo']);
  const finite = value => Number.isFinite(Number(value));
  function decode(search) {
    const qs = new URLSearchParams(search || '');
    for (const name of ['lat', 'lon', 'alt', 'heading', 'pitch']) {
      if (!qs.has(name) || !finite(qs.get(name))) return null;
    }
    const lat = Number(qs.get('lat'));
    const lon = Number(qs.get('lon'));
    const alt = Number(qs.get('alt'));
    const heading = Number(qs.get('heading'));
    const pitch = Number(qs.get('pitch'));
    const map = qs.get('map') || 'satellite';
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180 ||
        alt < 1 || alt > 30000000 || Math.abs(heading) > 360 ||
        pitch < -90 || pitch > 90 || !MAPS.has(map)) return null;
    return {lat, lon, alt, heading, pitch, map};
  }
  function build(base, view) {
    const url = new URL(base);
    const params = { lat: view.lat, lon: view.lon, alt: view.alt, heading: view.heading, pitch: view.pitch, map: view.map };
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
    if (!decode(url.search)) throw new Error('Invalid camera view');
    return url.toString();
  }
  const api = { decode, build };
  root.GeoPulseShare = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
