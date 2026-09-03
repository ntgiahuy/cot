import { COVER_MM, EMBED_MM, STOCK_M, STIRRUP_HOOK_MM, type Column, type Floor, type FloorSection, type Project, type ScheduleRow } from "./types";

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

export function sectionFor(column: Column, floorId: number): FloorSection {
  const ids = Object.keys(column.sections)
    .map(Number)
    .sort((a, b) => a - b);
  if (column.sections[floorId]) return column.sections[floorId];
  const fallback = ids.find((id) => id <= floorId) ?? ids[0];
  return column.sections[fallback];
}

export function columnFloors(column: Column, floors: Floor[]) {
  return floors.filter((floor) => floor.id >= column.startFloor && floor.id <= column.endFloor);
}

export function lapMm(dia: number) {
  return 30 * Math.min(dia, 16);
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

  for (const column of project.columns) {
    const active = columnFloors(column, project.floors);
    active.forEach((floor, floorIndex) => {
      const section = sectionFor(column, floor.id);
      const nBars = barCount(section);
      const isTop = floor.id === lastFloorId;
      const member = `${column.name} (TẦNG ${floor.name})`;

      if (isTop) {
        const hook = 10 * section.mainDia;
        const longStraight = floor.heightMm - COVER_MM;
        const shortStraight = longStraight - lapMm(section.mainDia);
        const half = Math.floor(nBars / 2);
        const other = nBars - half;
        const specs = [
          { stt: 1, straight: longStraight, qty: other, mark: "1" },
          { stt: 1, straight: shortStraight, qty: half, mark: "1*" },
        ];
        specs.forEach((spec) => {
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
        const lengthMm = floor.heightMm + lapMm(section.mainDia);
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

      const tieLen = stirrupLengthMm(section);
      const nTie = stirrupCount(floor, floorIndex);
      const totalBars = nTie * column.quantity;
      const totalLengthM = (tieLen / 1000) * totalBars;
      const weightKg = totalLengthM * kgPerMeter(section.tieDia);
      pushTotal(byDia, section.tieDia, totalLengthM, weightKg);
      const { a, b } = stirrupInner(section);
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
