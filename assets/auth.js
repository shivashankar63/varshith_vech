// Simple, client-side auth stub
// Stores session info in localStorage and redirects to role-specific dashboards.

const Auth = (() => {
  const KEY = 'sb.session';
  const USERS_KEY = 'sb.users';
  const DRIVERS_KEY = 'sb.drivers';
  const hasSupabase = () => !!(window.SB && window.SB.client);

  function saveSession(data){
    const now = Date.now();
    const accessTtlMs = 10 * 60 * 1000; // 10 minutes
    const refreshTtlMs = 24 * 60 * 60 * 1000; // 24 hours
    const session = {
      ...data,
      ts: now,
      accessExp: now + accessTtlMs,
      refreshExp: now + refreshTtlMs
    };
    localStorage.setItem(KEY, JSON.stringify(session));
  }
  function getSession(){
    try{ return JSON.parse(localStorage.getItem(KEY) || 'null'); }catch{ return null }
  }
  function clear(){ localStorage.removeItem(KEY); }
  function isAccessExpired(s){ return !s || Date.now() >= s.accessExp; }
  function isRefreshExpired(s){ return !s || Date.now() >= s.refreshExp; }
  async function refreshTokenIfNeeded(){
    let s = getSession();
    if(!s) return null;
    if(isRefreshExpired(s)){ clear(); return null; }
    if(isAccessExpired(s)){
      try{
        if(hasSupabase()){
          const { data, error } = await SB.client.auth.refreshSession();
          if(error) throw error;
          const user = data?.user;
          saveSession({ ...s, userId: s.userId, email: s.email, role: s.role });
        } else {
          // Static demo: extend access window
          saveSession({ ...s });
        }
      } catch(err){ console.warn('Token refresh failed', err); clear(); return null; }
    }
    return getSession();
  }

  function getUsers(){
    try{ return JSON.parse(localStorage.getItem(USERS_KEY) || '[]'); }catch{ return [] }
  }
  function saveUser(user){
    const users = getUsers();
    users.push(user);
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
  }
  function findUser(userId, email){
    return getUsers().find(u => u.userId === userId || u.email === email);
  }

  function getDrivers(){
    try{ return JSON.parse(localStorage.getItem(DRIVERS_KEY) || '[]'); }catch{ return [] }
  }
  function saveDriver(driver){
    const drivers = getDrivers();
    drivers.push(driver);
    localStorage.setItem(DRIVERS_KEY, JSON.stringify(drivers));
  }
  function findDriver(driverId, phone){
    return getDrivers().find(d => d.driverId === driverId || d.phone === phone);
  }

  async function supabaseSignUp(email, password){
    const { data, error } = await SB.client.auth.signUp({ email, password });
    if(error) throw error; return data;
  }
  async function supabaseSignIn(email, password){
    const { data, error } = await SB.client.auth.signInWithPassword({ email, password });
    if(error) throw error; return data;
  }

  function bindUserSignup(formId){
    const form = document.getElementById(formId);
    form.addEventListener('submit', e => {
      e.preventDefault();
      const userType = document.getElementById('userType').value;
      const fullName = document.getElementById('fullName').value.trim();
      const userId = document.getElementById('userId').value.trim();
      const email = document.getElementById('email').value.trim();
      const phone = document.getElementById('phone').value.trim();
      const password = document.getElementById('password').value;
      const confirmPass = document.getElementById('confirmPass').value;
      
      if(password !== confirmPass){ return alert('Passwords do not match.'); }
      if(hasSupabase()){
        (async () => {
          try{
            const { data, error } = await SB.client.auth.signUp({ 
              email, 
              password,
              options: { emailRedirectTo: window.location.origin }
            });
            if(error) throw error;
            await SB.upsertProfile({ full_name: fullName, phone, role: 'user' });
            // Store userId in session for later use
            saveSession({ role: 'user', userType, userId, email, fullName, phone });
            alert('Account created successfully! Please login.');
            location.href = 'login-user.html';
          } catch(err){ alert('Signup failed: ' + (err.message || err)); }
        })();
      } else {
        if(findUser(userId, email)){ return alert('User with this ID or email already exists.'); }
        saveUser({ userType, fullName, userId, email, phone, password });
        alert('Account created successfully! Please login.');
        location.href = 'login-user.html';
      }
    });
  }

  function bindDriverSignup(formId){
    const form = document.getElementById(formId);
    form.addEventListener('submit', e => {
      e.preventDefault();
      const fullName = document.getElementById('fullName').value.trim();
      const driverId = document.getElementById('driverId').value.trim();
      const busId = document.getElementById('busId').value;
      const phone = document.getElementById('phone').value.trim();
      const email = document.getElementById('email').value.trim();
      const password = document.getElementById('password').value;
      const confirmPass = document.getElementById('confirmPass').value;
      
      if(!busId){ return alert('Please select a bus.'); }
      if(password !== confirmPass){ return alert('Passwords do not match.'); }
      if(hasSupabase()){
        (async () => {
          try{
            const loginEmail = email || `${driverId}@drivers.local`; 
            const { data, error } = await SB.client.auth.signUp({ 
              email: loginEmail, 
              password,
              options: { emailRedirectTo: window.location.origin }
            });
            if(error) throw error;
            await SB.upsertProfile({ full_name: fullName, phone, role: 'driver' });
            // Store driver details in session for later use
            saveSession({ role: 'driver', busId, phone, driverId, fullName, email });
            alert('Account created successfully! Please login.');
            location.href = 'login-driver.html';
          } catch(err){ alert('Signup failed: ' + (err.message || err)); }
        })();
      } else {
        if(findDriver(driverId, phone)){ return alert('Driver with this ID or phone already exists.'); }
        saveDriver({ fullName, driverId, busId, phone, email, password });
        alert('Account created successfully! Please login.');
        location.href = 'login-driver.html';
      }
    });
  }

  function bindUserLogin(formId){
    const form = document.getElementById(formId);
    form.addEventListener('submit', e => {
      e.preventDefault();
      const userType = document.getElementById('userType').value;
      const userId = document.getElementById('userId').value.trim();
      const email = document.getElementById('email').value.trim();
      const password = document.getElementById('password').value;
      if(!userId || !email || !password){ return alert('Please fill all fields.'); }
      if(hasSupabase()){
        (async () => {
          try{
            await supabaseSignIn(email, password);
            const profile = await SB.getProfile();
            const fullName = profile?.full_name || '';
            const phone = profile?.phone || '';
            saveSession({ role: 'user', userType, userId, email, fullName, phone });
            location.href = '../dashboard/user.html';
          } catch(err){ alert('Login failed: ' + (err.message || err)); }
        })();
      } else {
        const user = findUser(userId, email);
        if(!user || user.password !== password){ return alert('Invalid credentials.'); }
        saveSession({ role: 'user', userType: user.userType, userId: user.userId, email: user.email, fullName: user.fullName, phone: user.phone });
        location.href = '../dashboard/user.html';
      }
    });
  }

  function bindDriverLogin(formId){
    const form = document.getElementById(formId);
    form.addEventListener('submit', e => {
      e.preventDefault();
      const busId = document.getElementById('busId').value;
      const emailInput = document.getElementById('driverEmail');
      const email = emailInput ? emailInput.value.trim() : '';
      const phone = document.getElementById('driverPhone') ? document.getElementById('driverPhone').value.trim() : '';
      const password = document.getElementById('driverPass').value;
      if(!busId || (!email && !phone) || !password){ return alert('Please fill all fields.'); }
      if(hasSupabase() && email){
        (async () => {
          try{
            await supabaseSignIn(email, password);
            const profile = await SB.getProfile();
            const fullName = profile?.full_name || '';
            const driverId = profile?.driver_id || '';
            const assignedBus = profile?.bus_id || busId;
            const phoneVal = profile?.phone || phone;
            saveSession({ role: 'driver', busId: assignedBus, phone: phoneVal, driverId, fullName, email });
            location.href = '../dashboard/driver.html';
          } catch(err){ alert('Login failed: ' + (err.message || err)); }
        })();
      } else {
        const driver = findDriver(null, phone);
        if(!driver || driver.password !== password || driver.busId !== busId){ return alert('Invalid credentials.'); }
        saveSession({ role: 'driver', busId: driver.busId, phone: driver.phone, driverId: driver.driverId, fullName: driver.fullName });
        location.href = '../dashboard/driver.html';
      }
    });
  }

  function requireRole(role){
    const s = getSession();
    if(!s || s.role !== role){
      location.href = role === 'driver' ? '../auth/login-driver.html' : '../auth/login-user.html';
    }
    return s;
  }

  // Inactivity/Session timeout (30 min) with countdown modal
  const SESSION_IDLE_MS = 30 * 60 * 1000;
  let idleTimer = null; let warningTimer = null;
  function resetIdle(){
    if(idleTimer) clearTimeout(idleTimer);
    if(warningTimer) clearInterval(warningTimer);
    idleTimer = setTimeout(() => showTimeoutWarning(), SESSION_IDLE_MS - 60 * 1000); // warn at T-60s
  }
  function showTimeoutWarning(){
    let remaining = 60;
    let modal = document.getElementById('sessionTimeoutModal');
    if(!modal){
      modal = document.createElement('div');
      modal.id = 'sessionTimeoutModal';
      modal.style.position = 'fixed'; modal.style.inset = '0'; modal.style.background = 'rgba(0,0,0,0.6)'; modal.style.display = 'flex'; modal.style.alignItems = 'center'; modal.style.justifyContent = 'center';
      modal.innerHTML = `<div style="background:#111827;border:1px solid #374151;border-radius:8px;padding:16px;max-width:360px;text-align:center">
        <h3>Session Timeout</h3>
        <p>You will be logged out in <span id="timeoutCountdown">60</span>s due to inactivity.</p>
        <div style="display:flex;gap:8px;justify-content:center">
          <button id="stayLoggedInBtn">Stay Logged In</button>
          <button id="logoutNowBtn" class="primary">Logout</button>
        </div>
      </div>`;
      document.body.appendChild(modal);
      document.getElementById('stayLoggedInBtn').onclick = () => { modal.remove(); saveSession({ ...getSession() }); resetIdle(); };
      document.getElementById('logoutNowBtn').onclick = () => { modal.remove(); clear(); location.href = '../auth/login-user.html'; };
    } else { modal.style.display = 'flex'; }
    const countdownEl = document.getElementById('timeoutCountdown');
    warningTimer = setInterval(() => {
      remaining -= 1;
      if(countdownEl) countdownEl.textContent = String(remaining);
      if(remaining <= 0){ clearInterval(warningTimer); modal.remove(); clear(); location.href = '../auth/login-user.html'; }
    }, 1000);
  }
  function bindIdleTracking(){
    ['click','keydown','mousemove','scroll','touchstart'].forEach(evt => document.addEventListener(evt, resetIdle));
    resetIdle();
  }

  // HTTPS-only enforcement (client-side)
  function enforceHttps(){
    try{
      const isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
      if(!isLocal && location.protocol !== 'https:'){
        location.href = 'https://' + location.host + location.pathname + location.search;
      }
    } catch{}
  }

  // Cookie helper with Secure & SameSite
  function setSecureCookie(name, value, days=1){
    const exp = new Date(Date.now() + days*24*60*60*1000).toUTCString();
    const isHttps = location.protocol === 'https:';
    document.cookie = `${name}=${encodeURIComponent(value)}; expires=${exp}; path=/; SameSite=Strict${isHttps?'; Secure':''}`;
  }

  document.addEventListener('DOMContentLoaded', () => { enforceHttps(); bindIdleTracking(); refreshTokenIfNeeded(); });

  return { bindUserLogin, bindDriverLogin, bindUserSignup, bindDriverSignup, getSession, clear, requireRole, refreshTokenIfNeeded, setSecureCookie };
})();
