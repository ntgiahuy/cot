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
export const BAR_DIAMETERS = [6, 8, 10, 12, 14, 16, 18, 20, 22, 25, 28, 32, 36, 40, 45, 50, 55] as const;
export const MAIN_DIA_MIN = BAR_DIAMETERS[0];
export const MAIN_DIA_MAX = BAR_DIAMETERS[BAR_DIAMETERS.length - 1];
export const TIE_DIA_MIN = MAIN_DIA_MIN;
export const TIE_DIA_MAX = MAIN_DIA_MAX;
export const MAIN_DIAMETERS = [...BAR_DIAMETERS];
export const TIE_DIAMETERS = [...BAR_DIAMETERS];
export const DIAMETERS = [...BAR_DIAMETERS];

export function clampInt(value: number, min: number, max: number, fallback: number) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function clampBarCount(value: number) {
  return clampInt(value, BAR_COUNT_MIN, BAR_COUNT_MAX, BAR_COUNT_MIN);
}

export function clampDia(value: number, fallback = 16) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return BAR_DIAMETERS.reduce((best, dia) => (Math.abs(dia - n) < Math.abs(best - n) ? dia : best));
}

export function clampMainDia(value: number) {
  return clampDia(value, 16);
}

export function clampTieDia(value: number) {
  return clampDia(value, 6);
}

export const SPLICE_FACTORS: SpliceFactor[] = [30, 35, 40];
export const COVER_MM = 25;
export const STIRRUP_HOOK_MM = 50;
export const STOCK_M = 11.7;
export const EMBED_MM = 600;
export const MIN_BAR_CLEAR_MM = 25;

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
