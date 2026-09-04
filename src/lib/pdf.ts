import { PDFDocument, PDFFont, PDFPage, rgb, degrees } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import {
  barCount,
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
import { EMBED_MM, STOCK_M, type Column, type FloorSection, type Project } from "./types";

const PAGE_W = 3370;
const PAGE_H = 2384;
const BLACK = rgb(0, 0, 0);
const WHITE = rgb(1, 1, 1);

type Ctx = {
  page: PDFPage;
  font: PDFFont;
  fontBold: PDFFont;
};

function ty(y: number) {
  return PAGE_H - y;
}

function line(ctx: Ctx, x1: number, y1: number, x2: number, y2: number, w = 0.8) {
  ctx.page.drawLine({
    start: { x: x1, y: ty(y1) },
    end: { x: x2, y: ty(y2) },
    thickness: w,
    color: BLACK,
  });
}

function rect(ctx: Ctx, x: number, y: number, w: number, h: number, t = 0.9) {
  ctx.page.drawRectangle({
    x,
    y: ty(y + h),
    width: w,
    height: h,
    borderColor: BLACK,
    borderWidth: t,
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
    y: ty(y) - size * 0.72,
    size,
    font,
    color: BLACK,
  });
}

function circle(ctx: Ctx, cx: number, cy: number, r: number, fill = true) {
  ctx.page.drawEllipse({
    x: cx,
    y: ty(cy),
    xScale: r,
    yScale: r,
    borderColor: BLACK,
    borderWidth: fill ? 0 : 0.6,
    color: fill ? BLACK : undefined,
    rotate: degrees(0),
  });
}

function barPoints(section: FloorSection, x: number, y: number, w: number, h: number) {
  const barR = 2.1;
  const m = 6 + 0.45 + barR + 0.8;
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
  return pts;
}

function drawSection(
  ctx: Ctx,
  x: number,
  y: number,
  section: FloorSection,
  shape: Column["shape"],
  label: string,
) {
  const w = 54;
  const h = section.cy >= section.cx ? 72 : 54;
  if (shape === "TRON") {
    const r = Math.min(w, h) / 2 - 2;
    circle(ctx, x + w / 2, y + h / 2, r, false);
    if (hasMainStirrup(section)) {
      circle(ctx, x + w / 2, y + h / 2, r - 6, false);
    }
  } else {
    rect(ctx, x, y, w, h, 1.1);
    if (hasMainStirrup(section)) {
      rect(ctx, x + 6, y + 6, w - 12, h - 12, 0.9);
    }
    const sLeft = x + 6;
    const sTop = y + 6;
    const sW = w - 12;
    const sH = h - 12;
    const sRight = sLeft + sW;
    const sBottom = sTop + sH;
    const hook = 5;
    const ret = 3;
    const barR = 2.1;
    const barInset = 6 + 0.45 + barR + 0.8;
    const pad = barInset - 6;
    const xs = edgeBarCenters(section.barsX, x + barInset, w - 2 * barInset);
    const ys = edgeBarCenters(section.barsY, y + barInset, h - 2 * barInset);
    if (nestedAlongX(section) && !section.tieDouble.enabled) {
      const box = nestedTieRect(section.barsX, xs, pad, sTop, sH, "x");
      rect(ctx, box.x, box.y, box.w, box.h, 0.8);
    }
    if (nestedAlongY(section) && !section.tieDouble.enabled) {
      const box = nestedTieRect(section.barsY, ys, pad, sLeft, sW, "y");
      rect(ctx, box.x, box.y, box.w, box.h, 0.8);
    }
    if (doubleAlongX(section) && !section.tieNested.enabled) {
      const wrap = doubleMinWrap(section.barsX);
      const leftBox = nestedTieRect(section.barsX, xs, pad, sTop, sH, "x", wrap, "start");
      const rightBox = nestedTieRect(section.barsX, xs, pad, sTop, sH, "x", wrap, "end");
      rect(ctx, leftBox.x, leftBox.y, leftBox.w, leftBox.h, 0.8);
      rect(ctx, rightBox.x, rightBox.y, rightBox.w, rightBox.h, 0.8);
    }
    if (doubleAlongY(section) && !section.tieNested.enabled) {
      const wrap = doubleMinWrap(section.barsY);
      const topBox = nestedTieRect(section.barsY, ys, pad, sLeft, sW, "y", wrap, "start");
      const botBox = nestedTieRect(section.barsY, ys, pad, sLeft, sW, "y", wrap, "end");
      rect(ctx, topBox.x, topBox.y, topBox.w, topBox.h, 0.8);
      rect(ctx, botBox.x, botBox.y, botBox.w, botBox.h, 0.8);
    }
    if (cTieAlongX(section)) {
      const cx = sLeft + sW / 2;
      line(ctx, cx + hook, sTop + ret, cx + hook, sTop, 0.9);
      line(ctx, cx + hook, sTop, cx, sTop, 0.9);
      line(ctx, cx, sTop, cx, sBottom, 0.9);
      line(ctx, cx, sBottom, cx + hook, sBottom, 0.9);
      line(ctx, cx + hook, sBottom, cx + hook, sBottom - ret, 0.9);
    }
    if (cTieAlongY(section)) {
      const cy = sTop + sH / 2;
      line(ctx, sLeft + ret, cy + hook, sLeft, cy + hook, 0.9);
      line(ctx, sLeft, cy + hook, sLeft, cy, 0.9);
      line(ctx, sLeft, cy, sRight, cy, 0.9);
      line(ctx, sRight, cy, sRight, cy + hook, 0.9);
      line(ctx, sRight, cy + hook, sRight - ret, cy + hook, 0.9);
    }
  }
  barPoints(section, x, y, w, h).forEach(([px, py]) => circle(ctx, px, py, 2.1, true));
  text(ctx, `${section.cx}`, x + w / 2, y - 12, 8, false, "center");
  text(ctx, `${section.cy}`, x + w + 8, y + h / 2, 8);
  text(ctx, "THÉP DỌC", x + w / 2, y + h + 14, 7, true, "center");
  text(ctx, label, x + w / 2, y + h + 26, 8, true, "center");
  text(ctx, "THÉP ĐAI CHÍNH", x + w / 2, y + h + 40, 7, true, "center");
  text(ctx, `Ø${section.tieDia}`, x + w / 2, y + h + 52, 8, false, "center");
  return { w, h };
}

function dimV(ctx: Ctx, x: number, y0: number, y1: number, label: string) {
  line(ctx, x, y0, x, y1, 0.5);
  line(ctx, x - 3, y0, x + 3, y0, 0.5);
  line(ctx, x - 3, y1, x + 3, y1, 0.5);
  text(ctx, label, x - 6, (y0 + y1) / 2, 7, false, "right");
}

function drawColumnPanel(
  ctx: Ctx,
  originX: number,
  originY: number,
  width: number,
  height: number,
  project: Project,
  column: Column,
) {
  rect(ctx, originX, originY, width, height, 1.1);
  text(ctx, "CAO ĐỘ", originX + 18, originY + 18, 9, true);
  text(ctx, "MẶT ĐỨNG", originX + 118, originY + 18, 9, true);
  text(ctx, `${column.name} (SL: ${column.quantity})`, originX + width / 2, originY + 18, 11, true, "center");
  text(ctx, "MẶT CẮT", originX + width - 90, originY + 18, 9, true);

  const floors = columnFloors(column, project.floors);
  const elevations = floorElevations(project.floors);
  const totalH = floors.reduce((s, f) => s + f.heightMm, 0);
  const elevTop = originY + 36;
  const elevH = height - 70;
  const scale = elevH / (totalH + EMBED_MM);
  const colX = originX + 92;
  const colW = 46;
  let y = elevTop + elevH;

  line(ctx, colX, elevTop, colX, elevTop + elevH, 1.2);
  line(ctx, colX + colW, elevTop, colX + colW, elevTop + elevH, 1.2);

  floors.forEach((floor, index) => {
    const section = sectionFor(column, floor.id);
    const hPx = floor.heightMm * scale;
    y -= hPx;
    const zones = denseZones(floor, index);
    const topPx = zones.top * scale;
    const botPx = zones.bot * scale;
    const midPx = zones.mid * scale;

    line(ctx, originX + 12, y + hPx, colX + colW + 18, y + hPx, 0.5);
    text(ctx, `TẦNG ${floor.name}`, originX + 16, y + 14, 8, true);
    text(ctx, `+${elevations[floor.id - 1].toFixed(3)}`, originX + 16, y + hPx - 4, 8);

    const ticks = (y0: number, y1: number, stepPx: number) => {
      const n = Math.max(2, Math.round(Math.abs(y1 - y0) / Math.max(stepPx, 2)));
      for (let i = 0; i <= n; i += 1) {
        const yy = y0 + ((y1 - y0) * i) / n;
        line(ctx, colX + 4, yy, colX + colW - 4, yy, 0.45);
      }
    };
    ticks(y + hPx - topPx, y + hPx, 3.2);
    ticks(y + botPx, y + hPx - topPx, 6.2);
    ticks(y, y + botPx, 3.2);

    dimV(ctx, colX - 18, y + hPx - topPx, y + hPx, String(zones.top));
    dimV(ctx, colX - 18, y + botPx, y + hPx - topPx, String(zones.mid));
    dimV(ctx, colX - 18, y, y + botPx, String(zones.bot));
    dimV(ctx, colX + colW + 22, y, y + hPx, String(floor.heightMm));

    text(ctx, `2 Ø${section.tieDia}a100`, colX + colW + 28, y + hPx - topPx / 2, 7);
    text(ctx, `2 Ø${section.tieDia}a200`, colX + colW + 28, y + botPx + midPx / 2, 7);
    text(ctx, `2 Ø${section.tieDia}a100`, colX + colW + 28, y + botPx / 2, 7);
    text(ctx, `${section.cx}`, colX + colW / 2, y + hPx + 10, 7, false, "center");
    text(ctx, `${section.cy}`, colX - 8, y + hPx / 2, 7, false, "right");

    if (column.baseSplice) {
      const d1 = lapMm(section.mainDia, column.baseSpliceD);
      const d2 = 2 * d1;
      const y1 = y + hPx - d1 * scale;
      const y2 = y + hPx - d2 * scale;
      line(ctx, colX + 2, y1, colX + colW - 2, y1, 0.7);
      line(ctx, colX + 2, y2, colX + colW - 2, y2, 0.7);
      text(ctx, `nối ${column.baseSpliceD}D / ${2 * column.baseSpliceD}D`, colX + colW + 28, y + hPx - 10, 6);
    }
    if (column.midSplice) {
      const mid = midSplicePosMm(floor);
      const hi = mid + lapMm(section.mainDia, column.midSpliceD);
      const yMid = y + hPx - mid * scale;
      const yHi = y + hPx - hi * scale;
      line(ctx, colX + 2, yMid, colX + colW - 2, yMid, 0.7);
      line(ctx, colX + 2, yHi, colX + colW - 2, yHi, 0.7);
      text(ctx, `giữa ${Math.round(mid)}+${column.midSpliceD}D`, colX + colW + 28, yMid, 6);
    }

    const secX = originX + width - 118;
    const secY = y + Math.max(8, (hPx - 90) / 2);
    drawSection(ctx, secX, secY, section, column.shape, formatBarLabel(section));
    text(ctx, `Ø${section.tieDia}a200(100)`, secX + 27, secY - 24, 7, false, "center");
    text(ctx, `${barCount(section)}`, colX + 8, y + 16, 7);
    text(ctx, `${barCount(section)}`, colX + colW - 14, y + 16, 7);
  });

  text(ctx, `+${elevations[floors[floors.length - 1].id].toFixed(3)}`, originX + 16, elevTop + 12, 8);
}

function drawSchedule(ctx: Ctx, x: number, y: number, w: number, h: number, project: Project) {
  rect(ctx, x, y, w, h, 1.1);
  text(ctx, "BẢNG THỐNG KÊ CỐT THÉP", x + w / 2, y + 22, 13, true, "center");

  const headers = [
    [0, "KIỆN CẤU"],
    [78, "STT"],
    [108, "HÌNH DẠNG, KÍCH THƯỚC (mm)"],
    [268, "Ø"],
    [298, "DÀI"],
    [338, "1 CK"],
    [378, "T.BỘ"],
    [418, "Σ L (m)"],
    [468, "KL (kg)"],
  ] as const;
  const tableY = y + 40;
  headers.forEach(([dx, label]) => text(ctx, label, x + 10 + dx, tableY, 7, true));
  line(ctx, x + 8, tableY + 8, x + w - 8, tableY + 8, 0.7);

  const { rows, byDia, stirrupCounts } = buildSchedule(project);
  let rowY = tableY + 22;
  let lastMember = "";
  rows.forEach((row) => {
    if (rowY > y + h - 160) return;
    if (row.member !== lastMember) {
      text(ctx, row.member, x + 10, rowY, 7, true);
      text(ctx, `(SL: ${row.quantity})`, x + 10, rowY + 10, 6);
      lastMember = row.member;
    }
    text(ctx, String(row.stt), x + 88, rowY, 7);
    if (row.kind === "stirrup") {
      const [hook, a, b] = row.segs;
      line(ctx, x + 118, rowY + 2, x + 154, rowY + 2, 0.8);
      line(ctx, x + 118, rowY + 2, x + 118, rowY - 10, 0.8);
      line(ctx, x + 154, rowY + 2, x + 154, rowY - 10, 0.8);
      text(ctx, String(a), x + 136, rowY - 12, 6, false, "center");
      text(ctx, String(b), x + 160, rowY - 4, 6);
      text(ctx, String(hook), x + 110, rowY - 4, 6, false, "right");
    } else if (row.kind === "long-hook") {
      line(ctx, x + 118, rowY, x + 170, rowY, 0.8);
      line(ctx, x + 118, rowY, x + 118, rowY - 10, 0.8);
      text(ctx, String(row.segs[0]), x + 112, rowY - 8, 6, false, "right");
      text(ctx, String(row.segs[1]), x + 144, rowY - 10, 6, false, "center");
      text(ctx, row.shapeLabel, x + 178, rowY, 7);
    } else {
      line(ctx, x + 118, rowY, x + 188, rowY, 0.8);
      text(ctx, String(row.lengthMm), x + 153, rowY - 10, 6, false, "center");
    }
    text(ctx, String(row.dia), x + 278, rowY, 7);
    text(ctx, String(row.lengthMm), x + 308, rowY, 7);
    text(ctx, String(row.perMember), x + 348, rowY, 7);
    text(ctx, String(row.totalBars), x + 388, rowY, 7);
    text(ctx, row.totalLengthM.toFixed(1), x + 428, rowY, 7);
    text(ctx, row.weightKg.toFixed(1), x + 478, rowY, 7);
    rowY += 18;
  });

  const sumY = y + h - 130;
  line(ctx, x + 8, sumY - 8, x + w - 8, sumY - 8, 0.7);
  text(ctx, "ĐƯỜNG KÍNH", x + 12, sumY, 8, true);
  text(ctx, "TRỌNG LƯỢNG (kg)", x + 110, sumY, 8, true);
  text(ctx, "CHIỀU DÀI (m)", x + 230, sumY, 8, true);
  text(ctx, `SỐ LƯỢNG THÉP ${STOCK_M}m (cây)`, x + 330, sumY, 8, true);

  let dy = sumY + 16;
  [...byDia.entries()]
    .sort((a, b) => a[0] - b[0])
    .forEach(([dia, val]) => {
      text(ctx, `Ø${dia}`, x + 12, dy, 8);
      text(ctx, val.weight.toFixed(1), x + 110, dy, 8);
      if (dia > 6) {
        text(ctx, val.length.toFixed(2), x + 230, dy, 8);
        text(ctx, String(stockBars(val.length)), x + 330, dy, 8);
      }
      dy += 14;
    });

  const buckets = summaryBuckets(byDia);
  dy += 6;
  text(ctx, `- Tổng hợp thép D<=10: ${buckets.le10.toFixed(1)} kg`, x + 12, dy, 8);
  dy += 13;
  text(ctx, `- Tổng hợp thép D<=18: ${buckets.le18.toFixed(1)} kg`, x + 12, dy, 8);
  dy += 13;
  text(ctx, `- Tổng hợp thép D>18: ${buckets.gt18.toFixed(1)} kg`, x + 12, dy, 8);
  dy += 13;
  stirrupCounts.forEach((count, key) => {
    text(ctx, `- Thép đai ${key}: ${count} cái`, x + 12, dy, 8);
    dy += 13;
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
  const ctx: Ctx = { page, font, fontBold };

  page.drawRectangle({
    x: 0,
    y: 0,
    width: PAGE_W,
    height: PAGE_H,
    color: WHITE,
  });
  rect(ctx, 16, 16, PAGE_W - 32, PAGE_H - 32, 1.3);

  const n = project.columns.length;
  const left = 28;
  const top = 28;
  const usableW = PAGE_W - 56;
  const usableH = PAGE_H - 56;
  const scheduleW = 560;
  const panelW = (usableW - scheduleW) / Math.max(n, 1);

  project.columns.forEach((column, i) => {
    drawColumnPanel(ctx, left + i * panelW, top, panelW - 8, usableH, project, column);
  });
  drawSchedule(ctx, left + n * panelW, top, scheduleW - 8, usableH, project);

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
