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

/** A2 ngang — khớp file mẫu AutoCAD (1684 × 1191 pt). */
const PAGE_W = 1684;
const PAGE_H = 1191;
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

function dimH(ctx: Ctx, x0: number, x1: number, y: number, label: string, size = 8) {
  if (Math.abs(x1 - x0) < 2) return;
  line(ctx, x0, y, x1, y, 0.45);
  tick(ctx, x0, y);
  tick(ctx, x1, y);
  text(ctx, label, (x0 + x1) / 2, y - 11, size, false, "center");
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

function balloon(ctx: Ctx, x: number, y: number, n: number, r = 6.2) {
  circle(ctx, x, y, r, false);
  text(ctx, String(n), x, y + r * 0.72, 8, true, "center");
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

function packFloorPages(floors: Floor[], usableW: number) {
  const MIN = 0.072;
  const MAX = 0.2;
  const total = floors.reduce((s, f) => s + f.heightMm, 0);
  const scaleAll = usableW / Math.max(total, 1);
  if (scaleAll >= MIN || floors.length <= 1) {
    return [{ floors, scale: Math.min(Math.max(scaleAll, 0.04), MAX), totalMm: total }];
  }
  const pages: Array<{ floors: Floor[]; scale: number; totalMm: number }> = [];
  let chunk: Floor[] = [];
  let acc = 0;
  for (const floor of floors) {
    if (chunk.length && (acc + floor.heightMm) * MIN > usableW) {
      pages.push({ floors: chunk, scale: Math.min(usableW / acc, MAX), totalMm: acc });
      chunk = [];
      acc = 0;
    }
    chunk.push(floor);
    acc += floor.heightMm;
  }
  if (chunk.length) {
    pages.push({ floors: chunk, scale: Math.min(usableW / acc, MAX), totalMm: acc });
  }
  return pages;
}

function stirrupTicks(
  ctx: Ctx,
  x0: number,
  x1: number,
  yTop: number,
  yBot: number,
  spacingMm: number,
  scale: number,
) {
  if (spacingMm <= 0) return;
  const step = spacingMm * scale;
  if (step < 2.2) return;
  const span = Math.abs(x1 - x0);
  const n = Math.max(2, Math.round(span / step));
  for (let i = 0; i <= n; i += 1) {
    const x = x0 + (span * i) / n;
    line(ctx, x, yTop + 1.2, x, yBot - 1.2, 0.4);
  }
}

function zigzag(ctx: Ctx, x0: number, x1: number, y: number) {
  const mid = (x0 + x1) / 2;
  const z = 4.2;
  const g = 7;
  line(ctx, x0, y, mid - g, y, 0.7, [5, 3.2]);
  line(ctx, mid - g, y, mid - g / 2, y - z, 0.7);
  line(ctx, mid - g / 2, y - z, mid + g / 2, y + z, 0.7);
  line(ctx, mid + g / 2, y + z, mid + g, y, 0.7);
  line(ctx, mid + g, y, x1, y, 0.7, [5, 3.2]);
}

function drawBeamBox(ctx: Ctx, x: number, y: number, w: number, h: number) {
  line(ctx, x, y, x, y + h, 0.7, [5, 3.2]);
  line(ctx, x + w, y, x + w, y + h, 0.7, [5, 3.2]);
  zigzag(ctx, x, x + w, y);
  zigzag(ctx, x, x + w, y + h);
}

function kinkBar(ctx: Ctx, x0: number, x1: number, y: number, kinkX: number, amp: number, w = 1.15) {
  const k = Math.min(x1 - 6, Math.max(x0 + 6, kinkX));
  line(ctx, x0, y, k - 5, y, w);
  line(ctx, k - 5, y, k, y + amp, w);
  line(ctx, k, y + amp, k + 5, y, w);
  line(ctx, k + 5, y, x1, y, w);
}

function drawExplodedSplice(
  ctx: Ctx,
  x0: number,
  floorW: number,
  y: number,
  floor: Floor,
  column: Column,
  section: FloorSection,
  scale: number,
) {
  const H = floor.heightMm;
  const x1 = x0 + floorW;
  if (column.baseSplice) {
    const d = lapMm(section.mainDia, column.baseSpliceD);
    const a = d * scale;
    const b = 2 * d * scale;
    kinkBar(ctx, x0, x1, y, x0 + a, -4.5, 1.2);
    kinkBar(ctx, x0, x1, y + 8, x0 + b, 4.5, 1.2);
    dimH(ctx, x0, x0 + a, y + 22, String(Math.round(d)), 7.5);
    dimH(ctx, x0 + a, x0 + b, y + 22, String(Math.round(d)), 7.5);
    dimH(ctx, x0 + b, x1, y + 22, String(Math.round(H - 2 * d)), 7.5);
  } else if (column.midSplice) {
    const mid = midSplicePosMm(floor);
    const d = lapMm(section.mainDia, column.midSpliceD);
    const xm = x0 + mid * scale;
    const xn = x0 + (mid + d) * scale;
    kinkBar(ctx, x0, x1, y, xm, -4.5, 1.2);
    kinkBar(ctx, x0, x1, y + 8, xn, 4.5, 1.2);
    dimH(ctx, x0, xm, y + 22, String(Math.round(mid)), 7.5);
    dimH(ctx, xm, xn, y + 22, String(Math.round(d)), 7.5);
    dimH(ctx, xn, x1, y + 22, String(Math.round(H - mid - d)), 7.5);
  } else {
    line(ctx, x0, y + 4, x1, y + 4, 1.2);
    dimH(ctx, x0, x1, y + 22, String(H), 7.5);
  }
  dimH(ctx, x0, x1, y + 38, String(H), 8);
}

function drawShaftBars(
  ctx: Ctx,
  x0: number,
  x1: number,
  yTop: number,
  yBot: number,
  column: Column,
  floor: Floor,
  section: FloorSection,
  scale: number,
) {
  const inset = 5;
  const yA = yTop + inset;
  const yB = yBot - inset;
  const yC = (yTop + yBot) / 2;
  const nShow = Math.min(4, Math.max(2, section.barsY));
  const ys = nShow === 2 ? [yA, yB] : nShow === 3 ? [yA, yC, yB] : [yA, (yA + yC) / 2, (yB + yC) / 2, yB];
  const kinks: number[] = [];
  if (column.baseSplice) {
    const d = lapMm(section.mainDia, column.baseSpliceD) * scale;
    kinks.push(x0 + d, x0 + 2 * d);
  } else if (column.midSplice) {
    const mid = midSplicePosMm(floor) * scale;
    const d = lapMm(section.mainDia, column.midSpliceD) * scale;
    kinks.push(x0 + mid, x0 + mid + d);
  }
  ys.forEach((y, i) => {
    const amp = i % 2 === 0 ? -3.2 : 3.2;
    if (kinks.length) {
      kinkBar(ctx, x0 + 1, x1 - 1, y, kinks[i % kinks.length], amp, 1.05);
    } else {
      line(ctx, x0 + 1, y, x1 - 1, y, 1.05);
    }
  });
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

function drawSectionDetail(
  ctx: Ctx,
  x: number,
  y: number,
  section: FloorSection,
  shape: Column["shape"],
) {
  const aspect = section.cy / Math.max(section.cx, 1);
  const w = 52;
  const h = Math.max(40, Math.min(78, w * aspect));
  const pad = 6;

  if (shape === "TRON") {
    const r = Math.min(w, h) / 2 - 1;
    circle(ctx, x + w / 2, y + h / 2, r, false);
    if (hasMainStirrup(section)) circle(ctx, x + w / 2, y + h / 2, r - pad, false);
  } else {
    rect(ctx, x, y, w, h, 1.05);
    if (hasMainStirrup(section)) rect(ctx, x + pad, y + pad, w - 2 * pad, h - 2 * pad, 0.85);
    const sLeft = x + pad;
    const sTop = y + pad;
    const sW = w - 2 * pad;
    const sH = h - 2 * pad;
    const sRight = sLeft + sW;
    const sBottom = sTop + sH;
    const hook = 5;
    const ret = 3;
    const barR = 2.1;
    const barInset = pad + 0.45 + barR + 0.6;
    const insetPad = barInset - pad;
    const xs = edgeBarCenters(section.barsX, x + barInset, w - 2 * barInset);
    const ys = edgeBarCenters(section.barsY, y + barInset, h - 2 * barInset);
    if (nestedAlongX(section) && !section.tieDouble.enabled) {
      const box = nestedTieRect(section.barsX, xs, insetPad, sTop, sH, "x");
      rect(ctx, box.x, box.y, box.w, box.h, 0.75);
    }
    if (nestedAlongY(section) && !section.tieDouble.enabled) {
      const box = nestedTieRect(section.barsY, ys, insetPad, sLeft, sW, "y");
      rect(ctx, box.x, box.y, box.w, box.h, 0.75);
    }
    if (doubleAlongX(section) && !section.tieNested.enabled) {
      const wrap = doubleMinWrap(section.barsX);
      const leftBox = nestedTieRect(section.barsX, xs, insetPad, sTop, sH, "x", wrap, "start");
      const rightBox = nestedTieRect(section.barsX, xs, insetPad, sTop, sH, "x", wrap, "end");
      rect(ctx, leftBox.x, leftBox.y, leftBox.w, leftBox.h, 0.75);
      rect(ctx, rightBox.x, rightBox.y, rightBox.w, rightBox.h, 0.75);
    }
    if (doubleAlongY(section) && !section.tieNested.enabled) {
      const wrap = doubleMinWrap(section.barsY);
      const topBox = nestedTieRect(section.barsY, ys, insetPad, sLeft, sW, "y", wrap, "start");
      const botBox = nestedTieRect(section.barsY, ys, insetPad, sLeft, sW, "y", wrap, "end");
      rect(ctx, topBox.x, topBox.y, topBox.w, topBox.h, 0.75);
      rect(ctx, botBox.x, botBox.y, botBox.w, botBox.h, 0.75);
    }
    if (cTieAlongX(section)) {
      const cx = sLeft + sW / 2;
      line(ctx, cx + hook, sTop + ret, cx + hook, sTop, 0.85);
      line(ctx, cx + hook, sTop, cx, sTop, 0.85);
      line(ctx, cx, sTop, cx, sBottom, 0.85);
      line(ctx, cx, sBottom, cx + hook, sBottom, 0.85);
      line(ctx, cx + hook, sBottom, cx + hook, sBottom - ret, 0.85);
    }
    if (cTieAlongY(section)) {
      const cy = sTop + sH / 2;
      line(ctx, sLeft + ret, cy + hook, sLeft, cy + hook, 0.85);
      line(ctx, sLeft, cy + hook, sLeft, cy, 0.85);
      line(ctx, sLeft, cy, sRight, cy, 0.85);
      line(ctx, sRight, cy, sRight, cy + hook, 0.85);
      line(ctx, sRight, cy + hook, sRight - ret, cy + hook, 0.85);
    }
  }

  const { pts, barR } = barPoints(section, x, y, w, h);
  pts.forEach(([px, py]) => circle(ctx, px, py, barR, true));

  dimH(ctx, x, x + w, y - 14, String(section.cx), 8);
  dimV(ctx, x + w + 12, y, y + h, String(section.cy), 8);

  const b1x = x + w + 24;
  const b1y = y + 2;
  balloon(ctx, b1x, b1y, 1);
  line(ctx, b1x - 6.5, b1y + 1, x + w - 7, y + 9, 0.5);
  text(ctx, formatBarLabel(section), b1x + 10, b1y + 4, 8.5, true);

  const b2x = x + w + 24;
  const b2y = y + h * 0.58;
  balloon(ctx, b2x, b2y, 2);
  line(ctx, b2x - 6.5, b2y, x + w - pad, y + h / 2, 0.5);
  text(ctx, `Ø${section.tieDia}a200(100)`, b2x + 10, b2y + 4, 8.5);

  const ex = x;
  const ey = y + h + 32;
  const ew = 30;
  rect(ctx, ex, ey, ew, ew, 0.8);
  if (hasMainStirrup(section)) rect(ctx, ex + 4.5, ey + 4.5, ew - 9, ew - 9, 0.7);
  balloon(ctx, ex + ew + 14, ey + ew / 2, 2);

  const tableX = x + 58;
  const tableY = y + h + 28;
  const colW = 80;
  const rowH = 22;
  rect(ctx, tableX, tableY, colW * 2, rowH * 2, 0.7);
  line(ctx, tableX + colW, tableY, tableX + colW, tableY + rowH * 2, 0.7);
  line(ctx, tableX, tableY + rowH, tableX + colW * 2, tableY + rowH, 0.7);
  text(ctx, "THÉP DỌC", tableX + colW / 2, tableY + 16, 7, true, "center");
  text(ctx, "THÉP ĐAI CHÍNH", tableX + colW + colW / 2, tableY + 16, 6.5, true, "center");
  text(ctx, formatBarLabel(section), tableX + colW / 2, tableY + rowH + 16, 9, true, "center");
  text(ctx, `Ø${section.tieDia}`, tableX + colW + colW / 2, tableY + rowH + 16, 9, false, "center");

  return { w, h };
}

function elevMarker(ctx: Ctx, x: number, y: number, label: string) {
  fillRect(ctx, x - 3.1, y - 3.1, 6.2, 6.2);
  line(ctx, x, y - 18, x, y + 18, 0.55);
  vtext(ctx, label, x + 12, y, 8.5);
}

function drawColumnSheet(
  ctx: Ctx,
  project: Project,
  column: Column,
  floors: Floor[],
  scale: number,
  pageIndex: number,
  pageCount: number,
) {
  ctx.page.drawRectangle({ x: 0, y: 0, width: ctx.W, height: ctx.H, color: WHITE });

  const frameX = 48;
  const frameY = 36;
  const frameW = ctx.W - 96;
  const frameH = ctx.H - 72;
  rect(ctx, frameX, frameY, frameW, frameH, 1.15);

  const leftW = 86;
  const drawX = frameX + leftW;
  const headerH = frameH * 0.132;
  const elevH = frameH * 0.434;
  const sectH = frameH - headerH - elevH;
  const y0 = frameY;
  const yHeader = y0;
  const yElev = y0 + headerH;
  const ySect = yElev + elevH;
  const yEnd = y0 + frameH;
  const headerMid = yHeader + headerH * 0.46;

  line(ctx, drawX, yHeader, drawX, yEnd, 0.75);
  line(ctx, frameX, yElev, frameX + frameW, yElev, 0.75);
  line(ctx, frameX, ySect, frameX + frameW, ySect, 0.75);
  line(ctx, drawX, headerMid, frameX + frameW, headerMid, 0.65);

  vtext(ctx, "CAO ĐỘ", frameX + leftW / 2, yHeader + headerH / 2, 9.2, true);
  vtext(ctx, "MẶT ĐỨNG", frameX + leftW / 2, yElev + elevH / 2, 9.2, true);

  const name = `${column.name} (SL: ${column.quantity})`;
  const split = frameX + 42;
  line(ctx, split, ySect, split, yEnd, 0.65);
  vtext(ctx, "MẶT CẮT", frameX + 21, ySect + sectH / 2, 9, true);
  vtext(ctx, name, (split + drawX) / 2, ySect + sectH / 2, 9, true);

  const elevations = floorElevations(project.floors);
  const floorW = (f: Floor) => f.heightMm * scale;
  let x = drawX;
  const lastX = drawX + floors.reduce((s, f) => s + floorW(f), 0);

  floors.forEach((floor, i) => {
    const w = floorW(floor);
    const x1 = x + w;
    text(ctx, `TẦNG ${floor.name}`, x + w / 2, yHeader + (headerMid - yHeader) * 0.62, 9.2, true, "center");
    if (i > 0) {
      line(ctx, x, yHeader, x, yElev, 0.7);
      line(ctx, x, ySect, x, yEnd, 0.7);
    }
    const elev0 = elevations[floor.id - 1] ?? 0;
    elevMarker(ctx, x + 1, headerMid + (yElev - headerMid) * 0.5, `+${elev0.toFixed(3)}`);
    x = x1;
  });
  const lastFloor = floors[floors.length - 1];
  const elevTop = elevations[lastFloor.id] ?? 0;
  elevMarker(ctx, lastX - 1, headerMid + (yElev - headerMid) * 0.5, `+${elevTop.toFixed(3)}`);
  line(ctx, lastX, yHeader, lastX, yElev, 0.7);
  line(ctx, lastX, ySect, lastX, yEnd, 0.7);

  const shaftH = Math.max(24, Math.min(40, floors[0] ? sectionFor(column, floors[0].id).cx * scale : 32));
  const shaftY = yElev + 82;
  const dimY = shaftY - 58;
  const labelY = shaftY - 32;

  x = drawX;
  floors.forEach((floor, index) => {
    const section = sectionFor(column, floor.id);
    const w = floorW(floor);
    const zones = elevationZones(floor, index);
    const yTop = shaftY;
    const yBot = shaftY + shaftH;
    let zx = x;
    zones.forEach((zone) => {
      const zw = zone.len * scale;
      const zx1 = zx + zw;
      if (zone.dashed) {
        drawBeamBox(ctx, zx, yTop, zw, shaftH);
      } else {
        line(ctx, zx, yTop, zx1, yTop, 1.05);
        line(ctx, zx, yBot, zx1, yBot, 1.05);
        if (zx === x) line(ctx, zx, yTop, zx, yBot, 1.05);
        stirrupTicks(ctx, zx, zx1, yTop, yBot, zone.spacing, scale);
      }
      dimH(ctx, zx, zx1, dimY, String(Math.round(zone.len)), 8);
      if (zone.label) {
        const mx = (zx + zx1) / 2;
        balloon(ctx, mx, labelY - 8, 2, 5.4);
        text(ctx, `Ø${section.tieDia}${zone.label}`, mx, labelY + 8, 8, false, "center");
        line(ctx, mx, labelY + 10, mx, yTop, 0.4);
      }
      zx = zx1;
    });
    if (index === 0) line(ctx, x, yTop, x, yBot, 1.1);
    if (index === floors.length - 1) line(ctx, x + w, yTop, x + w, yBot, 1.1);
    drawShaftBars(ctx, x, x + w, yTop, yBot, column, floor, section, scale);
    drawExplodedSplice(ctx, x, w, yBot + 26, floor, column, section, scale);

    const secX = x + Math.max(18, w - 230);
    const secY = ySect + 52;
    drawSectionDetail(ctx, secX, secY, section, column.shape);
    x += w;
  });

  const note = pageCount > 1 ? `  ·  trang ${pageIndex + 1}/${pageCount}` : "";
  text(ctx, `CHI TIẾT CỘT ${column.name}  ·  SL: ${column.quantity}${note}`, frameX, yEnd + 16, 8, true);
  text(ctx, "Shop drawing thép cột  ·  A2", frameX + frameW, yEnd + 16, 8, false, "right");
}

function drawSchedulePage(ctx: Ctx, project: Project, startRow: number, maxRows: number) {
  ctx.page.drawRectangle({ x: 0, y: 0, width: ctx.W, height: ctx.H, color: WHITE });
  const x = 36;
  const y = 36;
  const w = ctx.W - 72;
  const h = ctx.H - 72;
  rect(ctx, x, y, w, h, 1.15);
  text(ctx, "BẢNG THỐNG KÊ CỐT THÉP", x + w / 2, y + 22, 13, true, "center");

  const headers = [
    [0, "KIỆN CẤU"],
    [110, "STT"],
    [150, "HÌNH DẠNG, KÍCH THƯỚC (mm)"],
    [430, "Ø"],
    [470, "DÀI"],
    [530, "1 CK"],
    [590, "T.BỘ"],
    [660, "TONG L (m)"],
    [760, "KL (kg)"],
  ] as const;
  const tableY = y + 42;
  headers.forEach(([dx, label]) => text(ctx, label, x + 14 + dx, tableY, 8, true));
  line(ctx, x + 10, tableY + 8, x + w - 10, tableY + 8, 0.7);

  const { rows, byDia, stirrupCounts } = buildSchedule(project);
  const slice = rows.slice(startRow, startRow + maxRows);
  let rowY = tableY + 24;
  let lastMember = "";
  slice.forEach((row) => {
    if (row.member !== lastMember) {
      if (lastMember) rowY += 8;
      text(ctx, row.member, x + 14, rowY, 8, true);
      text(ctx, `(SL: ${row.quantity})`, x + 14, rowY + 11, 6.5);
      lastMember = row.member;
    }
    text(ctx, String(row.stt), x + 124, rowY, 8);
    if (row.kind === "stirrup") {
      const [hook, a, b] = row.segs;
      line(ctx, x + 168, rowY + 2, x + 230, rowY + 2, 0.8);
      line(ctx, x + 168, rowY + 2, x + 168, rowY - 12, 0.8);
      line(ctx, x + 230, rowY + 2, x + 230, rowY - 12, 0.8);
      text(ctx, String(a), x + 199, rowY - 14, 6.5, false, "center");
      text(ctx, String(b), x + 238, rowY - 4, 6.5);
      text(ctx, String(hook), x + 160, rowY - 4, 6.5, false, "right");
    } else if (row.kind === "long-hook") {
      line(ctx, x + 168, rowY, x + 250, rowY, 0.8);
      line(ctx, x + 168, rowY, x + 168, rowY - 12, 0.8);
      text(ctx, String(row.segs[0]), x + 162, rowY - 10, 6.5, false, "right");
      text(ctx, String(row.segs[1]), x + 209, rowY - 12, 6.5, false, "center");
      text(ctx, row.shapeLabel, x + 258, rowY, 8);
    } else {
      line(ctx, x + 168, rowY, x + 268, rowY, 0.8);
      text(ctx, String(row.lengthMm), x + 218, rowY - 12, 6.5, false, "center");
      text(ctx, row.shapeLabel, x + 276, rowY, 8);
    }
    text(ctx, String(row.dia), x + 444, rowY, 8);
    text(ctx, String(row.lengthMm), x + 484, rowY, 8);
    text(ctx, String(row.perMember), x + 544, rowY, 8);
    text(ctx, String(row.totalBars), x + 604, rowY, 8);
    text(ctx, row.totalLengthM.toFixed(1), x + 674, rowY, 8);
    text(ctx, row.weightKg.toFixed(1), x + 774, rowY, 8);
    rowY += 20;
  });

  const more = startRow + maxRows < rows.length;
  if (!more) {
    const sumY = y + h - 168;
    line(ctx, x + 10, sumY - 10, x + w - 10, sumY - 10, 0.7);
    text(ctx, "ĐƯỜNG KÍNH", x + 16, sumY, 8, true);
    text(ctx, "TRỌNG LƯỢNG (kg)", x + 130, sumY, 8, true);
    text(ctx, "CHIỀU DÀI (m)", x + 280, sumY, 8, true);
    text(ctx, `SỐ LƯỢNG THÉP ${STOCK_M}m (cây)`, x + 410, sumY, 8, true);
    let dy = sumY + 16;
    [...byDia.entries()]
      .sort((a, b) => a[0] - b[0])
      .forEach(([dia, val]) => {
        text(ctx, `Ø${dia}`, x + 16, dy, 8);
        text(ctx, val.weight.toFixed(1), x + 130, dy, 8);
        if (dia > 6) {
          text(ctx, val.length.toFixed(2), x + 280, dy, 8);
          text(ctx, String(stockBars(val.length)), x + 410, dy, 8);
        }
        dy += 13;
      });
    const buckets = summaryBuckets(byDia);
    dy += 4;
    text(ctx, `- Tổng hợp thép D<=10: ${buckets.le10.toFixed(1)} kg`, x + 16, dy, 8);
    dy += 13;
    text(ctx, `- Tổng hợp thép D<=18: ${buckets.le18.toFixed(1)} kg`, x + 16, dy, 8);
    dy += 13;
    text(ctx, `- Tổng hợp thép D>18: ${buckets.gt18.toFixed(1)} kg`, x + 16, dy, 8);
    dy += 13;
    stirrupCounts.forEach((count, key) => {
      text(ctx, `- Thép đai ${key}: ${count} cái`, x + 16, dy, 8);
      dy += 13;
    });
  } else {
    text(ctx, `… tiếp theo (${rows.length - startRow - maxRows} dòng)`, x + 16, y + h - 20, 8, false);
  }

  return { total: rows.length };
}

function newPage(doc: PDFDocument, font: PDFFont, fontBold: PDFFont): Ctx {
  const page = doc.addPage([PAGE_W, PAGE_H]);
  return { page, font, fontBold, W: PAGE_W, H: PAGE_H };
}

export async function generateColumnPdf(
  project: Project,
  fonts: { regular: ArrayBuffer; bold: ArrayBuffer },
) {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(fonts.regular, { subset: true });
  const fontBold = await doc.embedFont(fonts.bold, { subset: true });

  for (const column of project.columns) {
    const floors = columnFloors(column, project.floors);
    if (!floors.length) continue;
    const usableW = PAGE_W - 96 - 86;
    const packs = packFloorPages(floors, usableW);
    packs.forEach((pack, i) => {
      const ctx = newPage(doc, font, fontBold);
      drawColumnSheet(ctx, project, column, pack.floors, pack.scale, i, packs.length);
    });
  }

  const { rows } = buildSchedule(project);
  const perPage = 36;
  const pages = Math.max(1, Math.ceil(rows.length / perPage));
  for (let i = 0; i < pages; i += 1) {
    const ctx = newPage(doc, font, fontBold);
    drawSchedulePage(ctx, project, i * perPage, perPage);
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
  return url;
}
