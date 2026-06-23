/*
 * designer/dispatch.js
 *
 * Hierarchical pfod-command routing built from per-menu dispatchers.
 *
 * A pfod designer cmd is addressed by a path of single bytes after the
 * opening `{`.  Examples taken from pfodDesignerV2/DesignerMsgProcessor:
 *   {.}      → top-level main menu refresh
 *   {a}      → top-level "New Menu" (newMenuCmd)
 *   {d}      → top-level "Edit Menu Item" (editMenuItemCmd)
 *   {y}      → top-level "Edit Plot Params" parent dispatcher
 *   {y0}     → within Plot Params, "Edit Plot Data Range"  (editPlotDataRangeCmd)
 *   {y1}     → within Plot Params, "Edit Plot Max Text"    (editPlotMaxTextCmd)
 *   {l}      → top-level "Generate Code" parent dispatcher
 *   {lz}     → within Generate Code, "Get Serial"          (generateCodeGetSerialCmd)
 *   {lA}     → within Generate Code, "Get Baud Rate"       (generateCodeGetBaudRateCmd)
 *
 * Each menu owns ITS OWN Dispatcher instance: it `add()`s either
 *   - a terminal function (handles the cmd at this depth and returns
 *     the pfod response), OR
 *   - another Dispatcher (passes routing to the next level).
 *
 * This keeps each menu file self-contained — no big flat switch in this
 * file, no global trie listing every path.  Adding a new menu means
 * creating a new dispatcher in menus/<file>.js and `add()`ing it into
 * its parent.  Removing a menu means deleting that file.
 *
 * The top-level dispatcher lives here (`DesignerDispatch`); each
 * per-segment file under designer/menus/*, designer/plots/*,
 * designer/drawings/* self-registers into it (or into one of its
 * sub-dispatchers) at load time.
 *
 * Return shape from dispatch():
 *   - PFOD_NO_REPLY ('')  malformed rawCmd — start `{` and end `}` are
 *                         required.  An error is logged.  '' looks the
 *                         same to pfodWeb as a real-device timeout.
 *   - PFOD_EMPTY  ('{}')  walked to a cmd terminator / arg marker, or
 *                         to a byte with no registered route.  Valid
 *                         pfod "empty response" — pfodWeb renders nothing.
 *   - string              the handler's pfod response (e.g. "{,…}").
 *   - { pfod, skipSave }  handler's wrapped response (handler opts out
 *                         of the auto-save).
 *
 * Auto-save: index.js (DesignerVirtualDevice.processCmd) is the wrapper
 * that calls state.save() AFTER a successful dispatch — this file's
 * Dispatcher stays pure routing so it can be reasoned about / unit-
 * tested without touching localStorage.  Handlers that explicitly want
 * to skip the save can return  { pfod: '...', skipSave: true }  instead
 * of a bare string; the wrapper honours that flag.
 *
 * Origin: pfodDesignerV2/DesignerMsgProcessor.java `processMessage`
 *         switch + the nested switches inside each case branch — each
 *         level's switch becomes its own Dispatcher in the JS port.
 *
 * (c)2026 Forward Computing and Control Pty. Ltd.
 */

// ── File-level constants ────────────────────────────────────────────

// First byte index of the cmd path inside a raw "{...}" cmd string —
// 0 is the opening '{', 1 is the first cmd byte.  Top-level callers
// (DesignerVirtualDevice) pass this as the initial depth.
const DISPATCH_ROOT_DEPTH = 1;

// Empty pfod reply — returned from a dispatch that walked into a byte
// with no registered route or reached the closing '}' / arg markers.
// This IS a valid pfod message (means "device responded with no menu").
const PFOD_EMPTY = '{}';

// Returned when rawCmd is malformed.  Empty string surfaces to pfodWeb
// as "no response received", same as a real-device timeout — distinct
// from PFOD_EMPTY which would mean "device deliberately replied empty".
const PFOD_NO_REPLY = '';

// ── pfod cmd-format parsing ─────────────────────────────────────────

/// Parse the optional `<version>:` prefix from a pfod cmd.
///
/// pfod versioned-refresh format:  `{<version>:<cmd>}`.  A `:` only
/// counts as the version delimiter if it appears BEFORE any of the
/// cmd terminators / arg markers (` ~ }).  When a `:` is present the
/// version PREFIX is always stripped (cmdStart advances past it) —
/// even if the version text is empty or whitespace.  Whether the
/// stripped version is "really" a version is a separate question
/// answered by isVersionRefresh().
///
/// Examples:
///   "{.}"      → { version: null,  cmdStart: 1 }    no version
///   "{V2:.}"   → { version: "V2",  cmdStart: 4 }    version "V2"
///   "{abc:d}"  → { version: "abc", cmdStart: 5 }    version "abc"
///   "{V`5}"    → { version: null,  cmdStart: 1 }    no `:` before `\``
///   "{:.}"     → { version: "",    cmdStart: 2 }    empty (isVersionRefresh=false)
///   "{   :.}"  → { version: "   ", cmdStart: 5 }    whitespace (isVersionRefresh=false)
///
/// @param {string} rawCmd — already verified to start `{` and end `}`
/// @returns {{version: string|null, cmdStart: number}}
function parseVersion(rawCmd) {
  for (let i = 1; i < rawCmd.length; i++) {
    const ch = rawCmd[i];
    if (ch === ':') return { version: rawCmd.substring(1, i), cmdStart: i + 1 };
    if (ch === '`' || ch === '~' || ch === '}') return { version: null, cmdStart: 1 };
  }
  return { version: null, cmdStart: 1 };
}

/// Decide whether a parsed pfod version constitutes a real cached-
/// refresh.  Empty / whitespace-only version strings are treated as
/// "no version" (refresh=false); a real version matches when it
/// equals the menu's own version string.
///
/// @param {string|null} parsedVersion — from parseVersion().version
/// @param {string}      menuVersion   — caller's current version, e.g.
///                                       MAIN_MENU_VERSION = 'Designer.0'
/// @returns {boolean}
function isVersionRefresh(parsedVersion, menuVersion) {
  if (parsedVersion === null) return false;
  if (parsedVersion.trim() === '') return false;
  return parsedVersion === menuVersion;
}

// ── Dispatcher class ────────────────────────────────────────────────

class Dispatcher {
  /// @param {string} name — debug label, REQUIRED (e.g. 'designer-top',
  ///                        'Plot Params').  Used in error / debug
  ///                        logging; pick something human-readable.
  constructor(name) {
    if (typeof name !== 'string' || name.length === 0) {
      throw new Error('[Dispatcher] constructor requires a non-empty name');
    }
    this.name   = name;
    this.routes = new Map();  // Map<string byte, function | Dispatcher>
  }

  /// Register a route for a single cmd byte at THIS dispatcher's level.
  /// `target` is either a handler function (terminal — handles the cmd
  /// at this depth and returns pfod) or another Dispatcher (delegates
  /// to the next byte).  Re-adding the same byte replaces the previous
  /// target.
  /// @param {string}              cmdByte — single character
  /// @param {Function|Dispatcher} target  — terminal handler or sub-dispatcher
  add(cmdByte, target) {
    if (typeof cmdByte !== 'string' || cmdByte.length !== 1) {
      throw new Error('[' + this.name + '] add(): cmdByte must be a single char, got: ' + cmdByte);
    }
    if (typeof target !== 'function' && !(target instanceof Dispatcher)) {
      throw new Error('[' + this.name + '] add(): target must be function or Dispatcher for byte ' + cmdByte);
    }
    this.routes.set(cmdByte, target);
  }

  /// Dispatch one cmd, consuming the byte at position `depth`.  When
  /// the target at that byte is a sub-Dispatcher, recurse with depth+1;
  /// when it's a function, call it with the FULL rawCmd plus the
  /// current depth so the handler can read any trailing args itself.
  ///
  /// All three args are REQUIRED.  The top-level caller (index.js)
  /// passes DISPATCH_ROOT_DEPTH; the recursive case passes depth+1.
  /// No implicit default — keeps the call-site explicit about what's
  /// being consumed.
  ///
  /// @param {string}        rawCmd — full pfod cmd, e.g. "{y0`5}"
  /// @param {DesignerState} state  — current designer state
  /// @param {number}        depth  — index of next byte to consume
  /// @returns {string|{pfod,skipSave}} see file header for shape
  dispatch(rawCmd, state, depth) {
    // Malformed-input gate (well-formed pfod must start `{` AND end `}`).
    // Logs an error and returns PFOD_NO_REPLY so the wrapper passes ''
    // back to pfodWeb (looks like a timeout) instead of a fake "empty
    // menu" reply.
    if (typeof rawCmd !== 'string'
        || rawCmd[0] !== '{'
        || rawCmd[rawCmd.length - 1] !== '}') {
      console.error('[' + this.name + '] invalid pfod cmd (must be "{...}"):',
                    JSON.stringify(rawCmd));
      return PFOD_NO_REPLY;
    }
    if (rawCmd.length <= depth) return PFOD_EMPTY;

    const ch = rawCmd[depth];
    // Stop on cmd terminators / arg markers — args belong to the
    // handler at the current level, not to deeper routing.
    if (ch === '}' || ch === '`' || ch === '|') return PFOD_EMPTY;

    const target = this.routes.get(ch);
    if (!target) {
      if (state.debug) {
        console.log('[' + this.name + '] no route for byte', JSON.stringify(ch),
                    'at depth', depth, 'cmd:', rawCmd);
      }
      return PFOD_EMPTY;
    }
    if (target instanceof Dispatcher) {
      return target.dispatch(rawCmd, state, depth + 1);
    }
    return target(rawCmd, state, depth);
  }
}

// Top-level designer dispatcher.  Each menu file (menus/<name>.js,
// plots/<name>.js, drawings/<name>.js) adds itself or its handlers
// into this instance at load time.  index.js owns the wrapping that
// auto-saves state after a dispatch returns.
const DesignerDispatch = new Dispatcher('designer-top');
