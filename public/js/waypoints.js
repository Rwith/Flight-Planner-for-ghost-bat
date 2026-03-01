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

  const waypoint = { id, index, latlng, altitude: 0, marker, insideGeofence: true };
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
  document.getElementById('mission-est-time').textContent = '—';
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
    document.getElementById('mission-est-time').textContent = '—';
    return;
  }

  const latlngs = wps.map(wp => wp.latlng);

  FlightPlanner.waypointPolyline = L.polyline(latlngs, {
    color: '#7cfc00',
    weight: 2,
    opacity: 0.75,
    dashArray: '7, 5',
  }).addTo(FlightPlanner.map);

  // Sum horizontal distances between consecutive waypoints
  let totalMetres = 0;
  for (let i = 0; i < latlngs.length - 1; i++) {
    totalMetres += latlngs[i].distanceTo(latlngs[i + 1]);
  }

  const display = totalMetres >= 1000
    ? `${(totalMetres / 1000).toFixed(2)} km`
    : `${Math.round(totalMetres)} m`;

  document.getElementById('total-distance').textContent = display;
  updateMissionEstTime();
}

// ── Mission time estimate ─────────────────────────────────────────────────────
function updateMissionEstTime() {
  const el = document.getElementById('mission-est-time');
  if (!el) return;

  const wps = FlightPlanner.waypoints;
  if (wps.length < 2) { el.textContent = '—'; return; }

  const { airspeed, windSpeed, windDir } = getMissionParams();
  if (airspeed <= 0) { el.textContent = '—'; return; }

  let totalTime_s = 0;
  for (let i = 0; i < wps.length - 1; i++) {
    const horizDist = wps[i].latlng.distanceTo(wps[i + 1].latlng); // metres
    const altDiff   = wps[i + 1].altitude - wps[i].altitude;       // metres
    const slantDist = Math.sqrt(horizDist * horizDist + altDiff * altDiff);
    const bearing   = calcBearing(wps[i].latlng, wps[i + 1].latlng);
    const gs        = calcLegGroundspeed(bearing, airspeed, windSpeed, windDir);
    totalTime_s    += (slantDist / 1000) / gs * 3600;
  }

  const mins = Math.floor(totalTime_s / 60);
  const secs = Math.round(totalTime_s % 60);
  el.textContent = `${mins}m ${String(secs).padStart(2, '0')}s`;
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

  const { airspeed, windSpeed, windDir } = getMissionParams();

  FlightPlanner.waypoints.forEach((wp, i) => {
    const li = document.createElement('li');
    li.className = 'waypoint-item';

    const outside = FlightPlanner.geofenceGeoJSON && !wp.insideGeofence;

    // Altitude change badge from previous waypoint
    let altChangeHtml = '';
    if (i > 0) {
      const diff = wp.altitude - FlightPlanner.waypoints[i - 1].altitude;
      if (diff !== 0) {
        const cls   = diff > 0 ? 'climb' : 'descent';
        const arrow = diff > 0 ? '▲' : '▼';
        altChangeHtml = `<span class="wp-alt-change ${cls}">${arrow}${Math.abs(diff)}m</span>`;
      }
    }

    // Leg info to next waypoint
    let legHtml = '';
    if (i < FlightPlanner.waypoints.length - 1) {
      const nextWp    = FlightPlanner.waypoints[i + 1];
      const horizDist = wp.latlng.distanceTo(nextWp.latlng);
      const altDiff   = nextWp.altitude - wp.altitude;
      const slantDist = Math.sqrt(horizDist * horizDist + altDiff * altDiff);
      const distLabel = horizDist >= 1000
        ? `${(horizDist / 1000).toFixed(2)}km`
        : `${Math.round(horizDist)}m`;

      let timeLabel = '';
      if (airspeed > 0) {
        const bearing = calcBearing(wp.latlng, nextWp.latlng);
        const gs      = calcLegGroundspeed(bearing, airspeed, windSpeed, windDir);
        const time_s  = (slantDist / 1000) / gs * 3600;
        const m       = Math.floor(time_s / 60);
        const s       = Math.round(time_s % 60);
        timeLabel     = ` ${m}m${String(s).padStart(2, '0')}s`;
      }

      legHtml = `<span class="wp-leg-info">→ WP${i + 2}: ${distLabel}${timeLabel}</span>`;
    }

    li.innerHTML = `
      <div class="wp-row-top">
        <span class="wp-num" style="${outside ? 'background:#e74c3c;' : ''}">${i + 1}</span>
        <span class="wp-coords">${wp.latlng.lat.toFixed(5)}, ${wp.latlng.lng.toFixed(5)}</span>
        <button class="wp-remove" title="Remove waypoint ${i + 1}">&#x2715;</button>
      </div>
      <div class="wp-row-bottom">
        <label class="wp-alt-label">Alt <input type="number" class="wp-alt-input" value="${wp.altitude}" min="0" step="10"> m</label>
        ${altChangeHtml}${legHtml}
      </div>
    `;

    li.querySelector('.wp-remove').addEventListener('click', () => removeWaypoint(wp.id));
    li.querySelector('.wp-alt-input').addEventListener('change', e => {
      wp.altitude = parseFloat(e.target.value) || 0;
      renderWaypointList();
      updateMissionEstTime();
    });

    list.appendChild(li);
  });
}

// ── Bearing between two Leaflet LatLngs (degrees, 0=N clockwise) ──────────────
function calcBearing(latlng1, latlng2) {
  const lat1 = latlng1.lat * Math.PI / 180;
  const lat2 = latlng2.lat * Math.PI / 180;
  const dLng = (latlng2.lng - latlng1.lng) * Math.PI / 180;
  const y    = Math.sin(dLng) * Math.cos(lat2);
  const x    = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

// ── Wind-adjusted groundspeed (km/h) ─────────────────────────────────────────
// Returns groundspeed along the track bearing, accounting for wind.
// windDir = direction the wind blows FROM (met convention, degrees).
function calcLegGroundspeed(bearing_deg, airspeed_kmh, windSpeed_kmh, windDir_deg) {
  const angleDiff = (bearing_deg - windDir_deg) * Math.PI / 180;
  return Math.max(airspeed_kmh - windSpeed_kmh * Math.cos(angleDiff), 1);
}

// ── Read mission performance inputs ──────────────────────────────────────────
function getMissionParams() {
  return {
    airspeed:  parseFloat(document.getElementById('mission-speed')?.value) || 0,
    windSpeed: parseFloat(document.getElementById('wind-speed')?.value)    || 0,
    windDir:   parseFloat(document.getElementById('wind-dir')?.value)      || 0,
  };
}
