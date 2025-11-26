
/* Smart Bus Tracking – Demo UI (no backend) */

const els = {
  routeSelect: document.getElementById('routeSelect'),
  busSelect: document.getElementById('busSelect'),
  driverName: document.querySelector('[data-field="driverName"]'),
  driverPhone: document.querySelector('[data-field="driverPhone"]'),
  stopsList: document.getElementById('stopsList'),
  infoBusName: document.getElementById('infoBusName'),
  infoSpeed: document.getElementById('infoSpeed'),
  infoLastUpdate: document.getElementById('infoLastUpdate'),
  trafficToggle: document.getElementById('trafficToggle'),
  altRouteToggle: document.getElementById('altRouteToggle'),
  btnLocate: document.getElementById('btnLocate'),
  userEta: document.getElementById('userEta'),
  btnEmergency: document.getElementById('btnEmergency'),
  emergencyModal: document.getElementById('emergencyModal'),
  emergencyForm: document.getElementById('emergencyForm'),
  btnCloseModal: document.getElementById('btnCloseModal'),
  toast: document.getElementById('toast')
};

let map, busMarker, userMarker, trafficLayer, routePolyline, altRoutePolyline;
let busMarkers = {}; // multi-bus markers by busId
let busSubs = {}; // subscriptions by busId
let busLastSeen = {}; // last-seen timestamps by busId
const busColors = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];
let markerThrottler = null; // initialized after performance.js loads
let virtualStopsList = null; // virtual scroll instance
let state = {
  data: null,
  route: null,
  bus: null,
  t: 0,
  lastTick: Date.now(),
  speedKmhBase: 28, // base bus speed
  trafficFactor: 1,
  timer: null,
  liveMode: false,
  currentSpeedMs: null,
  presenceChannel: null,
  presenceCount: 0,
  lastPositions: [] // keep recent positions for predictive ETA
};
let positionsChannel = null;
// Rate limiting: max 60 updates per minute per bus
const RateLimiter = (function(){
  const buckets = new Map();
  const MAX_PER_MIN = 60; // 60 updates/min
  function allow(id){
    const now = Date.now();
    let b = buckets.get(id);
    if(!b){ b = { wStart: now, count: 0 }; buckets.set(id, b); }
    // slide window
    if(now - b.wStart >= 60*1000){ b.wStart = now; b.count = 0; }
    if(b.count >= MAX_PER_MIN) return false;
    b.count++; return true;
  }
  return { allow };
})();

// Geofencing helpers
let geoFence = { active: true, stop: null, inside: false };
function updateGeofence(){
  try{
    if(!state.route || !state.route.stops || state.route.stops.length===0) return;
    const p = userMarker ? userMarker.getLatLng() : null;
    const ref = p ? [p.lat, p.lng] : (busMarker ? [busMarker.getLatLng().lat, busMarker.getLatLng().lng] : null);
    if(!ref) return;
    geoFence.stop = nearestStop(ref, state.route.stops);
  }catch{}
}
function checkGeofence(){
  if(!geoFence.active || !geoFence.stop || !userMarker) return;
  const p = userMarker.getLatLng();
  const d = haversine([p.lat, p.lng], [geoFence.stop.lat, geoFence.stop.lng]);
  const wasInside = geoFence.inside; const nowInside = d <= 200;
  geoFence.inside = nowInside;
  if(nowInside && !wasInside){ toast(`Entered ${geoFence.stop.name} zone`); if('vibrate' in navigator){ try{ navigator.vibrate(20);}catch{} } }
  if(!nowInside && wasInside){ toast(`Left ${geoFence.stop.name} zone`); }
}

init();

async function init(){
  map = L.map('map', { zoomControl: false }).setView([17.385, 78.4867], 12);
  L.control.zoom({ position: 'topright' }).addTo(map);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 20,
    attribution: '&copy; OpenStreetMap'
  }).addTo(map);

  // Prefer Supabase data with retry and cache fallback
  if(window.SB && typeof SB.getRoutesWithDetails === 'function'){
    try {
      const routes = await ErrorHandler.withRetry(() => SB.getRoutesWithDetails(), 'getRoutes');
      state.data = { routes };
      state.liveMode = true;
      CacheManager.cacheRoutes(routes);
    } catch (e){
      console.warn('Supabase route load failed, trying cache/local', e);
      const cached = CacheManager.getCachedRoutes();
      if(cached){
        state.data = { routes: cached };
        state.liveMode = false;
        ErrorHandler.showToast('Using cached routes (offline mode)', 'info');
      } else {
        const res = await fetch('assets/data/routes.json');
        state.data = await res.json();
      }
    }
  } else {
    const res = await fetch('assets/data/routes.json');
    state.data = await res.json();
  }

  // Query params preselect
  const params = new URLSearchParams(location.search);
  const routeParam = params.get('route');
  const busParam = params.get('bus');

  els.routeSelect.innerHTML = state.data.routes.map(r => `<option value="${r.id || r.code}">${r.name}</option>`).join('');
  // Enable controls once routes are loaded
  try { els.busSelect.disabled = false; document.getElementById('trafficToggle').disabled = false; document.getElementById('altRouteToggle').disabled = false; } catch{}
  if(routeParam){ els.routeSelect.value = routeParam; }
  onRouteChange();
  if(busParam){ els.busSelect.value = busParam; }
  onBusChange();

  // Events
  els.routeSelect.addEventListener('change', onRouteChange);
  // Debounce bus change to avoid toast spam
  let busChangeTimer = null;
  els.busSelect.addEventListener('change', () => {
    clearTimeout(busChangeTimer);
    busChangeTimer = setTimeout(() => {
      onBusChange();
      try{ UI.toast && UI.toast(`Bus changed to ${els.busSelect.value}`, 'info'); }catch{}
      // Brief pulse on main bus marker for confirmation
      try{
        if(busMarker && busMarker._icon){
          const el = busMarker._icon.firstChild;
          el.style.transition = 'transform .25s ease';
          el.style.transform = 'scale(1.2)';
          setTimeout(()=>{ el.style.transform = 'scale(1)'; }, 250);
        }
      }catch{}
    }, 150);
  });
  const busMulti = document.getElementById('busMulti');
  if(busMulti){ busMulti.addEventListener('change', onBusMultiChange); }
  els.trafficToggle.addEventListener('change', onTrafficToggle);
  els.altRouteToggle.addEventListener('change', onAltRouteToggle);
  // Microcopy: add concise titles
  try{
    els.routeSelect.title = 'Select a route';
    els.busSelect.title = 'Select a bus';
    els.btnLocate.title = 'Locate me and show nearest stop';
    els.btnEmergency.title = 'Open emergency alert form';
    els.trafficToggle.title = 'Toggle traffic congestion overlay';
    els.altRouteToggle.title = 'Toggle alternate route overlay';
    // ARIA labels for screen readers
    els.routeSelect.setAttribute('aria-label', 'Select route');
    els.busSelect.setAttribute('aria-label', 'Select bus');
    els.btnLocate.setAttribute('aria-label', 'Locate me');
    els.btnEmergency.setAttribute('aria-label', 'Open emergency form');
    els.trafficToggle.setAttribute('aria-label', 'Traffic overlay');
    els.altRouteToggle.setAttribute('aria-label', 'Alternate route overlay');
  }catch{}
  els.btnLocate.addEventListener('click', locateMe);
  els.btnEmergency.addEventListener('click', () => els.emergencyModal.showModal());
  els.btnCloseModal.addEventListener('click', () => els.emergencyModal.close());
  els.emergencyForm.addEventListener('submit', sendEmergency);
  // Geofence checks periodically
  setInterval(checkGeofence, 2000);

  if(!state.liveMode){
    tick();
    state.timer = setInterval(tick, 1000);
  }

  // If live mode, set initial status badge
  const liveEl = document.getElementById('liveStatus');
  if(liveEl){ liveEl.textContent = state.liveMode ? 'Connecting…' : 'Demo'; liveEl.style.color = state.liveMode ? '#f59e0b' : '#9aa4b2'; }

  // Historical playback controls
  const slider = document.getElementById('historySlider');
  const btnPlay = document.getElementById('btnPlayHistory');
  const btnStop = document.getElementById('btnStopHistory');
  let playTimer = null, historyData = [];
  if(slider && btnPlay && btnStop){
    btnPlay.addEventListener('click', async () => {
      if(!state.liveMode || !window.SB || !state.bus) return ErrorHandler.showToast('History requires live mode & selected bus', 'error');
      try {
        historyData = await ErrorHandler.withRetry(() => SB.getPositionHistory(state.bus.id), 'getHistory');
        if(!historyData.length) return ErrorHandler.showToast('No history found', 'info');
        slider.value = 0;
        clearInterval(playTimer);
        playTimer = setInterval(() => {
          const t = Math.min(3600, Number(slider.value) + 1);
          slider.value = t;
          const targetTs = Date.now() - (3600 - t) * 1000; // map 0..3600 to last hour
          const frame = nearestHistory(historyData, targetTs);
          if(frame && busMarker){ busMarker.setLatLng([frame.lat, frame.lng]); }
          if(t >= 3600){ clearInterval(playTimer); }
        }, 100);
      } catch(e){ ErrorHandler.showToast('Failed to load history', 'error'); }
    });
    btnStop.addEventListener('click', () => { clearInterval(playTimer); });
    slider.addEventListener('input', () => {
      if(!historyData.length) return;
      const t = Number(slider.value);
      const targetTs = Date.now() - (3600 - t) * 1000;
      const frame = nearestHistory(historyData, targetTs);
      if(frame && busMarker){ busMarker.setLatLng([frame.lat, frame.lng]); }
    });
  }
}

function onRouteChange(){
  const id = els.routeSelect.value || (state.data.routes[0].id || state.data.routes[0].code);
  state.route = state.data.routes.find(r => (r.id === id) || (r.code === id));
  // Populate buses for route
  els.busSelect.innerHTML = (state.route.buses || []).map(b => `<option value="${b.id || b.name}">${b.name || b.id}</option>`).join('');
  // Populate multi-bus checkboxes
  const busMulti = document.getElementById('busMulti');
  if(busMulti){
    const saved = loadMultiBusSelection();
    busMulti.innerHTML = (state.route.buses || []).map(b => {
      const checked = saved.includes(b.id || b.name) ? 'checked' : '';
      return `<label class="toggle"><input type="checkbox" value="${b.id || b.name}" ${checked}><span>${b.name || b.id}</span></label>`;
    }).join('');
  }
  onBusChange();
}

function onBusChange(){
  const id = els.busSelect.value || (state.route.buses && (state.route.buses[0].id || state.route.buses[0].name));
  state.bus = (state.route.buses || []).find(b => (b.id === id) || (b.name === id));
  state.t = 0; // reset progression along path
  state.lastTick = Date.now();
  renderDriverInfo();
  drawRoutes();
  renderStops();
  ensureBusMarker();
  fitToRoute();

  // Subscribe to live positions if in live mode
  if(state.liveMode && window.SB && typeof SB.subscribeBusPositions === 'function'){
    // Single selected bus subscription for info bar
    try { if(positionsChannel && typeof positionsChannel.unsubscribe === 'function'){ positionsChannel.unsubscribe(); } } catch {}
    positionsChannel = SB.subscribeBusPositions(state.bus.id, (payload) => {
      const row = payload && (payload.new || payload.record || payload);
      if(!row) return;
      const lat = row.lat, lng = row.lng; const spd = Number(row.speed) || 0;
      
      // Track last positions for predictive ETA (keep last 5)
      state.lastPositions.push({ lat, lng, ts: Date.now(), speed: spd });
      if(state.lastPositions.length > 5) state.lastPositions.shift();
      const accelFactor = computeAccelerationFactor(state.lastPositions);

      // Rate limit + throttle updates
      if(RateLimiter.allow(state.bus.id)){
        if(!markerThrottler) markerThrottler = new MarkerThrottler(1000);
        markerThrottler.updateMarker(state.bus.id, lat, lng, busMarker);
      }
      
      els.infoSpeed.textContent = spd.toFixed ? spd.toFixed(0) : spd;
      els.infoLastUpdate.textContent = new Date().toLocaleTimeString();
      state.currentSpeedMs = ((spd || state.speedKmhBase) * accelFactor) * (1000/3600);
      if(state.route){ updateEtas(state.currentSpeedMs); }
      
      // Cache position and update connection monitor
      const cached = CacheManager.getCachedPositions();
      cached[state.bus.id] = { lat, lng, speed: spd, ts: Date.now() };
      CacheManager.cachePositions(cached);
      ConnectionMonitor.updatePing();
    }, (status) => {
      const liveEl = document.getElementById('liveStatus'); if(!liveEl) return;
      if(status === 'SUBSCRIBED'){ 
        liveEl.textContent = 'Connected'; liveEl.style.color = '#22c55e';
        ConnectionMonitor.updatePing();
      }
      else if(status === 'CHANNEL_ERROR'){ 
        liveEl.textContent = 'Error'; liveEl.style.color = '#ef4444';
        setTimeout(() => onBusChange(), 3000);
      }
      else { 
        liveEl.textContent = 'Retrying…'; liveEl.style.color = '#f59e0b';
        setTimeout(() => onBusChange(), 3000);
      }
    });

    // Presence: show viewers count for this bus
    try {
      if(state.presenceChannel && state.presenceChannel.unsubscribe) state.presenceChannel.unsubscribe();
    } catch{}
    try {
      state.presenceChannel = SB.onPresence(state.bus.id, (count) => {
        state.presenceCount = count;
        const el = document.getElementById('presenceCounter');
        if(el) el.textContent = `${count} user${count===1?'':'s'} watching this bus`;
      });
      SB.joinPresence(state.bus.id, { role: 'viewer' });
    } catch (e){ console.warn('Presence setup failed', e); }

    // Alerts for selected bus
    (async () => {
      try {
        const alerts = await SB.getAlerts(state.bus.id);
        renderAlerts(alerts);
        SB.subscribeAlerts(state.bus.id, (payload) => {
          const row = payload && (payload.new || payload.record || payload);
          if(row) appendAlert(row);
        });
      } catch(e){ console.warn('Alerts load failed', e); }
    })();

    // Multi-bus subscriptions per checked bus
    onBusMultiChange();
  }
}

function onTrafficToggle(){
  state.trafficFactor = els.trafficToggle.checked ? 0.6 : 1;
  if(trafficLayer){
    map.removeLayer(trafficLayer); trafficLayer = null;
  }
  if(els.trafficToggle.checked && state.route && Array.isArray(state.route.congestion)){
    trafficLayer = L.layerGroup();
    state.route.congestion.forEach(seg => {
      const poly = L.polyline(seg, { color: '#ef4444', weight: 6, opacity: 0.6 });
      trafficLayer.addLayer(poly);
    });
    trafficLayer.addTo(map);
    try{ UI.toast && UI.toast('Traffic layer enabled', 'info'); }catch{}
  } else {
    try{ UI.toast && UI.toast('Traffic layer disabled', 'info'); }catch{}
  }
}

function onAltRouteToggle(){
  if(altRoutePolyline){ map.removeLayer(altRoutePolyline); altRoutePolyline = null; }
  if(els.altRouteToggle.checked && state.route.altPath){
    altRoutePolyline = L.polyline(state.route.altPath, { color:'#f59e0b', weight:4, dashArray:'6 6' }).addTo(map);
    try{ UI.toast && UI.toast('Alternate route shown', 'info'); }catch{}
  } else {
    try{ UI.toast && UI.toast('Alternate route hidden', 'info'); }catch{}
  }
}

function ensureBusMarker(){
  const icon = L.divIcon({
    className: 'bus-icon',
    html: '<div style="width:18px;height:18px;background:#3b82f6;border:2px solid white;border-radius:50%;transition:transform .5s ease"></div>',
    iconSize: [18,18],
    iconAnchor: [9,9]
  });
  if(!busMarker){
    busMarker = L.marker(getPointOnRoute(0), { icon }).addTo(map);
  }
  // Also ensure a marker exists for the selected bus in multi-map
  const selId = state.bus && (state.bus.id || state.bus.name);
  if(selId && !busMarkers[selId]){
    busMarkers[selId] = L.marker(getPointOnRoute(0), { icon }).addTo(map);
  }
}

function drawRoutes(){
  if(routePolyline){ map.removeLayer(routePolyline); routePolyline = null; }
  const path = state.route.path || (Array.isArray(state.route.stops) ? state.route.stops.map(s => [s.lat, s.lng]) : null);
  // Normalize: ensure we have a usable path on state.route
  if(!state.route.path && Array.isArray(path)){
    state.route.path = path;
  }
  if(path && path.length > 1){
    routePolyline = L.polyline(path, { color:'#22c55e', weight:5 }).addTo(map);
    try {
      const len = pathLength(path);
      routePolyline.setStyle({ dashArray: `${Math.max(10, len/10)} ${Math.max(10, len/10)}`, dashOffset: len });
      let off = len;
      const anim = setInterval(()=>{ off -= len/40; routePolyline.setStyle({ dashOffset: Math.max(0, off) }); if(off<=0) clearInterval(anim); }, 16);
    } catch{}
  }
  onTrafficToggle();
  onAltRouteToggle();
}

function fitToRoute(){
  if(routePolyline){ map.fitBounds(routePolyline.getBounds(), { padding: [20,20] }); }
}

function renderDriverInfo(){
  if(state.bus && state.bus.driver && state.bus.driver.name){
    els.driverName.textContent = state.bus.driver.name;
    els.driverPhone.textContent = state.bus.driver.phone;
    els.driverPhone.href = `tel:${state.bus.driver.phone}`;
  } else {
    els.driverName.textContent = '—';
    els.driverPhone.textContent = '-';
    els.driverPhone.removeAttribute('href');
  }
  els.infoBusName.textContent = state.bus && state.bus.name ? state.bus.name : (state.bus && state.bus.id ? state.bus.id : '–');
}

function renderStops(){
  const stops = state.route.stops || [];
  // Skeleton while rendering
  try{ els.stopsList.innerHTML = '<div class="skeleton" style="height:24px"></div><div class="skeleton" style="height:24px;margin-top:6px"></div><div class="skeleton" style="height:24px;margin-top:6px"></div>'; }catch{}
  
  // Use virtual scrolling for large lists (50+ items)
  if(stops.length > 50 && window.VirtualScroll){
    if(virtualStopsList){
      virtualStopsList.updateItems(stops);
    } else {
      virtualStopsList = new VirtualScroll(
        els.stopsList,
        stops,
        (s, idx) => {
          const row = document.createElement('div');
          row.className = 'stop';
          row.innerHTML = `<div><strong>${idx+1}. ${s.name}</strong><div style="color:#9aa4b2;font-size:12px">${s.desc || s.descr || ''}</div></div><div class="eta" id="eta-${idx}">–</div>`;
          return row;
        },
        60 // item height in px
      );
    }
  } else {
    // Standard rendering for smaller lists
    els.stopsList.innerHTML = '';
    stops.forEach((s, idx) => {
      const row = document.createElement('div');
      row.className = 'stop';
      row.innerHTML = `<div><strong>${idx+1}. ${s.name}</strong><div style="color:#9aa4b2;font-size:12px">${s.desc || s.descr || ''}</div></div><div class="eta" id="eta-${idx}">–</div>`;
      els.stopsList.appendChild(row);
    });
  }
}

function onBusMultiChange(){
  const container = document.getElementById('busMulti');
  if(!container) return;
  const checked = Array.from(container.querySelectorAll('input[type="checkbox"]:checked')).map(i => i.value);
  saveMultiBusSelection(checked);
  // Unsubscribe removed buses
  Object.keys(busSubs).forEach(id => {
    if(!checked.includes(id)){
      try { busSubs[id].unsubscribe && busSubs[id].unsubscribe(); } catch {}
      delete busSubs[id];
      if(busMarkers[id]){ map.removeLayer(busMarkers[id]); delete busMarkers[id]; }
      delete busLastSeen[id];
    }
  });
  // Subscribe new buses
  checked.forEach((id, idx) => {
    if(busSubs[id]) return;
    const color = busColors[idx % busColors.length];
    const icon = L.divIcon({ className:'bus-icon', html:`<div style="width:16px;height:16px;background:${color};border:2px solid white;border-radius:50%"></div>`, iconSize:[16,16], iconAnchor:[8,8] });
    if(!busMarkers[id]){ busMarkers[id] = L.marker(getPointOnRoute(0), { icon }).addTo(map); }
    busSubs[id] = SB.subscribeBusPositions(id, (payload) => {
      const row = payload && (payload.new || payload.record || payload);
      if(!row) return;
      const lat = row.lat, lng = row.lng;
      
      // Rate limit + throttle multi-bus marker updates
      if(RateLimiter.allow(id)){
        if(!markerThrottler) markerThrottler = new MarkerThrottler(1000);
        markerThrottler.updateMarker(id, lat, lng, busMarkers[id]);
      }
      
      busLastSeen[id] = new Date();
      updateBusLegend(checked);
    });
  });
  updateBusLegend(checked);
}

function updateBusLegend(busIds){
  const el = document.getElementById('busLegend');
  if(!el) return;
  if(!busIds || busIds.length === 0){ el.textContent = 'No buses selected'; return; }
  el.innerHTML = busIds.map((id, idx) => {
    const color = busColors[idx % busColors.length];
    const lastSeen = busLastSeen[id] ? busLastSeen[id].toLocaleTimeString() : 'waiting...';
    const busObj = (state.route.buses || []).find(b => (b.id === id || b.name === id));
    const name = busObj ? (busObj.name || busObj.id) : id;
    return `<div style="margin:4px 0"><span style="display:inline-block;width:12px;height:12px;background:${color};border-radius:50%;margin-right:6px"></span><strong>${name}</strong> · ${lastSeen}</div>`;
  }).join('');
}

function saveMultiBusSelection(busIds){
  try { localStorage.setItem('multiBusSelection', JSON.stringify(busIds)); } catch {}
}

function loadMultiBusSelection(){
  try { return JSON.parse(localStorage.getItem('multiBusSelection') || '[]'); } catch { return []; }
}

function renderAlerts(list){
  const el = document.getElementById('alertsList'); if(!el) return;
  if(!list || list.length === 0){ el.textContent = 'No active alerts'; return; }
  el.innerHTML = list.map(a => `<div style="margin:4px 0">[${new Date(a.created_at).toLocaleTimeString()}] <strong>${a.type}</strong> — ${a.notes || ''}</div>`).join('');
}

function appendAlert(alert){
  const el = document.getElementById('alertsList'); if(!el) return;
  if(el.textContent === 'No active alerts') el.textContent = '';
  const div = document.createElement('div');
  div.style.margin = '4px 0';
  div.innerHTML = `[${new Date(alert.created_at).toLocaleTimeString()}] <strong>${alert.type}</strong> — ${alert.notes || ''}`;
  el.prepend(div);
}

function tick(){
  // Progress bus along route based on elapsed time and speed
  const now = Date.now();
  const dt = (now - state.lastTick) / 1000; // seconds
  state.lastTick = now;

  const speedKmh = state.speedKmhBase * state.trafficFactor; // km/h
  const speedMs = speedKmh * (1000/3600);
  const routeLen = pathLength(state.route.path); // meters
  const advance = speedMs * dt;
  const fractionAdvance = advance / routeLen;
  state.t = (state.t + fractionAdvance) % 1; // loop

  const pos = getPointOnRoute(state.t);
  if(busMarker){ busMarker.setLatLng(pos); }
  try { if(busMarker && busMarker._icon){ busMarker._icon.style.transform = 'scale(1.05)'; setTimeout(()=>{ if(busMarker&&busMarker._icon) busMarker._icon.style.transform='scale(1)'; }, 500); } } catch{}

  // Update info bar
  els.infoSpeed.textContent = speedKmh.toFixed(0);
  els.infoLastUpdate.textContent = new Date().toLocaleTimeString();

  // Update ETAs
  updateEtas(speedMs);
  checkGeofence();
}

function updateEtas(speedMs){
  const routePts = state.route.path || (Array.isArray(state.route.stops) ? state.route.stops.map(s => [s.lat, s.lng]) : []);
  const routeLen = pathLength(routePts); // meters
  let busDist;
  if(state.liveMode && busMarker){
    const p = busMarker.getLatLng();
    busDist = distanceAlongPath(routePts, [p.lat, p.lng]);
    speedMs = speedMs || state.currentSpeedMs || (state.speedKmhBase * (1000/3600));
  } else {
    busDist = state.t * routeLen;
  }

  // If congestion segments are defined, apply slower speed multiplier for distances overlapping congested segments
  const segs = Array.isArray(state.route.congestion) ? state.route.congestion : [];

  state.route.stops.forEach((stop, idx) => {
    const stopDist = distanceAlongPath(routePts, [stop.lat, stop.lng]);
    let d = stopDist - busDist;
    if(d < 0) d += routeLen; // if stop ahead after looping
    // Estimate congestion factor by counting overlaps proportionally (simple heuristic)
    let factor = 1;
    if(segs.length > 0){
      const portion = congestionPortionAlong(routePts, busDist, d, segs);
      // Reduce speed up to 40% based on congestion portion
      factor = 1 - 0.4 * portion;
    }
    const etaSec = d / (speedMs * factor);
    const el = document.getElementById(`eta-${idx}`);
    if(isFinite(etaSec)){
      el.textContent = formatDuration(etaSec);
      if(etaSec < 10 && 'vibrate' in navigator){ try{ navigator.vibrate(30); }catch{} }
    } else {
      el.textContent = '–';
    }
  });
}

function congestionPortionAlong(path, startDist, distance, segs){
  // Approximate: compute fraction of the distance that lies within any congested polyline segments
  // We discretize the path every ~200m
  const step = 200; let within = 0; let covered = 0;
  const totalLen = pathLength(path);
  let remaining = distance; let cursor = startDist;
  while(remaining > 0){
    const s = Math.min(step, remaining); covered += s; remaining -= s;
    const pt = pointAtDistance(path, cursor + s);
    if(isInCongested(pt, segs)) within += s;
    cursor += s;
    if(cursor > totalLen) cursor -= totalLen;
  }
  return covered > 0 ? (within / covered) : 0;
}

function pointAtDistance(path, dist){
  let target = dist; for(let i=1;i<path.length;i++){
    const seg = haversine(path[i-1], path[i]);
    if(target <= seg){
      const f = seg === 0 ? 0 : target/seg;
      return interpolate(path[i-1], path[i], f);
    }
    target -= seg;
  }
  return path[path.length-1];
}

function isInCongested(p, segs){
  // If point is near any congested segment line (within ~100m), consider it congested
  for(const seg of segs){
    for(let i=1;i<seg.length;i++){
      const a = seg[i-1], b = seg[i];
      // Distance to segment midpoint heuristic
      const mid = [(a[0]+b[0])/2, (a[1]+b[1])/2];
      const d = haversine(mid, p);
      if(d < 100) return true;
    }
  }
  return false;
}

function locateMe(){
  if(!navigator.geolocation){ return toast('Geolocation not supported'); }
  navigator.geolocation.getCurrentPosition(pos => {
    const { latitude, longitude } = pos.coords;
    const icon = L.divIcon({className:'user-pin',html:'<div style="width:18px;height:18px;background:#f43f5e;border:2px solid white;border-radius:50%"></div>',iconSize:[18,18],iconAnchor:[9,9]});
    if(!userMarker){ userMarker = L.marker([latitude, longitude], { icon }).addTo(map); }
    else { userMarker.setLatLng([latitude, longitude]); }

    // ETA to nearest stop
    const nearest = nearestStop([latitude, longitude], state.route.stops);
    const routePts = state.route.path || (Array.isArray(state.route.stops) ? state.route.stops.map(s => [s.lat, s.lng]) : []);
    const speedMs = state.speedKmhBase * state.trafficFactor * (1000/3600);
    const routeLen = pathLength(routePts);
    const busDist = state.t * routeLen;
    const stopDist = distanceAlongPath(routePts, [nearest.lat, nearest.lng]);
    let d = stopDist - busDist; if(d < 0) d += routeLen;
    const eta = formatDuration(d / speedMs);
    els.userEta.innerHTML = `ETA to nearest stop (<strong>${nearest.name}</strong>): <strong>${eta}</strong>`;

    map.setView([latitude, longitude], 14);
    updateGeofence();
  }, () => toast('Unable to get your location'));
}

function sendEmergency(e){
  e.preventDefault();
  const type = document.getElementById('emType').value;
  const notes = document.getElementById('emNotes').value;
  // Prefer Supabase alerts with retry
  (async () => {
    try {
      if(state.liveMode && window.SB && typeof SB.createAlert === 'function'){
        await ErrorHandler.withRetry(() => SB.createAlert({ busId: state.bus?.id, type, notes }), 'sendAlert');
      } else {
        console.log('EMERGENCY', { route: state.route?.id, bus: state.bus?.id, type, notes, ts: Date.now() });
      }
      els.emergencyModal.close();
      toast('Emergency alert sent to transport in-charge');
    } catch(err){
      console.error('Emergency alert failed', err);
      ErrorHandler.showToast('Failed to send alert after retries', 'error');
    }
  })();
}

function toast(msg){
  els.toast.textContent = msg; els.toast.classList.add('show');
  setTimeout(() => els.toast.classList.remove('show'), 2000);
}

// Geometry helpers
function haversine(a, b){
  const R = 6371000;
  const toRad = d => d*Math.PI/180;
  const dLat = toRad(b[0]-a[0]);
  const dLng = toRad(b[1]-a[1]);
  const lat1 = toRad(a[0]);
  const lat2 = toRad(b[0]);
  const sa = Math.sin(dLat/2)**2 + Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLng/2)**2;
  return 2*R*Math.asin(Math.sqrt(sa));
}

function pathLength(path){
  let s = 0; for(let i=1;i<path.length;i++){ s += haversine(path[i-1], path[i]); } return s;
}

function interpolate(p1, p2, t){
  const lat = p1[0] + (p2[0]-p1[0])*t;
  const lng = p1[1] + (p2[1]-p1[1])*t;
  return [lat, lng];
}

function getPointOnRoute(t){
  const path = state.route.path || (Array.isArray(state.route.stops) ? state.route.stops.map(s => [s.lat, s.lng]) : []);
  const total = pathLength(path);
  let target = t * total;
  for(let i=1;i<path.length;i++){
    const seg = haversine(path[i-1], path[i]);
    if(target <= seg){
      const f = seg === 0 ? 0 : target/seg;
      return interpolate(path[i-1], path[i], f);
    }
    target -= seg;
  }
  return path[path.length-1];
}

function distanceAlongPath(path, point){
  // naive: choose nearest vertex, then distance up to that vertex
  let nearestIdx = 0, nearestDist = Infinity;
  for(let i=0;i<path.length;i++){
    const d = haversine(path[i], point);
    if(d < nearestDist){ nearestDist = d; nearestIdx = i; }
  }
  let dist = 0; for(let i=1;i<=nearestIdx;i++){ dist += haversine(path[i-1], path[i]); }
  return dist;
}

function nearestStop(p, stops){
  let best = stops[0], d0 = Infinity;
  for(const s of stops){
    const d = haversine(p, [s.lat, s.lng]);
    if(d < d0){ d0 = d; best = s; }
  }
  return best;
}

function formatDuration(sec){
  sec = Math.max(0, Math.round(sec));
  const m = Math.floor(sec/60); const s = sec%60;
  if(m >= 60){ const h = Math.floor(m/60); const mm = m%60; return `${h}h ${mm}m`; }
  if(m >= 1) return `${m}m ${s}s`;
  return `${s}s`;
}

function nearestHistory(history, targetTs){
  if(!history || history.length === 0) return null;
  let best = history[0], bestDiff = Math.abs(new Date(best.created_at).getTime() - targetTs);
  for(const h of history){
    const d = Math.abs(new Date(h.created_at).getTime() - targetTs);
    if(d < bestDiff){ best = h; bestDiff = d; }
  }
  return best;
}

// Predictive ETA acceleration factor from last 5 positions
function computeAccelerationFactor(points){
  if(!points || points.length < 3) return 1;
  let sum = 0, cnt = 0;
  for(let i=1;i<points.length;i++){
    const dt = (points[i].ts - points[i-1].ts)/1000;
    if(dt <= 0) continue;
    const dv = (Number(points[i].speed||0) - Number(points[i-1].speed||0));
    sum += dv/dt; cnt++;
  }
  const accel = cnt ? sum/cnt : 0;
  const factor = 1 + Math.max(-0.15, Math.min(0.15, accel * 0.02));
  return factor;
}

// Battery saver: reduce polling interval when battery < 20%
(function(){
  if(navigator.getBattery){
    navigator.getBattery().then(b => {
      const adjust = () => {
        if(!state.liveMode){
          clearInterval(state.timer);
          const interval = (b.level < 0.2) ? 5000 : 1000;
          state.timer = setInterval(tick, interval);
        }
      };
      b.addEventListener('levelchange', adjust);
      adjust();
    }).catch(()=>{});
  }
})();

// Offline queue for position updates (demo)
const OfflineQueue = (function(){
  const KEY = 'offline.positions.queue';
  function enqueue(update){
    try{ const q = JSON.parse(localStorage.getItem(KEY) || '[]'); q.push(update); localStorage.setItem(KEY, JSON.stringify(q)); }catch{}
  }
  async function flush(){
    try{
      const q = JSON.parse(localStorage.getItem(KEY) || '[]');
      if(q.length === 0) return;
      if(window.SB && typeof SB.bulkUpsertPositions === 'function'){
        await SB.bulkUpsertPositions(q);
        localStorage.removeItem(KEY);
        toast('Synced offline updates');
      }
    }catch(e){ /* keep queue */ }
  }
  return { enqueue, flush };
})();
window.addEventListener('online', () => OfflineQueue.flush());
