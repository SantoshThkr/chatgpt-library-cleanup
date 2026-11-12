// ==UserScript==
// @name         ChatGPT Library Cleanup Helper
// @namespace    local.chatgpt.library.cleanup
// @version      1.0.0
// @description  Selects small, controlled batches in ChatGPT Library. You click ChatGPT's own Delete button.
// @match        https://chatgpt.com/library*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(() => {
  'use strict';

  const PANEL_ID = 'library-cleanup-helper';
  if (document.getElementById(PANEL_ID)) return;

  let batchSize = 5;
  let busy = false;
  let lastSelectedNames = [];
  let lastToast = '';
  let observer;

  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const rows = () => [...document.querySelectorAll('[data-library-item]')];
  const checkbox = row => row.querySelector('[role="checkbox"]');
  const title = row => row.querySelector('[data-library-item-title]')?.textContent?.trim()
    || checkbox(row)?.getAttribute('aria-label')?.replace(/^Select\s+/i, '')
    || 'Untitled item';

  function setStatus(message, kind = 'normal') {
    const el = panel.querySelector('#lch-status');
    if (!el) return;
    el.textContent = message;
    el.style.color = kind === 'error' ? '#ff7777' : kind === 'ok' ? '#70d99a' : '#ddd';
  }

  function updateCounts() {
    const all = rows();
    const selected = all.filter(row => checkbox(row)?.getAttribute('aria-checked') === 'true').length;
    panel.querySelector('#lch-visible').textContent = String(all.length);
    panel.querySelector('#lch-selected').textContent = String(selected);
    panel.querySelector('#lch-batch').textContent = String(batchSize);
  }

  async function clearSelection() {
    if (busy) return;
    busy = true;
    try {
      const selected = rows().map(checkbox).filter(el => el?.getAttribute('aria-checked') === 'true');
      for (const el of selected) {
        el.click();
        await sleep(100);
      }
      setStatus('Selection cleared. No files were deleted.', 'ok');
    } finally {
      busy = false;
      updateCounts();
    }
  }

  async function selectBatch() {
    if (busy) return;
    busy = true;
    try {
      // First clear any previous selection, including stale selections from an earlier attempt.
      const already = rows().map(checkbox).filter(el => el?.getAttribute('aria-checked') === 'true');
      for (const el of already) {
        el.click();
        await sleep(120);
      }

      const candidates = rows()
        .filter(row => {
          const cb = checkbox(row);
          return cb && cb.getAttribute('aria-checked') !== 'true' && !cb.disabled;
        })
        .slice(0, batchSize);

      if (!candidates.length) {
        setStatus('No unselected visible items found. Scroll the Library list to load more.', 'error');
        return;
      }

      lastSelectedNames = candidates.map(title);
      for (const row of candidates) {
        const cb = checkbox(row);
        if (cb && cb.getAttribute('aria-checked') !== 'true') cb.click();
        await sleep(180);
      }

      await sleep(400);
      const selectedNow = rows().filter(row => checkbox(row)?.getAttribute('aria-checked') === 'true').length;
      if (selectedNow !== candidates.length) {
        setStatus(`Expected ${candidates.length} selected, but page shows ${selectedNow}. Stop and refresh before deleting.`, 'error');
      } else {
        setStatus(`${selectedNow} selected. Review the highlighted rows, then click ChatGPT's native Delete button.`, 'ok');
      }
    } finally {
      busy = false;
      updateCounts();
    }
  }

  function findDeleteButton() {
    return [...document.querySelectorAll('button')].find(button => {
      const label = `${button.getAttribute('aria-label') || ''} ${button.textContent || ''}`.trim();
      return /^delete$/i.test(label);
    });
  }

  function monitor() {
    if (observer) observer.disconnect();
    observer = new MutationObserver(() => {
      updateCounts();
      const text = document.body.innerText || '';
      const failure = text.match(/Failed to delete item(?:s)?/i);
      if (failure && text !== lastToast) {
        lastToast = text;
        setStatus('ChatGPT reported a deletion failure. Stop here; do not select another batch.', 'error');
      }
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true });
  }

  const panel = document.createElement('section');
  panel.id = PANEL_ID;
  panel.innerHTML = `
    <div id="lch-head">
      <strong>Library Cleanup Helper</strong>
      <button id="lch-close" title="Close">×</button>
    </div>
    <div class="lch-grid">
      <label>Batch size
        <select id="lch-size">
          <option value="5" selected>5 files</option>
          <option value="10">10 files</option>
          <option value="20">20 files</option>
        </select>
      </label>
      <div>Visible rows <b id="lch-visible">0</b></div>
      <div>Selected <b id="lch-selected">0</b></div>
      <div>Batch <b id="lch-batch">5</b></div>
    </div>
    <button id="lch-select" class="lch-primary">Select next batch</button>
    <button id="lch-clear">Clear selection</button>
    <p id="lch-status">Ready. Start with 5 files. This helper does not click Delete.</p>
    <small>After selecting, review the highlighted files and use ChatGPT's own Delete button. Wait for the list to update before selecting another batch.</small>
  `;
  const style = document.createElement('style');
  style.textContent = `
    #${PANEL_ID}{position:fixed;z-index:999999;right:22px;top:145px;width:285px;padding:14px;background:#202123;color:#f4f4f5;border:1px solid #555;border-radius:12px;box-shadow:0 8px 30px #0009;font:13px/1.4 system-ui,sans-serif}
    #${PANEL_ID} *{box-sizing:border-box}
    #${PANEL_ID} #lch-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;font-size:14px}
    #${PANEL_ID} button,#${PANEL_ID} select{font:inherit;border-radius:7px;padding:8px;border:1px solid #666;background:#343541;color:#fff;cursor:pointer}
    #${PANEL_ID} button{width:100%;margin:4px 0}
    #${PANEL_ID} #lch-close{width:28px;padding:2px;margin:0;font-size:18px}
    #${PANEL_ID} .lch-primary{background:#2563eb;border-color:#2563eb}
    #${PANEL_ID} .lch-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px}
    #${PANEL_ID} .lch-grid label{display:flex;flex-direction:column;gap:3px}
    #${PANEL_ID} .lch-grid b{margin-left:5px}
    #${PANEL_ID} p{margin:10px 0;color:#ddd;min-height:36px}
    #${PANEL_ID} small{display:block;color:#aaa;font-size:11px}
  `;
  document.documentElement.append(style, panel);

  panel.querySelector('#lch-size').addEventListener('change', event => {
    batchSize = Number(event.target.value);
    updateCounts();
  });
  panel.querySelector('#lch-select').addEventListener('click', selectBatch);
  panel.querySelector('#lch-clear').addEventListener('click', clearSelection);
  panel.querySelector('#lch-close').addEventListener('click', () => {
    observer?.disconnect();
    panel.remove();
    style.remove();
  });

  monitor();
  updateCounts();
  setStatus('Ready. Start with 5 files. This helper does not click Delete.');
})();
