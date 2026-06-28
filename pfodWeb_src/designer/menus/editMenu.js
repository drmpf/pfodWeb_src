/*
 * designer/menus/editMenu.js
 *
 * Top screen for the currently-active design — the screen the user
 * lands on after Start new Menu / Edit existing Menu.  Shows:
 *
 *   Target              — current serial port + baud (and "Click here
 *                         to Set Target first" hint for a new menu)
 *   Preview Menu        — render the design in pfodApp-preview mode
 *   Edit Menu           — open the menu-items editor
 *   Edit prompt         — edit the menu prompt
 *   Add Menu Item       — append a new item
 *   Refresh Interval    — slider (no-units) selecting auto-refresh
 *   Generate Code       — emit the Arduino source for this design
 *   Move Items Up/Down  — disabled when fewer than 2 items
 *   Change Menu Name    — rename the design
 *   Save Design to File — download the design as JSON (JS-port-only)
 *   Help                — static help screen
 *   Delete Items        — disabled when no items
 *
 * This file ONLY renders the screen — every item's cmd-byte handler
 * lives in (or will live in) its own menus/*.js file.  Per the
 * feedback-designer-menus-no-cache rule the screen carries no version
 * tag and no trailing `~`; pfodWeb re-fetches on every request.
 *
 * Origin: pfodDesignerV2/DesignerMsgProcessor.java editMenu()
 *         (line ~2585 in the Java).
 *
 * (c)2026 Forward Computing and Control Pty. Ltd.
 */

// ── File-level constants ────────────────────────────────────────────

// pfod cmd bytes for each editMenu item.  Match the Java field names
// in pfodDesignerV2/DesignerMsgProcessor.java so future ports stay
// trivially cross-referenced.
const EM_EDIT_CONNECTION_CMD          = 'z';  // Connection picker (was Java's "Target")
const EM_DISPLAY_CURRENT_MENU_CMD     = 'g';  // Preview Menu
const EM_EDIT_MENU_ITEMS_CMD          = 'J';  // Edit Menu
const EM_EDIT_PROMPT_CMD              = 'n';  // Edit prompt
const EM_ADD_NEW_MENU_ITEM_CMD        = 'k';  // Add Menu Item
const EM_REFRESH_SETTING_CMD          = 'M';  // Refresh Interval slider
const EM_GENERATE_CODE_CMD            = 'l';  // Generate Code
const EM_SELECT_TO_MOVE_CMD           = 'u';  // Move Items Up/Down
const EM_EDIT_MENU_NAME_CMD           = 'j';  // Change Menu Name
const EM_SAVE_TO_FILE_CMD             = 'S';  // Save Design to File
const EM_EDIT_MENU_HELP_CMD           = 'w';  // Help (top-level)
const EM_DELETE_MENU_ITEMS_CMD        = 't';  // Delete Items

// Highlight colour for the design name in the header (matches Java's
// Open_Menu_Name_Color / Close_Menu_Name_Color — light-blue text).
const EM_NAME_COLOUR_OPEN  = '<l>';
const EM_NAME_COLOUR_CLOSE = '</l>';

// Highlight colour for the "Click here to Set Target first" hint
// (Java emits "<y>" — yellow).
const EM_HINT_COLOUR = '<y>';

// ── Helpers ─────────────────────────────────────────────────────────

/// True iff the menu currently being edited (state.getActiveMenu())
/// has no items.  Drives the disabled state of "Move Items Up/Down"
/// and "Delete Items".  Items aren't implemented yet so this is
/// always true; the check is in place for when they land.
function _isMenuEmpty(state) {
  return state.getActiveMenu().items.length === 0;
}

/// True iff the active menu has fewer than two items — Move Up/Down
/// needs at least two.
function _hasFewerThanTwoItems(state) {
  return state.getActiveMenu().items.length < 2;
}

// ── Handler ─────────────────────────────────────────────────────────

const DesignerEditMenu = (() => {

  /// Render the editMenu screen for the active design.  Caller passes
  /// the current state; this function is invoked by other handlers
  /// (newMenu, selectFromMenuList) — it is NOT registered against any
  /// dispatch byte itself.
  ///
  /// @param {DesignerState} state
  /// @returns {string} pfod editMenu screen (full form, every call)
  function send(state) {
    // Clear the pending-new-item flag so the next addMenuItem creates a fresh item.
    state._pendingNewItemIdx = null;
    const connectionSummary = DesignerEditConnection.summaryForEditMenu(state);
    const isInSubmenu = state.activeMenuPath.length > 0;
    console.error('[Designer] editMenu.send: path=' + JSON.stringify(state.activeMenuPath) +
                  ' idx=' + state.activeItemIdx + ' isInSubmenu=' + isInSubmenu);

    let out = '{,' + DESIGNER_PROMPT_FMT + '~' + designerTargetHeader(state);
    if (isInSubmenu) {
      out += 'Editing Sub-menu from\n<b>';
      out += EM_NAME_COLOUR_OPEN + state.name + EM_NAME_COLOUR_CLOSE;
      out += '</b>';
    } else {
      out += 'Editing\n<b>';
      out += EM_NAME_COLOUR_OPEN + state.name + EM_NAME_COLOUR_CLOSE;
      out += '</b><-2>\n';
      out += '<i><y>Preview Menu</i> previews the menu.\n';
      out += '<i><y>Edit Menu</i> edits the menu items.\n';
      out += '<i><y>Edit prompt</i> edits the menu\'s prompt.\n';
      out += '<i><y>Add menu item</i> adds another menu item.';
    }

    // ── Connection row ────────────────────────────────────────────
    // Only shown for the root menu — the connection applies to the
    // whole design, not to individual sub-menus.  The connection/baud
    // picker is not meaningful for the Minimal C Code target (no real
    // transport negotiation — supportedBauds is empty), so this renders
    // as a pfod Label there instead — a distinct item TYPE from Button,
    // not "a button with disabled styling".  '|!<cmd>...' is how a
    // Label is denoted on the wire (pfodMenuParser.js: a leading '!'
    // sets itemType = 'label' outright); it never sends a cmd, full
    // stop, regardless of background colour.  Keeps the same blue
    // background the live Button used — DESIGNER_DISABLED_FMT's dark
    // navy is for an actual Button that's temporarily unusable (e.g.
    // Move/Delete with too few items), which doesn't apply here.
    if (!isInSubmenu) {
      if (state.board.family === 'ccode') {
        out += '|!' + EM_EDIT_CONNECTION_CMD + '<bg bl>';
        out += '~<-1>Target C Code\nvia Serial';
      } else {
        out += '|' + EM_EDIT_CONNECTION_CMD + DESIGNER_MENU_FMT + '<bg bl>';
        out += '~<-1>Connection <b>' + connectionSummary + '</b>';
        out += '\n<-2>' + EM_HINT_COLOUR + '<i>Click here to change.';
      }
    }

    // ── Action rows ───────────────────────────────────────────────
    out += '|' + EM_DISPLAY_CURRENT_MENU_CMD + DESIGNER_MENU_FMT;
    out += '~Preview Menu\n<-4><i>Use bottom back arrow to return.';

    out += '|' + EM_EDIT_MENU_ITEMS_CMD + DESIGNER_MENU_FMT + '~Edit Menu';

    out += '|' + EM_EDIT_PROMPT_CMD + DESIGNER_MENU_FMT + '~Edit prompt';

    out += '|' + EM_ADD_NEW_MENU_ITEM_CMD + DESIGNER_MENU_FMT + '~Add Menu Item';

    // Refresh Interval — pfod toggle item with 6 fixed options
    // (None / 1s / 5s / 30s / 5min / 15min) from RefreshIntervalEnum.
    // Format: `<currIdx>~<leading>~<trailing>~<opt0\opt1\...>.
    // pfodWeb's parser recognises this as a toggle button (1 int
    // field + 3 text fields, options separated by '\'); clicking
    // cycles through, releasing emits `{M`<newIdx>}`.  The 'M'
    // handler (designer/menus/refreshInterval.js) stores ms on the
    // active menu and returns a minimal `{;|M`<idx>}` update.
    // Matches Java DesignerMsgProcessor.java line 2658-2662.
    const refreshIdx = designerRefreshIdx(state.getActiveMenu().refresh_ms);
    out += '|' + EM_REFRESH_SETTING_CMD + DESIGNER_MENU_FMT;
    out += '`' + refreshIdx;
    out += '~<-2>Refresh Interval ~~' + DESIGNER_REFRESH_OPTIONS_STR;

    if (!isInSubmenu) out += '|' + EM_GENERATE_CODE_CMD + DESIGNER_MENU_FMT + '~<b><y>Generate Code';

    // Move Items Up/Down — disabled when fewer than two items.
    const moveFmt = _hasFewerThanTwoItems(state) ? DESIGNER_DISABLED_FMT
                                                 : DESIGNER_MENU_FMT;
    out += '|' + EM_SELECT_TO_MOVE_CMD + moveFmt + '~Move Items Up/Down';

    if (!isInSubmenu) out += '|' + EM_EDIT_MENU_NAME_CMD + DESIGNER_MENU_FMT + '~Change Menu Name';

    out += '|' + EM_SAVE_TO_FILE_CMD + DESIGNER_MENU_FMT + '~Save Design to File';

    out += '|' + EM_EDIT_MENU_HELP_CMD + DESIGNER_MENU_FMT + '~Help';

    // Delete Items — disabled when no items.
    const deleteFmt = _isMenuEmpty(state) ? DESIGNER_DISABLED_FMT
                                          : DESIGNER_MENU_FMT;
    out += '|' + EM_DELETE_MENU_ITEMS_CMD + deleteFmt + '~Delete Items';

    out += '}';
    return out;
  }

  return Object.freeze({ send });
})();

// editMenu is rendered as the response to other commands (newMenu,
// selectFromMenuList).  It has no top-level cmd byte of its own, so
// no DesignerDispatch.add() here.
