import {
  Piece, Material, EdgeBand, OptimizationConfig,
  OptimizationResult, CuttingPlan, PlacedPiece, ScrapRect, CutInstruction,
  GrainDirection,
} from '@/types';
import { generateId } from '@/utils/helpers';

// ─── Types for internal processing ────────────────────────

interface ProcessedPiece {
  id: string;
  code: string;
  material: string;
  cutWidth: number;
  cutHeight: number;
  originalWidth: number;
  originalHeight: number;
  grainDirection: GrainDirection;
  quantity: number;
  sequence: number | null;
  description: string;
  description2: string;
  edgeBandTop: string;
  edgeBandBottom: string;
  edgeBandLeft: string;
  edgeBandRight: string;
  area: number;
  maxDim: number;
  minDim: number;
  perimeter: number;
}

interface FreeRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

// ─── Grain rotation helper ────────────────────────────────

function canRotatePiece(
  piece: ProcessedPiece,
  material: Material,
  config: OptimizationConfig,
): boolean {
  if (!config.allowRotation) return false;
  if (piece.grainDirection === 'none' || material.grainDirection === 'none') return true;
  return false;
}

// ─── Sorting strategies ───────────────────────────────────

type SortFn = (a: ProcessedPiece, b: ProcessedPiece) => number;

const SORT_STRATEGIES: SortFn[] = [
  // 1. Area descending (FFD classic)
  (a, b) => b.area - a.area,
  // 2. Max dimension descending
  (a, b) => b.maxDim - a.maxDim || b.area - a.area,
  // 3. Height descending then width descending
  (a, b) => b.cutHeight - a.cutHeight || b.cutWidth - a.cutWidth,
  // 4. Width descending then height descending
  (a, b) => b.cutWidth - a.cutWidth || b.cutHeight - a.cutHeight,
  // 5. Perimeter descending
  (a, b) => b.perimeter - a.perimeter || b.area - a.area,
  // 6. Min dimension descending (squarish pieces first)
  (a, b) => b.minDim - a.minDim || b.area - a.area,
];

// Extended strategies for advanced mode
const ADVANCED_SORT_STRATEGIES: SortFn[] = [
  ...SORT_STRATEGIES,
  // 7. Aspect ratio (most elongated first)
  (a, b) => (b.maxDim / b.minDim) - (a.maxDim / a.minDim) || b.area - a.area,
  // 8. Area ascending (smallest first — counterintuitive but can help packing)
  (a, b) => a.area - b.area,
  // 9. Width ascending then height descending
  (a, b) => a.cutWidth - b.cutWidth || b.cutHeight - a.cutHeight,
  // 10. Height ascending then width ascending
  (a, b) => a.cutHeight - b.cutHeight || a.cutWidth - b.cutWidth,
  // 11. Difference between dimensions (most square first)
  (a, b) => (a.maxDim - a.minDim) - (b.maxDim - b.minDim) || b.area - a.area,
  // 12. Random-ish shuffle based on combined metric
  (a, b) => (b.cutWidth + b.cutHeight * 1.5) - (a.cutWidth + a.cutHeight * 1.5),
];

// ─── MaxRects placement heuristics ────────────────────────

type PlacementHeuristic = 'BSSF' | 'BLSF' | 'BAF' | 'BLTC';

function scoreRectPlacement(
  rect: FreeRect,
  pw: number,
  ph: number,
  heuristic: PlacementHeuristic,
): number {
  switch (heuristic) {
    case 'BSSF': // Best Short Side Fit
      return Math.min(rect.w - pw, rect.h - ph);
    case 'BLSF': // Best Long Side Fit
      return Math.max(rect.w - pw, rect.h - ph);
    case 'BAF': // Best Area Fit
      return (rect.w * rect.h) - (pw * ph);
    case 'BLTC': // Bottom-Left Touchpoint / Contact (prefer bottom-left positions)
      return rect.y * 10000 + rect.x;
  }
}

const PLACEMENT_HEURISTICS: PlacementHeuristic[] = ['BSSF', 'BLSF', 'BAF', 'BLTC'];

// ─── Main Entry Point ─────────────────────────────────────

export async function runOptimization(
  pieces: Piece[],
  materials: Material[],
  edgeBands: EdgeBand[],
  config: OptimizationConfig,
  onProgress?: (pct: number) => void,
): Promise<OptimizationResult> {
  const startTime = performance.now();

  onProgress?.(5);
  const processed = preProcess(pieces, edgeBands);

  // Group by material
  const byMaterial = new Map<string, ProcessedPiece[]>();
  for (const p of processed) {
    const group = byMaterial.get(p.material) || [];
    group.push(p);
    byMaterial.set(p.material, group);
  }

  const allPlans: CuttingPlan[] = [];
  let matIdx = 0;
  const totalMats = byMaterial.size;

  for (const [matCode, matPieces] of byMaterial) {
    const material = materials.find((m) => m.code === matCode);
    if (!material) continue;

    // Expand quantities
    const expanded: ProcessedPiece[] = [];
    for (const p of matPieces) {
      for (let i = 0; i < p.quantity; i++) {
        expanded.push({ ...p, quantity: 1 });
      }
    }

    const usableWidth = material.sheetWidth - material.trimLeft - material.trimRight;
    const usableHeight = material.sheetHeight - material.trimTop - material.trimBottom;

    let bestPlans: CuttingPlan[] | null = null;
    let bestScore = -Infinity;

    if (config.advancedMode) {
      // ═══════════════════════════════════════════════════
      // ADVANCED MODE: exhaustive multi-heuristic search
      // ═══════════════════════════════════════════════════
      const strategies = ADVANCED_SORT_STRATEGIES;
      const heuristics = config.mode === 'freeform' ? PLACEMENT_HEURISTICS : ['BSSF' as PlacementHeuristic];

      for (const sortFn of strategies) {
        for (const heuristic of heuristics) {
          const sorted = [...expanded].sort(sortFn);

          let plans: CuttingPlan[];
          if (config.mode === 'guillotine') {
            plans = advancedGuillotine(sorted, material, usableWidth, usableHeight, config);
          } else {
            plans = advancedFreeForm(sorted, material, usableWidth, usableHeight, config, heuristic);
          }

          const score = scorePlans(plans);
          if (score > bestScore) {
            bestScore = score;
            bestPlans = plans;
          }
        }
      }

      // Phase 2: Try to reduce sheet count by repacking
      if (bestPlans && bestPlans.length > 1) {
        const allPiecesFromBest = bestPlans.flatMap((p) => p.pieces);
        const processedForRepack = allPiecesFromBest.map((pp) => pieceFromPlaced(pp));

        for (const heuristic of heuristics) {
          for (const sortFn of strategies) {
            const sorted = [...processedForRepack].sort(sortFn);
            let plans: CuttingPlan[];
            if (config.mode === 'guillotine') {
              plans = advancedGuillotine(sorted, material, usableWidth, usableHeight, config);
            } else {
              plans = advancedFreeForm(sorted, material, usableWidth, usableHeight, config, heuristic);
            }
            const score = scorePlans(plans);
            if (score > bestScore) {
              bestScore = score;
              bestPlans = plans;
            }
          }
        }
      }

      // Phase 3: Per-sheet local re-optimization
      if (bestPlans) {
        bestPlans = reoptimizePerSheet(bestPlans, material, usableWidth, usableHeight, config);
      }

    } else {
      // ═══════════════════════════════════════════════════
      // FAST MODE: original 6-strategy greedy
      // ═══════════════════════════════════════════════════
      const optimFn = config.mode === 'guillotine'
        ? optimizeGuillotine
        : optimizeFreeForm;

      for (const sortFn of SORT_STRATEGIES) {
        const sorted = [...expanded].sort(sortFn);
        const plans = optimFn(sorted, material, usableWidth, usableHeight, config);
        const score = scorePlans(plans);
        if (score > bestScore) {
          bestScore = score;
          bestPlans = plans;
        }
      }
    }

    if (bestPlans) {
      // Stack calculation
      if (config.maxStackThickness > 0) {
        for (const plan of bestPlans) {
          const stackCount = Math.floor(config.maxStackThickness / material.thickness);
          plan.stackCount = Math.max(1, stackCount);
        }
      }
      allPlans.push(...bestPlans);
    }

    matIdx++;
    onProgress?.(5 + Math.round((matIdx / totalMats) * 85));
  }

  // Sequencing
  for (const plan of allPlans) {
    plan.pieces.sort((a, b) => {
      if (a.sequence !== null && b.sequence !== null) return a.sequence - b.sequence;
      if (a.sequence !== null) return -1;
      if (b.sequence !== null) return 1;
      return 0;
    });
  }

  onProgress?.(95);

  // Global stats
  const totalUsedArea = allPlans.reduce((s, p) => s + p.usedArea, 0);
  const totalSheetArea = allPlans.reduce((s, p) => s + p.sheetWidth * p.sheetHeight, 0);
  const totalUsableScrapArea = allPlans.reduce((s, p) =>
    s + p.scraps.filter((sc) => sc.usable).reduce((a, sc) => a + sc.width * sc.height, 0), 0);
  const totalWasteArea = allPlans.reduce((s, p) =>
    s + p.scraps.filter((sc) => !sc.usable).reduce((a, sc) => a + sc.width * sc.height, 0), 0);

  const result: OptimizationResult = {
    plans: allPlans,
    totalSheets: allPlans.length,
    totalStackedSheets: allPlans.reduce((s, p) => s + p.stackCount, 0),
    totalPieces: allPlans.reduce((s, p) => s + p.pieces.length, 0),
    globalUtilization: totalSheetArea > 0 ? (totalUsedArea / totalSheetArea) * 100 : 0,
    totalUsableScrap: allPlans.reduce((s, p) => s + p.scraps.filter((sc) => sc.usable).length, 0),
    totalWaste: allPlans.reduce((s, p) => s + p.scraps.filter((sc) => !sc.usable).length, 0),
    totalUsableScrapArea,
    totalWasteArea,
    computeTimeMs: performance.now() - startTime,
    timestamp: new Date().toISOString(),
  };

  onProgress?.(100);
  return result;
}

// ─── Scoring function ─────────────────────────────────────

function scorePlans(plans: CuttingPlan[]): number {
  if (plans.length === 0) return -Infinity;
  const totalUsed = plans.reduce((s, p) => s + p.usedArea, 0);
  const totalUsable = plans.reduce((s, p) => s + p.usableArea, 0);
  const util = totalUsable > 0 ? totalUsed / totalUsable : 0;
  // Heavily penalize more sheets; reward utilization
  return util * 1000 - plans.length * 50;
}

// ─── Helper: reconstruct ProcessedPiece from PlacedPiece ──

function pieceFromPlaced(pp: PlacedPiece): ProcessedPiece {
  // If it was rotated, the placed width/height are swapped from original cut dims
  const cutW = pp.rotated ? pp.height : pp.width;
  const cutH = pp.rotated ? pp.width : pp.height;
  return {
    id: pp.pieceId,
    code: pp.code,
    material: pp.material,
    cutWidth: cutW,
    cutHeight: cutH,
    originalWidth: pp.originalWidth,
    originalHeight: pp.originalHeight,
    grainDirection: pp.grainDirection,
    quantity: 1,
    sequence: pp.sequence,
    description: pp.description,
    description2: pp.description2,
    edgeBandTop: pp.edgeBandTop,
    edgeBandBottom: pp.edgeBandBottom,
    edgeBandLeft: pp.edgeBandLeft,
    edgeBandRight: pp.edgeBandRight,
    area: cutW * cutH,
    maxDim: Math.max(cutW, cutH),
    minDim: Math.min(cutW, cutH),
    perimeter: 2 * (cutW + cutH),
  };
}

// ─── Pre-processing ───────────────────────────────────────

function preProcess(pieces: Piece[], edgeBands: EdgeBand[]): ProcessedPiece[] {
  const ebMap = new Map(edgeBands.map((eb) => [eb.code, eb]));

  return pieces.map((p) => {
    let addW = 0;
    let addH = 0;

    const ebLeft = ebMap.get(p.edgeBandLeft);
    const ebRight = ebMap.get(p.edgeBandRight);
    const ebTop = ebMap.get(p.edgeBandTop);
    const ebBottom = ebMap.get(p.edgeBandBottom);

    if (ebLeft) addW += ebLeft.supplementaryIncrease;
    if (ebRight) addW += ebRight.supplementaryIncrease;
    if (ebTop) addH += ebTop.supplementaryIncrease;
    if (ebBottom) addH += ebBottom.supplementaryIncrease;

    const cutWidth = p.width + addW;
    const cutHeight = p.height + addH;

    return {
      id: p.id,
      code: p.code,
      material: p.material,
      cutWidth,
      cutHeight,
      originalWidth: p.width,
      originalHeight: p.height,
      grainDirection: p.grainDirection,
      quantity: p.quantity,
      sequence: p.sequence,
      description: p.description,
      description2: p.description2,
      edgeBandTop: p.edgeBandTop,
      edgeBandBottom: p.edgeBandBottom,
      edgeBandLeft: p.edgeBandLeft,
      edgeBandRight: p.edgeBandRight,
      area: cutWidth * cutHeight,
      maxDim: Math.max(cutWidth, cutHeight),
      minDim: Math.min(cutWidth, cutHeight),
      perimeter: 2 * (cutWidth + cutHeight),
    };
  });
}

// ═══════════════════════════════════════════════════════════
// FAST MODE — Original algorithms
// ═══════════════════════════════════════════════════════════

// ─── Guillotine (NFDH strip-based) ───────────────────────

function optimizeGuillotine(
  pieces: ProcessedPiece[],
  material: Material,
  usableW: number,
  usableH: number,
  config: OptimizationConfig,
): CuttingPlan[] {
  const plans: CuttingPlan[] = [];
  const remaining = [...pieces];
  const kerf = config.bladeThickness;

  while (remaining.length > 0) {
    const placed: PlacedPiece[] = [];
    const cuts: CutInstruction[] = [];

    let currentY = material.trimTop;
    let stripIdx = 0;

    while (currentY < material.trimTop + usableH && remaining.length > 0) {
      let stripHeight = 0;
      let currentX = material.trimLeft;
      let anchorFound = false;

      for (let i = 0; i < remaining.length; i++) {
        const p = remaining[i];
        const canRot = canRotatePiece(p, material, config);

        if (p.cutWidth <= usableW && currentY + p.cutHeight <= material.trimTop + usableH) {
          stripHeight = p.cutHeight;
          placed.push(makePlacedPiece(p, currentX, currentY, false));
          currentX += p.cutWidth + kerf;
          remaining.splice(i, 1);
          anchorFound = true;
          break;
        }
        if (canRot && p.cutHeight <= usableW && currentY + p.cutWidth <= material.trimTop + usableH) {
          stripHeight = p.cutWidth;
          placed.push(makePlacedPiece(p, currentX, currentY, true));
          currentX += p.cutHeight + kerf;
          remaining.splice(i, 1);
          anchorFound = true;
          break;
        }
      }

      if (!anchorFound) break;

      const availW = material.trimLeft + usableW - currentX;
      if (availW > kerf) {
        fillStrip(remaining, placed, material, config, currentX, currentY, availW, stripHeight, kerf);
      }

      if (stripIdx > 0) {
        cuts.push({ type: 'H', position: currentY, depth: stripIdx, resultingPieces: [] });
      }

      currentY += stripHeight + kerf;
      stripIdx++;
    }

    if (placed.length === 0 && remaining.length > 0) {
      remaining.shift();
      continue;
    }

    if (placed.length > 0) {
      plans.push(createPlan(placed, cuts, material, usableW, usableH));
    }
  }

  return plans;
}

function fillStrip(
  remaining: ProcessedPiece[],
  placed: PlacedPiece[],
  material: Material,
  config: OptimizationConfig,
  startX: number,
  y: number,
  availWidth: number,
  stripHeight: number,
  kerf: number,
): void {
  let currentX = startX;
  let spaceLeft = availWidth;
  let changed = true;

  while (changed && spaceLeft > kerf) {
    changed = false;
    let bestIdx = -1;
    let bestArea = 0;
    let bestRotated = false;
    let bestW = 0;

    for (let i = 0; i < remaining.length; i++) {
      const p = remaining[i];
      const canRot = canRotatePiece(p, material, config);

      if (p.cutWidth <= spaceLeft && p.cutHeight <= stripHeight) {
        if (p.area > bestArea) {
          bestArea = p.area;
          bestIdx = i;
          bestRotated = false;
          bestW = p.cutWidth;
        }
      }
      if (canRot && p.cutHeight <= spaceLeft && p.cutWidth <= stripHeight) {
        if (p.area > bestArea) {
          bestArea = p.area;
          bestIdx = i;
          bestRotated = true;
          bestW = p.cutHeight;
        }
      }
    }

    if (bestIdx >= 0) {
      const p = remaining[bestIdx];
      placed.push(makePlacedPiece(p, currentX, y, bestRotated));
      remaining.splice(bestIdx, 1);
      currentX += bestW + kerf;
      spaceLeft -= bestW + kerf;
      changed = true;
    }
  }
}

// ─── Free Form (MaxRects BSSF) ───────────────────────────

function optimizeFreeForm(
  pieces: ProcessedPiece[],
  material: Material,
  usableW: number,
  usableH: number,
  config: OptimizationConfig,
): CuttingPlan[] {
  return maxRectsPlace(pieces, material, usableW, usableH, config, 'BSSF');
}

// ═══════════════════════════════════════════════════════════
// ADVANCED MODE — Enhanced algorithms
// ═══════════════════════════════════════════════════════════

// ─── Advanced Free Form (MaxRects with configurable heuristic) ──

function advancedFreeForm(
  pieces: ProcessedPiece[],
  material: Material,
  usableW: number,
  usableH: number,
  config: OptimizationConfig,
  heuristic: PlacementHeuristic,
): CuttingPlan[] {
  return maxRectsPlace(pieces, material, usableW, usableH, config, heuristic);
}

// ─── Advanced Guillotine ──────────────────────────────────
// Multi-pass: try every piece as strip anchor, try best-height-fit
// for each strip, minimize wasted height.

function advancedGuillotine(
  pieces: ProcessedPiece[],
  material: Material,
  usableW: number,
  usableH: number,
  config: OptimizationConfig,
): CuttingPlan[] {
  const plans: CuttingPlan[] = [];
  const remaining = [...pieces];
  const kerf = config.bladeThickness;

  while (remaining.length > 0) {
    // Try different strategies for this single sheet
    let bestPlaced: PlacedPiece[] | null = null;
    let bestUsedArea = 0;
    let bestRemaining: ProcessedPiece[] | null = null;

    // Strategy A: For each unique height, try it as the anchor strip height
    const uniqueHeights = new Set<number>();
    for (const p of remaining) {
      uniqueHeights.add(p.cutHeight);
      if (canRotatePiece(p, material, config)) uniqueHeights.add(p.cutWidth);
    }

    for (const targetHeight of uniqueHeights) {
      if (targetHeight > usableH) continue;
      const rem = [...remaining];
      const placed: PlacedPiece[] = [];
      let currentY = material.trimTop;

      // Pack strips prioritizing target height first, then best-fit
      while (currentY + kerf < material.trimTop + usableH && rem.length > 0) {
        const availH = material.trimTop + usableH - currentY;
        if (availH < 1) break;

        // Find best strip height: prefer pieces whose height matches availH closely
        let bestAnchorIdx = -1;
        let bestAnchorH = 0;
        let bestAnchorRot = false;
        let bestAnchorWaste = Infinity;

        for (let i = 0; i < rem.length; i++) {
          const p = rem[i];
          const canRot = canRotatePiece(p, material, config);

          if (p.cutHeight <= availH && p.cutWidth <= usableW) {
            const waste = availH - p.cutHeight;
            if (waste < bestAnchorWaste || (waste === bestAnchorWaste && p.area > (rem[bestAnchorIdx]?.area ?? 0))) {
              bestAnchorWaste = waste;
              bestAnchorIdx = i;
              bestAnchorH = p.cutHeight;
              bestAnchorRot = false;
            }
          }
          if (canRot && p.cutWidth <= availH && p.cutHeight <= usableW) {
            const waste = availH - p.cutWidth;
            if (waste < bestAnchorWaste || (waste === bestAnchorWaste && p.area > (rem[bestAnchorIdx]?.area ?? 0))) {
              bestAnchorWaste = waste;
              bestAnchorIdx = i;
              bestAnchorH = p.cutWidth;
              bestAnchorRot = true;
            }
          }
        }

        if (bestAnchorIdx < 0) break;

        const stripHeight = bestAnchorH;
        const anchor = rem[bestAnchorIdx];
        const anchorW = bestAnchorRot ? anchor.cutHeight : anchor.cutWidth;
        let currentX = material.trimLeft + anchorW + kerf;
        placed.push(makePlacedPiece(anchor, material.trimLeft, currentY, bestAnchorRot));
        rem.splice(bestAnchorIdx, 1);

        // Fill strip: best area fit
        const stripAvailW = material.trimLeft + usableW;
        let filling = true;
        while (filling && currentX < stripAvailW) {
          filling = false;
          let bestFillIdx = -1;
          let bestFillArea = 0;
          let bestFillRot = false;
          let bestFillW = 0;
          const spaceLeft = stripAvailW - currentX;

          for (let i = 0; i < rem.length; i++) {
            const p = rem[i];
            const canRot = canRotatePiece(p, material, config);

            if (p.cutWidth <= spaceLeft && p.cutHeight <= stripHeight && p.area > bestFillArea) {
              bestFillArea = p.area;
              bestFillIdx = i;
              bestFillRot = false;
              bestFillW = p.cutWidth;
            }
            if (canRot && p.cutHeight <= spaceLeft && p.cutWidth <= stripHeight && p.area > bestFillArea) {
              bestFillArea = p.area;
              bestFillIdx = i;
              bestFillRot = true;
              bestFillW = p.cutHeight;
            }
          }

          if (bestFillIdx >= 0) {
            placed.push(makePlacedPiece(rem[bestFillIdx], currentX, currentY, bestFillRot));
            rem.splice(bestFillIdx, 1);
            currentX += bestFillW + kerf;
            filling = true;
          }
        }

        // Try to stack smaller pieces vertically in remaining strip height
        // (two-level packing within strip)
        const secondRowY = currentY + stripHeight + kerf;
        // not for this strip, move to next
        currentY += stripHeight + kerf;
      }

      const usedArea = placed.reduce((s, p) => s + p.width * p.height, 0);
      if (usedArea > bestUsedArea) {
        bestUsedArea = usedArea;
        bestPlaced = placed;
        bestRemaining = rem;
      }
    }

    // Also try the original NFDH approach for this sheet
    {
      const rem = [...remaining];
      const placed: PlacedPiece[] = [];
      let currentY = material.trimTop;
      let stripIdx = 0;

      while (currentY < material.trimTop + usableH && rem.length > 0) {
        let stripHeight = 0;
        let currentX = material.trimLeft;
        let anchorFound = false;

        for (let i = 0; i < rem.length; i++) {
          const p = rem[i];
          const canRot = canRotatePiece(p, material, config);
          if (p.cutWidth <= usableW && currentY + p.cutHeight <= material.trimTop + usableH) {
            stripHeight = p.cutHeight;
            placed.push(makePlacedPiece(p, currentX, currentY, false));
            currentX += p.cutWidth + kerf;
            rem.splice(i, 1);
            anchorFound = true;
            break;
          }
          if (canRot && p.cutHeight <= usableW && currentY + p.cutWidth <= material.trimTop + usableH) {
            stripHeight = p.cutWidth;
            placed.push(makePlacedPiece(p, currentX, currentY, true));
            currentX += p.cutHeight + kerf;
            rem.splice(i, 1);
            anchorFound = true;
            break;
          }
        }
        if (!anchorFound) break;
        const availW = material.trimLeft + usableW - currentX;
        if (availW > kerf) {
          fillStrip(rem, placed, material, config, currentX, currentY, availW, stripHeight, kerf);
        }
        currentY += stripHeight + kerf;
        stripIdx++;
      }

      const usedArea = placed.reduce((s, p) => s + p.width * p.height, 0);
      if (usedArea > bestUsedArea) {
        bestUsedArea = usedArea;
        bestPlaced = placed;
        bestRemaining = rem;
      }
    }

    if (!bestPlaced || bestPlaced.length === 0) {
      if (remaining.length > 0) {
        remaining.shift();
        continue;
      }
      break;
    }

    plans.push(createPlan(bestPlaced, [], material, usableW, usableH));

    // Update remaining
    remaining.length = 0;
    if (bestRemaining) remaining.push(...bestRemaining);
  }

  return plans;
}

// ─── Per-sheet re-optimization ────────────────────────────
// Take each sheet's pieces and try all heuristics to repack them better

function reoptimizePerSheet(
  plans: CuttingPlan[],
  material: Material,
  usableW: number,
  usableH: number,
  config: OptimizationConfig,
): CuttingPlan[] {
  const result: CuttingPlan[] = [];

  for (const plan of plans) {
    const pieces = plan.pieces.map((pp) => pieceFromPlaced(pp));

    let bestPlan = plan;
    let bestUtil = plan.utilizationPercent;

    const heuristics: PlacementHeuristic[] = config.mode === 'freeform' ? PLACEMENT_HEURISTICS : ['BSSF'];

    for (const heuristic of heuristics) {
      for (const sortFn of ADVANCED_SORT_STRATEGIES) {
        const sorted = [...pieces].sort(sortFn);
        const newPlans = config.mode === 'guillotine'
          ? advancedGuillotine(sorted, material, usableW, usableH, config)
          : maxRectsPlace(sorted, material, usableW, usableH, config, heuristic);

        // Only accept if ALL pieces fit in one sheet
        if (newPlans.length === 1 && newPlans[0].pieces.length === pieces.length) {
          if (newPlans[0].utilizationPercent > bestUtil) {
            bestUtil = newPlans[0].utilizationPercent;
            bestPlan = newPlans[0];
          }
        }
      }
    }

    result.push(bestPlan);
  }

  return result;
}

// ─── Shared MaxRects implementation ───────────────────────

function maxRectsPlace(
  pieces: ProcessedPiece[],
  material: Material,
  usableW: number,
  usableH: number,
  config: OptimizationConfig,
  heuristic: PlacementHeuristic,
): CuttingPlan[] {
  const plans: CuttingPlan[] = [];
  const remaining = [...pieces];
  const kerf = config.bladeThickness;

  while (remaining.length > 0) {
    const placed: PlacedPiece[] = [];
    const freeRects: FreeRect[] = [{
      x: material.trimLeft,
      y: material.trimTop,
      w: usableW,
      h: usableH,
    }];

    const toRemove: number[] = [];

    for (let i = 0; i < remaining.length; i++) {
      const p = remaining[i];
      const pw = p.cutWidth;
      const ph = p.cutHeight;
      const allowRotate = canRotatePiece(p, material, config);

      let bestRect = -1;
      let bestScore = Infinity;
      let bestRotated = false;

      for (let r = 0; r < freeRects.length; r++) {
        const rect = freeRects[r];

        if (pw <= rect.w && ph <= rect.h) {
          const score = scoreRectPlacement(rect, pw, ph, heuristic);
          if (score < bestScore) {
            bestScore = score;
            bestRect = r;
            bestRotated = false;
          }
        }

        if (allowRotate && ph <= rect.w && pw <= rect.h) {
          const score = scoreRectPlacement(rect, ph, pw, heuristic);
          if (score < bestScore) {
            bestScore = score;
            bestRect = r;
            bestRotated = true;
          }
        }
      }

      if (bestRect >= 0) {
        const rect = freeRects[bestRect];
        const finalW = bestRotated ? ph : pw;
        const finalH = bestRotated ? pw : ph;

        placed.push(makePlacedPiece(p, rect.x, rect.y, bestRotated));
        toRemove.push(i);

        const usedRect: FreeRect = {
          x: rect.x,
          y: rect.y,
          w: finalW + kerf,
          h: finalH + kerf,
        };

        splitFreeRects(freeRects, usedRect);
        pruneFreeRects(freeRects);
      }
    }

    for (const idx of toRemove.sort((a, b) => b - a)) {
      remaining.splice(idx, 1);
    }

    if (placed.length === 0 && remaining.length > 0) {
      remaining.shift();
      continue;
    }

    if (placed.length > 0) {
      plans.push(createPlan(placed, [], material, usableW, usableH));
    }
  }

  return plans;
}

// ─── MaxRects split / prune ───────────────────────────────

function splitFreeRects(freeRects: FreeRect[], used: FreeRect): void {
  const len = freeRects.length;
  for (let i = len - 1; i >= 0; i--) {
    const fr = freeRects[i];

    if (used.x >= fr.x + fr.w || used.x + used.w <= fr.x ||
        used.y >= fr.y + fr.h || used.y + used.h <= fr.y) {
      continue;
    }

    freeRects.splice(i, 1);

    if (used.x > fr.x) {
      freeRects.push({ x: fr.x, y: fr.y, w: used.x - fr.x, h: fr.h });
    }
    if (used.x + used.w < fr.x + fr.w) {
      freeRects.push({ x: used.x + used.w, y: fr.y, w: (fr.x + fr.w) - (used.x + used.w), h: fr.h });
    }
    if (used.y > fr.y) {
      freeRects.push({ x: fr.x, y: fr.y, w: fr.w, h: used.y - fr.y });
    }
    if (used.y + used.h < fr.y + fr.h) {
      freeRects.push({ x: fr.x, y: used.y + used.h, w: fr.w, h: (fr.y + fr.h) - (used.y + used.h) });
    }
  }
}

function pruneFreeRects(freeRects: FreeRect[]): void {
  for (let i = freeRects.length - 1; i >= 0; i--) {
    for (let j = 0; j < freeRects.length; j++) {
      if (i === j) continue;
      const a = freeRects[i];
      const b = freeRects[j];
      if (a.x >= b.x && a.y >= b.y &&
          a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h) {
        freeRects.splice(i, 1);
        break;
      }
    }
  }
}

// ─── Helpers ──────────────────────────────────────────────

function makePlacedPiece(p: ProcessedPiece, x: number, y: number, rotated: boolean): PlacedPiece {
  return {
    pieceId: p.id,
    code: p.code,
    x,
    y,
    width: rotated ? p.cutHeight : p.cutWidth,
    height: rotated ? p.cutWidth : p.cutHeight,
    rotated,
    originalWidth: p.originalWidth,
    originalHeight: p.originalHeight,
    grainDirection: p.grainDirection,
    description: p.description,
    description2: p.description2,
    material: p.material,
    sequence: p.sequence,
    edgeBandTop: p.edgeBandTop,
    edgeBandBottom: p.edgeBandBottom,
    edgeBandLeft: p.edgeBandLeft,
    edgeBandRight: p.edgeBandRight,
    quantity: p.quantity,
  };
}

function createPlan(
  placed: PlacedPiece[],
  cuts: CutInstruction[],
  material: Material,
  usableW: number,
  usableH: number,
): CuttingPlan {
  const usedArea = placed.reduce((s, p) => s + p.width * p.height, 0);
  const usableArea = usableW * usableH;

  const scraps = calculateScraps(placed, material, usableW, usableH);

  return {
    planId: generateId(),
    materialCode: material.code,
    sheetWidth: material.sheetWidth,
    sheetHeight: material.sheetHeight,
    stackCount: 1,
    pieces: placed,
    scraps,
    cuts,
    usableArea,
    usedArea,
    wasteArea: usableArea - usedArea,
    utilizationPercent: usableArea > 0 ? (usedArea / usableArea) * 100 : 0,
    totalCuts: cuts.length + placed.length,
  };
}

function calculateScraps(
  placed: PlacedPiece[],
  material: Material,
  usableW: number,
  usableH: number,
): ScrapRect[] {
  const scraps: ScrapRect[] = [];
  if (placed.length === 0) return scraps;

  const maxX = Math.max(...placed.map((p) => p.x + p.width));
  const maxY = Math.max(...placed.map((p) => p.y + p.height));
  const sheetRight = material.trimLeft + usableW;
  const sheetBottom = material.trimTop + usableH;

  const rightW = sheetRight - maxX;
  const bottomH = sheetBottom - maxY;

  if (rightW > 1) {
    scraps.push({
      x: maxX,
      y: material.trimTop,
      width: rightW,
      height: usableH,
      usable: rightW >= material.minScrapWidth && usableH >= material.minScrapHeight,
    });
  }

  if (bottomH > 1) {
    scraps.push({
      x: material.trimLeft,
      y: maxY,
      width: maxX - material.trimLeft,
      height: bottomH,
      usable: (maxX - material.trimLeft) >= material.minScrapWidth && bottomH >= material.minScrapHeight,
    });
  }

  return scraps;
}
