# Build script for Smart Bus Tracker
# Minifies CSS and JavaScript for production

Write-Host "Smart Bus Tracker - Build Script" -ForegroundColor Cyan
Write-Host "=================================" -ForegroundColor Cyan
Write-Host ""

# Check if minifiers are installed
$cssoInstalled = Get-Command csso -ErrorAction SilentlyContinue
$terserInstalled = Get-Command terser -ErrorAction SilentlyContinue

if (-not $cssoInstalled -or -not $terserInstalled) {
    Write-Host "Installing minifiers..." -ForegroundColor Yellow
    npm install -g csso-cli terser
}

# Create dist directory
if (-not (Test-Path "dist")) {
    New-Item -ItemType Directory -Path "dist" | Out-Null
}

Write-Host "Minifying CSS..." -ForegroundColor Green
csso assets/styles.css -o dist/styles.min.css

Write-Host "Minifying JavaScript..." -ForegroundColor Green
terser assets/app.js -c -m -o dist/app.min.js
terser assets/auth.js -c -m -o dist/auth.min.js
terser assets/config.js -c -m -o dist/config.min.js
terser assets/supabaseClient.js -c -m -o dist/supabaseClient.min.js
terser assets/errorHandler.js -c -m -o dist/errorHandler.min.js
terser assets/performance.js -c -m -o dist/performance.min.js

# Calculate size savings
$originalSize = (Get-ChildItem assets/*.css, assets/*.js | Measure-Object -Property Length -Sum).Sum
$minifiedSize = (Get-ChildItem dist/*.min.css, dist/*.min.js | Measure-Object -Property Length -Sum).Sum
$savings = [math]::Round(($originalSize - $minifiedSize) / $originalSize * 100, 1)

Write-Host ""
Write-Host "Build complete!" -ForegroundColor Green
Write-Host "Original size: $([math]::Round($originalSize/1KB, 1)) KB" -ForegroundColor White
Write-Host "Minified size: $([math]::Round($minifiedSize/1KB, 1)) KB" -ForegroundColor White
Write-Host "Savings: $savings%" -ForegroundColor Cyan
Write-Host ""
Write-Host "Minified files are in the 'dist' folder." -ForegroundColor Yellow
Write-Host "Update HTML files to use .min.css and .min.js versions for production." -ForegroundColor Yellow
