import { CIRCULAR_STIRRUP_HOOK_MM, COVER_MM, EMBED_MM, MIN_BAR_CLEAR_MM, STOCK_M, STIRRUP_HOOK_MM, TOP_COVER_MM, clampMainDia, clampTieDia, normalizeTie, type Column, type Floor, type FloorSection, type Project, type ScheduleRow, type SpliceFactor, type TieOption } from "./types";

export function barCount(section: FloorSection) {
  const edge = section.barsX * 2 + section.barsY * 2 - 4;
  return Math.max(edge, 0);
}

export function columnDiameterMm(section: FloorSection) {
  return Math.max(section.cx, section.cy);
}

export function circularStirrupDiaMm(section: FloorSection) {
  return Math.max(40, columnDiameterMm(section) - 2 * COVER_MM);
}

/** L = πD + 2Ø thép chủ + 75 mm móc mỗi đầu. */
export function circularStirrupLengthMm(section: FloorSection) {
  return Math.round(
    Math.PI * circularStirrupDiaMm(section) + 2 * section.mainDia + 2 * CIRCULAR_STIRRUP_HOOK_MM,
  );
}

type Pt = [number, number];

export type CircularTieOpts = {
  hookLen?: number;
  /** Góc tâm khe (rad). Mặc định 0 — thanh bên phải. */
  gapCenter?: number;
  /** Khoảng hở (dây cung) = đường kính thép chủ, đơn vị vẽ. */
  gapChord?: number;
  /** Thanh chủ bị ôm trong khe. */
  bar?: { x: number; y: number; r: number };
};

function rot2(vx: number, vy: number, ang: number): Pt {
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  return [vx * c - vy * s, vx * s + vy * c];
}

/** Đai vòng: khe = Ø thép chủ, ôm đúng một thanh, móc 135° quanh thanh đó. */
export function circularTieGeom(cx: number, cy: number, r: number, opts: CircularTieOpts = {}) {
  const gapCenter = opts.gapCenter ?? 0;
  const chord = Math.max(1.2, opts.gapChord ?? r * 0.12);
  const half = Math.asin(Math.min(0.92, chord / (2 * Math.max(r, 1))));
  const bar = opts.bar ?? {
    x: cx + Math.max(r - chord / 2, r * 0.55) * Math.cos(gapCenter),
    y: cy + Math.max(r - chord / 2, r * 0.55) * Math.sin(gapCenter),
    r: chord / 2,
  };
  const hook = opts.hookLen ?? Math.max(bar.r * 2.6, r * 0.22);
  const startA = gapCenter + half;
  const endA = gapCenter - half;
  const onRing = (a: number): Pt => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  const start = onRing(startA);
  const end = onRing(endA);
  const toward: Pt = [cx - bar.x, cy - bar.y];
  const wrap = (P: Pt): [Pt, Pt] => {
    const vx = P[0] - bar.x;
    const vy = P[1] - bar.y;
    const cross = vx * toward[1] - vy * toward[0];
    const sign = cross >= 0 ? 1 : -1;
    const v1 = rot2(vx, vy, sign * 0.95);
    const v2 = rot2(vx, vy, sign * 2.2);
    const n1 = Math.hypot(v1[0], v1[1]) || 1;
    const n2 = Math.hypot(v2[0], v2[1]) || 1;
    const len = Math.hypot(vx, vy) || 1;
    const mid: Pt = [bar.x + (v1[0] / n1) * len, bar.y + (v1[1] / n1) * len];
    const tip: Pt = [bar.x + (v2[0] / n2) * (bar.r + hook * 0.42), bar.y + (v2[1] / n2) * (bar.r + hook * 0.42)];
    return [mid, tip];
  };
  const [s1, s2] = wrap(start);
  const [e1, e2] = wrap(end);
  return {
    r,
    startDeg: (startA * 180) / Math.PI,
    endDeg: (endA * 180) / Math.PI + 360,
    startA,
    endA,
    start,
    end,
    bar,
    hooks: [
      [start, s1, s2],
      [end, e1, e2],
    ] as [Pt, Pt, Pt][],
  };
}

export function svgCircularTie(cx: number, cy: number, r: number, opts: CircularTieOpts = {}) {
  const p = circularTieGeom(cx, cy, r, opts);
  const n = (v: number) => v.toFixed(2);
  const [ls, l1, l2] = p.hooks[0];
  const [us, u1, u2] = p.hooks[1];
  return [
    `M ${n(ls[0])} ${n(ls[1])}`,
    `A ${n(r)} ${n(r)} 0 1 1 ${n(us[0])} ${n(us[1])}`,
    `M ${n(ls[0])} ${n(ls[1])}`,
    `L ${n(l1[0])} ${n(l1[1])}`,
    `L ${n(l2[0])} ${n(l2[1])}`,
    `M ${n(us[0])} ${n(us[1])}`,
    `L ${n(u1[0])} ${n(u1[1])}`,
    `L ${n(u2[0])} ${n(u2[1])}`,
  ].join(" ");
}

export function ringBarCenters(n: number, cx: number, cy: number, r: number): Array<[number, number]> {
  const count = Math.max(2, n);
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < count; i += 1) {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / count;
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return pts;
}

/** Góc trên đai (rad), nằm giữa hai thanh chủ — leader chỉ vào đai chứ không vào thép. */
export function circularTieCalloutAngle(n: number) {
  const count = Math.max(2, n);
  return Math.PI + Math.PI / count;
}

export function barAreaCm2(dia: number) {
  return (Math.PI * dia * dia) / 400;
}

export function kgPerMeter(dia: number) {
  return (dia * dia) / 162.2;
}

export function formatBarLabel(section: FloorSection) {
  return `${barCount(section)}Ø${section.mainDia}`;
}

export function steelRatioPercent(section: FloorSection, shape?: Column["shape"]) {
  const steel = barCount(section) * barAreaCm2(section.mainDia);
  const d = columnDiameterMm(section);
  const concrete = shape === "TRON" ? (Math.PI * d * d) / 4 / 100 : (section.cx * section.cy) / 100;
  return concrete > 0 ? (steel / concrete) * 100 : 0;
}

export function floorElevations(floors: Floor[]) {
  const result: number[] = [0];
  let acc = 0;
  for (const floor of floors) {
    acc += floor.heightMm / 1000;
    result.push(Number(acc.toFixed(3)));
  }
  return result;
}

export function normalizeSection(section: FloorSection): FloorSection {
  const tieNested = normalizeTie(section.tieNested);
  const tieDouble = normalizeTie(section.tieDouble);
  const nested = tieDouble.enabled ? { ...tieNested, enabled: false } : tieNested;
  return {
    ...section,
    mainDia: clampMainDia(section.mainDia),
    tieDia: clampTieDia(section.tieDia),
    extraSteel: false,
    extraDia: clampMainDia(section.extraDia),
    extraTieDia: clampTieDia(section.extraTieDia),
    extraTieX: 0,
    extraTieY: 0,
    tieC: normalizeTie(section.tieC),
    tieNested: {
      ...nested,
      wrapBarsX: nestedMinWrap(section.barsX),
      wrapBarsY: nestedMinWrap(section.barsY),
    },
    tieDouble: {
      ...tieDouble,
      wrapBarsX: doubleMinWrap(section.barsX),
      wrapBarsY: doubleMinWrap(section.barsY),
    },
  };
}

export function hasMainStirrup(section: FloorSection, shape?: Column["shape"]) {
  if (shape === "TRON") return true;
  return !section.tieDouble.enabled;
}

export type SectionMarkKind = "long" | "main" | "nested" | "double" | "c";
export type SectionMarkAxis = "x" | "y";

export type SectionMark = {
  mark: number;
  kind: SectionMarkKind;
  axis?: SectionMarkAxis;
  name: string;
  spec: string;
  sizeKey: string;
  xMm?: number;
  yMm?: number;
};

function closedSizeKey(dia: number, xMm: number, yMm: number) {
  const a = Math.round(xMm);
  const b = Math.round(yMm);
  return `Ø${dia}:${Math.max(a, b)}x${Math.min(a, b)}`;
}

function formatTieSize(xMm: number, yMm: number) {
  return `${Math.round(xMm)}×${Math.round(yMm)}`;
}

export function tieSpec(section: FloorSection, kind: Exclude<SectionMarkKind, "long">): string {
  const spacing = (mm: number) => `Ø${section.tieDia}a${mm || 200}`;
  if (kind === "main") return `Ø${section.tieDia}a200(100)`;
  if (kind === "nested") return spacing(section.tieNested.spacingMm);
  if (kind === "double") return spacing(section.tieDouble.spacingMm);
  return spacing(section.tieC.spacingMm);
}

/**
 * Mỗi Ø hoặc mỗi kích thước đai khác nhau = một số hiệu.
 * Đai lồng/kép/C hai phương cùng kích thước thì dùng chung số hiệu.
 */
export function sectionMarks(section: FloorSection, shape?: Column["shape"]): SectionMark[] {
  const circular = shape === "TRON";
  const draft: Array<Omit<SectionMark, "mark">> = [
    { kind: "long", name: "THÉP DỌC", spec: formatBarLabel(section), sizeKey: `long:${formatBarLabel(section)}` },
  ];
  if (hasMainStirrup(section, shape)) {
    if (circular) {
      const d = circularStirrupDiaMm(section);
      draft.push({
        kind: "main",
        name: "THÉP ĐAI CHÍNH",
        spec: tieSpec(section, "main"),
        sizeKey: `Ø${section.tieDia}:D${Math.round(d)}`,
        xMm: d,
        yMm: d,
      });
    } else {
      const { a, b } = stirrupInner(section);
      draft.push({
        kind: "main",
        name: "THÉP ĐAI CHÍNH",
        spec: tieSpec(section, "main"),
        sizeKey: closedSizeKey(section.tieDia, a, b),
        xMm: a,
        yMm: b,
      });
    }
  }
  if (!circular && nestedAlongX(section) && !section.tieDouble.enabled) {
    const box = nestedBoxX(section);
    draft.push({
      kind: "nested",
      axis: "x",
      name: "THÉP ĐAI LỒNG",
      spec: `${tieSpec(section, "nested")} ${formatTieSize(box.xMm, box.yMm)}`,
      sizeKey: closedSizeKey(section.tieDia, box.xMm, box.yMm),
      xMm: box.xMm,
      yMm: box.yMm,
    });
  }
  if (!circular && nestedAlongY(section) && !section.tieDouble.enabled) {
    const box = nestedBoxY(section);
    draft.push({
      kind: "nested",
      axis: "y",
      name: "THÉP ĐAI LỒNG",
      spec: `${tieSpec(section, "nested")} ${formatTieSize(box.xMm, box.yMm)}`,
      sizeKey: closedSizeKey(section.tieDia, box.xMm, box.yMm),
      xMm: box.xMm,
      yMm: box.yMm,
    });
  }
  if (!circular && doubleAlongX(section) && !section.tieNested.enabled) {
    const box = doubleBoxX(section);
    draft.push({
      kind: "double",
      axis: "x",
      name: "THÉP ĐAI KÉP",
      spec: `${tieSpec(section, "double")} ${formatTieSize(box.xMm, box.yMm)}`,
      sizeKey: closedSizeKey(section.tieDia, box.xMm, box.yMm),
      xMm: box.xMm,
      yMm: box.yMm,
    });
  }
  if (!circular && doubleAlongY(section) && !section.tieNested.enabled) {
    const box = doubleBoxY(section);
    draft.push({
      kind: "double",
      axis: "y",
      name: "THÉP ĐAI KÉP",
      spec: `${tieSpec(section, "double")} ${formatTieSize(box.xMm, box.yMm)}`,
      sizeKey: closedSizeKey(section.tieDia, box.xMm, box.yMm),
      xMm: box.xMm,
      yMm: box.yMm,
    });
  }
  if (!circular && cTieAlongX(section)) {
    const { b } = stirrupInner(section);
    const len = cTieLengthMm(b);
    draft.push({
      kind: "c",
      axis: "x",
      name: "THÉP ĐAI C",
      spec: `${tieSpec(section, "c")} L=${Math.round(len)}`,
      sizeKey: `C:Ø${section.tieDia}:${Math.round(len)}`,
      xMm: 0,
      yMm: b,
    });
  }
  if (!circular && cTieAlongY(section)) {
    const { a } = stirrupInner(section);
    const len = cTieLengthMm(a);
    draft.push({
      kind: "c",
      axis: "y",
      name: "THÉP ĐAI C",
      spec: `${tieSpec(section, "c")} L=${Math.round(len)}`,
      sizeKey: `C:Ø${section.tieDia}:${Math.round(len)}`,
      xMm: a,
      yMm: 0,
    });
  }

  const keyToMark = new Map<string, number>();
  let n = 1;
  return draft.map((row) => {
    let mark = keyToMark.get(row.sizeKey);
    if (mark == null) {
      mark = n;
      n += 1;
      keyToMark.set(row.sizeKey, mark);
    }
    return { ...row, mark };
  });
}

export function uniqueSectionMarks(section: FloorSection, shape?: Column["shape"]): SectionMark[] {
  const seen = new Set<number>();
  return sectionMarks(section, shape).filter((row) => {
    if (seen.has(row.mark)) return false;
    seen.add(row.mark);
    return true;
  });
}

export function markOf(section: FloorSection, kind: SectionMarkKind, axis?: SectionMarkAxis, shape?: Column["shape"]): number | undefined {
  const rows = sectionMarks(section, shape);
  if (axis) {
    return rows.find((row) => row.kind === kind && row.axis === axis)?.mark ?? rows.find((row) => row.kind === kind)?.mark;
  }
  return rows.find((row) => row.kind === kind)?.mark;
}

export function sectionFor(column: Column, floorId: number): FloorSection {
  const ids = Object.keys(column.sections)
    .map(Number)
    .sort((a, b) => a - b);
  const raw = column.sections[floorId] ?? column.sections[ids.find((id) => id <= floorId) ?? ids[0]];
  return normalizeSection(raw);
}

export function columnFloors(column: Column, floors: Floor[]) {
  return floors.filter((floor) => floor.id >= column.startFloor && floor.id <= column.endFloor);
}

export function lapMm(dia: number, factor: number = 30) {
  return factor * dia;
}

export function spliceFactor(value: unknown, fallback: SpliceFactor = 30): SpliceFactor {
  return value === 30 || value === 35 || value === 40 ? value : fallback;
}

export function normalizeColumn(column: Column): Column {
  let baseSplice = column.baseSplice ?? true;
  let midSplice = Boolean(column.midSplice);
  if (baseSplice && midSplice) midSplice = false;
  return {
    ...column,
    baseSplice,
    baseSpliceD: spliceFactor(column.baseSpliceD, 30),
    midSplice,
    midSpliceD: spliceFactor(column.midSpliceD, 35),
  };
}

export function staggerQty(n: number) {
  const longQty = Math.floor(n / 2);
  return { shortQty: n - longQty, longQty };
}

export function midSplicePosMm(floor: Floor) {
  return Math.max(0, (floor.heightMm - floor.beamHeightMm) / 2);
}

export type LongBarSpec = {
  mark: string;
  qty: number;
  straightMm: number;
  hookMm: number;
  lengthMm: number;
  kind: "long" | "long-hook";
  segs: number[];
  baseExtraMm: number;
  midPosMm: number | null;
};

export function barMarkLabel(index: number) {
  return `1${String.fromCharCode(97 + (index % 26))}`;
}

function makeLongBar(
  mark: string,
  qty: number,
  straightMm: number,
  hookMm: number,
  extraMm = 0,
  splicePos: number | null = null,
): LongBarSpec {
  const shaft = Math.max(0, Math.round(straightMm));
  const hook = Math.max(0, Math.round(hookMm));
  return {
    mark,
    qty,
    straightMm: shaft,
    hookMm: hook,
    lengthMm: shaft + hook,
    kind: hook > 0 ? "long-hook" : "long",
    segs: hook > 0 ? [hook, shaft] : [shaft],
    baseExtraMm: extraMm,
    midPosMm: splicePos,
  };
}

export function longBarSpecs(
  column: Column,
  floor: Floor,
  section: FloorSection,
  isTop: boolean,
  nextSection: FloorSection | null = null,
): LongBarSpec[] {
  const nBars = barCount(section);
  const dia = section.mainDia;
  const { shortQty, longQty } = staggerQty(nBars);
  const hookMm = isTop ? 10 * dia : 0;
  const coverTrim = isTop ? TOP_COVER_MM : 0;
  const nD = column.baseSplice ? lapMm(dia, column.baseSpliceD) : 0;
  const nDNext =
    column.baseSplice && !isTop && nextSection ? lapMm(nextSection.mainDia, column.baseSpliceD) : 0;
  const split = column.baseSplice || column.midSplice;

  const make = (
    mark: string,
    qty: number,
    straightMm: number,
    extraMm: number,
    splicePos: number | null,
  ): LongBarSpec => {
    const shaft = Math.max(0, straightMm);
    return {
      mark,
      qty,
      straightMm: shaft,
      hookMm,
      lengthMm: shaft + hookMm,
      kind: isTop ? "long-hook" : "long",
      segs: isTop ? [hookMm, shaft] : [shaft + hookMm],
      baseExtraMm: extraMm,
      midPosMm: splicePos,
    };
  };

  if (!split) return [make("1", nBars, floor.heightMm - coverTrim, 0, null)].filter((spec) => spec.qty > 0);

  if (column.midSplice) {
    const pos = midSplicePosMm(floor);
    const nDmid = lapMm(dia, column.midSpliceD);
    const makeMid = (
      mark: string,
      qty: number,
      straight: number,
      extra: number,
      splicePos: number,
    ): LongBarSpec => ({
      mark,
      qty,
      straightMm: Math.max(0, straight),
      hookMm: 0,
      lengthMm: Math.max(0, straight),
      kind: "long",
      segs: [Math.max(0, Math.round(straight))],
      baseExtraMm: extra,
      midPosMm: splicePos,
    });
    return [
      makeMid("1", shortQty, pos, 0, pos),
      makeMid("1*", longQty, pos + nDmid, nDmid, pos + nDmid),
    ].filter((spec) => spec.qty > 0);
  }

  /* 1a starts at floor bottom, extends nD into the floor above (exploded left).
     1b starts at nD (top of 1a splice) and extends 2nD into the floor above (exploded right). */
  const runA = floor.heightMm - coverTrim + nDNext;
  const runB = floor.heightMm - coverTrim - nD + 2 * nDNext;
  return [
    make("1", shortQty, runA, nDNext, null),
    make("1*", longQty, runB, nDNext - nD, null),
  ].filter((spec) => spec.qty > 0);
}

/** Thép dọc một cây cột, đánh số 1a, 1b, 1c… từ móng lên móc mái — không chia tầng. */
export function columnLongBarSpecs(column: Column, floors: Floor[]): LongBarSpec[] {
  const col = normalizeColumn(column);
  const active = columnFloors(col, floors);
  if (!active.length) return [];
  const first = normalizeSection(sectionFor(col, active[0].id));
  const nBars = barCount(first);
  const { shortQty, longQty } = staggerQty(nBars);
  const last = active[active.length - 1];
  const lastSection = normalizeSection(sectionFor(col, last.id));
  const hookMm = 10 * lastSection.mainDia;

  if (col.midSplice) {
    const H = active.map((floor) => floor.heightMm);
    const pos = active.map((floor) => midSplicePosMm(floor));
    const nD = active.map((floor) => lapMm(sectionFor(col, floor.id).mainDia, col.midSpliceD));
    const out: LongBarSpec[] = [];
    let k = 0;
    out.push(makeLongBar(barMarkLabel(k++), shortQty, pos[0], 0, 0, pos[0]));
    out.push(makeLongBar(barMarkLabel(k++), longQty, pos[0] + nD[0], 0, nD[0], pos[0] + nD[0]));
    for (let i = 0; i < active.length - 1; i += 1) {
      const len = H[i] - pos[i] + pos[i + 1] + nD[i + 1];
      out.push(makeLongBar(barMarkLabel(k++), nBars, len, 0, nD[i + 1], pos[i + 1] + nD[i + 1]));
    }
    const top = active.length - 1;
    const topCover = TOP_COVER_MM;
    out.push(
      makeLongBar(
        barMarkLabel(k++),
        shortQty,
        H[top] - topCover - pos[top] + nD[top],
        hookMm,
        nD[top],
        pos[top],
      ),
    );
    out.push(
      makeLongBar(barMarkLabel(k++), longQty, H[top] - topCover - pos[top], hookMm, 0, pos[top] + nD[top]),
    );
    return out.filter((spec) => spec.qty > 0 && spec.lengthMm > 0);
  }

  if (!col.baseSplice) {
    const height = active.reduce((sum, floor) => sum + floor.heightMm, 0);
    return [makeLongBar("1", nBars, height - TOP_COVER_MM, hookMm)].filter((spec) => spec.qty > 0);
  }

  let k = 0;
  const out: LongBarSpec[] = [];
  active.forEach((floor, floorIndex) => {
    const section = normalizeSection(sectionFor(col, floor.id));
    const isTop = floorIndex === active.length - 1;
    const nextFloor = !isTop ? active[floorIndex + 1] : undefined;
    const nextSection = nextFloor ? normalizeSection(sectionFor(col, nextFloor.id)) : null;
    longBarSpecs(col, floor, section, isTop, nextSection).forEach((spec) => {
      if (spec.qty <= 0) return;
      out.push({ ...spec, mark: barMarkLabel(k++) });
    });
  });
  return out;
}

function longSpecKey(spec: LongBarSpec) {
  return `${spec.kind}|${spec.lengthMm}|${spec.segs.join("×")}`;
}

/** Thép dọc đã gộp số hiệu (cùng hình, dài, Ø) — khớp bảng thống kê. */
export function uniqueLongBarMarks(column: Column, floors: Floor[]): LongBarSpec[] {
  const specs = columnLongBarSpecs(column, floors).filter((spec) => spec.qty > 0 && spec.lengthMm > 0);
  const grouped = new Map<string, LongBarSpec>();
  const order: string[] = [];
  for (const spec of specs) {
    const key = longSpecKey(spec);
    const prev = grouped.get(key);
    if (!prev) {
      grouped.set(key, { ...spec });
      order.push(key);
    } else {
      prev.qty += spec.qty;
    }
  }
  return order.map((key, i) => ({
    ...grouped.get(key)!,
    mark: order.length === 1 ? "1" : barMarkLabel(i),
  }));
}

function resolvedLongMark(spec: LongBarSpec | undefined, unique: LongBarSpec[], fallback = "1") {
  if (!spec) return unique[0]?.mark ?? fallback;
  const key = longSpecKey(spec);
  return unique.find((row) => longSpecKey(row) === key)?.mark ?? spec.mark;
}

export type ExplodedMarkPair = {
  lower: [string, string];
  upper: [string, string];
};

/** Số hiệu 1a/1b… trên hai cây nổ (trái/phải, đoạn dưới/trên) của một tầng. */
export function explodedMarksForFloor(column: Column, floors: Floor[], floorId: number): ExplodedMarkPair {
  const col = normalizeColumn(column);
  const active = columnFloors(col, floors);
  const unique = uniqueLongBarMarks(col, floors);
  const raw = columnLongBarSpecs(col, floors).filter((spec) => spec.qty > 0 && spec.lengthMm > 0);
  const mark = (spec?: LongBarSpec) => resolvedLongMark(spec, unique);
  const none: ExplodedMarkPair = { lower: ["1", "1"], upper: ["1", "1"] };
  if (!raw.length || !active.length) return none;
  const i = Math.max(0, active.findIndex((floor) => floor.id === floorId));
  const n = active.length;

  if (col.midSplice) {
    const baseA = raw[0];
    const baseB = raw[1] ?? raw[0];
    const hookB = raw[raw.length - 1];
    const hookA = raw[raw.length - 2] ?? hookB;
    const spans = n > 1 ? raw.slice(2, 2 + (n - 1)) : [];
    if (n === 1) {
      return { lower: [mark(baseA), mark(baseB)], upper: [mark(hookA), mark(hookB)] };
    }
    if (i === 0) {
      const span = spans[0];
      return {
        lower: [mark(baseA), mark(baseB)],
        upper: [mark(span ?? hookA), mark(span ?? hookB)],
      };
    }
    if (i === n - 1) {
      const prev = spans[i - 1];
      return {
        lower: [mark(prev ?? baseA), mark(prev ?? baseB)],
        upper: [mark(hookA), mark(hookB)],
      };
    }
    return {
      lower: [mark(spans[i - 1]), mark(spans[i - 1])],
      upper: [mark(spans[i]), mark(spans[i])],
    };
  }

  if (!col.baseSplice) {
    const m = unique[0]?.mark ?? "1";
    return { lower: [m, m], upper: [m, m] };
  }

  const a = raw[i * 2];
  const b = raw[i * 2 + 1] ?? a;
  const left = mark(a);
  const right = mark(b);
  return { lower: [left, right], upper: [left, right] };
}

export function stirrupInner(section: FloorSection) {
  return {
    a: Math.max(section.cx - 2 * COVER_MM, 40),
    b: Math.max(section.cy - 2 * COVER_MM, 40),
  };
}

export function stirrupLengthMm(section: FloorSection, circular = false) {
  if (circular) return circularStirrupLengthMm(section);
  const { a, b } = stirrupInner(section);
  return 2 * (a + b) + 2 * STIRRUP_HOOK_MM;
}

export function canUseTieC(section: FloorSection) {
  return section.barsX % 2 === 1 || section.barsY % 2 === 1;
}

export function cTieAlongX(section: FloorSection) {
  return Boolean(section.tieC.enabled && section.tieC.alongX && section.barsX % 2 === 1);
}

export function cTieAlongY(section: FloorSection) {
  return Boolean(section.tieC.enabled && section.tieC.alongY && section.barsY % 2 === 1);
}

export function canUseTieNested(section: FloorSection) {
  return section.barsX >= 4 || section.barsY >= 4;
}

export function canUseTieDouble(section: FloorSection) {
  return canUseTieNested(section);
}

export function nestedAlongX(section: FloorSection) {
  return Boolean(section.tieNested.enabled && section.tieNested.alongX && section.barsX >= 4);
}

export function nestedAlongY(section: FloorSection) {
  return Boolean(section.tieNested.enabled && section.tieNested.alongY && section.barsY >= 4);
}

export function doubleAlongX(section: FloorSection) {
  return Boolean(section.tieDouble.enabled && section.tieDouble.alongX && section.barsX >= 4);
}

export function doubleAlongY(section: FloorSection) {
  return Boolean(section.tieDouble.enabled && section.tieDouble.alongY && section.barsY >= 4);
}

/** Đai lồng ôm đúng 1/3 số thép mặt đó (làm tròn lên, tối thiểu 2). */
export function nestedMinWrap(bars: number) {
  return Math.max(2, Math.ceil(bars / 3));
}

/** Đai kép ôm ≥ 2/3 số thép mặt đó (làm tròn lên, luôn gồm ≥ 2 thanh góc). */
export function doubleMinWrap(bars: number) {
  return Math.min(bars, Math.max(2, Math.ceil((2 * bars) / 3)));
}

export function nestedWrapCount(bars: number, _requested?: number) {
  return nestedMinWrap(bars);
}

export function wrapRange(bars: number, wrap: number, align: "center" | "start" | "end" = "center") {
  const n = Math.min(bars, Math.max(1, wrap));
  if (align === "start") return { wrap: n, start: 0, end: n - 1 };
  if (align === "end") return { wrap: n, start: Math.max(0, bars - n), end: bars - 1 };
  const start = Math.max(0, Math.floor((bars - n) / 2));
  return { wrap: n, start, end: Math.min(bars - 1, start + n - 1) };
}

export function nestedWrapRange(bars: number) {
  return wrapRange(bars, nestedMinWrap(bars), "center");
}

export function edgeBarCenters(count: number, start: number, span: number) {
  if (count <= 1) return [start + span / 2];
  return Array.from({ length: count }, (_, i) => start + (span * i) / (count - 1));
}

export function nestedTieRect(
  bars: number,
  centers: number[],
  pad: number,
  longStart: number,
  longSize: number,
  wrapAxis: "x" | "y",
  wrapCount = nestedMinWrap(bars),
  align: "center" | "start" | "end" = "center",
) {
  const { start, end } = wrapRange(bars, wrapCount, align);
  const a0 = centers[start] - pad;
  const a1 = centers[end] + pad;
  if (wrapAxis === "x") {
    return { x: a0, y: longStart, w: a1 - a0, h: longSize };
  }
  return { x: longStart, y: a0, w: longSize, h: a1 - a0 };
}

/** Khoảng hở thông thủy giữa 2 thanh kề: (L đai − n×Ø) / (n−1). */
export function barClearGapMm(innerSpan: number, bars: number, dia: number) {
  if (bars <= 1) return innerSpan;
  return (innerSpan - bars * dia) / (bars - 1);
}

export function barPitchMm(innerSpan: number, bars: number, dia: number) {
  if (bars <= 1) return 0;
  return (innerSpan - dia) / (bars - 1);
}

export function wrappedShortMm(innerSpan: number, bars: number, wrapCount: number, mainDia: number) {
  const n = Math.min(bars, Math.max(1, wrapCount));
  if (n <= 1) return Math.max(40, Math.round(mainDia));
  const pitch = barPitchMm(innerSpan, bars, mainDia);
  return Math.max(40, Math.round((n - 1) * pitch + mainDia));
}

export function nestedShortMm(innerSpan: number, bars: number, wrapCount: number, mainDia: number) {
  return wrappedShortMm(innerSpan, bars, nestedWrapCount(bars, wrapCount), mainDia);
}

/** Cạnh ngắn đai kép: ôm ≥ 2/3 số thép, tính từ mặt ngoài 2 thanh góc của nhóm. */
export function doubleShortMm(innerSpan: number, bars: number, mainDia: number) {
  return wrappedShortMm(innerSpan, bars, doubleMinWrap(bars), mainDia);
}

export function faceClearance(section: FloorSection, axis: "x" | "y", kind: "nested" | "double" = "nested") {
  const { a, b } = stirrupInner(section);
  const span = axis === "x" ? a : b;
  const bars = axis === "x" ? section.barsX : section.barsY;
  const gap = barClearGapMm(span, bars, section.mainDia);
  const wrap = kind === "double" ? doubleMinWrap(bars) : nestedMinWrap(bars);
  const nestedMm = kind === "double" ? doubleShortMm(span, bars, section.mainDia) : nestedShortMm(span, bars, wrap, section.mainDia);
  return {
    name: axis === "x" ? "Cx" : "Cy",
    span,
    bars,
    dia: section.mainDia,
    gap,
    wrap,
    nestedMm,
    ok: bars <= 1 || gap + 1e-9 >= MIN_BAR_CLEAR_MM,
  };
}

export function nestedBoxX(section: FloorSection) {
  const { a, b } = stirrupInner(section);
  return {
    xMm: nestedShortMm(a, section.barsX, section.tieNested.wrapBarsX, section.mainDia),
    yMm: b,
  };
}

export function nestedBoxY(section: FloorSection) {
  const { a, b } = stirrupInner(section);
  return {
    xMm: a,
    yMm: nestedShortMm(b, section.barsY, section.tieNested.wrapBarsY, section.mainDia),
  };
}

export function doubleBoxX(section: FloorSection) {
  const { a, b } = stirrupInner(section);
  return {
    xMm: doubleShortMm(a, section.barsX, section.mainDia),
    yMm: b,
  };
}

export function doubleBoxY(section: FloorSection) {
  const { a, b } = stirrupInner(section);
  return {
    xMm: a,
    yMm: doubleShortMm(b, section.barsY, section.mainDia),
  };
}

export function cTieLengthMm(spanMm: number) {
  return Math.max(spanMm, 0) + 2 * STIRRUP_HOOK_MM;
}

export function alignedClosedTie(
  section: FloorSection,
  tie: TieOption,
  kind: "nested" | "double" = "nested",
): { xMm: number; yMm: number; longAxis: "x" | "y" } {
  const { a, b } = stirrupInner(section);
  const longAxis: "x" | "y" = b >= a ? "y" : "x";
  const shortRatio = kind === "double" ? 0.55 : 0.42;
  if (longAxis === "y") {
    const short = Math.max(40, Math.min(a - 10, tie.xMm || Math.round(a * shortRatio)));
    return { xMm: short, yMm: b, longAxis };
  }
  const short = Math.max(40, Math.min(b - 10, tie.yMm || Math.round(b * shortRatio)));
  return { xMm: a, yMm: short, longAxis };
}

function closedTieLengthMm(xMm: number, yMm: number) {
  return 2 * (Math.max(xMm, 40) + Math.max(yMm, 40)) + 2 * STIRRUP_HOOK_MM;
}

function extraTieCount(floor: Floor, spacingMm: number) {
  if (spacingMm <= 0) return 0;
  return Math.max(1, Math.round(floor.heightMm / spacingMm));
}

function extraTieSpecs(section: FloorSection) {
  const { a, b } = stirrupInner(section);
  const specs: Array<{
    key: string;
    label: string;
    tie: TieOption;
    lengthMm: number;
    copies: number;
    derived: boolean;
    spanMm: number;
    xMm: number;
    yMm: number;
  }> = [];
  if (cTieAlongX(section)) {
    specs.push({
      key: "C-X",
      label: "Đai C đứng (móc thép giữa Cx)",
      tie: section.tieC,
      lengthMm: cTieLengthMm(b),
      copies: 1,
      derived: true,
      spanMm: b,
      xMm: 0,
      yMm: b,
    });
  }
  if (cTieAlongY(section)) {
    specs.push({
      key: "C-Y",
      label: "Đai C ngang (móc thép giữa Cy)",
      tie: section.tieC,
      lengthMm: cTieLengthMm(a),
      copies: 1,
      derived: true,
      spanMm: a,
      xMm: a,
      yMm: 0,
    });
  }
  if (!section.tieDouble.enabled) {
    if (nestedAlongX(section)) {
      const box = nestedBoxX(section);
      specs.push({
        key: "Lồng-X",
        label: "Đai lồng phương Cx",
        tie: section.tieNested,
        lengthMm: closedTieLengthMm(box.xMm, box.yMm),
        copies: 1,
        derived: false,
        spanMm: 0,
        xMm: box.xMm,
        yMm: box.yMm,
      });
    }
    if (nestedAlongY(section)) {
      const box = nestedBoxY(section);
      specs.push({
        key: "Lồng-Y",
        label: "Đai lồng phương Cy",
        tie: section.tieNested,
        lengthMm: closedTieLengthMm(box.xMm, box.yMm),
        copies: 1,
        derived: false,
        spanMm: 0,
        xMm: box.xMm,
        yMm: box.yMm,
      });
    }
  }
  if (!section.tieNested.enabled) {
    if (doubleAlongX(section)) {
      const box = doubleBoxX(section);
      specs.push({
        key: "Kép-X",
        label: "Đai kép phương Cx",
        tie: section.tieDouble,
        lengthMm: closedTieLengthMm(box.xMm, box.yMm),
        copies: 2,
        derived: false,
        spanMm: 0,
        xMm: box.xMm,
        yMm: box.yMm,
      });
    }
    if (doubleAlongY(section)) {
      const box = doubleBoxY(section);
      specs.push({
        key: "Kép-Y",
        label: "Đai kép phương Cy",
        tie: section.tieDouble,
        lengthMm: closedTieLengthMm(box.xMm, box.yMm),
        copies: 2,
        derived: false,
        spanMm: 0,
        xMm: box.xMm,
        yMm: box.yMm,
      });
    }
  }
  return specs;
}

export function denseZones(floor: Floor, index: number) {
  const top = floor.beamHeightMm;
  const bot = 610 - 40 * index;
  const clear = floor.heightMm - EMBED_MM;
  const mid = Math.max(clear - top - bot, 0);
  return { top, bot, mid, clear };
}

export function stirrupCount(floor: Floor, index: number) {
  const { top, bot, mid } = denseZones(floor, index);
  return Math.round(top / 100) + Math.round(mid / 200) + Math.round(bot / 100) + 1;
}

function pushTotal(
  map: Map<number, { length: number; weight: number }>,
  dia: number,
  lengthM: number,
  weightKg: number,
) {
  const cur = map.get(dia) ?? { length: 0, weight: 0 };
  map.set(dia, { length: cur.length + lengthM, weight: cur.weight + weightKg });
}

export function buildSchedule(project: Project): {
  rows: ScheduleRow[];
  byDia: Map<number, { length: number; weight: number }>;
  stirrupCounts: Map<string, number>;
} {
  const rows: ScheduleRow[] = [];
  const byDia = new Map<number, { length: number; weight: number }>();
  const stirrupCounts = new Map<string, number>();

  for (const column of project.columns.map(normalizeColumn)) {
    const active = columnFloors(column, project.floors);
    const member = column.name;
    const firstSection = active.length ? normalizeSection(sectionFor(column, active[0].id)) : null;
    uniqueLongBarMarks(column, project.floors).forEach((spec) => {
      if (!firstSection || spec.qty <= 0) return;
      const dia = spec.kind === "long-hook"
        ? normalizeSection(sectionFor(column, active[active.length - 1].id)).mainDia
        : firstSection.mainDia;
      const totalBars = spec.qty * column.quantity;
      const totalLengthM = (spec.lengthMm / 1000) * totalBars;
      const weightKg = totalLengthM * kgPerMeter(dia);
      pushTotal(byDia, dia, totalLengthM, weightKg);
      rows.push({
        member,
        floorName: "",
        quantity: column.quantity,
        stt: spec.mark,
        dia,
        kind: spec.kind,
        shapeLabel: spec.mark,
        segs: spec.segs,
        lengthMm: spec.lengthMm,
        perMember: spec.qty,
        totalBars,
        totalLengthM,
        weightKg,
      });
    });

    active.forEach((floor, floorIndex) => {
      const section = normalizeSection(sectionFor(column, floor.id));

      const circular = column.shape === "TRON";
      const { a, b } = stirrupInner(section);
      if (hasMainStirrup(section, column.shape)) {
        const d = circularStirrupDiaMm(section);
        const tieLen = stirrupLengthMm(section, circular);
        const nTie = stirrupCount(floor, floorIndex);
        const totalBars = nTie * column.quantity;
        const totalLengthM = (tieLen / 1000) * totalBars;
        const weightKg = totalLengthM * kgPerMeter(section.tieDia);
        pushTotal(byDia, section.tieDia, totalLengthM, weightKg);
        const key = circular
          ? `Ø${section.tieDia} D${Math.round(d)}`
          : `Ø${section.tieDia} ${Math.max(a, b)} x ${Math.min(a, b)}`;
        stirrupCounts.set(key, (stirrupCounts.get(key) ?? 0) + totalBars);
        const mainMark = markOf(section, "main", undefined, column.shape) ?? 2;
        rows.push({
          member,
          floorName: floor.name,
          quantity: column.quantity,
          stt: String(mainMark),
          dia: section.tieDia,
          kind: "stirrup",
          shapeLabel: String(mainMark),
          segs: circular ? [CIRCULAR_STIRRUP_HOOK_MM, d, section.mainDia] : [STIRRUP_HOOK_MM, a, b],
          circular,
          lengthMm: tieLen,
          perMember: nTie,
          totalBars,
          totalLengthM,
          weightKg,
        });
      }

      if (circular) return;

      extraTieSpecs(section).forEach((spec, specIndex) => {
        if (!spec.tie.enabled) return;
        const spacingMm =
          spec.derived || spec.key.startsWith("Lồng") || spec.key.startsWith("Kép")
            ? spec.tie.spacingMm || 200
            : spec.tie.spacingMm;
        if (spacingMm <= 0) return;
        const nExtra = extraTieCount(floor, spacingMm) * spec.copies;
        const extraTotal = nExtra * column.quantity;
        const extraLengthM = (spec.lengthMm / 1000) * extraTotal;
        const extraWeight = extraLengthM * kgPerMeter(section.tieDia);
        pushTotal(byDia, section.tieDia, extraLengthM, extraWeight);
        const extraKey = spec.derived
          ? `${spec.label} Ø${section.tieDia} L=${spec.lengthMm}`
          : `${spec.label} Ø${section.tieDia} ${spec.xMm} x ${spec.yMm}`;
        stirrupCounts.set(extraKey, (stirrupCounts.get(extraKey) ?? 0) + extraTotal);
        const extraKind: SectionMarkKind = spec.key.startsWith("Lồng")
          ? "nested"
          : spec.key.startsWith("Kép")
            ? "double"
            : "c";
        const extraAxis = spec.key.endsWith("-X") ? "x" : spec.key.endsWith("-Y") ? "y" : undefined;
        const extraMark = markOf(section, extraKind, extraAxis) ?? 3 + specIndex;
        rows.push({
          member,
          floorName: floor.name,
          quantity: column.quantity,
          stt: String(extraMark),
          dia: section.tieDia,
          kind: "stirrup",
          shapeLabel: String(extraMark),
          segs: spec.derived ? [STIRRUP_HOOK_MM, spec.spanMm, STIRRUP_HOOK_MM] : [STIRRUP_HOOK_MM, spec.xMm, spec.yMm],
          lengthMm: spec.lengthMm,
          perMember: nExtra,
          totalBars: extraTotal,
          totalLengthM: extraLengthM,
          weightKg: extraWeight,
        });
      });
    });
  }

  return { rows: mergeIdenticalStirrups(rows), byDia, stirrupCounts };
}

function mergeIdenticalStirrups(rows: ScheduleRow[]): ScheduleRow[] {
  const longs: ScheduleRow[] = [];
  const stirrupMap = new Map<string, ScheduleRow>();
  for (const row of rows) {
    if (row.kind !== "stirrup") {
      longs.push(row);
      continue;
    }
    const key = [row.member, row.stt, row.dia, row.lengthMm, row.circular ? "circ" : "rect", row.segs.join("×")].join("|");
    const prev = stirrupMap.get(key);
    if (!prev) {
      stirrupMap.set(key, { ...row, floorName: "" });
      continue;
    }
    prev.perMember += row.perMember;
    prev.totalBars += row.totalBars;
    prev.totalLengthM += row.totalLengthM;
    prev.weightKg += row.weightKg;
  }
  return [...longs, ...stirrupMap.values()];
}

export function stockBars(lengthM: number) {
  return Math.ceil(lengthM / STOCK_M - 1e-9);
}

export function summaryBuckets(byDia: Map<number, { length: number; weight: number }>) {
  let le10 = 0;
  let le18 = 0;
  let gt18 = 0;
  byDia.forEach((v, dia) => {
    if (dia <= 10) le10 += v.weight;
    else if (dia <= 18) le18 += v.weight;
    else gt18 += v.weight;
  });
  return { le10, le18, gt18 };
}
