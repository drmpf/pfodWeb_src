/*
 * designer/menus/newMenu.js
 *
 * Handler for the 'a' (newMenuCmd) item on the designer's main menu:
 * allocates the next unused "Menu_N" name, switches the active design
 * to it (auto-saved by the dispatcher), then re-emits the main menu
 * so the user lands back on the now-refreshed top-level screen with
 * the new design name visible.
 *
 * Origin: pfodDesignerV2/DesignerMsgProcessor.java case newMenuCmd
 *         around line 2869 — `String newMenuName = NEW_MENU_NAME + "_" + count`.
 *         The JS port uses DesignerState._nextDefaultName() for the
 *         same numbering scheme.
 *
 * (c)2026 Forward Computing and Control Pty. Ltd.
 */

const DesignerNewMenu = (() => {

  /// Create a new design (only if there's no active one) and return
  /// the editMenu screen for it.
  ///
  /// IDEMPOTENT BY DESIGN.  The 'a' cmd is reached from two paths:
  ///   1. Forward — user clicks "Start new Menu" on the main menu.
  ///      mainMenu.send cleared state.name on entry, so name is empty
  ///      and we allocate a fresh "Menu_N", loadNamed switches to it.
  ///   2. Back-nav — pfodWeb's back arrow re-sends the top of
  ///      menuNavStack as a 'back' request when the user pops from a
  ///      child screen (Edit Prompt, Edit Items, …) back to editMenu.
  ///      state.name is still set to the design we were editing; we
  ///      must NOT allocate a new design here.
  ///
  /// The state.name === '' guard distinguishes the two paths.  Without
  /// it, pressing back from Edit Prompt would re-fire newMenu, allocate
  /// Menu_(N+1), and silently swap the user's design out from under them
  /// — making it look like their edits "weren't saved" when in fact the
  /// original design is still persisted; they're just now editing a
  /// fresh one with default fields.
  ///
  /// @param {string}        rawCmd
  /// @param {DesignerState} state
  /// @param {number}        depth
  /// @returns {string} the editMenu screen for the (newly- or already-
  ///                   active) design
  function send(rawCmd, state, depth) {
    if (!state.name) {
      const newName = DesignerState._nextDefaultName();
      state.loadNamed(newName);
    }
    console.error('[Designer] {a} newMenu: resetting activeMenuPath from ' +
                  JSON.stringify(state.activeMenuPath) +
                  ', activeItemIdx=' + state.activeItemIdx +
                  ', _pendingNewItemIdx=' + state._pendingNewItemIdx +
                  ', contextStack depth=' + state.contextStack.length);
    // Always return root editMenu — {a} is the "Start new Menu" top-level
    // cmd and pfodApp re-sends it as back-nav when returning from child
    // screens.  Clear the context stack and stale pending flag since all
    // sub-menu editing context is lost when we return to root.
    // activeItemIdx is intentionally NOT reset here: addMenuItem queues {d}
    // after returning {}, pfodApp re-sends {a} first, and {d} needs the
    // index that addMenuItem set in order to open the new item's editor.
    state.contextStack       = [];
    state._pendingNewItemIdx = null;
    state.activeMenuPath     = [];
    return DesignerEditMenu.send(state);
  }

  return Object.freeze({ send });
})();

// Self-register into the top-level designer dispatcher.
DesignerDispatch.add('a', DesignerNewMenu.send);
