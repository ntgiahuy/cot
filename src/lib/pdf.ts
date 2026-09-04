import { PDFDocument, PDFFont, PDFPage, rgb, degrees, LineCapStyle } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import {
  buildSchedule,
  columnFloors,
  edgeBarCenters,
  floorElevations,
  formatBarLabel,
  cTieAlongX,
  cTieAlongY,
  doubleAlongX,
  doubleAlongY,
  doubleMinWrap,
  hasMainStirrup,
  lapMm,
  markOf,
  midSplicePosMm,
  nestedAlongX,
  nestedAlongY,
  nestedTieRect,
  normalizeColumn,
  sectionFor,
  sectionMarks,
  stockBars,
  summaryBuckets,
  type SectionMark,
} from "./calc";
import { EMBED_MM, STOCK_M, type Column, type Floor, type FloorSection, type Project } from "./types";

/** A1 ngang — 841 × 594 mm (2384 × 1684 pt). Một cột / trang. */
const PAGE_W = 2384;
const PAGE_H = 1684;
const BLACK = rgb(0, 0, 0);
const WHITE = rgb(1, 1, 1);
const GRAY = rgb(0.9, 0.9, 0.9);
const GRAY2 = rgb(0.96, 0.96, 0.96);

type Ctx = {
  page: PDFPage;
  font: PDFFont;
  fontBold: PDFFont;
  W: number;
  H: number;
};

type Zone = {
  id: "embed" | "mid" | "dense" | "beam";
  len: number;
  spacing: number;
  dashed: boolean;
  label: string | null;
};

function ty(ctx: Ctx, y: number) {
  return ctx.H - y;
}

function line(
  ctx: Ctx,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  w = 0.7,
  dash?: number[],
) {
  ctx.page.drawLine({
    start: { x: x1, y: ty(ctx, y1) },
    end: { x: x2, y: ty(ctx, y2) },
    thickness: w,
    color: BLACK,
    dashArray: dash,
  });
}

function rect(ctx: Ctx, x: number, y: number, w: number, h: number, t = 0.8, dash?: number[]) {
  ctx.page.drawRectangle({
    x,
    y: ty(ctx, y + h),
    width: w,
    height: h,
    borderColor: BLACK,
    borderWidth: t,
    borderDashArray: dash,
  });
}

function fillRect(ctx: Ctx, x: number, y: number, w: number, h: number, color = BLACK) {
  ctx.page.drawRectangle({
    x,
    y: ty(ctx, y + h),
    width: w,
    height: h,
    color,
  });
}

function text(
  ctx: Ctx,
  str: string,
  x: number,
  y: number,
  size = 9,
  bold = false,
  align: "left" | "center" | "right" = "left",
) {
  const font = bold ? ctx.fontBold : ctx.font;
  const width = font.widthOfTextAtSize(str, size);
  let tx = x;
  if (align === "center") tx = x - width / 2;
  if (align === "right") tx = x - width;
  ctx.page.drawText(str, {
    x: tx,
    y: ty(ctx, y) - size * 0.72,
    size,
    font,
    color: BLACK,
  });
}

/** Chữ dọc, đọc từ dưới lên (90°), tâm tại (x, y). */
function vtext(ctx: Ctx, str: string, x: number, y: number, size = 9, bold = false) {
  const font = bold ? ctx.fontBold : ctx.font;
  const width = font.widthOfTextAtSize(str, size);
  ctx.page.drawText(str, {
    x: x - size * 0.35,
    y: ty(ctx, y) - width / 2,
    size,
    font,
    color: BLACK,
    rotate: degrees(90),
  });
}

function circle(ctx: Ctx, cx: number, cy: number, r: number, fill = true) {
  ctx.page.drawEllipse({
    x: cx,
    y: ty(ctx, cy),
    xScale: r,
    yScale: r,
    borderColor: BLACK,
    borderWidth: fill ? 0 : 0.7,
    color: fill ? BLACK : undefined,
    rotate: degrees(0),
  });
}

function tick(ctx: Ctx, x: number, y: number, s = 3.2) {
  line(ctx, x - s, y + s, x + s, y - s, 0.55);
}

function dimChainV(
  ctx: Ctx,
  x: number,
  yEdges: number[],
  labels: string[],
  size = 7.5,
  textSide: "left" | "right" = "left",
  textGap = 10,
) {
  if (yEdges.length < 2) return;
  line(ctx, x, yEdges[0], x, yEdges[yEdges.length - 1], 0.45);
  yEdges.forEach((y) => tick(ctx, x, y));
  for (let i = 0; i < labels.length && i + 1 < yEdges.length; i += 1) {
    const a = yEdges[i];
    const b = yEdges[i + 1];
    const mid = (a + b) / 2;
    const tw = ctx.font.widthOfTextAtSize(labels[i], size);
    const lx = textSide === "left" ? x - textGap : x + textGap;
    if (Math.abs(b - a) > tw + 12) vtext(ctx, labels[i], lx, mid, size);
    else textVCenter(ctx, labels[i], lx, mid, size, false, textSide === "left" ? "right" : "left");
  }
}

function dimH(ctx: Ctx, x0: number, x1: number, y: number, label: string, size = 8, above = false) {
  line(ctx, x0, y, x1, y, 0.45);
  tick(ctx, x0, y, 2.8);
  tick(ctx, x1, y, 2.8);
  text(ctx, label, (x0 + x1) / 2, above ? y - 2 : y + size + 2, size, false, "center");
}

/** Chữ căn giữa theo chiều dọc tại cy (tâm vòng tròn / đường dẫn). */
function textVCenter(
  ctx: Ctx,
  str: string,
  x: number,
  cy: number,
  size = 9,
  bold = false,
  align: "left" | "center" | "right" = "left",
) {
  const font = bold ? ctx.fontBold : ctx.font;
  const width = font.widthOfTextAtSize(str, size);
  let tx = x;
  if (align === "center") tx = x - width / 2;
  if (align === "right") tx = x - width;
  ctx.page.drawText(str, {
    x: tx,
    y: ty(ctx, cy) - size * 0.42,
    size,
    font,
    color: BLACK,
  });
}

function balloon(ctx: Ctx, x: number, y: number, n: number, r = 7.4) {
  ctx.page.drawEllipse({
    x,
    y: ty(ctx, y),
    xScale: r,
    yScale: r,
    color: WHITE,
    borderColor: BLACK,
    borderWidth: 0.8,
    rotate: degrees(0),
  });
  const str = String(n);
  const size = Math.min(8.0, r * 1.02);
  const font = ctx.fontBold;
  const tw = font.widthOfTextAtSize(str, size);
  ctx.page.drawText(str, {
    x: x - tw / 2,
    y: ty(ctx, y) - size * 0.42,
    size,
    font,
    color: BLACK,
  });
}

/** Đường chỉ; vòng số nằm trên line tại tỉ lệ t (0.5 = giữa thanh). */
function leaderMark(
  ctx: Ctx,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  n: number,
  r = 7.4,
  t = 0.5,
) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const mx = x0 + dx * t;
  const my = y0 + dy * t;
  const gap = r + 1.05;
  const g0 = Math.min(gap, Math.max(0, len * t - 0.4));
  const g1 = Math.min(gap, Math.max(0, len * (1 - t) - 0.4));
  if (g0 > 0.5) line(ctx, x0, y0, mx - ux * g0, my - uy * g0, 0.4);
  if (g1 > 0.5) line(ctx, mx + ux * g1, my + uy * g1, x1, y1, 0.4);
  balloon(ctx, mx, my, n, r);
  return { mx, my };
}

function n2(v: number) {
  return Math.round(v * 100) / 100;
}

function strokeSvg(ctx: Ctx, d: string, originX: number, originPdfY: number, w = 0.85) {
  ctx.page.drawSvgPath(d, {
    x: originX,
    y: originPdfY,
    borderColor: BLACK,
    borderWidth: w,
    borderLineCap: LineCapStyle.Round,
  });
}

/** Đai chữ nhật: 3 góc bo, móc 135° chồng tại góc trên-trái. (x,y) góc trên-trái, y xuống. */
function drawRoundedStirrup(
  ctx: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  stroke = 0.85,
  hookRatio = 0.22,
) {
  if (w < 8 || h < 8) {
    rect(ctx, x, y, w, h, stroke);
    return;
  }
  const r = Math.max(2.6, Math.min(Math.min(w, h) * 0.18, Math.min(w, h) / 2 - 1.1));
  const hook = Math.max(5.5, Math.min(13, Math.min(w, h) * hookRatio));
  const d = hook * 0.7071;
  let gap = Math.max(1.8, Math.min(3.6, stroke * 2.2));
  if (h - gap < r + 2) gap = Math.max(1.2, h - r - 2);
  if (w - gap < r + 2) gap = Math.max(1.2, w - r - 2);
  const k = 0.5522847498;
  const rk = r * k;
  const L = (px: number, py: number) => `${n2(px)} ${n2(py)}`;
  // pdf-lib SVG: gốc trên-trái, y xuống (scale y = -1).
  const path = [
    `M ${L(gap + d, d)}`,
    `L ${L(gap, 0)}`,
    `L ${L(w - r, 0)}`,
    `C ${L(w - r + rk, 0)} ${L(w, rk)} ${L(w, r)}`,
    `L ${L(w, h - r)}`,
    `C ${L(w, h - r + rk)} ${L(w - rk, h)} ${L(w - r, h)}`,
    `L ${L(r, h)}`,
    `C ${L(r - rk, h)} ${L(0, h - rk)} ${L(0, h - r)}`,
    `L ${L(0, gap)}`,
    `L ${L(d, gap + d)}`,
  ].join(" ");
  strokeSvg(ctx, path, x, ty(ctx, y), stroke);
}

/** Đai C / U: thân bo góc, hai đầu móc. */
function drawCStirrup(
  ctx: Ctx,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  open: "right" | "down",
  stroke = 0.8,
) {
  const hook = Math.max(5, Math.min(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 0.18);
  const ret = Math.max(3.2, hook * 0.55);
  const r = Math.max(1.8, hook * 0.28);
  const k = 0.5522847498;
  const left = Math.min(x0, x1);
  const top = Math.min(y0, y1);
  const w = Math.abs(x1 - x0);
  const h = Math.abs(y1 - y0);
  const L = (px: number, py: number) => `${n2(px)} ${n2(py)}`;
  const rk = r * k;
  const path =
    open === "right"
      ? [
          `M ${L(hook, ret)}`,
          `L ${L(hook, 0)}`,
          `L ${L(r, 0)}`,
          `C ${L(r - rk, 0)} ${L(0, rk)} ${L(0, r)}`,
          `L ${L(0, h - r)}`,
          `C ${L(0, h - r + rk)} ${L(r - rk, h)} ${L(r, h)}`,
          `L ${L(hook, h)}`,
          `L ${L(hook, h - ret)}`,
        ].join(" ")
      : [
          `M ${L(ret, hook)}`,
          `L ${L(0, hook)}`,
          `L ${L(0, r)}`,
          `C ${L(0, r - rk)} ${L(rk, 0)} ${L(r, 0)}`,
          `L ${L(w - r, 0)}`,
          `C ${L(w - r + rk, 0)} ${L(w, rk)} ${L(w, r)}`,
          `L ${L(w, hook)}`,
          `L ${L(w - ret, hook)}`,
        ].join(" ");
  strokeSvg(ctx, path, left, ty(ctx, top), stroke);
}

function elevTriangle(ctx: Ctx, x: number, y: number) {
  const py = ty(ctx, y);
  ctx.page.drawSvgPath("M 0 4 L 9 0 L 9 8 Z", { x, y: py - 4, color: BLACK });
}

/** Cao độ nằm trên đường phân tầng; tam giác vẫn ghim vào đường. */
function elevMark(ctx: Ctx, xTri: number, yLine: number, label: string) {
  elevTriangle(ctx, xTri, yLine);
  textVCenter(ctx, label, xTri + 12, yLine - 12, 8);
}

function storyZones(floor: Floor, index: number, section: FloorSection, column: Column): Zone[] {
  const beam = floor.beamHeightMm;
  const denseTop = Math.max(400, 610 - 40 * index);
  const bot = column.baseSplice ? 2 * lapMm(section.mainDia, column.baseSpliceD) : EMBED_MM;
  const mid = Math.max(floor.heightMm - bot - denseTop - beam, 0);
  const zones: Zone[] = [
    { id: "embed", len: bot, spacing: 100, dashed: false, label: "a100" },
    { id: "mid", len: mid, spacing: 200, dashed: false, label: "a200" },
    { id: "dense", len: denseTop, spacing: 100, dashed: false, label: "a100" },
    { id: "beam", len: beam, spacing: 0, dashed: true, label: null },
  ];
  return zones.filter((z) => z.len > 1);
}

function spliceLens(
  floor: Floor,
  section: FloorSection,
  column: Column,
  prevSection: FloorSection | null,
  isColumnBase: boolean,
): number[] {
  if (column.midSplice) {
    const nD = lapMm(section.mainDia, column.midSpliceD);
    const pos = midSplicePosMm(floor);
    return [pos, nD, Math.max(floor.heightMm - pos - nD, 0)];
  }
  if (column.baseSplice) {
    const dia = !isColumnBase && prevSection ? prevSection.mainDia : section.mainDia;
    const nD = lapMm(dia, column.baseSpliceD);
    return [nD, nD, Math.max(floor.heightMm - 2 * nD, 0)];
  }
  return [floor.heightMm];
}

/** Đỉnh sắt dưới (mm từ đáy tầng) — đoạn bẻ đầu tiên khớp các cao độ này. */
function lowerSteelTopsMm(
  floor: Floor,
  section: FloorSection,
  column: Column,
  prevSection: FloorSection | null,
  isColumnBase: boolean,
): number[] {
  if (column.midSplice) {
    const nD = lapMm(section.mainDia, column.midSpliceD);
    const pos = midSplicePosMm(floor);
    return [pos, pos + nD];
  }
  if (column.baseSplice && !isColumnBase) {
    const dia = prevSection ? prevSection.mainDia : section.mainDia;
    const nD = lapMm(dia, column.baseSpliceD);
    return [nD, 2 * nD];
  }
  return [];
}

function stirrupTicksH(
  ctx: Ctx,
  xL: number,
  xR: number,
  yTop: number,
  yBot: number,
  spacingMm: number,
  scale: number,
) {
  if (spacingMm <= 0) return;
  const step = spacingMm * scale;
  if (step < 2.2) return;
  const span = Math.abs(yBot - yTop);
  const n = Math.max(2, Math.round(span / step));
  for (let i = 0; i <= n; i += 1) {
    const y = yTop + (span * i) / n;
    line(ctx, xL + 1.2, y, xR - 1.2, y, 0.35);
  }
}

function zigzagV(ctx: Ctx, x: number, y0: number, y1: number) {
  const mid = (y0 + y1) / 2;
  const z = 4.2;
  const g = 7;
  line(ctx, x, y0, x, mid - g, 0.7, [5, 3.2]);
  line(ctx, x, mid - g, x - z, mid - g / 2, 0.7);
  line(ctx, x - z, mid - g / 2, x + z, mid + g / 2, 0.7);
  line(ctx, x + z, mid + g / 2, x, mid + g, 0.7);
  line(ctx, x, mid + g, x, y1, 0.7, [5, 3.2]);
}

function drawBeamBoxV(ctx: Ctx, x: number, y: number, w: number, h: number) {
  line(ctx, x, y, x + w, y, 0.7, [5, 3.2]);
  line(ctx, x, y + h, x + w, y + h, 0.7, [5, 3.2]);
  zigzagV(ctx, x, y, y + h);
  zigzagV(ctx, x + w, y, y + h);
}

/** Bẻ cổ chai ngắn ngay đỉnh sắt dưới: đoạn lệch cao bằng sắt dưới, rồi bẻ gọn. */
function crankBarV(
  ctx: Ctx,
  xAlign: number,
  yTop: number,
  yBot: number,
  crankY: number,
  offset: number,
  w = 1.05,
) {
  const run = Math.max(2.2, Math.min(3.6, Math.abs(offset) * 0.45));
  const yHi = Math.max(yTop + 1, crankY - run);
  line(ctx, xAlign + offset, yBot, xAlign + offset, crankY, w);
  line(ctx, xAlign + offset, crankY, xAlign, yHi, w);
  line(ctx, xAlign, yHi, xAlign, yTop, w);
}

function barPoints(section: FloorSection, x: number, y: number, w: number, h: number) {
  const barR = Math.max(2.2, Math.min(3.6, Math.min(w, h) / 14));
  const m = Math.max(7, Math.min(w, h) * 0.15);
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < section.barsX; i += 1) {
    const t = section.barsX === 1 ? 0.5 : i / (section.barsX - 1);
    const px = x + m + t * (w - 2 * m);
    pts.push([px, y + m], [px, y + h - m]);
  }
  for (let i = 1; i < section.barsY - 1; i += 1) {
    const t = i / (section.barsY - 1);
    const py = y + m + t * (h - 2 * m);
    pts.push([x + m, py], [x + w - m, py]);
  }
  return { pts, barR, m };
}

function drawSectionTies(
  ctx: Ctx,
  section: FloorSection,
  x: number,
  y: number,
  w: number,
  h: number,
  pad: number,
) {
  const sLeft = x + pad;
  const sTop = y + pad;
  const sW = w - 2 * pad;
  const sH = h - 2 * pad;
  const sRight = sLeft + sW;
  const sBottom = sTop + sH;
  const barR = Math.max(2.2, Math.min(3.6, Math.min(w, h) / 14));
  const barInset = pad + 0.4 + barR + 0.8;
  const insetPad = barInset - pad;
  const xs = edgeBarCenters(section.barsX, x + barInset, w - 2 * barInset);
  const ys = edgeBarCenters(section.barsY, y + barInset, h - 2 * barInset);
  if (hasMainStirrup(section)) {
    drawRoundedStirrup(ctx, sLeft, sTop, sW, sH, 0.85, 0.26);
  }
  if (nestedAlongX(section) && !section.tieDouble.enabled) {
    const box = nestedTieRect(section.barsX, xs, insetPad, sTop, sH, "x");
    drawRoundedStirrup(ctx, box.x, box.y, box.w, box.h, 0.7);
  }
  if (nestedAlongY(section) && !section.tieDouble.enabled) {
    const box = nestedTieRect(section.barsY, ys, insetPad, sLeft, sW, "y");
    drawRoundedStirrup(ctx, box.x, box.y, box.w, box.h, 0.7);
  }
  if (doubleAlongX(section) && !section.tieNested.enabled) {
    const wrap = doubleMinWrap(section.barsX);
    const leftBox = nestedTieRect(section.barsX, xs, insetPad, sTop, sH, "x", wrap, "start");
    const rightBox = nestedTieRect(section.barsX, xs, insetPad, sTop, sH, "x", wrap, "end");
    drawRoundedStirrup(ctx, leftBox.x, leftBox.y, leftBox.w, leftBox.h, 0.7);
    drawRoundedStirrup(ctx, rightBox.x, rightBox.y, rightBox.w, rightBox.h, 0.7);
  }
  if (doubleAlongY(section) && !section.tieNested.enabled) {
    const wrap = doubleMinWrap(section.barsY);
    const topBox = nestedTieRect(section.barsY, ys, insetPad, sLeft, sW, "y", wrap, "start");
    const botBox = nestedTieRect(section.barsY, ys, insetPad, sLeft, sW, "y", wrap, "end");
    drawRoundedStirrup(ctx, topBox.x, topBox.y, topBox.w, topBox.h, 0.7);
    drawRoundedStirrup(ctx, botBox.x, botBox.y, botBox.w, botBox.h, 0.7);
  }
  if (cTieAlongX(section)) {
    const cx = sLeft + sW / 2;
    drawCStirrup(ctx, cx, sTop, cx + Math.max(8, pad * 0.9), sBottom, "right", 0.8);
  }
  if (cTieAlongY(section)) {
    const cy = sTop + sH / 2;
    drawCStirrup(ctx, sLeft, cy, sRight, cy + Math.max(8, pad * 0.9), "down", 0.8);
  }
}

function extraTieTargets(
  section: FloorSection,
  x: number,
  y: number,
  w: number,
  h: number,
  pad: number,
  kind: SectionMark["kind"],
): Array<{ x: number; y: number; w: number; h: number }> {
  const sLeft = x + pad;
  const sTop = y + pad;
  const sW = w - 2 * pad;
  const sH = h - 2 * pad;
  const barR = Math.max(2.2, Math.min(3.6, Math.min(w, h) / 14));
  const barInset = pad + 0.4 + barR + 0.8;
  const insetPad = barInset - pad;
  const xs = edgeBarCenters(section.barsX, x + barInset, w - 2 * barInset);
  const ys = edgeBarCenters(section.barsY, y + barInset, h - 2 * barInset);
  const out: Array<{ x: number; y: number; w: number; h: number }> = [];
  if (kind === "nested" && !section.tieDouble.enabled) {
    if (nestedAlongX(section)) out.push(nestedTieRect(section.barsX, xs, insetPad, sTop, sH, "x"));
    if (nestedAlongY(section)) out.push(nestedTieRect(section.barsY, ys, insetPad, sLeft, sW, "y"));
  }
  if (kind === "double" && !section.tieNested.enabled) {
    if (doubleAlongX(section)) {
      const wrap = doubleMinWrap(section.barsX);
      out.push(nestedTieRect(section.barsX, xs, insetPad, sTop, sH, "x", wrap, "start"));
      out.push(nestedTieRect(section.barsX, xs, insetPad, sTop, sH, "x", wrap, "end"));
    }
    if (doubleAlongY(section)) {
      const wrap = doubleMinWrap(section.barsY);
      out.push(nestedTieRect(section.barsY, ys, insetPad, sLeft, sW, "y", wrap, "start"));
      out.push(nestedTieRect(section.barsY, ys, insetPad, sLeft, sW, "y", wrap, "end"));
    }
  }
  if (kind === "c") {
    if (cTieAlongX(section)) {
      const cx = sLeft + sW / 2;
      out.push({ x: cx, y: sTop, w: Math.max(8, pad * 0.9), h: sH });
    }
    if (cTieAlongY(section)) {
      const cy = sTop + sH / 2;
      out.push({ x: sLeft, y: cy, w: sW, h: Math.max(8, pad * 0.9) });
    }
  }
  return out.filter((b) => b.w > 1 && b.h > 1);
}

function drawMarkTable(ctx: Ctx, x: number, y: number, rows: SectionMark[]) {
  const sttW = 22;
  const nameW = 112;
  const specW = 54;
  const tw = sttW + nameW + specW;
  const rh = 19;
  rows.forEach((row, i) => {
    const ry = y + i * rh;
    rect(ctx, x, ry, sttW, rh, 0.45);
    rect(ctx, x + sttW, ry, nameW, rh, 0.45);
    rect(ctx, x + sttW + nameW, ry, specW, rh, 0.45);
    const cy = ry + rh / 2;
    textVCenter(ctx, String(row.mark), x + sttW / 2, cy, 8, true, "center");
    textVCenter(ctx, row.name, x + sttW + 5, cy, 7, false, "left");
    textVCenter(ctx, row.spec, x + sttW + nameW + specW / 2, cy, 7.5, true, "center");
  });
  rect(ctx, x, y, tw, rows.length * rh, 0.6);
  return { w: tw, h: rows.length * rh };
}

function drawSectionDetail(
  ctx: Ctx,
  boxX: number,
  boxY: number,
  maxW: number,
  maxH: number,
  section: FloorSection,
  shape: Column["shape"],
) {
  const marks = sectionMarks(section);
  const tableH = marks.length * 19;
  const leftAnno = 160;
  const topAnno = 34;
  const botDim = 44;
  const dimGap = 36;
  const isoCol = 108;
  const availH = Math.max(58, maxH - topAnno - botDim - tableH - 14);
  const availW = Math.max(52, maxW - leftAnno - dimGap - isoCol - 8);
  const aspect = section.cy / Math.max(section.cx, 1);
  let w = Math.min(108, availW);
  let h = w * aspect;
  if (h > availH) {
    h = availH;
    w = h / Math.max(aspect, 0.35);
  }
  w = Math.max(52, w);
  h = Math.max(52, h);
  const x = boxX + leftAnno;
  const y = boxY + topAnno;
  const pad = Math.max(8, Math.min(w, h) * 0.13);

  if (shape === "TRON") {
    const r = Math.min(w, h) / 2 - 1;
    circle(ctx, x + w / 2, y + h / 2, r, false);
    if (hasMainStirrup(section)) circle(ctx, x + w / 2, y + h / 2, r - pad, false);
  } else {
    rect(ctx, x, y, w, h, 1.15);
    drawSectionTies(ctx, section, x, y, w, h, pad);
  }

  const { pts, barR } = barPoints(section, x, y, w, h);
  pts.forEach(([px, py]) => circle(ctx, px, py, barR, true));

  dimH(ctx, x, x + w, y + h + 18, String(section.cx), 8);
  dimChainV(ctx, x + w + 18, [y, y + h], [String(section.cy)], 8, "right", 13);

  const longBar = pts[0];
  let mark1Y = y + 10;
  if (longBar) {
    const yL = longBar[1];
    mark1Y = yL;
    const x0 = x - 108;
    const x1 = longBar[0] - barR - 0.5;
    const t = Math.max(0.38, Math.min(0.52, (x - 10 - x0) / Math.max(x1 - x0, 1)));
    leaderMark(ctx, x0, yL, x1, yL, 1, 7.4, t);
    textVCenter(ctx, formatBarLabel(section), x0 - 4, yL, 9, true, "right");
  }

  const mainMark = markOf(section, "main");
  if (mainMark != null && hasMainStirrup(section)) {
    const x0 = x + 2;
    const y0 = y - 34;
    const x1 = x + w * 0.42;
    const y1 = y + pad + 1;
    leaderMark(ctx, x0, y0, x1, y1, mainMark, 7.4, 0.5);
    textVCenter(ctx, `Ø${section.tieDia}a200(100)`, x0 + 16, y0 - 2, 8);
  }

  const extraKinds: Array<SectionMark["kind"]> = ["nested", "double", "c"];
  extraKinds.forEach((kind) => {
    const mark = markOf(section, kind);
    if (mark == null) return;
    extraTieTargets(section, x, y, w, h, pad, kind).slice(0, 2).forEach((box, i) => {
      const cy = box.y + box.h / 2;
      let yL = Math.min(y + h - 10, Math.max(y + 14, cy));
      if (Math.abs(yL - mark1Y) < 18) yL = Math.min(y + h - 10, mark1Y + 22);
      if (i > 0) yL = Math.min(y + h - 10, yL + 16);
      const x0 = x - 108;
      const x1 = box.x;
      const t = Math.max(0.38, Math.min(0.55, (x - 8 - x0) / Math.max(x1 - x0, 1)));
      leaderMark(ctx, x0, yL, x1, yL, mark, 7.4, t);
    });
  });

  const isoMarks = marks.filter((row) => row.kind !== "long");
  const isoW = 32;
  const isoH = Math.max(26, isoW * Math.min(aspect, 1.2));
  const isoX = x + w + dimGap + 18;
  const isoY = y + 28;
  isoMarks.forEach((row, i) => {
    const scale = row.kind === "main" ? 1 : 0.84;
    const iw = isoW * scale;
    const ih = isoH * scale;
    const dx = isoX + i * (isoW + 20);
    const dy = isoY + (isoH - ih) / 2;
    if (row.kind === "c") drawCStirrup(ctx, dx, dy, dx + iw, dy + ih, "right", 1.05);
    else drawRoundedStirrup(ctx, dx, dy, iw, ih, 1.05, 0.4);
    const cx = dx + iw / 2;
    leaderMark(ctx, cx, dy - 28, cx, dy, row.mark, 6.8, 0.5);
  });

  const tx = x;
  const ty0 = y + h + botDim;
  drawMarkTable(ctx, tx, Math.min(ty0, boxY + maxH - tableH - 2), marks);
}

function floorBandYs(floors: Floor[], scale: number, elevBot: number) {
  const bands: Array<{ floor: Floor; index: number; yTop: number; yBot: number }> = [];
  let yBot = elevBot;
  floors.forEach((floor, index) => {
    const hPx = floor.heightMm * scale;
    const yTop = yBot - hPx;
    bands.push({ floor, index, yTop, yBot });
    yBot = yTop;
  });
  return bands;
}

function drawColumnSheet(
  ctx: Ctx,
  box: { x: number; y: number; w: number; h: number },
  project: Project,
  column: Column,
) {
  const col = normalizeColumn(column);
  const footerH = 70;
  const gx = box.x;
  const gy = box.y;
  const gw = box.w;
  const gh = box.h;
  const workTop = gy;
  const workBot = gy + gh - footerH;
  const totalMm = project.floors.reduce((s, f) => s + f.heightMm, 0);
  const scale = (workBot - workTop) / Math.max(totalMm, 1);

  const xA = gx;
  const xB = gx + 52;
  const xC = gx + 118;
  const xD = gx + Math.min(gw * 0.62, gw - 340);
  const xE = gx + gw;

  rect(ctx, gx, gy, gw, gh, 1.05);
  line(ctx, xB, gy, xB, workBot, 0.65);
  line(ctx, xC, gy, xC, gy + gh, 0.7);
  line(ctx, xD, gy, xD, gy + gh, 0.7);
  line(ctx, gx, workBot, gx + gw, workBot, 0.85);
  line(ctx, xD, workBot + footerH / 2, xE, workBot + footerH / 2, 0.55);

  fillRect(ctx, gx, workBot, xC - gx, footerH, GRAY);
  fillRect(ctx, xC, workBot, xD - xC, footerH, GRAY);
  fillRect(ctx, xD, workBot, xE - xD, footerH / 2, GRAY2);
  fillRect(ctx, xD, workBot + footerH / 2, xE - xD, footerH / 2, GRAY);
  text(ctx, "CAO ĐỘ", (xA + xC) / 2, workBot + footerH * 0.62, 10, true, "center");
  text(ctx, "MẶT ĐỨNG", (xC + xD) / 2, workBot + footerH * 0.62, 10, true, "center");
  text(ctx, `${col.name} (SL: ${col.quantity})`, (xD + xE) / 2, workBot + footerH * 0.32, 10, true, "center");
  text(ctx, "MẶT CẮT", (xD + xE) / 2, workBot + footerH * 0.82, 10, true, "center");

  const elevations = floorElevations(project.floors);
  const bands = floorBandYs(project.floors, scale, workBot);
  const active = new Set(columnFloors(col, project.floors).map((f) => f.id));
  const firstSec = sectionFor(col, col.startFloor);
  const shaftW = Math.max(24, Math.min(40, firstSec.cx * scale));
  const dimLeftX = xC + 40;
  const shaftX = xC + 175;
  const explodedX = shaftX + shaftW + 36;
  const dimSpliceX = explodedX + 92;
  const dimTotalX = dimSpliceX + 26;

  bands.forEach(({ floor, index, yTop, yBot }) => {
    line(ctx, xA, yTop, xE, yTop, 0.5);
    vtext(ctx, `TẦNG ${floor.name}`, (xA + xB) / 2, (yTop + yBot) / 2, 10, true);
    elevMark(ctx, xB + 8, yBot, `+${(elevations[floor.id - 1] ?? 0).toFixed(3)}`);
    if (index === project.floors.length - 1) {
      elevMark(ctx, xB + 8, yTop, `+${(elevations[floor.id] ?? 0).toFixed(3)}`);
    }
    if (!active.has(floor.id)) return;

    const isColumnBase = floor.id === col.startFloor;
    const prevFloor = index > 0 ? project.floors[index - 1] : undefined;
    const prevSection = prevFloor && !isColumnBase ? sectionFor(col, prevFloor.id) : null;
    const section = sectionFor(col, floor.id);
    const zones = storyZones(floor, index, section, col);
    const zoneEdges = [yBot];
    let zy = yBot;
    zones.forEach((zone) => {
      const zh = zone.len * scale;
      const zTop = zy - zh;
      if (zone.dashed) drawBeamBoxV(ctx, shaftX, zTop, shaftW, zh);
      else stirrupTicksH(ctx, shaftX, shaftX + shaftW, zTop, zy, zone.spacing, scale);
      if (zone.label) {
        const mid = (zTop + zy) / 2;
        const mark = markOf(section, "main") ?? 2;
        const tag = `Ø${section.tieDia}${zone.label}`;
        const x0 = dimLeftX + 10;
        const x1 = shaftX - 2;
        textVCenter(ctx, tag, x0, mid - 11, 8);
        leaderMark(ctx, x0, mid, x1, mid, mark, 6.8, 0.5);
      }
      zoneEdges.push(zTop);
      zy = zTop;
    });
    dimChainV(
      ctx,
      dimLeftX,
      zoneEdges,
      zones.map((z) => String(Math.round(z.len))),
      7.5,
    );

    line(ctx, shaftX, yTop, shaftX, yBot, 1.15);
    line(ctx, shaftX + shaftW, yTop, shaftX + shaftW, yBot, 1.15);

    const inset = 5;
    const xL = shaftX + inset;
    const xR = shaftX + shaftW - inset;
    const xM = (xL + xR) / 2;
    const nShow = Math.min(4, Math.max(2, section.barsX));
    const xs =
      nShow === 2
        ? [xL, xR]
        : nShow === 3
          ? [xL, xM, xR]
          : [xL, (xL + xM) / 2, (xR + xM) / 2, xR];
    xs.forEach((x) => {
      line(ctx, x, yTop + 1, x, yBot - 1, 1.0);
    });

    const topsMm = lowerSteelTopsMm(floor, section, col, prevSection, isColumnBase);
    const amp = 5;
    const midLap = col.midSplice ? lapMm(section.mainDia, col.midSpliceD) : 0;
    if (topsMm.length) {
      topsMm.forEach((topMm, i) => {
        const x = explodedX + i * 14;
        const crankY = yBot - topMm * scale;
        const offsetH = col.midSplice ? midLap : topMm;
        const yOffsetBot = yBot - Math.max(topMm - offsetH, 0) * scale;
        line(ctx, x, yBot - 1, x, crankY, 1.05);
        crankBarV(ctx, x, yTop + 2, yOffsetBot - 1, crankY, -amp, 1.15);
      });
      const calloutY = yTop + (yBot - yTop) * 0.28;
      balloon(ctx, explodedX + 32, calloutY, 1, 6.6);
      textVCenter(ctx, formatBarLabel(section), explodedX + 44, calloutY, 8, true);
    } else {
      line(ctx, explodedX, yTop + 2, explodedX, yBot - 2, 1.15);
      line(ctx, explodedX + 14, yTop + 2, explodedX + 14, yBot - 2, 1.15);
      const calloutY = yTop + (yBot - yTop) * 0.28;
      balloon(ctx, explodedX + 32, calloutY, 1, 6.6);
      textVCenter(ctx, formatBarLabel(section), explodedX + 44, calloutY, 8, true);
    }

    const segs = spliceLens(floor, section, col, prevSection, isColumnBase);
    const spliceEdges = [yBot];
    let sy = yBot;
    segs.forEach((len) => {
      sy -= len * scale;
      spliceEdges.push(sy);
    });
    dimChainV(
      ctx,
      dimSpliceX,
      spliceEdges,
      segs.map((n) => String(Math.round(n))),
      7.5,
      "right",
    );
    dimChainV(ctx, dimTotalX, [yTop, yBot], [String(Math.round(floor.heightMm))], 8, "right");

    const secPad = 10;
    drawSectionDetail(
      ctx,
      xD + secPad,
      yTop + 16,
      xE - xD - secPad * 2,
      yBot - yTop - 22,
      section,
      col.shape,
    );
  });
}

function cellText(
  ctx: Ctx,
  str: string,
  x: number,
  y: number,
  w: number,
  h: number,
  size: number,
  align: "left" | "center" | "right" = "center",
  bold = false,
) {
  const cx = align === "left" ? x + 4 : align === "right" ? x + w - 4 : x + w / 2;
  textVCenter(ctx, str, cx, y + h / 2, size, bold, align);
}

function drawSchedulePanel(ctx: Ctx, x: number, y: number, w: number, h: number, project: Project, focus?: Column) {
  rect(ctx, x, y, w, h, 1.05);
  fillRect(ctx, x, y, w, 22, GRAY);
  const title = focus ? `BẢNG THỐNG KÊ  ·  ${focus.name}` : "BẢNG THỐNG KÊ CỐT THÉP";
  text(ctx, title, x + w / 2, y + 16, 10, true, "center");
  line(ctx, x, y + 22, x + w, y + 22, 0.8);

  const pad = 8;
  const tableX = x + pad;
  const tableY = y + 28;
  const cols = [
    { w: 122, label: "KIỆN CẤU" },
    { w: 32, label: "STT" },
    { w: 168, label: "HÌNH DẠNG, KT (mm)" },
    { w: 32, label: "Ø" },
    { w: 52, label: "DÀI" },
    { w: 40, label: "1 CK" },
    { w: 44, label: "T.BỘ" },
    { w: 58, label: "T.L (m)" },
    { w: 54, label: "KL (kg)" },
  ];
  const tableW = cols.reduce((s, c) => s + c.w, 0);
  const headH = 20;
  let cx = tableX;
  fillRect(ctx, tableX, tableY, tableW, headH, GRAY);
  cols.forEach((col) => {
    rect(ctx, cx, tableY, col.w, headH, 0.55);
    cellText(ctx, col.label, cx, tableY, col.w, headH, 6, "center", true);
    cx += col.w;
  });

  const built = buildSchedule(project);
  const rows = focus ? built.rows.filter((r) => r.member.startsWith(`${focus.name} `) || r.member.startsWith(`${focus.name} (`)) : built.rows;
  const { byDia, stirrupCounts } = built;
  const sumH = 168;
  const bodyTop = tableY + headH;
  const bodyH = h - (bodyTop - y) - sumH - 10;
  const rowH = Math.min(20, Math.max(14, bodyH / Math.max(rows.length, 1)));
  const xs: number[] = [];
  let acc = tableX;
  cols.forEach((c) => {
    xs.push(acc);
    acc += c.w;
  });

  let rowY = bodyTop;
  let lastMember = "";
  let alt = false;
  rows.forEach((row) => {
    if (rowY + rowH > bodyTop + bodyH) return;
    if (row.member !== lastMember) {
      lastMember = row.member;
      alt = !alt;
    }
    if (alt) fillRect(ctx, tableX, rowY, tableW, rowH, GRAY2);
    rect(ctx, tableX, rowY, tableW, rowH, 0.35);
    cx = tableX;
    cols.forEach((c) => {
      line(ctx, cx, rowY, cx, rowY + rowH, 0.35);
      cx += c.w;
    });

    cellText(ctx, `${row.member.split(" (")[0]} T${row.floorName}`, xs[0], rowY, cols[0].w, rowH, 5.5, "left", true);
    cellText(ctx, String(row.stt), xs[1], rowY, cols[1].w, rowH, 6.5, "center");

    const shapeX = xs[2] + 10;
    const midY = rowY + rowH * 0.55;
    if (row.kind === "stirrup") {
      const [hook, a, b] = row.segs;
      line(ctx, shapeX + 18, midY, shapeX + 62, midY, 0.7);
      line(ctx, shapeX + 18, midY, shapeX + 18, midY - 8, 0.7);
      line(ctx, shapeX + 62, midY, shapeX + 62, midY - 8, 0.7);
      text(ctx, String(a), shapeX + 40, midY - 10, 5.5, false, "center");
      text(ctx, String(b), shapeX + 66, midY - 2, 5.5);
      text(ctx, String(hook), shapeX + 14, midY - 2, 5.5, false, "right");
    } else if (row.kind === "long-hook") {
      line(ctx, shapeX + 18, midY, shapeX + 78, midY, 0.7);
      line(ctx, shapeX + 18, midY, shapeX + 18, midY - 8, 0.7);
      text(ctx, String(row.segs[0]), shapeX + 14, midY - 8, 5.5, false, "right");
      text(ctx, String(row.segs[1]), shapeX + 48, midY - 10, 5.5, false, "center");
      text(ctx, row.shapeLabel, shapeX + 84, midY, 6);
    } else {
      line(ctx, shapeX + 12, midY, shapeX + 88, midY, 0.7);
      text(ctx, String(row.lengthMm), shapeX + 50, midY - 10, 5.5, false, "center");
      text(ctx, row.shapeLabel, shapeX + 94, midY, 6);
    }

    cellText(ctx, String(row.dia), xs[3], rowY, cols[3].w, rowH, 6.5, "center");
    cellText(ctx, String(row.lengthMm), xs[4], rowY, cols[4].w, rowH, 6.5, "right");
    cellText(ctx, String(row.perMember), xs[5], rowY, cols[5].w, rowH, 6.5, "center");
    cellText(ctx, String(row.totalBars), xs[6], rowY, cols[6].w, rowH, 6.5, "center");
    cellText(ctx, row.totalLengthM.toFixed(1), xs[7], rowY, cols[7].w, rowH, 6.5, "right");
    cellText(ctx, row.weightKg.toFixed(1), xs[8], rowY, cols[8].w, rowH, 6.5, "right");
    rowY += rowH;
  });
  rect(ctx, tableX, bodyTop, tableW, Math.max(rowY - bodyTop, 1), 0.7);

  const sumY = y + h - sumH;
  line(ctx, x, sumY, x + w, sumY, 0.8);
  fillRect(ctx, x, sumY, w, 20, GRAY);
  text(ctx, "TỔNG HỢP THEO ĐƯỜNG KÍNH (CẢ DỰ ÁN)", x + w / 2, sumY + 14, 8.5, true, "center");

  const sCols = [
    { w: 70, label: "Ø" },
    { w: 90, label: "KL (kg)" },
    { w: 90, label: "L (m)" },
    { w: 100, label: `Cây ${STOCK_M} m` },
  ];
  const sTableW = sCols.reduce((s, c) => s + c.w, 0);
  const sX = x + (w - sTableW) / 2;
  const sHeadY = sumY + 26;
  const sRowH = 16;
  fillRect(ctx, sX, sHeadY, sTableW, sRowH, GRAY);
  let sx = sX;
  sCols.forEach((c) => {
    rect(ctx, sx, sHeadY, c.w, sRowH, 0.5);
    cellText(ctx, c.label, sx, sHeadY, c.w, sRowH, 6.5, "center", true);
    sx += c.w;
  });
  let sy = sHeadY + sRowH;
  [...byDia.entries()]
    .sort((a, b) => a[0] - b[0])
    .forEach(([dia, val]) => {
      rect(ctx, sX, sy, sTableW, sRowH, 0.4);
      let dx = sX;
      const vals = [
        `Ø${dia}`,
        val.weight.toFixed(1),
        dia > 6 ? val.length.toFixed(1) : "—",
        dia > 6 ? String(stockBars(val.length)) : "—",
      ];
      sCols.forEach((c, i) => {
        line(ctx, dx, sy, dx, sy + sRowH, 0.4);
        cellText(ctx, vals[i], dx, sy, c.w, sRowH, 7, i === 0 ? "center" : "right", i === 0);
        dx += c.w;
      });
      sy += sRowH;
    });
  rect(ctx, sX, sHeadY, sTableW, sy - sHeadY, 0.7);

  const buckets = summaryBuckets(byDia);
  const noteY = sy + 10;
  text(
    ctx,
    `D ≤ 10: ${buckets.le10.toFixed(1)} kg    D ≤ 18: ${buckets.le18.toFixed(1)} kg    D > 18: ${buckets.gt18.toFixed(1)} kg`,
    x + w / 2,
    noteY,
    7,
    false,
    "center",
  );
  let dy = noteY + 12;
  stirrupCounts.forEach((count, key) => {
    text(ctx, `Đai ${key}: ${count} cái`, x + w / 2, dy, 6.5, false, "center");
    dy += 11;
  });
}

export async function generateColumnPdf(
  project: Project,
  fonts: { regular: ArrayBuffer; bold: ArrayBuffer },
) {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(fonts.regular, { subset: true });
  const fontBold = await doc.embedFont(fonts.bold, { subset: true });
  const columns = project.columns.length ? project.columns : [];

  columns.forEach((column, pageIndex) => {
    const page = doc.addPage([PAGE_W, PAGE_H]);
    const ctx: Ctx = { page, font, fontBold, W: PAGE_W, H: PAGE_H };
    page.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: PAGE_H, color: WHITE });
    const mx = 16;
    const my = 14;
    const frameW = PAGE_W - mx * 2;
    const frameH = PAGE_H - my * 2;
    rect(ctx, mx, my, frameW, frameH, 1.15);
    text(ctx, `SHOP DRAWING CỘT  ·  ${column.name} (SL: ${column.quantity})`, mx + 12, my + 16, 12, true);
    text(ctx, `A1 ngang  ·  trang ${pageIndex + 1}/${columns.length}`, mx + frameW - 12, my + 16, 9, false, "right");
    line(ctx, mx, my + 22, mx + frameW, my + 22, 0.7);

    const innerY = my + 40;
    const innerH = frameH - 52;
    const drawW = 1380;
    const gap = 10;
    const schedW = frameW - drawW - gap;
    drawColumnSheet(ctx, { x: mx, y: innerY, w: drawW, h: innerH }, project, column);
    drawSchedulePanel(ctx, mx + drawW + gap, innerY, schedW, innerH, project, column);
    text(ctx, "Một loại cột / trang — mặt đứng, cổ chai, DIM, mặt cắt theo mẫu shop drawing", mx + 10, my + frameH - 6, 7);
    text(ctx, `${project.floors.length} tầng`, mx + frameW - 10, my + frameH - 6, 7, false, "right");
  });

  if (!columns.length) {
    const page = doc.addPage([PAGE_W, PAGE_H]);
    const ctx: Ctx = { page, font, fontBold, W: PAGE_W, H: PAGE_H };
    text(ctx, "Chưa có cột.", 40, 40, 14, true);
  }

  return doc.save();
}

export function downloadPdf(bytes: Uint8Array, filename: string) {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const blob = new Blob([copy], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
