import { PDFDocument, PDFFont, PDFPage, rgb, degrees, LineCapStyle } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import {
  buildSchedule,
  columnFloors,
  edgeBarCenters,
  explodedMarksForFloor,
  floorElevations,
  formatBarLabel,
  barCount,
  ringBarCenters,
  circularTieCalloutAngle,
  barEndFlower,
  circularTieGeom,
  rectStirrupHook,
  type CircularTieOpts,
  columnDiameterMm,
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
  uniqueSectionMarks,
  stockBars,
  tieSpec,
  summaryBuckets,
  type SectionMark,
} from "./calc";
import { EMBED_MM, SLAB_HIDE_MM, STOCK_M, TOP_COVER_MM, type Column, type Floor, type FloorSection, type Project } from "./types";

/** A1 ngang — 841 × 594 mm (2384 × 1684 pt). Nhiều cột / trang. */
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
    const lx = textSide === "left" ? x - 4 : x + textGap;
    if (Math.abs(b - a) > tw + 12) {
      vtext(ctx, labels[i], lx + size * 0.35, mid, size);
    } else {
      textVCenter(ctx, labels[i], lx, mid, size, false, textSide === "left" ? "right" : "left");
    }
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

function balloon(ctx: Ctx, x: number, y: number, n: number | string, r = 7.4) {
  const str = String(n);
  ctx.page.drawCircle({
    x,
    y: ty(ctx, y),
    size: r,
    color: WHITE,
    borderColor: BLACK,
    borderWidth: 0.8,
  });
  const size = str.length > 2 ? Math.min(5.6, r * 0.72) : str.length > 1 ? Math.min(6.2, r * 0.84) : Math.min(8.0, r * 1.02);
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

function specAbove(
  ctx: Ctx,
  label: string,
  x: number,
  lineY: number,
  size: number,
  align: "left" | "center" | "right" = "center",
) {
  textVCenter(ctx, label, x, lineY - size * 0.88, size, true, align);
}

function drawExplodedBarMarks(
  ctx: Ctx,
  bars: Array<{ x: number; y0: number; y1: number; mark: string }>,
  balloonX: number,
) {
  const grouped = new Map<string, { mark: string; xBar: number; yMid: number; n: number }>();
  bars.forEach((bar) => {
    const yMid = (bar.y0 + bar.y1) / 2;
    const prev = grouped.get(bar.mark);
    if (!prev) grouped.set(bar.mark, { mark: bar.mark, xBar: bar.x, yMid, n: 1 });
    else {
      prev.yMid = (prev.yMid * prev.n + yMid) / (prev.n + 1);
      prev.n += 1;
    }
  });
  const r = 7.4;
  const minGap = r * 2 + 6;
  const items = [...grouped.values()].sort((a, b) => a.yMid - b.yMid);
  items.forEach((item, i) => {
    if (i > 0 && item.yMid - items[i - 1].yMid < minGap) {
      item.yMid = items[i - 1].yMid + minGap;
    }
  });
  items.forEach((item) => {
    const sx = balloonX - r - 0.5;
    line(ctx, item.xBar, item.yMid, sx, item.yMid, 0.45);
    balloon(ctx, balloonX, item.yMid, item.mark, r);
  });
}

/** Số hiệu ở đầu line; chữ quy cách nằm trên line, line đi suốt không bị che. */
function leaderCallout(
  ctx: Ctx,
  bx: number,
  by: number,
  tx: number,
  typt: number,
  n: number | string,
  label?: string,
  r = 7.4,
  labelSize = 8,
  specX?: number,
) {
  const dx = tx - bx;
  const dy = typt - by;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const sx = bx + ux * (r + 0.7);
  const sy = by + uy * (r + 0.7);
  line(ctx, sx, sy, tx, typt, 0.4);
  balloon(ctx, bx, by, n, r);
  if (label) {
    const ax = specX ?? (sx + tx) / 2;
    specAbove(ctx, label, ax, (sy + typt) / 2, labelSize, specX != null ? "left" : "center");
  }
}

/** Leader chữ L úp: ngang rồi xuống; chữ quy cách trên thanh ngang. */
function leaderCalloutInvL(
  ctx: Ctx,
  bx: number,
  by: number,
  elbowX: number,
  targetY: number,
  n: number | string,
  label?: string,
  r = 7.4,
  labelSize = 8,
  specX?: number,
) {
  const sx = bx + r + 0.7;
  line(ctx, sx, by, elbowX, by, 0.4);
  line(ctx, elbowX, by, elbowX, targetY, 0.4);
  balloon(ctx, bx, by, n, r);
  if (label) {
    const ax = specX ?? (sx + elbowX) / 2;
    specAbove(ctx, label, ax, by, labelSize, specX != null ? "left" : "center");
  }
}

/** Leader chữ L: ngang tới elbow rồi dọc tới đai. Chữ quy cách trên thanh ngang. */
function leaderCalloutL(
  ctx: Ctx,
  bx: number,
  by: number,
  elbowX: number,
  targetY: number,
  n: number | string,
  label?: string,
  r = 7.4,
  labelSize = 8,
  specX?: number,
) {
  const sx = bx + r + 0.7;
  line(ctx, sx, by, elbowX, by, 0.4);
  if (Math.abs(by - targetY) > 0.6) line(ctx, elbowX, by, elbowX, targetY, 0.4);
  balloon(ctx, bx, by, n, r);
  if (label) {
    const ax = specX ?? (sx + elbowX) / 2;
    specAbove(ctx, label, ax, by, labelSize, specX != null ? "left" : "center");
  }
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

/** Cung tròn, 0° = +x, 90° = +y (xuống trang). */
function arcDeg(ctx: Ctx, cx: number, cy: number, r: number, startDeg: number, endDeg: number, t: number, steps = 14) {
  const n = Math.max(8, steps);
  const s = (startDeg * Math.PI) / 180;
  const e = (endDeg * Math.PI) / 180;
  let px = cx + r * Math.cos(s);
  let py = cy + r * Math.sin(s);
  for (let i = 1; i <= n; i += 1) {
    const a = s + ((e - s) * i) / n;
    const x = cx + r * Math.cos(a);
    const y = cy + r * Math.sin(a);
    line(ctx, px, py, x, y, t);
    px = x;
    py = y;
  }
}

function dashV(ctx: Ctx, x: number, y1: number, y2: number, on = 3.2, off = 2.4, w = 0.32) {
  const top = Math.min(y1, y2);
  const bot = Math.max(y1, y2);
  for (let y = top; y < bot; y += on + off) {
    line(ctx, x, y, x, Math.min(y + on, bot), w);
  }
}

function drawBarEndFlower(ctx: Ctx, cx: number, cy: number, r: number) {
  if (r < 0.6) return;
  const f = barEndFlower(cx, cy, r);
  circle(ctx, cx, cy, r, false);
  const d = f.tris
    .map(([a, b, c]) => {
      const pt = (p: [number, number]) => `${n2(p[0])} ${n2(ty(ctx, p[1]))}`;
      return `M ${pt(a)} L ${pt(b)} L ${pt(c)} Z`;
    })
    .join(" ");
  ctx.page.drawSvgPath(d, { x: 0, y: 0, color: BLACK });
  ctx.page.drawEllipse({
    x: cx,
    y: ty(ctx, cy),
    xScale: f.hole,
    yScale: f.hole,
    color: WHITE,
    borderColor: BLACK,
    borderWidth: Math.max(0.25, r * 0.12),
    rotate: degrees(0),
  });
}

/** Đai chữ nhật: góc móc = hai nét song song + đầu hoa (ôm cạnh trái). */
function drawStirrupFrame(ctx: Ctx, x: number, y: number, w: number, h: number, t = 0.7) {
  if (w < 6 || h < 6) {
    rect(ctx, x, y, w, h, t);
    return;
  }
  const r = Math.max(0.85, Math.min(3.2, Math.min(w, h) * 0.055));
  const hook = rectStirrupHook(x, y, w, h, t);
  const L = x;
  const R = x + w;
  const T = y;
  const B = y + h;
  const open = hook.open;
  line(ctx, L + open, T, R - r, T, t);
  line(ctx, L, T + open, L, B - r, t);
  line(ctx, L + r, B, R - r, B, t);
  line(ctx, R, T + r, R, B - r, t);
  arcDeg(ctx, L + r, B - r, r, 90, 180, t);
  arcDeg(ctx, R - r, B - r, r, 0, 90, t);
  arcDeg(ctx, R - r, T + r, r, 270, 360, t);
  line(ctx, hook.innerTop.x1, hook.innerTop.y1, hook.innerTop.x2, hook.innerTop.y2, t);
  drawBarEndFlower(ctx, hook.flower.x, hook.flower.y, hook.flower.r);
}

function vtextCentered(ctx: Ctx, str: string, cx: number, yMid: number, size = 9, bold = false) {
  const font = bold ? ctx.fontBold : ctx.font;
  const tw = font.widthOfTextAtSize(str, size);
  ctx.page.drawText(str, {
    x: cx + size * 0.28,
    y: ty(ctx, yMid) - tw / 2,
    size,
    font,
    color: BLACK,
    rotate: degrees(90),
  });
}

function fitVTextSize(ctx: Ctx, str: string, maxH: number, prefer = 9) {
  const font = ctx.fontBold;
  let size = prefer;
  while (size > 5 && font.widthOfTextAtSize(str, size) > maxH - 6) size -= 0.3;
  return size;
}

function headerStack(
  ctx: Ctx,
  cx: number,
  y: number,
  h: number,
  lines: string[],
  size = 5.8,
) {
  const lead = size + 2.2;
  const block = size + lead * (lines.length - 1);
  let cy = y + (h - block) / 2 + size / 2;
  for (const line of lines) {
    textVCenter(ctx, line, cx, cy, size, true, "center");
    cy += lead;
  }
}

/** Thanh thẳng / móc L / đai C — cụm hình + kích thước nằm giữa cột. */
function drawScheduleBarSketch(
  ctx: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  kind: "straight" | "l-hook" | "u-bar",
  segs: number[],
) {
  const size = 5.5;
  const midY = y + h * 0.58;
  const hookH = Math.min(7.5, h * 0.38);
  if (kind === "u-bar") {
    const [left, mid, right] = segs;
    const lineW = Math.min(56, w * 0.38);
    const leftW = ctx.font.widthOfTextAtSize(String(left), size);
    const rightW = ctx.font.widthOfTextAtSize(String(right), size);
    const total = leftW + 6 + lineW + 6 + rightW;
    const x0 = x + (w - total) / 2 + leftW + 6;
    const x1 = x0 + lineW;
    line(ctx, x0, midY, x1, midY, 0.7);
    line(ctx, x0, midY, x0, midY - hookH, 0.7);
    line(ctx, x1, midY, x1, midY - hookH, 0.7);
    text(ctx, String(mid), (x0 + x1) / 2, midY - 10, size, false, "center");
    text(ctx, String(left), x0 - 4, midY - 2, size, false, "right");
    text(ctx, String(right), x1 + 4, midY - 2, size);
    return;
  }
  const lineW = Math.min(96, w * 0.76);
  const x0 = x + (w - lineW) / 2;
  const x1 = x0 + lineW;
  line(ctx, x0, midY, x1, midY, 0.7);
  if (kind === "l-hook") {
    const hook = segs[0];
    const len = segs[1];
    line(ctx, x0, midY, x0, midY - hookH, 0.7);
    text(ctx, String(hook), x0 - 4, midY - 8, size, false, "right");
    text(ctx, String(len), (x0 + x1) / 2, midY - 10, size, false, "center");
    return;
  }
  text(ctx, String(segs[0]), (x0 + x1) / 2, midY - 10, size, false, "center");
}

/** Ô thống kê: cạnh ngang trong lòng, cạnh đứng bên trái, móc bên phải. */
function drawScheduleStirrup(
  ctx: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  hook: number,
  a: number,
  b: number,
) {
  const size = 5.4;
  const widthLabel = String(Math.round(a));
  const heightLabel = String(Math.round(b));
  const hookLabel = String(Math.round(hook));
  const leftW = ctx.font.widthOfTextAtSize(heightLabel, size);
  const rightW = ctx.font.widthOfTextAtSize(hookLabel, size);
  const bw = Math.min(38, Math.max(20, w * 0.32));
  const bh = Math.min(h - 4, 12.5);
  const leftPad = leftW + 5;
  const rightPad = rightW + 5.2;
  const sx = x + leftPad + Math.max(0, (w - leftPad - rightPad - bw) / 2);
  const sy = y + (h - bh) / 2;
  const hookGeom = rectStirrupHook(sx, sy, bw, bh, 0.65);
  drawStirrupFrame(ctx, sx, sy, bw, bh, 0.65);
  textVCenter(ctx, heightLabel, sx - 2.8, sy + bh / 2, size, false, "right");
  textVCenter(ctx, widthLabel, sx + bw / 2, sy + bh / 2, size, false, "center");
  textVCenter(ctx, hookLabel, hookGeom.flower.x + hookGeom.flower.r + 3.2, hookGeom.flower.y, size, false, "left");
}

function arcShort(ctx: Ctx, cx: number, cy: number, r: number, a0: number, a1: number, sweep: 0 | 1, t: number) {
  let d0 = (a0 * 180) / Math.PI;
  let d1 = (a1 * 180) / Math.PI;
  if (sweep === 1) {
    while (d1 < d0) d1 += 360;
  } else {
    while (d1 > d0) d1 -= 360;
  }
  arcDeg(ctx, cx, cy, r, d0, d1, t, 16);
}

function drawCircularTie(ctx: Ctx, cx: number, cy: number, r: number, stroke: number, opts: CircularTieOpts = {}) {
  const geom = circularTieGeom(cx, cy, r, opts);
  arcDeg(ctx, cx, cy, r, geom.startDeg, geom.endDeg, stroke, 48);
  geom.hooks.forEach((h) => {
    const f = h.fillet;
    arcShort(ctx, f.x, f.y, f.r, f.a0, f.a1, f.sweep, stroke);
    line(ctx, h.tanLine[0], h.tanLine[1], h.tip[0], h.tip[1], stroke);
  });
  return geom;
}

function drawScheduleRoundStirrup(
  ctx: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  hook: number,
  dia: number,
  mainDia: number,
) {
  const size = 5.2;
  const r = Math.min(h * 0.32, w * 0.15);
  const cx = x + w * 0.38;
  const cy = y + h / 2 + 0.6;
  const barR = Math.max(1.5, r * (mainDia / Math.max(dia, 1)));
  const geom = drawCircularTie(ctx, cx, cy, r, 0.7, {
    gapCenter: 0,
    gapChord: 2 * barR,
    bar: {
      x: cx + (r - barR) * 1,
      y: cy,
      r: barR,
    },
    hookLen: Math.max(6, r * 0.55),
  });
  circle(ctx, geom.bar.x, geom.bar.y, geom.bar.r, true);
  const upper = geom.hooks[0].tip[1] <= geom.hooks[1].tip[1] ? geom.hooks[0] : geom.hooks[1];
  const lower = upper === geom.hooks[0] ? geom.hooks[1] : geom.hooks[0];
  textVCenter(ctx, String(Math.round(dia)), cx, cy, size, false, "center");
  const hookX = cx + r + 4.2;
  textVCenter(ctx, String(Math.round(hook)), hookX, upper.tanLine[1] - 0.2, size, false, "left");
  textVCenter(ctx, String(Math.round(hook)), hookX, lower.tanLine[1] + 0.2, size, false, "left");
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
  const fr = Math.max(1.4, hook * 0.22);
  if (open === "right") {
    drawBarEndFlower(ctx, left + hook, top + ret, fr);
    drawBarEndFlower(ctx, left + hook, top + h - ret, fr);
  } else {
    drawBarEndFlower(ctx, left + ret, top + hook, fr);
    drawBarEndFlower(ctx, left + w - ret, top + hook, fr);
  }
}

function elevMark(ctx: Ctx, x: number, yLine: number, label: string) {
  const h = 6.8;
  const hw = 4.3;
  const shelfY = yLine - h - 5.6;
  const stemTop = shelfY - 2.0;
  const size = 7.4;
  const tw = ctx.font.widthOfTextAtSize(label, size);
  const shelfLen = Math.max(tw + 5.5, 28);
  const py = ty(ctx, yLine);
  /* pdf-lib SVG y đi xuống: dùng y âm để tam giác nằm trên đường, mũi nhọn chạm đường phân tầng. */
  const y = -h;

  ctx.page.drawSvgPath(`M 0 0 L ${hw} ${y} L 0 ${y} Z`, {
    x,
    y: py,
    color: BLACK,
    borderColor: BLACK,
    borderWidth: 0.45,
  });
  ctx.page.drawSvgPath(`M 0 0 L ${-hw} ${y} L 0 ${y} Z`, {
    x,
    y: py,
    color: WHITE,
    borderColor: BLACK,
    borderWidth: 0.45,
  });
  ctx.page.drawSvgPath(`M ${-hw} ${y} L 0 0 L ${hw} ${y} Z`, {
    x,
    y: py,
    borderColor: BLACK,
    borderWidth: 0.55,
  });

  line(ctx, x, stemTop, x, yLine, 0.65);
  line(ctx, x, shelfY, x + shelfLen, shelfY, 0.65);
  specAbove(ctx, label, x + 2.6, shelfY, size, "left");
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
    const below = Math.max(pos - nD, 0);
    const lowerLap = Math.min(nD, pos);
    const upperLap = nD;
    const above = Math.max(floor.heightMm - pos - nD, 0);
    return [below, lowerLap, upperLap, above].filter((len) => len > 0.5);
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
  if (column.baseSplice) {
    const dia = !isColumnBase && prevSection ? prevSection.mainDia : section.mainDia;
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

function slabHidePx(scale: number, beamHpx: number) {
  if (beamHpx < 1) return 0;
  return Math.min(Math.max(2.2, SLAB_HIDE_MM * scale), beamHpx - 0.8);
}

function beamEndBreak(ctx: Ctx, x: number, yTop: number, yBot: number, dir: 1 | -1) {
  const mid = (yTop + yBot) / 2;
  const z = 4.6 * dir;
  const g = Math.max(4.2, Math.min(7.2, Math.abs(yBot - yTop) * 0.22));
  const w = 0.35;
  line(ctx, x, yTop, x, mid - g, w);
  line(ctx, x, mid - g, x + z, mid - g * 0.2, w);
  line(ctx, x + z, mid - g * 0.2, x - z, mid + g * 0.2, w);
  line(ctx, x - z, mid + g * 0.2, x, mid + g, w);
  line(ctx, x, mid + g, x, yBot, w);
}

/** Dầm mặt đứng: nét đỉnh/đáy liền, Z-break hai đầu. */
const BEAM_STUB = 28;
function drawElevationBeam(
  ctx: Ctx,
  shaftX: number,
  shaftW: number,
  yTop: number,
  yBot: number,
  hidePx: number,
) {
  const stub = BEAM_STUB;
  const xL = shaftX - stub;
  const xR = shaftX + shaftW + stub;
  const x0 = shaftX;
  const x1 = shaftX + shaftW;
  const dash = [3.4, 2.1];
  const d = Math.max(2.2, hidePx);

  line(ctx, xL, yTop, xR, yTop, 0.85);
  line(ctx, xL, yBot, xR, yBot, 0.85);
  line(ctx, xL + 2, yTop + d, x0, yTop + d, 0.5, dash);
  line(ctx, x1, yTop + d, xR - 2, yTop + d, 0.5, dash);

  beamEndBreak(ctx, xL, yTop, yBot, -1);
  beamEndBreak(ctx, xR, yTop, yBot, 1);
}

/** Cao độ bẻ móc khoá đầu (dưới lớp bọc, mm → pt). */
function headLockY(yTop: number, scale: number) {
  return yTop + Math.max(2.4, TOP_COVER_MM * scale);
}

/** Chiều dài móc 10d trên bản vẽ, kẹp để khỏi đè dầm / DIM. */
function headLockLenPx(dia: number, scale: number, maxLen?: number) {
  const len = Math.max(7.5, Math.min(26, 10 * dia * scale));
  return maxLen == null ? len : Math.min(len, Math.max(5.5, maxLen));
}

function drawHeadLockHook(ctx: Ctx, x: number, y: number, dir: 1 | -1, len: number, w = 1.15) {
  if (len < 2) return;
  line(ctx, x, y, x + dir * len, y, w);
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

/** Cùng hệ tọa độ: đai ôm ngoài sắt chủ, tâm thanh nằm trong lòng đai. */
function sectionGeom(section: FloorSection, x: number, y: number, w: number, h: number) {
  const barR = Math.max(2.2, Math.min(3.6, Math.min(w, h) / 14));
  const stroke = 0.85;
  const cover = Math.max(6.2, Math.min(w, h) * 0.105);
  const gap = 0.9;
  const wrapPad = stroke / 2 + gap + barR;
  const barInset = cover + wrapPad;
  const sLeft = x + cover;
  const sTop = y + cover;
  const sW = w - 2 * cover;
  const sH = h - 2 * cover;
  const xs = edgeBarCenters(section.barsX, x + barInset, w - 2 * barInset);
  const ys = edgeBarCenters(section.barsY, y + barInset, h - 2 * barInset);
  const pts: Array<[number, number]> = [];
  xs.forEach((px) => {
    pts.push([px, y + barInset], [px, y + h - barInset]);
  });
  ys.slice(1, -1).forEach((py) => {
    pts.push([x + barInset, py], [x + w - barInset, py]);
  });
  return {
    barR,
    stroke,
    cover,
    wrapPad,
    barInset,
    sLeft,
    sTop,
    sW,
    sH,
    sRight: sLeft + sW,
    sBottom: sTop + sH,
    xs,
    ys,
    pts,
  };
}

function drawSectionTies(
  ctx: Ctx,
  section: FloorSection,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  const g = sectionGeom(section, x, y, w, h);
  const { sLeft, sTop, sW, sH, sRight, sBottom, xs, ys, wrapPad, stroke } = g;
  if (hasMainStirrup(section)) {
    drawStirrupFrame(ctx, sLeft, sTop, sW, sH, stroke);
  }
  if (nestedAlongX(section) && !section.tieDouble.enabled) {
    const box = nestedTieRect(section.barsX, xs, wrapPad, sTop, sH, "x");
    drawStirrupFrame(ctx, box.x, box.y, box.w, box.h, 0.7);
  }
  if (nestedAlongY(section) && !section.tieDouble.enabled) {
    const box = nestedTieRect(section.barsY, ys, wrapPad, sLeft, sW, "y");
    drawStirrupFrame(ctx, box.x, box.y, box.w, box.h, 0.7);
  }
  if (doubleAlongX(section) && !section.tieNested.enabled) {
    const wrap = doubleMinWrap(section.barsX);
    const leftBox = nestedTieRect(section.barsX, xs, wrapPad, sTop, sH, "x", wrap, "start");
    const rightBox = nestedTieRect(section.barsX, xs, wrapPad, sTop, sH, "x", wrap, "end");
    drawStirrupFrame(ctx, leftBox.x, leftBox.y, leftBox.w, leftBox.h, 0.7);
    drawStirrupFrame(ctx, rightBox.x, rightBox.y, rightBox.w, rightBox.h, 0.7);
  }
  if (doubleAlongY(section) && !section.tieNested.enabled) {
    const wrap = doubleMinWrap(section.barsY);
    const topBox = nestedTieRect(section.barsY, ys, wrapPad, sLeft, sW, "y", wrap, "start");
    const botBox = nestedTieRect(section.barsY, ys, wrapPad, sLeft, sW, "y", wrap, "end");
    drawStirrupFrame(ctx, topBox.x, topBox.y, topBox.w, topBox.h, 0.7);
    drawStirrupFrame(ctx, botBox.x, botBox.y, botBox.w, botBox.h, 0.7);
  }
  if (cTieAlongX(section)) {
    const cx = sLeft + sW / 2;
    drawCStirrup(ctx, cx, sTop, cx + Math.max(8, g.cover * 0.9), sBottom, "right", 0.8);
  }
  if (cTieAlongY(section)) {
    const cy = sTop + sH / 2;
    drawCStirrup(ctx, sLeft, cy, sRight, cy + Math.max(8, g.cover * 0.9), "down", 0.8);
  }
}

/** Điểm chỉ vào phần đai riêng: đứng → cạnh trong; ngang → cạnh trên phía trong. */
function extraCalloutTip(
  box: { x: number; y: number; w: number; h: number },
  axis: SectionMark["axis"] | undefined,
  outerLeft: number,
) {
  if (axis === "y") {
    return { tx: box.x + Math.max(10, box.w * 0.42), ty: box.y };
  }
  const useRight = Math.abs(box.x - outerLeft) < 3.5;
  return { tx: useRight ? box.x + box.w : box.x, ty: box.y + box.h / 2 };
}

function placeBalloonY(preferred: number, occupied: number[], yMin: number, yMax: number, gap = 20) {
  const fits = (v: number) => occupied.every((o) => Math.abs(v - o) >= gap);
  let by = Math.min(yMax, Math.max(yMin, preferred));
  if (fits(by)) return by;
  for (let step = gap; step <= yMax - yMin + gap; step += gap) {
    const down = preferred + step;
    if (down <= yMax && fits(down)) return down;
    const up = preferred - step;
    if (up >= yMin && fits(up)) return up;
  }
  return by;
}

function extraTieTargets(
  section: FloorSection,
  x: number,
  y: number,
  w: number,
  h: number,
  kind: SectionMark["kind"],
  axis?: SectionMark["axis"],
): Array<{ x: number; y: number; w: number; h: number }> {
  const g = sectionGeom(section, x, y, w, h);
  const { sLeft, sTop, sW, sH, xs, ys, wrapPad } = g;
  const out: Array<{ x: number; y: number; w: number; h: number }> = [];
  if (kind === "nested" && !section.tieDouble.enabled) {
    if (axis !== "y" && nestedAlongX(section)) out.push(nestedTieRect(section.barsX, xs, wrapPad, sTop, sH, "x"));
    if (axis !== "x" && nestedAlongY(section)) out.push(nestedTieRect(section.barsY, ys, wrapPad, sLeft, sW, "y"));
  }
  if (kind === "double" && !section.tieNested.enabled) {
    if (axis !== "y" && doubleAlongX(section)) {
      const wrap = doubleMinWrap(section.barsX);
      out.push(nestedTieRect(section.barsX, xs, wrapPad, sTop, sH, "x", wrap, "start"));
      out.push(nestedTieRect(section.barsX, xs, wrapPad, sTop, sH, "x", wrap, "end"));
    }
    if (axis !== "x" && doubleAlongY(section)) {
      const wrap = doubleMinWrap(section.barsY);
      out.push(nestedTieRect(section.barsY, ys, wrapPad, sLeft, sW, "y", wrap, "start"));
      out.push(nestedTieRect(section.barsY, ys, wrapPad, sLeft, sW, "y", wrap, "end"));
    }
  }
  if (kind === "c") {
    if (axis !== "y" && cTieAlongX(section)) {
      const cx = sLeft + sW / 2;
      out.push({ x: cx, y: sTop, w: Math.max(8, g.cover * 0.9), h: sH });
    }
    if (axis !== "x" && cTieAlongY(section)) {
      const cy = sTop + sH / 2;
      out.push({ x: sLeft, y: cy, w: sW, h: Math.max(8, g.cover * 0.9) });
    }
  }
  return out.filter((b) => b.w > 1 && b.h > 1);
}

function drawMarkTable(ctx: Ctx, x: number, y: number, rows: SectionMark[]) {
  const sttW = 20;
  const nameW = 100;
  const specW = 86;
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
  const marks = sectionMarks(section, shape);
  const tableRows = uniqueSectionMarks(section, shape);
  const tableH = tableRows.length * 19;
  const leftAnno = 76;
  const topAnno = 32;
  const botDim = 44;
  const dimGap = 26;
  const availH = Math.max(58, maxH - topAnno - botDim - tableH - 14);
  const availW = Math.max(48, maxW - leftAnno - dimGap - 8);
  const aspect = section.cy / Math.max(section.cx, 1);
  let w = Math.min(88, availW);
  let h = w * aspect;
  if (h > availH) {
    h = availH;
    w = h / Math.max(aspect, 0.35);
  }
  w = Math.max(52, w);
  h = Math.max(52, h);
  if (shape === "TRON") {
    const side = Math.min(w, h);
    w = side;
    h = side;
  }
  const x = boxX + leftAnno;
  const y = boxY + topAnno;

  if (shape === "TRON") {
    const nBars = barCount(section);
    const barR = Math.max(2.2, Math.min(3.6, Math.min(w, h) / 14));
    const stroke = 0.85;
    const cover = Math.max(6.2, Math.min(w, h) * 0.105);
    const gap = 0.9;
    const cx = x + w / 2;
    const cy = y + h / 2;
    const outerR = Math.min(w, h) / 2 - 1;
    const stirrupR = Math.max(barR * 2.4, outerR - cover);
    const barRingR = Math.max(barR * 1.5, stirrupR - stroke / 2 - gap - barR);
    const pts = ringBarCenters(nBars, cx, cy, barRingR);

    const wrapBar = pts.reduce((best, p) => (p[0] > best[0] ? p : best), pts[0] ?? [cx, cy]);
    circle(ctx, cx, cy, outerR, false);
    if (hasMainStirrup(section, shape)) {
      drawCircularTie(ctx, cx, cy, stirrupR, stroke, {
        gapCenter: Math.atan2(wrapBar[1] - cy, wrapBar[0] - cx),
        gapChord: 2 * barR,
        bar: { x: wrapBar[0], y: wrapBar[1], r: barR },
      });
    }
    pts.forEach(([px, py]) => circle(ctx, px, py, barR, true));

    const dMm = columnDiameterMm(section);
    dimH(ctx, x, x + w, y + h + 18, `D${dMm}`, 8);

    const leadX = x - 64;
    const specX = leadX + 7.4 + 5;
    const leftBar = pts.reduce((best, p) => (p[0] < best[0] ? p : best), pts[0] ?? [cx, cy]);
    const occupiedYs: number[] = [];
    const longMark = marks.find((row) => row.kind === "long")?.mark ?? 1;
    if (leftBar) {
      occupiedYs.push(leftBar[1]);
      leaderCallout(ctx, leadX, leftBar[1], leftBar[0] - barR - 0.5, leftBar[1], longMark, formatBarLabel(section), 7.4, 9, specX);
    }
    const mainMark = markOf(section, "main", undefined, shape);
    if (mainMark != null && hasMainStirrup(section, shape)) {
      const ang = circularTieCalloutAngle(nBars);
      const tieTx = cx + stirrupR * Math.cos(ang);
      const tieTy = cy + stirrupR * Math.sin(ang);
      const balloonY = placeBalloonY(Math.min(tieTy, y + 6), occupiedYs, y - 18, y + h + 6, 22);
      occupiedYs.push(balloonY);
      leaderCallout(
        ctx,
        leadX,
        balloonY,
        tieTx,
        tieTy,
        mainMark,
        marks.find((row) => row.kind === "main")?.spec ?? tieSpec(section, "main"),
        7.4,
        8,
        specX,
      );
    }

    const tx = boxX;
    const ty0 = y + h + botDim;
    drawMarkTable(ctx, tx, Math.min(ty0, boxY + maxH - tableH - 2), tableRows);
    return;
  }

  const geom = sectionGeom(section, x, y, w, h);
  const pad = geom.cover;
  const { pts, barR } = geom;

  rect(ctx, x, y, w, h, 1.15);
  drawSectionTies(ctx, section, x, y, w, h);
  dashV(ctx, x + w / 2, y - 2, y + h + 6, 2.6, 1.9, 0.28);

  pts.forEach(([px, py]) => circle(ctx, px, py, barR, true));
  if (hasMainStirrup(section)) {
    const hook = rectStirrupHook(geom.sLeft, geom.sTop, geom.sW, geom.sH, geom.stroke);
    drawBarEndFlower(ctx, hook.flower.x, hook.flower.y, hook.flower.r);
  }

  dimH(ctx, x, x + w, y + h + 18, String(section.cx), 8);
  dimChainV(ctx, x + w + 18, [y, y + h], [String(section.cy)], 8, "right", 13);

  const leadX = x - 64;
  const specX = leadX + 7.4 + 5;
  const longBar = pts[0];
  let mark1Y = y + 10;
  if (longBar) {
    const yL = longBar[1];
    mark1Y = yL;
    leaderCallout(ctx, leadX, yL, longBar[0] - barR - 0.5, yL, 1, formatBarLabel(section), 7.4, 9, specX);
  }

  const mainMark = markOf(section, "main", undefined, shape);
  if (mainMark != null && hasMainStirrup(section, shape)) {
    leaderCalloutInvL(
      ctx,
      leadX,
      y - 14,
      x + w * 0.18,
      y + pad + 1,
      mainMark,
      marks.find((row) => row.kind === "main")?.spec ?? tieSpec(section, "main"),
      7.4,
      8,
      specX,
    );
  }

  const extraMarks = marks.filter(
    (row): row is SectionMark & { kind: Exclude<SectionMark["kind"], "long" | "main"> } =>
      row.kind !== "long" && row.kind !== "main",
  );
  const occupiedYs = [mark1Y];
  if (mainMark != null && hasMainStirrup(section, shape)) occupiedYs.push(y - 14);
  const labeled = new Set<number>();
  extraMarks.forEach((row) => {
    if (labeled.has(row.mark)) return;
    labeled.add(row.mark);
    extraTieTargets(section, x, y, w, h, row.kind, row.axis).slice(0, 1).forEach((box) => {
      const tip = extraCalloutTip(box, row.axis, x + pad);
      const balloonY = placeBalloonY(tip.ty, occupiedYs, y - 16, y + h + 6, 20);
      occupiedYs.push(balloonY);
      leaderCalloutL(ctx, leadX, balloonY, tip.tx, tip.ty, row.mark, tieSpec(section, row.kind), 7.4, 8, specX);
    });
  });

  const tx = boxX;
  const ty0 = y + h + botDim;
  drawMarkTable(ctx, tx, Math.min(ty0, boxY + maxH - tableH - 2), tableRows);
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
  const xB = gx + 48;
  const xC = gx + 104;
  const xE = gx + gw;
  const firstSec = sectionFor(col, col.startFloor);
  const shaftW = Math.max(22, Math.min(34, firstSec.cx * scale));
  const dimLeftX = xC + 18;
  const shaftX = xC + 88;
  const explodedX = shaftX + shaftW + BEAM_STUB + 20;
  const explodeMarkX = explodedX + 40;
  const dimSpliceX = explodeMarkX + 15;
  const dimTotalX = dimSpliceX + 20;
  const xD = Math.max(dimTotalX + 16, xE - SECTION_COL_W);

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

  bands.forEach(({ floor, index, yTop, yBot }) => {
    line(ctx, xA, yTop, xE, yTop, 0.5);
    vtext(ctx, `TẦNG ${floor.name}`, (xA + xB) / 2, (yTop + yBot) / 2, 10, true);
    elevMark(ctx, xB + 8, yBot, `+${(elevations[floor.id - 1] ?? 0).toFixed(3)}`);
    if (index === project.floors.length - 1) {
      elevMark(ctx, xB + 8, yTop, `+${(elevations[floor.id] ?? 0).toFixed(3)}`);
    }
    if (!active.has(floor.id)) return;

    const isColumnBase = floor.id === col.startFloor;
    const isColumnTop = floor.id === col.endFloor;
    const prevFloor = index > 0 ? project.floors[index - 1] : undefined;
    const prevSection = prevFloor && !isColumnBase ? sectionFor(col, prevFloor.id) : null;
    const section = sectionFor(col, floor.id);
    const zones = storyZones(floor, index, section, col);
    const beamH = Math.max(0, floor.beamHeightMm) * scale;
    const hidePx = slabHidePx(scale, beamH);
    const zoneEdges = [yBot];
    let zy = yBot;
    zones.forEach((zone) => {
      const zh = zone.len * scale;
      const zTop = zy - zh;
      if (zone.dashed) drawElevationBeam(ctx, shaftX, shaftW, zTop, zTop + zh, hidePx);
      else stirrupTicksH(ctx, shaftX, shaftX + shaftW, zTop, zy, zone.spacing, scale);
      if (zone.label) {
        const mid = (zTop + zy) / 2;
        const mark = markOf(section, "main", undefined, col.shape) ?? 2;
        const tag = `Ø${section.tieDia}${zone.label}`;
        leaderCallout(ctx, dimLeftX + 22, mid, shaftX - 2, mid, mark, tag, 6.4, 7.5);
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

    /* Da bê tông cột: trong dầm/sàn là nét đứt từ 120 mm dưới cao độ sàn; phía trên bỏ vì sàn che. */
    {
      const beamBot = yTop + beamH;
      const dashY = yTop + hidePx;
      const skinDash = [3.4, 2.1];
      for (const x of [shaftX, shaftX + shaftW]) {
        if (beamH < 1) {
          line(ctx, x, yTop, x, yBot, 1.15);
          continue;
        }
        if (dashY < beamBot - 0.4) line(ctx, x, dashY, x, beamBot, 1.15, skinDash);
        if (beamBot < yBot - 0.4) line(ctx, x, beamBot, x, yBot, 1.15);
      }
    }

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
    const barTop = isColumnTop ? headLockY(yTop, scale) : yTop + 1;
    const hookPx = headLockLenPx(section.mainDia, scale);
    xs.forEach((x) => {
      line(ctx, x, barTop, x, yBot - 1, 1.0);
    });
    if (isColumnTop && xs.length) {
      const left = xs[0];
      const right = xs[xs.length - 1];
      const midX = (left + right) / 2;
      const gap = 2.4;
      const inward = Math.max(5.5, (right - left) / 2 - gap / 2);
      xs.forEach((x) => {
        if (x <= left + 0.2) drawHeadLockHook(ctx, x, barTop, 1, Math.min(hookPx, inward), 1.15);
        else if (x >= right - 0.2) drawHeadLockHook(ctx, x, barTop, -1, Math.min(hookPx, inward), 1.15);
        else {
          const dir: 1 | -1 = x < midX ? 1 : -1;
          const room = Math.abs(midX - x) - gap / 2;
          drawHeadLockHook(ctx, x, barTop, dir, headLockLenPx(section.mainDia, scale, room), 1.0);
        }
      });
    }

    const topsMm = lowerSteelTopsMm(floor, section, col, prevSection, isColumnBase);
    const amp = 5;
    const midLap = col.midSplice ? lapMm(section.mainDia, col.midSpliceD) : 0;
    const explodeTop = isColumnTop ? barTop : yTop + 2;
    const explodeHook = (x: number, i: number) => {
      if (!isColumnTop) return;
      const dir: 1 | -1 = i % 2 === 0 ? -1 : 1;
      const room =
        dir < 0 ? x - (shaftX + shaftW + 6) : dimSpliceX - x - 8;
      drawHeadLockHook(ctx, x, explodeTop, dir, headLockLenPx(section.mainDia, scale, room), 1.15);
    };
    const explodeMarks = explodedMarksForFloor(col, project.floors, floor.id);
    const xLeft = explodedX;
    const xRight = explodedX + 14;
    if (topsMm.length) {
      const spliceDia = !isColumnBase && prevSection ? prevSection.mainDia : section.mainDia;
      const baseLap = col.baseSplice ? lapMm(spliceDia, col.baseSpliceD) : 0;
      const crankYs: number[] = [];
      topsMm.forEach((topMm, i) => {
        const x = explodedX + i * 14;
        const crankY = yBot - topMm * scale;
        crankYs.push(crankY);
        const offsetH = col.midSplice ? midLap : baseLap || topMm;
        const yOffsetBot = yBot - Math.max(topMm - offsetH, 0) * scale;
        line(ctx, x, yBot - 1, x, crankY, 1.05);
        crankBarV(ctx, x, explodeTop, yOffsetBot - 1, crankY, -amp, 1.15);
        explodeHook(x, i);
      });
      const cL = crankYs[0];
      const cR = crankYs[1] ?? crankYs[0];
      drawExplodedBarMarks(
        ctx,
        [
          { x: xLeft, y0: yBot, y1: cL, mark: explodeMarks.lower[0] },
          { x: xRight, y0: yBot, y1: cR, mark: explodeMarks.lower[1] },
          { x: xLeft, y0: cL, y1: explodeTop, mark: explodeMarks.upper[0] },
          { x: xRight, y0: cR, y1: explodeTop, mark: explodeMarks.upper[1] },
        ],
        explodeMarkX,
      );
    } else {
      line(ctx, explodedX, explodeTop, explodedX, yBot - 2, 1.15);
      line(ctx, explodedX + 14, explodeTop, explodedX + 14, yBot - 2, 1.15);
      explodeHook(explodedX, 0);
      explodeHook(explodedX + 14, 1);
      drawExplodedBarMarks(
        ctx,
        [
          { x: xLeft, y0: yBot, y1: explodeTop, mark: explodeMarks.lower[0] },
          { x: xRight, y0: yBot, y1: explodeTop, mark: explodeMarks.lower[1] },
        ],
        explodeMarkX,
      );
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
  const titleH = 22;
  rect(ctx, x, y, w, h, 1.05);
  fillRect(ctx, x, y, w, titleH, GRAY);
  const title = focus ? `BẢNG THỐNG KÊ  ·  ${focus.name}` : "BẢNG THỐNG KÊ CỐT THÉP";
  cellText(ctx, title, x, y, w, titleH, 10, "center", true);
  line(ctx, x, y + titleH, x + w, y + titleH, 0.8);

  const pad = 8;
  const tableX = x + pad;
  const tableY = y + titleH + 6;
  const memberColW = 42;
  const cols: { w: number; label: string; stack?: string[] }[] = [
    { w: memberColW, label: "TÊN CẤU KIỆN", stack: ["TÊN", "CẤU KIỆN"] },
    { w: 36, label: "STT" },
    { w: 148, label: "HÌNH DẠNG, KT (mm)", stack: ["HÌNH DẠNG", "KT (mm)"] },
    { w: 32, label: "Ø" },
    { w: 40, label: "DÀI" },
    { w: 28, label: "1 CK" },
    { w: 32, label: "T.BỘ" },
    { w: 42, label: "T.L (m)" },
    { w: 54, label: "KL (kg)" },
  ];
  const tableW = cols.reduce((s, c) => s + c.w, 0);
  const headH = 26;
  let cx = tableX;
  fillRect(ctx, tableX, tableY, tableW, headH, GRAY);
  cols.forEach((col) => {
    rect(ctx, cx, tableY, col.w, headH, 0.55);
    if (col.stack) headerStack(ctx, cx + col.w / 2, tableY, headH, col.stack, 5.6);
    else cellText(ctx, col.label, cx, tableY, col.w, headH, 6, "center", true);
    cx += col.w;
  });

  const built = buildSchedule(project);
  const rawRows = focus ? built.rows.filter((r) => r.member === focus.name) : built.rows;
  const colOrder = new Map(project.columns.map((c, i) => [c.name, i]));
  const sttRank = (stt: string) => {
    const match = /^(\d+)([a-z]*)$/i.exec(stt);
    if (!match) return [999, 0] as const;
    const letter = match[2].toLowerCase();
    return [Number(match[1]), letter ? letter.charCodeAt(0) - 96 : 0] as const;
  };
  const rows = [...rawRows].sort((a, b) => {
    const ca = colOrder.get(a.member) ?? 0;
    const cb = colOrder.get(b.member) ?? 0;
    if (ca !== cb) return ca - cb;
    const kindA = a.kind === "stirrup" ? 1 : 0;
    const kindB = b.kind === "stirrup" ? 1 : 0;
    if (kindA !== kindB) return kindA - kindB;
    const [na, la] = sttRank(a.stt);
    const [nb, lb] = sttRank(b.stt);
    if (na !== nb) return na - nb;
    return la - lb;
  });
  const { byDia, stirrupCounts } = built;
  const sumH = 168;
  const bodyTop = tableY + headH;
  const bodyH = h - (bodyTop - y) - sumH - 10;
  const rowH = Math.min(30, Math.max(16, bodyH / Math.max(rows.length, 1)));
  const xs: number[] = [];
  let acc = tableX;
  cols.forEach((c) => {
    xs.push(acc);
    acc += c.w;
  });

  const visible = rows.filter((_, i) => bodyTop + (i + 1) * rowH <= bodyTop + bodyH);
  type NameGroup = { start: number; end: number; key: string; y: number; h: number };
  const collectGroups = (keyOf: (row: (typeof visible)[number]) => string) => {
    const out: NameGroup[] = [];
    visible.forEach((row, i) => {
      const key = keyOf(row);
      const y = bodyTop + i * rowH;
      const prev = out[out.length - 1];
      if (prev && prev.key === key) {
        prev.end = i;
        prev.h += rowH;
      } else {
        out.push({ start: i, end: i, key, y, h: rowH });
      }
    });
    return out;
  };
  const memberGroups = collectGroups((row) => row.member);

  memberGroups.forEach((g, gi) => {
    if (gi % 2 === 1) fillRect(ctx, xs[1], g.y, tableW - cols[0].w, g.h, GRAY2);
  });

  const bodyUsed = visible.length * rowH;
  for (let c = 1; c < cols.length; c += 1) {
    line(ctx, xs[c], bodyTop, xs[c], bodyTop + bodyUsed, 0.35);
  }

  visible.forEach((row, i) => {
    const rowY = bodyTop + i * rowH;
    const yBot = rowY + rowH;
    const lastInMember = memberGroups.some((g) => g.end === i);
    const lastOverall = i === visible.length - 1;
    if (!lastOverall) {
      if (lastInMember) line(ctx, tableX, yBot, tableX + tableW, yBot, 0.45);
      else line(ctx, xs[1], yBot, tableX + tableW, yBot, 0.3);
    }

    cellText(ctx, String(row.stt), xs[1], rowY, cols[1].w, rowH, 6.5, "center");

    if (row.kind === "stirrup") {
      const [hook, a, b] = row.segs;
      if (row.circular) {
        drawScheduleRoundStirrup(ctx, xs[2], rowY, cols[2].w, rowH, hook, a, b ?? 0);
      } else if (b === hook) {
        drawScheduleBarSketch(ctx, xs[2], rowY, cols[2].w, rowH, "u-bar", [hook, a, b]);
      } else {
        drawScheduleStirrup(ctx, xs[2], rowY, cols[2].w, rowH, hook, a, b);
      }
    } else if (row.kind === "long-hook") {
      drawScheduleBarSketch(ctx, xs[2], rowY, cols[2].w, rowH, "l-hook", row.segs);
    } else {
      drawScheduleBarSketch(ctx, xs[2], rowY, cols[2].w, rowH, "straight", [row.lengthMm]);
    }

    cellText(ctx, String(row.dia), xs[3], rowY, cols[3].w, rowH, 6.5, "center");
    cellText(ctx, String(row.lengthMm), xs[4], rowY, cols[4].w, rowH, 6.5, "right");
    cellText(ctx, String(row.perMember), xs[5], rowY, cols[5].w, rowH, 6.5, "center");
    cellText(ctx, String(row.totalBars), xs[6], rowY, cols[6].w, rowH, 6.5, "center");
    cellText(ctx, row.totalLengthM.toFixed(1), xs[7], rowY, cols[7].w, rowH, 6.5, "right");
    cellText(ctx, row.weightKg.toFixed(1), xs[8], rowY, cols[8].w, rowH, 6.5, "right");
  });

  memberGroups.forEach((g) => {
    const size = fitVTextSize(ctx, g.key, g.h, 11);
    vtextCentered(ctx, g.key, tableX + memberColW / 2, g.y + g.h / 2, size, true);
  });
  rect(ctx, tableX, bodyTop, tableW, Math.max(bodyUsed, 1), 0.7);

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

/** Chiều rộng một khung cột (mặt đứng ép sát mặt cắt hẹp). */
const COLUMN_SHEET_W = 590;
const COLUMN_SHEET_GAP = 8;
const SECTION_COL_W = 248;
const SCHEDULE_MIN_W = 400;

export async function generateColumnPdf(
  project: Project,
  fonts: { regular: ArrayBuffer; bold: ArrayBuffer },
) {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(fonts.regular, { subset: true });
  const fontBold = await doc.embedFont(fonts.bold, { subset: true });
  const columns = project.columns.length ? project.columns : [];
  const mx = 16;
  const my = 14;
  const frameW = PAGE_W - mx * 2;
  const frameH = PAGE_H - my * 2;
  const innerY = my + 40;
  const innerH = frameH - 52;
  const perPage = Math.max(1, Math.min(3, Math.floor((frameW + COLUMN_SHEET_GAP) / (COLUMN_SHEET_W + COLUMN_SHEET_GAP))));
  const pages = Math.max(1, Math.ceil(columns.length / perPage));

  const headerH = 22;
  const drawPageFrame = (ctx: Ctx, title: string, pageNo: number, pageCount: number) => {
    ctx.page.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: PAGE_H, color: WHITE });
    rect(ctx, mx, my, frameW, frameH, 1.15);
    textVCenter(ctx, title, mx + 12, my + headerH / 2, 12, true);
    textVCenter(ctx, `A1 ngang  ·  trang ${pageNo}/${pageCount}`, mx + frameW - 12, my + headerH / 2, 9, false, "right");
    line(ctx, mx, my + headerH, mx + frameW, my + headerH, 0.7);
  };

  if (!columns.length) {
    const page = doc.addPage([PAGE_W, PAGE_H]);
    const ctx: Ctx = { page, font, fontBold, W: PAGE_W, H: PAGE_H };
    drawPageFrame(ctx, "SHOP DRAWING CỘT (BY GIAHUY.NET)", 1, 1);
    text(ctx, "Chưa có cột.", mx + 20, innerY + 20, 14, true);
    return doc.save();
  }

  let placedSched = false;
  for (let pageIndex = 0; pageIndex < pages; pageIndex += 1) {
    const slice = columns.slice(pageIndex * perPage, (pageIndex + 1) * perPage);
    const page = doc.addPage([PAGE_W, PAGE_H]);
    const ctx: Ctx = { page, font, fontBold, W: PAGE_W, H: PAGE_H };
    const names = slice.map((c) => c.name).join(", ");
    drawPageFrame(ctx, `SHOP DRAWING CỘT (BY GIAHUY.NET)  ·  ${names}`, pageIndex + 1, pages);
    slice.forEach((column, i) => {
      drawColumnSheet(
        ctx,
        { x: mx + i * (COLUMN_SHEET_W + COLUMN_SHEET_GAP), y: innerY, w: COLUMN_SHEET_W, h: innerH },
        project,
        column,
      );
    });
    const used = slice.length * (COLUMN_SHEET_W + COLUMN_SHEET_GAP) - COLUMN_SHEET_GAP;
    const rest = frameW - used - COLUMN_SHEET_GAP;
    if (rest >= SCHEDULE_MIN_W) {
      drawSchedulePanel(ctx, mx + used + COLUMN_SHEET_GAP, innerY, rest, innerH, project);
      placedSched = true;
    }
    text(ctx, `${project.floors.length} tầng`, mx + frameW - 10, my + frameH - 6, 7, false, "right");
  }

  if (!placedSched) {
    const page = doc.addPage([PAGE_W, PAGE_H]);
    const ctx: Ctx = { page, font, fontBold, W: PAGE_W, H: PAGE_H };
    drawPageFrame(ctx, "BẢNG THỐNG KÊ CỐT THÉP", pages + 1, pages + 1);
    drawSchedulePanel(ctx, mx, innerY, frameW, innerH, project);
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
