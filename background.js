/**
 * Webpage Copy Paster - Service Worker (Background)
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
 * Scroll and capture full-page screenshot with OffscreenCanvas stitching
 */
async function captureFullPage(tabId) {
  // 1. Get page scroll metrics from content script
  const prepareRes = await sendMessageToTab(tabId, { action: 'PREPARE_FULL_PAGE_SCROLL' });
  if (!prepareRes || !prepareRes.success) {
    throw new Error('Failed to communicate with webpage content script.');
  }

  const { totalHeight, viewportHeight, viewportWidth, devicePixelRatio, originalScrollY } = prepareRes.metrics;
  const slices = [];

  let currentY = 0;
  // Allow up to 40 scroll slices for long pages
  const maxSlices = 40;
  let sliceCount = 0;

  try {
    while (currentY < totalHeight && sliceCount < maxSlices) {
      // Scroll to slice Y
      await sendMessageToTab(tabId, { action: 'SCROLL_TO', y: currentY, delay: 250 });
      // Pause 400ms between captures to strictly respect Chrome rate limit quota
      await delay(400);

      // Capture slice image with retry protection
      const sliceDataUrl = await captureVisibleTab(4, 600);
      slices.push({ y: currentY, dataUrl: sliceDataUrl });

      currentY += viewportHeight;
      sliceCount++;
    }
  } finally {
    // Always restore original scroll position
    await sendMessageToTab(tabId, { action: 'RESTORE_SCROLL', originalScrollY });
  }

  // 2. Stitch all captured slices into one complete full-page PNG image via OffscreenCanvas
  return await stitchSlices(slices, viewportWidth, viewportHeight, devicePixelRatio, totalHeight);
}

/**
 * Stitch image slices into a single full-page PNG image via OffscreenCanvas
 */
async function stitchSlices(slices, viewportWidth, viewportHeight, devicePixelRatio, totalHeight) {
  if (!slices || slices.length === 0) return null;
  if (slices.length === 1) return slices[0].dataUrl;

  const bitmaps = [];
  for (const slice of slices) {
    try {
      const response = await fetch(slice.dataUrl);
      const blob = await response.blob();
      const bitmap = await createImageBitmap(blob);
      bitmaps.push({ y: slice.y, bitmap });
    } catch (e) {
      console.warn('Slice bitmap conversion error:', e);
    }
  }

  if (bitmaps.length === 0) return slices[0].dataUrl;

  const slicePixelWidth = bitmaps[0].bitmap.width;
  const scale = slicePixelWidth / (viewportWidth || 1);
  
  // Calculate total canvas height based on max slice Y + viewport slice height
  const lastSlice = bitmaps[bitmaps.length - 1];
  const maxCapturedY = lastSlice.y + viewportHeight;
  const effectiveTotalHeight = Math.min(totalHeight, maxCapturedY);
  const totalPixelHeight = Math.round(effectiveTotalHeight * scale);

  const offscreen = new OffscreenCanvas(slicePixelWidth, totalPixelHeight);
  const ctx = offscreen.getContext('2d');

  for (const item of bitmaps) {
    const drawY = Math.round(item.y * scale);
    ctx.drawImage(item.bitmap, 0, drawY);
    item.bitmap.close();
  }

  const resultBlob = await offscreen.convertToBlob({ type: 'image/png' });
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.readAsDataURL(resultBlob);
  });
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
 * Helper promise wrapper for chrome.tabs.sendMessage with auto content-script injection fallback
 */
function sendMessageToTab(tabId, message, allowInjectRetry = true) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, message, async (response) => {
      if (chrome.runtime.lastError) {
        const errorMsg = chrome.runtime.lastError.message || '';
        if (allowInjectRetry && (errorMsg.includes('Could not establish connection') || errorMsg.includes('Receiving end does not exist'))) {
          try {
            // Auto-inject content.js if tab was opened before extension was loaded/reloaded
            await chrome.scripting.executeScript({
              target: { tabId: tabId },
              files: ['content.js']
            });
            await delay(200);
            const retryRes = await sendMessageToTab(tabId, message, false);
            return resolve(retryRes);
          } catch (e) {
            return resolve({ success: false, error: 'Protected page (e.g. chrome:// extensions gallery). Please switch to a regular web page.' });
          }
        }
        resolve({ success: false, error: errorMsg });
      } else {
        resolve(response);
      }
    });
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
