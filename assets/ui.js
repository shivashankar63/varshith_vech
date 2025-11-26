// Lightweight UI helpers: Toasts and Button state
const UI = (() => {
  let container;
  function ensureContainer(){
    if(container) return container;
    container = document.createElement('div');
    container.id = 'toast-container';
    container.setAttribute('role', 'status');
    container.setAttribute('aria-live', 'polite');
    container.setAttribute('aria-atomic', 'true');
    container.style.position = 'fixed';
    container.style.bottom = '20px';
    container.style.right = '20px';
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.gap = '8px';
    container.style.zIndex = '10000';
    document.body.appendChild(container);
    return container;
  }
  function toast(message, type='info', timeout=2500){
    const c = ensureContainer();
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.setAttribute('role', 'alert');
    el.setAttribute('aria-atomic', 'true');
    el.style.padding = '10px 14px';
    el.style.borderRadius = '8px';
    el.style.boxShadow = '0 6px 20px rgba(0,0,0,0.15)';
    el.style.color = '#0b0f14';
    el.style.background = type==='success' ? '#d1fae5' : type==='error' ? '#fee2e2' : type==='warning' ? '#fef3c7' : '#e5e7eb';
    el.textContent = message;
    c.appendChild(el);
    setTimeout(()=>{ el.style.opacity='0'; el.style.transition='opacity .3s'; setTimeout(()=> el.remove(), 300); }, timeout);
  }
  function withLoading(buttonEl, fn){
    if(!buttonEl){ return fn(); }
    const original = { text: buttonEl.textContent, disabled: buttonEl.disabled };
    buttonEl.disabled = true;
    buttonEl.textContent = 'Working...';
    const p = Promise.resolve().then(fn);
    p.finally(()=>{ buttonEl.disabled = original.disabled; buttonEl.textContent = original.text; });
    return p;
  }
  return { toast, withLoading };
})();

window.UI = UI;