// vendor/pageCement/main.js

/**
 * Page Cement — Stabilizes viewport behavior
 * Locks scroll, prevents zoom, and fixes viewport height.
 * Designed for fullscreen apps, games, or mobile web UIs.
 */

function setViewportHeight() {
    const vh = window.innerHeight * 0.01;
    document.documentElement.style.setProperty('--vh', `${vh}px`);
}

/**
 * Sets up event listeners for viewport stabilization.
 * @param {string} selector - CSS selector for the root element to monitor.
 */
export function pageCement(selector = 'body') {

    let elements = [];

    const trySelect = () => {
	if (elements.length > 0) return;
	const selectors = Array.isArray(selector) ? selector : [selector];
	elements = selectors
	    .map(sel => document.querySelector(sel))
	    .filter(el => el);
    };
    
    // Set initial viewport height
    setViewportHeight();

    // Fix vh on resize/orientation
    window.addEventListener('resize', setViewportHeight);
    window.addEventListener('orientationchange', setViewportHeight);
    document.addEventListener('DOMContentLoaded', setViewportHeight);


    // Prevent Ctrl+Zoom unless target is inside one of the allowed elements
    window.addEventListener('wheel', function (e) {
	trySelect();
	if (!e.ctrlKey) return;

	const zoomLevel = window.devicePixelRatio;
	const zoomingIn = e.deltaY < 0;
	const maxZoomLevel = 1; // or configurable

	const insideAllowed = elements.some(el => el.contains(e.target));

	if (zoomingIn && zoomLevel >= maxZoomLevel && !insideAllowed) {
	    e.preventDefault();
	}
    }, { passive: false });
} 


/*
export function pageCement(options = {}) {
  const {
    selector = 'body',
    lockScroll = true,
    preventZoom = true,
    fixVh = true
  } = options;

  const el = document.querySelector(selector);
  if (!el) return;

  if (lockScroll) {
    el.style.overflow = 'hidden';
    el.style.touchAction = 'none';
    el.style.userSelect = 'none';
  }

  if (preventZoom) {
    window.addEventListener('wheel', e => {
      if (e.ctrlKey) e.preventDefault();
    }, { passive: false });
  }

  if (fixVh) {
    const setVh = () => {
      document.documentElement.style.setProperty('--vh', `${window.innerHeight * 0.01}px`);
    };
    window.addEventListener('resize', setVh);
    window.addEventListener('orientationchange', setVh);
    setVh();
  }
}
*/
