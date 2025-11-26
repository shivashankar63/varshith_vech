# Smart Bus Tracking – Demo UI

A lightweight, static web UI that visualizes a bus tracking system based on your description (use cases, GPS architecture, Android context). It simulates live bus movement, ETAs for stops, driver contact info, traffic overlays, alternate route suggestions, user geolocation, and an emergency alert stub.

## Features
- Map with routes, stops, and a moving bus marker (Leaflet + OSM)
- Route and bus selection, driver name and phone link
- Live ETAs for all stops along the selected route
- User location marker and ETA to the nearest stop
- Traffic overlay toggle and optional alternate route visualization
- Emergency modal that stubs a server call and shows a toast
- Separate auth flows: `User Login` and `Driver Login` with role-based dashboard placeholders

## Run locally (Windows PowerShell)
This is a static site; you can open `index.html` directly or serve it.

Option 1: Double-click `index.html` (quickest; some browsers restrict `fetch` from file://).

Option 2: Serve via a tiny HTTP server:

### Python 3
```powershell
python -m http.server 8000 ; Start-Process http://localhost:8000/bus-tracker-ui/
```

### Node (npx)
```powershell
npx serve .\bus-tracker-ui -l 8000 ; Start-Process http://localhost:8000
```

If you open the site from the repo root, the URL may be `http://localhost:8000/` and the app lives under `bus-tracker-ui/`.

## Structure
- `index.html` – layout and components
- `assets/styles.css` – modern dark theme styling
- `assets/app.js` – simulation logic, ETAs, geolocation, emergency stub
- `assets/data/routes.json` – sample routes, stops, traffic segments, drivers
- `assets/auth.js` – simple client-side auth/session helpers
- `auth/login-user.html` – student/faculty login page
- `auth/login-driver.html` – driver login page
- `dashboard/user.html` – user dashboard placeholder (post-login)
- `dashboard/driver.html` – driver dashboard placeholder (post-login)

## Notes
- No backend is required; all data is local. Replace the stub in `sendEmergency()` with your API call when ready.
- Map tiles are from OpenStreetMap. For Google Maps traffic layers or Directions, integrate the Google Maps JS API and supply your key.
- The geometry utilities here are simple and adequate for demos. For production, consider a routing/ETA service or libraries like turf.js.

## Auth flows
- User: open `auth/login-user.html`, sign in (student/faculty). Redirects to `dashboard/user.html`.
- Driver: open `auth/login-driver.html`, sign in with bus and phone. Redirects to `dashboard/driver.html`.
Both dashboards enforce role via `Auth.requireRole(role)` and include a `Logout` button.
