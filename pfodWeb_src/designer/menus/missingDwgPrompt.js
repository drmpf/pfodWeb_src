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
 *           chooser cannot multi-select across folders) of .pfodDwg_json
 *           files and/or .zip bundles (a Save Design bundle, or a
 *           generated sketch's own menujson/ zip -- see _readDwgsFromZip),
 *           matching on each drawing's own name and saving only what is
 *           actually missing. Answers {;}, reporting what it did on the
 *           summary label. See _loadSeveralDwgs.
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

  // Biggest {;} this screen will build. The protocol cap is 1024 bytes and
  // connectionManager enforces it by cutting mid-message, so the margin is
  // there to be sure the closing brace (and the buttons after the missing
  // list) are never the thing that gets cut. Same number, for the same
  // reason, as loadFromFile.js's own LABEL_MAX_BYTES / editMenu.js's
  // EM_STATUS_MAX_BYTES.
  const MDP_LABEL_MAX_BYTES = 1000;

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
  // missing.
  const MDP_DONE_CMD = 'D';

  // "Open Menu Anyway" — the same destination as MDP_DONE_CMD, offered
  // while dwgs are STILL missing.
  //
  // Without it this block is a dead end. Every button on it asks for a file
  // the user may simply not have: a drawing that was never saved, one that
  // belongs to whoever sent the design, or nothing missing at all except
  // the user's willingness to go and find it when all they wanted was a
  // look at the menu. There was no way forward and no way back that did not
  // abandon the design.
  //
  // It is safe to offer because a missing drawing is already survivable
  // everywhere it lands: a menu Drawing item renders the placeholder that
  // NAMES the drawing (previewMenu.js's _renderNotLoadedDrawing), and a
  // missing insertDwg is dropped from its parent's wire response with the
  // rest of that drawing intact (dwgDesignerAdapter.js's own
  // _resolveAutoCmdAndIdx). Nothing is deleted and no reference is
  // rewritten — load the drawing later and it simply appears.
  const MDP_SKIP_CMD = 'K';

  // A non-clickable label reporting what the LAST load did — how many of
  // the picked files were used, which were skipped and why.
  //
  // This was a pfodAlert. A modal was the wrong shape for it twice over:
  // the user had to dismiss it before they could look at the list it was
  // describing, and it took its own text away with it, so "which two did it
  // skip again?" had no answer. As a label it sits beside the status line
  // it qualifies and stays there.
  const MDP_SUMMARY_CMD = 'R';

  // Lines for that label, or null when there is nothing to report yet.
  // Set by whichever load ran last, cleared when the block is revealed for
  // a newly-picked design (a summary from the previous design's load would
  // describe work that has nothing to do with this one).
  let _lastSummary = null;

  /// Strip pfod delimiter characters so a dwg's own name can never
  /// corrupt the wire message it's embedded in — matches
  /// selectDwgForItem.js's own _sanitize.
  function _sanitize(s) {
    return String(s || '').replace(/[|~`{}]/g, '_');
  }

  /// Join `names` (already _sanitize()d) with `sep`, trimmed to fit `room`
  /// BYTES — dropping names off the end and reporting how many, rather
  /// than letting an unbounded list push the WHOLE {;} message over the
  /// 1024-byte protocol cap. connectionManager's reader cuts mid-message
  /// on overflow, not per-item, so an untrimmed list here would silently
  /// drop whatever comes after it in the message too (the buttons below
  /// "Still to load:") — not just show a long label. Same technique as
  /// loadFromFile.js's own _fitNotes.
  ///
  /// Measured in bytes, not characters: a dwg name (or error message) can
  /// carry non-ASCII text, and a UTF-8 multi-byte character is more than
  /// one byte.
  /// @param {string[]} names
  /// @param {number} room — bytes available for the joined list
  /// @param {string} [sep] — defaults to ", "; _loadMissingDwg's own
  ///        repair-error list instead joins with "\n", one per line
  /// @returns {string}
  function _fitNameList(names, room, sep) {
    sep = sep === undefined ? ', ' : sep;
    const enc = new TextEncoder();
    const all = names.join(sep);
    if (enc.encode(all).length <= room) return all;
    let out = '';
    let dropped = 0;
    for (const n of names) {
      if (dropped > 0) { dropped++; continue; }
      const next = out ? out + sep + n : n;
      // Leave room for the "...and N more" suffix the drop is reported on.
      if (enc.encode(next).length > room - 20) { dropped++; continue; }
      out = next;
    }
    if (dropped === 0) return out;
    const more = (out ? out + sep : '') + 'and ' + dropped + ' more';
    // Only if IT fits — the list is free text, and a long enough run of
    // entries can leave no room even for this; saying nothing is then
    // right, because the alternative is a note that itself overflows the
    // message.
    return enc.encode(more).length <= room ? more : out;
  }

  // Per name-list budget WITHIN one summary line (e.g. "N already loaded,
  // so left unchanged: <names>") -- generous enough to show a reasonable
  // number of real names before falling back to "...and N more", small
  // enough that even all of _loadSeveralDwgs's name-bearing lines being
  // long simultaneously stays well inside MDP_SUMMARY_MAX_BYTES below.
  const MDP_SUMMARY_LIST_MAX_BYTES = 150;

  // Hard cap on _summaryItem()'s own rendered output -- a backstop
  // independent of the per-list trimming above: _loadSeveralDwgs can
  // report several name-bearing lines at once (repaired/already-loaded/
  // not-needed), and even with each list individually capped, enough of
  // them together could still add up past this. _capLines (see
  // _summaryItem) drops whole lines off the end rather than let that
  // happen, same "truncate safely, report what was lost" rule as
  // _fitNameList. Sized to leave comfortable room, within
  // MDP_LABEL_MAX_BYTES, for the status label/missing-list and the three
  // buttons that share the same {;} message.
  const MDP_SUMMARY_MAX_BYTES = 500;

  /// Drop whole lines off the end of `lines` until the \n-joined result
  /// fits `maxBytes`, appending a count of what was dropped (logged in
  /// full to the console, since the message itself has no room left to
  /// say more). Returns `lines` unchanged when it already fits.
  /// @param {string[]} lines
  /// @param {number} maxBytes
  /// @returns {string[]}
  function _capLines(lines, maxBytes) {
    const enc = new TextEncoder();
    if (enc.encode(lines.join('\n')).length <= maxBytes) return lines;
    const out = [];
    let used = 0;
    for (const line of lines) {
      const lineBytes = enc.encode((out.length ? '\n' : '') + line).length;
      // Leave room for the "N more line(s) omitted" line itself.
      if (used + lineBytes > maxBytes - 40) break;
      out.push(line);
      used += lineBytes;
    }
    const dropped = lines.length - out.length;
    if (dropped > 0) {
      console.warn('[DesignerMissingDwgPrompt] summary too long for the {;} message, ' +
        dropped + ' line(s) omitted from the screen:', lines);
      out.push('(' + dropped + ' more line(s) omitted — see the console)');
    }
    return out;
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
           '|!m' + MDP_SUMMARY_CMD + '-~' +     // what the last load did
           '|m' + MDP_LOAD_SEVERAL_CMD + '-~' + // Load Several Dwgs
           '|m' + MDP_LOAD_NEXT_CMD + '-~' +    // Load next dwg
           '|m' + MDP_DONE_CMD + '-~' +         // All dwgs loaded -> editMenu
           '|m' + MDP_SKIP_CMD + '-~';          // Open Menu Anyway -> editMenu
  }

  /// The `|!mR…` item for the summary label: the lines set by the last
  /// load, or the item hidden again when there is nothing to report.
  ///
  /// Colour says at a glance whether anything needs reading: green when the
  /// load did exactly what was asked, yellow when something was skipped or
  /// unreadable — which is the case where WHY matters and the detail below
  /// is worth the user's attention.
  ///
  /// _lastSummary's own lines are already individually name-list-capped
  /// at MDP_SUMMARY_LIST_MAX_BYTES where they're built (_loadSeveralDwgs/
  /// _loadMissingDwg), but several long lines together could still push
  /// the total past MDP_SUMMARY_MAX_BYTES -- _capLines is the backstop
  /// that guarantees this item's own contribution to the {;} message
  /// stays bounded regardless, same rationale as _fitNameList.
  /// @returns {string}
  function _summaryItem() {
    if (!_lastSummary || _lastSummary.length === 0) {
      return '|!m' + MDP_SUMMARY_CMD + '-~';
    }
    const lines = _capLines(_lastSummary, MDP_SUMMARY_MAX_BYTES);
    const colour = lines.length > 1 ? '<y>' : '<g>';
    return '|!m' + MDP_SUMMARY_CMD + DESIGNER_MENU_FMT + '~' + colour +
           lines.join('\n');
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
    // A newly-picked design starts with a clean slate: the summary still
    // held here describes a load done for whatever design was open before,
    // and reading it as this one's would be worse than showing nothing.
    _lastSummary = null;
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
      out += _summaryItem();
      out += '|m' + MDP_LOAD_SEVERAL_CMD + '-~';
      out += '|m' + MDP_LOAD_NEXT_CMD + '-~';
      out += '|m' + MDP_DONE_CMD + DESIGNER_MENU_FMT +
             '~All dwgs loaded\nOpen Editing Menu';
      // Skip goes when its reason does. It and MDP_DONE_CMD lead to the
      // same screen, so leaving both up would put two buttons side by side
      // that do the same thing — one of them describing a problem that no
      // longer exists.
      out += '|m' + MDP_SKIP_CMD + '-~';
    } else {
      // Everything AFTER the missing-list label in this message, built
      // first so the list can be budgeted against what it shares the
      // message with — see _fitNameList.
      const afterList =
        // Directly under the list it qualifies: that label says what is
        // left, this one says what the last press did about it.
        _summaryItem() +
        '|m' + MDP_LOAD_SEVERAL_CMD + DESIGNER_MENU_FMT +
          '~Load Several Dwgs\n<-1>from one folder, or\n<-1>from xxx_menuJson.zip' +
        // Retargeted at the head of the list every press, so one button
        // walks the whole chain however deep the insertDwg nesting goes.
        '|m' + MDP_LOAD_NEXT_CMD + DESIGNER_MENU_FMT +
          '~Load next dwg\n<r>' + _sanitize(stillMissing[0]) + '</r>\nfrom  .pfodDwg_json file' +
        '|m' + MDP_DONE_CMD + '-~' +
        // Last, under the buttons that ask for the files: the way on for a
        // user who does not have them. It says what it costs, so it is a
        // choice rather than the easy button — a drawing that is not
        // there cannot be drawn, and the menu it belongs to says so where
        // it sits.
        '|m' + MDP_SKIP_CMD + DESIGNER_MENU_FMT +
          '~Open Menu Anyway\n<-1><y>' + stillMissing.length +
          ' drawing(s) will show as <b>not loaded</b>';
      // The label carries the list and nothing else. A count would not do:
      // loading one dwg can change WHICH dwgs are missing, not just how
      // many — load LedOnOff and its two insertDwg children, LedOn and
      // LedOff, become missing for the first time, invisible until their
      // parent was in the library. "1 loaded, 2 still missing" then reads
      // as no progress at all.
      //
      // Byte-budgeted against everything else already built above: an
      // unbounded list here, with enough missing dwgs, would push the
      // WHOLE {;} message over the protocol's 1024-byte cap, and
      // connectionManager's reader cuts mid-message on overflow — losing
      // the buttons below the list, not just truncating it (see
      // _fitNameList).
      const statusHead = '|!m' + MDP_STATUS_CMD + DESIGNER_MENU_FMT + '~<y>Still to load: ';
      const enc = new TextEncoder();
      const room = MDP_LABEL_MAX_BYTES - enc.encode(out + statusHead + afterList + '}').length;
      out += statusHead + _fitNameList(stillMissing.map(_sanitize), Math.max(room, 0)) + afterList;
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
  /// rows) show up. A load that works — auto-fixes included — reports on
  /// the summary label, the same one the bulk load writes to; only a
  /// genuine failure (unreadable, not JSON, not a dwg, wrong drawing name)
  /// still raises a pfodAlert, because nothing was loaded and there is no
  /// result to report. Cancel re-renders unchanged instead of navigating.
  /// skipSave:true throughout —
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
          DwgLibrary.save(dwg);
          // Same label the bulk load reports through, so one press and
          // sixteen read the same way. Auto-fixes are reported, not alerted
          // — the drawing loaded, and a modal for that made the user
          // dismiss something before they could see it had worked.
          _lastSummary = ['Loaded ' + _sanitize(dwg.name) + '.'];
          if (errors && errors.length > 0) {
            _lastSummary.push('It had problems that were auto-fixed:\n' +
              _fitNameList(errors.map((e) => _sanitize(e.message)), MDP_SUMMARY_LIST_MAX_BYTES, '\n'));
          }
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

  /// Read every `.pfodDwg_json` entry out of a picked .zip -- a Save
  /// Design bundle, or a generated sketch's own menujson/ zip -- so a
  /// missing drawing can be supplied from either without the user having
  /// to unzip it by hand first and hunt out the individual dwg files.
  ///
  /// The zip's own `.pfodMenu_json` entry (if any) is deliberately
  /// IGNORED: this screen is filling in drawings for the menu the user
  /// already has open, never replacing it -- that is what "Load Design"
  /// (loadFromFile.js) is for, and importing the zip's menu here would
  /// silently overwrite whatever changes the user has made since the
  /// zip was produced.
  ///
  /// Never throws: a corrupt/non-zip pick, or an unreadable/invalid dwg
  /// entry inside an otherwise-good zip, each resolve to it simply
  /// contributing nothing, matching _readOneDwgFile's own "skip silently"
  /// contract for a stray file in a multi-pick.
  /// @param {File} file
  /// @returns {Promise<{dwg: object, errors: Array}[]>}
  function _readDwgsFromZip(file) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onerror = () => resolve([]);
      reader.onload = () => {
        DesignerZipBuilder.readBundle(new Uint8Array(reader.result))
          .then((entries) => {
            const results = [];
            entries.filter((e) => /\.pfodDwg_json$/i.test(e.path)).forEach((e) => {
              let parsed;
              try {
                parsed = JSON.parse(new TextDecoder().decode(e.data));
              } catch (err) {
                return;
              }
              if (dwgFileRejectReason(parsed)) return;
              // isLoad=true, same reason as _readOneDwgFile -- this is
              // untrusted file content either way.
              results.push(validateAndRepairDwg(parsed, e.path.split('/').pop(), true));
            });
            resolve(results);
          })
          .catch(() => resolve([]));
      };
      reader.readAsArrayBuffer(file);
    });
  }

  /// "Load Several Dwgs" — one multi-file pick that fills as many of the
  /// missing rows as the chosen folder can supply, instead of one picker
  /// per row. A file chooser cannot multi-select across folders (an OS
  /// limit, not a choice here), so this is one folder per press; pressing
  /// it again picks up another folder, and the screen re-renders with
  /// whatever is still missing.
  ///
  /// Also accepts one or more .zip files in the SAME pick — a Save Design
  /// bundle, or a generated sketch's own menujson/ zip, either one holding
  /// however many dwgs it was saved with. Each zip's own `.pfodDwg_json`
  /// entries are unpacked (see _readDwgsFromZip) and folded into the exact
  /// same byName pool a loose file picked alongside it would be, so "only
  /// save what's actually missing" and the multi-pass insertDwg handling
  /// below apply identically regardless of where a dwg came from. The
  /// zip's own menu json (if any) is never read here — see
  /// _readDwgsFromZip for why.
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
      input.accept = '.pfodDwg_json,.zip';
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
        const dwgFiles = files.filter((f) => /\.pfodDwg_json$/i.test(f.name));
        const zipFiles = files.filter((f) => /\.zip$/i.test(f.name));
        if (dwgFiles.length + zipFiles.length === 0) { settle(stay()); return; }
        picking = true;

        Promise.all([
          Promise.all(dwgFiles.map(_readOneDwgFile)),
          Promise.all(zipFiles.map(_readDwgsFromZip)),
        ]).then(([dwgResults, zipResultLists]) => {
          // Each zip resolves to an ARRAY of dwg results (zero or more --
          // see _readDwgsFromZip), so flatten those in alongside the loose
          // files' one-result-each before pooling by name.
          const results = dwgResults.concat(zipResultLists.flat());
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

          // Counted against dwg ENTRIES considered, not top-level files
          // picked — a single zip can expand into several, so "files" would
          // undercount what was actually offered.
          const lines = [savedNames.length + ' of ' + results.length +
            ' drawing(s) found in your pick matched a missing one and were loaded.'];
          if (repairedNames.length > 0) {
            lines.push(repairedNames.length + ' had problems that were auto-fixed: ' +
              _fitNameList(repairedNames.map(_sanitize), MDP_SUMMARY_LIST_MAX_BYTES));
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
              _fitNameList(alreadyLoaded.map(_sanitize), MDP_SUMMARY_LIST_MAX_BYTES) +
              '.\nRe-loading would overwrite ' +
              'the copy in the Dwg Library, including any edits made this session.');
          }
          if (notNeeded.length > 0) {
            lines.push(notNeeded.length + ' not needed by this menu, so not loaded: ' +
              _fitNameList(notNeeded.map(_sanitize), MDP_SUMMARY_LIST_MAX_BYTES) +
              '.\nA file is matched on the drawing ' +
              'name INSIDE it, not on its file name.');
          }
          if (unreadable > 0) {
            lines.push(unreadable + ' file(s) could not be read as a drawing and were skipped.');
          }
          // What is still missing is deliberately NOT repeated here. The
          // alert had to say it, having taken the screen away; the label
          // does not, because the "Still to load:" label is right beside it
          // — and when nothing is left, the "All dwgs loaded" button that
          // replaces that label says so itself. This one line reports what
          // the press did, and the screen around it reports the state.
          _lastSummary = lines;
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
    // Both ways on land on the same screen. They differ only in what is
    // still missing when they are pressed, which the button that was
    // showing has already said.
    if (next === MDP_DONE_CMD || next === MDP_SKIP_CMD) {
      // The summary belongs to the load that produced it; carrying it onto
      // the next design's block would describe work done for another one.
      _lastSummary = null;
      return DesignerEditMenu.send(state);
    }
    return { pfod: _updateScreen(state), skipSave: true };
  }

  return Object.freeze({ send, renderHiddenItems, revealUpdate });
})();

// Self-register into the top-level designer dispatcher.
DesignerDispatch.add('m', DesignerMissingDwgPrompt.send);
