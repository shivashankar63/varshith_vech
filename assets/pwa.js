/* PWA helpers: install prompt, visits counter */
(function(){
  let deferredPrompt = null;
  let visits = Number(localStorage.getItem('visits')||'0');
  localStorage.setItem('visits', String(visits+1));

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    maybeShowBanner();
  });

  function maybeShowBanner(){
    const v = Number(localStorage.getItem('visits')||'0');
    if(v < 3 || !deferredPrompt) return;
    const banner = document.createElement('div');
    banner.setAttribute('role','dialog');
    banner.style.position='fixed'; banner.style.left='16px'; banner.style.right='16px'; banner.style.bottom='16px';
    banner.style.background='#111827'; banner.style.color='#e5e7eb'; banner.style.border='1px solid #374151'; banner.style.borderRadius='12px'; banner.style.padding='12px'; banner.style.zIndex='9999';
    banner.innerHTML = '<strong>Add to Home Screen</strong><div style="margin-top:6px">Install the app for a faster experience.</div>'+
      '<div style="display:flex;gap:8px;margin-top:8px"><button id="a2hsInstall" class="btn btn-primary">Install</button><button id="a2hsDismiss" class="btn">Dismiss</button></div>';
    document.body.appendChild(banner);
    document.getElementById('a2hsInstall').onclick = async () => {
      banner.remove();
      deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      deferredPrompt = null;
    };
    document.getElementById('a2hsDismiss').onclick = () => banner.remove();
  }

  document.addEventListener('DOMContentLoaded', maybeShowBanner);
})();
