import { COVER_MM, EMBED_MM, MIN_BAR_CLEAR_MM, STOCK_M, STIRRUP_HOOK_MM, clampMainDia, clampTieDia, normalizeTie, type Column, type Floor, type FloorSection, type Project, type ScheduleRow, type SpliceFactor, type TieOption } from "./types";

export function barCount(section: FloorSection) {
  const edge = section.barsX * 2 + section.barsY * 2 - 4;
  return Math.max(edge, 0);
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

export function steelRatioPercent(section: FloorSection) {
  const steel = barCount(section) * barAreaCm2(section.mainDia);
  const concrete = (section.cx * section.cy) / 100;
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

export function hasMainStirrup(section: FloorSection) {
  return !section.tieDouble.enabled;
}

export type SectionMarkKind = "long" | "main" | "nested" | "double" | "c";

export type SectionMark = {
  mark: number;
  kind: SectionMarkKind;
  name: string;
  spec: string;
};

export function tieSpec(section: FloorSection, kind: Exclude<SectionMarkKind, "long">): string {
  const spacing = (mm: number) => `Ø${section.tieDia}a${mm || 200}`;
  if (kind === "main") return `Ø${section.tieDia}a200(100)`;
  if (kind === "nested") return spacing(section.tieNested.spacingMm);
  if (kind === "double") return spacing(section.tieDouble.spacingMm);
  return spacing(section.tieC.spacingMm);
}

/** Số hiệu mặt cắt / thống kê: 1 thép dọc, 2 đai chính, 3 đai lồng|kép, 4 đai C. */
export function sectionMarks(section: FloorSection): SectionMark[] {
  const rows: SectionMark[] = [{ mark: 1, kind: "long", name: "THÉP DỌC", spec: formatBarLabel(section) }];
  let n = 2;
  if (hasMainStirrup(section)) {
    rows.push({ mark: n, kind: "main", name: "THÉP ĐAI CHÍNH", spec: tieSpec(section, "main") });
    n += 1;
  }
  if ((nestedAlongX(section) || nestedAlongY(section)) && !section.tieDouble.enabled) {
    rows.push({ mark: n, kind: "nested", name: "THÉP ĐAI LỒNG", spec: tieSpec(section, "nested") });
    n += 1;
  }
  if ((doubleAlongX(section) || doubleAlongY(section)) && !section.tieNested.enabled) {
    rows.push({ mark: n, kind: "double", name: "THÉP ĐAI KÉP", spec: tieSpec(section, "double") });
    n += 1;
  }
  if (cTieAlongX(section) || cTieAlongY(section)) {
    rows.push({ mark: n, kind: "c", name: "THÉP ĐAI C", spec: tieSpec(section, "c") });
  }
  return rows;
}

export function markOf(section: FloorSection, kind: SectionMarkKind): number | undefined {
  return sectionMarks(section).find((row) => row.kind === kind)?.mark;
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

export function longBarSpecs(
  column: Column,
  floor: Floor,
  section: FloorSection,
  isTop: boolean,
): LongBarSpec[] {
  const nBars = barCount(section);
  const dia = section.mainDia;
  const { shortQty, longQty } = staggerQty(nBars);
  const hookMm = isTop ? 10 * dia : 0;
  const coverTrim = isTop ? COVER_MM : 0;
  const baseOne = column.baseSplice ? lapMm(dia, column.baseSpliceD) : 0;
  const midPos = column.midSplice ? midSplicePosMm(floor) : null;
  const midOffset = column.midSplice ? lapMm(dia, column.midSpliceD) : 0;
  const split = column.baseSplice || column.midSplice;

  const make = (
    mark: string,
    qty: number,
    baseExtra: number,
    midExtra: number,
    splicePos: number | null,
  ): LongBarSpec => {
    const straightMm = Math.max(0, floor.heightMm - coverTrim + baseExtra + midExtra);
    return {
      mark,
      qty,
      straightMm,
      hookMm,
      lengthMm: straightMm + hookMm,
      kind: isTop ? "long-hook" : "long",
      segs: isTop ? [hookMm, straightMm] : [straightMm + hookMm],
      baseExtraMm: baseExtra,
      midPosMm: splicePos,
    };
  };

  if (!split) return [make("1", nBars, 0, 0, null)].filter((spec) => spec.qty > 0);
  return [
    make("1", shortQty, baseOne, 0, midPos),
    make("1*", longQty, baseOne * 2, midOffset, midPos == null ? null : midPos + midOffset),
  ].filter((spec) => spec.qty > 0);
}

export function stirrupInner(section: FloorSection) {
  return {
    a: Math.max(section.cx - 2 * COVER_MM, 40),
    b: Math.max(section.cy - 2 * COVER_MM, 40),
  };
}

export function stirrupLengthMm(section: FloorSection) {
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
  const lastFloorId = project.floors[project.floors.length - 1]?.id;

  for (const column of project.columns.map(normalizeColumn)) {
    const active = columnFloors(column, project.floors);
    active.forEach((floor, floorIndex) => {
      const section = normalizeSection(sectionFor(column, floor.id));
      const isTop = floor.id === lastFloorId;
      const member = `${column.name} (TẦNG ${floor.name})`;

      longBarSpecs(column, floor, section, isTop)
        .filter((spec) => spec.qty > 0)
        .forEach((spec) => {
          const totalBars = spec.qty * column.quantity;
          const totalLengthM = (spec.lengthMm / 1000) * totalBars;
          const weightKg = totalLengthM * kgPerMeter(section.mainDia);
          pushTotal(byDia, section.mainDia, totalLengthM, weightKg);
          rows.push({
            member,
            floorName: floor.name,
            quantity: column.quantity,
            stt: 1,
            dia: section.mainDia,
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

      const { a, b } = stirrupInner(section);
      if (hasMainStirrup(section)) {
        const tieLen = stirrupLengthMm(section);
        const nTie = stirrupCount(floor, floorIndex);
        const totalBars = nTie * column.quantity;
        const totalLengthM = (tieLen / 1000) * totalBars;
        const weightKg = totalLengthM * kgPerMeter(section.tieDia);
        pushTotal(byDia, section.tieDia, totalLengthM, weightKg);
        const key = `Ø${section.tieDia} ${Math.max(a, b)} x ${Math.min(a, b)}`;
        stirrupCounts.set(key, (stirrupCounts.get(key) ?? 0) + totalBars);
        rows.push({
          member,
          floorName: floor.name,
          quantity: column.quantity,
          stt: markOf(section, "main") ?? 2,
          dia: section.tieDia,
          kind: "stirrup",
          shapeLabel: String(markOf(section, "main") ?? 2),
          segs: [STIRRUP_HOOK_MM, a, b],
          lengthMm: tieLen,
          perMember: nTie,
          totalBars,
          totalLengthM,
          weightKg,
        });
      }

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
        const extraMark = markOf(section, extraKind) ?? 3 + specIndex;
        rows.push({
          member,
          floorName: floor.name,
          quantity: column.quantity,
          stt: extraMark,
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

  return { rows, byDia, stirrupCounts };
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
