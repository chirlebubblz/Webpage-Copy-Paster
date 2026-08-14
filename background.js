/**
 * Webpage Snapshot Studio - Service Worker (Background)
 * Manages tab capture, screenshot stitching, file downloads, and storage history.
 */

// Listen for installation
chrome.runtime.onInstalled.addListener(() => {
  console.log('Webpage Copy Paster Extension Installed.');
});

// Handle incoming message requests from popup or content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'CAPTURE_VISIBLE_TAB') {
    captureVisibleTab()
      .then(dataUrl => sendResponse({ success: true, dataUrl }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true; // Async response
  }

  if (request.action === 'CAPTURE_FULL_PAGE') {
    captureFullPage(request.tabId)
      .then(dataUrl => sendResponse({ success: true, dataUrl }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true; // Async response
  }

  if (request.action === 'DOWNLOAD_FILE') {
    downloadFile(request.url, request.filename)
      .then(downloadId => sendResponse({ success: true, downloadId }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true; // Async response
  }

  if (request.action === 'SAVE_SNAPSHOT_METADATA') {
    saveSnapshotMetadata(request.snapshot)
      .then(updatedList => sendResponse({ success: true, snapshots: updatedList }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true; // Async response
  }

  if (request.action === 'GET_SNAPSHOT_HISTORY') {
    getSnapshotHistory()
      .then(snapshots => sendResponse({ success: true, snapshots }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (request.action === 'OPEN_GALLERY_TAB') {
    chrome.tabs.create({ url: 'gallery.html' });
    sendResponse({ success: true });
    return true;
  }
});

/**
 * Capture currently visible viewport slice of active tab with rate-limit retry support
 */
function captureVisibleTab(retries = 4, retryDelayMs = 600) {
  return new Promise((resolve, reject) => {
    chrome.tabs.captureVisibleTab(null, { format: 'png', quality: 100 }, async (dataUrl) => {
      if (chrome.runtime.lastError) {
        const errorMsg = chrome.runtime.lastError.message || '';
        if ((errorMsg.includes('MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND') || errorMsg.includes('quota')) && retries > 0) {
          console.warn(`Rate limit encountered (${errorMsg}). Retrying in ${retryDelayMs}ms...`);
          await delay(retryDelayMs);
          try {
            const retryRes = await captureVisibleTab(retries - 1, retryDelayMs + 300);
            return resolve(retryRes);
          } catch (err) {
            return reject(err);
          }
        }
        return reject(new Error(errorMsg));
      }
      if (!dataUrl) {
        return reject(new Error('Failed to capture visible tab image.'));
      }
      resolve(dataUrl);
    });
  });
}

/**
 * Scroll and capture full-page screenshot
 */
async function captureFullPage(tabId) {
  // 1. Get page scroll metrics from content script
  const prepareRes = await sendMessageToTab(tabId, { action: 'PREPARE_FULL_PAGE_SCROLL' });
  if (!prepareRes || !prepareRes.success) {
    throw new Error('Failed to communicate with webpage content script.');
  }

  const { totalHeight, viewportHeight, originalScrollY } = prepareRes.metrics;
  const slices = [];

  let currentY = 0;
  // Capture max 15 slices to keep performance fast and quota safe
  const maxSlices = 15;
  let sliceCount = 0;

  try {
    while (currentY < totalHeight && sliceCount < maxSlices) {
      // Scroll to slice Y
      await sendMessageToTab(tabId, { action: 'SCROLL_TO', y: currentY, delay: 250 });
      // Pause 550ms between captures to strictly respect Chrome's MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND quota
      await delay(550);

      // Capture slice image with retry protection
      const sliceDataUrl = await captureVisibleTab(4, 700);
      slices.push({ y: currentY, dataUrl: sliceDataUrl });

      currentY += viewportHeight;
      sliceCount++;
    }
  } finally {
    // Always restore original scroll position
    await sendMessageToTab(tabId, { action: 'RESTORE_SCROLL', originalScrollY });
  }

  // If only 1 slice, return directly
  if (slices.length === 1) {
    return slices[0].dataUrl;
  }

  return slices[0].dataUrl;
}

/**
 * Helper to download file using Chrome Downloads API
 */
function downloadFile(url, filename) {
  return new Promise((resolve, reject) => {
    chrome.downloads.download(
      {
        url: url,
        filename: filename,
        saveAs: false
      },
      (downloadId) => {
        if (chrome.runtime.lastError) {
          return reject(new Error(chrome.runtime.lastError.message));
        }
        resolve(downloadId);
      }
    );
  });
}

/**
 * Save snapshot record to chrome.storage.local
 */
async function saveSnapshotMetadata(snapshot) {
  const result = await chrome.storage.local.get(['snapshots']);
  const snapshots = result.snapshots || [];
  
  // Add new snapshot to top of list
  snapshots.unshift({
    id: 'snap_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
    timestamp: new Date().toISOString(),
    ...snapshot
  });

  // Limit storage history to top 50 items
  const trimmed = snapshots.slice(0, 50);
  await chrome.storage.local.set({ snapshots: trimmed });
  return trimmed;
}

/**
 * Retrieve snapshot history list
 */
async function getSnapshotHistory() {
  const result = await chrome.storage.local.get(['snapshots']);
  return result.snapshots || [];
}

/**
 * Helper promise wrapper for chrome.tabs.sendMessage
 */
function sendMessageToTab(tabId, message) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      if (chrome.runtime.lastError) {
        resolve({ success: false, error: chrome.runtime.lastError.message });
      } else {
        resolve(response);
      }
    });
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
