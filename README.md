# 📸 Webpage Copy Paster

> A powerful, privacy-first **Manifest V3 Browser Extension** to copy raw DOM HTML with 1 click, capture full-page screenshots, vector PDFs, and single-file offline HTML archives.

---

## 🌟 Key Features

- ⚡ **1-Click Copy Raw HTML**: Instantly extracts live DOM HTML from the active tab and copies it to your clipboard with line count & payload size metrics.
- 📸 **Full-Page Screenshot**: Auto-scrolls the active webpage, captures visible viewport slices, stitches them into a full PNG screenshot, and downloads it.
- 📷 **Visible Area Screenshot**: Takes a high-resolution PNG snapshot of what is currently on screen.
- 🌐 **Single-File Offline HTML Archive**: Bundles external stylesheets and images into Base64 data URIs so pages open completely offline.
- 📄 **Vector PDF Export**: Generates printable PDF documents from any web page.
- 📁 **Gallery & Code Inspector**: Includes a full-screen dashboard tab (`gallery.html`) to manage snapshot history, inspect raw HTML code with line numbers, search past captures, and re-copy code anytime.

---

## 🛠️ Installation Instructions

This extension works on **Google Chrome**, **Microsoft Edge**, **Brave**, **Opera**, and all Chromium-based browsers:

1. Clone or download this repository:
   ```bash
   git clone https://github.com/YOUR_USERNAME/page-snapshot-extension.git
   ```
2. Open your browser and navigate to:
   - **Chrome**: `chrome://extensions`
   - **Edge**: `edge://extensions`
   - **Brave**: `brave://extensions`
3. Enable **Developer mode** using the toggle in the top-right corner.
4. Click **Load unpacked**.
5. Select the `Page Snapshot` repository directory.
6. Pin **Webpage Copy Paster** to your browser toolbar!

---

## 📁 Repository Structure

```text
├── manifest.json       # Manifest V3 extension definition
├── popup.html          # Extension toolbar popup interface
├── popup.css           # Glassmorphism dark-theme styling
├── popup.js            # Toolbar popup controller & tab message dispatch
├── content.js          # In-tab DOM extractor & single-file bundler
├── background.js       # Service worker for screenshot stitching & file downloads
├── gallery.html        # Full-screen code inspector & history dashboard
├── gallery.css         # Styling for gallery dashboard
├── gallery.js          # History manager & storage interface
└── icons/              # Extension icons (16px, 48px, 128px PNG)
```

---

## 🔒 Privacy & Security

- **100% Local Processing**: All captures, DOM extractions, and single-file bundling are performed locally inside your browser context.
- **Zero Third-Party Servers**: No page data, URLs, or HTML contents are ever sent to external servers or analytics.
- **Works Behind Logins**: Because it runs as a native extension inside your active session, it can snapshot private dashboards, internal tools, and authenticated pages.

---

## 📄 License

[MIT License](LICENSE)
