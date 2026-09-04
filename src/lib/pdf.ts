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

function fillRect(ctx: Ctx, x: number, y: number, w: number, h: number) {
  ctx.page.drawRectangle({
    x,
    y: ty(ctx, y + h),
    width: w,
    height: h,
    color: BLACK,
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

function elevMarkerH(ctx: Ctx, x: number, y: number, label: string, size = 7) {
  fillRect(ctx, x - 2.4, y - 2.4, 4.8, 4.8);
  line(ctx, x - 10, y, x + 4, y, 0.5);
  text(ctx, label, x + 7, y + 3, size);
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

function drawColumnPanel(
  ctx: Ctx,
  px: number,
  py: number,
  pw: number,
  ph: number,
  project: Project,
  column: Column,
) {
  rect(ctx, px, py, pw, ph, 0.95);
  const title = `${column.name} (SL: ${column.quantity})`;
  text(ctx, title, px + pw / 2, py + 14, 9, true, "center");
  text(ctx, "CAO ĐỘ", px + 8, py + 26, 6, true);
  text(ctx, "MẶT ĐỨNG", px + pw * 0.38, py + 26, 6, true, "center");
  text(ctx, "MẶT CẮT", px + pw - 48, py + 26, 6, true, "center");
  line(ctx, px + 4, py + 30, px + pw - 4, py + 30, 0.55);

  const floors = columnFloors(column, project.floors);
  if (!floors.length) return;
  const elevations = floorElevations(project.floors);
  const totalMm = floors.reduce((s, f) => s + f.heightMm, 0);
  const elevTop = py + 36;
  const elevBot = py + ph - 8;
  const elevH = elevBot - elevTop;
  const scale = elevH / Math.max(totalMm, 1);
  const shaftW = Math.max(22, Math.min(36, (floors[0] ? sectionFor(column, floors[0].id).cx : 300) * scale));
  const shaftX = px + 58;
  const secX = px + pw - 92;

  line(ctx, shaftX, elevTop, shaftX, elevBot, 1.05);
  line(ctx, shaftX + shaftW, elevTop, shaftX + shaftW, elevBot, 1.05);

  let yBot = elevBot;
  floors.forEach((floor, index) => {
    const section = sectionFor(column, floor.id);
    const hPx = floor.heightMm * scale;
    const yTop = yBot - hPx;
    line(ctx, px + 4, yTop, shaftX + shaftW + 10, yTop, 0.45);
    text(ctx, `T${floor.name}`, px + 8, yTop + 11, 6.5, true);
    elevMarkerH(ctx, px + 28, yBot, `+${(elevations[floor.id - 1] ?? 0).toFixed(3)}`, 6.5);

    let y = yBot;
    elevationZones(floor, index).forEach((zone) => {
      const zh = zone.len * scale;
      const zTop = y - zh;
      if (zone.dashed) {
        drawBeamBoxV(ctx, shaftX, zTop, shaftW, zh);
      } else {
        stirrupTicksH(ctx, shaftX, shaftX + shaftW, zTop, y, zone.spacing, scale);
      }
      dimV(ctx, shaftX - 14, zTop, y, String(Math.round(zone.len)), 6);
      if (zone.label) {
        const mid = (zTop + y) / 2;
        text(ctx, `2Ø${section.tieDia}${zone.label}`, shaftX + shaftW + 4, mid + 3, 6);
      }
      y = zTop;
    });

    drawShaftBarsV(ctx, shaftX, shaftX + shaftW, yTop, yBot, column, floor, section, scale);
    dimV(ctx, shaftX + shaftW + 36, yTop, yBot, String(floor.heightMm), 6.5);

    const sec = drawSectionCompact(ctx, secX, yTop + Math.max(4, (hPx - 70) / 2), section, column.shape);
    void sec;
    yBot = yTop;
  });
  const last = floors[floors.length - 1];
  elevMarkerH(ctx, px + 28, elevTop, `+${(elevations[last.id] ?? 0).toFixed(3)}`, 6.5);
}

function drawSchedulePanel(ctx: Ctx, x: number, y: number, w: number, h: number, project: Project) {
  rect(ctx, x, y, w, h, 0.95);
  text(ctx, "BẢNG THỐNG KÊ CỐT THÉP", x + 14, y + 16, 11, true);

  const tableW = w * 0.72;
  const sumX = x + tableW + 8;
  const headers = [
    [0, "KIỆN CẤU"],
    [92, "STT"],
    [122, "HÌNH DẠNG, KÍCH THƯỚC (mm)"],
    [360, "Ø"],
    [390, "DÀI"],
    [438, "1 CK"],
    [486, "T.BỘ"],
    [540, "TONG L (m)"],
    [620, "KL (kg)"],
  ] as const;
  const tableY = y + 28;
  headers.forEach(([dx, label]) => text(ctx, label, x + 10 + dx, tableY, 6.5, true));
  line(ctx, x + 8, tableY + 6, x + tableW - 8, tableY + 6, 0.55);

  const { rows, byDia, stirrupCounts } = buildSchedule(project);
  const rowH = 10.2;
  const maxY = y + h - 8;
  let rowY = tableY + 16;
  let lastMember = "";
  rows.forEach((row) => {
    if (rowY > maxY - 6) return;
    if (row.member !== lastMember) {
      if (lastMember) rowY += 2;
      text(ctx, `${row.member} (SL:${row.quantity})`, x + 10, rowY, 6, true);
      lastMember = row.member;
      rowY += 9;
    }
    text(ctx, String(row.stt), x + 102, rowY, 6.5);
    if (row.kind === "stirrup") {
      const [hook, a, b] = row.segs;
      line(ctx, x + 138, rowY + 1, x + 188, rowY + 1, 0.65);
      line(ctx, x + 138, rowY + 1, x + 138, rowY - 8, 0.65);
      line(ctx, x + 188, rowY + 1, x + 188, rowY - 8, 0.65);
      text(ctx, String(a), x + 163, rowY - 9, 5.5, false, "center");
      text(ctx, String(b), x + 192, rowY - 2, 5.5);
      text(ctx, String(hook), x + 134, rowY - 2, 5.5, false, "right");
    } else if (row.kind === "long-hook") {
      line(ctx, x + 138, rowY, x + 200, rowY, 0.65);
      line(ctx, x + 138, rowY, x + 138, rowY - 8, 0.65);
      text(ctx, String(row.segs[0]), x + 134, rowY - 8, 5.5, false, "right");
      text(ctx, String(row.segs[1]), x + 169, rowY - 9, 5.5, false, "center");
      text(ctx, row.shapeLabel, x + 206, rowY, 6.5);
    } else {
      line(ctx, x + 138, rowY, x + 210, rowY, 0.65);
      text(ctx, String(row.lengthMm), x + 174, rowY - 9, 5.5, false, "center");
      text(ctx, row.shapeLabel, x + 216, rowY, 6.5);
    }
    text(ctx, String(row.dia), x + 370, rowY, 6.5);
    text(ctx, String(row.lengthMm), x + 400, rowY, 6.5);
    text(ctx, String(row.perMember), x + 448, rowY, 6.5);
    text(ctx, String(row.totalBars), x + 496, rowY, 6.5);
    text(ctx, row.totalLengthM.toFixed(1), x + 554, rowY, 6.5);
    text(ctx, row.weightKg.toFixed(1), x + 630, rowY, 6.5);
    rowY += rowH;
  });

  text(ctx, "TỔNG HỢP", sumX, y + 16, 10, true);
  text(ctx, "Ø", sumX, y + 32, 7, true);
  text(ctx, "KL (kg)", sumX + 50, y + 32, 7, true);
  text(ctx, "L (m)", sumX + 120, y + 32, 7, true);
  text(ctx, `Cây ${STOCK_M}m`, sumX + 180, y + 32, 7, true);
  line(ctx, sumX, y + 38, x + w - 10, y + 38, 0.55);
  let dy = y + 52;
  [...byDia.entries()]
    .sort((a, b) => a[0] - b[0])
    .forEach(([dia, val]) => {
      text(ctx, `Ø${dia}`, sumX, dy, 7.5);
      text(ctx, val.weight.toFixed(1), sumX + 50, dy, 7.5);
      if (dia > 6) {
        text(ctx, val.length.toFixed(1), sumX + 120, dy, 7.5);
        text(ctx, String(stockBars(val.length)), sumX + 180, dy, 7.5);
      }
      dy += 13;
    });
  const buckets = summaryBuckets(byDia);
  dy += 8;
  text(ctx, `D<=10: ${buckets.le10.toFixed(1)} kg`, sumX, dy, 7.5);
  dy += 12;
  text(ctx, `D<=18: ${buckets.le18.toFixed(1)} kg`, sumX, dy, 7.5);
  dy += 12;
  text(ctx, `D>18: ${buckets.gt18.toFixed(1)} kg`, sumX, dy, 7.5);
  dy += 14;
  stirrupCounts.forEach((count, key) => {
    text(ctx, `Đai ${key}: ${count} cái`, sumX, dy, 7);
    dy += 12;
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
  const schedH = Math.min(780, Math.max(640, innerH * 0.46));
  const colH = innerH - schedH - 6;
  const n = Math.max(project.columns.length, 1);
  const colW = frameW / n;
  project.columns.forEach((column, i) => {
    drawColumnPanel(ctx, mx + i * colW, innerY, colW, colH, project, column);
  });
  drawSchedulePanel(ctx, mx, innerY + colH + 4, frameW, schedH - 4, project);
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
