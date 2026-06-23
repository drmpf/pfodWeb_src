/*
 * designer/menus/mainMenu.js
 *
 * Designer top-level main menu.  Responds to `{.}` with the screen
 * pfodDesignerV2 shows on startup: Edit existing Menu / Start new Menu
 * / Delete empty Menu / Help.  Edit and Delete are disabled when no
 * saved menus exist.  Load Design from File has moved to the Edit
 * existing Menu list (selectFromMenuList.js).
 *
 * No version tag — the menu's content changes whenever the active
 * design name changes or another design is saved/deleted, so the
 * pfodWeb cache must not be allowed to satisfy refreshes from a stale
 * copy.  Every `{.}` re-renders the full form.  See
 * feedback-designer-menus-no-cache for the general rule.
 *
 * Per-item handlers ('a', 'b', 'N') live in separate files
 * in this directory and register themselves into DesignerDispatch.
 * After mutating state they call DesignerMainMenu.send('{.}', state, 1)
 * to re-render the main menu so the user lands on the refreshed screen.
 *
 * Origin: pfodDesignerV2/DesignerMsgProcessor.java getMainMenu()
 *         (line ~1080 in the Java).
 *
 * (c)2026 Forward Computing and Control Pty. Ltd.
 */

// ── File-level constants ────────────────────────────────────────────

// pfod cmd bytes for each main-menu item.
const NEW_MENU_CMD                = 'a';
const SELECT_FROM_MENU_LIST_CMD   = 'b';
const MAIN_MENU_HELP_CMD          = 'e';
const DELETE_EMPTY_MENU_LIST_CMD  = 'N';

// ── Handler ─────────────────────────────────────────────────────────

const DesignerMainMenu = (() => {

  /// Handle '.' — the top-level refresh / main-menu request.
  ///
  /// state.board and state.name are guaranteed present by the
  /// DesignerVirtualDevice constructor.  Other handlers call this with
  /// rawCmd='{.}' after mutating state to re-render with the new
  /// design name / saved-count.
  ///
  /// @param {string}        rawCmd
  /// @param {DesignerState} state
  /// @param {number}        depth
  /// @returns {string} pfod main-menu (full form, every call)
  function send(rawCmd, state, depth) {
    // No active design while on the main menu — clear in-memory state
    // on every entry.  Any design the user was just editing has already
    // been auto-saved by the dispatch wrapper; clearing the name here
    // only severs the in-memory pointer.  DesignerState.save() skips
    // when name is empty, so the dispatch wrapper's auto-save that
    // fires after this handler returns is a no-op (which is what we
    // want — the main menu doesn't persist anything).
    state.name           = '';
    state.activeMenuPath = [];
    state.activeItemIdx  = null;

    // Count of saved menus — drives enable/disable of Delete Menu only.
    // Edit existing Menu stays always enabled because the user can load
    // a design from file on that screen even with no designs saved yet.
    const savedCount = DesignerState.listNames().length;
    const deleteFmt = (savedCount === 0) ? DESIGNER_DISABLED_FMT
                                         : DESIGNER_ENABLED_FMT;

    // Header — shared Target block (designerTargetHeader) + title +
    // intro paragraph.  The Target lines tell the user what board the
    // generated code will target; designerTargetHeader keeps the
    // formatting consistent with editMenu and selectFromMenuList.
    // NO trailing `~`, NO version tag — prompt ends at the first `|`.
    let out = '{,' + DESIGNER_PROMPT_FMT + '~' + designerTargetHeader(state);
    out += '<+4><b>pfod Designer V3</+4>\n';
    out += '<-1>This app lets you interactively design and view pfodApp menus.';
    out += ' The <i><y>Generate Code</i> button then generates the required Arduino code';
    out += ' to display these menus on your mobile, via pfodApp.\n\n';
    out += 'No Android or Arduino coding required.\n';
    out += '<-2>Use the bottom back arrow to navigate back through the screens.';

    out += '|' + SELECT_FROM_MENU_LIST_CMD + DESIGNER_MENU_FMT + '~Edit existing Menu';
    out += designerSpacing(0);
    out += '|' + NEW_MENU_CMD + DESIGNER_MENU_FMT + '~Start new Menu';
    out += designerSpacing(1);
    out += '|' + DELETE_EMPTY_MENU_LIST_CMD + deleteFmt + '~Delete Menu';
    out += designerSpacing(3);
    out += '|' + MAIN_MENU_HELP_CMD + DESIGNER_MENU_FMT + '~Help';
    out += '}';
    return out;
  }

  return Object.freeze({ send });
})();

// Self-register into the top-level designer dispatcher.  Per-item cmd
// bytes ('a', 'b', 'N', 'e', 'L', 'F') register in their own files.
DesignerDispatch.add('.', DesignerMainMenu.send);
