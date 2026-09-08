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
// Non-clickable status label under the file buttons — see _renderScreen.
const EM_STATUS_CMD                   = 'I';
// The pfod wire limit connectionManager.processReadBuffer enforces, less a
// little headroom. statusUpdate carries free text of no fixed length, so it
// is the one designer message that can run past it.
const EM_STATUS_MAX_BYTES             = 1000;
// Delete Items ('t') is NOT a plain constant here — its cmd must be
// path-prefixed per activeMenuPath so it's a distinct string per menu
// level (see deleteMenuItems.js's own _openCmd/openCmd doc comment for
// why: without this, pfodWeb's nav-stack circular-reference collapse
// would conflate "Delete Items at the root" with "Delete Items inside
// a sub-menu" as the same screen and discard real navigation history).

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
    // whole design, not to individual sub-menus.
    // Text: "board name - connection type" (e.g. "Arduino Uno - Serial").
    // Single-transport boards render as a pfod Label ('|!<cmd>') so the
    // row is informational only — '|!<cmd>...' sets itemType = 'label'
    // in pfodMenuParser.js; it never sends a cmd.  Multi-transport boards
    // render as a Button with "Click here to change" underneath.
    if (!isInSubmenu) {
      const supported = DesignerEditConnection.supportedConnections(state.board);
      // Always use the actual selected connection's short label as the base.
      // Serial always shows its fixed baud rate alongside the label.
      const baseLabel = (DesignerEditConnection.connectionLabels[state.connection] || state.connection) +
        (state.connection === 'serial' ? ('@' + state.baud) : '');
      // For single-transport boards, preserve any extra \n-delimited markup from
      // familyConnectionTypes (e.g. ccode/unlistedBoard add "\n<i>Use for non-Arduino boards").
      // Multi-transport boards just show the selected transport label.
      const fct = state.board.familyConnectionTypes || '';
      const extraIdx = fct.indexOf('\n');
      const connLabel = supported.length <= 1
        ? baseLabel + (extraIdx >= 0 ? fct.slice(extraIdx) : '')
        : baseLabel;
      const itemText  = state.board.name + ' - ' + connLabel;
      if (supported.length <= 1) {
        out += '|!' + EM_EDIT_CONNECTION_CMD + '<bg bl>';
        out += '~<-1>' + itemText;
      } else {
        out += '|' + EM_EDIT_CONNECTION_CMD + DESIGNER_MENU_FMT + '<bg bl>';
        out += '~<-1>' + itemText;
        out += '\n<-2>' + EM_HINT_COLOUR + '<i>Click here to change connection type.';
      }
    }

    // ── Action rows ───────────────────────────────────────────────
    // "Menu" -> "Sub-menu" in every action label while editing a
    // sub-menu, so it's unambiguous which level these actions apply to
    // (matches the prompt's own "Editing Sub-menu from" wording above).
    const menuWord = isInSubmenu ? 'Sub-menu' : 'Menu';

    // g/J/n/u/w below are each level-suffixed (designerLevelSuffix,
    // formats.js) — their responses are full {,...} menus reachable
    // identically from every nesting level, so the cmd string itself
    // must be distinct per level or pfodWeb's nav-stack circular-
    // reference collapse would conflate two different screens that
    // merely share a cmd byte (see deleteMenuItems.js's own 't' fix
    // for the first instance of this bug).
    out += '|' + EM_DISPLAY_CURRENT_MENU_CMD + designerLevelSuffix(state) + DESIGNER_MENU_FMT;
    out += '~Preview ' + menuWord + '\n<-4><i>Use bottom back arrow to return.';

    out += '|' + EM_EDIT_MENU_ITEMS_CMD + designerLevelSuffix(state) + DESIGNER_MENU_FMT + '~Edit ' + menuWord;

    out += '|' + EM_EDIT_PROMPT_CMD + designerLevelSuffix(state) + DESIGNER_MENU_FMT + '~Edit prompt';

    out += '|' + EM_ADD_NEW_MENU_ITEM_CMD + DESIGNER_MENU_FMT + '~Add ' + menuWord + ' Item';

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
    out += '|' + EM_SELECT_TO_MOVE_CMD + designerLevelSuffix(state) + moveFmt + '~Move Items Up/Down';

    if (!isInSubmenu) out += '|' + EM_EDIT_MENU_NAME_CMD + DESIGNER_MENU_FMT + '~Change Menu Name';

    out += '|' + EM_SAVE_TO_FILE_CMD + DESIGNER_MENU_FMT + '~Save Design to File';

    // Where Generate Code and Save Design report what happened — declared
    // hidden here, revealed by a {;} from whichever one ran. It sits under
    // the two buttons that write it.
    //
    // Both used to raise a native alert(), which is modal at the OS level:
    // browser automation cannot dismiss one, so the two buttons a stage-2
    // run exists to press could stop the session dead over a WARNING, after
    // the file had already been written. A {;} update is not pushed onto
    // menuNavStack either, so answering with one keeps their "fire and stay
    // here" contract intact (see saveToFile.js's own header).
    out += '|!' + EM_STATUS_CMD + '-~';

    out += '|' + EM_EDIT_MENU_HELP_CMD + designerLevelSuffix(state) + DESIGNER_MENU_FMT + '~Help';

    // Delete Items — disabled when no items.
    const deleteFmt = _isMenuEmpty(state) ? DESIGNER_DISABLED_FMT
                                          : DESIGNER_MENU_FMT;
    out += '|' + DesignerDeleteMenuItems.openCmd(state) + deleteFmt + '~Delete Items';

    out += '}';
    return out;
  }

  /// Build the {;} that reveals the status label with `text`.
  ///
  /// For Generate Code and Save Design, which produce a file and sometimes
  /// have something to say about it — a drawing they could not include, an
  /// error that stopped them. The screen is already showing, so this
  /// changes the one item in place rather than re-sending it.
  ///
  /// Every run answers with one of these, success included: the label is
  /// the only record that the button did anything (the download itself is
  /// silent), and a stale warning left over from the previous press would
  /// otherwise read as the verdict on this one.
  ///
  /// Colour follows loadFromFile's: green for done, amber for a warning
  /// (the file was still written), red for a failure (it was not).
  ///
  /// Free text is made label-safe first — an unescaped | or ~ would cut the
  /// message short and take the rest of the screen with it — and its line
  /// breaks are normalised, since the label renders \n but not the leading
  /// indent of a wrapped source string.
  ///
  /// The whole message is trimmed to the pfod wire limit. The text is not
  /// bounded by anything else — a warning names every drawing that could
  /// not be included, and a design can reference plenty — and a message
  /// over 1024 bytes is truncated by connectionManager's own reader, which
  /// would close it early and file the rest as excess. Trimming here keeps
  /// the message well-formed and says that it was cut.
  ///
  /// @param {string} text
  /// @param {string} [level] 'ok' (default), 'warn' or 'error'
  /// @returns {string} a {;} update
  function statusUpdate(text, level) {
    const safe   = String(text).replace(/[|~{}]/g, '_').replace(/[ \t]*\n[ \t]*/g, '\n');
    const colour = level === 'error' ? '<r>' : (level === 'warn' ? '<y>' : '<g>');
    const head   = '{;|!' + EM_STATUS_CMD + '~' + colour;
    const enc    = new TextEncoder();
    // Bytes, not characters: a drawing name may be non-ASCII, and it is
    // the byte count the reader is counting.
    const room = EM_STATUS_MAX_BYTES - enc.encode(head + '}').length;
    let body = safe;
    if (enc.encode(body).length > room) {
      // Always re-cut from `safe`, never from the last attempt: cutting the
      // cut string would stack an ellipsis per pass.
      let cut = body.length;
      do {
        cut -= 8;
        body = safe.slice(0, Math.max(0, cut)).replace(/\s+$/, '') + '…';
      } while (cut > 0 && enc.encode(body).length > room);
    }
    return head + body + '}';
  }

  return Object.freeze({ send, statusUpdate });
})();

// editMenu is rendered as the response to other commands (newMenu,
// selectFromMenuList).  It has no top-level cmd byte of its own, so
// no DesignerDispatch.add() here.
