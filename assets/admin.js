/* Admin Dashboard interactions and demo data */
(function () {
  const routesUrl = '../assets/data/routes.json';
  const state = {
    routes: [],
    buses: [],
    drivers: [],
    alerts: [],
    assignments: [],
    map: null,
    mapLayers: { stops: null, alt: null, congestion: null }
  };

  // Demo data generators
  function genDemoBuses(routes) {
    const statuses = ['active', 'idle', 'breakdown'];
    return routes.flatMap((r, i) => {
      const count = Math.max(2, Math.min(6, (r.stops?.length || 4) - 1));
      return Array.from({ length: count }, (_, j) => ({
        id: `B-${i + 1}-${j + 1}`,
        routeId: r.id || `R${i + 1}`,
        name: `Bus ${i + 1}-${j + 1}`,
        status: statuses[(i + j) % statuses.length],
        lastPing: new Date(Date.now() - (i * 30 + j * 7) * 60000).toISOString(),
        speed: 20 + ((i * j) % 25),
      }));
    });
  }

  function genDemoDrivers(routes) {
    return routes.map((r, i) => ({ id: `D-${i + 1}`, name: `Driver ${i + 1}`, phone: `+91-9000${i}123${i}`, routeId: r.id || `R${i + 1}` }));
  }

  function genDemoAlerts(buses) {
    const subset = buses.filter(b => b.status === 'breakdown').slice(0, 4);
    return subset.map((b, i) => ({ id: `A-${i + 1}`, busId: b.id, routeId: b.routeId, time: new Date().toISOString(), message: 'Emergency: Breakdown reported', resolved: false }));
  }

  // DOM helpers
  function $(id) { return document.getElementById(id); }
  function opt(value, text) { const o = document.createElement('option'); o.value = value; o.textContent = text; return o; }

  async function init() {
    try {
      const res = await fetch(routesUrl);
      state.routes = await res.json();
    } catch (e) {
      console.warn('Failed to load routes.json, using stub', e);
      state.routes = [{ id: 'R1', name: 'Route 1', stops: [{ name: 'Stop A', lat: 17.385, lng: 78.486 }, { name: 'Stop B', lat: 17.39, lng: 78.49 }] }];
    }
    state.buses = genDemoBuses(state.routes);
    state.drivers = genDemoDrivers(state.routes);
    state.alerts = genDemoAlerts(state.buses);

    buildFleetUI();
    buildAnalytics();
    buildAlerts();
    buildEditor();
    buildAssignments();
  }

  // Fleet UI
  function buildFleetUI() {
    const routeSel = $('fleetRouteSelect');
    const statusSel = $('fleetStatusFilter');
    routeSel.innerHTML = '';
    routeSel.appendChild(opt('all', 'All Routes'));
    for (const r of state.routes) routeSel.appendChild(opt(r.id, r.name || r.id));
    routeSel.onchange = renderFleet;
    statusSel.onchange = renderFleet;
    renderFleet();
  }

  function renderFleet() {
    const grid = $('fleetGrid');
    grid.innerHTML = '';
    const routeFilter = $('fleetRouteSelect').value;
    const statusFilter = $('fleetStatusFilter').value;
    const buses = state.buses.filter(b => (routeFilter === 'all' || b.routeId === routeFilter) && (statusFilter === 'all' || b.status === statusFilter));
    for (const b of buses) {
      const tile = document.createElement('div'); tile.className = 'tile';
      tile.innerHTML = `
        <div class="title">${b.name}</div>
        <div>Route: ${b.routeId}</div>
        <div>Speed: ${b.speed} km/h</div>
        <div>Last ping: <span class="meta">${new Date(b.lastPing).toLocaleString()}</span></div>
        <div class="status ${b.status}">${b.status}</div>
      `;
      grid.appendChild(tile);
    }
  }

  // Analytics
  function buildAnalytics() {
    // Show lightweight loading state and disable export buttons
    const exT = document.getElementById('exportTripsBtn');
    const exP = document.getElementById('exportPositionsBtn');
    const exA = document.getElementById('exportAlertsBtn');
    [exT, exP, exA].forEach(b => { if (b) { b.disabled = true; b.dataset._originalText = b.textContent; b.textContent = 'Loading…'; } });

    const labels = Array.from({ length: 7 }, (_, i) => `D${i + 1}`);
    chartLine('chartTrips', labels, labels.map((_, i) => 40 + (i * 6) % 20), 'Trips Completed');
    chartLine('chartSpeed', labels, labels.map((_, i) => 28 + (i * 3) % 10), 'Avg Speed (km/h)');
    chartLine('chartDelays', labels, labels.map((_, i) => 3 + (i * 2) % 6), 'Avg Delays (min)');
    chartLine('chartPassengers', labels, labels.map((_, i) => 300 + (i * 25) % 120), 'Passenger Count');

    // Export CSV buttons (demo data)
    const trips = labels.map((d,i)=>({ day:d, trips: 40 + (i*6)%20 }));
    const positions = state.buses.slice(0,10).map(b=>({ busId:b.id, routeId:b.routeId, speed:b.speed, ts:new Date(b.lastPing).toISOString() }));
    const alerts = state.alerts.map(a=>({ id:a.id, busId:a.busId, routeId:a.routeId, time:a.time, message:a.message, resolved:a.resolved }));
    if(exT){ exT.onclick = ()=> Analytics.downloadCSV('trips.csv', trips); }
    if(exP){ exP.onclick = ()=> Analytics.downloadCSV('positions.csv', positions); }
    if(exA){ exA.onclick = ()=> Analytics.downloadCSV('alerts.csv', alerts); }

    // Restore buttons after render with brief toast
    [exT, exP, exA].forEach(b => { if (b) { b.disabled = false; b.textContent = b.dataset._originalText || b.textContent; } });
    UI && UI.toast && UI.toast('Analytics ready', 'success');

    // Weekly delay report (demo): generate from synthetic history
    const hist = labels.flatMap((d,i)=> Array.from({length:10}, (_,k)=>({ ts: Date.now()-i*86400000-k*3600000, segmentId: `S${(i%5)+1}`, delayMin: (i%3)*2 + (k%4) })));
    Scheduler && Scheduler.scheduleWeeklyEmail(async () => Analytics.analyzeDelays(hist));
  }

  function chartLine(id, labels, data, label) {
    const ctx = document.getElementById(id);
    if (!ctx) return;
    new Chart(ctx, {
      type: 'line',
      data: { labels, datasets: [{ label, data, borderColor: '#60a5fa', backgroundColor: 'rgba(96,165,250,0.2)', tension: 0.3 }] },
      options: { responsive: true, plugins: { legend: { display: true } }, scales: { y: { beginAtZero: true } } }
    });
  }

  // Alerts
  function buildAlerts() {
    const list = $('alertsList');
    list.innerHTML = '';
    for (const a of state.alerts) {
      const item = document.createElement('div'); item.className = 'item';
      const left = document.createElement('div');
      left.innerHTML = `<div><strong>${a.message}</strong></div><div class="meta">Bus ${a.busId} • Route ${a.routeId} • ${new Date(a.time).toLocaleString()}</div>`;
      const right = document.createElement('div');
      const btn = document.createElement('button'); btn.textContent = a.resolved ? 'Resolved' : 'Resolve'; btn.disabled = a.resolved;
      btn.onclick = () => { a.resolved = true; buildAlerts(); };
      right.appendChild(btn);
      item.appendChild(left); item.appendChild(right);
      list.appendChild(item);
    }
    $('broadcastBtn').onclick = () => {
      const text = $('broadcastText').value.trim();
      if (!text) return;
      // Stub: send to server
      $('broadcastToast').hidden = false;
      setTimeout(() => $('broadcastToast').hidden = true, 2000);
      $('broadcastText').value = '';
    };
  }

  // Route Editor
  function buildEditor() {
    const routeSel = $('editorRouteSelect');
    routeSel.innerHTML = '';
    for (const r of state.routes) routeSel.appendChild(opt(r.id, r.name || r.id));
    routeSel.onchange = renderEditor;
    initMap();
    wireEditorButtons();
    renderEditor();
  }

  function initMap() {
    state.map = L.map('routeMap').setView([17.385, 78.486], 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap contributors' }).addTo(state.map);
    state.mapLayers.stops = L.layerGroup().addTo(state.map);
    state.mapLayers.alt = L.layerGroup().addTo(state.map);
    state.mapLayers.congestion = L.layerGroup().addTo(state.map);
    state.mapLayers.heat = L.layerGroup().addTo(state.map);
  }

  function renderEditor() {
    const routeId = $('editorRouteSelect').value || state.routes[0]?.id;
    const route = state.routes.find(r => r.id === routeId) || state.routes[0];
    state.mapLayers.stops.clearLayers();
    const markers = [];
    for (const s of route.stops || []) {
      const m = L.marker([s.lat, s.lng], { draggable: true }).bindPopup(`<b>${s.name}</b>`);
      m.on('dragend', (e) => { const { lat, lng } = e.target.getLatLng(); s.lat = lat; s.lng = lng; });
      markers.push(m); m.addTo(state.mapLayers.stops);
    }
    if (markers.length) {
      const g = L.featureGroup(markers); state.map.fitBounds(g.getBounds().pad(0.2));
    }
  }

  function wireEditorButtons() {
    $('addStopBtn').onclick = () => {
      const routeId = $('editorRouteSelect').value || state.routes[0]?.id;
      const route = state.routes.find(r => r.id === routeId) || state.routes[0];
      const center = state.map.getCenter();
      route.stops = route.stops || [];
      route.stops.push({ name: `Stop ${route.stops.length + 1}`, lat: center.lat, lng: center.lng });
      renderEditor();
    };
    $('addCongestionBtn').onclick = () => {
      const center = state.map.getCenter();
      const circle = L.circle([center.lat, center.lng], { radius: 200, color: '#dc2626' }).addTo(state.mapLayers.congestion);
      circle.bindPopup('Congestion Zone');
    };
    $('toggleAltPathBtn').onclick = () => {
      if (state._altVisible) { state.mapLayers.alt.clearLayers(); state._altVisible = false; return; }
      const c = state.map.getCenter();
      const poly = L.polyline([[c.lat + 0.01, c.lng - 0.01], [c.lat + 0.02, c.lng + 0.005], [c.lat + 0.01, c.lng + 0.02]], { color: '#f59e0b' });
      poly.addTo(state.mapLayers.alt);
      state._altVisible = true;
    };
    $('saveRouteBtn').onclick = () => {
      UI && UI.toast ? UI.toast('Route changes saved.', 'success') : console.log('Route changes saved.');
    };

    // Heatmap & Alt route suggestions
    const showHeat = document.getElementById('showHeatmapBtn');
    if(showHeat){
      showHeat.onclick = () => UI && UI.withLoading ? UI.withLoading(showHeat, () => {
        if(state._heatVisible){ state.mapLayers.heat.clearLayers(); state._heatVisible = false; UI.toast && UI.toast('Heatmap hidden'); return; }
        const routeId = $('editorRouteSelect').value || state.routes[0]?.id;
        const route = state.routes.find(r => r.id === routeId) || state.routes[0];
        const pts = Analytics.passengerHeatmap(route);
        state.mapLayers.heat.clearLayers();
        pts.forEach(p=>{
          const color = p.volume>80?'#ef4444':p.volume>40?'#f59e0b':'#22c55e';
          const circle = L.circle([p.lat,p.lng], { radius: 50 + p.volume*2, color, fillColor: color, fillOpacity: 0.4 });
          circle.bindPopup(`${p.name}: ${p.volume} pax`);
          state.mapLayers.heat.addLayer(circle);
        });
        state._heatVisible = true;
        UI.toast && UI.toast('Heatmap shown', 'info');
      }) : (function(){
        if(state._heatVisible){ state.mapLayers.heat.clearLayers(); state._heatVisible = false; return; }
        const routeId = $('editorRouteSelect').value || state.routes[0]?.id;
        const route = state.routes.find(r => r.id === routeId) || state.routes[0];
        const pts = Analytics.passengerHeatmap(route);
        state.mapLayers.heat.clearLayers();
        pts.forEach(p=>{
          const color = p.volume>80?'#ef4444':p.volume>40?'#f59e0b':'#22c55e';
          const circle = L.circle([p.lat,p.lng], { radius: 50 + p.volume*2, color, fillColor: color, fillOpacity: 0.4 });
          circle.bindPopup(`${p.name}: ${p.volume} pax`);
          state.mapLayers.heat.addLayer(circle);
        });
        state._heatVisible = true;
      })();
    }
    }
    const suggestAlt = document.getElementById('suggestAltBtn');
    if(suggestAlt){
      suggestAlt.onclick = () => UI && UI.withLoading ? UI.withLoading(suggestAlt, () => {
        const routeId = $('editorRouteSelect').value || state.routes[0]?.id;
        const route = state.routes.find(r => r.id === routeId) || state.routes[0];
        const res = Analytics.suggestAltRoutes(route);
        // Clear previous alt overlays
        state.mapLayers.alt.clearLayers();
        res.suggestions.forEach(s=>{ L.polyline(s.altPath, { color:'#f59e0b', dashArray:'6 6' }).addTo(state.mapLayers.alt); });
        UI.toast && UI.toast(res.message, 'success');
      }) : (function(){
        const routeId = $('editorRouteSelect').value || state.routes[0]?.id;
        const route = state.routes.find(r => r.id === routeId) || state.routes[0];
        const res = Analytics.suggestAltRoutes(route);
        state.mapLayers.alt.clearLayers();
        res.suggestions.forEach(s=>{ L.polyline(s.altPath, { color:'#f59e0b', dashArray:'6 6' }).addTo(state.mapLayers.alt); });
      })();
    }
    }
  }

  // Assignments
  function buildAssignments() {
    const busSel = $('assignBusSelect'); const driverSel = $('assignDriverSelect'); const routeSel = $('assignRouteSelect');
    busSel.innerHTML = ''; driverSel.innerHTML = ''; routeSel.innerHTML = '';
    for (const b of state.buses) busSel.appendChild(opt(b.id, `${b.name} (${b.routeId})`));
    for (const d of state.drivers) driverSel.appendChild(opt(d.id, `${d.name}`));
    for (const r of state.routes) routeSel.appendChild(opt(r.id, r.name || r.id));
    $('assignBtn').onclick = () => {
      const busId = busSel.value, driverId = driverSel.value, routeId = routeSel.value, shift = $('assignShift').value || '08:00-16:00';
      const bus = state.buses.find(b => b.id === busId);
      const driver = state.drivers.find(d => d.id === driverId);
      state.assignments.push({ id: `AS-${state.assignments.length + 1}`, busId, driverId, routeId, shift, ts: new Date().toISOString() });
      renderAssignments();
    };
    renderAssignments();
  }

  function renderAssignments() {
    const list = $('assignmentsList');
    list.innerHTML = '';
    for (const a of state.assignments) {
      const item = document.createElement('div'); item.className = 'item';
      item.innerHTML = `<div><strong>${a.busId}</strong> → ${a.driverId} • Route ${a.routeId} • Shift ${a.shift}</div><div class="meta">${new Date(a.ts).toLocaleString()}</div>`;
      list.appendChild(item);
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
