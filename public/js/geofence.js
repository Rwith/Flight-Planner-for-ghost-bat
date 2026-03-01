// ── Geofence management ───────────────────────────────────────────────────────

function initGeofence() {
  FlightPlanner.map.on(L.Draw.Event.CREATED, onGeofenceDrawn);

  document.getElementById('draw-geofence-btn')
    .addEventListener('click', activateDrawTool);

  document.getElementById('clear-geofence-btn')
    .addEventListener('click', clearGeofence);

  updateGeofenceStatus();
}

// ── Activate the polygon draw tool programmatically ───────────────────────────
function activateDrawTool() {
  // Trigger the Leaflet.Draw polygon tool
  new L.Draw.Polygon(FlightPlanner.map, FlightPlanner.drawControl.options.draw.polygon).enable();
}

// ── Handle a completed drawn polygon ─────────────────────────────────────────
function onGeofenceDrawn(e) {
  if (e.layerType !== 'polygon') return;

  // Remove previous geofence if one exists
  if (FlightPlanner.geofenceLayer) {
    FlightPlanner.featureGroup.removeLayer(FlightPlanner.geofenceLayer);
  }

  FlightPlanner.geofenceLayer = e.layer;
  FlightPlanner.featureGroup.addLayer(FlightPlanner.geofenceLayer);

  // Convert Leaflet LatLngs to Turf GeoJSON [lng, lat] coords
  // getLatLngs()[0] = outer ring of the polygon
  const latlngs = FlightPlanner.geofenceLayer.getLatLngs()[0];
  const coords = latlngs.map(ll => [ll.lng, ll.lat]);
  coords.push(coords[0]); // Close the ring (GeoJSON requirement)

  FlightPlanner.geofenceGeoJSON = turf.polygon([coords]);

  validateAllWaypointsAgainstGeofence();
  updateGeofenceStatus();
}

// ── Validate every waypoint against the active geofence ──────────────────────
// Called by both geofence.js (when fence changes) and waypoints.js (when wps change)
function validateAllWaypointsAgainstGeofence() {
  FlightPlanner.waypoints.forEach((wp, i) => {
    if (!FlightPlanner.geofenceGeoJSON) {
      wp.insideGeofence = true;
      wp.marker.setIcon(createWaypointIcon(i + 1, false));
      return;
    }

    // Turf expects [lng, lat]
    const point = turf.point([wp.latlng.lng, wp.latlng.lat]);
    const inside = turf.booleanPointInPolygon(point, FlightPlanner.geofenceGeoJSON);
    wp.insideGeofence = inside;
    wp.marker.setIcon(createWaypointIcon(i + 1, !inside));
  });
}

// ── Update the status badge and violation list ────────────────────────────────
function updateGeofenceStatus() {
  const badge = document.getElementById('geofence-status');
  const list  = document.getElementById('violation-list');
  list.innerHTML = '';

  if (!FlightPlanner.geofenceLayer) {
    badge.className = 'status-badge status-none';
    badge.textContent = 'No geofence defined';
    return;
  }

  if (FlightPlanner.waypoints.length === 0) {
    badge.className = 'status-badge status-ok';
    badge.textContent = 'Geofence active — no waypoints';
    return;
  }

  const violations = FlightPlanner.waypoints.filter(wp => !wp.insideGeofence);

  if (violations.length === 0) {
    badge.className = 'status-badge status-ok';
    badge.textContent = `All clear — ${FlightPlanner.waypoints.length} WP(s) inside zone`;
  } else {
    badge.className = 'status-badge status-violation';
    badge.textContent = `VIOLATION — ${violations.length} WP(s) outside zone`;

    violations.forEach(wp => {
      const li = document.createElement('li');
      li.textContent = `Waypoint ${wp.index + 1} is outside the safe zone`;
      list.appendChild(li);
    });
  }
}

// ── Clear the geofence ────────────────────────────────────────────────────────
function clearGeofence() {
  if (FlightPlanner.geofenceLayer) {
    FlightPlanner.featureGroup.removeLayer(FlightPlanner.geofenceLayer);
    FlightPlanner.geofenceLayer = null;
  }
  FlightPlanner.geofenceGeoJSON = null;

  // All waypoints revert to "inside" (no fence = no restriction)
  validateAllWaypointsAgainstGeofence();
  renderWaypointList();
  updateGeofenceStatus();
}
