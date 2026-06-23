/*
   caching.js
 * (c)2025 Forward Computing and Control Pty. Ltd.
 * NSW Australia, www.forward.com.au
 * This code is not warranted to be fit for any purpose. You may only use it at your own risk.
 * This generated code may be freely used for both private and commercial use
 * provided this copyright is maintained.
 */

// Response Caching Module — stores versioned pfod responses in localStorage.
//
// Exports:    cacheResponse(data, request, connectionManager) global function
// Depends on: connectionManager (passed as parameter, reads .protocol and .config)
// Called by:  requestQueue.js processRequestQueue (after each successful response)

// Get unique identifier for the current connection endpoint.
//
// Delegates to connectionManager.getConnectionId() so every cache layer
// (cacheResponse here, the per-drawing / per-menuDwg caches in
// DrawingManager, the menuCache in PfodMenuCache, and the per-connection
// scheduler in navigationAndQueue) all key on the same string:
//   'http_<ip>'    e.g. 'http_10.1.1.100'
//   'serial_<port>' e.g. 'serial_COM3'
//   'ble_<name>'   e.g. 'ble_MyDevice'
//
// This is strictly more specific than the previous protocol-only form
// (which returned a bare 'Serial' for any serial port), so two devices
// on different serial ports no longer share cache entries.
function getConnectionIdentifier(connectionManager) {
  if (!connectionManager) {
    throw new Error('[CACHE] getConnectionIdentifier: connectionManager is required');
  }
  if (typeof connectionManager.getConnectionId !== 'function') {
    throw new Error('[CACHE] getConnectionIdentifier: connectionManager.getConnectionId() is not available');
  }
  return connectionManager.getConnectionId();
}

// Determine response type from msgType (cmd[0])
// Returns: 'menuStart', 'menuUpdate', 'dwgStart', 'dwgUpdate', or null
function getResponseType(msgType) {
  if (!msgType || typeof msgType !== 'string') {
    throw new Error(`[CACHE] getResponseType: msgType must be a non-empty string, got ${typeof msgType}`);
  }

  if (msgType.startsWith('{,')) {
    return 'menuStart';
  }
  if (msgType.startsWith('{;')) {
    return 'menuUpdate';
  }
  if (msgType === '{+') {
    return 'dwgUpdate';
  }
  if (msgType.startsWith('{+') && msgType.length > 2) {
    return 'dwgStart';
  }

  return null;
}

// Extract version prefix from request cmd, if present.
// pfod versioned cmd format: {version:commandKey...}
// Returns null when the request has no version prefix.
// Examples:
//   {V1:.}              → "V1"
//   {V361:llcA~...}     → "V361"
//   {.}                 → null
//   {c1}                → null
function getVersionFromRequest(request) {
  if (!request) return null;
  const cmd = request.cmd;
  if (!cmd || typeof cmd !== 'string' || cmd.length < 2) return null;
  // Skip the opening {
  const content = cmd.substring(1);
  const colonIndex = content.indexOf(':');
  if (colonIndex === -1) return null;
  const version = content.substring(0, colonIndex).trim();
  return version || null;
}

// Extract command key from request
// Format: {[version:]commandKey[separator...]}
// Separators: backtick, tilde, space, closing brace
// Examples:
//   {v1:.} → "."
//   {v1:c1`data} → "c1"
//   {v1:c1~data} → "c1"
//   {c1`data} → "c1"
//   {.} → "."
function getCommandKeyFromRequest(request) {
  if (!request) {
    throw new Error('[CACHE] getCommandKeyFromRequest: request is required');
  }

  const cmd = request.cmd;
  if (!cmd || typeof cmd !== 'string') {
    throw new Error(`[CACHE] getCommandKeyFromRequest: request.cmd must be a non-empty string, got ${typeof cmd}`);
  }

  // Skip the opening {
  let content = cmd.substring(1);

  // Check if there's a version prefix (indicated by :)
  const colonIndex = content.indexOf(':');
  if (colonIndex !== -1) {
    // Skip the version part
    content = content.substring(colonIndex + 1);
  }

  // Extract the command key up to the next separator or closing brace
  // Separators are: backtick, tilde, space, closing brace
  const match = content.match(/^([^`~\s}]+)/);
  if (match && match[1]) {
    return match[1];
  }

  console.log('[CACHE] Could not extract command key from request:', cmd);
  return null;
}

// Extract version from msgType string (cmd[0]).
// Returns null when no version is present.
//
// Menu headers ({,...} and {;...}) can mix title text containing tildes, an
// optional `<reRequestMs> field that may appear before OR after the version,
// and an empty version emitted as `~~`.  Tilde-counting heuristics get fooled
// by all three.  Delegate menu cases to parsePfodMenuHeader (the canonical
// header parser used by the menu display) which handles each correctly.
function extractVersionFromResponse(msgType) {
  if (!msgType || typeof msgType !== 'string') {
    return null;
  }

  // Menu headers — use the canonical parser
  if ((msgType.startsWith('{,') || msgType.startsWith('{;'))
      && typeof window.parsePfodMenuHeader === 'function') {
    const header = window.parsePfodMenuHeader(msgType);
    const v = (header.version || '').trim();
    if (v.length === 0) {
      console.log('[CACHE] No version found in menu header');
      return null;
    }
    console.log(`[CACHE] Extracted version: ${v}`);
    return v;
  }

  // Drawing headers ({+...}) — version is the last ~-separated field.
  // Format: {+<col>`<x>`<y>[~m][`<refreshMs>~<version>]
  // Find the LAST '~' and take everything after it as the version token.
  const lastTilde = msgType.lastIndexOf('~');
  if (lastTilde === -1) {
    console.log('[CACHE] No version found (no tildes)');
    return null;
  }
  const tail = msgType.substring(lastTilde + 1).trim();
  // The tail is the version only if it doesn't look like a flag/refreshMs.
  // 'm' on its own is the more-flag, not a version; reject.  Empty -> null.
  if (tail.length === 0 || tail === 'm') {
    console.log('[CACHE] No version found after last tilde');
    return null;
  }
  // Strip an accidental leading '`<digits>' that some emitters place before
  // the version's separating tilde (defensive — not expected in dwg headers).
  const v = tail.replace(/^`\d+/, '').trim();
  if (v.length === 0) {
    console.log('[CACHE] No version found after stripping reRequestMs');
    return null;
  }
  console.log(`[CACHE] Extracted version: ${v}`);
  return v;
}

// Generate cache key for storing response
// Format: pfodWeb_cache_{connection_identifier}_{commandKey}
function getCacheKey(connectionId, commandKey) {
  return `pfodWeb_cache_${connectionId}_${commandKey}`;
}

// Cache response to localStorage
// Only caches if version is present and response is a cacheable type
// Uses the command key from the request (what was sent)
// Extracts msgType from data.cmd[0]
function cacheResponse(data, request, connectionManager) {
  try {
    // Extract msgType from response data
    if (!data || !data.cmd || !Array.isArray(data.cmd) || data.cmd.length === 0) {
      console.log('[CACHE] Not caching - no cmd data in response');
      return;
    }

    const msgType = data.cmd[0];

    // Determine response type (to validate it's cacheable)
    const responseType = getResponseType(msgType);
    if (!responseType) {
      console.log('[CACHE] Not caching - response type not recognized');
      return;
    }

    // Extract version from response.
    //
    // For menuStart ({,...}) and dwgStart ({+x`y...}) the device always
    // includes a version (after the second ~).  For menuUpdate ({;...})
    // and dwgUpdate ({+|...}) the device omits the version because it
    // means "your request version matched — here's just an update".
    // We don't re-cache in that case (the full versioned response is
    // already cached); we just acknowledge that the existing cache
    // entry is still valid at the request's version.
    const version = extractVersionFromResponse(msgType);
    if (!version) {
      if (responseType === 'menuUpdate' || responseType === 'dwgUpdate') {
        const requestVersion = getVersionFromRequest(request);
        if (requestVersion) {
          console.log(`[CACHE] ${responseType} matched request version "${requestVersion}" — existing cache entry is still valid, no re-cache needed`);
          data.version = requestVersion;
          return;
        }
        console.log(`[CACHE] ${responseType} has no version and request had no version prefix — not caching`);
        return;
      }
      // Unversioned menuStart / dwgStart: any prior cache entry is now stale.
      // Evict it so the next request re-fetches fresh, and so /MENU_CACHE eviction
      // remains consistent with this legacy cache layer.
      const commandKey = getCommandKeyFromRequest(request);
      if (commandKey) {
        const connectionId = getConnectionIdentifier(connectionManager);
        const cacheKey = getCacheKey(connectionId, commandKey);
        if (localStorage.getItem(cacheKey) !== null) {
          localStorage.removeItem(cacheKey);
          console.log(`[CACHE] ${responseType} has no version - evicted "${commandKey}" from cache. Key: ${cacheKey}`);
        } else {
          console.log(`[CACHE] Not caching ${responseType} - no version found in response`);
        }
      } else {
        console.log(`[CACHE] Not caching ${responseType} - no version found in response`);
      }
      return;
    }

    // Extract command key from request
    const commandKey = getCommandKeyFromRequest(request);
    if (!commandKey) {
      console.log('[CACHE] Not caching - could not extract command key from request');
      return;
    }

    // Add version to data object
    data.version = version;

    // Get connection identifier
    const connectionId = getConnectionIdentifier(connectionManager);

    // Generate cache key
    const cacheKey = getCacheKey(connectionId, commandKey);

    // Store to localStorage
    localStorage.setItem(cacheKey, JSON.stringify(data));
    console.log(`[CACHE] Cached ${responseType} (cmd key: ${commandKey}) for connection "${connectionId}" with version "${version}". Key: ${cacheKey}`);
  } catch (e) {
    console.error('[CACHE] Error caching response:', e);
    throw e;
  }
}
