/* Weekly delay email stub for demo (client-only) */
(function(){
  function scheduleWeeklyEmail(generateReport){
    // Client-only demo: simulate weekly run with a manual trigger button
    const btn = document.getElementById('sendWeeklyDelayReport');
    if(!btn) return;
    btn.onclick = async () => {
      try{
        const report = await generateReport();
        alert('Weekly delay report sent to admins (demo). Top hotspots: ' + report.hotspots.map(h=>h.segmentId).join(', '));
      }catch(e){ alert('Failed to generate report'); }
    };
  }
  window.Scheduler = { scheduleWeeklyEmail };
})();
