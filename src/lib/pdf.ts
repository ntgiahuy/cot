import { PDFDocument, PDFFont, PDFPage, rgb, degrees } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import {
  buildSchedule,
  columnFloors,
  denseZones,
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
  midSplicePosMm,
  nestedAlongX,
  nestedAlongY,
  nestedTieRect,
  sectionFor,
  stockBars,
  summaryBuckets,
} from "./calc";
import { EMBED_MM, STOCK_M, type Column, type Floor, type FloorSection, type Project } from "./types";

/** A1 ngang — 841 × 594 mm (2384 × 1684 pt). */
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

function dimV(ctx: Ctx, x: number, y0: number, y1: number, label: string, size = 8) {
  line(ctx, x, y0, x, y1, 0.45);
  tick(ctx, x, y0);
  tick(ctx, x, y1);
  const mid = (y0 + y1) / 2;
  const tw = ctx.font.widthOfTextAtSize(label, size);
  if (Math.abs(y1 - y0) > tw + 8) {
    vtext(ctx, label, x - 8, mid, size);
  } else {
    text(ctx, label, x + 5, mid + 3, size);
  }
}

function elevationZones(floor: Floor, index: number): Zone[] {
  const { top: beam, bot: dense, mid } = denseZones(floor, index);
  const zones: Zone[] = [
    { id: "embed", len: EMBED_MM, spacing: 100, dashed: false, label: "a100" },
    { id: "mid", len: mid, spacing: 200, dashed: false, label: "a200" },
    { id: "dense", len: dense, spacing: 100, dashed: false, label: "a100" },
    { id: "beam", len: beam, spacing: 0, dashed: true, label: null },
  ];
  return zones.filter((z) => z.len > 1);
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
    line(ctx, xL + 1.2, y, xR - 1.2, y, 0.4);
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

function kinkBarV(ctx: Ctx, x: number, yTop: number, yBot: number, kinkY: number, amp: number, w = 1.1) {
  const k = Math.min(yBot - 6, Math.max(yTop + 6, kinkY));
  line(ctx, x, yBot, x, k + 5, w);
  line(ctx, x, k + 5, x + amp, k, w);
  line(ctx, x + amp, k, x, k - 5, w);
  line(ctx, x, k - 5, x, yTop, w);
}

function barPoints(section: FloorSection, x: number, y: number, w: number, h: number) {
  const barR = Math.max(1.7, Math.min(2.6, Math.min(w, h) / 16));
  const m = Math.max(5.5, Math.min(w, h) * 0.16);
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

function drawSectionCompact(
  ctx: Ctx,
  x: number,
  y: number,
  section: FloorSection,
  shape: Column["shape"],
) {
  const aspect = section.cy / Math.max(section.cx, 1);
  const w = 42;
  const h = Math.max(34, Math.min(56, w * aspect));
  const pad = 5;

  if (shape === "TRON") {
    const r = Math.min(w, h) / 2 - 1;
    circle(ctx, x + w / 2, y + h / 2, r, false);
    if (hasMainStirrup(section)) circle(ctx, x + w / 2, y + h / 2, r - pad, false);
  } else {
    rect(ctx, x, y, w, h, 0.95);
    if (hasMainStirrup(section)) rect(ctx, x + pad, y + pad, w - 2 * pad, h - 2 * pad, 0.75);
    const sLeft = x + pad;
    const sTop = y + pad;
    const sW = w - 2 * pad;
    const sH = h - 2 * pad;
    const sRight = sLeft + sW;
    const sBottom = sTop + sH;
    const hook = 4;
    const ret = 2.5;
    const barR = 1.7;
    const barInset = pad + 0.4 + barR + 0.5;
    const insetPad = barInset - pad;
    const xs = edgeBarCenters(section.barsX, x + barInset, w - 2 * barInset);
    const ys = edgeBarCenters(section.barsY, y + barInset, h - 2 * barInset);
    if (nestedAlongX(section) && !section.tieDouble.enabled) {
      const box = nestedTieRect(section.barsX, xs, insetPad, sTop, sH, "x");
      rect(ctx, box.x, box.y, box.w, box.h, 0.65);
    }
    if (nestedAlongY(section) && !section.tieDouble.enabled) {
      const box = nestedTieRect(section.barsY, ys, insetPad, sLeft, sW, "y");
      rect(ctx, box.x, box.y, box.w, box.h, 0.65);
    }
    if (doubleAlongX(section) && !section.tieNested.enabled) {
      const wrap = doubleMinWrap(section.barsX);
      const leftBox = nestedTieRect(section.barsX, xs, insetPad, sTop, sH, "x", wrap, "start");
      const rightBox = nestedTieRect(section.barsX, xs, insetPad, sTop, sH, "x", wrap, "end");
      rect(ctx, leftBox.x, leftBox.y, leftBox.w, leftBox.h, 0.65);
      rect(ctx, rightBox.x, rightBox.y, rightBox.w, rightBox.h, 0.65);
    }
    if (doubleAlongY(section) && !section.tieNested.enabled) {
      const wrap = doubleMinWrap(section.barsY);
      const topBox = nestedTieRect(section.barsY, ys, insetPad, sLeft, sW, "y", wrap, "start");
      const botBox = nestedTieRect(section.barsY, ys, insetPad, sLeft, sW, "y", wrap, "end");
      rect(ctx, topBox.x, topBox.y, topBox.w, topBox.h, 0.65);
      rect(ctx, botBox.x, botBox.y, botBox.w, botBox.h, 0.65);
    }
    if (cTieAlongX(section)) {
      const cx = sLeft + sW / 2;
      line(ctx, cx + hook, sTop + ret, cx + hook, sTop, 0.75);
      line(ctx, cx + hook, sTop, cx, sTop, 0.75);
      line(ctx, cx, sTop, cx, sBottom, 0.75);
      line(ctx, cx, sBottom, cx + hook, sBottom, 0.75);
      line(ctx, cx + hook, sBottom, cx + hook, sBottom - ret, 0.75);
    }
    if (cTieAlongY(section)) {
      const cy = sTop + sH / 2;
      line(ctx, sLeft + ret, cy + hook, sLeft, cy + hook, 0.75);
      line(ctx, sLeft, cy + hook, sLeft, cy, 0.75);
      line(ctx, sLeft, cy, sRight, cy, 0.75);
      line(ctx, sRight, cy, sRight, cy + hook, 0.75);
      line(ctx, sRight, cy + hook, sRight - ret, cy + hook, 0.75);
    }
  }

  const { pts, barR } = barPoints(section, x, y, w, h);
  pts.forEach(([px, py]) => circle(ctx, px, py, Math.min(barR, 1.9), true));
  text(ctx, String(section.cx), x + w / 2, y - 3, 6.5, false, "center");
  text(ctx, String(section.cy), x + w + 3, y + h / 2 + 3, 6.5);
  text(ctx, `1 ${formatBarLabel(section)}`, x + w / 2, y + h + 11, 6.5, true, "center");
  text(ctx, `2 Ø${section.tieDia}a200(100)`, x + w / 2, y + h + 21, 6, false, "center");
  return { w, h: h + 24 };
}

function drawShaftBarsV(
  ctx: Ctx,
  xL: number,
  xR: number,
  yTop: number,
  yBot: number,
  column: Column,
  floor: Floor,
  section: FloorSection,
  scale: number,
) {
  const inset = 4;
  const xA = xL + inset;
  const xB = xR - inset;
  const xC = (xL + xR) / 2;
  const nShow = Math.min(4, Math.max(2, section.barsX));
  const xs =
    nShow === 2 ? [xA, xB] : nShow === 3 ? [xA, xC, xB] : [xA, (xA + xC) / 2, (xB + xC) / 2, xB];
  const kinks: number[] = [];
  if (column.baseSplice) {
    const d = lapMm(section.mainDia, column.baseSpliceD) * scale;
    kinks.push(yBot - d, yBot - 2 * d);
  } else if (column.midSplice) {
    const mid = midSplicePosMm(floor) * scale;
    const d = lapMm(section.mainDia, column.midSpliceD) * scale;
    kinks.push(yBot - mid, yBot - mid - d);
  }
  xs.forEach((x, i) => {
    const amp = i % 2 === 0 ? -2.8 : 2.8;
    if (kinks.length) {
      kinkBarV(ctx, x, yTop + 1, yBot - 1, kinks[i % kinks.length], amp, 0.95);
    } else {
      line(ctx, x, yTop + 1, x, yBot - 1, 0.95);
    }
  });
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

function drawFloorAxis(
  ctx: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  project: Project,
  scale: number,
  elevTop: number,
  elevBot: number,
  gridRight: number,
) {
  rect(ctx, x, y, w, h, 1);
  fillRect(ctx, x, y, w, elevTop - y, GRAY);
  text(ctx, "CAO ĐỘ", x + w / 2, y + (elevTop - y) * 0.62, 9, true, "center");
  line(ctx, x, elevTop, gridRight, elevTop, 0.7);
  line(ctx, x, elevBot, gridRight, elevBot, 0.7);

  const elevations = floorElevations(project.floors);
  const bands = floorBandYs(project.floors, scale, elevBot);
  const nameX = x + 54;
  const dimX = x + w - 14;

  bands.forEach(({ floor, index, yTop, yBot }) => {
    line(ctx, x, yTop, gridRight, yTop, 0.55);
    text(ctx, `TẦNG ${floor.name}`, nameX, (yTop + yBot) / 2 + 4, 8.5, true, "center");
    fillRect(ctx, x + 5, yBot - 2.2, 4.4, 4.4);
    line(ctx, x, yBot, x + 18, yBot, 0.45);
    vtext(ctx, `+${(elevations[floor.id - 1] ?? 0).toFixed(3)}`, x + 20, yBot, 6.5);
    let zy = yBot;
    elevationZones(floor, index).forEach((zone) => {
      const zh = zone.len * scale;
      dimV(ctx, dimX, zy - zh, zy, String(Math.round(zone.len)), 6.5);
      zy -= zh;
    });
  });
  const last = project.floors[project.floors.length - 1];
  if (last) {
    fillRect(ctx, x + 5, elevTop - 2.2, 4.4, 4.4);
    line(ctx, x, elevTop, x + 18, elevTop, 0.45);
    vtext(ctx, `+${(elevations[last.id] ?? 0).toFixed(3)}`, x + 20, elevTop, 6.5);
  }
}

function drawColumnPanel(
  ctx: Ctx,
  px: number,
  py: number,
  pw: number,
  ph: number,
  project: Project,
  column: Column,
  scale: number,
  elevTop: number,
  elevBot: number,
) {
  rect(ctx, px, py, pw, ph, 0.85);
  fillRect(ctx, px, py, pw, elevTop - py, GRAY2);
  text(ctx, `${column.name} (SL: ${column.quantity})`, px + pw / 2, py + (elevTop - py) * 0.62, 9, true, "center");

  const active = new Set(columnFloors(column, project.floors).map((f) => f.id));
  const shaftW = Math.max(20, Math.min(34, (sectionFor(column, column.startFloor).cx || 300) * scale));
  const shaftX = px + 14;
  const secX = px + pw - 78;

  line(ctx, shaftX, elevTop, shaftX, elevBot, 1.05);
  line(ctx, shaftX + shaftW, elevTop, shaftX + shaftW, elevBot, 1.05);

  floorBandYs(project.floors, scale, elevBot).forEach(({ floor, index, yTop, yBot }) => {
    if (!active.has(floor.id)) return;
    const section = sectionFor(column, floor.id);
    const hPx = yBot - yTop;
    let y = yBot;
    elevationZones(floor, index).forEach((zone) => {
      const zh = zone.len * scale;
      const zTop = y - zh;
      if (zone.dashed) drawBeamBoxV(ctx, shaftX, zTop, shaftW, zh);
      else stirrupTicksH(ctx, shaftX, shaftX + shaftW, zTop, y, zone.spacing, scale);
      if (zone.label) {
        text(ctx, `2Ø${section.tieDia}${zone.label}`, shaftX + shaftW + 3, (zTop + y) / 2 + 3, 6);
      }
      y = zTop;
    });
    drawShaftBarsV(ctx, shaftX, shaftX + shaftW, yTop, yBot, column, floor, section, scale);
    drawSectionCompact(ctx, secX, yTop + Math.max(2, (hPx - 68) / 2), section, column.shape);
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
  text(ctx, str, cx, y + h * 0.72, size, bold, align);
}

function drawSchedulePanel(ctx: Ctx, x: number, y: number, w: number, h: number, project: Project) {
  rect(ctx, x, y, w, h, 1.05);
  fillRect(ctx, x, y, w, 22, GRAY);
  text(ctx, "BẢNG THỐNG KÊ CỐT THÉP", x + w / 2, y + 16, 10, true, "center");
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

  const { rows, byDia, stirrupCounts } = buildSchedule(project);
  const sumH = 168;
  const bodyTop = tableY + headH;
  const bodyH = h - (bodyTop - y) - sumH - 10;
  const rowH = Math.min(20, Math.max(12, bodyH / Math.max(rows.length, 1)));
  const xs: number[] = [];
  let acc = tableX;
  cols.forEach((col) => {
    xs.push(acc);
    acc += col.w;
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
    cols.forEach((col) => {
      line(ctx, cx, rowY, cx, rowY + rowH, 0.35);
      cx += col.w;
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
  rect(ctx, tableX, bodyTop, tableW, rowY - bodyTop, 0.7);

  const sumY = y + h - sumH;
  line(ctx, x, sumY, x + w, sumY, 0.8);
  fillRect(ctx, x, sumY, w, 20, GRAY);
  text(ctx, "TỔNG HỢP THEO ĐƯỜNG KÍNH", x + w / 2, sumY + 14, 8.5, true, "center");

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
  sCols.forEach((col) => {
    rect(ctx, sx, sHeadY, col.w, sRowH, 0.5);
    cellText(ctx, col.label, sx, sHeadY, col.w, sRowH, 6.5, "center", true);
    sx += col.w;
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
      sCols.forEach((col, i) => {
        line(ctx, dx, sy, dx, sy + sRowH, 0.4);
        cellText(ctx, vals[i], dx, sy, col.w, sRowH, 7, i === 0 ? "center" : "right", i === 0);
        dx += col.w;
      });
      sy += sRowH;
    });
  rect(ctx, sX, sHeadY, sTableW, sy - sHeadY, 0.7);

  const buckets = summaryBuckets(byDia);
  const noteY = sy + 10;
  text(ctx, `D ≤ 10: ${buckets.le10.toFixed(1)} kg    D ≤ 18: ${buckets.le18.toFixed(1)} kg    D > 18: ${buckets.gt18.toFixed(1)} kg`, x + w / 2, noteY, 7, false, "center");
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
  const page = doc.addPage([PAGE_W, PAGE_H]);
  const ctx: Ctx = { page, font, fontBold, W: PAGE_W, H: PAGE_H };

  page.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: PAGE_H, color: WHITE });
  const mx = 18;
  const my = 16;
  const frameW = PAGE_W - mx * 2;
  const frameH = PAGE_H - my * 2;
  rect(ctx, mx, my, frameW, frameH, 1.2);
  text(ctx, "SHOP DRAWING CỘT  ·  CHI TIẾT + THỐNG KÊ", mx + 12, my + 16, 12, true);
  text(ctx, "A1 ngang", mx + frameW - 12, my + 16, 9, false, "right");
  line(ctx, mx, my + 22, mx + frameW, my + 22, 0.7);

  const innerY = my + 28;
  const innerH = frameH - 36;
  const leftW = 138;
  const schedW = 742;
  const colsX = mx + leftW;
  const colsW = frameW - leftW - schedW;
  const titleH = 24;
  const elevTop = innerY + titleH;
  const elevBot = innerY + innerH - 6;
  const totalMm = project.floors.reduce((s, f) => s + f.heightMm, 0);
  const scale = (elevBot - elevTop) / Math.max(totalMm, 1);
  const n = Math.max(project.columns.length, 1);
  const colW = colsW / n;

  drawFloorAxis(ctx, mx, innerY, leftW, innerH, project, scale, elevTop, elevBot, colsX + colsW);
  project.columns.forEach((column, i) => {
    drawColumnPanel(ctx, colsX + i * colW, innerY, colW, innerH, project, column, scale, elevTop, elevBot);
  });
  drawSchedulePanel(ctx, mx + frameW - schedW, innerY, schedW, innerH, project);
  text(ctx, "Shop drawing thép cột", mx + 10, my + frameH - 6, 7);
  text(ctx, `${project.columns.length} cột  ·  ${project.floors.length} tầng`, mx + frameW - 10, my + frameH - 6, 7, false, "right");

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
  return url;
}
