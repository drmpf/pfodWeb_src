/*
 * dwgDesigner/dwgControlsPanel.js
 *
 * Handler for the 'f' (DWG_CONTROLS_PANEL_CMD) item on the designer's
 * main menu: "Create/Edit Dwg".  Unlike every other main-menu item,
 * this button does not open a pfod menu screen at all — it switches
 * pfodWeb into a full-bleed custom UI mode (the Dwg Controls Panel),
 * the same way the toolbar's own "Chart" button switches into
 * chart-mode, entirely in client-side JS with no pfod protocol
 * involved in the switch itself (see responseHandlers.js's
 * onItemClick callback, which calls window.designerDwgPanel.show()
 * directly when this cmd is clicked).
 *
 * This dispatch handler's only job is to keep the normal pfodWeb
 * request/response plumbing happy: it returns PFOD_EMPTY so the
 * `{f}` request that still goes out on click resolves harmlessly,
 * without pushing onto menuNavStack and without triggering a save
 * (see saveToFile.js's header comment for why PFOD_EMPTY has both
 * of those effects).
 *
 * Lives under dwgDesigner/ rather than designer/menus/ — this is the
 * first file of what will become the dedicated home for all
 * dwg-designer code (Create Dwg, Add Item screens, etc.), kept
 * separate from the menu-tree designer's own handlers.
 * DesignerDispatch is a directory-agnostic shared singleton, so
 * nothing about registering into it requires living under
 * designer/menus/.
 *
 * (c)2026 Forward Computing and Control Pty. Ltd.
 */

const DesignerDwgControlsPanel = (() => {

  /// Dispatch handler.  Always returns the harmless empty ack — this
  /// button has no menu content of its own; the actual screen switch
  /// is done client-side in responseHandlers.js's onItemClick.
  ///
  /// @param {string}        rawCmd
  /// @param {DesignerState} state
  /// @param {number}        depth
  /// @returns {{pfod: string, skipSave: boolean}}
  function send(rawCmd, state, depth) {
    return { pfod: PFOD_EMPTY, skipSave: true };
  }

  return Object.freeze({ send });
})();

// Self-register into the top-level designer dispatcher.
DesignerDispatch.add('f', DesignerDwgControlsPanel.send);
