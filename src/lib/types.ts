export type ColumnShape = "HCN" | "TRON";

export type Floor = {
  id: number;
  name: string;
  heightMm: number;
  beamHeightMm: number;
};

export type TieOption = {
  enabled: boolean;
  xMm: number;
  yMm: number;
  spacingMm: number;
  alongX: boolean;
  alongY: boolean;
};

export type FloorSection = {
  cx: number;
  cy: number;
  barsX: number;
  barsY: number;
  mainDia: number;
  tieDia: number;
  extraSteel: boolean;
  extraDia: number;
  extraTieDia: number;
  extraTieX: number;
  extraTieY: number;
  tieC: TieOption;
  tieNested: TieOption;
  tieDouble: TieOption;
};

export type SpliceFactor = 30 | 35 | 40;

export type Column = {
  id: string;
  name: string;
  quantity: number;
  startFloor: number;
  endFloor: number;
  shape: ColumnShape;
  sections: Record<number, FloorSection>;
  baseSplice: boolean;
  baseSpliceD: SpliceFactor;
  midSplice: boolean;
  midSpliceD: SpliceFactor;
};

export type Project = {
  floors: Floor[];
  columns: Column[];
};

export type ScheduleRow = {
  member: string;
  floorName: string;
  quantity: number;
  stt: number;
  dia: number;
  kind: "long" | "long-hook" | "stirrup";
  shapeLabel: string;
  segs: number[];
  lengthMm: number;
  perMember: number;
  totalBars: number;
  totalLengthM: number;
  weightKg: number;
};

export const DIAMETERS = [6, 8, 10, 12, 14, 16, 18, 20, 22, 25] as const;
export const SPLICE_FACTORS: SpliceFactor[] = [30, 35, 40];
export const COVER_MM = 25;
export const STIRRUP_HOOK_MM = 50;
export const STOCK_M = 11.7;
export const EMBED_MM = 600;

export function emptyTie(): TieOption {
  return { enabled: false, xMm: 0, yMm: 0, spacingMm: 0, alongX: true, alongY: true };
}

export function normalizeTie(value?: Partial<TieOption> | null): TieOption {
  return {
    enabled: Boolean(value?.enabled),
    xMm: Number(value?.xMm) || 0,
    yMm: Number(value?.yMm) || 0,
    spacingMm: Number(value?.spacingMm) || 0,
    alongX: value?.alongX !== false,
    alongY: value?.alongY !== false,
  };
}
