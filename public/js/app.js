// ── Global state ──────────────────────────────────────────────────────────────
window.FlightPlanner = {
  // Map
  map: null,
  drawControl: null,
  featureGroup: null,

  // Waypoints
  waypoints: [],          // [{ id, index, latlng, marker, insideGeofence }]
  waypointPolyline: null,
  nextWaypointId: 1,

  // Geofence
  geofenceLayer: null,
  geofenceGeoJSON: null,  // Turf-compatible GeoJSON polygon

  // Defaults — centre on Australia (Ghost Bat's home country)
  MAP_DEFAULT_CENTER: [-25.2744, 133.7751],
  MAP_DEFAULT_ZOOM: 5,
};

// ── Bootstrap ─────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initMap();
  initWaypoints();
  initGeofence();
  initBattery();
  initTabs();
  initWind();
});

// ── Map initialisation ────────────────────────────────────────────────────────
function initMap() {
  const fp = FlightPlanner;

  fp.map = L.map('map', {
    center: fp.MAP_DEFAULT_CENTER,
    zoom: fp.MAP_DEFAULT_ZOOM,
    zoomControl: true,
  });

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19,
  }).addTo(fp.map);

  // Feature group used by Leaflet.Draw to store the drawn geofence
  fp.featureGroup = new L.FeatureGroup().addTo(fp.map);

  // Only expose the polygon draw tool (for geofence)
  fp.drawControl = new L.Control.Draw({
    position: 'topleft',
    draw: {
      polygon: {
        allowIntersection: false,
        showArea: true,
        shapeOptions: {
          color: '#f39c12',
          fillColor: '#f39c12',
          fillOpacity: 0.12,
          weight: 2,
        },
      },
      polyline: false,
      rectangle: false,
      circle: false,
      circlemarker: false,
      marker: false,
    },
    edit: {
      featureGroup: fp.featureGroup,
      remove: false, // Removal handled by the "Clear Zone" button
    },
  }).addTo(fp.map);
}

// ── Tab switching ─────────────────────────────────────────────────────────────
function initTabs() {
  const buttons = document.querySelectorAll('.tab-btn');
  const panels  = document.querySelectorAll('.tab-panel');

  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.tab;

      buttons.forEach(b => b.classList.toggle('active', b === btn));
      panels.forEach(p => {
        p.classList.toggle('active', p.id === `tab-${target}`);
      });
    });
  });
}
