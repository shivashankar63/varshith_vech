# Smart Bus Tracker - Performance Optimization Guide

## Asset Minification

### Manual Minification (One-time)
Use online tools or install npm packages:

```powershell
# Install minifiers (one-time setup)
npm install -g csso-cli terser

# Minify CSS
csso assets/styles.css -o assets/styles.min.css

# Minify JavaScript files
terser assets/app.js -c -m -o assets/app.min.js
terser assets/auth.js -c -m -o assets/auth.min.js
terser assets/config.js -c -m -o assets/config.min.js
terser assets/supabaseClient.js -c -m -o assets/supabaseClient.min.js
terser assets/errorHandler.js -c -m -o assets/errorHandler.min.js
terser assets/performance.js -c -m -o assets/performance.min.js
```

### Automated Build Script
```powershell
# Run from project root
.\build.ps1
```

## Image Optimization

### SVG Optimization
```powershell
# Install SVGO
npm install -g svgo

# Optimize SVG
svgo assets/images/bus.svg -o assets/images/bus-optimized.svg
```

### WebP Conversion (if needed for photos)
```powershell
# Convert PNG/JPG to WebP (requires cwebp tool)
cwebp -q 80 input.png -o output.webp
```

## Server Configuration

### Enable Gzip Compression

#### For Python HTTP Server (Development)
Python's built-in server doesn't support gzip. Use alternative:
```powershell
# Install http-server (Node.js)
npm install -g http-server

# Run with compression
http-server -g -c-1
```

#### For Production (Nginx)
Add to `nginx.conf`:
```nginx
gzip on;
gzip_vary on;
gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;
gzip_min_length 1000;
gzip_comp_level 6;
```

#### For Production (Apache)
Add to `.htaccess`:
```apache
<IfModule mod_deflate.c>
  AddOutputFilterByType DEFLATE text/html text/plain text/xml text/css application/javascript application/json
</IfModule>
```

## Performance Checklist

- [x] Throttle map marker updates (1/sec per bus)
- [x] Virtual scrolling for 50+ stops
- [x] Debounce journey planner inputs (300ms)
- [x] Lazy load Leaflet (only on tracker/driver pages)
- [ ] Minify CSS/JS (run build script)
- [ ] Optimize SVG icons (run svgo)
- [ ] Enable gzip on production server
- [ ] Add cache headers for static assets
- [ ] Use CDN for Leaflet/Supabase libraries

## Production Deployment

### Vercel/Netlify (Recommended)
1. Push to GitHub
2. Connect repo to Vercel/Netlify
3. Auto-enables compression and CDN
4. Set environment variables for Supabase keys

### Manual Server Setup
1. Minify assets: `.\build.ps1`
2. Enable gzip compression
3. Set cache headers:
```
Cache-Control: public, max-age=31536000, immutable (for versioned assets)
Cache-Control: public, max-age=3600 (for HTML)
```
