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
  wrapBarsX: number;
  wrapBarsY: number;
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

export const BAR_COUNT_MIN = 2;
export const BAR_COUNT_MAX = 100;
export const MAIN_DIA_MIN = 10;
export const MAIN_DIA_MAX = 55;
export const TIE_DIA_MIN = 4;
export const TIE_DIA_MAX = 25;

function inclusiveRange(min: number, max: number) {
  return Array.from({ length: max - min + 1 }, (_, i) => min + i);
}

export const MAIN_DIAMETERS = inclusiveRange(MAIN_DIA_MIN, MAIN_DIA_MAX);
export const TIE_DIAMETERS = inclusiveRange(TIE_DIA_MIN, TIE_DIA_MAX);
export const DIAMETERS = Array.from(new Set([...TIE_DIAMETERS, ...MAIN_DIAMETERS])).sort((a, b) => a - b);
export function clampInt(value: number, min: number, max: number, fallback: number) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function clampBarCount(value: number) {
  return clampInt(value, BAR_COUNT_MIN, BAR_COUNT_MAX, BAR_COUNT_MIN);
}

export function clampMainDia(value: number) {
  return clampInt(value, MAIN_DIA_MIN, MAIN_DIA_MAX, 16);
}

export function clampTieDia(value: number) {
  return clampInt(value, TIE_DIA_MIN, TIE_DIA_MAX, 6);
}

export const SPLICE_FACTORS: SpliceFactor[] = [30, 35, 40];
export const COVER_MM = 25;
export const STIRRUP_HOOK_MM = 50;
export const STOCK_M = 11.7;
export const EMBED_MM = 600;

export function emptyTie(): TieOption {
  return { enabled: false, xMm: 0, yMm: 0, spacingMm: 0, alongX: true, alongY: true, wrapBarsX: 0, wrapBarsY: 0 };
}

export function normalizeTie(value?: Partial<TieOption> | null): TieOption {
  return {
    enabled: Boolean(value?.enabled),
    xMm: Number(value?.xMm) || 0,
    yMm: Number(value?.yMm) || 0,
    spacingMm: Number(value?.spacingMm) || 0,
    alongX: value?.alongX !== false,
    alongY: value?.alongY !== false,
    wrapBarsX: Number(value?.wrapBarsX) || 0,
    wrapBarsY: Number(value?.wrapBarsY) || 0,
  };
}
