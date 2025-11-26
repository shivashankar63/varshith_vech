// Error Handling & Resilience Module
(function(){
  window.ErrorHandler = {
    retryAttempts: new Map(), // track retry counts per operation
    maxRetries: 3,
    
    // Exponential backoff retry wrapper
    async withRetry(fn, operationName = 'operation') {
      const key = operationName;
      const attempts = this.retryAttempts.get(key) || 0;
      
      try {
        const result = await fn();
        this.retryAttempts.delete(key); // success, reset
        return result;
      } catch (error) {
        if (attempts >= this.maxRetries) {
          this.retryAttempts.delete(key);
          this.showToast(`Failed after ${this.maxRetries} attempts: ${operationName}`, 'error');
          throw error;
        }
        
        // Exponential backoff: 1s, 2s, 4s
        const delay = Math.pow(2, attempts) * 1000;
        this.retryAttempts.set(key, attempts + 1);
        
        console.warn(`[Retry] ${operationName} failed, attempt ${attempts + 1}/${this.maxRetries}, retrying in ${delay}ms`);
        await this.sleep(delay);
        return this.withRetry(fn, operationName);
      }
    },
    
    // Show user-friendly toast
    showToast(message, type = 'info') {
      const toast = document.getElementById('toast') || this.createToast();
      toast.textContent = message;
      toast.className = `toast toast-${type} show`;
      setTimeout(() => toast.classList.remove('show'), 3000);
    },
    
    createToast() {
      const toast = document.createElement('div');
      toast.id = 'toast';
      toast.className = 'toast';
      document.body.appendChild(toast);
      return toast;
    },
    
    sleep(ms) {
      return new Promise(resolve => setTimeout(resolve, ms));
    },
    
    // Wrap async function with error boundary
    wrapAsync(fn, errorMessage = 'Operation failed') {
      return async (...args) => {
        try {
          return await fn(...args);
        } catch (error) {
          console.error(`[Error] ${errorMessage}:`, error);
          this.showToast(errorMessage, 'error');
          throw error;
        }
      };
    }
  };

  // LocalStorage cache manager
  window.CacheManager = {
    set(key, value, ttlSeconds = 300) {
      try {
        const item = {
          value,
          expiry: Date.now() + (ttlSeconds * 1000)
        };
        localStorage.setItem(key, JSON.stringify(item));
      } catch (e) {
        console.warn('[Cache] Set failed:', e);
      }
    },
    
    get(key) {
      try {
        const item = JSON.parse(localStorage.getItem(key));
        if (!item) return null;
        if (Date.now() > item.expiry) {
          localStorage.removeItem(key);
          return null;
        }
        return item.value;
      } catch (e) {
        return null;
      }
    },
    
    remove(key) {
      try {
        localStorage.removeItem(key);
      } catch (e) {}
    },
    
    // Cache bus positions
    cachePositions(positions) {
      this.set('bus_positions', positions, 60); // 1 min TTL
    },
    
    getCachedPositions() {
      return this.get('bus_positions') || {};
    },
    
    // Cache routes
    cacheRoutes(routes) {
      this.set('routes', routes, 3600); // 1 hour TTL
    },
    
    getCachedRoutes() {
      return this.get('routes');
    }
  };

  // Connection quality monitor
  window.ConnectionMonitor = {
    lastPingTime: Date.now(),
    pingInterval: null,
    qualityLevel: 'good', // good | fair | poor | offline
    
    init() {
      this.updateOnlineStatus();
      window.addEventListener('online', () => this.updateOnlineStatus());
      window.addEventListener('offline', () => this.updateOnlineStatus());
      
      // Monitor realtime lag
      this.pingInterval = setInterval(() => this.checkLag(), 5000);
    },
    
    updateOnlineStatus() {
      const isOnline = navigator.onLine;
      this.qualityLevel = isOnline ? 'good' : 'offline';
      this.updateIndicator();
      this.toggleOfflineBanner(!isOnline);
    },
    
    checkLag() {
      const now = Date.now();
      const lag = now - this.lastPingTime;
      
      if (lag > 10000) {
        this.qualityLevel = 'poor';
      } else if (lag > 5000) {
        this.qualityLevel = 'fair';
      } else {
        this.qualityLevel = 'good';
      }
      
      this.updateIndicator();
    },
    
    updatePing() {
      this.lastPingTime = Date.now();
      this.checkLag();
    },
    
    updateIndicator() {
      const indicator = document.getElementById('connectionIndicator');
      if (!indicator) return;
      
      const colors = {
        good: '#22c55e',
        fair: '#f59e0b',
        poor: '#ef4444',
        offline: '#6b7280'
      };
      
      const labels = {
        good: 'Connected',
        fair: 'Slow',
        poor: 'Poor',
        offline: 'Offline'
      };
      
      indicator.style.color = colors[this.qualityLevel];
      indicator.textContent = labels[this.qualityLevel];
      indicator.title = `Connection: ${labels[this.qualityLevel]}`;
    },
    
    toggleOfflineBanner(show) {
      let banner = document.getElementById('offlineBanner');
      if (show && !banner) {
        banner = document.createElement('div');
        banner.id = 'offlineBanner';
        banner.className = 'offline-banner';
        banner.innerHTML = '⚠️ You are offline. Some features may be limited.';
        document.body.prepend(banner);
      } else if (!show && banner) {
        banner.remove();
      }
    },
    
    destroy() {
      if (this.pingInterval) clearInterval(this.pingInterval);
    }
  };

  // Auto-init
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => ConnectionMonitor.init());
  } else {
    ConnectionMonitor.init();
  }
})();
