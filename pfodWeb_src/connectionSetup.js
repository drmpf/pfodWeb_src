/*
   connectionSetup.js
 * (c)2025 Forward Computing and Control Pty. Ltd.
 * NSW Australia, www.forward.com.au
 * This code is not warranted to be fit for any purpose. You may only use it at your own risk.
 * This generated code may be freely used for both private and commercial use
 * provided this copyright is maintained.
 */

// Connection-parameter extraction, HTTP endpoint helpers, drawing load,
// and all startup bootstrapping for DrawingViewer.
// Instance methods are assigned to DrawingViewer.prototype after the class is
// defined in pfodWeb.js.
//
// State read:    protocol, targetIP, baudRate, connectionManager, canvas
// State written: (URL params and DOM only; no DrawingViewer instance state written)
// Calls:         toolbarAndMenu:setupToolbarButtons, toolbarAndMenu:setupContextMenu,
//                navigationAndQueue:queueInitialRequest, navigationAndQueue:addToRequestQueue,
//                keepAlive:startKeepAlivePolling, resizeAndDimensions:handleResize
// Called by:     constructor [setupEventListeners], page-load globals (DOMContentLoaded)
// NOTE: Must be last in bundle — window.DrawingViewer is exported here after all
//       Object.assign patches from the other module files have been applied.
// Globals (loadScript, initializeApp, event listeners, etc.) run at module load time.
//
// IMPORTANT: This file must be the LAST entry in both bundle script lists so that
// window.DrawingViewer is exported only after every Object.assign patch is applied.

Object.assign(DrawingViewer.prototype, {

  // Return the connection protocol inferred from URL parameters.
  // Checks for ?serial, ?ble, or ?targetIP; defaults to 'http'.
  extractProtocol() {
    console.log(`[PROTOCOL] Extracting protocol from URL parameters`);
    console.log(`[PROTOCOL] window.location.search: ${window.location.search}`);

    // Infer protocol from parameter presence
    const urlParams = new URLSearchParams(window.location.search);

    // Check for protocol-specific parameters
    if (urlParams.has('serial')) {
      console.log(`[PROTOCOL] Found 'serial' parameter - using Serial protocol`);
      return 'serial';
    } else if (urlParams.has('ble')) {
      console.log(`[PROTOCOL] Found 'ble' parameter - using BLE protocol`);
      return 'ble';
    } else if (urlParams.has('targetIP')) {
      console.log(`[PROTOCOL] Found 'targetIP' parameter - using HTTP protocol`);
      return 'http';
    }

    // Default to HTTP if not specified
    console.log(`[PROTOCOL] No protocol-specific parameters found, defaulting to 'http'`);
    return 'http';
  },

  // Return the target IP/hostname from the ?targetIP URL param.
  // Returns null if no valid address is found.
  extractTargetIP() {
    console.log(`[TARGET_IP] Extracting target IP from URL`);
    console.log(`[TARGET_IP] window.location.search: ${window.location.search}`);

    // Extract from URL parameters (e.g., ?targetIP=192.168.1.100 or ?targetIP=djpetrica.go.ro:49890)
    const urlParams = new URLSearchParams(window.location.search);
    const targetIP = urlParams.get('targetIP');
    console.log(`[TARGET_IP] URL parameter targetIP: ${targetIP}`);

    if (targetIP) {
      // Use shared validation function that supports both IP addresses and domain names
      if (isValidIPAddress(targetIP)) {
        console.log(`[TARGET_IP] Valid target found: ${targetIP}`);
        return targetIP;
      } else {
        console.log(`[TARGET_IP] Invalid IP address or domain format: ${targetIP}`);
      }
    }

    console.log(`[TARGET_IP] No valid target IP found, returning null`);
    return null;
  },

  // Return the baud rate from the ?serial=<baud> or ?baudRate=<baud> URL param.
  // Accepts only known valid rates; defaults to 115200.
  extractBaudRate() {
    console.log(`[BAUD_RATE] Extracting baud rate from URL parameters`);
    console.log(`[BAUD_RATE] window.location.search: ${window.location.search}`);

    // Extract from URL parameters - can be ?serial=115200 or standalone ?baudRate=115200
    const urlParams = new URLSearchParams(window.location.search);

    // First check if serial parameter has a value (e.g., ?serial=115200)
    const serialValue = urlParams.get('serial');
    console.log(`[BAUD_RATE] URL parameter serial: ${serialValue}`);

    if (serialValue && serialValue !== '') {
      // Parse and validate baud rate from serial parameter value
      const parsedBaudRate = parseInt(serialValue, 10);
      const validBaudRates = [9600, 19200, 38400, 57600, 74880, 115200];

      if (validBaudRates.includes(parsedBaudRate)) {
        console.log(`[BAUD_RATE] Valid baud rate found in serial parameter: ${parsedBaudRate}`);
        return parsedBaudRate;
      } else {
        console.log(`[BAUD_RATE] Invalid baud rate in serial parameter: ${serialValue}, defaulting to 115200`);
      }
    }

    // Fallback to baudRate parameter (for backwards compatibility)
    const baudRate = urlParams.get('baudRate');
    console.log(`[BAUD_RATE] URL parameter baudRate: ${baudRate}`);

    if (baudRate) {
      // Parse and validate baud rate
      const parsedBaudRate = parseInt(baudRate, 10);
      const validBaudRates = [9600, 19200, 38400, 57600, 74880, 115200];

      if (validBaudRates.includes(parsedBaudRate)) {
        console.log(`[BAUD_RATE] Valid baud rate found: ${parsedBaudRate}`);
        return parsedBaudRate;
      } else {
        console.log(`[BAUD_RATE] Invalid baud rate: ${baudRate}, defaulting to 9600`);
      }
    }

    // Default to 115200 if not specified or invalid
    console.log(`[BAUD_RATE] No valid baud rate found, defaulting to 115200`);
    return 115200;
  },

  // Build an absolute URL for path using this.targetIP.
  // Falls back to a relative path when targetIP is not set.
  buildEndpoint(path) {
    console.log(`[ENDPOINT] buildEndpoint called with path: ${path}, targetIP: ${this.targetIP}`);
    if (this.targetIP) {
      const fullEndpoint = `http://${this.targetIP}${path}`;
      console.log(`[ENDPOINT] Built full endpoint: ${fullEndpoint}`);
      return fullEndpoint;
    }
    console.log(`[ENDPOINT] No targetIP, returning relative path: ${path}`);
    return path; // Fallback to relative URL
  },

  // Return a fetch options object with CORS/credentials settings appropriate for
  // the current targetIP (cross-origin when set, same-origin otherwise).
  buildFetchOptions(additionalHeaders = {}) {
    return {
      headers: {
        'Accept': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
        ...additionalHeaders
      },
      mode: this.targetIP ? 'cors' : 'same-origin',
      credentials: this.targetIP ? 'omit' : 'same-origin',
      cache: 'no-cache'
    };
  },

  // Wire up canvas mouse/touch listeners (via pfodWebMouse) and toolbar button listeners.
  setupEventListeners() {
    // Mouse and touch event handling is now in pfodWebMouse.js
    if (typeof window.pfodWebMouse !== 'undefined') {
      window.pfodWebMouse.setupEventListeners(this);
    } else {
      console.error('pfodWebMouse.js not loaded - mouse events will not work');
    }

    // Setup toolbar button listeners
    this.setupToolbarButtons();

    // Context menu disabled - raw data now only accessible via toolbar menu
    // this.setupContextMenu();
  },

  // (Removed: loadDrawing() — assumed a single privileged main drawing
  // for the connection.  Initial flow is queueInitialRequest -> mainMenu
  // request -> menu response which queues one menuItemDwg per drawing
  // item via responseHandlers.processMenuResponse.)


  // Build a human-readable connection description (protocol, address, baud rate).
  // Used by showNoConnectionAlert() to display connection details to the user.
  getConnectionInfoMessage() {
    let connectionInfo = '';

    console.log('[CONNECTION_INFO] Protocol:', this.protocol);
    console.log('[CONNECTION_INFO] Adapter:', this.connectionManager?.adapter);

    if (this.protocol === 'http' && this.targetIP) {
      connectionInfo = `HTTP to ${this.targetIP}`;
    } else if (this.protocol === 'serial') {
      const portName = this.connectionManager?.adapter?.portName || 'COM?';
      connectionInfo = `Serial: ${portName} @ ${this.baudRate} baud`;
    } else if (this.protocol === 'ble') {
      // Try multiple ways to get device name
      let deviceName = this.connectionManager?.adapter?.device?.name;
      if (!deviceName) {
        deviceName = this.connectionManager?.adapter?.deviceName;
      }
      if (!deviceName) {
        deviceName = 'Unknown Device';
      }
      connectionInfo = `BLE: ${deviceName}`;
    } else {
      connectionInfo = 'Unknown Connection';
    }

    console.log('[CONNECTION_INFO] Final message:', connectionInfo);
    return connectionInfo;
  },

  // Show a "No Connection" modal overlay after max retry attempts.
  // The Close button reloads the page so the user can reconnect.
  showNoConnectionAlert() {
    console.log('[ALERT] Showing No Connection alert after max retry attempts');

    // Create overlay
    const overlay = document.createElement('div');
    overlay.id = 'no-connection-overlay';
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background-color: rgba(0, 0, 0, 0.5);
      z-index: 999998;
      display: flex;
      justify-content: center;
      align-items: center;
    `;

    // Create alert dialog
    const alertBox = document.createElement('div');
    alertBox.style.cssText = `
      background-color: white;
      padding: 30px 40px;
      border-radius: 10px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
      text-align: center;
      max-width: 500px;
      font-family: Arial, sans-serif;
    `;

    // Create message
    const message = document.createElement('p');
    message.textContent = 'No Connection';
    message.style.cssText = `
      font-size: 24px;
      font-weight: bold;
      margin: 0 0 15px 0;
      color: #d32f2f;
    `;

    // Create connection details
    const details = document.createElement('p');
    const connectionInfo = this.getConnectionInfoMessage();
    details.textContent = `Failed to connect to: ${connectionInfo}`;
    details.style.cssText = `
      font-size: 14px;
      margin: 0 0 20px 0;
      color: #666;
      font-family: monospace;
    `;

    // Create Close button
    const closeButton = document.createElement('button');
    closeButton.textContent = 'Close';
    closeButton.style.cssText = `
      background-color: #2196F3;
      color: white;
      border: none;
      padding: 10px 30px;
      font-size: 16px;
      border-radius: 5px;
      cursor: pointer;
      outline: none;
    `;

    // Make button respond to hover
    closeButton.onmouseover = () => {
      closeButton.style.backgroundColor = '#1976D2';
    };
    closeButton.onmouseout = () => {
      closeButton.style.backgroundColor = '#2196F3';
    };

    // Close button handler - reload page
    const reloadPage = () => {
      console.log('[ALERT] Close button clicked - reloading page');

      // Reloading re-requests this exact origin.  Only check pfodProxy
      // first when it's actually serving this page (_pageServedByProxy())
      // — see _exitToConnectionScreen() in responseHandlers.js for the
      // full rationale (a file://-loaded page reloads regardless of
      // pfodProxy, so there's nothing to check there).
      if (!_pageServedByProxy()) {
        window.location.reload();
        return;
      }
      const port = window.location.port;
      _pingProxy(port).then((available) => {
        if (available) {
          window.location.reload();
        } else {
          pfodAlert(_proxyUnreachableMsg('127.0.0.1:' + port));
        }
      });
    };

    closeButton.onclick = reloadPage;

    // Handle Enter key
    const handleKeyPress = (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        reloadPage();
      }
    };
    document.addEventListener('keydown', handleKeyPress);

    // Focus the button so Enter works immediately
    setTimeout(() => {
      closeButton.focus();
    }, 100);

    // Assemble dialog
    alertBox.appendChild(message);
    alertBox.appendChild(details);
    alertBox.appendChild(closeButton);
    overlay.appendChild(alertBox);
    document.body.appendChild(overlay);
  }

});

// =============================================================================
// Startup bootstrapping — globals, event listeners, app initialisation
// =============================================================================

// Dynamic script loader with retry on failure
function loadScript(src, maxRetries = 3, retryDelay = 500) {
  return new Promise((resolve, reject) => {
    let retryCount = 0;

    function attemptLoad() {
      const script = document.createElement('script');
      script.src = src;
      script.onload = resolve;
      script.onerror = () => {
        retryCount++;
        if (retryCount < maxRetries) {
          console.warn(`[PFODWEB] Failed to load ${src} (attempt ${retryCount}/${maxRetries}), retrying in ${retryDelay}ms...`);
          setTimeout(attemptLoad, retryDelay);
        } else {
          reject(new Error(`Failed to load ${src} after ${maxRetries} attempts`));
        }
      };
      document.head.appendChild(script);
    }

    attemptLoad();
  });
}

// Load all dependencies from bundles
//
// NOTE: This function is dead code in the current architecture — pfodWeb.js's
// startBootstrap() loads the bundles directly via its own BUNDLES array, and
// in standalone mode this function is overridden to a no-op by build-bundle.js.
// The list below is kept in sync with the actual bundle filenames produced by
// build_data.bat / build_data.sh for documentation and future-proofing.
async function loadDependencies() {
  const bundles = [
    './pfodweb-001-base.js',
    './pfodweb-002-charts.js',
    './pfodweb-003-render.js',
    './pfodweb-004-menu.js',
    './pfodweb-005-proto.js'
    // Note: pfodWeb.js is NOT included as a bundle — it's loaded directly by the HTML template.
  ];

  for (const bundle of bundles) {
    await loadScript(bundle);
  }

  // Make JS_VERSION available globally after dependencies are loaded
  if (typeof JS_VERSION !== 'undefined') {
    window.JS_VERSION = JS_VERSION;
    console.log('[PFODWEB_DEBUG] JS_VERSION loaded and made globally available:', JS_VERSION);
  } else {
    console.warn('[PFODWEB_DEBUG] Warning: JS_VERSION not defined after loading dependencies');
  }
}

// Global viewer instance
let drawingViewer = null;

// Track if bundles are already loaded (device mode only - not in standalone)
var bundlesLoaded = false;

// Main startup: load dependencies then initialise the app.
// In standalone mode loadDependencies is a no-op (overridden by build-bundle.js).
window.addEventListener('DOMContentLoaded', async () => {
  console.log('[PFODWEB_DEBUG] DOMContentLoaded event fired');

  console.log('[PFODWEB_DEBUG] URL when DOMContentLoaded:', window.location.href);
  console.log('[PFODWEB_DEBUG] Referrer when DOMContentLoaded:', document.referrer);

  // In standalone mode (window.pfodweb_standalone set by build-bundle.js): always load
  // (loadDependencies is overridden to do nothing, so it's safe to call)
  // In device mode: only load once to prevent flash on refresh
  if (window.pfodweb_standalone || !bundlesLoaded) {
    if (window.pfodweb_standalone) {
      console.log('[PFODWEB_DEBUG] Standalone mode detected, loading dependencies');
    } else {
      console.log('[PFODWEB_DEBUG] Loading bundles for first time');
    }
    await loadDependencies();
    bundlesLoaded = true;
  } else {
    console.log('[PFODWEB_DEBUG] Bundles already loaded, skipping reload on refresh');
  }
  await initializeApp();
});

window.addEventListener('resize', () => {
  console.log('[WINDOW_RESIZE] Resize event fired, drawingViewer exists:', !!drawingViewer, 'className:', document.body.className);
  if (drawingViewer) {
    drawingViewer.handleResize();
  } else {
    console.log('[WINDOW_RESIZE] drawingViewer not ready yet, ignoring resize');
  }
});

// Handle browser refresh button and navigation away.
//
// Deliberately NOT an async function, and disconnect() below isn't
// awaited. Browsers do not wait for an async beforeunload handler's
// returned Promise — they just invoke it and proceed with tearing down
// the page. An `await` yields control back to the event loop at a
// microtask boundary, and the page can finish unloading before that
// microtask resumes, silently skipping anything after the `await`.
// disconnect() fires its actual {!} send as a fire-and-forget
// keepalive:true fetch internally (see HTTPConnection/
// ProxyStreamConnection.sendAbort()) — keepalive is what lets it survive
// the unload; not awaiting it here is what lets it actually get
// *initiated* before the page is gone. (pfodProxy never shuts itself down
// — see spawn_idle_logger() in main.rs, which only logs idleness, never
// acts on it — so this {!} is the only thing that ever resets the
// device's dedup state on tab close; nothing else will.)
window.addEventListener('beforeunload', function(event) {
  // Store the current URL pattern
  localStorage.setItem('lastUrlPattern', window.location.pathname);

  // Clean up connection if it exists. Skipped when _exitToConnectionScreen()
  // (responseHandlers.js) already disconnected explicitly just before this
  // same reload — otherwise the device gets sent {!} a second time for
  // no reason, since this listener fires from that function's own
  // window.location.replace().
  if (drawingViewer && drawingViewer.connectionManager && !window._pfodAlreadyDisconnected) {
    console.log('[CLEANUP] Disconnecting before page unload...');
    drawingViewer.stopKeepAlivePolling();
    drawingViewer.connectionManager.disconnect().catch((error) => {
      console.error('[CLEANUP] Error during disconnect:', error);
    });
  }
});

// Handle returning from browser refresh
window.addEventListener('DOMContentLoaded', function() {
  const lastUrlPattern = localStorage.getItem('lastUrlPattern');
  if (lastUrlPattern && lastUrlPattern.includes('/update')) {
    // If we were on an update URL, register the drawing name so the
    // queue/cache lookups can find it.  Order is not significant —
    // every drawing carries equal weight; appending preserves
    // registration order without privileging position 0.
    const pathSegments = lastUrlPattern.split('/').filter(segment => segment.length > 0);
    if (pathSegments.length > 0) {
      const currentDrawingName = pathSegments[0];
      if (!this.redraw.redrawDrawingManager.drawings.includes(currentDrawingName)) {
        this.redraw.redrawDrawingManager.drawings.push(currentDrawingName);
      }
    }
  }
});

// Continue initialization after connection prompt submit.
// Called from the HTML connection prompt via window.continueInitialization.
function continueInitialization(connectionSettings) {
  console.log('[PFODWEB_DEBUG] continueInitialization() called after connection prompt', connectionSettings);

  // Always clean up any existing drawingViewer when navigating to this page
  // This handles the case where user goes back from this page and then navigates here again
  if (drawingViewer) {
    console.log('[PFODWEB_DEBUG] Cleaning up existing DrawingViewer from previous session');
    // Stop keepAlive polling before changing connection
    drawingViewer.stopKeepAlivePolling();
    if (drawingViewer.connectionManager) {
      drawingViewer.connectionManager.disconnect().catch(err => {
        console.error('[PFODWEB_DEBUG] Error disconnecting previous connection:', err);
      });
    }
    drawingViewer = null;
  }

  // Create the DrawingViewer instance with connection settings (includes chartOnly flag)
  const viewerOptions = connectionSettings || {};
  drawingViewer = new DrawingViewer(viewerOptions);

  // Make drawingViewer globally accessible for pfodWebMouse
  window.drawingViewer = drawingViewer;

  try {
    // Initialize the viewer - queue initial request to get drawing name from server
    drawingViewer.queueInitialRequest();

    // Redraw instance already created with canvas and context - no init needed
    // Data is managed locally in redraw

    // The drawing name will be extracted and drawing loaded via the request queue

    // TCP/IP Socket: arm the keepAlive timer so `{ }` pings fire when
    // the connection is idle (NAT pinhole + device-session keepalive).
    // The function self-gates on protocol and on keepAliveSec=0 so
    // calling it unconditionally for TCP is safe.  Other protocols
    // don't need it.
    if (connectionSettings && connectionSettings.protocol === 'tcp'
        && typeof drawingViewer.startKeepAlivePolling === 'function') {
      drawingViewer.startKeepAlivePolling();
    }
  } catch (error) {
    console.error('Failed to initialize application:', error);
    // Show error to user
    document.body.innerHTML = `<div style="padding: 20px; text-align: center; font-family: Arial;">
            <h2>Error Loading Drawing</h2>
            <p>Failed to get drawing name from server: ${error.message}</p>
        </div>`;
  }
}

// Validate an IPv4 address or domain name, with optional :port suffix.
// Accepts: 192.168.1.100, 192.168.1.100:8080, djpetrica.go.ro, djpetrica.go.ro:49890
function isValidIPAddress(ip) {
  if (!ip || typeof ip !== 'string') return false;

  // Extract host part (remove port if present)
  let hostPart = ip;
  if (ip.includes(':')) {
    const parts = ip.split(':');
    hostPart = parts[0];
    // Validate port if present
    const port = parseInt(parts[1], 10);
    if (isNaN(port) || port <= 0 || port > 65535) {
      return false;
    }
  }

  // Check if it's an IP address (IPv4)
  const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
  if (ipRegex.test(hostPart)) {
    const octetParts = hostPart.split('.');
    return octetParts.every(part => {
      const num = parseInt(part, 10);
      return num >= 0 && num <= 255;
    });
  }

  // Check if it's a valid domain name
  // Domain can contain letters, numbers, hyphens, and dots
  // Must not start or end with hyphen, must have at least one dot
  const domainRegex = /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/;
  return domainRegex.test(hostPart);
}

// Read URL parameters and either proceed directly (valid targetIP / designer mode)
// or show the connection prompt for the user to fill in.
// Guard against double-call: in standalone pfodWeb.html both pfodWeb.js and this file
// register DOMContentLoaded listeners that both call initializeApp().
async function initializeApp() {
  if (window.appInitialized) {
    console.log('[PFODWEB_DEBUG] initializeApp() already called - skipping duplicate call');
    return;
  }
  window.appInitialized = true;
  console.log('[PFODWEB_DEBUG] initializeApp() called');
  console.log('[PFODWEB_DEBUG] Current Version:', typeof window.JS_VERSION !== 'undefined' ? window.JS_VERSION : 'Unknown');
  console.log('[PFODWEB_DEBUG] Current URL:', window.location.href);
  console.log('[PFODWEB_DEBUG] Referrer:', document.referrer);
  console.log('[PFODWEB_DEBUG] Document ready state:', document.readyState);
  console.log('Initializing canvas drawing viewer');

  // Check if connection parameters are provided
  const urlParams = new URLSearchParams(window.location.search);

  // Check for protocol-specific parameters
  const hasTargetIP = urlParams.has('targetIP');
  const hasSerial = urlParams.has('serial');
  const hasBLE = urlParams.has('ble');
  const hasTcpIP = urlParams.has('tcpIP');
  const hasChartParam = urlParams.has('chart');
  const hasAutoConnect = urlParams.has('autoConnect');

  if (hasChartParam) {
    console.log('[PFODWEB_DEBUG] Chart parameter detected - will enable chart-only mode');
  }

  // ?autoConnect together with a valid ?targetIP triggers an immediate HTTP
  // connection (skipping the prompt).  autoConnect is NOT written back to the
  // URL by updateURLFromForm() and is stripped by _exitToConnectionScreen()
  // on page reload, so it acts as a one-shot opt-in for this session only —
  // exiting brings the user back to the prompt with the IP pre-filled.
  if (hasAutoConnect && hasTargetIP) {
    const targetIP = urlParams.get('targetIP');
    if (targetIP && targetIP.trim() !== '' && isValidIPAddress(targetIP)) {
      console.log('[PFODWEB_DEBUG] autoConnect + valid targetIP="' + targetIP + '" - connecting directly');
      document.getElementById('connection-prompt').style.display = 'none';
      const connectionSettings = { protocol: 'http', targetIP: targetIP };
      if (hasChartParam) {
        connectionSettings.chartOnly = true;
        connectionSettings.chartCommand = urlParams.get('chart');
      }
      // ConnectionManager is created inside continueInitialization via the
      // DrawingViewer constructor's URL-fallback path (no
      // window.pfodConnectionManager set here), so pass the settings
      // through; the URL-fallback path applies the 10-second HTTP timeout
      // that the auto-connect flow expects.
      continueInitialization(connectionSettings);
      return;
    }
    console.log('[PFODWEB_DEBUG] autoConnect present but targetIP invalid/empty — falling through to prompt');
  }

  // ?autoConnect for TCP / Serial / BLE — reuses the connect-button flow.
  // The prompt's connectWithPrompt() handler already knows how to build the
  // right connectionSettings for each protocol (with picker fall-throughs
  // for native Web Serial / Web Bluetooth, or proxy modes), so we just call
  // prefillFormFromURL() to populate the form fields from the URL params,
  // then trigger the same code path the user would by clicking Connect.
  //
  // Native Serial / BLE require a user gesture for the OS device picker;
  // a programmatic click does NOT satisfy that, so those will fail and
  // surface the prompt for manual retry.  Proxy Serial / BLE and TCP all
  // work fine because their pickers are custom modals (no gesture
  // requirement) and TCP only needs an SSE to the proxy.
  if (hasAutoConnect && (hasTcpIP || hasSerial || hasBLE)) {
    console.log('[PFODWEB_DEBUG] autoConnect (' +
      (hasTcpIP ? 'tcp' : hasSerial ? 'serial' : 'ble') +
      ') — prefilling form and clicking Connect');
    if (typeof prefillFormFromURL === 'function') {
      try { prefillFormFromURL(); }
      catch (e) { console.warn('[PFODWEB_DEBUG] autoConnect prefill threw:', e); }
    }
    const connectBtn = document.getElementById('connect-button');
    if (connectBtn && !connectBtn.disabled) {
      connectBtn.click();
      return;
    }
    console.log('[PFODWEB_DEBUG] autoConnect — connect button missing or disabled, showing prompt');
  }

  // If targetIP is provided (without autoConnect), ALWAYS show the connection
  // prompt with HTTP pre-selected and the IP / port pre-filled.  This gives
  // the user a chance to clear cache or tick "Chart Only Mode" before
  // connecting.  The prompt's prefillFormFromURL() (DOMContentLoaded) already
  // handles HTTP radio + IP value + chart-only checkbox from URL params; this
  // block just makes the prompt visible and focuses the IP field so an
  // invalid IP can be edited.
  if (hasTargetIP) {
    const targetIP = urlParams.get('targetIP');
    console.log('[PFODWEB_DEBUG] targetIP parameter found ("' + targetIP + '") - showing connection prompt for user confirmation');

    // Pre-select HTTP radio button (in case prefillFormFromURL hasn't run yet)
    document.getElementById('prompt-protocol-http').checked = true;
    if (typeof updatePromptUI === 'function') {
      updatePromptUI();
    }
    // Pre-fill the IP field (covers both valid and invalid values)
    const ipInput = document.getElementById('prompt-ip');
    if (ipInput) {
      ipInput.value = targetIP || '';
      ipInput.focus();
      ipInput.select();
    }
    if (typeof validateConnectButton === 'function') {
      validateConnectButton();
    }
    document.getElementById('connection-prompt').style.display = 'flex';
    return;
  }

  // If serial parameter is in URL, show connection prompt with Serial section pre-selected
  if (hasSerial) {
    console.log('[PFODWEB_DEBUG] Serial parameter found - showing Serial connection prompt');
    // Pre-select Serial radio button
    document.getElementById('prompt-protocol-serial').checked = true;
    // Update UI to show Serial settings
    if (typeof updatePromptUI === 'function') {
      updatePromptUI();
    }
    // If serial has a value, try to pre-fill the baud rate
    const baudRate = urlParams.get('serial');
    if (baudRate && baudRate !== '') {
      const baudSelect = document.getElementById('prompt-baud');
      // Try to set the value - if invalid, it won't match any option
      baudSelect.value = baudRate;
      // If the value didn't match any option, the select will have an empty value
      console.log('[PFODWEB_DEBUG] Set baud rate to:', baudRate, 'Actual value:', baudSelect.value);
    }
    // Fill in the COM port selection (if the bookmarked URL has one) only
    // after the Serial radio above is already selected -- _serialPortState
    // and the "Select COM Port" label are Serial-specific, so this has to
    // follow the protocol selection, not precede it. Just updates the
    // label/state directly -- does NOT call updateURLFromForm(), so it
    // can't clobber a ?chart=<command> already in the URL.
    const comParam = urlParams.get('com');
    if (comParam && typeof _serialPortState !== 'undefined') {
      _serialPortState.path  = comParam;
      _serialPortState.label = comParam;
      if (typeof _updateSerialPortDisplay === 'function') {
        _updateSerialPortDisplay();
      }
    }
    // Validate the connect button state after pre-filling
    if (typeof validateConnectButton === 'function') {
      validateConnectButton();
    }
    document.getElementById('connection-prompt').style.display = 'flex';
    return;
  }

  // If ble parameter is in URL, show connection prompt with BLE section pre-selected
  if (hasBLE) {
    console.log('[PFODWEB_DEBUG] BLE parameter found - showing BLE connection prompt');
    // Pre-select BLE radio button
    document.getElementById('prompt-protocol-ble').checked = true;
    // Update UI to show BLE settings
    if (typeof updatePromptUI === 'function') {
      updatePromptUI();
    }
    // Fill in the BLE device selection (if the bookmarked URL has one) only
    // after the BLE radio above is already selected -- same ordering
    // reason, and same "doesn't touch the URL" property, as the
    // Serial/com restoration above.
    const bleParam = urlParams.get('ble');
    if (bleParam && typeof _bleDeviceState !== 'undefined') {
      _bleDeviceState.address = bleParam;
      _bleDeviceState.name    = urlParams.get('bleName') || null;
      if (typeof _updateBleDeviceDisplay === 'function') {
        _updateBleDeviceDisplay();
      }
    }
    document.getElementById('connection-prompt').style.display = 'flex';
    return;
  }

  // If tcpIP parameter is in URL, show connection prompt with TCP section pre-selected.
  // Mirrors the Serial / BLE / Designer pattern so Exit / reload always returns
  // the user to the picker with every protocol still selectable (they can either
  // click Connect to use the previously-chosen protocol or switch).
  if (hasTcpIP) {
    console.log('[PFODWEB_DEBUG] tcpIP parameter found - showing TCP connection prompt');
    document.getElementById('prompt-protocol-tcp').checked = true;
    if (typeof updatePromptUI === 'function') {
      updatePromptUI();
    }
    // The actual tcpIP / keepAlive values are pre-filled by prefillFormFromURL
    // on DOMContentLoaded — nothing extra to do here.
    if (typeof validateConnectButton === 'function') {
      validateConnectButton();
    }
    document.getElementById('connection-prompt').style.display = 'flex';
    return;
  }

  // If designer parameter is in URL, show connection prompt with Designer
  // pre-selected (NOT auto-connect).  Exit / reload should bring the user
  // back to the full picker so they can confirm or switch protocols; auto-
  // connect would prevent that.  Matches the BLE / Serial / TCP pattern
  // above.
  if (urlParams.has('designer')) {
    console.log('[PFODWEB_DEBUG] Designer parameter found - showing prompt with Designer pre-selected');
    document.getElementById('prompt-protocol-designer').checked = true;
    if (typeof updatePromptUI === 'function') {
      updatePromptUI();
    }
    if (typeof validateConnectButton === 'function') {
      validateConnectButton();
    }
    document.getElementById('connection-prompt').style.display = 'flex';
    return;
  }

  // No parameters - show connection prompt with HTTP pre-selected (default)
  console.log('[PFODWEB_DEBUG] No connection parameters - showing connection prompt');
  // Validate the connect button state (HTTP is selected by default, so button should be enabled)
  if (typeof validateConnectButton === 'function') {
    validateConnectButton();
  }
  document.getElementById('connection-prompt').style.display = 'flex';
  // Focus on IP address field for immediate input
  // Use setTimeout to ensure focus happens after display is set
  setTimeout(() => {
    document.getElementById('prompt-ip').focus();
  }, 0);
}

// Make continueInitialization available globally so connection prompt can call it
window.continueInitialization = continueInitialization;

// Export the fully-patched DrawingViewer class for browser use.
// Must be the last statement so all Object.assign patches from every module
// file have already been applied before this runs.
window.DrawingViewer = DrawingViewer;
