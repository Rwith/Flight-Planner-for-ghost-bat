// ── Waypoint management ───────────────────────────────────────────────────────

function initWaypoints() {
  FlightPlanner.map.on('click', onMapClick);
  document.getElementById('clear-waypoints-btn')
    .addEventListener('click', clearAllWaypoints);
}

// ── Map click handler ─────────────────────────────────────────────────────────
function onMapClick(e) {
  // Ignore clicks that land on the Leaflet.Draw toolbar buttons
  if (e.originalEvent.target.closest('.leaflet-draw-toolbar')) return;
  // Ignore clicks on existing markers (bubbled up)
  if (e.originalEvent.target.closest('.wp-marker')) return;

  const id = FlightPlanner.nextWaypointId++;
  const latlng = e.latlng;
  const index = FlightPlanner.waypoints.length;

  const marker = L.marker(latlng, {
    icon: createWaypointIcon(index + 1, false),
    title: `Waypoint ${index + 1}`,
  }).addTo(FlightPlanner.map);

  const waypoint = { id, index, latlng, marker, insideGeofence: true };
  FlightPlanner.waypoints.push(waypoint);

  validateAllWaypointsAgainstGeofence();
  renderPolyline();
  renderWaypointList();
}

// ── Icon factory ──────────────────────────────────────────────────────────────
function createWaypointIcon(number, isOutside) {
  return L.divIcon({
    className: '', // Empty — prevent Leaflet's default white-box styling
    html: `<div class="wp-marker${isOutside ? ' outside' : ''}">${number}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -16],
  });
}

// ── Remove a single waypoint ──────────────────────────────────────────────────
function removeWaypoint(id) {
  const idx = FlightPlanner.waypoints.findIndex(w => w.id === id);
  if (idx === -1) return;

  FlightPlanner.map.removeLayer(FlightPlanner.waypoints[idx].marker);
  FlightPlanner.waypoints.splice(idx, 1);

  // Renumber all remaining waypoints
  FlightPlanner.waypoints.forEach((wp, i) => {
    wp.index = i;
    wp.marker.setIcon(createWaypointIcon(i + 1, !wp.insideGeofence));
  });

  renderPolyline();
  renderWaypointList();
  updateGeofenceStatus();
}

// ── Clear all waypoints ───────────────────────────────────────────────────────
function clearAllWaypoints() {
  FlightPlanner.waypoints.forEach(wp => FlightPlanner.map.removeLayer(wp.marker));
  FlightPlanner.waypoints = [];
  FlightPlanner.nextWaypointId = 1;

  if (FlightPlanner.waypointPolyline) {
    FlightPlanner.map.removeLayer(FlightPlanner.waypointPolyline);
    FlightPlanner.waypointPolyline = null;
  }

  document.getElementById('total-distance').textContent = '0.00 km';
  renderWaypointList();
  updateGeofenceStatus();
}

// ── Polyline drawing + distance ───────────────────────────────────────────────
function renderPolyline() {
  if (FlightPlanner.waypointPolyline) {
    FlightPlanner.map.removeLayer(FlightPlanner.waypointPolyline);
    FlightPlanner.waypointPolyline = null;
  }

  const wps = FlightPlanner.waypoints;

  if (wps.length < 2) {
    document.getElementById('total-distance').textContent = '0.00 km';
    return;
  }

  const latlngs = wps.map(wp => wp.latlng);

  FlightPlanner.waypointPolyline = L.polyline(latlngs, {
    color: '#7cfc00',
    weight: 2,
    opacity: 0.75,
    dashArray: '7, 5',
  }).addTo(FlightPlanner.map);

  // Sum Haversine distances between consecutive waypoints (Leaflet distanceTo = metres)
  let totalMetres = 0;
  for (let i = 0; i < latlngs.length - 1; i++) {
    totalMetres += latlngs[i].distanceTo(latlngs[i + 1]);
  }

  const display = totalMetres >= 1000
    ? `${(totalMetres / 1000).toFixed(2)} km`
    : `${Math.round(totalMetres)} m`;

  document.getElementById('total-distance').textContent = display;
}

// ── Sidebar list rendering ────────────────────────────────────────────────────
function renderWaypointList() {
  const list = document.getElementById('waypoint-list');
  list.innerHTML = '';

  if (FlightPlanner.waypoints.length === 0) {
    const li = document.createElement('li');
    li.className = 'empty-msg';
    li.textContent = 'No waypoints yet';
    list.appendChild(li);
    return;
  }

  FlightPlanner.waypoints.forEach((wp, i) => {
    const li = document.createElement('li');
    li.className = 'waypoint-item';

    const outside = FlightPlanner.geofenceGeoJSON && !wp.insideGeofence;

    li.innerHTML = `
      <span class="wp-num" style="${outside ? 'background:#e74c3c;' : ''}">${i + 1}</span>
      <span class="wp-coords">
        ${wp.latlng.lat.toFixed(5)}<br>
        ${wp.latlng.lng.toFixed(5)}
      </span>
      <button class="wp-remove" title="Remove waypoint ${i + 1}">&#x2715;</button>
    `;

    li.querySelector('.wp-remove')
      .addEventListener('click', () => removeWaypoint(wp.id));

    list.appendChild(li);
  });
}
