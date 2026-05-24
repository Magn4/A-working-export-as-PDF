// Inline button next to H1's native EXPORT + a polished modal panel.
// Flow: user clicks "Export as PDF that actually works" → panel slides in
// with watermark input, redact toggle, and the final Export PDF action.
// Redact mode collapses the panel to a small floating pill so the user has
// the full page to draw on; clicking Done expands the panel back.

(() => {
  const { getOptions } = window.H1ExporterDefaults;

  // ---------- Inline trigger button (next to H1's native EXPORT) ----------
  function findNativeExport() {
    const reportCard =
      document.querySelector("#report-card") ||
      document.querySelector(".report-card");
    if (!reportCard) return null;
    for (const el of reportCard.querySelectorAll("a, button, span")) {
      const txt = (el.innerText || el.textContent || "").trim();
      if (txt.toUpperCase() === "EXPORT" && el.offsetHeight < 40) return el;
    }
    return null;
  }

  function injectInlineButton() {
    if (document.getElementById("h1exp-inline-export")) return;
    const target = findNativeExport();
    if (!target) return;

    const sep = document.createElement("span");
    sep.id = "h1exp-inline-sep";

    const btn = document.createElement("button");
    btn.id = "h1exp-inline-export";
    btn.type = "button";
    btn.title = "Open the export panel";
    // Inline SVG download icon for a polished look.
    btn.innerHTML =
      `<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">` +
      `<path fill="currentColor" d="M8 1.5a.75.75 0 0 1 .75.75v6.69l2.22-2.22a.75.75 0 1 1 1.06 1.06l-3.5 3.5a.75.75 0 0 1-1.06 0l-3.5-3.5a.75.75 0 1 1 1.06-1.06l2.22 2.22V2.25A.75.75 0 0 1 8 1.5Z"/>` +
      `<path fill="currentColor" d="M3 11.75a.75.75 0 0 1 .75.75v1.25c0 .14.11.25.25.25h8a.25.25 0 0 0 .25-.25V12.5a.75.75 0 0 1 1.5 0v1.25A1.75 1.75 0 0 1 12 15.5H4a1.75 1.75 0 0 1-1.75-1.75V12.5a.75.75 0 0 1 .75-.75Z"/>` +
      `</svg>` +
      `<span>Export as PDF that actually works</span>`;
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      openPanel();
    });

    target.parentNode.insertBefore(sep, target.nextSibling);
    target.parentNode.insertBefore(btn, sep.nextSibling);
  }

  new MutationObserver(() => injectInlineButton()).observe(
    document.documentElement,
    { childList: true, subtree: true }
  );
  injectInlineButton();

  // ---------- Open via extension toolbar icon ----------
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === "h1exp:open-panel") openPanel();
  });

  // ---------- Panel ----------
  let panelEl = null;
  let panelExportBtn = null;
  let panelRedactBtn = null;
  let panelClearBtn = null;
  let panelWatermarkInput = null;
  let panelCountEl = null;
  let collapsedPill = null;

  async function openPanel() {
    if (panelEl) {
      panelEl.classList.add("h1exp-panel--in");
      return;
    }
    const opts = await getOptions();

    const backdrop = document.createElement("div");
    backdrop.id = "h1exp-panel-backdrop";
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) closePanel();
    });

    panelEl = document.createElement("div");
    panelEl.id = "h1exp-panel";
    panelEl.innerHTML = `
      <div class="h1exp-panel__head">
        <div class="h1exp-panel__title">
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <path fill="currentColor" d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Zm0 7V3.5L19.5 9H14Z"/>
          </svg>
          <span>Export as PDF</span>
        </div>
        <button type="button" class="h1exp-panel__close" aria-label="Close">
          <svg viewBox="0 0 14 14" width="14" height="14" aria-hidden="true">
            <path fill="currentColor" d="m7 5.586 4.95-4.95 1.414 1.414L8.414 7l4.95 4.95-1.414 1.414L7 8.414l-4.95 4.95L.636 11.95 5.586 7 .636 2.05 2.05.636 7 5.586Z"/>
          </svg>
        </button>
      </div>

      <div class="h1exp-panel__body">
        <div class="h1exp-field">
          <label class="h1exp-field__label" for="h1exp-watermark-input">Watermark</label>
          <input id="h1exp-watermark-input" type="text" spellcheck="false" placeholder="e.g. CONFIDENTIAL — your@email" />
          <p class="h1exp-field__help">Tiled diagonally across every page. Leave blank for none.</p>
        </div>

        <div class="h1exp-field">
          <label class="h1exp-field__label">Redactions</label>
          <div class="h1exp-redact-row">
            <button type="button" id="h1exp-redact-btn" class="h1exp-btn h1exp-btn--ghost">
              <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                <path fill="currentColor" d="M2 3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3Zm0 7a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-3Z"/>
              </svg>
              <span>Draw redactions</span>
            </button>
            <span class="h1exp-redact-count" id="h1exp-redact-count">0 areas</span>
          </div>
          <button type="button" id="h1exp-clear-btn" class="h1exp-link">Clear all redactions</button>
        </div>
      </div>

      <div class="h1exp-panel__foot">
        <button type="button" class="h1exp-btn h1exp-btn--ghost h1exp-panel__cancel">Cancel</button>
        <button type="button" id="h1exp-export-btn" class="h1exp-btn h1exp-btn--primary">
          Export PDF
        </button>
      </div>
    `;

    document.body.appendChild(backdrop);
    document.body.appendChild(panelEl);

    // Wire up controls.
    panelWatermarkInput = panelEl.querySelector("#h1exp-watermark-input");
    panelWatermarkInput.value = opts.watermark_text || "";
    panelWatermarkInput.addEventListener("input", () => {
      chrome.storage.sync.set({ watermark_text: panelWatermarkInput.value });
    });

    panelRedactBtn = panelEl.querySelector("#h1exp-redact-btn");
    panelRedactBtn.addEventListener("click", () => {
      enterRedactMode();
      collapsePanel();
    });

    panelClearBtn = panelEl.querySelector("#h1exp-clear-btn");
    panelClearBtn.addEventListener("click", () => {
      clearAllMarks();
      updateRedactCount();
    });

    panelExportBtn = panelEl.querySelector("#h1exp-export-btn");
    panelExportBtn.addEventListener("click", () => {
      if (document.documentElement.classList.contains("h1exp-redact-mode")) {
        exitRedactMode();
      }
      runExport(panelExportBtn);
    });

    panelEl.querySelector(".h1exp-panel__close").addEventListener("click", closePanel);
    panelEl.querySelector(".h1exp-panel__cancel").addEventListener("click", closePanel);

    panelCountEl = panelEl.querySelector("#h1exp-redact-count");
    updateRedactCount();

    document.addEventListener("keydown", onPanelKeyDown);

    // Animate in.
    requestAnimationFrame(() => {
      backdrop.classList.add("h1exp-panel-backdrop--in");
      panelEl.classList.add("h1exp-panel--in");
    });
  }

  function closePanel() {
    if (document.documentElement.classList.contains("h1exp-redact-mode")) {
      exitRedactMode();
    }
    const backdrop = document.getElementById("h1exp-panel-backdrop");
    if (backdrop) backdrop.remove();
    if (panelEl) panelEl.remove();
    if (collapsedPill) collapsedPill.remove();
    panelEl = null;
    collapsedPill = null;
    panelExportBtn = null;
    panelRedactBtn = null;
    panelClearBtn = null;
    panelWatermarkInput = null;
    panelCountEl = null;
    document.removeEventListener("keydown", onPanelKeyDown);
  }

  function onPanelKeyDown(e) {
    if (e.key === "Escape") {
      if (document.documentElement.classList.contains("h1exp-redact-mode")) {
        exitRedactMode();
        expandPanel();
      } else {
        closePanel();
      }
    }
  }

  function updateRedactCount() {
    if (!panelCountEl) return;
    const n = document.querySelectorAll(".h1exp-redact-mark").length;
    panelCountEl.textContent = n === 1 ? "1 area" : `${n} areas`;
    if (panelClearBtn) panelClearBtn.style.display = n > 0 ? "inline" : "none";
  }

  function collapsePanel() {
    if (!panelEl) return;
    panelEl.style.display = "none";
    const backdrop = document.getElementById("h1exp-panel-backdrop");
    if (backdrop) backdrop.style.display = "none";

    collapsedPill = document.createElement("div");
    collapsedPill.id = "h1exp-collapsed-pill";
    collapsedPill.innerHTML = `
      <span class="h1exp-collapsed-pill__dot"></span>
      <span>Drag to redact</span>
      <button type="button" class="h1exp-btn h1exp-btn--small">Done</button>
    `;
    collapsedPill.querySelector("button").addEventListener("click", () => {
      exitRedactMode();
      expandPanel();
    });
    document.body.appendChild(collapsedPill);
    requestAnimationFrame(() => collapsedPill.classList.add("h1exp-collapsed-pill--in"));
  }

  function expandPanel() {
    if (collapsedPill) {
      collapsedPill.remove();
      collapsedPill = null;
    }
    if (panelEl) {
      panelEl.style.display = "";
      const backdrop = document.getElementById("h1exp-panel-backdrop");
      if (backdrop) backdrop.style.display = "";
    }
    updateRedactCount();
  }

  // ---------- Export pipeline ----------
  async function runExport(trigger) {
    const opts = await getOptions();
    const originalLabel = trigger?.innerHTML;
    if (trigger) {
      trigger.classList.add("h1exp-busy");
      trigger.textContent = "Preparing…";
      if ("disabled" in trigger) trigger.disabled = true;
    }

    try {
      if (opts.expand_collapsed) await expandAll();
      applyExportMode();
      await scrollThroughPage();
      isolateReportRoot();

      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      await sleep(200);

      if (trigger) trigger.textContent = "Capturing…";
      document.documentElement.classList.add("h1exp-capturing");

      const begin = await chrome.runtime.sendMessage({ type: "h1exp:capture-begin" });
      if (!begin?.ok) throw new Error(begin?.error || "Capture begin failed");

      const pages = [];
      try {
        for (let i = 0; i < begin.count; i++) {
          if (trigger) trigger.textContent = `Capturing ${i + 1}/${begin.count}…`;
          const c = await chrome.runtime.sendMessage({
            type: "h1exp:capture-chunk",
            index: i
          });
          if (!c?.ok) throw new Error(c?.error || `Chunk ${i} failed`);
          pages.push({ base64: c.data.base64, width: c.data.width, height: c.data.height });
          await sleep(20);
        }
      } finally {
        await chrome.runtime.sendMessage({ type: "h1exp:capture-end" });
      }

      if (trigger) trigger.textContent = "Building PDF…";
      const pdfBytes = window.H1ExporterPDF.buildPdf(pages, {
        watermark: (opts.watermark_text || "").trim()
      });
      downloadPdf(pdfBytes, buildFilename(opts) + ".pdf");

      // Success: close panel after a beat.
      if (trigger) trigger.textContent = "Done ✓";
      setTimeout(closePanel, 600);
    } catch (err) {
      if (trigger) trigger.textContent = "Failed — try again";
      console.error("[h1exp]", err);
    } finally {
      removeExportMode();
      document.documentElement.classList.remove("h1exp-capturing");
      if (trigger) {
        setTimeout(() => {
          if (!trigger.isConnected) return;
          trigger.classList.remove("h1exp-busy");
          trigger.innerHTML = originalLabel || "Export PDF";
          if ("disabled" in trigger) trigger.disabled = false;
        }, 800);
      }
    }
  }

  // ---------- Export-mode state ----------
  function applyExportMode() {
    document.documentElement.classList.add("h1exp-exporting");
  }
  function removeExportMode() {
    document.documentElement.classList.remove("h1exp-exporting");
    for (const el of document.querySelectorAll(".h1exp-hidden")) {
      el.classList.remove("h1exp-hidden");
    }
  }

  async function expandAll() {
    for (let pass = 0; pass < 5; pass++) {
      let clicked = 0;
      for (const el of document.querySelectorAll("button, a, [role='button']")) {
        const txt = (el.innerText || el.textContent || "").trim().toLowerCase();
        if (!txt) continue;
        if (
          txt === "show more" ||
          txt === "read more" ||
          txt === "view more" ||
          txt === "expand" ||
          (txt.startsWith("show ") && txt.includes("more")) ||
          (txt.startsWith("show ") && /\d/.test(txt))
        ) {
          try {
            el.click();
            clicked++;
          } catch (_) {}
        }
      }
      if (clicked === 0) break;
      await sleep(400);
    }
  }

  async function scrollThroughPage() {
    const scrollers = [
      window,
      document.querySelector(".report-card-scroll-container"),
      document.querySelector("#main-content")
    ].filter(Boolean);

    for (const s of scrollers) {
      const isWindow = s === window;
      const getMax = () =>
        isWindow ? document.documentElement.scrollHeight : s.scrollHeight;
      const viewport = isWindow ? window.innerHeight : s.clientHeight;
      const step = Math.max(400, viewport * 0.8);
      let y = 0;
      while (y < getMax()) {
        if (isWindow) window.scrollTo(0, y);
        else s.scrollTop = y;
        await sleep(100);
        y += step;
      }
      if (isWindow) window.scrollTo(0, 0);
      else s.scrollTop = 0;
      await sleep(50);
    }
  }

  function isolateReportRoot() {
    const root =
      document.querySelector("#report-card") ||
      document.querySelector(".report-card") ||
      document.querySelector("#main-content");
    if (!root) return;
    let node = root;
    while (node && node !== document.body && node.parentElement) {
      const parent = node.parentElement;
      for (const sib of parent.children) {
        if (sib === node) continue;
        if (sib.contains(root)) continue;
        if (sib.id === "h1exp-toolbar") continue;
        if (sib.id === "h1exp-panel" || sib.id === "h1exp-panel-backdrop") continue;
        if (sib.id === "h1exp-collapsed-pill") continue;
        if (sib.classList?.contains("h1exp-redact-mark")) continue;
        sib.classList.add("h1exp-hidden");
      }
      node = parent;
    }
  }

  // ---------- Redact mode ----------
  let dragState = null;

  function enterRedactMode() {
    if (document.documentElement.classList.contains("h1exp-redact-mode")) return;
    document.documentElement.classList.add("h1exp-redact-mode");
    document.addEventListener("mousedown", onDocMouseDown, true);
    document.addEventListener("click", onDocClick, true);
  }

  function exitRedactMode() {
    document.documentElement.classList.remove("h1exp-redact-mode");
    if (dragState?.preview) dragState.preview.remove();
    dragState = null;
    document.removeEventListener("mousedown", onDocMouseDown, true);
    document.removeEventListener("click", onDocClick, true);
  }

  function isOwnInteractive(target) {
    if (!target) return false;
    return (
      target.closest("#h1exp-collapsed-pill") ||
      target.closest("#h1exp-panel") ||
      target.closest(".h1exp-redact-mark__close")
    );
  }

  function onDocMouseDown(e) {
    if (e.button !== 0) return;
    if (isOwnInteractive(e.target)) return;
    e.preventDefault();
    e.stopPropagation();

    const beneath = document.elementFromPoint(e.clientX, e.clientY);
    const container = findDragContainer(beneath);
    const preview = document.createElement("div");
    preview.id = "h1exp-drag-preview";
    document.body.appendChild(preview);

    dragState = { container, startX: e.clientX, startY: e.clientY, preview };
    updatePreview(e.clientX, e.clientY);

    window.addEventListener("mousemove", onDragMove, true);
    window.addEventListener("mouseup", onDragEnd, true);
  }

  function onDocClick(e) {
    if (isOwnInteractive(e.target)) return;
    e.preventDefault();
    e.stopPropagation();
  }

  function onDragMove(e) {
    if (!dragState) return;
    e.preventDefault();
    updatePreview(e.clientX, e.clientY);
  }

  function onDragEnd(e) {
    if (!dragState) return;
    e.preventDefault();
    window.removeEventListener("mousemove", onDragMove, true);
    window.removeEventListener("mouseup", onDragEnd, true);

    const { container, startX, startY, preview } = dragState;
    const endX = e.clientX;
    const endY = e.clientY;
    preview.remove();

    const rect = {
      left: Math.min(startX, endX),
      top: Math.min(startY, endY),
      width: Math.abs(endX - startX),
      height: Math.abs(endY - startY)
    };
    dragState = null;

    if (rect.width < 5 || rect.height < 5) return;
    commitMark(container, rect);
  }

  function updatePreview(x, y) {
    const { startX, startY, preview } = dragState;
    preview.style.left = Math.min(startX, x) + "px";
    preview.style.top = Math.min(startY, y) + "px";
    preview.style.width = Math.abs(x - startX) + "px";
    preview.style.height = Math.abs(y - startY) + "px";
  }

  function findDragContainer(el) {
    const reportCard =
      document.querySelector("#report-card") ||
      document.querySelector(".report-card");
    if (reportCard && el && reportCard.contains(el)) return reportCard;
    const inner = document.querySelector(".report-card-scroll-container");
    if (inner && el && inner.contains(el)) return inner;
    const main = document.querySelector("#main-content");
    if (main && el && main.contains(el)) return main;
    return document.body;
  }

  function commitMark(container, viewportRect) {
    const cRect = container.getBoundingClientRect();
    const left = viewportRect.left - cRect.left + container.scrollLeft;
    const top = viewportRect.top - cRect.top + container.scrollTop;

    if (container !== document.body) {
      const cs = getComputedStyle(container);
      if (cs.position === "static") container.style.position = "relative";
    }

    const mark = document.createElement("div");
    mark.className = "h1exp-redact-mark";
    mark.style.left = left + "px";
    mark.style.top = top + "px";
    mark.style.width = viewportRect.width + "px";
    mark.style.height = viewportRect.height + "px";

    const close = document.createElement("button");
    close.className = "h1exp-redact-mark__close";
    close.type = "button";
    close.textContent = "×";
    close.title = "Remove redaction";
    close.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      mark.remove();
      updateRedactCount();
    });
    mark.appendChild(close);
    container.appendChild(mark);
  }

  function clearAllMarks() {
    for (const m of document.querySelectorAll(".h1exp-redact-mark")) m.remove();
  }

  // ---------- Download ----------
  function downloadPdf(bytes, filename) {
    const blob = new Blob([bytes], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  // ---------- Helpers ----------
  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  function buildFilename(opts) {
    const idMatch = location.pathname.match(/\/reports\/(\d+)/);
    const id =
      idMatch?.[1] ||
      new URLSearchParams(location.search).get("report_id") ||
      "report";
    const titleEl = document.querySelector(
      ".report-heading__report-title, .spec-report-title, h1"
    );
    const title = (titleEl?.innerText || document.title || "report")
      .trim()
      .replace(/\s+/g, "-")
      .replace(/[^\w\-]/g, "")
      .slice(0, 60);
    return (opts.filename_pattern || "h1-report-{id}-{title}")
      .replace("{id}", id)
      .replace("{title}", title);
  }
})();
