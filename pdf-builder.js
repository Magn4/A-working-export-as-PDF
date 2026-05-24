// Build a PDF from captured JPEG chunks. Optionally renders a watermark
// rotated 90° CCW along the right edge of every page (Helvetica, light gray).
//
// Layout: all chunks stacked vertically on as few PDF pages as possible —
// ideally a single tall page so the output reads as one continuous
// screenshot. Paginates only when total height exceeds MAX_PAGE_HEIGHT
// (Acrobat caps page size at ~200 inches; we leave a small margin).

(() => {
  const MAX_PAGE_HEIGHT = 13800; // px (≈ 191 in @ 72 DPI). Safe under 14400.
  const DEVICE_SCALE = 2;

  function base64ToBytes(base64) {
    const bin = atob(base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }

  // chunks: [{ base64, width, height }] in top-to-bottom order.
  // opts: { watermark?: string }
  function buildPdf(chunks, opts = {}) {
    if (!chunks.length) throw new Error("No chunks");
    const width = chunks[0].width;
    const watermark = (opts.watermark || "").trim();

    // Group chunks into pages, each page ≤ MAX_PAGE_HEIGHT.
    const pageGroups = [];
    let current = { height: 0, items: [] };
    for (const c of chunks) {
      if (current.height + c.height > MAX_PAGE_HEIGHT && current.items.length) {
        pageGroups.push(current);
        current = { height: 0, items: [] };
      }
      current.items.push({
        bytes: base64ToBytes(c.base64),
        width: c.width,
        height: c.height,
        yFromTop: current.height
      });
      current.height += c.height;
    }
    if (current.items.length) pageGroups.push(current);

    return assemblePdf(pageGroups, width, watermark);
  }

  // PDF strings in parentheses literal form need these chars escaped.
  function escapePdfString(s) {
    return s
      .replace(/\\/g, "\\\\")
      .replace(/\(/g, "\\(")
      .replace(/\)/g, "\\)")
      .replace(/[\r\n]/g, " ");
  }

  // Generate the content-stream ops for a tiled diagonal watermark across
  // a page. Light gray + semi-transparent via /GS1 ExtGState.
  function watermarkOps(text, pageW, pageH) {
    const fontSize = Math.max(28, Math.min(56, Math.floor(pageW * 0.028)));
    // Rough Helvetica width estimate.
    const textWidth = Math.max(1, text.length) * fontSize * 0.55;
    const escaped = escapePdfString(text);

    const angleDeg = 30;
    const rad = (angleDeg * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);

    // Diagonal pattern: stagger every other row by half-spacing for a
    // natural-looking weave (like the reference example).
    const xSpacing = Math.max(textWidth + fontSize * 2, pageW / 3.5);
    const ySpacing = Math.max(fontSize * 4.5, pageH / 12);

    let ops = `q\n/GS1 gs\n0.5 0.5 0.5 rg\n`;
    let row = 0;
    for (let y = -ySpacing; y < pageH + ySpacing * 2; y += ySpacing) {
      const xOffset = (row % 2) * (xSpacing / 2);
      for (let x = -xSpacing + xOffset; x < pageW + xSpacing; x += xSpacing) {
        const a = cos.toFixed(4);
        const b = sin.toFixed(4);
        const c = (-sin).toFixed(4);
        const d = cos.toFixed(4);
        ops +=
          `q\n${a} ${b} ${c} ${d} ${x.toFixed(2)} ${y.toFixed(2)} cm\n` +
          `BT\n/F1 ${fontSize} Tf\n0 0 Td\n(${escaped}) Tj\nET\nQ\n`;
      }
      row++;
    }
    ops += `Q\n`;
    return ops;
  }

  function assemblePdf(pageGroups, width, watermark) {
    const enc = new TextEncoder();
    const chunks = [];
    const offsets = [];
    let pos = 0;

    function push(s) {
      const bytes = typeof s === "string" ? enc.encode(s) : s;
      chunks.push(bytes);
      pos += bytes.length;
    }
    function startObj(n) {
      offsets[n] = pos;
      push(`${n} 0 obj\n`);
    }
    function endObj() {
      push("\nendobj\n");
    }

    push("%PDF-1.4\n%\xff\xff\xff\xff\n");

    // Object plan:
    //   1 = Catalog
    //   2 = Pages
    //   3 = Font (Helvetica) — small + harmless even if unused
    //   4 = ExtGState (alpha 0.15 for the semi-transparent watermark)
    //   5..N = pages / images / content streams (3 objects per page)
    const FONT_OBJ = 3;
    const GS_OBJ = 4;
    let nextObj = 5;
    const pagePlans = pageGroups.map((g) => {
      const pageNum = nextObj++;
      const items = g.items.map((it) => ({ ...it, objNum: nextObj++ }));
      const contentNum = nextObj++;
      return { pageNum, contentNum, items, height: g.height };
    });
    const totalObjs = nextObj - 1;

    startObj(1);
    push("<< /Type /Catalog /Pages 2 0 R >>");
    endObj();

    startObj(2);
    push(
      `<< /Type /Pages /Kids [${pagePlans
        .map((p) => `${p.pageNum} 0 R`)
        .join(" ")}] /Count ${pagePlans.length} >>`
    );
    endObj();

    // Standard 14 PDF font — no font file needed.
    startObj(FONT_OBJ);
    push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
    endObj();

    // ExtGState — fill alpha for semi-transparent watermark.
    startObj(GS_OBJ);
    push("<< /Type /ExtGState /ca 0.18 /CA 0.18 >>");
    endObj();

    for (const plan of pagePlans) {
      const xobjEntries = plan.items
        .map((it, i) => `/Im${i} ${it.objNum} 0 R`)
        .join(" ");
      startObj(plan.pageNum);
      push(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${plan.height}] ` +
          `/Resources << ` +
          `/XObject << ${xobjEntries} >> ` +
          `/Font << /F1 ${FONT_OBJ} 0 R >> ` +
          `/ExtGState << /GS1 ${GS_OBJ} 0 R >> ` +
          `/ProcSet [/PDF /Text /ImageC] ` +
          `>> ` +
          `/Contents ${plan.contentNum} 0 R >>`
      );
      endObj();

      // Image XObjects.
      for (const it of plan.items) {
        const imgPxW = it.width * DEVICE_SCALE;
        const imgPxH = it.height * DEVICE_SCALE;
        startObj(it.objNum);
        push(
          `<< /Type /XObject /Subtype /Image /Width ${imgPxW} /Height ${imgPxH} ` +
            `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode ` +
            `/Length ${it.bytes.length} >>\nstream\n`
        );
        push(it.bytes);
        push("\nendstream");
        endObj();
      }

      // Content stream — images first, then watermark on top.
      let ops = "";
      plan.items.forEach((it, i) => {
        const yBottom = plan.height - it.yFromTop - it.height;
        ops += `q\n${it.width} 0 0 ${it.height} 0 ${yBottom} cm\n/Im${i} Do\nQ\n`;
      });
      if (watermark) {
        ops += watermarkOps(watermark, width, plan.height);
      }
      const contentBytes = enc.encode(ops);
      startObj(plan.contentNum);
      push(`<< /Length ${contentBytes.length} >>\nstream\n`);
      push(contentBytes);
      push("endstream");
      endObj();
    }

    const xrefPos = pos;
    push(`xref\n0 ${totalObjs + 1}\n0000000000 65535 f \n`);
    for (let i = 1; i <= totalObjs; i++) {
      push(`${String(offsets[i]).padStart(10, "0")} 00000 n \n`);
    }
    push(
      `trailer\n<< /Size ${totalObjs + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`
    );

    const total = chunks.reduce((s, c) => s + c.length, 0);
    const out = new Uint8Array(total);
    let off = 0;
    for (const c of chunks) {
      out.set(c, off);
      off += c.length;
    }
    return out;
  }

  window.H1ExporterPDF = { buildPdf };
})();
