/**
 * Webpage Copy Paster - Content Script
 * Runs in active webpage context to extract live DOM, bundle Single-File HTML,
 * and assist in full-page screenshot scrolling.
 */

(() => {
  // Listen for messages from popup or background service worker
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'GET_PAGE_METRICS') {
      sendResponse(getPageMetrics());
      return true;
    }

    if (request.action === 'EXTRACT_RAW_HTML') {
      try {
        const rawHtml = getFormattedRawHtml();
        sendResponse({
          success: true,
          html: rawHtml,
          title: document.title,
          url: window.location.href,
          length: rawHtml.length
        });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
      return true;
    }

    if (request.action === 'GENERATE_SINGLE_FILE') {
      generateSingleFileHtml()
        .then(html => {
          sendResponse({
            success: true,
            html: html,
            title: document.title,
            url: window.location.href
          });
        })
        .catch(err => {
          sendResponse({ success: false, error: err.message });
        });
      return true; // Async response
    }

    if (request.action === 'PREPARE_FULL_PAGE_SCROLL') {
      const metrics = {
        totalHeight: Math.max(
          document.documentElement.scrollHeight,
          document.body.scrollHeight,
          document.documentElement.offsetHeight
        ),
        viewportHeight: window.innerHeight,
        viewportWidth: window.innerWidth,
        devicePixelRatio: window.devicePixelRatio || 1,
        originalScrollY: window.scrollY
      };
      sendResponse({ success: true, metrics });
      return true;
    }

    if (request.action === 'SCROLL_TO') {
      window.scrollTo(0, request.y);
      // Wait for any fixed positioning updates or dynamic lazy-loaded elements
      setTimeout(() => {
        sendResponse({ success: true, currentY: window.scrollY });
      }, request.delay || 150);
      return true; // Async response
    }

    if (request.action === 'RESTORE_SCROLL') {
      window.scrollTo(0, request.originalScrollY || 0);
      sendResponse({ success: true });
      return true;
    }
  });

  /**
   * Get metadata and statistics about the active page
   */
  function getPageMetrics() {
    return {
      title: document.title || 'Untitled Page',
      url: window.location.href,
      domain: window.location.hostname,
      totalElements: document.getElementsByTagName('*').length,
      imageCount: document.images.length,
      linksCount: document.links.length,
      scriptCount: document.scripts.length,
      characterCount: document.documentElement.outerHTML.length
    };
  }

  /**
   * Extract cleanly formatted Raw HTML string
   */
  function getFormattedRawHtml() {
    const clone = document.documentElement.cloneNode(true);
    // Add generator meta tag
    const meta = document.createElement('meta');
    meta.name = 'snapshot-generator';
    meta.content = 'Webpage Copy Paster';
    clone.querySelector('head')?.appendChild(meta);

    let htmlString = clone.outerHTML;
    if (!htmlString.startsWith('<!DOCTYPE') && !htmlString.startsWith('<!doctype')) {
      htmlString = '<!DOCTYPE html>\n' + htmlString;
    }
    return htmlString;
  }

  /**
   * Generate self-contained Single-File HTML by inlining CSS styles and base64 images
   */
  async function generateSingleFileHtml() {
    const clone = document.documentElement.cloneNode(true);

    // 1. Convert all links and absolute URIs
    const baseUrl = window.location.href;

    // Convert relative URLs for images, stylesheets, links
    clone.querySelectorAll('img').forEach(img => {
      if (img.src) img.src = new URL(img.getAttribute('src') || '', baseUrl).href;
    });
    clone.querySelectorAll('link[rel="stylesheet"]').forEach(link => {
      if (link.href) link.href = new URL(link.getAttribute('href') || '', baseUrl).href;
    });
    clone.querySelectorAll('a').forEach(a => {
      if (a.getAttribute('href')) {
        try {
          a.href = new URL(a.getAttribute('href'), baseUrl).href;
        } catch (_) {}
      }
    });

    // 2. Inline author stylesheets into <style> tags
    const styleContainer = document.createElement('style');
    styleContainer.setAttribute('data-snapshot-inlined', 'true');
    let aggregatedCss = '/* Inlined by Webpage Copy Paster */\n';

    try {
      for (const sheet of Array.from(document.styleSheets)) {
        try {
          if (sheet.cssRules) {
            for (const rule of Array.from(sheet.cssRules)) {
              aggregatedCss += rule.cssText + '\n';
            }
          }
        } catch (e) {
          // Cross-origin stylesheet access restriction - fallback to <link> href fetch if needed
        }
      }
    } catch (e) {
      console.warn('Could not read all css rules:', e);
    }

    if (aggregatedCss.length > 50) {
      styleContainer.textContent = aggregatedCss;
      clone.querySelector('head')?.appendChild(styleContainer);
    }

    // 3. Convert accessible images to Base64 data URIs
    const images = Array.from(clone.querySelectorAll('img'));
    for (const img of images.slice(0, 30)) { // Process up to 30 images to keep performance fast
      if (img.src && !img.src.startsWith('data:')) {
        try {
          const base64 = await imageToBase64(img.src);
          if (base64) img.src = base64;
        } catch (e) {
          // Keep absolute URL as fallback
        }
      }
    }

    // 4. Disable dynamic scripts to keep offline state clean
    clone.querySelectorAll('script').forEach(script => {
      const comment = document.createComment(` Script removed for offline snapshot: ${script.src || 'inline script'} `);
      script.parentNode?.replaceChild(comment, script);
    });

    // Add Archive Header Comment
    const headerInfo = `<!--
  Archived with: Webpage Copy Paster
  Original URL: ${window.location.href}
  Date Captured: ${new Date().toISOString()}
-->\n`;

    let finalHtml = clone.outerHTML;
    if (!finalHtml.startsWith('<!DOCTYPE')) {
      finalHtml = '<!DOCTYPE html>\n' + finalHtml;
    }

    return headerInfo + finalHtml;
  }

  /**
   * Helper to convert image URL to Base64 string via canvas
   */
  function imageToBase64(url) {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'Anonymous';
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth || img.width;
          canvas.height = img.naturalHeight || img.height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0);
          resolve(canvas.toDataURL('image/png'));
        } catch (e) {
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      img.src = url;
    });
  }
})();
