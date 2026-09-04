import type { Column, Floor, FloorSection, Project } from "./types";

function section(partial: Partial<FloorSection> & Pick<FloorSection, "cx" | "cy" | "barsX" | "barsY" | "mainDia">): FloorSection {
  return {
    tieDia: 6,
    extraSteel: false,
    extraDia: 16,
    extraTieDia: 8,
    extraTieX: 0,
    extraTieY: 0,
    ...partial,
  };
}

function floorsFor(column: Omit<Column, "sections">, make: (floorId: number) => FloorSection): Column {
  const sections: Record<number, FloorSection> = {};
  for (let id = column.startFloor; id <= column.endFloor; id += 1) {
    sections[id] = make(id);
  }
  return { ...column, sections };
}

function col(
  partial: Omit<Column, "sections" | "baseSplice" | "baseSpliceD" | "midSplice" | "midSpliceD"> &
    Partial<Pick<Column, "baseSplice" | "baseSpliceD" | "midSplice" | "midSpliceD">>,
): Omit<Column, "sections"> {
  return {
    baseSplice: true,
    baseSpliceD: 30,
    midSplice: false,
    midSpliceD: 35,
    ...partial,
  };
}

export function createSampleProject(): Project {
  const floors: Floor[] = [
    { id: 1, name: "1", heightMm: 4150, beamHeightMm: 500 },
    { id: 2, name: "2", heightMm: 3900, beamHeightMm: 500 },
    { id: 3, name: "3", heightMm: 3600, beamHeightMm: 450 },
  ];

  const columns: Column[] = [
    floorsFor(
      col({ id: "BT1", name: "BT1", quantity: 2, startFloor: 1, endFloor: 3, shape: "HCN" }),
      () => section({ cx: 300, cy: 300, barsX: 2, barsY: 2, mainDia: 10 }),
    ),
    floorsFor(
      col({ id: "C3", name: "C3", quantity: 2, startFloor: 1, endFloor: 3, shape: "HCN" }),
      (id) =>
        section({
          cx: 200,
          cy: 300,
          barsX: 3,
          barsY: id === 1 ? 3 : 2,
          mainDia: 16,
        }),
    ),
    floorsFor(
      col({ id: "C4", name: "C4", quantity: 4, startFloor: 1, endFloor: 3, shape: "HCN" }),
      (id) =>
        section({
          cx: 200,
          cy: 300,
          barsX: id === 3 ? 2 : 3,
          barsY: 2,
          mainDia: 16,
        }),
    ),
    floorsFor(
      col({ id: "C2", name: "C2", quantity: 8, startFloor: 1, endFloor: 3, shape: "HCN" }),
      (id) =>
        section({
          cx: 200,
          cy: 300,
          barsX: 3,
          barsY: id === 3 ? 2 : 3,
          mainDia: 16,
        }),
    ),
    floorsFor(
      col({ id: "C1", name: "C1", quantity: 4, startFloor: 1, endFloor: 3, shape: "HCN" }),
      (id) =>
        section({
          cx: 200,
          cy: 300,
          barsX: 3,
          barsY: id === 3 ? 2 : 3,
          mainDia: id === 1 ? 18 : 16,
        }),
    ),
  ];

  return { floors, columns };
}

export function emptySection(cx = 300, cy = 300): FloorSection {
  return section({ cx, cy, barsX: 3, barsY: 3, mainDia: 16 });
}
