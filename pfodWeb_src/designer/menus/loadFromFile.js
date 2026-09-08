/*
 * designer/menus/loadFromFile.js
 *
 * Handler for 'L' (Load Design from File) on the Edit existing Menu list.
 *
 * The list screen (selectFromMenuList.js) always renders three fixed items
 * at the top on every fresh {b} visit:
 *
 *   L  — Load Design from File button, taking EITHER shape
 *   I  — instruction / status label
 *   X  — hidden nav button (initially |X-~, '-' after cmd = not visible)
 *
 * The {L} handler opens the OS file picker and, on completion, sends a
 * {;} partial update to change those items in-place:
 *
 *   Success  → L hidden (empty label), I = "name loaded", F = clickable
 *              button with design name.  L can only be used once per
 *              visit; navigating away and back resets to the initial state.
 *   Cancel   → PFOD_EMPTY (no screen change).
 *   Error    → only I updated with the error message; L and F unchanged.
 *
 * I also carries everything ELSE that happened on a successful load — how
 * many of a zip's dwgs arrived, whether any fields had to be defaulted.
 * That used to be a pfodAlert; it is on the label because a modal has to
 * be dismissed before the user can carry on and takes its text with it,
 * whereas the label stays readable beside the result it describes (and is
 * reachable by browser automation, which cannot dismiss a modal at all).
 *
 * The {F} handler (registered here, closes over _lastLoadedName): loads
 * the imported design into state and returns the editMenu screen.
 *
 * Nav-stack contract: {L} returns {;} (partial update, never pushed to
 * nav stack).  {F} returns a full menu and IS pushed; back-nav re-sends
 * {b} (the list screen), not {L} — so the file picker never reopens.
 *
 * Cancel detection: the OS picker restores window focus on dismiss;
 * a 300 ms delayed one-shot focus listener settles the Promise so the
 * queue does not hang.  The 'change' event fires first when a file is
 * picked, so the settle() guard ensures only one path wins.
 *
 * Name-collision handling: imported design with a name already in use
 * gets an auto-suffix (_2, _3, …) so it lands without overwriting.
 *
 * ONE button, taking either of the two shapes saveToFile.js produces (see
 * its buildBundle): a bare `.pfodMenu_json` for a design that links no
 * drawings, and a `<name>_menuJson.zip` carrying the design plus every
 * drawing it links when it does. Which one a given design was saved as
 * depends on whether it happens to link a drawing — not on anything the
 * user chose — so making them pick the right button first was asking a
 * question they had no reason to be able to answer. The extension of what
 * they pick decides how it is read.
 *
 * The same bundle is what a generated sketch holds in its own `menujson/`
 * directory, so a zip lifted straight out of one loads here — as does the
 * whole sketch zip (DesignerZipBuilder.readBundle).
 *
 * A zip's dwg entries are offered to DwgLibrary FIRST, each under its OWN
 * saved name (no dedup, no rename — the menu's Drawing items reference
 * that exact name), before the menu json is parsed, so every dwgName
 * already resolves by the time the design finishes loading.
 *
 * NOTHING already held is overwritten by either half. A drawing whose name
 * is already in the library is left as it is, and the design lands under a
 * free name rather than over one it collides with. Both are reported on
 * the status label — a load that quietly did less than it appeared to is
 * the failure worth avoiding, and a load that quietly threw away this
 * session's edits to a drawing is worse.
 *
 * Origin: JS-port-only feature — not in pfodDesignerV2.
 *
 * (c)2026 Forward Computing and Control Pty. Ltd.
 */

const DesignerLoadFromFile = (() => {

  // Biggest {;} this screen will build. The protocol cap is 1024 bytes and
  // connectionManager enforces it by cutting mid-message, so the margin is
  // there to be sure the closing brace is never the thing that gets cut.
  // Same number, for the same reason, as editMenu.js's EM_STATUS_MAX_BYTES.
  const LABEL_MAX_BYTES = 1000;

  // Name of the most recently loaded design — used by the F handler to
  // navigate to it when the user presses the F button.
  let _lastLoadedName = '';

  /// Return `candidate`, or `candidate_2` / `candidate_3` / … if some
  /// saved design already uses that name, so the import never overwrites
  /// a live design.
  function _ensureUniqueName(candidate) {
    const taken = new Set(DesignerState.listNames());
    if (!taken.has(candidate)) return candidate;
    for (let n = 2; ; n++) {
      const tryName = candidate + '_' + n;
      if (!taken.has(tryName)) return tryName;
    }
  }

  /// Make one line of free text safe to drop into a pfod label: the four
  /// characters that terminate or structure a message, plus the newlines
  /// that would silently turn one reported note into several label lines.
  /// @param {string} text
  /// @returns {string}
  function _labelSafe(text) {
    return String(text).replace(/[|~{}]/g, '_').replace(/\s*\n\s*/g, '; ');
  }

  /// Build the {;} success string: hides L, updates I with green bold
  /// name + italic "loaded" + yellow hint, and makes F a visible clickable button.
  ///
  /// `notes` is what actually happened during this load — how many dwgs came
  /// out of a zip, whether any fields had to be repaired. It goes on this
  /// label rather than into a pfodAlert: the alert was a modal the user had
  /// to dismiss before they could carry on, and its text was gone the moment
  /// they did. On the label it stays readable while they work, and browser
  /// automation driving this screen can read it like any other content.
  ///
  /// The detail that will not fit here goes to DesignerDetailsPopup — see
  /// _showChanges.
  ///
  /// @param {string} name
  /// @param {string[]} [notes] extra lines, each already human-readable
  function _successUpdate(name, notes) {
    const safe = name.replace(/[|~{}]/g, '_');
    const head = '{;|L-~|!I~<g><b>' + safe + '</b> <i>loaded';
    const tail = '\n<y><-1>Refresh this screen to load another menu|X' +
                 DESIGNER_MENU_FMT + '~' + safe + '|!Zempty-~}';
    return head + _fitNotes(notes, head, tail) + tail;
  }

  /// As many of `notes` as fit inside the pfod message cap, each on its own
  /// line, with a count of any that did not.
  ///
  /// A pfod message is capped at 1024 BYTES by the protocol and the
  /// connection layer enforces it by CUTTING. What was lost when that
  /// happened was the end of the message — the `|X…|!Zempty-~}` that makes
  /// the "open it" button appear — so an over-long report both read as
  /// truncated mid-word AND left the screen missing a control. Trimming
  /// here keeps the message well-formed whatever the notes say.
  ///
  /// Measured in bytes, not characters: these lines carry em dashes and
  /// board names, and a UTF-8 em dash is three bytes.
  ///
  /// @param {string[]} notes
  /// @param {string} head — what precedes them in the message
  /// @param {string} tail — what follows, and must survive
  /// @returns {string} the formatted note block, possibly shortened
  function _fitNotes(notes, head, tail) {
    const enc = new TextEncoder();
    const line = (n) => '\n<y><-1>' + _labelSafe(n);
    const room = LABEL_MAX_BYTES - enc.encode(head + tail).length;
    const all = (notes || []).map(line).join('');
    if (enc.encode(all).length <= room) return all;

    let out = '';
    let dropped = 0;
    (notes || []).forEach((n) => {
      if (dropped > 0) { dropped++; return; }   // once one is dropped, stop
      const next = out + line(n);
      // Leave room for the "and N more" line the drop is reported on.
      if (enc.encode(next).length > room - 40) { dropped++; return; }
      out = next;
    });
    if (dropped === 0) return out;
    // Only if IT fits. A design name is free text out of a loaded file, and
    // a long enough one leaves no room at all here — in which case saying
    // nothing is right, because the alternative is saying it in a message
    // that gets cut. The name itself is not shortened: the tail carries it
    // as the cmd argument the "open it" button sends.
    const more = out + line('and ' + dropped + ' more — see the console');
    return enc.encode(more).length <= room ? more : out;
  }

  /// Put the detail of a load in front of the user, in the one place it
  /// fits.
  ///
  /// The status label cannot hold it: it is a pfod message, capped at 1024
  /// BYTES. Two things routinely overrun it — a bundle of twenty drawings
  /// reporting twenty names, and a design moved between boards, which
  /// re-derives an ADC range and a full-scale value for every data display
  /// and every chart plot. The label keeps the counts, which is what the
  /// user reads while working; this is the detail, which they read once.
  ///
  /// Never throws: a failure here must not turn a completed load into a
  /// failed one.
  /// @param {string} name — the design, for the popup's title
  /// @param {Array<{heading, items}>} groups — the detail, by section
  function _showChanges(name, groups) {
    const sections = (groups || []).filter((g) => g && g.items && g.items.length > 0);
    if (sections.length === 0) return;
    const count = sections.reduce((n, g) => n + g.items.length, 0);
    try {
      DesignerDetailsPopup.show(
        name + ' — ' + count + ' item(s)',
        'What happened as this design was loaded:',
        sections);
    } catch (e) {
      // The list is still in the console, where every warning from the
      // import already goes.
      console.warn('[LOAD_FROM_FILE] could not show the load detail:', e, sections);
    }
  }

  /// Build the {;} error string: updates I with red bold name, newline,
  /// then italic "failed to load" and reasserts |F-~ to keep F hidden.
  /// @param {string} name
  /// @param {string} [why] one line saying what was wrong — a bare "failed
  ///        to load" leaves the user with nowhere to go, and the commonest
  ///        cause here is picking a zip that is not a design bundle.
  function _errorUpdate(name, why) {
    const safe = (name || 'File').replace(/[|~{}]/g, '_');
    return '{;|!I~<r><b>' + safe + '</b>\n<i>failed to load' +
           (why ? '\n<-1>' + _labelSafe(why) : '') + '|X-~}';
  }

  /// Parse + validate + import the file text.  Returns a Promise of a
  /// {pfod, skipSave} object ready to pass to settle().  MUST always
  /// resolve with a value.
  /// fileName is the OS filename (e.g. "Menu_1.pfodMenu_json") used in
  /// early-failure messages before the JSON name can be read.
  /// `notes` carries anything the CALLER already knows about this load
  /// (a zip's own dwg count); anything discovered in here is appended to
  /// it, and the whole lot ends up on the status label.
  ///
  /// async because a design built for another board asks the user which
  /// target to import against, and that question has to be answered BEFORE
  /// importFromObject runs — it clears every pin the current board does not
  /// have, so asking afterwards would be asking about a design already
  /// stripped. See DesignerState.targetMismatch and DesignerTargetPrompt.
  /// Ask which board to load this design against, if they differ.
  ///
  /// Called before ANYTHING is loaded — no drawing, no design. Answering
  /// "switch" must leave the library exactly as it was: the user asked to
  /// change target, not to half-load a bundle built for another one. So this
  /// runs ahead of the drawing loop on the zip path, not just ahead of the
  /// design import.
  ///
  /// Switching also LEAVES the designer. The board is fixed when the
  /// designer's adapter is built, so the new target cannot take effect until
  /// it is reopened — and the place a target is chosen is the connection
  /// screen, which is exactly where {!} lands the user.
  ///
  /// @param {DesignerState} state
  /// @param {object} parsed — the parsed design
  /// @param {string} displayName — what to call the file in the prompt
  /// @returns {Promise<{exit: boolean, result?: object, note?: string}>}
  async function _decideTarget(state, parsed, displayName) {
    const mismatch = DesignerState.targetMismatch(state.board, parsed);
    if (!mismatch) return { exit: false };
    const answer = await DesignerTargetPrompt.ask(mismatch, displayName, () => {
      // Persist any unsaved edits to the open design, THEN keep a copy of it
      // under its own name. The save alone is not preservation: there is one
      // storage slot per design name, so once the target changes and this
      // design is next saved it is overwritten against the new board — same
      // slot, new boardName, pins cleared. The copy is the only thing that
      // survives that, and it is named after the old board so it can be
      // found again.
      try { state.save(); } catch (_) { /* quota/private mode */ }
      // Every design built for the board being left, not just the one open:
      // the target is about to become the file's, and each of them loses its
      // pins the first time it is opened against the new board.
      DesignerTargetPrompt.preserveAllNotOn(mismatch.designBoard);
    });
    if (answer === 'switch') {
      // Nothing has been loaded, and nothing will be. Leave the designer so
      // the target can be changed and the file loaded again from a designer
      // running on the right board.
      DesignerTargetPrompt.exitDesigner();
      return { exit: true, result: { pfod: PFOD_EMPTY, skipSave: true } };
    }
    // No copy is kept on this branch, and none is needed: the target has not
    // changed, so the design already open keeps its board. Only the file
    // being loaded is affected, and it arrives under a free name of its own.
    //
    // The answer still applies to everything: accepting this board means
    // every stored design is for it, so none of them asks again.
    DesignerTargetPrompt.adoptCurrentTarget(state.board, state);
    return {
      exit: false,
      note: 'Built for ' + mismatch.designBoard + ', loaded on ' +
            mismatch.currentBoard + ' — pins that board does not have were cleared',
    };
  }

  /// @param {boolean} [targetChecked] true when the caller has already run
  ///        _decideTarget for this file (the zip path, which must ask before
  ///        it loads any drawing)
  /// @param {Array<{heading, items}>} [groups] detail the CALLER already has
  ///        that belongs in the popup rather than on the label — the zip
  ///        path's per-drawing names. Anything this function itself finds is
  ///        added to them, so one load raises one popup.
  async function _ingestText(state, text, fileName, notes, targetChecked, groups) {
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (err) {
      return { pfod: _errorUpdate(fileName || 'File'), skipSave: true };
    }

    const incomingName = (parsed && typeof parsed.name === 'string')
                       ? parsed.name : 'Imported';
    const finalName    = _ensureUniqueName(incomingName);
    const said = (notes || []).slice();
    if (finalName !== incomingName) {
      // Renaming IS the not-overwriting: the design already saved under
      // that name keeps it, and this one arrives beside it. Unreported it
      // would look as though the existing design had just been replaced by
      // the file, which is the opposite of what happened.
      said.push('"' + incomingName + '" is already in the list, so this was loaded as "' +
        finalName + '" — the existing one was left unchanged');
    }

    // Ask about the target BEFORE importing — see this function's own doc.
    // The zip path has already asked (before it loaded any drawing), and
    // says so, because asking twice for one file would be absurd.
    if (!targetChecked) {
      const decision = await _decideTarget(state, parsed, incomingName);
      if (decision.exit) return decision.result;
      if (decision.note) said.push(decision.note);
    }

    // importFromObject error contracts:
    //   HARD    — err.partial unset; state NOT modified.  Update I with error.
    //   PARTIAL — err.partial === true; state IS applied with defaults.
    //             The design IS usable, so the load carries on: a COUNT goes
    //             on the status label and the per-field list goes to the
    //             popup. It used to all go on the label, and a design moved
    //             between boards re-derives an ADC range and a scale per
    //             data display and per chart plot — a dozen lines, on a
    //             label carried by a pfod message capped at 1024 bytes. It
    //             arrived cut off mid-word.
    const detail = (groups || []).slice();
    try {
      state.importFromObject(parsed, finalName);
    } catch (err) {
      if (!err.partial) {
        return { pfod: _errorUpdate(incomingName), skipSave: true };
      }
      // "Imported with N issue(s):\n<one per line>" — the head is the
      // summary, the rest is the list.
      const changes = String(err.message).split('\n').slice(1)
        .map((l) => l.trim()).filter((l) => l !== '');
      said.push(changes.length + ' field(s) were adjusted for this board' +
                (changes.length ? ' — see the list' : ''));
      if (changes.length > 0) {
        detail.push({ heading: 'Fields adjusted for ' +
          ((state.board && state.board.name) ? state.board.name : 'this board') + ':',
          items: changes });
      }
    }

    // Record for the F handler, then signal success.
    // skipSave: false — auto-save persists the imported design.
    _lastLoadedName = finalName;
    const pfod = _successUpdate(finalName, said);
    // After the reply is built, so a popup that somehow throws cannot cost
    // the user the load they just did.
    _showChanges(finalName, detail);
    return { pfod: pfod, skipSave: false };
  }

  /// Parse, validate + repair, and save one dwg entry from a loaded zip
  /// bundle, keeping its OWN saved name exactly as-is — no dedup, no
  /// rename: the menu's Drawing items reference this exact name, and a
  /// "<name>_2" would satisfy nothing.
  ///
  /// A name already in DwgLibrary is LEFT ALONE. This used to overwrite,
  /// on the reasoning that a zip is a snapshot and loading it should
  /// reproduce that snapshot — but the drawing being overwritten is
  /// frequently the user's own edited copy, and a load that silently
  /// discards this session's work is not a load anyone asked for. The
  /// design still opens; its Drawing items resolve to the copy already
  /// held, and the status label names every drawing left untouched so the
  /// difference is visible rather than assumed.
  ///
  /// Never throws: one bad entry must not abort the rest of the bundle,
  /// nor the menu json itself.
  /// @param {{path: string, data: Uint8Array}} entry
  /// @param {{loaded: string[], existing: string[], skipped: string[]}} outcome
  ///        accumulated across the whole zip, for the status label
  function _loadDwgZipEntry(entry, outcome) {
    let parsed;
    try {
      parsed = JSON.parse(new TextDecoder().decode(entry.data));
    } catch (err) {
      console.error('[DesignerLoadFromFile] "' + entry.path + '": invalid JSON — skipped', err);
      outcome.skipped.push(entry.path.split('/').pop());
      return;
    }
    const rejectReason = dwgFileRejectReason(parsed);
    if (rejectReason) {
      console.error('[DesignerLoadFromFile] "' + entry.path + '": ' + rejectReason + ' — skipped');
      outcome.skipped.push(entry.path.split('/').pop());
      return;
    }
    // isLoad=true — a zip entry is untrusted external data, so a duplicate
    // idxName is repaired and reported rather than thrown. The throw would
    // escape this function's own caller (_ingestZip's forEach), abandoning
    // every remaining dwg AND the menu json itself — exactly the
    // whole-design abort this function's contract above rules out.
    const { dwg } = validateAndRepairDwg(parsed, parsed.name, true);
    if (DwgLibrary.get(dwg.name)) { outcome.existing.push(dwg.name); return; }
    DwgLibrary.save(dwg);
    outcome.loaded.push(dwg.name);
  }

  /// Parse a loaded zip bundle: every `.pfodDwg_json` entry is offered to
  /// DwgLibrary FIRST (see _loadDwgZipEntry on why an existing name is
  /// left alone), then the single `.pfodMenu_json` entry is handed to
  /// _ingestText exactly as if it had been picked directly — same
  /// success/partial/hard-error handling either way.
  ///
  /// Nothing already held is replaced, by either half: a colliding drawing
  /// is skipped, and the design itself lands under a free name
  /// (_ensureUniqueName) rather than over the one it shares a name with.
  /// The status label reports both, because a load that quietly did less
  /// than it looked like it did is the failure worth avoiding here.
  /// @param {DesignerState} state
  /// @param {ArrayBuffer} arrayBuffer
  /// @param {string} fileName
  /// @returns {{pfod, skipSave}}
  async function _ingestZip(state, arrayBuffer, fileName) {
    let entries;
    try {
      // Takes a saved bundle, or a generated sketch zip with one in its
      // menujson/ directory — see readBundle.
      entries = await DesignerZipBuilder.readBundle(new Uint8Array(arrayBuffer));
    } catch (err) {
      console.error('[DesignerLoadFromFile] "' + fileName + '": failed to read zip', err);
      // Say WHY. _errorUpdate takes a `why` for exactly this reason and
      // this path used to pass none, so a failure here arrived as a bare
      // "failed to load" with the real reason left in the console.
      return {
        pfod: _errorUpdate(fileName, DesignerZipBuilder.explainReadFailure(err)),
        skipSave: true,
      };
    }

    const menuEntry = entries.find((e) => /\.pfodMenu_json$/i.test(e.path));
    if (!menuEntry) {
      console.error('[DesignerLoadFromFile] "' + fileName + '": no design bundle in this zip');
      return {
        pfod: _errorUpdate(fileName,
          'No menu design in this zip. Expected a Save Design bundle, or a generated ' +
          'sketch with one in its menujson folder.'),
        skipSave: true,
      };
    }

    // The target question comes FIRST — ahead of the drawings, not just
    // ahead of the design. Asking after the drawing loop left a bundle built
    // for another board half-loaded when the user chose to switch: the
    // drawings were in the library and only the design had been declined.
    // "Change target" has to mean nothing was loaded.
    let targetNote = null;
    {
      let parsedForTarget = null;
      try {
        parsedForTarget = JSON.parse(new TextDecoder().decode(menuEntry.data));
      } catch (_) {
        // Not valid JSON — leave it to _ingestText, which reports the parse
        // failure properly. Nothing has been loaded yet either way.
      }
      if (parsedForTarget) {
        const decision = await _decideTarget(state, parsedForTarget, fileName);
        if (decision.exit) return decision.result;
        targetNote = decision.note || null;
      }
    }

    // Three outcomes per dwg entry, and the label reports all three: a
    // zip whose drawings did not all arrive still loads its menu, and this
    // is the only place that says which ones did not, and why.
    const outcome = { loaded: [], existing: [], skipped: [] };
    entries.filter((e) => /\.pfodDwg_json$/i.test(e.path))
           .forEach((e) => _loadDwgZipEntry(e, outcome));

    // Counts on the label, NAMES in the popup. A bundle of twenty drawings
    // loaded a second time reports twenty names, which on its own is most of
    // a 1024-byte pfod message — and the names are the part the user reads
    // once, while the count is the part worth leaving on screen.
    const notes = [];
    const groups = [];
    // Ahead of the drawing counts, because it explains them: the pins were
    // cleared for every drawing and item that just arrived.
    if (targetNote) notes.push(targetNote);
    const total = outcome.loaded.length + outcome.existing.length + outcome.skipped.length;
    if (total > 0) {
      notes.push(outcome.loaded.length + ' of ' + total + ' dwg(s) loaded from the zip');
    }
    if (outcome.loaded.length > 0) {
      groups.push({ heading: 'Loaded from the zip:', items: outcome.loaded.slice() });
    }
    if (outcome.existing.length > 0) {
      notes.push(outcome.existing.length + ' already loaded, so left unchanged — see the list');
      groups.push({ heading: 'Already in the library, left unchanged:',
                    items: outcome.existing.slice() });
    }
    if (outcome.skipped.length > 0) {
      notes.push(outcome.skipped.length + ' zip entry(s) were not a valid dwg — see the console');
    }

    const menuText = new TextDecoder().decode(menuEntry.data);
    // targetChecked: asked above, before the drawings — do not ask again.
    return _ingestText(state, menuText, fileName, notes, true, groups);
  }

  /// Create a hidden <input type="file">, click it, and call settle()
  /// exactly once with a {pfod, skipSave} object when done.
  ///
  /// One picker, offering BOTH shapes, because the user does not
  /// necessarily know which one their design was saved as — that depends
  /// on whether it happened to link a drawing, which is a property of the
  /// design rather than a choice they made. Two buttons made them answer a
  /// question they should not have to ask, and got them a chooser with
  /// their file greyed out when they guessed wrong.
  ///
  /// The reading differs (bytes for a bundle, text for a bare json), so
  /// the extension of what was actually picked decides it — the same test
  /// every other loader here uses.
  /// @param {DesignerState} state
  /// @param {function} settle
  function _openPicker(state, settle) {
    const input  = document.createElement('input');
    input.type   = 'file';
    input.accept = '.pfodMenu_json,.zip';
    input.style.display = 'none';

    // Set the instant a file is chosen, before any reading starts — see
    // the cancel timer below.
    let picked = false;

    input.addEventListener('change', (evt) => {
      input.remove();
      const file = evt.target.files && evt.target.files[0];
      if (!file) { settle({ pfod: PFOD_EMPTY, skipSave: true }); return; }
      picked = true;

      const reader = new FileReader();
      reader.onerror = () => settle({ pfod: _errorUpdate(file.name), skipSave: true });
      if (/\.zip$/i.test(file.name)) {
        // Reading a zip is async now (a deflated entry is inflated through
        // DecompressionStream), so this settles when the work finishes
        // rather than returning a value to settle directly.
        reader.onload = () => { _ingestZip(state, reader.result, file.name).then(settle); };
        reader.readAsArrayBuffer(file);
      } else {
        // async now (it may ask which target to import against), so settle
        // when it finishes rather than handing settle() a Promise.
        reader.onload = () => {
          _ingestText(state, reader.result, file.name).then(settle);
        };
        reader.readAsText(file);
      }
    });

    // Cancel detection: picker close restores window focus.  300 ms delay
    // lets the 'change' event (which fires first) win the race on success.
    //
    // The delay alone is not enough any more, and never really was: it
    // covered the gap until 'change' fired, but settling happens later
    // still — after the file is read, and now after it is inflated too. A
    // large or slow load would have this timer declare a cancel over the
    // top of a load that was working, and settle is first-past-the-post,
    // so the result would simply be discarded. `picked` closes that: it is
    // set synchronously in the handler above, so by the time this runs it
    // is either a real cancel or a load already under way.
    const onFocus = () => {
      window.removeEventListener('focus', onFocus);
      setTimeout(() => { if (!picked) settle({ pfod: PFOD_EMPTY, skipSave: true }); }, 300);
    };
    window.addEventListener('focus', onFocus);

    document.body.appendChild(input);
    input.click();
  }

  /// Dispatch handler for 'L'.  Returns a Promise that resolves when the
  /// file picker completes (success, error, or cancel).
  ///
  /// @param {string}        rawCmd
  /// @param {DesignerState} state
  /// @param {number}        depth
  /// @returns {Promise<{pfod, skipSave}>}
  function send(rawCmd, state, depth) {
    let settled = false;
    return new Promise(resolve => {
      const settle = (obj) => { if (!settled) { settled = true; resolve(obj); } };
      _openPicker(state, settle);
    });
  }

  // Register 'X' inside the IIFE to close over _lastLoadedName.
  // When the user presses the X button (made clickable by the {;} success
  // update), load the named design and open the editMenu — unless it
  // references dwgs DwgLibrary does not hold (a bare .pfodMenu_json pick
  // has no bundled dwgs at all; a .zip's own bundled dwgs can still be
  // incomplete), in which case stay on THIS screen and reveal the
  // missing-drawings block on it with a {;}. X lives on the same {b} list
  // screen that declares those items. Same rationale as
  // selectFromMenuList.js's own _switchAndReturnMain — see
  // missingDwgPrompt.js for why a screen of its own broke the back button.
  DesignerDispatch.add('X', (rawCmd, state, depth) => {
    if (!_lastLoadedName) return PFOD_EMPTY;
    const names = DesignerState.listNames();
    if (!names.includes(_lastLoadedName)) return PFOD_EMPTY;
    state.loadNamed(_lastLoadedName);
    const reveal = DesignerMissingDwgPrompt.revealUpdate(state,
      DesignerSelectFromMenuList.hideOwnItems(state));
    if (reveal) return { pfod: reveal, skipSave: false };
    return DesignerEditMenu.send(state);
  });

  return Object.freeze({ send });
})();

// Self-register 'L' into the top-level designer dispatcher.
DesignerDispatch.add('L', DesignerLoadFromFile.send);
