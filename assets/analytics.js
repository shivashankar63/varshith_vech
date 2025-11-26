/* Data & Analytics module for Smart Bus Tracking (demo) */
(function(){
  const Analytics = {
    // Analyze historical speeds per segment and suggest faster alt routes
    suggestAltRoutes(route){
      const segments = (route.path || (route.stops||[]).map(s=>[s.lat,s.lng])) || [];
      if(segments.length < 2) return { message: 'Route too short', suggestions: [] };
      const speedData = route.speedHistory || []; // [{lat,lng,avgSpeed}]
      // Simple heuristic: mark slow segments and propose a detour polyline nearby
      const slowSegs = findSlowSegments(segments, speedData);
      const suggestions = slowSegs.map(s => {
        const [a,b] = s.seg;
        const detour = [[a[0]+0.005,a[1]-0.005],[b[0]+0.006,b[1]+0.006]]; // fake alt path nearby
        return { reason: `Slow segment avg ${s.avg.toFixed(1)} km/h`, altPath: detour };
      });
      return { message: `Found ${suggestions.length} potential detours`, suggestions };
    },

    // Weekly delay patterns (rush hour hotspots)
    analyzeDelays(history){
      // history: [{ts, segmentId, delayMin}]
      const buckets = { morning:0, noon:0, evening:0 };
      const segDelay = new Map();
      (history||[]).forEach(h=>{
        const hr = new Date(h.ts).getHours();
        const p = hr<10?'morning':hr<16?'noon':'evening';
        buckets[p]+= (h.delayMin||0);
        segDelay.set(h.segmentId, (segDelay.get(h.segmentId)||0) + (h.delayMin||0));
      });
      const hotspots = Array.from(segDelay.entries()).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([id,sum])=>({segmentId:id,totalDelay:sum}));
      return { totals: buckets, hotspots };
    },

    // Passenger heatmap: stop volumes
    passengerHeatmap(route){
      const stops = route.stops || [];
      return stops.map(s=>{
        const vol = Number(s.passengers||s.volume||Math.floor(Math.random()*100));
        return { name:s.name, lat:s.lat, lng:s.lng, volume:vol };
      });
    },

    // Carbon footprint: CO2 saved vs cars
    carbonSummary(route){
      const paxPerBus = (route.buses||[]).reduce((acc,b)=>acc+(b.capacity||40),0) || 40;
      const avgLoadFactor = 0.5; // 50% occupancy
      const dailyTrips = (route.buses||[]).length * 8; // assume 8 trips per bus
      const kmPerTrip = kmLength(route.path || (route.stops||[]).map(s=>[s.lat,s.lng]));
      const busPaxKm = paxPerBus * avgLoadFactor * dailyTrips * kmPerTrip;
      const carCo2PerKm = 0.192; // kg CO2/km average small car
      const busCo2PerKmPerPax = 0.075; // kg CO2/km/pax (approx; depends on occupancy)
      const carsEquivalentCo2 = busPaxKm * carCo2PerKm;
      const busesCo2 = busPaxKm * busCo2PerKmPerPax;
      const saved = Math.max(0, carsEquivalentCo2 - busesCo2); // kg
      return { busPaxKm, carsEquivalentCo2, busesCo2, savedKg: saved, savedTon: saved/1000 };
    },

    // Export CSVs
    toCSV(rows){
      if(!rows||!rows.length) return '';
      const headers = Object.keys(rows[0]);
      const lines = [headers.join(',')];
      rows.forEach(r=>{ lines.push(headers.map(h=>JSON.stringify(r[h]??'').replace(/^"|"$/g,'').replace(/\n/g,' ')).join(',')); });
      return lines.join('\n');
    },
    downloadCSV(filename, rows){
      const csv = Analytics.toCSV(rows);
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
      setTimeout(()=>URL.revokeObjectURL(url), 1000);
    }
  };

  // Helpers
  function kmLength(path){
    return (metersLength(path)||0)/1000;
  }
  function metersLength(path){
    if(!path||path.length<2) return 0;
    let s=0; for(let i=1;i<path.length;i++){ s+= haversine(path[i-1], path[i]); } return s;
  }
  function haversine(a,b){
    const R=6371000; const toRad=d=>d*Math.PI/180;
    const dLat=toRad(b[0]-a[0]); const dLng=toRad(b[1]-a[1]);
    const lat1=toRad(a[0]); const lat2=toRad(b[0]);
    const sa=Math.sin(dLat/2)**2 + Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLng/2)**2;
    return 2*R*Math.asin(Math.sqrt(sa));
  }
  function findSlowSegments(segments, speedData){
    const res=[];
    for(let i=1;i<segments.length;i++){
      const a=segments[i-1], b=segments[i];
      const mid=[(a[0]+b[0])/2,(a[1]+b[1])/2];
      const near = speedData.reduce((acc,d)=>{
        const dd = Math.hypot((d.lat-mid[0]), (d.lng-mid[1]));
        if(dd<0.01) acc.push(d); return acc;
      },[]);
      const avg = near.length? (near.reduce((s,d)=>s+(d.avgSpeed||0),0)/near.length) : 25;
      if(avg < 18){ res.push({ seg:[a,b], avg }); }
    }
    return res;
  }

  // Expose globally
  window.Analytics = Analytics;
})();
