import {
  Piece, Material, EdgeBand, OptimizationConfig,
  OptimizationResult, CuttingPlan, PlacedPiece, ScrapRect, CutInstruction,
  GrainDirection,
} from '@/types';
import { generateId } from '@/utils/helpers';

// ─── Internal types ───────────────────────────────────────

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

interface FreeRect { x: number; y: number; w: number; h: number; }

// ─── Rotation helper ──────────────────────────────────────

function canRotate(p: ProcessedPiece, mat: Material, cfg: OptimizationConfig): boolean {
  if (!cfg.allowRotation) return false;
  return p.grainDirection === 'none' || mat.grainDirection === 'none';
}

// ─── Sort strategies ──────────────────────────────────────

type SortFn = (a: ProcessedPiece, b: ProcessedPiece) => number;

const SORT_STRATEGIES: SortFn[] = [
  (a, b) => b.area - a.area,
  (a, b) => b.maxDim - a.maxDim || b.area - a.area,
  (a, b) => b.cutHeight - a.cutHeight || b.cutWidth - a.cutWidth,
  (a, b) => b.cutWidth - a.cutWidth || b.cutHeight - a.cutHeight,
  (a, b) => b.perimeter - a.perimeter || b.area - a.area,
  (a, b) => b.minDim - a.minDim || b.area - a.area,
];

const ADVANCED_SORT_STRATEGIES: SortFn[] = [
  ...SORT_STRATEGIES,
  (a, b) => (b.maxDim / b.minDim) - (a.maxDim / a.minDim) || b.area - a.area,
  (a, b) => a.area - b.area,
  (a, b) => a.cutWidth - b.cutWidth || b.cutHeight - a.cutHeight,
  (a, b) => a.cutHeight - b.cutHeight || a.cutWidth - b.cutWidth,
  (a, b) => (a.maxDim - a.minDim) - (b.maxDim - b.minDim) || b.area - a.area,
  (a, b) => (b.cutWidth + b.cutHeight * 1.5) - (a.cutWidth + a.cutHeight * 1.5),
  (a, b) => a.perimeter - b.perimeter || a.area - b.area,
  (a, b) => (b.cutWidth * 2 + b.cutHeight) - (a.cutWidth * 2 + a.cutHeight),
  (a, b) => (b.cutHeight * 2 + b.cutWidth) - (a.cutHeight * 2 + a.cutWidth),
];

// ─── Placement heuristics ─────────────────────────────────

type Heuristic = 'BSSF' | 'BLSF' | 'BAF' | 'BLTC' | 'BL' | 'CP';

function scoreRect(r: FreeRect, pw: number, ph: number, h: Heuristic): number {
  switch (h) {
    case 'BSSF': return Math.min(r.w - pw, r.h - ph);
    case 'BLSF': return Math.max(r.w - pw, r.h - ph);
    case 'BAF':  return (r.w * r.h) - (pw * ph);
    case 'BLTC': return r.y * 10000 + r.x;
    case 'BL':   return r.y * 100000 + r.x;
    case 'CP':   return Math.min(r.w - pw, r.h - ph) + Math.max(r.w - pw, r.h - ph) * 0.5;
  }
}

const ALL_H: Heuristic[] = ['BSSF', 'BLSF', 'BAF', 'BLTC', 'BL', 'CP'];

// ═══════════════════════════════════════════════════════════
// MAIN ENTRY POINT
// ═══════════════════════════════════════════════════════════

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
    const mat = materials.find((m) => m.code === matCode);
    if (!mat) continue;

    const expanded: ProcessedPiece[] = [];
    for (const p of matPieces) {
      for (let i = 0; i < p.quantity; i++) {
        expanded.push({ ...p, quantity: 1, id: p.id + (i > 0 ? '_' + i : '') });
      }
    }

    const uw = mat.sheetWidth - mat.trimLeft - mat.trimRight;
    const uh = mat.sheetHeight - mat.trimTop - mat.trimBottom;

    let bestPlans: CuttingPlan[] | null = null;
    let bestScore = -Infinity;

    const tryAccept = (plans: CuttingPlan[]) => {
      const s = scorePlans(plans, uw, uh);
      if (s > bestScore) { bestScore = s; bestPlans = plans; }
    };

    if (config.advancedMode) {
      // ═══ ADVANCED MODE ═══════════════════════════════
      const budget = Math.min(12000, Math.max(3000, expanded.length * 10));
      const deadline = performance.now() + budget;
      const strategies = ADVANCED_SORT_STRATEGIES;
      const heurs = config.mode === 'freeform' ? ALL_H : ['BSSF' as Heuristic];

      // Phase 1: exhaustive sort × heuristic
      for (const sf of strategies) {
        if (performance.now() > deadline * 0.4) break;
        for (const h of heurs) {
          const sorted = [...expanded].sort(sf);
          tryAccept(config.mode === 'guillotine'
            ? advGuillotine(sorted, mat, uw, uh, config)
            : maxRectsPlace(sorted, mat, uw, uh, config, h));
        }
      }

      // Phase 2: repack from best solution
      if (bestPlans !== null && (bestPlans as CuttingPlan[]).length > 1) {
        const bp = bestPlans as CuttingPlan[];
        const repacked = bp.flatMap(p => p.pieces).map(pp => fromPlaced(pp));
        for (const h of heurs) {
          if (performance.now() > deadline * 0.55) break;
          for (const sf of strategies) {
            tryAccept(config.mode === 'guillotine'
              ? advGuillotine([...repacked].sort(sf), mat, uw, uh, config)
              : maxRectsPlace([...repacked].sort(sf), mat, uw, uh, config, h));
          }
        }
      }

      // Phase 3: iterated greedy destroy-and-repair
      if (bestPlans !== null) {
        tryAccept(iteratedGreedy(bestPlans as CuttingPlan[], mat, uw, uh, config, deadline));
      }

      // Phase 4: per-sheet re-optimization
      if (bestPlans !== null) {
        bestPlans = reoptPerSheet(bestPlans as CuttingPlan[], mat, uw, uh, config, deadline);
      }

      // Phase 5: try to reduce sheets
      if (bestPlans !== null && (bestPlans as CuttingPlan[]).length > 1) {
        bestPlans = tryReduceSheets(bestPlans as CuttingPlan[], mat, uw, uh, config, deadline);
      }

      // Yield to UI thread between materials
      await new Promise(r => setTimeout(r, 0));

    } else {
      // ═══ FAST MODE ═══════════════════════════════════
      for (const sf of SORT_STRATEGIES) {
        const sorted = [...expanded].sort(sf);
        tryAccept(config.mode === 'guillotine'
          ? fastGuillotine(sorted, mat, uw, uh, config)
          : maxRectsPlace(sorted, mat, uw, uh, config, 'BSSF'));
      }
    }

    if (bestPlans) {
      // Stacking & load calculations
      for (const plan of bestPlans) {
        if (config.maxStackThickness > 0 && mat.thickness > 0) {
          const spl = Math.max(1, Math.floor(config.maxStackThickness / mat.thickness));
          plan.sheetsPerLoad = spl;
        }
      }
      allPlans.push(...bestPlans);
    }

    matIdx++;
    onProgress?.(5 + Math.round((matIdx / totalMats) * 85));
  }

  // Deduplicate identical layouts & compute loads
  const deduped = deduplicatePlans(allPlans, config);

  // Sequencing
  for (const plan of deduped) {
    plan.pieces.sort((a, b) => {
      if (a.sequence !== null && b.sequence !== null) return a.sequence - b.sequence;
      if (a.sequence !== null) return -1;
      if (b.sequence !== null) return 1;
      return 0;
    });
  }

  onProgress?.(95);

  const totalUsedArea = deduped.reduce((s, p) => s + p.usedArea * p.stackCount, 0);
  const totalSheetArea = deduped.reduce((s, p) => s + p.sheetWidth * p.sheetHeight * p.stackCount, 0);
  const totalUsableScrapArea = deduped.reduce((s, p) =>
    s + p.scraps.filter(sc => sc.usable).reduce((a, sc) => a + sc.width * sc.height, 0) * p.stackCount, 0);
  const totalWasteArea = deduped.reduce((s, p) =>
    s + p.scraps.filter(sc => !sc.usable).reduce((a, sc) => a + sc.width * sc.height, 0) * p.stackCount, 0);

  const result: OptimizationResult = {
    plans: deduped,
    totalSheets: deduped.length,
    totalStackedSheets: deduped.reduce((s, p) => s + p.stackCount, 0),
    totalPieces: deduped.reduce((s, p) => s + p.pieces.length * p.stackCount, 0),
    globalUtilization: totalSheetArea > 0 ? (totalUsedArea / totalSheetArea) * 100 : 0,
    totalUsableScrap: deduped.reduce((s, p) => s + p.scraps.filter(sc => sc.usable).length, 0),
    totalWaste: deduped.reduce((s, p) => s + p.scraps.filter(sc => !sc.usable).length, 0),
    totalUsableScrapArea,
    totalWasteArea,
    totalMachineLoads: deduped.reduce((s, p) => s + p.machineLoads, 0),
    computeTimeMs: performance.now() - startTime,
    timestamp: new Date().toISOString(),
  };

  onProgress?.(100);
  return result;
}

// ═══════════════════════════════════════════════════════════
// SCORING
// ═══════════════════════════════════════════════════════════

function scorePlans(plans: CuttingPlan[], _uw: number, _uh: number): number {
  if (plans.length === 0) return -Infinity;
  const totalUsed = plans.reduce((s, p) => s + p.usedArea, 0);
  const totalUsable = plans.reduce((s, p) => s + p.usableArea, 0);
  const util = totalUsable > 0 ? totalUsed / totalUsable : 0;
  const totalPieces = plans.reduce((s, p) => s + p.pieces.length, 0);

  // Compactness bonus per sheet
  let compactness = 0;
  for (const plan of plans) {
    if (plan.pieces.length === 0) continue;
    const mx = Math.max(...plan.pieces.map(p => p.x + p.width));
    const my = Math.max(...plan.pieces.map(p => p.y + p.height));
    const ba = mx * my;
    if (ba > 0) compactness += plan.usedArea / ba;
  }
  compactness /= plans.length;

  // Penalize low-util last sheet
  let lastPenalty = 0;
  if (plans.length > 1) {
    const last = plans[plans.length - 1];
    const lu = last.usableArea > 0 ? last.usedArea / last.usableArea : 0;
    if (lu < 0.3) lastPenalty = (0.3 - lu) * 100;
  }

  return util * 1000 + compactness * 200 + totalPieces * 0.1 - plans.length * 80 - lastPenalty;
}

// ═══════════════════════════════════════════════════════════
// DEDUPLICATION & STACKING
// ═══════════════════════════════════════════════════════════

function planSignature(plan: CuttingPlan): string {
  return plan.pieces
    .map(p => `${p.code}:${Math.round(p.x)}:${Math.round(p.y)}:${Math.round(p.width)}x${Math.round(p.height)}:${p.rotated ? 1 : 0}`)
    .sort()
    .join('|');
}

function deduplicatePlans(plans: CuttingPlan[], config: OptimizationConfig): CuttingPlan[] {
  if (config.maxStackThickness <= 0) return plans;

  const groups = new Map<string, { plan: CuttingPlan; count: number }>();
  for (const plan of plans) {
    const key = plan.materialCode + '::' + planSignature(plan);
    const existing = groups.get(key);
    if (existing) {
      existing.count++;
    } else {
      groups.set(key, { plan, count: 1 });
    }
  }

  const result: CuttingPlan[] = [];
  for (const { plan, count } of groups.values()) {
    const spl = plan.sheetsPerLoad || 1;
    const totalSheets = count; // each plan was 1 sheet; total count of identical layouts
    const machineLoads = Math.ceil(totalSheets / spl);
    result.push({
      ...plan,
      stackCount: totalSheets,
      sheetsPerLoad: spl,
      machineLoads,
    });
  }

  return result;
}

// ═══════════════════════════════════════════════════════════
// HELPER: PlacedPiece → ProcessedPiece
// ═══════════════════════════════════════════════════════════

function fromPlaced(pp: PlacedPiece): ProcessedPiece {
  const cw = pp.rotated ? pp.height : pp.width;
  const ch = pp.rotated ? pp.width : pp.height;
  return {
    id: pp.pieceId, code: pp.code, material: pp.material,
    cutWidth: cw, cutHeight: ch,
    originalWidth: pp.originalWidth, originalHeight: pp.originalHeight,
    grainDirection: pp.grainDirection, quantity: 1, sequence: pp.sequence,
    description: pp.description, description2: pp.description2,
    edgeBandTop: pp.edgeBandTop, edgeBandBottom: pp.edgeBandBottom,
    edgeBandLeft: pp.edgeBandLeft, edgeBandRight: pp.edgeBandRight,
    area: cw * ch, maxDim: Math.max(cw, ch), minDim: Math.min(cw, ch),
    perimeter: 2 * (cw + ch),
  };
}

// ═══════════════════════════════════════════════════════════
// PRE-PROCESSING
// ═══════════════════════════════════════════════════════════

function preProcess(pieces: Piece[], edgeBands: EdgeBand[]): ProcessedPiece[] {
  const ebMap = new Map(edgeBands.map(eb => [eb.code, eb]));
  return pieces.map(p => {
    let addW = 0, addH = 0;
    const ebL = ebMap.get(p.edgeBandLeft);
    const ebR = ebMap.get(p.edgeBandRight);
    const ebT = ebMap.get(p.edgeBandTop);
    const ebB = ebMap.get(p.edgeBandBottom);
    if (ebL) addW += ebL.supplementaryIncrease;
    if (ebR) addW += ebR.supplementaryIncrease;
    if (ebT) addH += ebT.supplementaryIncrease;
    if (ebB) addH += ebB.supplementaryIncrease;
    const cw = p.width + addW;
    const ch = p.height + addH;
    return {
      id: p.id, code: p.code, material: p.material,
      cutWidth: cw, cutHeight: ch,
      originalWidth: p.width, originalHeight: p.height,
      grainDirection: p.grainDirection, quantity: p.quantity,
      sequence: p.sequence, description: p.description, description2: p.description2,
      edgeBandTop: p.edgeBandTop, edgeBandBottom: p.edgeBandBottom,
      edgeBandLeft: p.edgeBandLeft, edgeBandRight: p.edgeBandRight,
      area: cw * ch, maxDim: Math.max(cw, ch), minDim: Math.min(cw, ch),
      perimeter: 2 * (cw + ch),
    };
  });
}

// ═══════════════════════════════════════════════════════════
// FAST GUILLOTINE (NFDH strip-based)
// ═══════════════════════════════════════════════════════════

function fastGuillotine(
  pieces: ProcessedPiece[], mat: Material,
  uw: number, uh: number, cfg: OptimizationConfig,
): CuttingPlan[] {
  const plans: CuttingPlan[] = [];
  const rem = [...pieces];
  const kerf = cfg.bladeThickness;

  while (rem.length > 0) {
    const placed: PlacedPiece[] = [];
    const cuts: CutInstruction[] = [];
    let curY = mat.trimTop;
    let stripIdx = 0;

    while (curY < mat.trimTop + uh && rem.length > 0) {
      let stripH = 0, curX = mat.trimLeft, found = false;
      for (let i = 0; i < rem.length; i++) {
        const p = rem[i];
        if (p.cutWidth <= uw && curY + p.cutHeight <= mat.trimTop + uh) {
          stripH = p.cutHeight;
          placed.push(mkPP(p, curX, curY, false));
          curX += p.cutWidth + kerf;
          rem.splice(i, 1); found = true; break;
        }
        if (canRotate(p, mat, cfg) && p.cutHeight <= uw && curY + p.cutWidth <= mat.trimTop + uh) {
          stripH = p.cutWidth;
          placed.push(mkPP(p, curX, curY, true));
          curX += p.cutHeight + kerf;
          rem.splice(i, 1); found = true; break;
        }
      }
      if (!found) break;
      const avail = mat.trimLeft + uw - curX;
      if (avail > kerf) fillStrip(rem, placed, mat, cfg, curX, curY, avail, stripH, kerf);
      if (stripIdx > 0) cuts.push({ type: 'H', position: curY, depth: stripIdx, resultingPieces: [] });
      curY += stripH + kerf;
      stripIdx++;
    }
    if (placed.length === 0 && rem.length > 0) { rem.shift(); continue; }
    if (placed.length > 0) plans.push(mkPlan(placed, cuts, mat, uw, uh));
  }
  return plans;
}

function fillStrip(
  rem: ProcessedPiece[], placed: PlacedPiece[], mat: Material,
  cfg: OptimizationConfig, startX: number, y: number,
  availW: number, stripH: number, kerf: number,
): void {
  let curX = startX, space = availW, changed = true;
  while (changed && space > kerf) {
    changed = false;
    let bi = -1, ba = 0, br = false, bw = 0;
    for (let i = 0; i < rem.length; i++) {
      const p = rem[i];
      if (p.cutWidth <= space && p.cutHeight <= stripH && p.area > ba) {
        ba = p.area; bi = i; br = false; bw = p.cutWidth;
      }
      if (canRotate(p, mat, cfg) && p.cutHeight <= space && p.cutWidth <= stripH && p.area > ba) {
        ba = p.area; bi = i; br = true; bw = p.cutHeight;
      }
    }
    if (bi >= 0) {
      placed.push(mkPP(rem[bi], curX, y, br));
      rem.splice(bi, 1);
      curX += bw + kerf; space -= bw + kerf; changed = true;
    }
  }
}

// ═══════════════════════════════════════════════════════════
// ADVANCED GUILLOTINE
// ═══════════════════════════════════════════════════════════

function advGuillotine(
  pieces: ProcessedPiece[], mat: Material,
  uw: number, uh: number, cfg: OptimizationConfig,
): CuttingPlan[] {
  const plans: CuttingPlan[] = [];
  const remaining = [...pieces];
  const kerf = cfg.bladeThickness;

  while (remaining.length > 0) {
    let bestPlaced: PlacedPiece[] | null = null;
    let bestUsed = 0;
    let bestRem: ProcessedPiece[] | null = null;

    const uhs = new Set<number>();
    for (const p of remaining) {
      uhs.add(p.cutHeight);
      if (canRotate(p, mat, cfg)) uhs.add(p.cutWidth);
    }

    for (const th of uhs) {
      if (th > uh) continue;
      const rem = [...remaining];
      const placed: PlacedPiece[] = [];
      let curY = mat.trimTop;

      while (curY + kerf < mat.trimTop + uh && rem.length > 0) {
        const avH = mat.trimTop + uh - curY;
        if (avH < 1) break;
        let ai = -1, ah = 0, ar = false, aw2 = Infinity;
        for (let i = 0; i < rem.length; i++) {
          const p = rem[i];
          if (p.cutHeight <= avH && p.cutWidth <= uw) {
            const w = avH - p.cutHeight;
            if (w < aw2 || (w === aw2 && p.area > (rem[ai]?.area ?? 0))) {
              aw2 = w; ai = i; ah = p.cutHeight; ar = false;
            }
          }
          if (canRotate(p, mat, cfg) && p.cutWidth <= avH && p.cutHeight <= uw) {
            const w = avH - p.cutWidth;
            if (w < aw2 || (w === aw2 && p.area > (rem[ai]?.area ?? 0))) {
              aw2 = w; ai = i; ah = p.cutWidth; ar = true;
            }
          }
        }
        if (ai < 0) break;
        const stripH = ah;
        const anchor = rem[ai];
        const ancW = ar ? anchor.cutHeight : anchor.cutWidth;
        let curX = mat.trimLeft + ancW + kerf;
        placed.push(mkPP(anchor, mat.trimLeft, curY, ar));
        rem.splice(ai, 1);

        const sAW = mat.trimLeft + uw;
        let filling = true;
        while (filling && curX < sAW) {
          filling = false;
          let fi = -1, fa = 0, fr2 = false, fw = 0;
          const sl = sAW - curX;
          for (let i = 0; i < rem.length; i++) {
            const p = rem[i];
            if (p.cutWidth <= sl && p.cutHeight <= stripH && p.area > fa) { fa = p.area; fi = i; fr2 = false; fw = p.cutWidth; }
            if (canRotate(p, mat, cfg) && p.cutHeight <= sl && p.cutWidth <= stripH && p.area > fa) { fa = p.area; fi = i; fr2 = true; fw = p.cutHeight; }
          }
          if (fi >= 0) { placed.push(mkPP(rem[fi], curX, curY, fr2)); rem.splice(fi, 1); curX += fw + kerf; filling = true; }
        }

        // Sub-strip: try to fill remaining height in strip with smaller pieces
        const subY = curY + stripH + kerf;
        const subH = avH - stripH - kerf;
        if (subH > 0) {
          let subX = mat.trimLeft;
          let subFilling = true;
          while (subFilling && subX < sAW && rem.length > 0) {
            subFilling = false;
            let si = -1, sa = 0, sr = false, sw = 0;
            const sSpace = sAW - subX;
            for (let i = 0; i < rem.length; i++) {
              const p = rem[i];
              if (p.cutWidth <= sSpace && p.cutHeight <= subH && p.area > sa) { sa = p.area; si = i; sr = false; sw = p.cutWidth; }
              if (canRotate(p, mat, cfg) && p.cutHeight <= sSpace && p.cutWidth <= subH && p.area > sa) { sa = p.area; si = i; sr = true; sw = p.cutHeight; }
            }
            if (si >= 0) { placed.push(mkPP(rem[si], subX, subY, sr)); rem.splice(si, 1); subX += sw + kerf; subFilling = true; }
          }
        }

        curY += Math.max(stripH, stripH + kerf + (subH > 0 ? subH : 0));
        if (subH <= 0) curY = curY - stripH + stripH + kerf; // normal advance
        curY = curY > mat.trimTop + uh ? mat.trimTop + uh : curY;
        // Simple advance
        curY = mat.trimTop + uh; // re-evaluate: just move to the amount used
        curY = placed.length > 0 ? Math.max(...placed.map(p => p.y + p.height)) + kerf : mat.trimTop + uh;
      }

      const used = placed.reduce((s, p) => s + p.width * p.height, 0);
      if (used > bestUsed) { bestUsed = used; bestPlaced = placed; bestRem = rem; }
    }

    // Also try NFDH
    {
      const rem = [...remaining];
      const placed: PlacedPiece[] = [];
      let curY = mat.trimTop;
      while (curY < mat.trimTop + uh && rem.length > 0) {
        let stripH = 0, curX = mat.trimLeft, found = false;
        for (let i = 0; i < rem.length; i++) {
          const p = rem[i];
          if (p.cutWidth <= uw && curY + p.cutHeight <= mat.trimTop + uh) {
            stripH = p.cutHeight; placed.push(mkPP(p, curX, curY, false)); curX += p.cutWidth + kerf; rem.splice(i, 1); found = true; break;
          }
          if (canRotate(p, mat, cfg) && p.cutHeight <= uw && curY + p.cutWidth <= mat.trimTop + uh) {
            stripH = p.cutWidth; placed.push(mkPP(p, curX, curY, true)); curX += p.cutHeight + kerf; rem.splice(i, 1); found = true; break;
          }
        }
        if (!found) break;
        const avail = mat.trimLeft + uw - curX;
        if (avail > kerf) fillStrip(rem, placed, mat, cfg, curX, curY, avail, stripH, kerf);
        curY += stripH + kerf;
      }
      const used = placed.reduce((s, p) => s + p.width * p.height, 0);
      if (used > bestUsed) { bestUsed = used; bestPlaced = placed; bestRem = rem; }
    }

    if (!bestPlaced || bestPlaced.length === 0) {
      if (remaining.length > 0) { remaining.shift(); continue; }
      break;
    }
    plans.push(mkPlan(bestPlaced, [], mat, uw, uh));
    remaining.length = 0;
    if (bestRem) remaining.push(...bestRem);
  }
  return plans;
}

// ═══════════════════════════════════════════════════════════
// ITERATED GREEDY
// ═══════════════════════════════════════════════════════════

function iteratedGreedy(
  initial: CuttingPlan[], mat: Material,
  uw: number, uh: number, cfg: OptimizationConfig, deadline: number,
): CuttingPlan[] {
  let best = initial;
  let bestScore = scorePlans(best, uw, uh);
  const heurs = cfg.mode === 'freeform' ? ALL_H : ['BSSF' as Heuristic];
  let iter = 0;

  while (performance.now() < deadline * 0.85) {
    iter++;
    const rate = 0.15 + Math.random() * 0.35;
    const all = best.flatMap(p => p.pieces);
    const n = Math.max(1, Math.floor(all.length * rate));
    const shuffled = [...all].sort(() => Math.random() - 0.5);
    const kept = shuffled.slice(n).map(pp => fromPlaced(pp));
    const removed = shuffled.slice(0, n).map(pp => fromPlaced(pp));
    const sf = ADVANCED_SORT_STRATEGIES[iter % ADVANCED_SORT_STRATEGIES.length];
    const h = heurs[iter % heurs.length];
    const repair = [...kept.sort(sf), ...removed.sort(sf)];
    const plans = cfg.mode === 'guillotine'
      ? advGuillotine(repair, mat, uw, uh, cfg)
      : maxRectsPlace(repair, mat, uw, uh, cfg, h);
    const s = scorePlans(plans, uw, uh);
    if (s > bestScore) { bestScore = s; best = plans; }
  }
  return best;
}

// ═══════════════════════════════════════════════════════════
// BIN REDUCTION
// ═══════════════════════════════════════════════════════════

function tryReduceSheets(
  plans: CuttingPlan[], mat: Material,
  uw: number, uh: number, cfg: OptimizationConfig, deadline: number,
): CuttingPlan[] {
  let best = [...plans];
  const all = best.flatMap(p => p.pieces.map(pp => fromPlaced(pp)));
  const heurs = cfg.mode === 'freeform' ? ALL_H : ['BSSF' as Heuristic];

  for (const h of heurs) {
    if (performance.now() > deadline) break;
    for (const sf of ADVANCED_SORT_STRATEGIES) {
      if (performance.now() > deadline) break;
      const sorted = [...all].sort(sf);
      const np = cfg.mode === 'guillotine'
        ? advGuillotine(sorted, mat, uw, uh, cfg)
        : maxRectsPlace(sorted, mat, uw, uh, cfg, h);
      if (np.length < best.length) { best = np; }
      else if (np.length === best.length) {
        if (scorePlans(np, uw, uh) > scorePlans(best, uw, uh)) best = np;
      }
    }
  }
  return best;
}

// ═══════════════════════════════════════════════════════════
// PER-SHEET RE-OPTIMIZATION
// ═══════════════════════════════════════════════════════════

function reoptPerSheet(
  plans: CuttingPlan[], mat: Material,
  uw: number, uh: number, cfg: OptimizationConfig, deadline: number,
): CuttingPlan[] {
  const result: CuttingPlan[] = [];
  for (const plan of plans) {
    if (performance.now() > deadline) { result.push(plan); continue; }
    const pcs = plan.pieces.map(pp => fromPlaced(pp));
    let bp = plan, bu = plan.utilizationPercent;
    const heurs: Heuristic[] = cfg.mode === 'freeform' ? ALL_H : ['BSSF'];
    for (const h of heurs) {
      for (const sf of ADVANCED_SORT_STRATEGIES) {
        if (performance.now() > deadline) break;
        const np = cfg.mode === 'guillotine'
          ? advGuillotine([...pcs].sort(sf), mat, uw, uh, cfg)
          : maxRectsPlace([...pcs].sort(sf), mat, uw, uh, cfg, h);
        if (np.length === 1 && np[0].pieces.length === pcs.length && np[0].utilizationPercent > bu) {
          bu = np[0].utilizationPercent; bp = np[0];
        }
      }
    }
    result.push(bp);
  }
  return result;
}

// ═══════════════════════════════════════════════════════════
// MAXRECTS PLACEMENT (global best-fit per iteration)
// ═══════════════════════════════════════════════════════════

function maxRectsPlace(
  pieces: ProcessedPiece[], mat: Material,
  uw: number, uh: number, cfg: OptimizationConfig, heuristic: Heuristic,
): CuttingPlan[] {
  const plans: CuttingPlan[] = [];
  const rem = [...pieces];
  const kerf = cfg.bladeThickness;

  while (rem.length > 0) {
    const placed: PlacedPiece[] = [];
    const free: FreeRect[] = [{ x: mat.trimLeft, y: mat.trimTop, w: uw, h: uh }];

    let progress = true;
    while (progress && rem.length > 0) {
      progress = false;
      let bpi = -1, bri = -1, bs = Infinity, brot = false;

      for (let i = 0; i < rem.length; i++) {
        const p = rem[i];
        const pw = p.cutWidth, ph = p.cutHeight;
        const rot = canRotate(p, mat, cfg);

        for (let r = 0; r < free.length; r++) {
          const rc = free[r];
          if (pw <= rc.w && ph <= rc.h) {
            const s = scoreRect(rc, pw, ph, heuristic);
            if (s < bs) { bs = s; bpi = i; bri = r; brot = false; }
          }
          if (rot && ph <= rc.w && pw <= rc.h) {
            const s = scoreRect(rc, ph, pw, heuristic);
            if (s < bs) { bs = s; bpi = i; bri = r; brot = true; }
          }
        }
      }

      if (bpi >= 0 && bri >= 0) {
        const p = rem[bpi];
        const rc = free[bri];
        const fw = brot ? p.cutHeight : p.cutWidth;
        const fh = brot ? p.cutWidth : p.cutHeight;
        placed.push(mkPP(p, rc.x, rc.y, brot));
        rem.splice(bpi, 1);
        splitFree(free, { x: rc.x, y: rc.y, w: fw + kerf, h: fh + kerf });
        pruneFree(free);
        progress = true;
      }
    }

    if (placed.length === 0 && rem.length > 0) { rem.shift(); continue; }
    if (placed.length > 0) plans.push(mkPlan(placed, [], mat, uw, uh));
  }
  return plans;
}

// ═══════════════════════════════════════════════════════════
// MAXRECTS SPLIT & PRUNE
// ═══════════════════════════════════════════════════════════

function splitFree(free: FreeRect[], used: FreeRect): void {
  for (let i = free.length - 1; i >= 0; i--) {
    const f = free[i];
    if (used.x >= f.x + f.w || used.x + used.w <= f.x ||
        used.y >= f.y + f.h || used.y + used.h <= f.y) continue;
    free.splice(i, 1);
    if (used.x > f.x) free.push({ x: f.x, y: f.y, w: used.x - f.x, h: f.h });
    if (used.x + used.w < f.x + f.w) free.push({ x: used.x + used.w, y: f.y, w: (f.x + f.w) - (used.x + used.w), h: f.h });
    if (used.y > f.y) free.push({ x: f.x, y: f.y, w: f.w, h: used.y - f.y });
    if (used.y + used.h < f.y + f.h) free.push({ x: f.x, y: used.y + used.h, w: f.w, h: (f.y + f.h) - (used.y + used.h) });
  }
}

function pruneFree(free: FreeRect[]): void {
  for (let i = free.length - 1; i >= 0; i--) {
    for (let j = 0; j < free.length; j++) {
      if (i === j) continue;
      const a = free[i], b = free[j];
      if (a.x >= b.x && a.y >= b.y && a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h) {
        free.splice(i, 1); break;
      }
    }
  }
}

// ═══════════════════════════════════════════════════════════
// HELPER CONSTRUCTORS
// ═══════════════════════════════════════════════════════════

function mkPP(p: ProcessedPiece, x: number, y: number, rotated: boolean): PlacedPiece {
  return {
    pieceId: p.id, code: p.code, x, y,
    width: rotated ? p.cutHeight : p.cutWidth,
    height: rotated ? p.cutWidth : p.cutHeight,
    rotated, originalWidth: p.originalWidth, originalHeight: p.originalHeight,
    grainDirection: p.grainDirection, description: p.description,
    description2: p.description2, material: p.material, sequence: p.sequence,
    edgeBandTop: p.edgeBandTop, edgeBandBottom: p.edgeBandBottom,
    edgeBandLeft: p.edgeBandLeft, edgeBandRight: p.edgeBandRight,
    quantity: p.quantity,
  };
}

function mkPlan(
  placed: PlacedPiece[], cuts: CutInstruction[],
  mat: Material, uw: number, uh: number,
): CuttingPlan {
  const usedArea = placed.reduce((s, p) => s + p.width * p.height, 0);
  const usableArea = uw * uh;
  const scraps = calcScraps(placed, mat, uw, uh);
  return {
    planId: generateId(), materialCode: mat.code,
    sheetWidth: mat.sheetWidth, sheetHeight: mat.sheetHeight,
    stackCount: 1, sheetsPerLoad: 1, machineLoads: 1,
    pieces: placed, scraps, cuts, usableArea, usedArea,
    wasteArea: usableArea - usedArea,
    utilizationPercent: usableArea > 0 ? (usedArea / usableArea) * 100 : 0,
    totalCuts: cuts.length + placed.length,
  };
}

function calcScraps(
  placed: PlacedPiece[], mat: Material, uw: number, uh: number,
): ScrapRect[] {
  const scraps: ScrapRect[] = [];
  if (placed.length === 0) return scraps;
  const mx = Math.max(...placed.map(p => p.x + p.width));
  const my = Math.max(...placed.map(p => p.y + p.height));
  const sr = mat.trimLeft + uw;
  const sb = mat.trimTop + uh;
  const rw = sr - mx, bh = sb - my;
  if (rw > 1) scraps.push({ x: mx, y: mat.trimTop, width: rw, height: uh, usable: rw >= mat.minScrapWidth && uh >= mat.minScrapHeight });
  if (bh > 1) scraps.push({ x: mat.trimLeft, y: my, width: mx - mat.trimLeft, height: bh, usable: (mx - mat.trimLeft) >= mat.minScrapWidth && bh >= mat.minScrapHeight });
  return scraps;
}
