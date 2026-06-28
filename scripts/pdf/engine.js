"use strict";
/**
 * Mini motor de maquetacion sobre PDFKit.
 * Soporta: portada, indice (TOC), encabezados H1/H2/H3, parrafos,
 * listas, tablas con ajuste de linea + paginacion, bloques de codigo,
 * cajas de nota y pie con numeracion. Fuentes estandar (WinAnsi) -> acentos OK.
 */

const PDFDocument = require("pdfkit");
const fs = require("fs");

// Paleta
const COLOR = {
  ink: "#1f2933",
  sub: "#52606d",
  faint: "#9aa5b1",
  brand: "#0b6b5b", // verde DermaLand / DGII
  brandDark: "#084c41",
  accent: "#0e7490",
  rule: "#cbd2d9",
  codeBg: "#f5f7fa",
  codeInk: "#243b53",
  headBg: "#0b6b5b",
  zebra: "#eef2f5",
  noteBg: "#fef6e7",
  noteRule: "#f0b429",
  blockBg: "#eef9f6",
};

const FONT = {
  reg: "Helvetica",
  bold: "Helvetica-Bold",
  oblique: "Helvetica-Oblique",
  mono: "Courier",
  monoBold: "Courier-Bold",
};

class Doc {
  constructor(opts) {
    this.margin = 56;
    this.doc = new PDFDocument({
      size: "A4",
      margin: this.margin,
      bufferPages: true,
      compress: opts.compress !== false,
      info: opts.info || {},
      autoFirstPage: false,
    });
    this.pageW = 595.28;
    this.pageH = 841.89;
    this.contentW = this.pageW - this.margin * 2;
    this.toc = [];
    this._tocPlaceholderPage = null;
    this._footerLabel =
      opts.footerLabel || "DermaLand — Ficha tecnica del sistema de facturacion (DGII / e-CF)";
    this._sectionTitle = opts.runningTitle || "";
    this._started = false;
  }

  stream(path) {
    this.doc.pipe(fs.createWriteStream(path));
  }

  end() {
    if (process.env.DEBUG_PAGES)
      console.error("[end] before footers count=" + this.doc.bufferedPageRange().count);
    this.finalizeToc();
    if (process.env.DEBUG_PAGES)
      console.error("[end] after toc count=" + this.doc.bufferedPageRange().count);
    this._drawFootersOnly();
    if (process.env.DEBUG_PAGES)
      console.error("[end] after footers count=" + this.doc.bufferedPageRange().count);
    this.doc.end();
  }

  // ---- helpers de pagina ----
  _newPage() {
    this.doc.addPage();
    this.doc.x = this.margin;
    this.doc.y = this.margin;
    if (process.env.DEBUG_PAGES) {
      console.error(
        "[newPage] count=" + this.doc.bufferedPageRange().count + " sect=" + this._sectionTitle
      );
    }
  }

  _ensure(space) {
    if (this.doc.y + space > this.pageH - this.margin - 24) {
      this._newPage();
      return true;
    }
    return false;
  }

  get y() {
    return this.doc.y;
  }
  set y(v) {
    this.doc.y = v;
  }

  // ---- PORTADA ----
  cover({ title, subtitle, meta, badges }) {
    this._newPage();
    const d = this.doc;
    // banda superior
    d.rect(0, 0, this.pageW, 230).fill(COLOR.brand);
    d.rect(0, 230, this.pageW, 6).fill(COLOR.noteRule);

    d.fill("#ffffff").font(FONT.bold).fontSize(13);
    d.text("DERMALAND", this.margin, 70, { characterSpacing: 3 });
    d.font(FONT.reg).fontSize(10).fill("#d7efe9");
    d.text("Plataforma SaaS de facturacion electronica (DGII / e-CF)", this.margin, 92);

    d.fill("#ffffff").font(FONT.bold).fontSize(28);
    d.text(title, this.margin, 130, { width: this.contentW, lineGap: 2 });

    // subtitulo
    d.fill(COLOR.ink).font(FONT.reg).fontSize(13);
    d.text(subtitle, this.margin, 270, { width: this.contentW, lineGap: 4 });

    // badges
    let by = 330;
    if (badges && badges.length) {
      let bx = this.margin;
      d.fontSize(9).font(FONT.bold);
      badges.forEach((b) => {
        const w = d.widthOfString(b) + 18;
        if (bx + w > this.pageW - this.margin) {
          bx = this.margin;
          by += 26;
        }
        d.roundedRect(bx, by, w, 18, 9).fill(COLOR.blockBg);
        d.fill(COLOR.brandDark).text(b, bx + 9, by + 5);
        bx += w + 8;
      });
      by += 40;
    }

    // meta box
    const boxY = 470;
    d.roundedRect(this.margin, boxY, this.contentW, 150, 8)
      .fillAndStroke(COLOR.codeBg, COLOR.rule);
    let my = boxY + 18;
    d.fontSize(10);
    (meta || []).forEach((row) => {
      d.font(FONT.bold).fill(COLOR.sub).text(row[0], this.margin + 18, my, {
        width: 150,
        continued: false,
      });
      d.font(FONT.reg).fill(COLOR.ink).text(row[1], this.margin + 175, my, {
        width: this.contentW - 190,
      });
      my = Math.max(my, d.y) + 8;
    });

    // pie portada
    d.font(FONT.oblique).fontSize(8).fill(COLOR.faint);
    d.text(
      "Documento tecnico interno. Contiene la arquitectura del modulo fiscal. La emision fiscal real (Fase G / testecf / produccion) permanece bloqueada por politica operativa.",
      this.margin,
      this.pageH - 80,
      { width: this.contentW, align: "center" }
    );
  }

  // ---- INDICE (placeholder, se rellena al final) ----
  tocPage() {
    this._newPage();
    this.doc.font(FONT.bold).fontSize(20).fill(COLOR.brandDark);
    this.doc.text("Indice", this.margin, this.margin);
    this.doc.moveTo(this.margin, this.doc.y + 6)
      .lineTo(this.pageW - this.margin, this.doc.y + 6)
      .lineWidth(2).stroke(COLOR.noteRule);
    this.doc.moveDown(1.5);
    this._tocStartY = this.doc.y;
    this._tocPlaceholderPage = this._pageIndex();
    // reservamos esta pagina; el contenido se dibuja al final
  }

  _pageIndex() {
    return this.doc.bufferedPageRange().count - 1;
  }

  // ---- ENCABEZADOS ----
  h1(text) {
    this._newPage();
    const d = this.doc;
    this._sectionTitle = text;
    // numero/etiqueta de capitulo
    d.rect(this.margin, this.margin, 5, 30).fill(COLOR.brand);
    d.font(FONT.bold).fontSize(19).fill(COLOR.brandDark);
    d.text(text, this.margin + 16, this.margin + 2, { width: this.contentW - 16 });
    d.moveDown(0.4);
    d.moveTo(this.margin, d.y).lineTo(this.pageW - this.margin, d.y)
      .lineWidth(1).stroke(COLOR.rule);
    d.moveDown(0.6);
    this.toc.push({ level: 1, title: text, page: this._pageIndex() });
  }

  h2(text) {
    this._ensure(60);
    const d = this.doc;
    d.moveDown(0.5);
    d.font(FONT.bold).fontSize(14).fill(COLOR.brand);
    d.text(text, this.margin, d.y, { width: this.contentW });
    d.moveDown(0.2);
    this.toc.push({ level: 2, title: text, page: this._pageIndex() });
  }

  h3(text) {
    this._ensure(40);
    const d = this.doc;
    d.moveDown(0.3);
    d.font(FONT.bold).fontSize(11).fill(COLOR.accent);
    d.text(text, this.margin, d.y, { width: this.contentW });
    d.moveDown(0.15);
  }

  // ---- PARRAFO ----
  p(text, opts = {}) {
    this._ensure(28);
    const d = this.doc;
    d.font(opts.bold ? FONT.bold : FONT.reg)
      .fontSize(opts.size || 10)
      .fill(opts.color || COLOR.ink);
    d.text(text, this.margin, d.y, {
      width: this.contentW,
      align: opts.align || "left",
      lineGap: 2,
    });
    d.moveDown(0.5);
  }

  // ---- LISTA ----
  list(items, opts = {}) {
    const d = this.doc;
    const indent = opts.indent || 0;
    items.forEach((it) => {
      const text = typeof it === "string" ? it : it.text;
      const sub = typeof it === "object" ? it.sub : null;
      this._ensure(22);
      const x = this.margin + 10 + indent;
      const startY = d.y;
      d.font(FONT.bold).fontSize(10).fill(COLOR.brand);
      d.text("•", x, startY, { width: 10 });
      d.font(FONT.reg).fontSize(10).fill(COLOR.ink);
      d.text(text, x + 12, startY, { width: this.contentW - 22 - indent, lineGap: 1.5 });
      if (sub) {
        d.font(FONT.oblique).fontSize(8.5).fill(COLOR.sub);
        d.text(sub, x + 12, d.y, { width: this.contentW - 22 - indent });
      }
      d.moveDown(0.3);
    });
    d.moveDown(0.2);
  }

  // ---- BLOQUE DE CODIGO ----
  code(text, opts = {}) {
    const d = this.doc;
    const padding = 10;
    const fontSize = opts.size || 8;
    const lineH = fontSize + 3;
    const lines = String(text).replace(/\t/g, "  ").split("\n");
    d.font(FONT.mono).fontSize(fontSize);
    // medir alto total respetando wrapping simple por ancho
    const innerW = this.contentW - padding * 2;
    const maxChars = Math.floor(innerW / d.widthOfString("M"));
    const wrapped = [];
    lines.forEach((ln) => {
      if (ln.length <= maxChars || maxChars <= 0) wrapped.push(ln);
      else {
        for (let i = 0; i < ln.length; i += maxChars)
          wrapped.push(ln.slice(i, i + maxChars));
      }
    });
    // paginar bloque
    let idx = 0;
    while (idx < wrapped.length) {
      const avail = this.pageH - this.margin - 24 - this.doc.y;
      let canFit = Math.floor((avail - padding * 2) / lineH);
      if (canFit < 3) {
        this._newPage();
        continue;
      }
      const slice = wrapped.slice(idx, idx + canFit);
      const boxH = slice.length * lineH + padding * 2;
      const top = this.doc.y;
      d.roundedRect(this.margin, top, this.contentW, boxH, 4)
        .fillAndStroke(COLOR.codeBg, COLOR.rule);
      d.rect(this.margin, top, 3, boxH).fill(COLOR.accent);
      d.font(FONT.mono).fontSize(fontSize).fill(COLOR.codeInk);
      let ty = top + padding;
      slice.forEach((ln) => {
        d.text(ln, this.margin + padding, ty, { lineBreak: false });
        ty += lineH;
      });
      this.doc.y = top + boxH + 6;
      idx += canFit;
    }
  }

  // ---- CAJA DE NOTA ----
  note(title, text, kind = "note") {
    const d = this.doc;
    const padding = 10;
    const accent =
      kind === "warn" ? COLOR.noteRule : kind === "ok" ? COLOR.brand : COLOR.accent;
    const bg = kind === "ok" ? COLOR.blockBg : COLOR.noteBg;
    d.font(FONT.bold).fontSize(9.5);
    const titleH = title ? 14 : 0;
    d.font(FONT.reg).fontSize(9.5);
    const textH = d.heightOfString(text, { width: this.contentW - padding * 2 });
    const boxH = textH + titleH + padding * 2;
    this._ensure(boxH + 8);
    const top = d.y;
    d.roundedRect(this.margin, top, this.contentW, boxH, 5).fill(bg);
    d.rect(this.margin, top, 4, boxH).fill(accent);
    let ty = top + padding;
    if (title) {
      d.font(FONT.bold).fontSize(9.5).fill(COLOR.brandDark);
      d.text(title, this.margin + padding + 4, ty, { width: this.contentW - padding * 2 });
      ty = d.y + 2;
    }
    d.font(FONT.reg).fontSize(9.5).fill(COLOR.ink);
    d.text(text, this.margin + padding + 4, ty, { width: this.contentW - padding * 2 - 4 });
    this.doc.y = top + boxH + 8;
  }

  // ---- TABLA ----
  // columns: [{ header, width(frac|px), align }]
  // rows: [[cell, cell, ...]]
  table(columns, rows, opts = {}) {
    const d = this.doc;
    const totalFrac = columns.reduce(
      (s, c) => s + (typeof c.width === "number" && c.width <= 1 ? c.width : 0),
      0
    );
    const fixed = columns.reduce(
      (s, c) => s + (typeof c.width === "number" && c.width > 1 ? c.width : 0),
      0
    );
    const flexW = this.contentW - fixed;
    const colW = columns.map((c) => {
      if (typeof c.width === "number" && c.width > 1) return c.width;
      if (typeof c.width === "number") return (c.width / totalFrac) * flexW;
      return flexW / columns.length;
    });

    const cellPad = 5;
    const fs = opts.size || 8.5;
    const headFs = opts.headSize || 8.5;

    const measureRow = (cells, font, size) => {
      d.font(font).fontSize(size);
      let h = 0;
      cells.forEach((cell, i) => {
        const txt = cell == null ? "" : String(cell);
        const hh = d.heightOfString(txt, { width: colW[i] - cellPad * 2 });
        if (hh > h) h = hh;
      });
      return h + cellPad * 2;
    };

    const drawHeader = () => {
      const h = measureRow(columns.map((c) => c.header), FONT.bold, headFs);
      const top = d.y;
      d.rect(this.margin, top, this.contentW, h).fill(COLOR.headBg);
      let x = this.margin;
      d.font(FONT.bold).fontSize(headFs).fill("#ffffff");
      columns.forEach((c, i) => {
        d.text(c.header, x + cellPad, top + cellPad, {
          width: colW[i] - cellPad * 2,
          align: c.align || "left",
        });
        x += colW[i];
      });
      d.y = top + h;
    };

    this._ensure(50);
    drawHeader();

    rows.forEach((cells, ri) => {
      const h = measureRow(cells, FONT.reg, fs);
      if (d.y + h > this.pageH - this.margin - 24) {
        this._newPage();
        drawHeader();
      }
      const top = d.y;
      if (ri % 2 === 1) {
        d.rect(this.margin, top, this.contentW, h).fill(COLOR.zebra);
      }
      let x = this.margin;
      d.font(FONT.reg).fontSize(fs).fill(COLOR.ink);
      columns.forEach((c, i) => {
        const txt = cells[i] == null ? "" : String(cells[i]);
        const isMono = c.mono;
        d.font(isMono ? FONT.mono : FONT.reg).fontSize(isMono ? fs - 0.5 : fs);
        d.fill(c.color || COLOR.ink);
        d.text(txt, x + cellPad, top + cellPad, {
          width: colW[i] - cellPad * 2,
          align: c.align || "left",
        });
        x += colW[i];
      });
      // bordes verticales suaves
      d.y = top + h;
      d.moveTo(this.margin, d.y).lineTo(this.pageW - this.margin, d.y)
        .lineWidth(0.5).stroke(COLOR.rule);
    });
    d.moveDown(0.8);
  }

  spacer(n = 1) {
    this.doc.moveDown(n);
  }

  // ---- Sanitiza texto a glifos seguros (WinAnsi / fuentes estandar) ----
  _san(s) {
    if (s == null) return "";
    let out = String(s);
    const map = {
      "✓": "[x]", "✔": "[x]", "✅": "[OK]", "☑": "[x]",
      "❌": "[no]", "✗": "[x]", "✘": "[x]",
      "🔒": "[bloq]", "🔓": "[open]", "⚠️": "[!]", "⚠": "[!]",
      "⏳": "[...]", "🔲": "[ ]", "▪": "-", "▸": ">", "►": ">",
      "→": "->", "⇒": "=>", "←": "<-", "↓": "v", "↑": "^", "↔": "<->",
      "≤": "<=", "≥": ">=", "≠": "!=", "×": "x", "·": "-",
      "│": "|", "├": "|", "└": "|", "─": "-", "┌": "|", "┐": "|", "┘": "|", "•": "-",
      "“": '"', "”": '"', "‘": "'", "’": "'", "₂": "2",
    };
    for (const [k, v] of Object.entries(map)) out = out.split(k).join(v);
    // quitar emojis / variation selectors / cualquier codepoint alto no soportado
    out = out.replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{2190}-\u{21FF}\u{2300}-\u{23FF}]/gu, "");
    // mantener Latin-1 + algunos signos tipograficos; reemplazar resto raro por espacio
    out = out.replace(/[^ -ɏ–—‘’“”•…€]/g, "");
    return out;
  }

  _stripInline(s) {
    // quita marcadores markdown inline manteniendo el texto
    return this._san(
      String(s)
        .replace(/\*\*(.+?)\*\*/g, "$1")
        .replace(/(?<!\w)\*(?!\s)(.+?)(?<!\s)\*(?!\w)/g, "$1")
        .replace(/`([^`]+)`/g, "$1")
        .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
        .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    );
  }

  // ---- Renderiza un bloque de Markdown completo ----
  md(markdown) {
    const lines = String(markdown).replace(/\r\n/g, "\n").split("\n");
    let i = 0;
    const isTableSep = (l) => /^\s*\|?[\s:|-]*-[\s:|-]*\|?\s*$/.test(l) && l.includes("-");
    const splitRow = (l) => {
      let t = l.trim();
      if (t.startsWith("|")) t = t.slice(1);
      if (t.endsWith("|")) t = t.slice(0, -1);
      return t.split("|").map((c) => c.trim());
    };
    while (i < lines.length) {
      let line = lines[i];
      const trimmed = line.trim();

      if (trimmed === "") { i++; continue; }
      if (/^(-{3,}|_{3,}|\*{3,})$/.test(trimmed)) { i++; continue; } // hr

      // fence de codigo
      const fence = trimmed.match(/^```|^~~~/);
      if (fence) {
        const marker = trimmed.slice(0, 3);
        const buf = [];
        i++;
        while (i < lines.length && !lines[i].trim().startsWith(marker)) {
          buf.push(lines[i]);
          i++;
        }
        i++; // saltar cierre
        this.code(this._san(buf.join("\n")));
        continue;
      }

      // tabla
      if (trimmed.startsWith("|") && i + 1 < lines.length && isTableSep(lines[i + 1])) {
        const header = splitRow(line).map((h) => this._stripInline(h));
        i += 2; // saltar header + separador
        const rows = [];
        while (i < lines.length && lines[i].trim().startsWith("|")) {
          rows.push(splitRow(lines[i]).map((c) => this._stripInline(c)));
          i++;
        }
        this._renderMdTable(header, rows);
        continue;
      }

      // encabezados
      const h = trimmed.match(/^(#{1,6})\s+(.*)$/);
      if (h) {
        const level = h[1].length;
        const txt = this._stripInline(h[2].replace(/\s*#+\s*$/, ""));
        if (level <= 1) this.h1(txt);
        else if (level === 2) this.h2(txt);
        else if (level === 3) this.h3(txt);
        else { this._ensure(26); this.doc.moveDown(0.2); this.p(txt, { bold: true, size: 10 }); }
        i++;
        continue;
      }

      // listas (agrupar)
      if (/^\s*([-*+]|•|\d+[.)])\s+/.test(line)) {
        const items = [];
        while (i < lines.length && /^\s*([-*+]|•|\d+[.)])\s+/.test(lines[i])) {
          const m = lines[i].match(/^(\s*)([-*+]|•|\d+[.)])\s+(.*)$/);
          const indent = Math.floor((m[1] || "").length / 2);
          const numbered = /\d+[.)]/.test(m[2]);
          const prefix = numbered ? m[2].replace(/[.)]/, ".") + " " : "";
          items.push({ text: prefix + this._stripInline(m[3]), indent: indent * 12 });
          i++;
        }
        // renderizar respetando indent simple
        items.forEach((it) => this.list([it.text], { indent: it.indent }));
        continue;
      }

      // parrafo (acumular lineas contiguas)
      const para = [trimmed];
      i++;
      while (
        i < lines.length &&
        lines[i].trim() !== "" &&
        !/^(#{1,6})\s/.test(lines[i].trim()) &&
        !lines[i].trim().startsWith("|") &&
        !/^```|^~~~/.test(lines[i].trim()) &&
        !/^\s*([-*+]|•|\d+[.)])\s+/.test(lines[i])
      ) {
        para.push(lines[i].trim());
        i++;
      }
      this.p(this._stripInline(para.join(" ")));
    }
  }

  _renderMdTable(header, rows) {
    // calcular anchos relativos por longitud maxima de contenido (cap)
    const ncol = header.length;
    const maxLen = header.map((h, c) => {
      let m = h.length;
      rows.forEach((r) => { if (r[c] && r[c].length > m) m = r[c].length; });
      return Math.min(Math.max(m, 4), 60);
    });
    const sum = maxLen.reduce((a, b) => a + b, 0) || 1;
    const columns = header.map((h, c) => {
      const looksMono = /code|campo|columna|ruta|endpoint|variable|tipo|sql|policy|gate|archivo/i.test(h);
      return { header: h, width: maxLen[c] / sum, mono: looksMono && c < 2 };
    });
    this.table(columns, rows, { size: 8, headSize: 8 });
  }

  // ---- relleno del TOC + pies ----
  finalizeToc() {
    if (this._tocPlaceholderPage == null) return;
    const d = this.doc;
    const range = d.bufferedPageRange();
    d.switchToPage(this._tocPlaceholderPage);
    d.page.margins.bottom = 0; // el TOC se dibuja manualmente; sin auto-pagina
    const bottomLimit = this.pageH - this.margin - 16;
    // Layout en 2 columnas para que quepan muchas entradas en 1 pagina.
    const gap = 24;
    const colW = (this.contentW - gap) / 2;
    const colX = [this.margin, this.margin + colW + gap];
    let col = 0;
    let y = this._tocStartY;
    let drawn = 0;
    const drawEntry = (entry) => {
      const isH1 = entry.level === 1;
      const lineH = isH1 ? 15 : 12.5;
      if (y + lineH > bottomLimit) {
        if (col === 0) { col = 1; y = this._tocStartY; }
        else return false; // sin espacio (no deberia pasar)
      }
      const x0 = colX[col];
      const indent = isH1 ? 0 : 12;
      if (isH1 && drawn > 0 && y > this._tocStartY + 1) y += 4;
      d.font(isH1 ? FONT.bold : FONT.reg)
        .fontSize(isH1 ? 9.5 : 8.5)
        .fill(isH1 ? COLOR.brandDark : COLOR.sub);
      const numStr = String(entry.page + 1);
      d.fontSize(8.5);
      const numW = d.widthOfString(numStr) + 2;
      d.fontSize(isH1 ? 9.5 : 8.5);
      const labelW = colW - indent - numW - 8;
      // truncar manualmente para garantizar una sola linea (ellipsis de PDFKit es inconsistente)
      let label = entry.title;
      if (d.widthOfString(label) > labelW) {
        while (label.length > 1 && d.widthOfString(label + "…") > labelW) label = label.slice(0, -1);
        label = label.replace(/\s+\S*$/, "") + "…";
      }
      d.text(label, x0 + indent, y, { width: labelW, lineBreak: false });
      d.fill(COLOR.faint).font(FONT.reg).fontSize(8.5);
      d.text(numStr, x0 + colW - numW, y, { lineBreak: false });
      y += lineH;
      drawn++;
      return true;
    };
    for (const entry of this.toc) { if (drawEntry(entry) === false) break; }
    if (process.env.DEBUG_PAGES)
      console.error("[toc] dibujadas " + drawn + " de " + this.toc.length + " entradas (2 col)");
  }

  _drawFootersOnly() {
    const d = this.doc;
    const range = d.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      d.switchToPage(i);
      // saltar pie en portada (pagina 0)
      if (i === 0) continue;
      // PDFKit agrega una pagina automatica si se dibuja texto dentro del
      // margen inferior; anulamos el margen inferior de esta pagina mientras
      // escribimos el pie para evitar paginas fantasma.
      const savedBottom = d.page.margins.bottom;
      d.page.margins.bottom = 0;
      const y = this.pageH - this.margin + 6;
      d.moveTo(this.margin, y).lineTo(this.pageW - this.margin, y)
        .lineWidth(0.5).stroke(COLOR.rule);
      d.font(FONT.reg).fontSize(7.5).fill(COLOR.faint);
      d.text(this._footerLabel,
        this.margin, y + 4, { width: this.contentW - 60, lineBreak: false });
      d.text(`Pag. ${i + 1} de ${range.count}`,
        this.pageW - this.margin - 80, y + 4, { width: 80, align: "right", lineBreak: false });
      d.page.margins.bottom = savedBottom;
    }
  }
}

module.exports = { Doc, COLOR, FONT };
