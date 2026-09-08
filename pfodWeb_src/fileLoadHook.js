/*
 * fileLoadHook.js
 *
 * Lets a script — in practice an AI driving the page through browser
 * automation — supply the contents of a menu/dwg file WITHOUT the native
 * OS file-open dialog ever appearing.
 *
 * Why this exists
 * ---------------
 * Every load path in the designer ends in a hidden <input type="file">
 * and an input.click():
 *
 *   designer/menus/loadFromFile.js       {L}  Load Design from File
 *   designer/menus/missingDwgPrompt.js        Load Several Dwgs / Load next dwg
 *   designer/menus/selectDwgForItem.js        Load Dwg from file… for an item
 *   dwgDesigner/dwgControlsPanelUI.js         Load Dwg, Load Several Dwgs,
 *                                             and the missing-insertDwg prompt
 *
 * That click opens a NATIVE dialog. Browser automation drives the page's
 * DOM; it cannot reach a native dialog, so every one of those buttons is a
 * dead end — and the dialog is modal, so the session is stuck until a human
 * dismisses it.
 *
 * How it works
 * ------------
 * HTMLInputElement.prototype.click is wrapped ONCE, here. The wrapper is
 * inert unless files have been armed: a normal user's click falls straight
 * through to the real click(), so nothing about the app changes for them.
 *
 * When files ARE armed and a file input is clicked, the wrapper instead
 * puts them on that input (via DataTransfer, the only way to set
 * input.files from script) and dispatches 'change'. From there the app's
 * own code runs completely unchanged — same FileReader, same validation,
 * same repair, same dedup, same screens. Nothing about the load is
 * reimplemented here, which is the point: what gets tested through the hook
 * is the real load path, not a parallel one.
 *
 * It is also where anything else automation needs and the UI deliberately
 * does not offer goes — currently deleteAllDwgs(), for the
 * edit-rebuild-reload loop. See its own doc for why that is not a button.
 *
 * Usage from the browser console / automation:
 *
 *   pfodWebFileHook.arm({ name: 'LedOn.pfodDwg_json', text: '{...}' });
 *   // then click the real Load Dwg button in the UI
 *
 *   pfodWebFileHook.arm([ {name, text}, {name, text} ]);  // multi-file
 *   await pfodWebFileHook.armFromUrls(['json/LedOn.pfodDwg_json']);
 *
 * A single-file input takes one armed file per click and leaves the rest
 * queued for the next one; a `multiple` input takes them all. So the
 * "Load next dwg" style of flow — click, load one, click again — works by
 * arming the whole set once and then pressing the button repeatedly.
 *
 * Binary files (a .zip design bundle) are armed as base64 rather than text.
 *
 * (c)2026 Forward Computing and Control Pty. Ltd.
 * NSW Australia, www.forward.com.au
 */

const PfodWebFileHook = (() => {

  // Files armed for upcoming file-input clicks, oldest first. Consumed by
  // _takeFiles(); an empty queue means the wrapper below does nothing at
  // all, which is the state a real user is always in.
  let _queue = [];

  /// Decode a base64 string into the byte array a File can be built from.
  /// Used for binary arms (.zip design bundles); text arms skip this.
  /// @param {string} b64
  /// @returns {Uint8Array}
  function _bytesFromBase64(b64) {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  /// Build a real File object from one arm descriptor.
  ///
  /// The MIME type is chosen from the extension only so the File looks
  /// like what the OS dialog would have produced; nothing in the app
  /// reads it (every load path goes by extension and by the file's own
  /// content), so a wrong guess here is harmless.
  ///
  /// @param {{name: string, text?: string, base64?: string}} spec
  /// @returns {File}
  function _toFile(spec) {
    if (!spec || !spec.name) throw new Error('pfodWebFileHook: each file needs a name');
    const isZip = /\.zip$/i.test(spec.name);
    const body = (typeof spec.base64 === 'string')
               ? _bytesFromBase64(spec.base64)
               : String(spec.text === undefined ? '' : spec.text);
    return new File([body], spec.name,
      { type: isZip ? 'application/zip' : 'application/json' });
  }

  /// Pull the files one click should receive.  A `multiple` input takes
  /// everything armed — that is what "Load Several Dwgs" is for — and a
  /// single-file input takes one, leaving the rest for the next click.
  /// @param {HTMLInputElement} input
  /// @returns {File[]}
  function _takeFiles(input) {
    return input.multiple ? _queue.splice(0, _queue.length) : _queue.splice(0, 1);
  }

  /// Put `files` onto `input` and tell the page they arrived.
  ///
  /// input.files is read-only to assignment of a plain array; a
  /// DataTransfer's own FileList is the one value it accepts. The 'change'
  /// event is dispatched with bubbles:true so both listener styles in use
  /// here see it — addEventListener('change', …) in loadFromFile.js and
  /// the input.onchange = … property in dwgControlsPanelUI.js.
  ///
  /// @param {HTMLInputElement} input
  /// @param {File[]} files
  function _deliver(input, files) {
    const dt = new DataTransfer();
    files.forEach((f) => dt.items.add(f));
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  /// Wrap HTMLInputElement.prototype.click once, so every file picker in
  /// the app is covered without any of them knowing about this file.
  ///
  /// The wrapper defers to the real click() for everything except a file
  /// input clicked while files are armed — so a normal session never
  /// takes the substitute path, and a non-file input (a button, a
  /// checkbox) is never touched at all.
  function _install() {
    const realClick = HTMLInputElement.prototype.click;
    HTMLInputElement.prototype.click = function patchedClick() {
      if (this.type === 'file' && _queue.length > 0) {
        const files = _takeFiles(this);
        if (files.length > 0) {
          console.log('[pfodWebFileHook] supplying ' + files.length + ' file(s) to <input' +
            (this.id ? ' id="' + this.id + '"' : '') + '> instead of opening the file dialog: ' +
            files.map((f) => f.name).join(', '));
          _deliver(this, files);
          return;
        }
      }
      return realClick.call(this);
    };
  }

  /// Arm one file, or several, for the next file-picker click(s).
  ///
  /// @param {object|Array<object>} spec  {name, text} or {name, base64},
  ///        or an array of them
  /// @returns {number} how many files are now armed in total
  function arm(spec) {
    const list = Array.isArray(spec) ? spec : [spec];
    list.forEach((s) => _queue.push(_toFile(s)));
    console.log('[pfodWebFileHook] armed ' + list.length + ' file(s); ' +
      _queue.length + ' now queued: ' + _queue.map((f) => f.name).join(', '));
    return _queue.length;
  }

  /// Fetch each URL and arm what comes back, keeping the order given.
  ///
  /// Convenience for the common case of pointing at files pfodWebServer is
  /// already serving, so the caller does not have to inline a whole design
  /// as a JS string. Only usable when the page itself was served over
  /// http(s) — a file:// page cannot fetch its siblings — in which case
  /// use arm() with the content instead.
  ///
  /// The name is taken from the URL's last path segment, since that is
  /// what the OS dialog would have reported.
  ///
  /// @param {string|Array<string>} urls
  /// @returns {Promise<number>} total armed, once every fetch has finished
  function armFromUrls(urls) {
    const list = Array.isArray(urls) ? urls : [urls];
    return Promise.all(list.map((url) =>
      fetch(url).then((resp) => {
        if (!resp.ok) throw new Error('pfodWebFileHook: ' + url + ' → HTTP ' + resp.status);
        return resp.arrayBuffer().then((buf) => ({ url, buf }));
      })
    )).then((results) => {
      results.forEach(({ url, buf }) => {
        const name = url.split(/[?#]/)[0].split('/').pop() || 'file';
        _queue.push(new File([buf], name, {
          type: /\.zip$/i.test(name) ? 'application/zip' : 'application/json',
        }));
      });
      console.log('[pfodWebFileHook] armed ' + results.length + ' file(s) from URL; ' +
        _queue.length + ' now queued: ' + _queue.map((f) => f.name).join(', '));
      return _queue.length;
    });
  }

  /// Names still armed, in the order they will be handed out — so a
  /// caller can check what a click is about to pick up.
  /// @returns {string[]}
  function armed() {
    return _queue.map((f) => f.name);
  }

  /// Drop everything armed. Leaves the wrapper installed and inert, which
  /// is the same as never having armed anything.
  /// @returns {number} how many were discarded
  function clear() {
    const n = _queue.length;
    _queue = [];
    return n;
  }

  /// The drawings nothing else inserts — the roots of the insertDwg forest.
  ///
  /// A snapshot design lists one Drawing item per root, so opening it shows
  /// every drawing that is not already part of another. Listing all of them
  /// instead would show each inserted drawing twice: once on its own and
  /// once inside its parent.
  ///
  /// If every drawing is inserted by some other — only possible with a
  /// reference cycle — there is no root, so fall back to listing them all
  /// rather than producing a design with no items.
  /// @param {string[]} names
  /// @returns {string[]}
  function _topLevelDwgs(names) {
    const inserted = new Set();
    names.forEach((n) => {
      const dwg = DwgLibrary.get(n);
      ((dwg && dwg.items) || []).forEach((item) => {
        if (item && item.type === 'insertDwg' && item.drawingName) {
          inserted.add(item.drawingName);
        }
      });
    });
    const roots = names.filter((n) => !inserted.has(n));
    return roots.length > 0 ? roots : names.slice();
  }

  /// Hand `bytes` to the browser as a download called `name`.
  ///
  /// Deliberately NOT DesignerZipBuilder.triggerDownload, which is what
  /// every other zip in the app goes through: on Windows that one throws a
  /// full-screen "right-click → Properties → Unblock" overlay up over the
  /// page and waits for an OK click. That is fine for a person who just
  /// pressed a button, and useless here — this hook exists because
  /// automation cannot dismiss things, and a snapshot it did not ask for
  /// blocking the page would be worse than no snapshot.
  ///
  /// revokeObjectURL is deferred: revoking synchronously after .click()
  /// races with some browsers and produces an empty file.
  /// @param {string} name — full file name, extension included
  /// @param {Uint8Array} bytes
  function _download(name, bytes) {
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/zip' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /// Download every drawing in the library as one design bundle, so a
  /// delete can be undone by loading the file back.
  ///
  /// An ordinary `_menuJson.zip` — the same shape Save Design and Save Dwg
  /// write, built by the same function — so it goes back in through Load
  /// Dwg or Load Design from File with no special handling. Its root is a
  /// trivial design listing every top-level drawing, which is what makes it
  /// a design bundle rather than a bag of files.
  ///
  /// @param {string[]} names — every drawing in the library
  /// @returns {string} the downloaded file's name
  function _snapshot(names) {
    const stamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
    const fileName = 'AllDwgs_' + stamp;
    const wrapper = DwgArduinoExport.buildWrapperMenuJSON(_topLevelDwgs(names), fileName);
    const bundle = DesignerSaveToFile.buildBundleFrom(fileName, wrapper, names);
    _download(bundle.name, bundle.bytes);
    return bundle.name;
  }

  /// Remove EVERY drawing from DwgLibrary, and say which ones went.
  ///
  /// This exists for the edit-rebuild-reload loop, and only for it. No
  /// loader in this app overwrites a drawing that is already loaded — a
  /// colliding name is left exactly as it is — which is right for a person
  /// (it is usually their own edited copy) and a trap for a script: load a
  /// rebuilt bundle a second time and you silently keep the OLD drawings
  /// while the design arrives beside its predecessor as "<name>_2". The
  /// screen looks like it worked.
  ///
  /// So: clear, then load. Doing that one drawing at a time through the
  /// panel means a click and a downloaded backup file per drawing, which
  /// is noise when the next action is loading fresh ones.
  ///
  /// DELIBERATELY NOT A BUTTON. Wiping the library in one press, with no
  /// confirmation and no backup, is not something to leave sitting in the
  /// UI next to Create Dwg — the panel's own per-row delete stays the way
  /// a person removes a drawing, and it saves a copy out first. This is
  /// reachable only from the console, by something that meant to type it.
  ///
  /// A SNAPSHOT IS SAVED FIRST. The library is where a drawing edited in
  /// this session lives, and often the only place — the panel's per-row
  /// delete downloads a copy on the way out for exactly that reason, and a
  /// call that wipes everything at once has more to lose, not less. So one
  /// `AllDwgs_<stamp>_menuJson.zip` holding every drawing lands in the
  /// download folder before anything is removed, and loading it back
  /// restores the lot. Nothing else is downloaded per drawing.
  ///
  /// If the snapshot cannot be written the delete does NOT happen — losing
  /// the library is the one outcome worth refusing, and a caller that got
  /// an exception instead of an empty array knows where it stands.
  ///
  /// Designs are untouched — this clears drawings only.
  ///
  /// The panel does not repaint by itself; it shows the change on its next
  /// render (any row click, or leaving and re-entering the screen).
  ///
  /// @returns {string[]} the names removed, in library order
  function deleteAllDwgs() {
    const names = DwgLibrary.listNames();
    if (names.length === 0) {
      console.log('[pfodWebFileHook] deleted 0 drawing(s): the library was already empty');
      return names;
    }
    // Before, not after: a snapshot of a library that has just been
    // emptied is an empty snapshot.
    const saved = _snapshot(names);
    names.forEach((n) => DwgLibrary.remove(n));
    console.log('[pfodWebFileHook] saved "' + saved + '", then deleted ' +
      names.length + ' drawing(s): ' + names.join(', '));
    return names;
  }

  _install();

  return Object.freeze({ arm, armFromUrls, armed, clear, deleteAllDwgs });
})();

// The name the console / automation reaches it by.
window.pfodWebFileHook = PfodWebFileHook;
