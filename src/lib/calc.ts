import { COVER_MM, EMBED_MM, STOCK_M, STIRRUP_HOOK_MM, normalizeTie, type Column, type Floor, type FloorSection, type Project, type ScheduleRow, type SpliceFactor, type TieOption } from "./types";

export function barCount(section: FloorSection) {
  const edge = section.barsX * 2 + section.barsY * 2 - 4;
  const extra = section.extraSteel ? section.extraTieX * 2 + section.extraTieY * 2 : 0;
  return Math.max(edge + extra, 0);
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
  return {
    ...section,
    tieC: normalizeTie(section.tieC),
    tieNested: tieDouble.enabled ? { ...tieNested, enabled: false } : tieNested,
    tieDouble,
  };
}

export function hasMainStirrup(section: FloorSection) {
  return !section.tieDouble.enabled;
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
  return {
    ...column,
    baseSplice: column.baseSplice ?? true,
    baseSpliceD: spliceFactor(column.baseSpliceD, 30),
    midSplice: column.midSplice ?? false,
    midSpliceD: spliceFactor(column.midSpliceD, 35),
  };
}

function spliceExtraMm(column: Column, dia: number) {
  const base = column.baseSplice ? lapMm(dia, column.baseSpliceD) : 0;
  const mid = column.midSplice ? lapMm(dia, column.midSpliceD) : 0;
  return base + mid;
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
  const nested = alignedClosedTie(section, section.tieNested, "nested");
  const branch = alignedClosedTie(section, section.tieDouble, "double");
  if (!section.tieDouble.enabled) {
    specs.push({
      key: "Lồng",
      label: "Đai lồng",
      tie: section.tieNested,
      lengthMm: closedTieLengthMm(nested.xMm, nested.yMm),
      copies: 1,
      derived: false,
      spanMm: 0,
      xMm: nested.xMm,
      yMm: nested.yMm,
    });
  }
  if (!section.tieNested.enabled) {
    specs.push({
      key: "Nhánh",
      label: "Đai nhánh",
      tie: section.tieDouble,
      lengthMm: closedTieLengthMm(branch.xMm, branch.yMm),
      copies: 2,
      derived: false,
      spanMm: 0,
      xMm: branch.xMm,
      yMm: branch.yMm,
    });
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
      const nBars = barCount(section);
      const isTop = floor.id === lastFloorId;
      const member = `${column.name} (TẦNG ${floor.name})`;
      const baseLap = column.baseSplice ? lapMm(section.mainDia, column.baseSpliceD) : 0;
      const midLap = column.midSplice ? lapMm(section.mainDia, column.midSpliceD) : 0;

      if (isTop) {
        const hook = 10 * section.mainDia;
        const longStraight = floor.heightMm - COVER_MM + midLap;
        const shortStraight = longStraight - (baseLap || 0);
        const half = column.baseSplice ? Math.floor(nBars / 2) : 0;
        const other = nBars - half;
        const specs = column.baseSplice
          ? [
              { stt: 1, straight: longStraight, qty: other, mark: "1" },
              { stt: 1, straight: shortStraight, qty: half, mark: "1*" },
            ]
          : [{ stt: 1, straight: longStraight, qty: nBars, mark: "1" }];
        specs
          .filter((spec) => spec.qty > 0)
          .forEach((spec) => {
          const lengthMm = spec.straight + hook;
          const totalBars = spec.qty * column.quantity;
          const totalLengthM = (lengthMm / 1000) * totalBars;
          const weightKg = totalLengthM * kgPerMeter(section.mainDia);
          pushTotal(byDia, section.mainDia, totalLengthM, weightKg);
          rows.push({
            member,
            floorName: floor.name,
            quantity: column.quantity,
            stt: spec.stt,
            dia: section.mainDia,
            kind: "long-hook",
            shapeLabel: spec.mark,
            segs: [hook, spec.straight],
            lengthMm,
            perMember: spec.qty,
            totalBars,
            totalLengthM,
            weightKg,
          });
        });
      } else {
        const lengthMm = floor.heightMm + spliceExtraMm(column, section.mainDia);
        const totalBars = nBars * column.quantity;
        const totalLengthM = (lengthMm / 1000) * totalBars;
        const weightKg = totalLengthM * kgPerMeter(section.mainDia);
        pushTotal(byDia, section.mainDia, totalLengthM, weightKg);
        rows.push({
          member,
          floorName: floor.name,
          quantity: column.quantity,
          stt: 1,
          dia: section.mainDia,
          kind: "long",
          shapeLabel: "1",
          segs: [lengthMm],
          lengthMm,
          perMember: nBars,
          totalBars,
          totalLengthM,
          weightKg,
        });
      }

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
          stt: 2,
          dia: section.tieDia,
          kind: "stirrup",
          shapeLabel: "2",
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
        const spacingMm = spec.derived ? spec.tie.spacingMm || 200 : spec.tie.spacingMm;
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
        rows.push({
          member,
          floorName: floor.name,
          quantity: column.quantity,
          stt: 3 + specIndex,
          dia: section.tieDia,
          kind: "stirrup",
          shapeLabel: spec.key,
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
