// Performance utilities for Smart Bus Tracking
(function(){
  // Throttle function: limit calls to once per delay period
  window.throttle = function(fn, delay = 1000) {
    let lastCall = 0;
    let timeout = null;
    
    return function(...args) {
      const now = Date.now();
      const timeSinceLastCall = now - lastCall;
      
      if (timeSinceLastCall >= delay) {
        lastCall = now;
        fn.apply(this, args);
      } else {
        // Schedule for later if within throttle window
        clearTimeout(timeout);
        timeout = setTimeout(() => {
          lastCall = Date.now();
          fn.apply(this, args);
        }, delay - timeSinceLastCall);
      }
    };
  };

  // Debounce function: delay execution until typing stops
  window.debounce = function(fn, delay = 300) {
    let timeout = null;
    
    return function(...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => fn.apply(this, args), delay);
    };
  };

  // Virtual scroll manager for large lists
  window.VirtualScroll = class {
    constructor(container, items, renderItem, itemHeight = 50) {
      this.container = container;
      this.items = items;
      this.renderItem = renderItem;
      this.itemHeight = itemHeight;
      this.visibleCount = Math.ceil(container.clientHeight / itemHeight) + 2; // +2 buffer
      this.scrollTop = 0;
      
      this.init();
    }
    
    init() {
      // Create wrapper and spacers
      this.wrapper = document.createElement('div');
      this.wrapper.style.height = `${this.items.length * this.itemHeight}px`;
      this.wrapper.style.position = 'relative';
      
      this.viewport = document.createElement('div');
      this.viewport.style.position = 'absolute';
      this.viewport.style.top = '0';
      this.viewport.style.left = '0';
      this.viewport.style.right = '0';
      
      this.wrapper.appendChild(this.viewport);
      this.container.innerHTML = '';
      this.container.appendChild(this.wrapper);
      
      // Bind scroll handler
      this.container.addEventListener('scroll', () => this.onScroll());
      
      this.render();
    }
    
    onScroll() {
      const newScrollTop = this.container.scrollTop;
      if (Math.abs(newScrollTop - this.scrollTop) > this.itemHeight / 2) {
        this.scrollTop = newScrollTop;
        this.render();
      }
    }
    
    render() {
      const startIndex = Math.floor(this.scrollTop / this.itemHeight);
      const endIndex = Math.min(startIndex + this.visibleCount, this.items.length);
      
      this.viewport.innerHTML = '';
      this.viewport.style.transform = `translateY(${startIndex * this.itemHeight}px)`;
      
      for (let i = startIndex; i < endIndex; i++) {
        const itemEl = this.renderItem(this.items[i], i);
        itemEl.style.height = `${this.itemHeight}px`;
        this.viewport.appendChild(itemEl);
      }
    }
    
    updateItems(newItems) {
      this.items = newItems;
      this.wrapper.style.height = `${this.items.length * this.itemHeight}px`;
      this.render();
    }
  };

  // Marker update throttler - per bus throttling
  window.MarkerThrottler = class {
    constructor(delay = 1000) {
      this.delay = delay;
      this.lastUpdates = new Map(); // busId -> timestamp
      this.pendingUpdates = new Map(); // busId -> {lat, lng, ...}
      this.timeouts = new Map(); // busId -> timeout
    }
    
    shouldUpdate(busId) {
      const last = this.lastUpdates.get(busId) || 0;
      return (Date.now() - last) >= this.delay;
    }
    
    updateMarker(busId, lat, lng, marker, callback) {
      if (this.shouldUpdate(busId)) {
        // Update immediately
        this.lastUpdates.set(busId, Date.now());
        if (marker) marker.setLatLng([lat, lng]);
        if (callback) callback(lat, lng);
        
        // Clear any pending
        this.pendingUpdates.delete(busId);
        clearTimeout(this.timeouts.get(busId));
      } else {
        // Store for later
        this.pendingUpdates.set(busId, { lat, lng, marker, callback });
        
        // Schedule update
        clearTimeout(this.timeouts.get(busId));
        const remaining = this.delay - (Date.now() - (this.lastUpdates.get(busId) || 0));
        
        this.timeouts.set(busId, setTimeout(() => {
          const pending = this.pendingUpdates.get(busId);
          if (pending) {
            this.lastUpdates.set(busId, Date.now());
            if (pending.marker) pending.marker.setLatLng([pending.lat, pending.lng]);
            if (pending.callback) pending.callback(pending.lat, pending.lng);
            this.pendingUpdates.delete(busId);
          }
        }, remaining));
      }
    }
    
    clear(busId) {
      this.lastUpdates.delete(busId);
      this.pendingUpdates.delete(busId);
      clearTimeout(this.timeouts.get(busId));
      this.timeouts.delete(busId);
    }
  };
})();
