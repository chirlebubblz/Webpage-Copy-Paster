/**
 * Webpage Snapshot Studio - Popup Controller
 */

document.addEventListener('DOMContentLoaded', async () => {
  const activeDomainEl = document.getElementById('active-domain');
  const pageStatusEl = document.getElementById('page-status');
  const htmlSizeEl = document.getElementById('html-size');
  const toastEl = document.getElementById('toast');
  const toastMessageEl = document.getElementById('toast-message');

  const statElementsEl = document.getElementById('stat-elements');
  const statImagesEl = document.getElementById('stat-images');
  const statLinksEl = document.getElementById('stat-links');

  // Buttons
  const btnCopyHtml = document.getElementById('btn-copy-html');
  const btnScreenshotVisible = document.getElementById('btn-screenshot-visible');
  const btnScreenshotFull = document.getElementById('btn-screenshot-full');
  const btnSingleFile = document.getElementById('btn-single-file');
  const btnSavePdf = document.getElementById('btn-save-pdf');
  const btnOpenGallery = document.getElementById('btn-open-gallery');

  let activeTab = null;

  // 1. Get active tab
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    activeTab = tabs[0];

    if (activeTab && activeTab.url) {
      const urlObj = new URL(activeTab.url);
      activeDomainEl.textContent = urlObj.hostname || activeTab.url;
      
      // Inject content script if needed or query metrics
      initializePageMetrics(activeTab.id);
    } else {
      activeDomainEl.textContent = 'Restricted page';
      pageStatusEl.textContent = 'N/A';
    }
  } catch (err) {
    console.error('Error fetching active tab:', err);
    activeDomainEl.textContent = 'Error loading tab';
  }

  /**
   * Query metrics from content script
   */
  async function initializePageMetrics(tabId) {
    try {
      const metrics = await sendMessageToTab(tabId, { action: 'GET_PAGE_METRICS' });
      if (metrics) {
        statElementsEl.textContent = metrics.totalElements || '0';
        statImagesEl.textContent = metrics.imageCount || '0';
        statLinksEl.textContent = metrics.linksCount || '0';
        
        const kbSize = (metrics.characterCount / 1024).toFixed(1);
        htmlSizeEl.textContent = `${kbSize} KB`;
      }
    } catch (e) {
      console.warn('Could not read page metrics:', e);
    }
  }

  /**
   * ⚡ 1-Click Copy Raw HTML
   */
  btnCopyHtml.addEventListener('click', async () => {
    if (!activeTab) return;
    setWorkingState(true, 'Extracting HTML...');

    try {
      const response = await sendMessageToTab(activeTab.id, { action: 'EXTRACT_RAW_HTML' });
      if (!response || !response.success) {
        throw new Error(response?.error || 'Failed to extract HTML from tab.');
      }

      // Write to Clipboard
      await navigator.clipboard.writeText(response.html);

      showToast('HTML Copied to Clipboard!');

      // Save to background history
      chrome.runtime.sendMessage({
        action: 'SAVE_SNAPSHOT_METADATA',
        snapshot: {
          type: 'RAW_HTML',
          title: response.title,
          url: response.url,
          charCount: response.length,
          previewSnippet: response.html.substring(0, 300)
        }
      });

    } catch (err) {
      showToast('Copy Failed: ' + err.message, true);
    } finally {
      setWorkingState(false);
    }
  });

  /**
   * 📸 Capture Visible Screenshot
   */
  btnScreenshotVisible.addEventListener('click', async () => {
    setWorkingState(true, 'Capturing...');

    try {
      const response = await chrome.runtime.sendMessage({ action: 'CAPTURE_VISIBLE_TAB' });
      if (!response || !response.success) {
        throw new Error(response?.error || 'Failed to capture screenshot.');
      }

      const filename = generateFilename(activeTab?.title || 'page', 'visible', 'png');
      await chrome.runtime.sendMessage({
        action: 'DOWNLOAD_FILE',
        url: response.dataUrl,
        filename: filename
      });

      showToast('Visible Screenshot Saved!');

      chrome.runtime.sendMessage({
        action: 'SAVE_SNAPSHOT_METADATA',
        snapshot: {
          type: 'SCREENSHOT_VISIBLE',
          title: activeTab?.title || 'Page Snapshot',
          url: activeTab?.url || '',
          filename: filename
        }
      });

    } catch (err) {
      showToast('Capture Failed: ' + err.message, true);
    } finally {
      setWorkingState(false);
    }
  });

  /**
   * 📸 Capture Full-Page Screenshot
   */
  btnScreenshotFull.addEventListener('click', async () => {
    if (!activeTab) return;
    setWorkingState(true, 'Scrolling & Stitching...');

    try {
      const response = await chrome.runtime.sendMessage({
        action: 'CAPTURE_FULL_PAGE',
        tabId: activeTab.id
      });

      if (!response || !response.success) {
        throw new Error(response?.error || 'Failed to stitch full-page screenshot.');
      }

      const filename = generateFilename(activeTab.title || 'page', 'full_page', 'png');
      await chrome.runtime.sendMessage({
        action: 'DOWNLOAD_FILE',
        url: response.dataUrl,
        filename: filename
      });

      showToast('Full-Page Screenshot Saved!');

      chrome.runtime.sendMessage({
        action: 'SAVE_SNAPSHOT_METADATA',
        snapshot: {
          type: 'SCREENSHOT_FULL',
          title: activeTab.title,
          url: activeTab.url,
          filename: filename
        }
      });

    } catch (err) {
      showToast('Full-Page Failed: ' + err.message, true);
    } finally {
      setWorkingState(false);
    }
  });

  /**
   * 🌐 Save Single-File HTML Archive
   */
  btnSingleFile.addEventListener('click', async () => {
    if (!activeTab) return;
    setWorkingState(true, 'Bundling Single-File HTML...');

    try {
      const response = await sendMessageToTab(activeTab.id, { action: 'GENERATE_SINGLE_FILE' });
      if (!response || !response.success) {
        throw new Error(response?.error || 'Failed to generate single-file HTML.');
      }

      const blob = new Blob([response.html], { type: 'text/html;charset=utf-8' });
      const reader = new FileReader();

      reader.onloadend = async () => {
        const dataUrl = reader.result;
        const filename = generateFilename(response.title || 'page', 'archive', 'html');

        await chrome.runtime.sendMessage({
          action: 'DOWNLOAD_FILE',
          url: dataUrl,
          filename: filename
        });

        showToast('Single-File HTML Downloaded!');

        chrome.runtime.sendMessage({
          action: 'SAVE_SNAPSHOT_METADATA',
          snapshot: {
            type: 'SINGLE_FILE_HTML',
            title: response.title,
            url: response.url,
            filename: filename,
            charCount: response.html.length
          }
        });
      };

      reader.readAsDataURL(blob);

    } catch (err) {
      showToast('Bundle Failed: ' + err.message, true);
    } finally {
      setWorkingState(false);
    }
  });

  /**
   * 📄 Print / Save PDF
   */
  btnSavePdf.addEventListener('click', async () => {
    if (!activeTab) return;
    try {
      // Trigger native browser print engine (save as PDF)
      await chrome.scripting.executeScript({
        target: { tabId: activeTab.id },
        func: () => window.print()
      });
      showToast('Print / Save PDF Triggered!');
    } catch (err) {
      showToast('PDF Export Failed: ' + err.message, true);
    }
  });

  /**
   * 📁 Open Gallery & Code Inspector
   */
  btnOpenGallery.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'OPEN_GALLERY_TAB' });
  });

  /**
   * Helper to send runtime tab message
   */
  function sendMessageToTab(tabId, message) {
    return new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(tabId, message, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });
  }

  /**
   * Show notification toast
   */
  function showToast(message, isError = false) {
    toastMessageEl.textContent = message;
    toastEl.style.backgroundColor = isError ? '#ef4444' : '#10b981';
    toastEl.classList.remove('hidden');

    setTimeout(() => {
      toastEl.classList.add('hidden');
    }, 2600);
  }

  /**
   * Update working state UI
   */
  function setWorkingState(isWorking, label = 'Working...') {
    if (isWorking) {
      pageStatusEl.textContent = label;
      pageStatusEl.classList.add('working');
    } else {
      pageStatusEl.textContent = 'Ready';
      pageStatusEl.classList.remove('working');
    }
  }

  /**
   * Generate clean formatted filename
   */
  function generateFilename(title, suffix, extension) {
    const cleanTitle = (title || 'snapshot')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '_')
      .replace(/_+/g, '_')
      .substring(0, 30);
    const dateStr = new Date().toISOString().slice(0, 10);
    return `snapshot_${cleanTitle}_${suffix}_${dateStr}.${extension}`;
  }
});
