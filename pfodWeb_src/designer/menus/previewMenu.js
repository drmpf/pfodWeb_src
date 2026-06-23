/*
 * designer/menus/previewMenu.js
 *
 * Handler for the 'g' (displayCurrentMenuCmd) item on the editMenu
 * screen: renders the user's design AS-IF being served by a real pfod
 * device.  No designer chrome — just the user's prompt text, items,
 * (later) sub-menus, charts, refresh interval, etc.
 *
 * The current design ALWAYS has a prompt (either the default
 * "Prompt Not Set" or whatever the user typed — even blank).  Items
 * and sub-content arrive as those features land in the port; this
 * file becomes the single rendering pipeline that picks the current
 * design apart and emits the pfod menu real devices would emit.
 *
 * No version tag — the design changes whenever the user edits, so
 * preview must always re-fetch fresh.  See feedback-designer-menus-
 * no-cache.  When real-device-style versioning is added later (so
 * pfodWeb can cache the previewed menu like it would a real device's)
 * the version string should be derived from a hash of the design
 * state and bumped on every edit.
 *
 * Back navigation: pfodWeb pushes `{g}` onto menuNavStack when the
 * preview opens.  Pressing back pops `{g}` and re-sends the previous
 * top — `{a}` if the editMenu was reached via Start new Menu, or the
 * appropriate selectFromMenuList cmd if reached via Edit existing.
 * No special handling needed here.
 *
 * Origin: pfodDesignerV2/DesignerMsgProcessor.java displayCurrentMenu()
 *         — the case that emits the user's design as a real pfod menu.
 *
 * (c)2026 Forward Computing and Control Pty. Ltd.
 */

const DesignerPreviewMenu = (() => {

  /// Render the user's design as a real pfod menu response.
  ///
  /// CURRENT (prompt-only): emits `{,~<promptText>}`.  No `<bg ...>` /
  /// `<w>` chrome — leaves the user's eventual format choices to be
  /// inserted here when format-editing handlers land.  No items, no
  /// version, no trailing tilde.
  ///
  /// FUTURE: pick up state.menuList[currentLevel].items, sub-menu
  /// pointers, charts, refresh interval, prompt format, etc., and emit
  /// the corresponding pfod menu / dwg fragments — matching what a
  /// real pfodParser-driven device would serve for the same design.
  ///
  /// Returns `{pfod, skipSave: true}` — preview is read-only.
  ///
  /// @param {string}        rawCmd
  /// @param {DesignerState} state
  /// @param {number}        depth
  /// @returns {{pfod: string, skipSave: boolean}}
  /// Render one item as a pfod menu-item fragment (no leading `|`,
  /// caller adds the separator).  Button → `<cmd><slot>~<inline><text>`,
  /// Label → `!<cmd><slot>~<inline><text>` (the `!` makes pfodWeb
  /// render the item as a disabled label rather than a clickable
  /// button).  Format split across two locations:
  ///   - Item-format slot (designerItemPrefix): bg + flash + sound
  ///   - Inline within text (designerInlineFormat): size + b/i/u +
  ///     fontColour
  /// Reason for the split: pfodMenuDisplay.applyUpdate merges sticky
  /// item-format-slot fields with upgrade-only semantics, so a
  /// toggle-OFF (bold=false) can never clear bold via that slot.
  /// Moving sticky fields inline routes them through the full-
  /// replace item.text path instead — turning a sticky format OFF
  /// just stops emitting its inline tag.
  /// bgColour / fontColour both fall back to the parent menu's
  /// promptFormat when the item hasn't set its own — matches Java's
  /// pattern of passing the parent screen's bgColour through to
  /// V2_DesignerMenuItem.toMsg, and the user rule "default background
  /// is to be picked up from the prompt background until the user
  /// sets otherwise for all items".
  function _renderItem(item, menu, wireCmd) {
    const eff      = _effectiveItemFormats(item.formats, menu.promptFormat);
    const slotFmt  = designerItemPrefix(eff);
    const inlineFmt = designerInlineFormat(eff);
    // On/Off items render as a pfod 2-option toggle:
    //   `|<cmd><slot>`<current>~<leading>~<trailing>~<low>\<high>~<fmtChar>`
    // The intField `<current>` (0 or 1) selects which option label is
    // shown between leading and trailing; tapping cycles to the other
    // and emits `{<cmd>`<newIdx>}`.  The optional 4th text field
    // `<fmtChar>` is pfod's display-mode hint (pfodMenuParser:256):
    // 't'=text only, 's'=slider only, empty/anything else=both.
    // Disabled flag (`!` after cmd) still applies for the User-
    // Input-Disabled toggle.
    if (item.type === 'onoffdisplay') {
      const fmtChar = (item.displayFormat === 'text')   ? 't'
                    : (item.displayFormat === 'slider') ? 's'
                    : '';
      // `!` before cmd = label-with-slider (no dashed border); `!` after
      // cmd = disabled button (dashed border).  Display items use label form.
      return '!' + wireCmd + slotFmt + '`' + item.current +
             '~' + inlineFmt + (item.text || '') +
             '~' + (item.trailingText || '') +
             '~' + (item.lowText || 'Low') + '\\' + (item.highText || 'High') +
             '~' + fmtChar;
    }
    if (item.type === 'onoff') {
      const disabledSlotFlag = item.formats.disabled ? '!' : '';
      const fmtChar = (item.displayFormat === 'text')   ? 't'
                    : (item.displayFormat === 'slider') ? 's'
                    : '';
      return wireCmd + disabledSlotFlag + slotFmt + '`' + item.current +
             '~' + inlineFmt + (item.text || '') +
             '~' + (item.trailingText || '') +
             '~' + (item.lowText || 'Low') + '\\' + (item.highText || 'High') +
             '~' + fmtChar;
    }

    // PWM / Slider items render as a pfod numeric slider:
    //   `|<cmd><slot>`<current>~<leading>~<trailing>`<max>`<min>~<maxScaleStr>~<minScaleStr>[~<fmtChar>]`
    // Interleaved ints/texts match Java's emit at
    // V2_MenuItemEnum.java line 17 byte-for-byte; pfodMenuParser
    // sees 3 int fields + 4 text fields and detects a numeric
    // slider (line 227-245).  Disabled-flag in the slot still
    // honours the User-Input-Disabled toggle.  Display-format
    // char `t`/`s`/'' shares the on/off semantics — `t` is text-
    // only (no slider widget), `s` is slider-only (no text label).
    if (item.type === 'pwm') {
      const disabledSlotFlag = item.formats.disabled ? '!' : '';
      const fmtChar = (item.displayFormat === 'text')   ? 't'
                    : (item.displayFormat === 'slider') ? 's'
                    : '';
      return wireCmd + disabledSlotFlag + slotFmt +
             '`' + item.currentValue +
             '~' + inlineFmt + (item.text || '') +
             '~' + (item.trailingText || '') +
             '`' + item.maxValue + '`' + item.minValue +
             '~' + (item.maxScaleStr || '') +
             '~' + (item.minScaleStr || '') +
             '~' + fmtChar;
    }
    if (item.type === 'datadisplay') {
      const fmtChar = (item.displayFormat === 'text')   ? 't'
                    : (item.displayFormat === 'slider') ? 's'
                    : '';
      return '!' + wireCmd + slotFmt +
             '`' + item.currentValue +
             '~' + inlineFmt + (item.text || '') +
             '~' + (item.trailingText || '') +
             '`' + item.maxValue + '`' + item.minValue +
             '~' + (item.maxScaleStr || '') +
             '~' + (item.minScaleStr || '') +
             '~' + fmtChar;
    }
    // `!` position matters in pfod protocol:
    //   `|!<cmd>…` (before cmd) → parser sets itemType='label'
    //                              (intrinsically non-interactive)
    //   `|<cmd>!…` (after cmd, in the slot) → parser sets
    //                              formats.disabled=true on a button
    // Different parse paths => different applyUpdate merge keys.
    // Use the BEFORE-cmd position for labels and the AFTER-cmd
    // (slot) position for disabled buttons so the update merge
    // sets formats.disabled correctly and the button re-renders
    // greyed out.
    // Chart items render as a plain button in the menu preview.
    // The chart label is shown as the button text.
    if (item.type === 'chart') {
      return wireCmd + slotFmt + '~' + inlineFmt + item.text;
    }
    // Drawing items render as pfod `dwg` type: |+<cmd>~<loadCmd>.
    // The same cmd byte serves as both the menu-item cmd and the loadCmd.
    // pfodWeb will automatically issue a menuItemDwg request for loadCmd,
    // routed to handlePreviewInteract which returns the placeholder drawing.
    if (item.type === 'drawing') {
      const disabledPrefix = item.formats.disabled ? '!+' : '+';
      return disabledPrefix + wireCmd + slotFmt + '~' + wireCmd;
    }
    const labelPrefix    = (item.type === 'label')   ? '!' : '';
    const disabledSlotFlag = (item.type !== 'label' && item.formats.disabled) ? '!' : '';
    return labelPrefix + wireCmd + disabledSlotFlag + slotFmt + '~' + inlineFmt + item.text;
  }

  /// Compose effective item formats: every field comes from
  /// itemFormats, EXCEPT bgColour / fontColour, which fall back to
  /// the parent menu's promptFormat when the item leaves them null
  /// (= "inherit from prompt").  Returned object is freshly built;
  /// caller can pass it to buildPromptScreenFormat without disturbing
  /// the underlying state.
  function _effectiveItemFormats(itemFormats, promptFormat) {
    return {
      fontSize:   itemFormats.fontSize,
      bold:       itemFormats.bold,
      italic:     itemFormats.italic,
      underline:  itemFormats.underline,
      flash:      itemFormats.flash,
      sound:      itemFormats.sound,
      fontColour: itemFormats.fontColour !== null ? itemFormats.fontColour : promptFormat.fontColour,
      bgColour:   itemFormats.bgColour   !== null ? itemFormats.bgColour   : promptFormat.bgColour,
    };
  }

  /// Count of DFS pre-order items before the first item of the menu at
  /// targetPath.  Root items → 0.  Each submenu item itself counts +1
  /// before we recurse into its children; so the offset for a nested
  /// menu equals "number of items visited in DFS before descending into it".
  /// @param {object} rootMenu  state.rootMenu
  /// @param {number[]} targetPath  e.g. [] for root, [1] for root.items[1].subMenu
  /// @returns {number}
  function _previewOffset(rootMenu, targetPath) {
    if (targetPath.length === 0) return 0;
    let count = 0;
    function walk(menu, path) {
      for (let i = 0; i < menu.items.length; i++) {
        count++;
        if (menu.items[i].type === 'submenu' && menu.items[i].subMenu) {
          const child = [...path, i];
          if (child.length === targetPath.length && child.every((v, k) => v === targetPath[k]))
            return true;
          if (walk(menu.items[i].subMenu, child)) return true;
        }
      }
      return false;
    }
    walk(rootMenu, []);
    return count;
  }

  /// Find the item with global DFS pre-order index n in rootMenu.
  /// Returns {item, menu, menuPath, itemIdx} or null if out of range.
  /// @param {object} rootMenu
  /// @param {number} n  0-based global index
  function _findPreviewItem(rootMenu, n) {
    let count = 0;
    function walk(menu, menuPath) {
      for (let i = 0; i < menu.items.length; i++) {
        if (count === n) return { item: menu.items[i], menu, menuPath, itemIdx: i };
        count++;
        if (menu.items[i].type === 'submenu' && menu.items[i].subMenu) {
          const r = walk(menu.items[i].subMenu, [...menuPath, i]);
          if (r) return r;
        }
      }
      return null;
    }
    return walk(rootMenu, []);
  }

  /// Total DFS item count in item.subMenu's entire subtree (not counting
  /// the item itself).  Used to advance the global DFS index past a
  /// sub-menu item's descendants when assigning the next sibling's index,
  /// so that sibling buttons after a sub-menu get the correct c<N>.
  function _subtreeSize(item) {
    if (item.type !== 'submenu' || !item.subMenu) return 0;
    let n = 0;
    function walk(menu) {
      for (const it of menu.items) {
        n++;
        if (it.type === 'submenu' && it.subMenu) walk(it.subMenu);
      }
    }
    walk(item.subMenu);
    return n;
  }

  /// Placeholder drawing returned when a Drawing menu item is loaded in
  /// preview.  50×25 pfod units, white background (color 15), pushzero
  /// at the centre (25, 12.5), centred instructional text, then popzero.
  function _renderPlaceholderDrawing() {
    return '{+15`50`25' +
           '|z~25~12.5' +
           '|t~~<-3>Replace this text in the generated code\n' +
           'with an <b>insertDwg</b>\n to insert your control.\nThe pfodDwgControls library has\n' +
           ' a selection of controls and examples' +
           '|z' +
           '}';
  }

  /// Render the menu at menuPath using globally-sequential c<N> cmd
  /// indices (DFS pre-order across the entire rootMenu tree).
  /// Each item advances the index by 1 + its full subtree size so that
  /// siblings after a sub-menu button account for all of that sub-menu's
  /// descendants — matching the order _findPreviewItem expects.
  /// @param {object}   rootMenu
  /// @param {object}   menu      the menu object to render
  /// @param {number[]} menuPath  path from root to this menu
  /// @returns {string} full pfod menu response string
  function _renderPreviewMenu(rootMenu, menu, menuPath) {
    const prefix = DesignerEditPrompt.buildPromptScreenFormat(menu.promptFormat);
    let out = '{,' + prefix + '~' + menu.promptText;
    let idx = _previewOffset(rootMenu, menuPath);
    for (let i = 0; i < menu.items.length; i++) {
      out += '|' + _renderItem(menu.items[i], menu, 'c' + idx);
      idx += 1 + _subtreeSize(menu.items[i]);
    }
    out += '}';
    return out;
  }

  /// Send the preview screen for the currently-active edit menu context.
  /// "Preview Menu" from inside a sub-menu editor shows that sub-menu;
  /// back-nav re-sends {g} and re-derives the same screen (idempotent).
  function send(rawCmd, state, depth) {
    const menu = state.getActiveMenu();
    return { pfod: _renderPreviewMenu(state.rootMenu, menu, state.activeMenuPath.slice()), skipSave: true };
  }

  /// Handle interactive clicks on preview items ({c<N>} and {c<N>`<val>}).
  /// Uses global DFS index N so navigation works at unlimited depth:
  ///   - Sub-menu tap ({c<N>}, no value): navigate into sub-menu screen.
  ///   - On/Off / PWM update ({c<N>`<val>}): update stored value, return {;} update.
  ///   - Button / Label tap: return PFOD_EMPTY (no state to update).
  /// Back-nav re-sends the sub-menu's tap cmd — _findPreviewItem locates
  /// it in rootMenu and returns the sub-menu screen again (idempotent).
  function handlePreviewInteract(rawCmd, state, depth) {
    const rest = rawCmd.substring(depth + 1, rawCmd.length - 1);
    const tick = rest.indexOf('`');
    const nStr   = tick >= 0 ? rest.substring(0, tick) : rest;
    const valStr = tick >= 0 ? rest.substring(tick + 1) : null;
    const n = parseInt(nStr, 10);
    if (isNaN(n)) return PFOD_EMPTY;

    const found = _findPreviewItem(state.rootMenu, n);
    if (!found) return PFOD_EMPTY;
    const { item, menu, menuPath, itemIdx } = found;

    if (valStr === null) {
      if (item.type === 'submenu' && item.subMenu)
        return _renderPreviewMenu(state.rootMenu, item.subMenu, [...menuPath, itemIdx]);
      // Chart tap: show the dummy-data chart preview exactly as the Chart
      // Preview button does in the chart editor.
      if (item.type === 'chart')
        return { pfod: DesignerEditChart.renderPreviewForItem(item), skipSave: true };
      // Drawing item load (menuItemDwg request): return the placeholder drawing.
      if (item.type === 'drawing')
        return { pfod: _renderPlaceholderDrawing(), skipSave: true };
      return PFOD_EMPTY;
    }
    const val = parseInt(valStr, 10);
    if (isNaN(val)) return PFOD_EMPTY;
    if (item.type === 'onoff')     item.current      = (val === 1) ? 1 : 0;
    else if (item.type === 'pwm')  item.currentValue = val;
    else                           return PFOD_EMPTY;
    return '{;|' + _renderItem(item, menu, 'c' + n) + '}';
  }

  function getPlaceholderDrawing() { return _renderPlaceholderDrawing(); }

  return Object.freeze({ send, handlePreviewInteract, getPlaceholderDrawing });
})();

// Self-register into the top-level designer dispatcher.
DesignerDispatch.add('g', DesignerPreviewMenu.send);
// 'c' handles interactive on/off and PWM clicks from the preview
// (wire cmds are c0, c1, … matching pfodAutoCmd's runtime assignment).
DesignerDispatch.add('c', DesignerPreviewMenu.handlePreviewInteract);
