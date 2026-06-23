/*
 * pfodMenuCache.js
 * (c)2025 Forward Computing and Control Pty. Ltd.
 * NSW Australia, www.forward.com.au
 * This code is not warranted to be fit for any purpose. You may only use it at your own risk.
 * This generated code may be freely used for both private and commercial use
 * provided this copyright is maintained.
 */

// Exports:    window.pfodStripMenuCmdVersion(cmd) function, window.PfodMenuCache class
// Depends on: localStorage (browser built-in)
// Called by:  navigationAndQueue.js (versionedMenuCmd uses getMenuVersion),
//             responseHandlers.js (processMenuResponse uses storeMenu, getMenuCmdArray),
//             connectionSetup.js (initializeApp creates instance via new PfodMenuCache)

// pfod Menu Cache — persists menu responses in localStorage keyed by connection + bare menu cmd.
// Each menu cmd that has returned a {, response is stored with its version string and raw
// cmd array. On reconnect the cached version is used to send versioned requests, and cached
// menus are shown immediately when the device confirms the version is still valid.

/**
 * Strip version prefix from a pfod menu cmd string.
 * e.g. '{V2:A}' → '{A}',  '{V1:.}' → '{.}',  '{.}' → '{.}' (unchanged)
 *
 * @param {string} cmd - Full braced cmd, possibly versioned
 * @returns {string} Unversioned braced cmd
 */
function pfodStripMenuCmdVersion(cmd) {
    const colonIdx = cmd.indexOf(':');
    if (colonIdx > 1) {
        // Has version prefix — reconstruct as '{bareCmd}'
        return '{' + cmd.slice(colonIdx + 1);
    }
    return cmd;
}

/**
 * Manages localStorage caching of pfod menu responses for a specific connection.
 *
 * Storage schema (one entry per connection):
 *   Key:   'pfodMenuCache_<connectionId>'
 *   Value: JSON { menuCmds, menus }
 *     menuCmds - string[] of bare cmd keys known to produce menus, e.g. ['.', 'A']
 *     menus    - object mapping bareCmd → { version, cmd }
 *                  version: version string from the {, header (e.g. 'V1'), or ''
 *                  cmd:     pfodToJson cmd array snapshot for re-parsing on reconnect
 */
class PfodMenuCache {
    /**
     * @param {string} connectionId - Stable identifier for this connection endpoint
     */
    constructor(connectionId) {
        this.connectionId = connectionId;
        this.storageKey = 'pfodMenuCache_' + connectionId;
        this._cache = null; // loaded lazily on first access
    }

    /**
     * Lazily load the cache from localStorage.
     * If missing or corrupt, initialises an empty cache structure.
     */
    _load() {
        if (this._cache !== null) return;
        try {
            const saved = localStorage.getItem(this.storageKey);
            this._cache = saved ? JSON.parse(saved) : { menuCmds: [], menus: {} };
        } catch (e) {
            console.warn('[MENU_CACHE] Failed to load cache for "' + this.connectionId + '":', e);
            this._cache = { menuCmds: [], menus: {} };
        }
    }

    /**
     * Persist the current in-memory cache to localStorage.
     */
    _save() {
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(this._cache));
        } catch (e) {
            console.warn('[MENU_CACHE] Failed to save cache for "' + this.connectionId + '":', e);
        }
    }

    /**
     * Return the list of bare cmd strings that are known to produce menus on this connection.
     * e.g. ['.', 'A', 'B']
     *
     * @returns {string[]}
     */
    getMenuCmds() {
        this._load();
        return this._cache.menuCmds.slice();
    }

    /**
     * Return the cached version string for a bare menu cmd, or null if not cached.
     *
     * @param {string} bareCmd - e.g. '.', 'A'
     * @returns {string|null}
     */
    getMenuVersion(bareCmd) {
        this._load();
        const entry = this._cache.menus[bareCmd];
        return (entry && entry.version) ? entry.version : null;
    }

    /**
     * Return a copy of the cached pfodToJson cmd array for a bare menu cmd, or null.
     * The returned array can be passed directly to pfodParseMenu().
     *
     * @param {string} bareCmd - e.g. '.', 'A'
     * @returns {string[]|null}
     */
    getMenuCmdArray(bareCmd) {
        this._load();
        const entry = this._cache.menus[bareCmd];
        return entry ? entry.cmd.slice() : null;
    }

    /**
     * Store a full {, menu response for a bare cmd.
     *
     * Versioning is per-menu — the device decides independently for each menu
     * whether to include a version, and an unversioned response for one cmd
     * says nothing about the other cmds.  So a version change here only
     * invalidates THIS menu's prior entry (overwrite), and unversioned
     * responses must not be persisted (callers should use removeMenu instead).
     *
     * @param {string} bareCmd   - bare cmd key, e.g. '.', 'A'
     * @param {string[]} cmdArray - snapshot of the pfodToJson cmd array for this response
     * @param {string} version   - version string from the {, header (must be truthy;
     *                              callers should call removeMenu for unversioned responses)
     */
    storeMenu(bareCmd, cmdArray, version) {
        this._load();
        if (!version) {
            // Unversioned — refuse to store and evict any prior entry so
            // next cycle re-requests this menu unversioned.  Callers should
            // call removeMenu(bareCmd) directly; this guard is defensive.
            this.removeMenu(bareCmd);
            return;
        }
        if (!this._cache.menuCmds.includes(bareCmd)) {
            this._cache.menuCmds.push(bareCmd);
        }
        this._cache.menus[bareCmd] = { version: version, cmd: cmdArray };
        this._save();
        console.log('[MENU_CACHE] Stored menu for cmd "' + bareCmd + '" version="' + version + '"');
    }

    /**
     * Evict a single menu's cached entry (for an unversioned {,} response, or
     * any other case where the prior cached state is known to be stale).
     * Other cached menus on this connection are untouched.
     *
     * @param {string} bareCmd - e.g. '.', 'A'
     */
    removeMenu(bareCmd) {
        this._load();
        const had = this._cache.menus[bareCmd] !== undefined;
        delete this._cache.menus[bareCmd];
        this._cache.menuCmds = this._cache.menuCmds.filter(c => c !== bareCmd);
        if (had) {
            this._save();
            console.log('[MENU_CACHE] Removed cached menu for cmd "' + bareCmd + '"');
        }
    }

    /**
     * Update the stored parsed menu object for a bare cmd after an in-place {;} update.
     * Keeps the cache in sync with the latest device state so back-navigation shows
     * current values rather than the original {, snapshot.
     * Does nothing if no entry exists for this bareCmd (unversioned menus are not cached).
     *
     * @param {string} bareCmd  - bare cmd key, e.g. '.', 'A'
     * @param {object} menuData - merged parsed menu object (will be deep-copied)
     */
    updateParsedMenu(bareCmd, menuData) {
        this._load();
        const entry = this._cache.menus[bareCmd];
        if (entry) {
            entry.parsed = JSON.parse(JSON.stringify(menuData));
            this._save();
        }
    }

    /**
     * Return the stored parsed menu object for a bare cmd, or null if not available.
     * Prefer this over getMenuCmdArray when available — it reflects the latest {;} state.
     *
     * @param {string} bareCmd - e.g. '.', 'A'
     * @returns {object|null}
     */
    getParsedMenu(bareCmd) {
        this._load();
        const entry = this._cache.menus[bareCmd];
        return (entry && entry.parsed) ? entry.parsed : null;
    }

    /**
     * Clear all cached menus for this connection (e.g. when user presses Clear Cache).
     */
    clearMenus() {
        this._cache = { menuCmds: [], menus: {} };
        this._save();
        console.log('[MENU_CACHE] Cleared all menus for "' + this.connectionId + '"');
    }
}

// Export globally
window.pfodStripMenuCmdVersion = pfodStripMenuCmdVersion;
window.PfodMenuCache = PfodMenuCache;
