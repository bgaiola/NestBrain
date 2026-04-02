// ─── Grain / Veio Direction ────────────────────────────────

export type GrainDirection = 'none' | 'horizontal' | 'vertical';
// none = sem veio (pode rotacionar livremente)
// horizontal = veio corre na largura
// vertical = veio corre na altura

// ─── Core Domain Types ─────────────────────────────────────

export interface Piece {
  id: string;
  code: string; // P-0001 format
  material: string; // references Material.code
  quantity: number;
  width: number; // mm
  height: number; // mm
  grainDirection: GrainDirection; // veio da peça
  edgeBandTop: string; // references EdgeBand.code or ''
  edgeBandBottom: string;
  edgeBandLeft: string;
  edgeBandRight: string;
  sequence: number | null;
  description: string;
  description2: string;
}

export interface Material {
  id: string;
  code: string;
  description: string;
  thickness: number; // mm
  sheetWidth: number; // mm
  sheetHeight: number; // mm
  grainDirection: GrainDirection; // veio do material da chapa
  trimTop: number; // mm
  trimBottom: number;
  trimLeft: number;
  trimRight: number;
  minScrapWidth: number; // mm — min dimensions for usable scrap
  minScrapHeight: number;
  // ─── Cost fields ───
  pricePerM2: number; // price per m² of material
  wasteCostPerM2: number; // cost per m² for waste disposal
  cutCostPerLinearM: number; // cost per linear meter of cut
}

export type Currency = 'USD' | 'EUR' | 'BRL' | 'GBP';

export const CURRENCY_SYMBOLS: Record<Currency, string> = {
  USD: '$',
  EUR: '€',
  BRL: 'R$',
  GBP: '£',
};

export interface EdgeBand {
  id: string;
  code: string;
  description: string;
  supplementaryIncrease: number; // mm added per side
}

// ─── Optimization Config ───────────────────────────────────

export type OptimizationMode = 'freeform' | 'guillotine';

export interface OptimizationConfig {
  bladeThickness: number; // kerf in mm
  mode: OptimizationMode;
  guillotineMaxLevels: number;
  maxStackThickness: number; // mm
  allowRotation: boolean;
  advancedMode: boolean; // thorough optimization — slower but better results
}

// ─── Optimization Results ──────────────────────────────────

export interface PlacedPiece {
  pieceId: string;
  code: string;
  x: number;
  y: number;
  width: number; // actual cutting width (with edge band supplement)
  height: number;
  rotated: boolean;
  originalWidth: number;
  originalHeight: number;
  grainDirection: GrainDirection;
  description: string;
  description2: string;
  material: string;
  sequence: number | null;
  edgeBandTop: string;
  edgeBandBottom: string;
  edgeBandLeft: string;
  edgeBandRight: string;
  quantity: number;
}

export interface ScrapRect {
  x: number;
  y: number;
  width: number;
  height: number;
  usable: boolean; // meets minimum dimensions
}

export interface CutInstruction {
  type: 'H' | 'V'; // horizontal or vertical
  position: number; // mm from top-left
  depth: number; // guillotine level
  resultingPieces: string[]; // piece codes
}

export interface CuttingPlan {
  planId: string;
  materialCode: string;
  sheetWidth: number;
  sheetHeight: number;
  stackCount: number; // how many sheets stacked
  pieces: PlacedPiece[];
  scraps: ScrapRect[];
  cuts: CutInstruction[];
  usableArea: number;
  usedArea: number;
  wasteArea: number;
  utilizationPercent: number;
  totalCuts: number;
  // ─── Cost per plan (populated when costEnabled) ───
  materialCost?: number;
  wasteCost?: number;
  cuttingCost?: number;
  totalPlanCost?: number;
}

export interface OptimizationResult {
  plans: CuttingPlan[];
  totalSheets: number;
  totalStackedSheets: number;
  totalPieces: number;
  globalUtilization: number;
  totalUsableScrap: number;
  totalWaste: number;
  totalUsableScrapArea: number;
  totalWasteArea: number;
  computeTimeMs: number;
  timestamp: string;
  // ─── Aggregated costs (populated when costEnabled) ───
  totalMaterialCost?: number;
  totalWasteCost?: number;
  totalCuttingCost?: number;
  grandTotalCost?: number;
}

// ─── Label Types ───────────────────────────────────────────

export type LabelFieldType =
  | 'text'
  | 'dynamic'
  | 'barcode'
  | 'qrcode'
  | 'line'
  | 'logo';

export type DynamicField =
  | 'pieceId'
  | 'description'
  | 'description2'
  | 'material'
  | 'width'
  | 'height'
  | 'thickness'
  | 'edgeBandTop'
  | 'edgeBandBottom'
  | 'edgeBandLeft'
  | 'edgeBandRight'
  | 'planNumber'
  | 'sheetNumber'
  | 'quantity'
  | 'sequence'
  | 'productionDate'
  | 'projectName';

export interface LabelElement {
  id: string;
  type: LabelFieldType;
  x: number;
  y: number;
  width: number;
  height: number;
  content: string; // static text or DynamicField key
  fontSize: number;
  fontWeight: 'normal' | 'bold';
  textAlign: 'left' | 'center' | 'right';
  rotation: number;
}

export interface LabelTemplate {
  id: string;
  name: string;
  width: number; // mm
  height: number; // mm
  elements: LabelElement[];
}

// ─── UI Types ──────────────────────────────────────────────

export type Locale = 'es' | 'pt-BR' | 'en' | 'fr' | 'it';

export type TabId = 'pieces' | 'materials' | 'edgeBands' | 'results' | 'labels' | 'reports' | 'costs';

export interface AppNotification {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  title: string;
  message?: string;
  duration?: number; // ms, 0 = persistent
}
