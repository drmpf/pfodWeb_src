/*
 * designer/menus/missingDwgPrompt.js
 *
 * "Missing drawings" block on the "Edit existing Menu" ({b}) screen — the
 * label and buttons for loading any dwg a design references but DwgLibrary
 * does not hold. Revealed by {b0} (pick a design) when anything is missing;
 * an unresolved Drawing item otherwise just shows the "not loaded" preview
 * placeholder (previewMenu.js's own _renderNotLoadedDrawing).
 *
 * Two entry points, both used by selectFromMenuList.js (and loadFromFile.js
 * for its own X button, which sits on the same screen):
 *   renderHiddenItems()  — the hidden '|m…' items to declare on {b}
 *   revealUpdate(state)  — the {;} that reveals them, or null when nothing
 *                          is missing and {b0} should just open the editMenu
 *
 * This used to be a screen of its own, returned INSTEAD of the editMenu, and
 * that is what broke the back button. The client pushes every cmd that
 * answers with a {,} onto menuNavStack and Back RE-SENDS the top. Picking a
 * design pushed the Missing Drawings screen under {b0}, and its exit button
 * then pushed a SECOND entry for the editMenu — which {b0} itself now
 * produced, the dwgs being loaded. Back popped the exit, re-sent {b0}, and
 * landed on the same screen: one dead press, working on the second.
 *
 * As a block updated in place on {b}, the stack holds {b} alone until the
 * exit button opens the editMenu one entry above it. Back from the editMenu
 * pops straight to the list.
 *
 * There is deliberately no Load row per dwg. A {;} can only change items the
 * screen already declared, and when {b} is rendered no design has been
 * picked — so how many rows to declare is unknowable. "Load next dwg",
 * retargeted every press, covers any number instead.
 *
 * Missing list is recomputed FRESH every time (never cached) — same
 * "DwgLibrary can change between renders" rationale as selectDwgForItem.js
 * (see feedback-designer-menus-no-cache): loading one missing dwg can
 * itself reveal further missing dwgs (its own insertDwg children), which
 * only become visible once that parent dwg is actually in DwgLibrary —
 * DwgArduinoExport.collectAllDwgs can't see inside a dwg it hasn't loaded.
 *
 * Command flow (cmd byte 'm'):
 *   {mS}  → Load Several Dwgs — one multi-file pick (one folder; a file
 *           chooser cannot multi-select across folders), matching on each
 *           drawing's own name and saving only what is actually missing.
 *           Answers {;}. See _loadSeveralDwgs.
 *   {mN}  → Load next dwg — a single-file picker aimed at the head of the
 *           remaining list, so one button walks a whole insertDwg chain.
 *           Answers {;}.
 *   {mD}  → All dwgs loaded / Open Editing Menu — the one navigation here,
 *           revealed only once nothing is missing.
 *
 * (c)2026 Forward Computing and Control Pty. Ltd.
 */

const DesignerMissingDwgPrompt = (() => {

  // Every one of these is declared HIDDEN on the {b} screen by
  // renderHiddenItems(), then revealed by a {;} update — an update can only
  // change items the screen already carries, never introduce one.

  // A non-clickable label listing the dwgs still to load.
  const MDP_STATUS_CMD = 'I';

  // "Load Several Dwgs" — one multi-file pick covering as many as one
  // folder can supply, instead of a file picker per dwg.
  const MDP_LOAD_SEVERAL_CMD = 'S';

  // "Load next dwg" — one single-file picker, retargeted at the head of the
  // remaining list every press. There is no Load row per dwg because there
  // cannot be one: when {b} is rendered no design has been picked, so how
  // many rows to declare is unknowable, and loading a parent can reveal
  // insertDwg children that were invisible until it was in the library
  // (LedOnOff brings in LedOn and LedOff). One reusable button walks any
  // chain, however deep.
  const MDP_LOAD_NEXT_CMD = 'N';

  // "All dwgs loaded / Open Editing Menu" — revealed only once nothing is
  // missing, and the one cmd here that answers with a menu.
  const MDP_DONE_CMD = 'D';

  /// Strip pfod delimiter characters so a dwg's own name can never
  /// corrupt the wire message it's embedded in — matches
  /// selectDwgForItem.js's own _sanitize.
  function _sanitize(s) {
    return String(s || '').replace(/[|~`{}]/g, '_');
  }

  /// Every dwg name directly referenced by some Drawing menu item
  /// anywhere in the design (any menu/sub-menu, unlimited depth — same
  /// state.getAllItems() walk selectDwgForItem.js's own _usedDwgNames
  /// uses) that ISN'T currently loaded in DwgLibrary, expanded through
  /// DwgArduinoExport.collectAllDwgs so a missing dwg's own missing
  /// insertDwg children (once IT is loaded) are found too. De-duplicated,
  /// original-encounter order.
  /// @param {DesignerState} state
  /// @returns {string[]}
  function _missingNames(state) {
    const collected = new Set();
    const missing = [];
    for (const item of state.getAllItems()) {
      if (item.type === 'drawing' && item.dwgName) {
        DwgArduinoExport.collectAllDwgs(item.dwgName, collected, missing);
      }
    }
    return Array.from(new Set(missing));
  }

  /// The missing-drawings items, ALL HIDDEN, for selectFromMenuList.js to
  /// declare on its own "Edit existing Menu" ({b}) screen.
  ///
  /// They have to be declared there, up front, because a {;} update can
  /// only change items the screen already carries — it can never introduce
  /// one. And they have to be a FIXED set for the same reason: when {b} is
  /// rendered no design has been picked yet, so which dwgs are missing, and
  /// how many, is not yet knowable. That is why there is no Load row per
  /// dwg. One reusable "Load next dwg", retargeted every press, covers any
  /// number of them; the label names the rest.
  ///
  /// {b0} reveals whichever of these it needs via revealUpdate().
  /// @returns {string} the hidden `|m…` items to append to the {b} screen
  function renderHiddenItems() {
    return '|!m' + MDP_STATUS_CMD + '-~' +   // names still to load
           '|m' + MDP_LOAD_SEVERAL_CMD + '-~' + // Load Several Dwgs
           '|m' + MDP_LOAD_NEXT_CMD + '-~' +    // Load next dwg
           '|m' + MDP_DONE_CMD + '-~';          // All dwgs loaded -> editMenu
  }

  /// The {;} update {b0} answers with when the design it just switched to
  /// is missing dwgs — revealing the block on the {b} screen the user is
  /// already looking at, instead of navigating to a screen of its own.
  ///
  /// Returns null when nothing is missing, so {b0} falls through to opening
  /// the editMenu for real. That fall-through is the ONLY navigation in
  /// this whole flow besides the exit button, which is what keeps the back
  /// button honest: the client pushes every cmd that answers with a {,}
  /// onto menuNavStack and Back RE-SENDS the top, so two cmds answering
  /// with the same screen meant the first Back press went nowhere.
  /// @param {DesignerState} state
  /// @param {string} [extraHides] — '|…-~' hides for the items the HOST
  ///        screen owns. Picking a design turns {b} from a list into the
  ///        loading screen for that design, so its own rows and buttons go:
  ///        picking a second design, or loading another file, midway through
  ///        would answer a question nobody asked. The caller supplies them
  ///        because the caller owns those cmds — this module knows nothing
  ///        about them.
  /// @returns {string|null}
  function revealUpdate(state, extraHides) {
    if (_missingNames(state).length === 0) return null;
    return _updateScreen(state, extraHides);
  }

  /// Build the {;} update every cmd in this flow answers with.
  ///
  /// The block lives on the "Edit existing Menu" ({b}) screen, so nothing
  /// here navigates: it rewrites the label and re-aims the buttons, in
  /// place. That is what keeps the back button honest — the client pushes
  /// every cmd that answers with a {,} onto menuNavStack and Back RE-SENDS
  /// the top, so while this was a screen of its own, {b0} pushed it AND its
  /// exit pushed a second entry for the editMenu, which {b0} itself then
  /// produced. Back popped the exit, re-sent {b0}, and arrived at the same
  /// screen: one dead press.
  ///
  /// Now {b} is the only entry until the exit button opens the editMenu,
  /// which lands exactly one above it.
  /// @param {DesignerState} state
  /// @returns {string}
  function _updateScreen(state, extraHides) {
    const stillMissing = _missingNames(state);
    let out = '{;' + (extraHides || '');
    if (stillMissing.length === 0) {
      // Everything loaded: the working items go, and the one way on
      // appears. That exit is the only {,} in this flow, so it is the only
      // thing that lands on the nav stack — one entry above {b}, which is
      // exactly what Back should pop.
      out += '|!m' + MDP_STATUS_CMD + '-~';
      out += '|m' + MDP_LOAD_SEVERAL_CMD + '-~';
      out += '|m' + MDP_LOAD_NEXT_CMD + '-~';
      out += '|m' + MDP_DONE_CMD + DESIGNER_MENU_FMT +
             '~All dwgs loaded\nOpen Editing Menu';
    } else {
      // The label carries the list and nothing else. A count would not do:
      // loading one dwg can change WHICH dwgs are missing, not just how
      // many — load LedOnOff and its two insertDwg children, LedOn and
      // LedOff, become missing for the first time, invisible until their
      // parent was in the library. "1 loaded, 2 still missing" then reads
      // as no progress at all.
      out += '|!m' + MDP_STATUS_CMD + DESIGNER_MENU_FMT +
             '~<y>Still to load: ' + stillMissing.map(_sanitize).join(', ');
      out += '|m' + MDP_LOAD_SEVERAL_CMD + DESIGNER_MENU_FMT +
             '~Load Several Dwgs\n<-1>from one folder';
      // Retargeted at the head of the list every press, so one button walks
      // the whole chain however deep the insertDwg nesting goes.
      out += '|m' + MDP_LOAD_NEXT_CMD + DESIGNER_MENU_FMT +
             '~Load next dwg\n<r>' + _sanitize(stillMissing[0]) + '</r>';
      out += '|m' + MDP_DONE_CMD + '-~';
    }
    out += '}';
    return out;
  }

  /// Open the OS file picker for the missing[idx] slot, validate + repair
  /// the picked dwg (same pipeline selectDwgForItem.js's own Load Dwg
  /// uses), force its name to match the expected missing name (the
  /// menu's own Drawing item(s) already reference it by that exact
  /// name — whatever name is inside the picked file is irrelevant to
  /// which reference it's filling), save it, then re-render this screen
  /// so any newly-surfaced missing insertDwg children (or remaining
  /// rows) show up. Cancel/error re-renders unchanged (with an alert on
  /// a genuine error) instead of navigating. skipSave:true throughout —
  /// this module never mutates `state` itself, only DwgLibrary (which
  /// persists independently to its own localStorage key — see
  /// dwgLibrary.js's own save()), so there's nothing on `state` for
  /// DesignerVirtualDevice's auto-save to usefully persist here.
  /// @param {DesignerState} state
  /// @param {string} expectedName
  /// @returns {Promise<{pfod: string, skipSave: boolean}>}
  function _loadMissingDwg(state, expectedName) {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type   = 'file';
      input.accept = '.pfodDwg_json';
      input.style.display = 'none';

      const settle = (result) => { input.remove(); resolve(result); };
      // A {;} update, never a {,} screen — see _updateScreen for why the
      // back button depends on it. `status` is optional; '' just clears the
      // status line, which is what a cancel wants.
      const stay   = () => ({ pfod: _updateScreen(state), skipSave: true });

      input.addEventListener('change', () => {
        const file = input.files && input.files[0];
        if (!file) { settle(stay()); return; }
        const reader = new FileReader();
        reader.onload = () => {
          let parsed;
          try {
            parsed = JSON.parse(reader.result);
          } catch (err) {
            pfodAlert('"' + file.name + '" is not valid JSON and was not loaded.', () => {});
            settle(stay());
            return;
          }
          const rejectReason = dwgFileRejectReason(parsed);
          if (rejectReason) {
            pfodAlert('"' + file.name + '" ' + rejectReason + ' and was not loaded.', () => {});
            settle(stay());
            return;
          }
          // isLoad=true — this is a genuine untrusted-file load, so a duplicate
          // idxName is repaired and reported (shown below) rather than thrown.
          // Without it the throw would skip settle() and hang the queue.
          // Matches dwgControlsPanelUI.js's own _loadFileForMissingInsertDwg,
          // which does the same job for an insertDwg reference.
          const { dwg, errors } = validateAndRepairDwg(parsed, file.name, true);
          // The FILE name may be anything — it is not the drawing's identity.
          // The drawing's own `name` is, and it has to be the one that was
          // asked for. This used to overwrite it with expectedName on the
          // theory that picking the file said "this is that drawing", but a
          // mis-picked file then got silently renamed and saved over the
          // reference, and the real drawing of that name was left unreachable.
          if (dwg.name !== expectedName) {
            pfodAlert('"' + file.name + '" contains the drawing "' + dwg.name +
              '", but "' + expectedName + '" was asked for.\n\n' +
              'The file name can be anything, but the drawing name inside it must match. ' +
              'Nothing was loaded.', () => {});
            settle(stay());
            return;
          }
          if (errors && errors.length > 0) {
            pfodAlert('"' + file.name + '" had problems that were auto-fixed:\n' +
              errors.map((e) => e.message).join('\n'), () => {});
          }
          DwgLibrary.save(dwg);
          settle(stay());
        };
        reader.onerror = () => {
          pfodAlert('"' + file.name + '" could not be read.', () => {});
          settle(stay());
        };
        reader.readAsText(file);
      });

      // Cancel detection: picker close restores window focus. 300 ms
      // delay lets the 'change' event (which fires first on a real pick)
      // win the race — matches selectDwgForItem.js's own identical guard.
      const onFocus = () => {
        window.removeEventListener('focus', onFocus);
        setTimeout(() => settle(stay()), 300);
      };
      window.addEventListener('focus', onFocus);

      document.body.appendChild(input);
      input.click();
    });
  }

  /// Read one File as text, resolving to its parsed dwg or to null when it
  /// is unusable. Nothing alerts here: a multi-file pick is expected to
  /// sweep up files that are not dwgs at all, and one modal per stray file
  /// would be worse than the single summary _loadSeveralDwgs shows. Matches
  /// dwgControlsPanelUI.js's own Load Several Dwgs, which skips the same
  /// two cases silently for the same reason.
  /// @param {File} file
  /// @returns {Promise<{dwg: object, errors: Array}|null>}
  function _readOneDwgFile(file) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onerror = () => resolve(null);
      reader.onload = () => {
        let parsed;
        try {
          parsed = JSON.parse(reader.result);
        } catch (err) {
          resolve(null);
          return;
        }
        if (dwgFileRejectReason(parsed)) { resolve(null); return; }
        // isLoad=true for the same reason the single-file path uses it: a
        // genuine untrusted file, so a duplicate idxName is repaired and
        // reported rather than thrown (a throw here would leave the
        // Promise.all below unsettled and hang the queue).
        resolve(validateAndRepairDwg(parsed, file.name, true));
      };
      reader.readAsText(file);
    });
  }

  /// "Load Several Dwgs" — one multi-file pick that fills as many of the
  /// missing rows as the chosen folder can supply, instead of one picker
  /// per row. A file chooser cannot multi-select across folders (an OS
  /// limit, not a choice here), so this is one folder per press; pressing
  /// it again picks up another folder, and the screen re-renders with
  /// whatever is still missing.
  ///
  /// Only dwgs that are actually MISSING are saved. That matters twice
  /// over: a folder sweep would otherwise pull in unrelated drawings, and
  /// — worse — DwgLibrary.save() overwrites by name, so a file whose dwg
  /// shares a name with one already loaded would silently replace it,
  /// including edits made in this session. Skipping anything not asked for
  /// makes that impossible.
  ///
  /// Matching is by the drawing's own `name`, never the file name, exactly
  /// as the per-row path insists — the menu's Drawing items reference a
  /// drawing by name, and a file can be called anything. Unlike the per-row
  /// path a mismatch is not an error here: it just means that file was not
  /// one of the ones being asked for.
  ///
  /// Saving runs in PASSES rather than a single sweep, because loading a
  /// parent dwg can reveal missing insertDwg children of its own that were
  /// invisible while it was unloaded (the same reason _renderScreen
  /// recomputes the list every time). A single pass would skip a child that
  /// the user had already picked, then show it as still-missing on the very
  /// next render — asking again for a file already in hand. Each pass
  /// recomputes the missing set and saves whatever it can, until a pass
  /// changes nothing.
  ///
  /// skipSave:true throughout — like the rest of this module it mutates
  /// only DwgLibrary, never `state`.
  /// @param {DesignerState} state
  /// @returns {Promise<{pfod: string, skipSave: boolean}>}
  function _loadSeveralDwgs(state) {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.pfodDwg_json';
      input.multiple = true;
      input.style.display = 'none';

      const settle = (result) => { input.remove(); resolve(result); };
      // A {;} update, never a {,} screen — see _updateScreen for why the
      // back button depends on it.
      const stay = () => ({ pfod: _updateScreen(state), skipSave: true });

      // Set as soon as a real pick arrives, so the cancel timer below stands
      // down. The single-file path can lean on its 300 ms delay alone
      // because one small file always reads inside it; reading a folder's
      // worth need not, and a timer that fired first would re-render the
      // screen BEFORE the saves landed — showing every drawing as still
      // missing, moments before they all appeared.
      let picking = false;

      input.addEventListener('change', () => {
        const files = input.files ? Array.from(input.files) : [];
        // `accept` filters the dialog, but a user can switch it to "All
        // files", so the name test still runs — same as everywhere else.
        const picked = files.filter((f) => /\.pfodDwg_json$/i.test(f.name));
        if (picked.length === 0) { settle(stay()); return; }
        picking = true;

        Promise.all(picked.map(_readOneDwgFile)).then((results) => {
          // Last file wins on a duplicate name within one pick — arbitrary,
          // but the alternative (refusing the whole pick) is worse, and two
          // files claiming the same drawing is already a mistake upstream.
          const byName = new Map();
          let unreadable = 0;
          results.forEach((r) => {
            if (!r) { unreadable++; return; }
            byName.set(r.dwg.name, r);
          });

          const savedNames = [];
          const repairedNames = [];
          for (;;) {
            const stillMissing = _missingNames(state);
            const next = stillMissing.find((n) => byName.has(n));
            if (!next) break; // nothing left this pick can satisfy
            const { dwg, errors } = byName.get(next);
            DwgLibrary.save(dwg);
            byName.delete(next);
            savedNames.push(next);
            if (errors && errors.length > 0) repairedNames.push(next);
          }

          const remaining = _missingNames(state);
          const lines = [savedNames.length + ' of ' + picked.length +
            ' picked file(s) matched a missing drawing and were loaded.'];
          if (repairedNames.length > 0) {
            lines.push(repairedNames.length + ' had problems that were auto-fixed: ' +
              repairedNames.join(', '));
          }
          // "Didn't match" lumped together two quite different things and
          // told the user neither. Split them: a drawing ALREADY in the
          // library is the ordinary case when a whole folder is swept, and
          // is skipped on purpose (saving would overwrite the loaded copy,
          // session edits and all). A drawing this menu never asked for is
          // the "wrong folder / wrong file" case, and is the one where
          // naming what was compared — the name INSIDE the file, not its
          // filename — is what unsticks someone.
          const alreadyLoaded = [];
          const notNeeded = [];
          byName.forEach((_, name) => {
            (DwgLibrary.get(name) ? alreadyLoaded : notNeeded).push(name);
          });
          if (alreadyLoaded.length > 0) {
            lines.push(alreadyLoaded.length + ' already loaded, so left unchanged: ' +
              alreadyLoaded.join(', ') + '.\nRe-loading would overwrite the copy ' +
              'in the Dwg Library, including any edits made this session.');
          }
          if (notNeeded.length > 0) {
            lines.push(notNeeded.length + ' not needed by this menu, so not loaded: ' +
              notNeeded.join(', ') + '.\nA file is matched on the drawing name ' +
              'INSIDE it, not on its file name.');
          }
          if (unreadable > 0) {
            lines.push(unreadable + ' file(s) could not be read as a drawing and were skipped.');
          }
          // Name them. Loading a parent can make its insertDwg children
          // missing for the FIRST time (LedOnOff brings in LedOn and
          // LedOff), so a bare count reads as no progress — and those new
          // names are exactly the ones with no Load row on the screen.
          lines.push(remaining.length === 0
            ? 'Nothing is missing now.'
            : 'Still missing: ' + remaining.join(', ') +
              '\n\nLoad them, or press Load Several Dwgs again for another folder.');
          pfodAlert(lines.join('\n\n'), () => {});
          // The alert carries what just happened and is dismissed; the
          // label left on screen carries the list of what is still to load.
          settle(stay());
        });
      });

      // Cancel detection: picker close restores window focus. 300 ms delay
      // lets the 'change' event (which fires first on a real pick) win the
      // race — as in _loadMissingDwg, but gated on `picking` so a slow read
      // can take as long as it needs without this settling underneath it.
      const onFocus = () => {
        window.removeEventListener('focus', onFocus);
        setTimeout(() => { if (!picking) settle(stay()); }, 300);
      };
      window.addEventListener('focus', onFocus);

      document.body.appendChild(input);
      input.click();
    });
  }

  /// Dispatch handler. depth = index of 'm' in rawCmd. EVERY path answers
  /// with a {;} update or a Promise of one — never a menu. There is nothing
  /// here to navigate to: the block is part of the editMenu screen, which
  /// is already displayed and already the nav-stack top. skipSave:true
  /// throughout (see _loadMissingDwg's own doc on why).
  /// @param {string}        rawCmd
  /// @param {DesignerState} state
  /// @param {number}        depth
  /// @returns {{pfod,skipSave}|Promise<{pfod,skipSave}>}
  function send(rawCmd, state, depth) {
    const next = rawCmd[depth + 1];
    if (next === MDP_LOAD_SEVERAL_CMD) {
      return _loadSeveralDwgs(state);
    }
    // Retargeted every press at whatever is still missing, so one button
    // walks the whole chain however deep the insertDwg nesting goes.
    if (next === MDP_LOAD_NEXT_CMD) {
      const missing = _missingNames(state);
      if (missing.length === 0) return { pfod: _updateScreen(state), skipSave: true };
      return _loadMissingDwg(state, missing[0]);
    }
    // The one navigation in this flow. Revealed only once nothing is
    // missing, so it lands a single entry above {b} — which is what Back
    // should pop, and it does.
    if (next === MDP_DONE_CMD) {
      return DesignerEditMenu.send(state);
    }
    return { pfod: _updateScreen(state), skipSave: true };
  }

  return Object.freeze({ send, renderHiddenItems, revealUpdate });
})();

// Self-register into the top-level designer dispatcher.
DesignerDispatch.add('m', DesignerMissingDwgPrompt.send);
