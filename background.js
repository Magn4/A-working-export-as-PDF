// Service worker. Owns chrome.debugger.
//
// Quality: deviceScaleFactor: 2 (retina pixel density) + JPEG quality 95.
// Crop: measure #report-card bounds and clip captures to just that column,
// so the PDF focuses on the report instead of showing empty side margins.

const DEBUGGER_VERSION = "1.3";
const CHUNK_HEIGHT_CSS_PX = 2500; // measured in CSS pixels (image will be 2× this)
const MAX_TOTAL_HEIGHT_PX = 30000;
const JPEG_QUALITY = 95;
const DEVICE_SCALE = 2;

const sessions = new Map();

// Clicking the extension toolbar icon opens the in-page panel.
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab?.id) return;
  try {
    await chrome.tabs.sendMessage(tab.id, { type: "h1exp:open-panel" });
  } catch (e) {
    // Content script may not be loaded yet (e.g. tab was open before
    // the extension installed). Inject it on-demand.
    try {
      await chrome.scripting.insertCSS({ target: { tabId: tab.id }, files: ["inject.css"] });
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["defaults.js", "pdf-builder.js", "content.js"]
      });
      await chrome.tabs.sendMessage(tab.id, { type: "h1exp:open-panel" });
    } catch (_) {}
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const tabId = msg?.tabId ?? sender.tab?.id;

  if (msg?.type === "h1exp:capture-begin") {
    beginCapture(tabId).then(
      (info) => sendResponse({ ok: true, ...info }),
      (err) => sendResponse({ ok: false, error: String(err?.message || err) })
    );
    return true;
  }
  if (msg?.type === "h1exp:capture-chunk") {
    captureChunk(tabId, msg.index).then(
      (data) => sendResponse({ ok: true, data }),
      (err) => sendResponse({ ok: false, error: String(err?.message || err) })
    );
    return true;
  }
  if (msg?.type === "h1exp:capture-end") {
    endCapture(tabId).then(
      () => sendResponse({ ok: true }),
      (err) => sendResponse({ ok: false, error: String(err?.message || err) })
    );
    return true;
  }
});

async function beginCapture(tabId) {
  const target = { tabId };
  await chrome.debugger.attach(target, DEBUGGER_VERSION);
  try {
    // Initial measurement — figure out the height we need so the inner
    // scroller can expand to show all content.
    const initial = await runtimeEval(target, `(() => {
      const docH = document.documentElement.scrollHeight;
      const scrollers = Array.from(document.querySelectorAll(
        '.report-card-scroll-container, #main-content, .report-card'
      ));
      let needed = docH;
      for (const s of scrollers) {
        const rect = s.getBoundingClientRect();
        needed = Math.max(needed, rect.top + window.scrollY + s.scrollHeight);
      }
      return { width: window.innerWidth, needed: needed + 100 };
    })()`);

    const targetWidth = initial.width;
    const desiredHeight = Math.min(initial.needed, MAX_TOTAL_HEIGHT_PX);
    const truncated = initial.needed > MAX_TOTAL_HEIGHT_PX;

    // Resize viewport so inner scrollers expand naturally + retina DPR for crispness.
    await chrome.debugger.sendCommand(target, "Emulation.setDeviceMetricsOverride", {
      width: targetWidth,
      height: desiredHeight,
      deviceScaleFactor: DEVICE_SCALE,
      mobile: false
    });

    // Wait for reflow + reactive re-renders.
    await sleep(700);

    // Measure post-override: total page size AND report-card crop bounds.
    const final = await runtimeEval(target, `(() => {
      const root = document.querySelector('#report-card')
        || document.querySelector('.report-card');
      let crop = null;
      if (root) {
        const r = root.getBoundingClientRect();
        // Add a small horizontal padding around the report so it doesn't
        // butt against the PDF edge.
        const pad = 16;
        crop = {
          x: Math.max(0, Math.floor(r.left - pad)),
          y: 0,
          width: Math.ceil(r.width + pad * 2),
          height: 0 // filled in below
        };
      }
      const docH = Math.ceil(document.documentElement.scrollHeight);
      return { docH, docW: document.documentElement.scrollWidth, crop };
    })()`);

    let height = Math.min(final.docH, MAX_TOTAL_HEIGHT_PX);
    let width, x;
    if (final.crop) {
      width = final.crop.width;
      x = final.crop.x;
    } else {
      width = final.docW;
      x = 0;
    }

    const chunkH = CHUNK_HEIGHT_CSS_PX;
    const count = Math.ceil(height / chunkH);
    sessions.set(tabId, { width, height, x, chunkH, count });
    return { width, height, chunkH, count, truncated };
  } catch (e) {
    try {
      await chrome.debugger.sendCommand(target, "Emulation.clearDeviceMetricsOverride");
    } catch (_) {}
    try { await chrome.debugger.detach(target); } catch (_) {}
    throw e;
  }
}

async function captureChunk(tabId, index) {
  const session = sessions.get(tabId);
  if (!session) throw new Error("No active capture session");
  const { width, height, x, chunkH } = session;
  const y = index * chunkH;
  const h = Math.min(chunkH, height - y);
  if (h <= 0) throw new Error("Chunk out of range");

  const result = await chrome.debugger.sendCommand(
    { tabId },
    "Page.captureScreenshot",
    {
      format: "jpeg",
      quality: JPEG_QUALITY,
      captureBeyondViewport: false,
      fromSurface: true,
      clip: { x, y, width, height: h, scale: 1 }
    }
  );
  // Return CSS dimensions; actual image bytes are 2× this (deviceScaleFactor).
  return { base64: result.data, width, height: h };
}

async function endCapture(tabId) {
  sessions.delete(tabId);
  try {
    await chrome.debugger.sendCommand(
      { tabId },
      "Emulation.clearDeviceMetricsOverride"
    );
  } catch (_) {}
  try {
    await chrome.debugger.detach({ tabId });
  } catch (_) {}
}

async function runtimeEval(target, expression) {
  const r = await chrome.debugger.sendCommand(target, "Runtime.evaluate", {
    expression,
    returnByValue: true
  });
  if (r.exceptionDetails) {
    throw new Error("eval failed: " + (r.exceptionDetails.text || "unknown"));
  }
  return r.result.value;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

chrome.debugger.onDetach.addListener((source) => {
  if (source.tabId) sessions.delete(source.tabId);
});
chrome.tabs.onRemoved.addListener((tabId) => {
  if (sessions.has(tabId)) {
    sessions.delete(tabId);
    try { chrome.debugger.detach({ tabId }); } catch (_) {}
  }
});
