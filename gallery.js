/**
 * Webpage Snapshot Studio - Gallery & Code Inspector Controller
 */

document.addEventListener('DOMContentLoaded', async () => {
  const snapshotListEl = document.getElementById('snapshot-list');
  const historyCountEl = document.getElementById('history-count');
  const searchInputEl = document.getElementById('search-input');
  const btnClearHistory = document.getElementById('btn-clear-history');

  const inspectorTitleEl = document.getElementById('inspector-title');
  const inspectorUrlEl = document.getElementById('inspector-url');
  const codeOutputEl = document.getElementById('code-output');
  const codeLengthEl = document.getElementById('code-length');
  const btnCopyInspectorHtml = document.getElementById('btn-copy-inspector-html');

  let allSnapshots = [];
  let currentSelected = null;

  // Load history from storage
  await loadSnapshotHistory();

  // Search Listener
  searchInputEl.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase();
    const filtered = allSnapshots.filter(s =>
      (s.title || '').toLowerCase().includes(query) ||
      (s.url || '').toLowerCase().includes(query)
    );
    renderList(filtered);
  });

  // Clear History Listener
  btnClearHistory.addEventListener('click', async () => {
    if (confirm('Are you sure you want to clear all snapshot history?')) {
      await chrome.storage.local.set({ snapshots: [] });
      allSnapshots = [];
      renderList([]);
      resetInspector();
    }
  });

  // Copy Inspector HTML
  btnCopyInspectorHtml.addEventListener('click', async () => {
    if (currentSelected && currentSelected.previewSnippet) {
      await navigator.clipboard.writeText(currentSelected.previewSnippet);
      const originalText = btnCopyInspectorHtml.querySelector('span').textContent;
      btnCopyInspectorHtml.querySelector('span').textContent = 'Copied!';
      setTimeout(() => {
        btnCopyInspectorHtml.querySelector('span').textContent = originalText;
      }, 2000);
    }
  });

  /**
   * Load history from chrome.storage.local
   */
  async function loadSnapshotHistory() {
    try {
      const response = await chrome.runtime.sendMessage({ action: 'GET_SNAPSHOT_HISTORY' });
      allSnapshots = response?.snapshots || [];
      historyCountEl.textContent = `${allSnapshots.length} items`;
      renderList(allSnapshots);

      // Select first item automatically if available
      if (allSnapshots.length > 0) {
        selectItem(allSnapshots[0]);
      }
    } catch (err) {
      console.error('Failed to load snapshot history:', err);
    }
  }

  /**
   * Render sidebar item list
   */
  function renderList(items) {
    snapshotListEl.innerHTML = '';

    if (items.length === 0) {
      snapshotListEl.innerHTML = `
        <div class="empty-state">
          <p>No snapshots found.</p>
          <small>Use the extension popup on any webpage to take snapshots!</small>
        </div>`;
      return;
    }

    items.forEach(item => {
      const card = document.createElement('div');
      card.className = `snapshot-item ${currentSelected?.id === item.id ? 'active' : ''}`;
      
      const dateStr = item.timestamp ? new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';

      card.innerHTML = `
        <div class="item-title">${escapeHtml(item.title || 'Untitled Page')}</div>
        <div class="item-meta">
          <span class="type-tag">${formatTypeTag(item.type)}</span>
          <span>${dateStr}</span>
        </div>`;

      card.addEventListener('click', () => {
        document.querySelectorAll('.snapshot-item').forEach(el => el.classList.remove('active'));
        card.classList.add('active');
        selectItem(item);
      });

      snapshotListEl.appendChild(card);
    });
  }

  /**
   * Select and display snapshot details in Inspector
   */
  function selectItem(item) {
    currentSelected = item;
    inspectorTitleEl.textContent = item.title || 'Untitled Page';
    inspectorUrlEl.textContent = item.url || '--';

    if (item.previewSnippet) {
      codeOutputEl.textContent = item.previewSnippet;
      codeLengthEl.textContent = `${item.charCount || item.previewSnippet.length} characters`;
      btnCopyInspectorHtml.classList.remove('hidden');
    } else {
      codeOutputEl.textContent = `Snapshot Type: ${item.type}\nFilename: ${item.filename || 'N/A'}\nURL: ${item.url}`;
      codeLengthEl.textContent = '0 chars';
      btnCopyInspectorHtml.classList.add('hidden');
    }
  }

  function resetInspector() {
    currentSelected = null;
    inspectorTitleEl.textContent = 'Select a snapshot from the history';
    inspectorUrlEl.textContent = '--';
    codeOutputEl.textContent = 'Select a capture from the list on the left to inspect its HTML content.';
    codeLengthEl.textContent = '0 chars';
    btnCopyInspectorHtml.classList.add('hidden');
  }

  function formatTypeTag(type) {
    switch (type) {
      case 'RAW_HTML': return 'RAW HTML';
      case 'SCREENSHOT_VISIBLE': return 'PNG SCREENSHOT';
      case 'SCREENSHOT_FULL': return 'FULL PAGE PNG';
      case 'SINGLE_FILE_HTML': return 'SINGLEFILE HTML';
      default: return type || 'SNAPSHOT';
    }
  }

  function escapeHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
});
