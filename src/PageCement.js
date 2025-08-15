/*
PageCement – Prevent accidental zooming and manage viewport height CSS vars
===========================================================================

USAGE (class API)
-----------------
import PageCement from 'vendor/pageCement/index.js';

// 1) Basic: set --vh and curb accidental zoom
const cement = new PageCement();
cement.enable();

// 2) Allow zoom inside a console + lock scroll
const cement2 = new PageCement({ allow: '#debugConsole, .zoom-ok', lockScroll: true });
cement2.enable();

// 3) Custom CSS variable name
new PageCement({ cssVarName: '--app-vh' }).enable();

// 4) Keyboard combo blocking
new PageCement({
    keyboardCombos: [
        { mods: { ctrl: true }, key: '+' },
        { mods: { ctrl: true }, key: '-' },
    ]
}).enable();

// CSS:
// .full-height { height: calc(var(--vh, 1vh) * 100); }

// Teardown (e.g., on unmount):
cement.controller.destroy(); // or cement.disable();


OPTIONS
-------
allow: string | string[]
    CSS selector(s) for regions where zooming is allowed.
    May be a single selector or an array of selectors.

cssVarName: string
    CSS variable name to use for viewport height units.
    Default: "--vh"

lockScroll: boolean
    If true, disables scroll when enabled.

maxZoom: number
    Maximum zoom factor allowed. Default: 1.

useVisualViewport: boolean
    Use window.visualViewport if available.
    Default: true

keyboardCombos: false | true | Array<{ mods?: object, key: string }>
    Controls which keyboard shortcuts to block:
        false – Do not block any keypresses.
        true – Block ANY keypress with Ctrl or Meta held.
        Array – Block only specific combos.
            mods: object with modifier keys and boolean values.
                  Omitted modifiers are treated as "don't care".
            key:  String name of the key to match (case-sensitive).


FUTURE WORK
-----------
- Configurable "insideAllowed" logic:
    Option to choose whether "inside allowed" is determined by event.target,
    last pointer location, or hybrid mode.
- Zoom exceptions for typable elements:
    Allow zoom inside <input>, <textarea>, and [contenteditable], then optionally
    revert after blur.
- Mouse-position aware key filtering:
    Track pointer location to refine blocking when event.target is unreliable.

VERSION
-------
1.0 – Stable core behavior with configurable keyboard blocking.
*/

/**
 * @typedef {Object} PageCementOptions
 * @property {string|string[]|Element|Element[]} [allow]
 *    CSS selector(s) or Element(s) where zoom is allowed.
 * @property {string|string[]} [watch]
 *    Alias of `allow` for back-compat with old selector-only configs.
 * @property {number} [maxZoom=1]
 *    Max devicePixelRatio before blocking zoom-in.
 * @property {boolean} [lockScroll=false]
 *    If true, sets body overflow:hidden while enabled.
 * @property {boolean} [useVisualViewport=true]
 *    Use VisualViewport for more accurate `--vh` on mobile.
 * @property {string} [cssVarName='--vh']
 *    CSS variable to write the computed 1vh (in px) to.
 */

/**
 * @typedef {Object} PageCementController
 * @property {() => void} refresh  Recompute and apply `--vh` (rAF-throttled).
 * @property {() => void} destroy  Remove all listeners and restore prior state.
 */

/**
 * Class: PageCement
 * -----------------
 * Class-based viewport stabilizer. Construct with options, then call `enable()`
 * to attach behavior. Public methods return booleans for simple success/no-op signaling.
 *
 * Public API:
 *   new PageCement(options?: PageCementOptions)
 *   .enable(runOpts?: Partial<PageCementOptions>): boolean
 *   .refresh(): boolean
 *   .disable(): boolean
 *
 * Instance fields:
 *   enabled: boolean
 *   controller: PageCementController | null   // internal controller used by disable/destroy
 *   isSSR: boolean
 *   opts: PageCementOptions
 *   _state: internal state bag (handlers/cleanup/cache)
 */

export class PageCement {

    /**
     * @param {PageCementOptions | string | string[]} [options]
     */
    constructor(options) {
	// SSR-safe: never return; just mark and no-op later.
	this.isSSR = (typeof window === 'undefined' || typeof document === 'undefined');

	// Defaults
	const defaults = {
	    allow: undefined,           // string | string[]
	    watch: undefined,           // alias for allow
	    maxZoom: 1,
	    lockScroll: false,
	    useVisualViewport: true,
	    cssVarName: '--vh',
	};

	// Back-compat normalization
	const raw = (typeof options === 'string' || Array.isArray(options))
	      ? { allow: options }
	      : (options || {});

	const merged = { ...defaults, ...raw };
	if (!merged.allow && merged.watch) merged.allow = merged.watch;

	// Canonicalize shapes without touching the DOM yet
	this.opts = merged;
	this.enabled = false;         // toggled by enable()/disable()
	this.controller = null;       // set by enable()
	this._state = null;           // internal event/state bag created in enable()

	// Pre-bind instance methods if you’ll attach them as listeners later (optional)
	// this._onResize = this._onResize?.bind(this);

	// Done. No returns.
    }

    // enable(), disable(), refresh(), updateOptions() will live here

    // Lazily populate allowedEls
    // Resolve allowed elements lazily (in case the app mounts later)
    _invalidateAllowedCache() {
	if (this._state) this._state.allowEls = [];
    }

    _resolveAllowed() {
	const s = this._state;
	if (!s || s.allowEls.length) return;

	let allow = s.opts?.allow;
	if (allow == null) return;

	const items = Array.isArray(allow) ? allow : [allow];
	const els = [];

	for (const item of items) {
	    if (item instanceof Element) {          // support direct nodes
		els.push(item);
		continue;
	    }
	    if (typeof item === 'string') {
		const sel = item.trim();
		if (!sel) continue;                   // skip empty strings
		try {
		    // querySelectorAll handles comma groups and returns all matches
		    els.push(...document.querySelectorAll(sel));
		} catch (_) {
		    // ignore invalid selectors
		}
	    }
	}

	// Dedupe while preserving order
	s.allowEls = [...new Set(els)];
    }


    _isInsideAllowed(target) {
	this._resolveAllowed();
	return this._state?.allowEls?.some(el => el && el.contains(target));
    }


    // inside the class

    _getWin() { return window; }
    _getDocEl() { return (document && document.documentElement) || document.documentElement; }

    // Calculate the numeric vh unit (1vh in px) using VisualViewport if enabled
    _calcVH() {
	const w = this._getWin();
	const s = this._state;
	// guard if disable() ran between queue and commit
	if (!s) return null;

	try {
	    if (s.useVisualViewport && w.visualViewport && typeof w.visualViewport.height === 'number') {
		return w.visualViewport.height * 0.01;
	    }
	} catch (_) { /* WebKit oddities */ }

	return w.innerHeight * 0.01;
    }

    // Commit the CSS variable immediately (internal)
    _commitVH() {
	const s = this._state;
	if (!s) return;
	const vh = this._calcVH();
	if (vh == null) return;
	this._getDocEl().style.setProperty(s.cssVarName, `${vh}px`);
    }

    // Public-friendly refresh that’s rAF-throttled
    _setVH() {
	const s = this._state;
	if (!s) return;
	if (s.raf) cancelAnimationFrame(s.raf);
	s.raf = requestAnimationFrame(() => {
	    s.raf = null;
	    this._commitVH();
	});
    }

    _onWheel(e) {
	if (!this._state) return;
	if (!e.ctrlKey) return;
	const zoomLevel = window.devicePixelRatio || 1;
	const zoomingIn = e.deltaY < 0;
	if (zoomingIn && zoomLevel >= this._state.maxZoom && !this._isInsideAllowed(e.target)) {
            e.preventDefault();
	}
    }

    _wirePointerIntent() {
	if (!this._state) return;
	const { handlers, cleanup } = this._state;

	// Store the last element under the pointer (mouse, pen, touch)
	handlers.onPointerMove = (e) => {
	    const el = document.elementFromPoint(e.clientX, e.clientY);
	    this._state.lastPointerEl = el || null;
	};

	window.addEventListener('pointermove', handlers.onPointerMove, { passive: true });
	cleanup.push(() => window.removeEventListener('pointermove', handlers.onPointerMove));
    }
    // doesnt work as I intend it. just leaving here for now incase I change it later
    _eventTarget(e) {
	// Prefer composed path (Shadow DOM safe)
	const path = typeof e.composedPath === 'function' ? e.composedPath() : null;
	let t = path && path.length ? path[0] : e.target;

	// If it's window/document/body, prefer the focused element
	if (!t || t === window || t === document || t === document.body) {
	    t = document.activeElement || document.body;
	}
	return t;
    }
    
    /**
       small note. this will not function quite as intuitvely as intended. for now
    true == will kill all keyboard events mostly.
    false == ignores keyboard events
    array of objects, allow these events,

    this only works on the focused event, but since we are not always focused on keyboard events, this doesnt work as intended.
    
    */
    _onKeyDown(e) {
	const s = this._state;
	if (!s) return;

	const kc = s.opts.keyboardCombos;

	// Mode A: false → ignore everything
	if (kc === false) return;
	//const target = this._eventTarget(e);
	const target = e.target;
	/*
	//this is experimental code. it may be disregarded for this version 1 release.
	//problem: at present, using the focused or selected element for certain things just doesnt work.
	//as an example, since we are rarely focused, on things like zoom or say alt-table or alt refresh etc, basically its always document body, which resolves to first
	//I'm playing around in the key press area, but this could be extended to everything later on.
	//we probably want 2 options on startup , by focused or by pointer.then a user can decide.

	const path = typeof e.composedPath === 'function' ? e.composedPath() : null;
	let target = path && path.length ? path[0] : e.target;

	// If target is generic (body/doc) or missing, fall back to focus, then last pointer
	if (!target || target === window || target === document || target === document.body) {
	    target = document.activeElement || s.lastPointerEl || document.body;
	    console.log('hot here',s.lastPointerEl);
	}
	*/
	
	// If inside allowed region, never block
	if (this._isInsideAllowed(target)) return;
	console.log(target, this._isInsideAllowed(target));
	// Mode B: true → block ANY keypress with Ctrl or Meta held
	if (kc === true) {
	    if (e.ctrlKey || e.metaKey) {
		e.preventDefault();
	    }
	    return;
	}

	// Mode C: array → block only explicit combos
	// (use provided list; fall back to defaults if you prefer)
	const combos = Array.isArray(kc) ? kc : DEFAULT_KEYBOARD_COMBOS;

	for (const combo of combos) {
	    // Check only listed modifiers; omitted mods are “don’t care”
	    const mods = combo.mods || {};
	    let modsMatch = true;
	    for (const m in mods) {
		const want = !!mods[m];
		const got = !!e[`${m}Key`];
		if (got !== want) { modsMatch = false; break; }
	    }
	    if (!modsMatch) continue;

	    if (e.key === combo.key) {
		e.preventDefault();
		break;
	    }
	}
    }

    
    d_onKeyDown(e) {
	if (!this._state) return;
	if (!e.ctrlKey && !e.metaKey) return; // allow Cmd on macOS to count
	const k = e.key;
	if (k === '+' || k === '-' || k === '=' || k === 'Add' || k === 'Subtract') {
            if (!this._isInsideAllowed(e.target)) {
		e.preventDefault();
            }
	}
    }


    _onTouchStart(e) {
	if (!this._state) return;
	const t = e.targetTouches && e.targetTouches[0];
	const tgt = (t && document.elementFromPoint(t.clientX, t.clientY)) || e.target;
	this._state.touchInsideAllowed = this._isInsideAllowed(tgt);
    }


    _onGesture(e) {
	// Uses the flag set by _onTouchStart
	if (!this._state || this._state.touchInsideAllowed) return;
	e.preventDefault();
    }

    
    _initState(opts) {
	if (!opts || typeof opts !== 'object') opts = {};

	// normalize once; keep source of truth in state.opts
	const kc = (opts.keyboardCombos ?? false);
	const normalizedOpts = { ...opts, keyboardCombos: kc };
	const cssVarName = normalizedOpts.cssVarName || '--vh';

	this._state = {
	    opts: normalizedOpts,
	    cssVarName,
	    prevCssVar: getComputedStyle(document.documentElement).getPropertyValue(cssVarName),
	    maxZoom: Number.isFinite(normalizedOpts.maxZoom) ? normalizedOpts.maxZoom : 1,
	    lockScroll: !!normalizedOpts.lockScroll,
	    useVisualViewport: normalizedOpts.useVisualViewport !== false,
	    allowEls: /** @type {Element[]} */ ([]),
	    touchInsideAllowed: false,
	    cleanup: /** @type {(() => void)[]} */ ([]),
	    raf: /** @type {number|null} */ (null),
	    handlers: {}
	};

	return this._state;
    }


    _wireDomReady() {
	if (!this._state) return;
	const { handlers, cleanup } = this._state;
	if (document.readyState === 'loading') {
	    handlers.onReady = () => this._setVH();
	    document.addEventListener('DOMContentLoaded', handlers.onReady, { once: true });
	    cleanup.push(() => document.removeEventListener('DOMContentLoaded', handlers.onReady));
	}
    }


    _wireViewport() {
	if (!this._state) return;
	const { handlers, cleanup } = this._state;
	const win = window;

	handlers.onResize = () => this._setVH();
	win.addEventListener('resize', handlers.onResize, { passive: true });
	cleanup.push(() => win.removeEventListener('resize', handlers.onResize));

	handlers.onOrientation = () => this._setVH();
	win.addEventListener('orientationchange', handlers.onOrientation);
	cleanup.push(() => win.removeEventListener('orientationchange', handlers.onOrientation));

	let vv = null;
	try { vv = win.visualViewport || null; } catch { vv = null; }
	if (vv) {
	    handlers.onVV = () => this._setVH();
	    vv.addEventListener('resize', handlers.onVV, { passive: true });
	    vv.addEventListener('scroll', handlers.onVV, { passive: true });
	    cleanup.push(() => {
		vv.removeEventListener('resize', handlers.onVV);
		vv.removeEventListener('scroll', handlers.onVV);
	    });
	}
    }

    _wireWheel() {
	if (!this._state) return;
	const { handlers, cleanup } = this._state;
	handlers.onWheel = (e) => this._onWheel(e);
	window.addEventListener('wheel', handlers.onWheel, { passive: false });
	cleanup.push(() => window.removeEventListener('wheel', handlers.onWheel));
    }

    _wireKeyDown() {
	if (!this._state) return;
	const { handlers, cleanup } = this._state;
	handlers.onKeyDown = (e) => this._onKeyDown(e);
	document.addEventListener('keydown', handlers.onKeyDown, { passive: false });
	cleanup.push(() => document.removeEventListener('keydown', handlers.onKeyDown));
    }

    _wireTouchStart() {
	if (!this._state) return;
	const { handlers, cleanup } = this._state;
	handlers.onTouchStart = (e) => this._onTouchStart(e);
	document.addEventListener('touchstart', handlers.onTouchStart, { passive: true, capture: true });
	cleanup.push(() => document.removeEventListener('touchstart', handlers.onTouchStart, { capture: true }));
    }

    _wireGesture() {
	if (!this._state) return;
	const { handlers, cleanup } = this._state;
	const win = window;
	handlers.onGesture = (e) => this._onGesture(e);
	win.addEventListener('gesturestart', handlers.onGesture, { passive: false });
	win.addEventListener('gesturechange', handlers.onGesture, { passive: false });
	win.addEventListener('gestureend', handlers.onGesture, { passive: false });
	cleanup.push(() => {
	    win.removeEventListener('gesturestart', handlers.onGesture);
	    win.removeEventListener('gesturechange', handlers.onGesture);
	    win.removeEventListener('gestureend', handlers.onGesture);
	});
    }

    _wireScrollLock() {
	if (!this._state || !this._state.lockScroll) return;
	const { cleanup } = this._state;
	const apply = () => {
	    const prev = document.body.style.overflow;
	    document.body.style.overflow = 'hidden';
	    cleanup.push(() => { document.body.style.overflow = prev; });
	};
	if (document.body) apply();
	else {
	    const onReady = () => apply();
	    document.addEventListener('DOMContentLoaded', onReady, { once: true });
	    cleanup.push(() => document.removeEventListener('DOMContentLoaded', onReady));
	}
    }


    _makeController() {
	return {
	    refresh: () => this._setVH(),
	    destroy: () => {
		const s = this._state;
		if (!s) return;

		// Restore CSS var first
		const el = document.documentElement;
		if (s.prevCssVar && s.prevCssVar.trim() !== '') {
		    el.style.setProperty(s.cssVarName, s.prevCssVar);
		} else {
		    el.style.removeProperty(s.cssVarName);
		}

		// Cancel pending rAF and run cleanups LIFO
		if (s.raf) cancelAnimationFrame(s.raf);
		for (let i = s.cleanup.length - 1; i >= 0; i--) { try { s.cleanup[i](); } catch {} }
		s.cleanup.length = 0;

		// Final flags
		this.enabled = false;
		this._state = null;
		this.controller = null; // avoid stale reference
	    }
	};
    }


    /** Enable behavior and return a controller for refresh/destroy. */
    enable(runOpts = {}) {
	// Merge and persist options
	this.opts = { ...(this.opts || {}), ...(runOpts || {}) };

	 if (this.isSSR) {
	     this.enabled = false;
	     this.controller = null;
	     this._state = null;
	     return false;
	 }

	// Idempotence
	if (this.enabled && (!runOpts || Object.keys(runOpts).length === 0)) return true;
	if (this.enabled) this.disable();

	// Build state bag
	this._initState(this.opts);

	// Initial paint
	this._setVH();

	// Wire sections
	//dont delete. we will improve this in subsequent versions. for now its not important as it works 'as intended' unintentionally on the main project
	//this._wirePointerIntent();
	this._wireDomReady();
	this._wireViewport();   // resize, orientationchange, VisualViewport
	this._wireWheel();      // ctrl+wheel zoom
	this._wireKeyDown();    // ctrl/cmd +/-/=
	this._wireTouchStart(); // remember last touch target
	this._wireGesture();    // iOS pinch gestures
	this._wireScrollLock(); // optional


	this.controller = this._makeController();

	this.enabled = true;
	return true; //success
    }

    
    /** Disable behavior and clean up. Safe to call multiple times. */
    disable() {
	if (!this.enabled || !this.controller) return false;
	this.controller.destroy();
	this.controller = null;
	return true; //success
    }


    /** Recompute and apply --vh (rAF-throttled). No-op if disabled. */
    refresh() {
	if (!this._state) return false;
	this._setVH();
	return true; //success
    }

    
}

export default PageCement;
