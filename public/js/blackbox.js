// ── ArduPilot DataFlash Binary (.bin) Blackbox Decoder ────────────────────────
// Parses DataFlash binary logs and overlays the GPS track on the mission map.
// Supported messages: FMT (auto-detected), GPS, CURR/BAT, MODE.

const _BB = {
  HEAD1:    0xA3,
  HEAD2:    0x95,
  FMT_TYPE: 0x80,
  trackLayer: null,

  // Format char → byte size (from AP_Logger/LogStructure.h)
  SZ: {
    a: 64, b: 1,  B: 1,  h: 2,  H: 2,  c: 2,  C: 2,
    i: 4,  I: 4,  e: 4,  E: 4,  L: 4,  f: 4,
    q: 8,  Q: 8,  d: 8,  n: 4,  N: 16, Z: 64, M: 1,
  },
};

// ArduPlane flight mode names (indexed by mode number)
const _PLANE_MODES = [
  'Manual','Circle','Stabilize','Training','ACRO','FBW-A','FBW-B',
  'Cruise','AUTOTUNE','Auto','RTL','Loiter','Takeoff','AVOID_ADSB',
  'Guided','Initialising','QSTABILIZE','QHOVER','QLOITER','QLAND',
  'QRTL','QAUTOTUNE','QACRO','Thermal','Loiter to QLand',
];

// ── Init ───────────────────────────────────────────────────────────────────────
function initBlackbox() {
  const fileInput = document.getElementById('bb-file');
  const dropZone  = document.getElementById('bb-drop');
  const clearBtn  = document.getElementById('bb-clear-btn');

  fileInput.addEventListener('change', e => {
    if (e.target.files[0]) _bbLoad(e.target.files[0]);
  });

  dropZone.addEventListener('dragover',  e => { e.preventDefault(); dropZone.classList.add('bb-drag'); });
  dropZone.addEventListener('dragleave', ()  => dropZone.classList.remove('bb-drag'));
  dropZone.addEventListener('drop', e => {
    e.preventDefault();
    dropZone.classList.remove('bb-drag');
    if (e.dataTransfer.files[0]) _bbLoad(e.dataTransfer.files[0]);
  });

  clearBtn.addEventListener('click', _bbClear);
}

// ── Load & parse ───────────────────────────────────────────────────────────────
async function _bbLoad(file) {
  _bbSetStatus('Parsing…', 'parsing');
  try {
    const buf    = await file.arrayBuffer();
    const result = _bbParse(buf);
    _bbDisplay(result, file.name);
  } catch (err) {
    console.error('Blackbox parse error:', err);
    _bbSetStatus(`Parse error: ${err.message}`, 'error');
  }
}

function _bbParse(buffer) {
  const view = new DataView(buffer);
  const u8   = new Uint8Array(buffer);
  const len  = buffer.byteLength;

  const formats    = {};  // type_id → { name, fmt, labels[], len }
  const gpsPoints  = [];  // { lat, lng, alt, spd, timeUs }
  const currPoints = [];  // { volt }
  const modes      = [];  // mode number

  let i = 0;
  while (i < len - 2) {
    if (u8[i] !== _BB.HEAD1 || u8[i + 1] !== _BB.HEAD2) { i++; continue; }

    const type = u8[i + 2];

    // ── FMT record (always 89 bytes) ─────────────────────────────────────────
    if (type === _BB.FMT_TYPE) {
      if (i + 89 > len) break;
      const msgType = u8[i + 3];
      const msgLen  = u8[i + 4];
      const name    = _bbStr(u8, i + 5,  4).trim();
      const fmt     = _bbStr(u8, i + 9,  16).replace(/\0/g, '');
      const lblRaw  = _bbStr(u8, i + 25, 64);
      const labels  = lblRaw.split(',').map(s => s.trim());
      formats[msgType] = { name, fmt, labels, len: msgLen };
      i += 89;
      continue;
    }

    // ── Data record ──────────────────────────────────────────────────────────
    const fmtDef = formats[type];
    if (!fmtDef || !fmtDef.len) { i++; continue; }

    if (i + fmtDef.len > len) break;

    const fields = _bbReadRecord(view, u8, i + 3, fmtDef.fmt, fmtDef.labels);

    switch (fmtDef.name) {
      case 'GPS':
      case 'GPS2': {
        const status = fields['Status'] ?? 0;
        const lat    = fields['Lat'];
        const lng    = fields['Lng'];
        if (status >= 3 && lat != null && lng != null && isFinite(lat) && isFinite(lng)) {
          gpsPoints.push({
            lat,
            lng,
            alt:    fields['Alt']    ?? 0,
            spd:    fields['Spd']    ?? 0,  // m/s
            timeUs: fields['TimeUS'] ?? 0,
          });
        }
        break;
      }
      case 'CURR':
      case 'BAT': {
        const volt = fields['Volt'];
        if (volt != null && isFinite(volt) && volt > 1) currPoints.push(volt);
        break;
      }
      case 'MODE': {
        const m = fields['Mode'] ?? fields['FlightMode'];
        if (m != null) modes.push(m);
        break;
      }
    }

    i += fmtDef.len;
  }

  return { gpsPoints, currPoints, modes };
}

// ── Binary helpers ─────────────────────────────────────────────────────────────
function _bbStr(u8, offset, maxLen) {
  let s = '';
  for (let j = 0; j < maxLen; j++) {
    const c = u8[offset + j];
    if (c === 0) break;
    s += String.fromCharCode(c);
  }
  return s;
}

function _bbReadRecord(view, u8, offset, fmt, labels) {
  const fields = {};
  let pos = offset, li = 0;

  for (const c of fmt) {
    const sz    = _BB.SZ[c] ?? 0;
    const label = (labels[li] ?? '').trim();
    let   val   = null;

    try {
      switch (c) {
        case 'b': val = view.getInt8(pos); break;
        case 'B': case 'M': val = view.getUint8(pos); break;
        case 'h': val = view.getInt16(pos, true); break;
        case 'H': val = view.getUint16(pos, true); break;
        case 'c': val = view.getInt16(pos, true)  / 100; break;
        case 'C': val = view.getUint16(pos, true) / 100; break;
        case 'i': val = view.getInt32(pos, true); break;
        case 'I': val = view.getUint32(pos, true); break;
        case 'e': val = view.getInt32(pos, true)  / 100; break;
        case 'E': val = view.getUint32(pos, true) / 100; break;
        case 'L': val = view.getInt32(pos, true)  / 1e7; break;
        case 'f': val = view.getFloat32(pos, true); break;
        case 'd': val = view.getFloat64(pos, true); break;
        case 'Q': {
          const lo = view.getUint32(pos,     true);
          const hi = view.getUint32(pos + 4, true);
          val = hi * 4294967296 + lo; break;
        }
        case 'q': {
          const lo = view.getUint32(pos,     true);
          const hi = view.getInt32(pos + 4,  true);
          val = hi * 4294967296 + lo; break;
        }
        case 'n': val = _bbStr(u8, pos, 4);  break;
        case 'N': val = _bbStr(u8, pos, 16); break;
        case 'Z': val = _bbStr(u8, pos, 64); break;
        // 'a' (int16[32]) — skip
      }
    } catch (_) { /* ignore out-of-bounds */ }

    if (label) fields[label] = val;
    pos += sz;
    li++;
  }

  return fields;
}

// ── Display ────────────────────────────────────────────────────────────────────
function _bbDisplay({ gpsPoints, currPoints, modes }, filename) {
  if (_BB.trackLayer) {
    FlightPlanner.map.removeLayer(_BB.trackLayer);
    _BB.trackLayer = null;
  }

  if (gpsPoints.length < 2) {
    _bbSetStatus('No valid GPS fix data found in log', 'error');
    return;
  }

  const latlngs = gpsPoints.map(p => [p.lat, p.lng]);

  _BB.trackLayer = L.layerGroup();

  L.polyline(latlngs, { color: '#00bfff', weight: 2.5, opacity: 0.9 })
   .addTo(_BB.trackLayer);

  L.circleMarker(latlngs[0], {
    radius: 6, color: '#7cfc00', fillColor: '#7cfc00', fillOpacity: 1, weight: 2,
  }).bindTooltip('Start', { permanent: false }).addTo(_BB.trackLayer);

  L.circleMarker(latlngs[latlngs.length - 1], {
    radius: 6, color: '#e74c3c', fillColor: '#e74c3c', fillOpacity: 1, weight: 2,
  }).bindTooltip('End', { permanent: false }).addTo(_BB.trackLayer);

  _BB.trackLayer.addTo(FlightPlanner.map);
  FlightPlanner.map.fitBounds(L.polyline(latlngs).getBounds(), { padding: [30, 30] });

  // ── Stats ──────────────────────────────────────────────────────────────────
  const first = gpsPoints[0], last = gpsPoints[gpsPoints.length - 1];
  const durS  = (last.timeUs - first.timeUs) / 1e6;

  let distKm = 0;
  for (let j = 1; j < gpsPoints.length; j++) distKm += _haversineKm(gpsPoints[j-1], gpsPoints[j]);

  const maxAltM  = Math.max(...gpsPoints.map(p => p.alt).filter(isFinite));
  const maxSpdKh = Math.max(...gpsPoints.map(p => p.spd).filter(isFinite)) * 3.6;
  const minVolt  = currPoints.length ? Math.min(...currPoints) : null;

  const usedModes = [...new Set(modes)].map(m => _PLANE_MODES[m] ?? `Mode ${m}`);

  const rows = [
    ['Duration',        durS > 0 ? _fmtDur(durS) : '—'],
    ['Distance',        `${distKm.toFixed(2)} km`],
    ['Max Altitude',    `${maxAltM.toFixed(0)} m`],
    ['Max Ground Speed',`${maxSpdKh.toFixed(0)} km/h`],
    ...(minVolt != null ? [['Min Voltage', `${minVolt.toFixed(2)} V`]] : []),
    ['GPS Points',      gpsPoints.length.toLocaleString()],
    ...(usedModes.length ? [['Flight Modes', usedModes.join(', ')]] : []),
  ];

  document.getElementById('bb-stats').innerHTML =
    rows.map(([k, v]) => `<div class="bb-stat-row"><span>${k}</span><strong>${v}</strong></div>`).join('');

  _bbSetStatus(filename, 'ok');
}

function _bbClear() {
  if (_BB.trackLayer) { FlightPlanner.map.removeLayer(_BB.trackLayer); _BB.trackLayer = null; }
  document.getElementById('bb-stats').innerHTML = '';
  document.getElementById('bb-file').value = '';
  _bbSetStatus('No log loaded', '');
}

function _bbSetStatus(msg, cls) {
  const el = document.getElementById('bb-status');
  el.textContent = msg;
  el.className   = `bb-status${cls ? ' bb-' + cls : ''}`;
}

// ── Maths ──────────────────────────────────────────────────────────────────────
function _haversineKm(a, b) {
  const R    = 6371;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const s    = Math.sin(dLat / 2) ** 2
             + Math.cos(a.lat * Math.PI / 180)
             * Math.cos(b.lat * Math.PI / 180)
             * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(s));
}

function _fmtDur(secs) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  return h > 0
    ? `${h}h ${String(m).padStart(2,'0')}m ${String(s).padStart(2,'0')}s`
    : `${m}m ${String(s).padStart(2,'0')}s`;
}
