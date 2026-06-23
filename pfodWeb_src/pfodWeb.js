/*
   pfodWeb.js
 * (c)2025 Forward Computing and Control Pty. Ltd.
 * NSW Australia, www.forward.com.au
 * This code is not warranted to be fit for any purpose. You may only use it at your own risk.
 * This generated code may be freely used for both private and commercial use
 * provided this copyright is maintained.
 */

// Single application entry point.  This file owns:
//   1. The DEBUG flag + console.log gating (toggled at runtime by the
//      "Enable Debug logging" checkbox in the connection prompt or the
//      ?debug URL parameter).
//   2. The DrawingViewer class declaration (constructor + per-instance
//      state).  All prototype methods are added by the post-bundle files
//      (resizeAndDimensions, toolbarAndMenu, navigationAndQueue, …,
//      connectionSetup) via Object.assign(DrawingViewer.prototype, …).
//   3. The bundle-loading bootstrap for device mode — loads bundles 001-010
//      in order, then calls initializeApp() (defined in connectionSetup.js,
//      loaded inside post-bundle 010).
//
// In standalone (build-bundle.js) builds every source file is inlined into
// pfodWeb.html and `loadDependencies_noDebug` is overridden to a no-op, so
// the bootstrap below short-circuits on `window.pfodweb_standalone`.
//
// Was previously two files (pfodWeb.js + pfodWebDebug.js); merged into one.

// =============================================================================
// 1. DEBUG flag + console gating
// =============================================================================
//
// At page load we read the URL synchronously: if `?debug` is present we
// leave logs on; otherwise we immediately swap console.log/debug/warn/info
// to no-op stubs (matching the previous production behaviour) before any
// other code has a chance to log.  Originals are kept in
// window._pfodOriginalConsole so the connection prompt's checkbox can
// restore them if the user turns logging back on.

// DEBUG flag — default true.  applyDebugLogging() below mutates this in
// lockstep with console state so any consumer that inspects DEBUG sees the
// current logging mode.  Honour any explicit pre-set (e.g. tests).
if (typeof window.DEBUG === 'undefined') {
  window.DEBUG = true;
}

// Snapshot console methods at startup so applyDebugLogging(true) can
// restore them after a previous `false` call replaced them with no-op stubs.
window._pfodOriginalConsole = {
  log:   console.log.bind(console),
  debug: console.debug.bind(console),
  warn:  console.warn.bind(console),
  info:  console.info.bind(console)
};

// applyDebugLogging(enabled)
// Toggle console.log/debug/warn/info between their originals and no-op
// stubs to enable or suppress logging.  Also mirrors the boolean into
// window.DEBUG.
//
// Called from:
//   - pfodCommon.html prefillFormFromURL() at DOMContentLoaded
//   - the Enable Debug logging checkbox change listener
//   - this file's URL-param check below
window.applyDebugLogging = function(enabled) {
  window.DEBUG = !!enabled;
  if (enabled) {
    var orig = window._pfodOriginalConsole;
    console.log   = orig.log;
    console.debug = orig.debug;
    console.warn  = orig.warn;
    console.info  = orig.info;
  } else {
    var noop = function() {};
    console.log   = noop;
    console.debug = noop;
    console.warn  = noop;
    console.info  = noop;
  }
};

// Apply initial state synchronously based on the ?debug URL parameter so
// early-init logs from the bundle scripts are correctly suppressed when
// debug is off.  The connection prompt's Enable Debug logging checkbox can
// override this later in either direction.
try {
  var _pfodInitParams = new URLSearchParams(window.location.search);
  if (_pfodInitParams.has('debug')) {
    console.log('[PFODWEB] DEBUG enabled via ?debug URL parameter');
  } else {
    window.applyDebugLogging(false);
  }
} catch (e) {
  // URLSearchParams unavailable on extremely old browsers — leave logs on.
}

// =============================================================================
// 2. DrawingViewer class
// =============================================================================

// Log version immediately when this file loads.
console.log('[PFODWEB_DEBUG] pfodWeb.js loading - Current Version:', typeof window.JS_VERSION !== 'undefined' ? window.JS_VERSION : 'Unknown');

// ============================================================
// CROSS-FILE CALL MAP  (DrawingViewer prototype methods)
// ============================================================
// File                   Methods defined
// -------------------    ---------------------------------------------------
// pfodWeb.js             constructor  (this file — initialises all state)
// resizeAndDimensions    getDimensionStorageKey, loadPreviousDimensions, saveDimensions,
//                        handleResize, updateCanvasMessage, clearCanvasMessage
// toolbarAndMenu         updateRefreshButtonState, toggleFreezeChart, setupToolbarButtons,
//                        showToolbarMenu, setupContextMenu, showContextMenu
// navigationAndQueue     queueInitialRequest, scheduleNextUpdate, scheduleDataRefresh,
//                        addToRequestQueue, isEmptyCmd, isProcessingQueue, setProcessingQueue,
//                        trySetProcessingQueue, versionedMenuCmd, pushMenuNavCmd,
//                        updateNavigationStack, clearPendingQueue
// chartAndRawData        openChartDirectly, displayRawDataText, exitRawDataDisplay,
//                        startRawDataPolling, stopRawDataPolling, displayChart,
//                        displayChartWithPlotNo, exitChartDisplay,
//                        displayStreamingData, exitStreamingData,
//                        startStreamingPolling, stopStreamingPolling
// drawingProcessing      redrawCanvas, processPendingResponses, processDrawingData,
//                        handleInsertDwg, removeInsertedDrawing, removeTouchZonesByDrawing
// keepAliveAndHttp       initializeMessageViewer, fetchRefresh, queueDrawingUpdate
// responseHandlers       processMenuResponse, handleDwgResponse, handleNonDwgResponse,
//                        handleDrawingError
// keepAlive              startKeepAlivePolling, stopKeepAlivePolling, scheduleNextKeepAlive,
//                        sendKeepAlive
// requestQueue           processRequestQueue
// connectionSetup        extractProtocol, extractTargetIP, extractBaudRate, buildEndpoint,
//                        buildFetchOptions, setupEventListeners, loadDrawing,
//                        getConnectionInfoMessage, showNoConnectionAlert
//                        + globals: loadScript, loadDependencies, drawingViewer, bundlesLoaded,
//                                   continueInitialization, isValidIPAddress, initializeApp
//
// Key inter-file call flows (use these to trace bugs):
//
// Auto-refresh cycle:
//   scheduleNextUpdate (navigationAndQueue) --[timer]--> fetchRefresh (keepAliveAndHttp)
//   --> queueDrawingUpdate (keepAliveAndHttp) --> addToRequestQueue (navigationAndQueue)
//   --> processRequestQueue (requestQueue)
//
// Request sent / response dispatched:
//   processRequestQueue --> connectionManager.send()
//   --> handleDwgResponse (responseHandlers) --> processDrawingData (drawingProcessing)
//       (updates redrawDrawingManager per-drawing raw collections)
//   --> DrawingMerger.mergeAllDrawings (rebuild allXXX[name] views)
//   --> redraw.performRedraw() --> handleResize (resizeAndDimensions)
//
// Menu response path:
//   processRequestQueue --> handleNonDwgResponse (responseHandlers)
//   --> processMenuResponse --> pfodMenuDisplay.show()
//   --> addToRequestQueue [for embedded drawing item]
//
// Touch input path:
//   pfodWebMouse --> addToRequestQueue [type='touch']
//   --> processRequestQueue --> handleDwgResponse
//   [response held in pendingResponseQueue while touchState.isDown=true]
//   --> processPendingResponses (drawingProcessing) on mouse-up
//
// Back navigation:
//   setupToolbarButtons (toolbarAndMenu) --> addToRequestQueue [type='back']
//   --> processRequestQueue --> handleNonDwgResponse / handleDwgResponse
//   --> updateNavigationStack (navigationAndQueue) updates currentRefreshCmd only
//
// Queue state variables to inspect when debugging stuck queues:
//   this.requestQueue      — pending requests array
//   this.sentRequest       — in-flight request (null when idle)
//   this._isProcessingQueue — internal processing flag
//   this.touchState.isDown — blocks refresh and response processing
// ============================================================

// JS_VERSION is available globally via window.JS_VERSION from version.js

class DrawingViewer {
  constructor(options = {}) {
    console.log('[PFODWEB_DEBUG] DrawingViewer constructor called - NEW INSTANCE CREATED');
    console.log('[PFODWEB_DEBUG] URL:', window.location.href);
    console.log('[PFODWEB_DEBUG] Referrer:', document.referrer);
    console.log('[PFODWEB_DEBUG] Constructor options:', options);

    // Store chart-only mode flag from connection settings
    this.chartOnlyMode = options.chartOnly === true;
    if (this.chartOnlyMode) {
      console.log('[PFODWEB_DEBUG] CHART ONLY MODE ENABLED - will skip main menu request');
    }

    // Store CSV-loaded flag - when set, keepAlive polling is skipped (no server connection)
    this.csvLoaded = options.csvLoaded === true;
    if (this.csvLoaded) {
      console.log('[PFODWEB_DEBUG] CSV LOADED MODE - keepAlive polling will be skipped');
    }

    // Store chart command from URL param (e.g. ?chart={=Chart`500|field1`1})
    // Used by openChartDirectly() to restore saved chart configuration
    this.chartCommand = options.chartCommand;

    // Parse URL parameters for other uses
    const urlParams = new URLSearchParams(window.location.search);

    // Check if we have a pre-connected ConnectionManager from connectWithPrompt
    if (window.pfodConnectionManager) {
      console.log('[PFODWEB_DEBUG] Using pre-connected ConnectionManager from connectWithPrompt');
      // Use the existing ConnectionManager directly - it already has all protocol info and connection details
      this.connectionManager = window.pfodConnectionManager;
      this.protocol = this.connectionManager.protocol;
      this.targetIP = this.connectionManager.config.targetIP;
      this.baudRate = this.connectionManager.config?.baudRate || 115200;
      console.log('[PFODWEB_DEBUG] Set protocol from ConnectionManager:', this.protocol);
      // Keep the global for error messages - will be cleared on page reload
    } else {
      // Honour an explicit protocol passed by the caller (the URL-
      // autoConnect path in connectionSetup.js does this for the
      // Designer adapter, where there is no URL param to extract).
      // Otherwise fall back to URL-param extraction (HTTP via targetIP).
      this.protocol = options.protocol ? options.protocol : this.extractProtocol();
      this.targetIP = this.extractTargetIP();
      this.baudRate = this.extractBaudRate();
      console.log('[PFODWEB_DEBUG] Protocol:', this.protocol);
      console.log('[PFODWEB_DEBUG] Target IP:', this.targetIP);
      console.log('[PFODWEB_DEBUG] Baud Rate:', this.baudRate);

      // Initialize ConnectionManager with selected protocol
      const cmConfig = {
        protocol: this.protocol,
        targetIP: this.targetIP,
        baudRate: this.baudRate
      };

      // Set timeout to 10 seconds for HTTP connections via targetIP URL parameter
      // (This only applies when connection is via URL, not when user configures via connection prompt)
      if (this.protocol === 'http' && this.targetIP) {
        cmConfig.responseTimeoutSec = 10;
        console.log('[PFODWEB_DEBUG] HTTP connection via ?targetIP URL parameter - setting timeout to 10 seconds');
      }

      this.connectionManager = new ConnectionManager(cmConfig);
    }
    console.log('[PFODWEB_DEBUG] ConnectionManager initialized with protocol:', this.protocol);

    // DOM Elements
    this.canvasContainer = document.getElementById('canvas-container');

    // Application State - each viewer has its own isolated state
    this.updateTimer = null;
    this.itemRefreshTimes = new Map(); // item key ('menu' or dwgName) → timestamp of last response received
    this.isUpdating = false; // Start with updates disabled until first load completes
    this.js_ver = window.JS_VERSION; // Client JavaScript version

    // KeepAlive polling — TCP/IP Socket only.  Interval is set from the
    // user's connection-prompt dropdown by startKeepAlivePolling().  0
    // here is just an inert default — nothing is armed until the start
    // function configures it from getKeepAliveSec().
    this.keepAliveTimer = null;
    this.keepAliveActive = false;
    this.keepAliveInterval = 0;

    // HTTP auto data-refresh: 1 second after last send, queue a pfodWeb?cmd= request
    this.dataRefreshTimer = null;
    this.dataRefreshActive = false; // Set synchronously before first await in processRequestQueue

    // Request queue system - isolated per viewer
    this.requestQueue = [];
    // Use simple boolean for queue processing state (single-threaded JavaScript environment)
    this._isProcessingQueue = false;
    console.log(`[SENTREQUEST] CLEARED: on creation`);
    // Diagnostic — wrap sentRequest in a getter/setter so EVERY write is
    // traced with a short stack.  Used to find a freeze where sentRequest
    // appears mutated outside the single known writer (requestQueue.js
    // processRequestQueue line ~158).  Each request also gets a monotonic
    // `_id` at addToRequestQueue time so identical-looking requests can be
    // distinguished in the trace.
    // Diagnostic — wrap _nextRequestId in a getter/setter so EVERY write is
    // traced.  Only known writer is ++this._nextRequestId at
    // navigationAndQueue.js addToRequestQueue.  Any other writer (state
    // restore, Object.assign, cache hydration) is the bug we're hunting.
    {
      let _nri = 0;
      Object.defineProperty(this, '_nextRequestId', {
        get() { return _nri; },
        set(v) {
          const stack = (new Error()).stack.split('\n').slice(2, 7).map(l => l.trim()).join(' | ');
          console.warn(`[NRI_TRACE] ${_nri} -> ${v} :: ${stack}`);
          _nri = v;
        },
        configurable: true,
      });
    }
    {
      let _sr = null;
      const fmt = (r) => r ? `${r.cmd}(${r.requestType})#${r._id}` : 'null';
      Object.defineProperty(this, 'sentRequest', {
        get() { return _sr; },
        set(v) {
          const stack = (new Error()).stack.split('\n').slice(2, 7).map(l => l.trim()).join(' | ');
          console.warn(`[SR_TRACE] ${fmt(_sr)} -> ${fmt(v)} :: ${stack}`);
          _sr = v;
        },
        configurable: true,
      });
    }
    this.currentRetryCount = 0;
    // MAX_RETRIES will be set based on connection manager's protocol
    // It's accessed dynamically via this.connectionManager.getMaxRetries()

    // Request tracking for touch vs insertDwg - isolated per viewer
    this.requestTracker = {
      touchRequests: new Set(), // Track touch-triggered requests
      insertDwgRequests: new Set() // Track insertDwg-triggered requests
    };

    // Transformation state for push/pop operations - used during JSON processing
    this.transformStack = []; // Stack to store transformation states

    // Map to store all active touchZones by command - now managed by DrawingManager
    // this.touchZonesByCmd = {}; // Format: {cmd: touchZone} - DEPRECATED

    // Window dimension tracking for change detection and saving
    this.lastWindowWidth = null;
    this.lastWindowHeight = null;

    // Load previous window dimensions from storage to pass to redraw
    const initialDimensions = this.loadPreviousDimensions();

    // Initialize our tracking with loaded dimensions
    if (initialDimensions) {
      this.lastWindowWidth = initialDimensions.windowWidth;
      this.lastWindowHeight = initialDimensions.windowHeight;
    }

    // Touch state for handling mouse/touch events - instance-specific
    this.touchState = {
      isDown: false,
      wasDown: false,
      startX: 0,
      startY: 0,
      lastX: 0,
      lastY: 0,
      startTime: 0,
      longPressTimer: null,
      targetTouchZone: null,
      hasEnteredZones: new Set(),
      hasDragged: false,
      lastSentTouchType: null
    };

    // Current identifier for touchZone requests - defaults to 'pfodWeb'
    this.currentIdentifier = 'pfodWeb';

    // Command stack for back navigation - stores previous commands that opened displays
    this.commandStack = []; // Stack of commands that opened new displays
    this.currentRefreshCmd = null; // Command to resend when reload button is clicked
    this.currentRefreshCmdType = null; // Type of the current refresh command (main, mainMenu, etc)

    // Menu navigation stack — tracks only commands that returned a full {, menu response.
    // Top entry = command to re-send for Refresh; pop top for Back.
    this.menuNavStack = [];
    // Set of commands that have been confirmed as menu commands (have returned a {, response).
    // Used to correctly handle versioned {V2:cmd} requests that return {;} — those are still
    // menu command responses and the cmd belongs in the nav stack. Button cmds that cause a
    // {;} flag update to the current menu are NOT in this set and must never be pushed.
    this.menuCmdSet = new Set();
    this.menuCache = null; // PfodMenuCache instance, initialised in queueInitialRequest
    this.rawDataScrollLocked = false; // Track if raw data scroll is locked
    this.rawDataPollingInterval = null; // Interval handle for raw data polling
    this.initialRequestQueued = false; // Track if initial request has been queued
    this.hasReceivedFirstResponse = false; // Track if we've received the first successful response
    this.jsonErrorAlertShown = false; // Suppress duplicate JSON error alerts across retries

    // Queue for holding responses while mouse is down (to prevent flashing)
    this.pendingResponseQueue = [];

    // Text input dialog state
    this.textInputDialog = null;

    // Transformation state for push/pop operations - used during JSON processing
    this.currentTransform = {
      x: 0,
      y: 0,
      scale: 1.0
    }; // Current transformation (initial state)

    // Create isolated Redraw instance for this viewer
    this.redraw = new window.Redraw(initialDimensions);

    // Create DrawingDataProcessor instance for this viewer
    this.drawingDataProcessor = new window.DrawingDataProcessor(this);

    // Initialize Message Collector and Viewer
    this.initializeMessageViewer();

    // Set up event listeners using pfodWebMouse.js
    this.setupEventListeners();

    // Set initial CSS mode to message display (blue "Requesting..." screen)
    document.body.className = 'message-mode';
    console.log('[DRAWING_VIEWER] Message mode CSS enabled');
  }
}

// =============================================================================
// 3. Bundle-loading bootstrap (device mode only)
// =============================================================================
//
// Loads the JS bundles produced by build_data.bat / build_data.sh in
// dependency order, then calls initializeApp() (defined in connectionSetup.js,
// loaded inside post-bundle 010).
//
// Skipped entirely in standalone (build-bundle.js) builds — those have all
// sources inlined and connectionSetup.js's DOMContentLoaded listener handles
// initialisation directly.

(function () {
  'use strict';

  // NOTE: we cannot early-return on `window.pfodweb_standalone` here.  In the
  // standalone (build-bundle.js) build, every source file is concatenated
  // into one inline <script> and the `window.pfodweb_standalone = true` line
  // is appended AFTER all the source files — so at the moment this IIFE
  // runs the flag is still undefined.  The standalone-mode short-circuit
  // therefore lives inside startBootstrap(), which fires on DOMContentLoaded
  // by which time the trailing override block has executed.

  function _bootstrapLoadScript(src, maxRetries, retryDelay) {
    maxRetries = maxRetries || 3;
    retryDelay = retryDelay || 500;
    return new Promise(function (resolve, reject) {
      var retryCount = 0;
      function attemptLoad() {
        var s = document.createElement('script');
        s.src = src;
        s.onload = resolve;
        s.onerror = function () {
          retryCount++;
          if (retryCount < maxRetries) {
            console.warn('[PFODWEB] Failed to load ' + src +
                         ' (attempt ' + retryCount + '/' + maxRetries +
                         '), retrying in ' + retryDelay + 'ms…');
            setTimeout(attemptLoad, retryDelay);
          } else {
            reject(new Error('Failed to load ' + src + ' after ' +
                             maxRetries + ' attempts'));
          }
        };
        document.head.appendChild(s);
      }
      attemptLoad();
    });
  }

  // PRE bundles 001-008 — load before any prototype-extension files.  These
  // contain version, jsfreechart, chartDisplay, messageViewer, DrawingManager,
  // redraw, drawingMerger, webTranslator, drawingDataProcessor, pfodWebMouse,
  // and the menu/input display classes.  None of them touch
  // DrawingViewer.prototype, so they can safely load AFTER the class is
  // declared (above in this file).
  //
  // POST bundles 009-010 — Object.assign(DrawingViewer.prototype, …) files
  // (resizeAndDimensions, toolbarAndMenu, navigationAndQueue, chartAndRawData,
  // drawingProcessing, keepAliveAndHttp, responseHandlers, keepAlive,
  // requestQueue, connectionSetup).  Must load AFTER the class is declared.
  var BUNDLES = [
    './pfodweb-001-base.js',
    './pfodweb-002-charts.js',
    './pfodweb-003-render.js',
    './pfodweb-004-menu.js',
    './pfodweb-005-proto.js'
  ];

  // Guard against double bootstrap.
  if (window.__pfodWebBundlesBootstrapped) return;
  window.__pfodWebBundlesBootstrapped = true;

  function startBootstrap() {
    // Standalone (build-bundle.js) short-circuit.  By the time this runs
    // (DOMContentLoaded) the override block at the end of the inlined
    // <script> has set window.pfodweb_standalone = true.  In that mode every
    // source file is already inlined and connectionSetup.js's own
    // DOMContentLoaded listener handles initialisation — there is nothing
    // to load (any external bundle URL would 404 from disk anyway).
    if (window.pfodweb_standalone) {
      console.log('[PFODWEB] Standalone build detected — skipping bundle bootstrap');
      return;
    }
    (async function () {
      console.log('[PFODWEB] Bootstrap loading ' + BUNDLES.length + ' bundles…');
      for (var i = 0; i < BUNDLES.length; i++) {
        await _bootstrapLoadScript(BUNDLES[i]);
      }
      // initializeApp is defined in connectionSetup.js (post-bundle 010).
      if (typeof initializeApp === 'function') {
        await initializeApp();
      } else {
        console.error('[PFODWEB] initializeApp is not defined after bundle load');
      }
    })().catch(function (err) {
      console.error('[PFODWEB] Bootstrap failed:', err);
    });
  }

  // If the document is still loading, wait for DOMContentLoaded so the
  // canvas-container etc. exist when initializeApp queries the DOM.  If
  // we're past 'loading' start immediately.
  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', startBootstrap);
  } else {
    startBootstrap();
  }
})();
