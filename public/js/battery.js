// ── Battery / endurance calculator ────────────────────────────────────────────

const SAFETY_FACTOR = 0.80; // Only use 80% of rated capacity (protect LiPo cells)

function initBattery() {
  ['bat-capacity', 'bat-voltage', 'bat-current'].forEach(id => {
    document.getElementById(id).addEventListener('input', calculateBattery);
  });

  // Mission performance inputs — re-render waypoint list to update leg times
  ['mission-speed', 'wind-speed', 'wind-dir'].forEach(id => {
    document.getElementById(id).addEventListener('input', () => {
      renderWaypointList();
      updateMissionEstTime();
    });
  });

  // Calculate immediately with whatever defaults are in the fields
  calculateBattery();
}

function calculateBattery() {
  const capacity_mAh = parseFloat(document.getElementById('bat-capacity').value);
  const voltage_V    = parseFloat(document.getElementById('bat-voltage').value);
  const current_A    = parseFloat(document.getElementById('bat-current').value);

  const errEl = document.getElementById('battery-error');

  // Validate
  if (isNaN(capacity_mAh) || isNaN(voltage_V) || isNaN(current_A)) {
    showError(errEl, 'Enter values in all three fields.');
    clearResults();
    return;
  }

  if (capacity_mAh <= 0 || voltage_V <= 0 || current_A <= 0) {
    showError(errEl, 'All values must be greater than zero.');
    clearResults();
    return;
  }

  hideError(errEl);

  // ── Calculations ───────────────────────────────────────────────────────────
  const usable_mAh      = capacity_mAh * SAFETY_FACTOR;
  const usable_Ah       = usable_mAh / 1000;
  const flightTime_h    = usable_Ah / current_A;
  const flightTime_min  = flightTime_h * 60;
  const mins            = Math.floor(flightTime_min);
  const secs            = Math.round((flightTime_min - mins) * 60);

  const energy_Wh       = (capacity_mAh / 1000) * voltage_V;
  const usableEnergy_Wh = energy_Wh * SAFETY_FACTOR;

  // ── Display ────────────────────────────────────────────────────────────────
  document.getElementById('flight-time').textContent =
    `${mins}m ${String(secs).padStart(2, '0')}s`;

  document.getElementById('watt-hours').textContent =
    `${usableEnergy_Wh.toFixed(1)} Wh (of ${energy_Wh.toFixed(1)} Wh)`;
}

function clearResults() {
  document.getElementById('flight-time').textContent = '—';
  document.getElementById('watt-hours').textContent  = '—';
}

function showError(el, msg) {
  el.textContent = msg;
  el.hidden = false;
}

function hideError(el) {
  el.hidden = true;
  el.textContent = '';
}
