/*
 * detailsPopup.js
 * (c)2026 Forward Computing and Control Pty. Ltd.
 * NSW Australia, www.forward.com.au
 * This code is not warranted to be fit for any purpose. You may only use it at your own risk.
 * This generated code may be freely used for both private and commercial use
 * provided this copyright is maintained.
 */

// Exports:    window.DesignerDetailsPopup
// Depends on: nothing but the DOM
// Called by:  designer/menus/loadFromFile.js
//
// A scrollable list of "here is everything that just happened to your
// design", shown next to the one-line summary that stays on screen.
//
// WHY NOT ON THE pfod LABEL
// -------------------------
// It used to all go on the load screen's status label, which is a pfod
// message — and a pfod message is capped at 1024 BYTES by the protocol.
// Loading an Arduino UNO design onto an ESP32 re-derives every ADC range
// and every chart plot scale, so a small design produced a dozen lines and
// the label arrived truncated mid-word:
//
//   ...re-derived to ""3.3"" for ""FireBeetle 2 ESP32-E""; rootMenu.items[6]
//   .plots[2].displayMax: ""5.0"" was set for ""Arduino UNO"" — re-derive}
//
// The list is also the wrong shape for a label: it is per-field, it can run
// to any length, and the user wants to read it once and carry on. So the
// summary stays on the label — where it survives, and where browser
// automation can read it — and the detail comes here, in a box that
// scrolls.
//
// WHY IT IS NOT A pfodAlert
// -------------------------
// Same reason the load notice stopped being one: pfodAlert takes a single
// string, wraps nothing, and scrolls not at all.

const DesignerDetailsPopup = (() => {

  const OVERLAY_ID = 'designer-details-popup';

  /// Show `lines` under `title`, in a modal the user dismisses.
  ///
  /// Re-entrant: a second call replaces the modal already up rather than
  /// stacking a second one over it, because two of these can only ever be
  /// about the same load.
  ///
  /// @param {string} title — what this list is about, e.g. the design name
  /// @param {string} intro — one sentence above the list; '' for none
  /// @param {Array<string|{heading: string, items: string[]}>} lines —
  ///        a plain line, or a headed group of them. Groups exist because
  ///        one load can report two unrelated things at once — twenty
  ///        drawings left alone AND a dozen fields re-derived — and a flat
  ///        list of thirty-odd lines makes the reader work out which is
  ///        which from the wording.
  /// @returns {boolean} true when a modal was shown (false for an empty
  ///          list, so the caller can tell whether to mention it)
  function show(title, intro, lines) {
    const items = (lines || []).filter((l) =>
      (l && typeof l === 'object')
        ? (l.items || []).filter((i) => String(i).trim() !== '').length > 0
        : String(l).trim() !== '');
    if (items.length === 0) return false;
    if (typeof document === 'undefined') return false;

    const old = document.getElementById(OVERLAY_ID);
    if (old && old.parentNode) old.parentNode.removeChild(old);

    const overlay = document.createElement('div');
    overlay.id = OVERLAY_ID;
    overlay.style.cssText =
      'position:fixed;top:0;left:0;width:100%;height:100%;' +
      'background-color:rgba(0,0,0,0.5);display:flex;align-items:flex-start;' +
      'justify-content:center;padding-top:80px;z-index:10001;';

    const modal = document.createElement('div');
    modal.style.cssText =
      'background-color:white;border-radius:10px;' +
      'box-shadow:0 4px 20px rgba(0,0,0,0.3);max-width:640px;width:92%;' +
      'max-height:70vh;display:flex;flex-direction:column;overflow:hidden;';

    const titleBar = document.createElement('div');
    titleBar.style.cssText =
      'background-color:#4CAF50;color:white;padding:15px 20px;font-size:18px;' +
      'font-weight:bold;font-family:Arial, sans-serif;flex:0 0 auto;';
    titleBar.textContent = title;

    // The scrolling part, and the only part that grows: the title bar and
    // the button stay put so Close is always reachable however long the
    // list is.
    const body = document.createElement('div');
    body.style.cssText =
      'padding:16px 20px;font-family:Arial, sans-serif;font-size:13px;' +
      'line-height:1.5;color:#333;overflow-y:auto;flex:1 1 auto;';

    if (intro) {
      const p = document.createElement('p');
      p.style.cssText = 'margin:0 0 12px 0;font-weight:bold;';
      p.textContent = intro;
      body.appendChild(p);
    }

    // textContent throughout, never innerHTML: every one of these lines
    // quotes a drawing name, a board name or a field value that came out of
    // a loaded file.
    const bullets = (into, entries) => {
      const list = document.createElement('ul');
      list.style.cssText = 'margin:0;padding-left:20px;';
      entries.forEach((line) => {
        if (String(line).trim() === '') return;
        const li = document.createElement('li');
        li.textContent = String(line);
        li.style.cssText = 'margin:0 0 6px 0;word-break:break-word;';
        list.appendChild(li);
      });
      into.appendChild(list);
    };

    const plain = [];
    const groups = [];
    items.forEach((l) => ((l && typeof l === 'object') ? groups : plain).push(l));
    if (plain.length > 0) bullets(body, plain);
    groups.forEach((g) => {
      const h = document.createElement('p');
      h.style.cssText = 'margin:14px 0 6px 0;font-weight:bold;';
      h.textContent = g.heading;
      body.appendChild(h);
      bullets(body, g.items);
    });

    const buttons = document.createElement('div');
    buttons.style.cssText =
      'padding:12px 20px 16px 20px;text-align:center;flex:0 0 auto;';
    const close = document.createElement('button');
    close.textContent = 'Close';
    close.style.cssText =
      'padding:10px 22px;border-radius:5px;font-size:15px;font-weight:bold;' +
      'cursor:pointer;font-family:Arial, sans-serif;border:none;' +
      'background-color:#4CAF50;color:white;';
    close.onclick = () => { if (overlay.parentNode) document.body.removeChild(overlay); };
    buttons.appendChild(close);

    modal.appendChild(titleBar);
    modal.appendChild(body);
    modal.appendChild(buttons);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    return true;
  }

  return Object.freeze({ show });
})();

window.DesignerDetailsPopup = DesignerDetailsPopup;
