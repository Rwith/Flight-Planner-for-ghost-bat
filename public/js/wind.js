// ── Live wind particles ───────────────────────────────────────────────────────
// Fetches a grid of wind readings from Open-Meteo (free, no API key) and
// renders animated particles via leaflet-velocity.

const WIND_NX = 6;                     // grid columns (west → east)
const WIND_NY = 5;                     // grid rows    (north → south)
const WIND_REFRESH_MS = 10 * 60 * 1000; // auto-refresh every 10 minutes

let _windLayer = null;
let _windTimer = null;

function initWind() {
  fetchAndDisplayWind();

  // Re-fetch when the user pans or zooms to a new area (debounced)
  FlightPlanner.map.on('moveend', () => {
    clearTimeout(_windTimer);
    _windTimer = setTimeout(fetchAndDisplayWind, 1500);
  });
}

async function fetchAndDisplayWind() {
  const b     = FlightPlanner.map.getBounds();

  // Clamp to valid lat/lng ranges (Leaflet can return values beyond ±180 when wrapped)
  const north = Math.min( 90,  b.getNorth());
  const south = Math.max(-90,  b.getSouth());
  const west  = Math.max(-180, b.getWest());
  const east  = Math.min( 180, b.getEast());

  if (north <= south || east <= west) return;

  // Build a WIND_NX × WIND_NY grid — north-to-south rows, west-to-east columns
  const lats = [], lngs = [];
  for (let row = 0; row < WIND_NY; row++) {
    const lat = north - (north - south) * row / (WIND_NY - 1);
    for (let col = 0; col < WIND_NX; col++) {
      const lng = west + (east - west) * col / (WIND_NX - 1);
      lats.push(lat.toFixed(4));
      lngs.push(lng.toFixed(4));
    }
  }

  // Open-Meteo supports up to 100 locations per call; our 30-point grid fits easily
  const url = 'https://api.open-meteo.com/v1/forecast'
    + `?latitude=${lats.join(',')}&longitude=${lngs.join(',')}`
    + '&current=wind_speed_10m,wind_direction_10m'
    + '&wind_speed_unit=ms';  // metres/second

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();

    // Multi-location response is an array; single-location is a plain object
    const results = Array.isArray(json) ? json : [json];

    // Convert meteorological wind (FROM direction, speed in m/s) → U/V components
    // U = eastward component, V = northward component
    const uData = [], vData = [];
    results.forEach(loc => {
      const speed = loc.current?.wind_speed_10m    ?? 0; // m/s
      const dir   = loc.current?.wind_direction_10m ?? 0; // degrees FROM
      const rad   = dir * Math.PI / 180;
      uData.push(-speed * Math.sin(rad)); // eastward
      vData.push(-speed * Math.cos(rad)); // northward
    });

    // Build leaflet-velocity GRIB2-style header
    const dx = (east  - west)  / (WIND_NX - 1);
    const dy = (north - south) / (WIND_NY - 1);
    const baseHeader = {
      la1: north, lo1: west,
      la2: south, lo2: east,
      dx, dy,
      nx: WIND_NX, ny: WIND_NY,
      refTime: new Date().toISOString(),
    };

    const velocityData = [
      { header: { ...baseHeader, parameterCategory: 2, parameterNumber: 2 }, data: uData },
      { header: { ...baseHeader, parameterCategory: 2, parameterNumber: 3 }, data: vData },
    ];

    // Remove old layer before adding the new one
    if (_windLayer) FlightPlanner.map.removeLayer(_windLayer);

    _windLayer = L.velocityLayer({
      displayValues: true,
      displayOptions: {
        velocityType:    'Wind',
        position:        'bottomleft',
        emptyString:     'No wind data',
        angleConvention: 'bearingCW',
        speedUnit:       'm/s',
      },
      data:         velocityData,
      maxVelocity:  15,   // m/s — sets top of colour scale (~54 km/h)
      lineWidth:    1.5,
      colorScale:   ['#7cfc00', '#b8e63a', '#f39c12', '#e74c3c'],
    });

    _windLayer.addTo(FlightPlanner.map);

    // Schedule next automatic refresh
    clearTimeout(_windTimer);
    _windTimer = setTimeout(fetchAndDisplayWind, WIND_REFRESH_MS);

  } catch (err) {
    console.warn('Wind data fetch failed:', err);
  }
}
