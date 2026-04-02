// ═══════════════════════════════════════════════════════════
// OPTIMIZER WEB WORKER v2 — Major quality improvements
// Runs entirely off the main thread.
// ═══════════════════════════════════════════════════════════

import type {
  Piece, Material, EdgeBand, OptimizationConfig,
  OptimizationResult, CuttingPlan, PlacedPiece, ScrapRect, CutInstruction,
  GrainDirection,
} from '@/types';

// ─── Inline generateId ───────────────────────────────────
function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxx-xxxx-xxxx'.replace(/x/g, () => Math.floor(Math.random() * 16).toString(16));
}

// ─── Message types ────────────────────────────────────────
interface WorkerInput { type: 'run'; pieces: Piece[]; materials: Material[]; edgeBands: EdgeBand[]; config: OptimizationConfig; }
interface WorkerProgressMsg { type: 'progress'; pct: number; detail: string; }
interface WorkerResultMsg { type: 'result'; data: OptimizationResult; }
interface WorkerErrorMsg { type: 'error'; message: string; }
export type WorkerOutMsg = WorkerProgressMsg | WorkerResultMsg | WorkerErrorMsg;

// ─── Internal types ───────────────────────────────────────
interface PP {
  id: string; code: string; material: string;
  cw: number; ch: number; ow: number; oh: number;
  grain: GrainDirection; qty: number; seq: number | null;
  desc: string; desc2: string;
  eT: string; eB: string; eL: string; eR: string;
  area: number; maxD: number; minD: number; perim: number;
}
interface FR { x: number; y: number; w: number; h: number; }
type SortFn = (a: PP, b: PP) => number;
type Heuristic = 'BSSF' | 'BLSF' | 'BAF' | 'BLTC' | 'BL' | 'CP';

// ─── Rotation helper ──────────────────────────────────────
function canRot(p: PP, mat: Material, cfg: OptimizationConfig): boolean {
  if (!cfg.allowRotation) return false;
  return p.grain === 'none' || mat.grainDirection === 'none';
}

// ─── Sort strategies ──────────────────────────────────────
const SORTS: SortFn[] = [
  (a, b) => b.area - a.area,
  (a, b) => b.maxD - a.maxD || b.area - a.area,
  (a, b) => b.ch - a.ch || b.cw - a.cw,
  (a, b) => b.cw - a.cw || b.ch - a.ch,
  (a, b) => b.perim - a.perim || b.area - a.area,
  (a, b) => b.minD - a.minD || b.area - a.area,
];

const ADV_SORTS: SortFn[] = [
  ...SORTS,
  (a, b) => (b.maxD / b.minD) - (a.maxD / a.minD) || b.area - a.area,
  (a, b) => a.area - b.area,
  (a, b) => a.cw - b.cw || b.ch - a.ch,
  (a, b) => a.ch - b.ch || a.cw - b.cw,
  (a, b) => (a.maxD - a.minD) - (b.maxD - b.minD) || b.area - a.area,
  (a, b) => (b.cw + b.ch * 1.5) - (a.cw + a.ch * 1.5),
  (a, b) => a.perim - b.perim || a.area - b.area,
  (a, b) => (b.cw * 2 + b.ch) - (a.cw * 2 + a.ch),
  (a, b) => (b.ch * 2 + b.cw) - (a.ch * 2 + a.cw),
];

// ─── Heuristic scoring ───────────────────────────────────
function scoreR(r: FR, pw: number, ph: number, h: Heuristic): number {
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

// ─── Progress ─────────────────────────────────────────────
function reportProgress(pct: number, detail: string = ''): void {
  self.postMessage({ type: 'progress', pct, detail } satisfies WorkerProgressMsg);
}

// ═══════════════════════════════════════════════════════════
// MAIN OPTIMIZATION
// ═══════════════════════════════════════════════════════════
function runOptimization(pieces: Piece[], materials: Material[], edgeBands: EdgeBand[], config: OptimizationConfig): OptimizationResult {
  const startTime = performance.now();
  reportProgress(2, '');
  const processed = preProcess(pieces, edgeBands);

  const byMaterial = new Map<string, PP[]>();
  for (const p of processed) {
    const g = byMaterial.get(p.material) || [];
    g.push(p);
    byMaterial.set(p.material, g);
  }

  const allPlans: CuttingPlan[] = [];
  let matIdx = 0;
  const totalMats = byMaterial.size;

  for (const [matCode, matPieces] of byMaterial) {
    const mat = materials.find(m => m.code === matCode);
    if (!mat) continue;
    reportProgress(5 + Math.round((matIdx / totalMats) * 85), matCode);

    const expanded: PP[] = [];
    for (const p of matPieces)
      for (let i = 0; i < p.qty; i++)
        expanded.push({ ...p, qty: 1, id: p.id + (i > 0 ? '_' + i : '') });

    const uw = mat.sheetWidth - mat.trimLeft - mat.trimRight;
    const uh = mat.sheetHeight - mat.trimTop - mat.trimBottom;
    const best: { plans: CuttingPlan[] | null; score: number } = { plans: null, score: -Infinity };

    const tryAccept = (plans: CuttingPlan[]) => {
      if (!plans || plans.length === 0) return;
      const s = scorePlans(plans, uw, uh);
      if (s > best.score) { best.score = s; best.plans = plans; }
    };

    if (config.advancedMode) {
      // Generous budget since we're in a Worker — won't freeze UI
      const budget = Math.min(6000, Math.max(1500, expanded.length * 8));
      const phaseStart = performance.now();
      const deadline = phaseStart + budget;
      const strategies = ADV_SORTS;
      const heurs = config.mode === 'freeform' ? ALL_H : ALL_H; // try all even in guillotine
      // Time checkpoints as absolute timestamps
      const t35 = phaseStart + budget * 0.35;
      const t50 = phaseStart + budget * 0.50;

      // Phase 1: exhaustive sort × heuristic × algorithm
      for (const sf of strategies) {
        if (performance.now() > t35) break;
        const sorted = [...expanded].sort(sf);
        // Guillotine
        tryAccept(shelfGuillotine(sorted, mat, uw, uh, config));
        // MaxRects with multiple heuristics
        for (const h of heurs) {
          if (performance.now() > t35) break;
          tryAccept(maxRectsPlace(sorted, mat, uw, uh, config, h));
        }
      }

      // Phase 2: repack from best — try to consolidate
      if (best.plans && best.plans.length > 1) {
        const repacked = best.plans.flatMap(p => p.pieces).map(pp => fromPlaced(pp));
        for (const sf of strategies) {
          if (performance.now() > t50) break;
          const sorted = [...repacked].sort(sf);
          tryAccept(shelfGuillotine(sorted, mat, uw, uh, config));
          for (const h of heurs) {
            if (performance.now() > t50) break;
            tryAccept(maxRectsPlace(sorted, mat, uw, uh, config, h));
          }
        }
      }

      // Phase 3: iterated greedy with simulated annealing acceptance
      if (best.plans) {
        tryAccept(iteratedGreedy(best.plans, mat, uw, uh, config, deadline));
      }

      // Phase 4: per-sheet re-opt
      if (best.plans) {
        best.plans = reoptPerSheet(best.plans, mat, uw, uh, config, deadline);
      }

      // Phase 5: try reducing sheet count
      if (best.plans && best.plans.length > 1) {
        best.plans = tryReduceSheets(best.plans, mat, uw, uh, config, deadline);
      }

      // Phase 6: last-sheet optimization — try stealing pieces from last sheet into earlier ones
      if (best.plans && best.plans.length > 1) {
        best.plans = optimizeLastSheet(best.plans, mat, uw, uh, config);
      }

    } else {
      // ═══ FAST MODE — still uses good algorithms ═════
      for (const sf of SORTS) {
        const sorted = [...expanded].sort(sf);
        tryAccept(shelfGuillotine(sorted, mat, uw, uh, config));
        tryAccept(maxRectsPlace(sorted, mat, uw, uh, config, 'BSSF'));
        tryAccept(maxRectsPlace(sorted, mat, uw, uh, config, 'BL'));
      }
    }

    if (best.plans) {
      for (const plan of best.plans) {
        if (config.maxStackThickness > 0 && mat.thickness > 0)
          plan.sheetsPerLoad = Math.max(1, Math.floor(config.maxStackThickness / mat.thickness));
      }
      allPlans.push(...best.plans);
    }
    matIdx++;
    reportProgress(5 + Math.round((matIdx / totalMats) * 85));
  }

  const deduped = deduplicatePlans(allPlans, config);
  for (const plan of deduped)
    plan.pieces.sort((a, b) => {
      if (a.sequence !== null && b.sequence !== null) return a.sequence - b.sequence;
      if (a.sequence !== null) return -1;
      if (b.sequence !== null) return 1;
      return 0;
    });

  reportProgress(95);
  const totalUsedArea = deduped.reduce((s, p) => s + p.usedArea * p.stackCount, 0);
  const totalSheetArea = deduped.reduce((s, p) => s + p.sheetWidth * p.sheetHeight * p.stackCount, 0);
  const totalUsableScrapArea = deduped.reduce((s, p) => s + p.scraps.filter(sc => sc.usable).reduce((a, sc) => a + sc.width * sc.height, 0) * p.stackCount, 0);
  const totalWasteArea = deduped.reduce((s, p) => s + p.scraps.filter(sc => !sc.usable).reduce((a, sc) => a + sc.width * sc.height, 0) * p.stackCount, 0);

  const result: OptimizationResult = {
    plans: deduped,
    totalSheets: deduped.length,
    totalStackedSheets: deduped.reduce((s, p) => s + p.stackCount, 0),
    totalPieces: deduped.reduce((s, p) => s + p.pieces.length * p.stackCount, 0),
    globalUtilization: totalSheetArea > 0 ? (totalUsedArea / totalSheetArea) * 100 : 0,
    totalUsableScrap: deduped.reduce((s, p) => s + p.scraps.filter(sc => sc.usable).length, 0),
    totalWaste: deduped.reduce((s, p) => s + p.scraps.filter(sc => !sc.usable).length, 0),
    totalUsableScrapArea, totalWasteArea,
    totalMachineLoads: deduped.reduce((s, p) => s + p.machineLoads, 0),
    computeTimeMs: performance.now() - startTime,
    timestamp: new Date().toISOString(),
  };
  reportProgress(100);
  return result;
}

// ═══════════════════════════════════════════════════════════
// SCORING — better metric that rewards tight packing
// ═══════════════════════════════════════════════════════════
function scorePlans(plans: CuttingPlan[], uw: number, uh: number): number {
  if (plans.length === 0) return -Infinity;
  const totalUsed = plans.reduce((s, p) => s + p.usedArea, 0);
  const sheetArea = uw * uh;
  const totalArea = plans.length * sheetArea;
  const util = totalArea > 0 ? totalUsed / totalArea : 0;
  const totalPieces = plans.reduce((s, p) => s + p.pieces.length, 0);

  // Compactness: how tightly pieces fill the bounding box
  let compact = 0;
  for (const plan of plans) {
    if (plan.pieces.length === 0) continue;
    const mx = Math.max(...plan.pieces.map(p => p.x + p.width));
    const my = Math.max(...plan.pieces.map(p => p.y + p.height));
    const ba = mx * my;
    if (ba > 0) compact += plan.usedArea / ba;
  }
  compact /= plans.length;

  // Heavy penalty for number of sheets
  const sheetPenalty = plans.length * 120;

  // Extra penalty for sparse last sheet
  let lastPenalty = 0;
  if (plans.length > 1) {
    const last = plans[plans.length - 1];
    const lu = sheetArea > 0 ? last.usedArea / sheetArea : 0;
    if (lu < 0.4) lastPenalty = (0.4 - lu) * 200;
  }

  return util * 1500 + compact * 300 + totalPieces * 0.05 - sheetPenalty - lastPenalty;
}

// ═══════════════════════════════════════════════════════════
// DEDUPLICATION
// ═══════════════════════════════════════════════════════════
function planSig(plan: CuttingPlan): string {
  return plan.pieces.map(p => `${p.code}:${Math.round(p.x)}:${Math.round(p.y)}:${Math.round(p.width)}x${Math.round(p.height)}:${p.rotated ? 1 : 0}`).sort().join('|');
}

function deduplicatePlans(plans: CuttingPlan[], config: OptimizationConfig): CuttingPlan[] {
  // Always deduplicate identical layouts — stacking is always beneficial
  const groups = new Map<string, { plan: CuttingPlan; count: number }>();
  for (const plan of plans) {
    const key = plan.materialCode + '::' + planSig(plan);
    const ex = groups.get(key);
    if (ex) ex.count++; else groups.set(key, { plan, count: 1 });
  }
  const result: CuttingPlan[] = [];
  for (const { plan, count } of groups.values()) {
    const spl = plan.sheetsPerLoad || 1;
    const loads = config.maxStackThickness > 0 ? Math.ceil(count / spl) : count;
    result.push({ ...plan, stackCount: count, sheetsPerLoad: spl, machineLoads: loads });
  }
  return result;
}

// ═══════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════
function fromPlaced(pp: PlacedPiece): PP {
  const cw = pp.rotated ? pp.height : pp.width;
  const ch = pp.rotated ? pp.width : pp.height;
  return {
    id: pp.pieceId, code: pp.code, material: pp.material,
    cw, ch, ow: pp.originalWidth, oh: pp.originalHeight,
    grain: pp.grainDirection, qty: 1, seq: pp.sequence,
    desc: pp.description, desc2: pp.description2,
    eT: pp.edgeBandTop, eB: pp.edgeBandBottom, eL: pp.edgeBandLeft, eR: pp.edgeBandRight,
    area: cw * ch, maxD: Math.max(cw, ch), minD: Math.min(cw, ch), perim: 2 * (cw + ch),
  };
}

function preProcess(pieces: Piece[], edgeBands: EdgeBand[]): PP[] {
  const ebMap = new Map(edgeBands.map(eb => [eb.code, eb]));
  return pieces.map(p => {
    let addW = 0, addH = 0;
    const ebL = ebMap.get(p.edgeBandLeft); const ebR = ebMap.get(p.edgeBandRight);
    const ebT = ebMap.get(p.edgeBandTop); const ebB = ebMap.get(p.edgeBandBottom);
    if (ebL) addW += ebL.supplementaryIncrease; if (ebR) addW += ebR.supplementaryIncrease;
    if (ebT) addH += ebT.supplementaryIncrease; if (ebB) addH += ebB.supplementaryIncrease;
    const cw = p.width + addW, ch = p.height + addH;
    return {
      id: p.id, code: p.code, material: p.material, cw, ch,
      ow: p.width, oh: p.height, grain: p.grainDirection, qty: p.quantity,
      seq: p.sequence, desc: p.description, desc2: p.description2,
      eT: p.edgeBandTop, eB: p.edgeBandBottom, eL: p.edgeBandLeft, eR: p.edgeBandRight,
      area: cw * ch, maxD: Math.max(cw, ch), minD: Math.min(cw, ch), perim: 2 * (cw + ch),
    };
  });
}

function mkPP(p: PP, x: number, y: number, rotated: boolean): PlacedPiece {
  return {
    pieceId: p.id, code: p.code, x, y,
    width: rotated ? p.ch : p.cw, height: rotated ? p.cw : p.ch,
    rotated, originalWidth: p.ow, originalHeight: p.oh,
    grainDirection: p.grain, description: p.desc, description2: p.desc2,
    material: p.material, sequence: p.seq, quantity: p.qty,
    edgeBandTop: p.eT, edgeBandBottom: p.eB, edgeBandLeft: p.eL, edgeBandRight: p.eR,
  };
}

function mkPlan(placed: PlacedPiece[], cuts: CutInstruction[], mat: Material, uw: number, uh: number): CuttingPlan {
  const usedArea = placed.reduce((s, p) => s + p.width * p.height, 0);
  const usableArea = uw * uh;
  return {
    planId: generateId(), materialCode: mat.code,
    sheetWidth: mat.sheetWidth, sheetHeight: mat.sheetHeight,
    stackCount: 1, sheetsPerLoad: 1, machineLoads: 1,
    pieces: placed, scraps: calcScraps(placed, mat, uw, uh), cuts, usableArea, usedArea,
    wasteArea: usableArea - usedArea,
    utilizationPercent: usableArea > 0 ? (usedArea / usableArea) * 100 : 0,
    totalCuts: cuts.length + placed.length,
  };
}

function calcScraps(placed: PlacedPiece[], mat: Material, uw: number, uh: number): ScrapRect[] {
  if (placed.length === 0) return [];
  const scraps: ScrapRect[] = [];
  const mx = Math.max(...placed.map(p => p.x + p.width));
  const my = Math.max(...placed.map(p => p.y + p.height));
  const sr = mat.trimLeft + uw, sb = mat.trimTop + uh;
  const rw = sr - mx, bh = sb - my;
  if (rw > 1) scraps.push({ x: mx, y: mat.trimTop, width: rw, height: uh, usable: rw >= mat.minScrapWidth && uh >= mat.minScrapHeight });
  if (bh > 1) scraps.push({ x: mat.trimLeft, y: my, width: mx - mat.trimLeft, height: bh, usable: (mx - mat.trimLeft) >= mat.minScrapWidth && bh >= mat.minScrapHeight });
  return scraps;
}

// ═══════════════════════════════════════════════════════════
// SHELF GUILLOTINE — Proper strip-based with best-fit filling
// ═══════════════════════════════════════════════════════════
function shelfGuillotine(pieces: PP[], mat: Material, uw: number, uh: number, cfg: OptimizationConfig): CuttingPlan[] {
  const plans: CuttingPlan[] = [];
  const rem = [...pieces];
  const kerf = cfg.bladeThickness;

  while (rem.length > 0) {
    const placed: PlacedPiece[] = [];
    const cuts: CutInstruction[] = [];
    let curY = mat.trimTop;

    while (curY + 1 < mat.trimTop + uh && rem.length > 0) {
      const availH = mat.trimTop + uh - curY;
      if (availH < 1) break;

      // Find best piece to start a new shelf (tallest that fits, maximize strip usage)
      let bestIdx = -1, bestH = 0, bestRot = false;
      for (let i = 0; i < rem.length; i++) {
        const p = rem[i];
        if (p.ch <= availH && p.cw <= uw && p.ch > bestH) { bestH = p.ch; bestIdx = i; bestRot = false; }
        if (canRot(p, mat, cfg) && p.cw <= availH && p.ch <= uw && p.cw > bestH) { bestH = p.cw; bestIdx = i; bestRot = true; }
      }
      if (bestIdx < 0) break;

      const stripH = bestH;
      const anchor = rem[bestIdx];
      const ancW = bestRot ? anchor.ch : anchor.cw;
      placed.push(mkPP(anchor, mat.trimLeft, curY, bestRot));
      rem.splice(bestIdx, 1);
      let curX = mat.trimLeft + ancW + kerf;

      // Fill the strip: best-area-fit
      let filling = true;
      while (filling && curX + 1 < mat.trimLeft + uw && rem.length > 0) {
        filling = false;
        const space = mat.trimLeft + uw - curX;
        let fi = -1, fa = 0, fr = false, fw = 0;
        for (let i = 0; i < rem.length; i++) {
          const p = rem[i];
          if (p.cw <= space && p.ch <= stripH && p.area > fa) { fa = p.area; fi = i; fr = false; fw = p.cw; }
          if (canRot(p, mat, cfg) && p.ch <= space && p.cw <= stripH && p.area > fa) { fa = p.area; fi = i; fr = true; fw = p.ch; }
        }
        if (fi >= 0) {
          placed.push(mkPP(rem[fi], curX, curY, fr));
          rem.splice(fi, 1);
          curX += fw + kerf;
          filling = true;
        }
      }

      // Try to fill remaining height gap above this strip with smaller pieces
      const subY = curY + stripH + kerf;
      const subAvailH = availH - stripH - kerf;
      if (subAvailH >= 10) { // only if there's meaningful space
        let subX = mat.trimLeft;
        let subFilling = true;
        while (subFilling && subX + 1 < mat.trimLeft + uw && rem.length > 0) {
          subFilling = false;
          const sSpace = mat.trimLeft + uw - subX;
          let si = -1, sa = 0, sr = false, sw = 0;
          for (let i = 0; i < rem.length; i++) {
            const p = rem[i];
            if (p.cw <= sSpace && p.ch <= subAvailH && p.area > sa) { sa = p.area; si = i; sr = false; sw = p.cw; }
            if (canRot(p, mat, cfg) && p.ch <= sSpace && p.cw <= subAvailH && p.area > sa) { sa = p.area; si = i; sr = true; sw = p.ch; }
          }
          if (si >= 0) {
            placed.push(mkPP(rem[si], subX, subY, sr));
            rem.splice(si, 1);
            subX += sw + kerf;
            subFilling = true;
          }
        }
      }

      // Advance curY past all placed pieces in this shelf area
      if (placed.length > 0) {
        curY = Math.max(...placed.map(p => p.y + p.height)) + kerf;
      } else {
        break;
      }
    }

    if (placed.length === 0 && rem.length > 0) { rem.shift(); continue; }
    if (placed.length > 0) plans.push(mkPlan(placed, cuts, mat, uw, uh));
  }
  return plans;
}

// ═══════════════════════════════════════════════════════════
// MAXRECTS PLACEMENT — with improved split rule
// ═══════════════════════════════════════════════════════════
function maxRectsPlace(pieces: PP[], mat: Material, uw: number, uh: number, cfg: OptimizationConfig, heuristic: Heuristic): CuttingPlan[] {
  const plans: CuttingPlan[] = [];
  const rem = [...pieces];
  const kerf = cfg.bladeThickness;

  while (rem.length > 0) {
    const placed: PlacedPiece[] = [];
    const free: FR[] = [{ x: mat.trimLeft, y: mat.trimTop, w: uw, h: uh }];

    let progress = true;
    while (progress && rem.length > 0) {
      progress = false;
      let bpi = -1, bri = -1, bs = Infinity, brot = false;

      for (let i = 0; i < rem.length; i++) {
        const p = rem[i];
        const pw = p.cw, ph = p.ch;
        const rot = canRot(p, mat, cfg);
        for (let r = 0; r < free.length; r++) {
          const rc = free[r];
          if (pw <= rc.w && ph <= rc.h) {
            const s = scoreR(rc, pw, ph, heuristic);
            if (s < bs) { bs = s; bpi = i; bri = r; brot = false; }
          }
          if (rot && ph <= rc.w && pw <= rc.h) {
            const s = scoreR(rc, ph, pw, heuristic);
            if (s < bs) { bs = s; bpi = i; bri = r; brot = true; }
          }
        }
      }

      if (bpi >= 0 && bri >= 0) {
        const p = rem[bpi];
        const rc = free[bri];
        const fw = brot ? p.ch : p.cw;
        const fh = brot ? p.cw : p.ch;
        placed.push(mkPP(p, rc.x, rc.y, brot));
        rem.splice(bpi, 1);
        // Shorter-leftover-fit split
        splitFreeSSF(free, { x: rc.x, y: rc.y, w: fw + kerf, h: fh + kerf }, fw, fh);
        pruneFree(free);
        progress = true;
      }
    }

    if (placed.length === 0 && rem.length > 0) { rem.shift(); continue; }
    if (placed.length > 0) plans.push(mkPlan(placed, [], mat, uw, uh));
  }
  return plans;
}

// Shorter-Side-Fit split — splits free rects along the axis that
// leaves the *shorter* leftover, producing more usable sub-rects
function splitFreeSSF(free: FR[], used: FR, pw: number, ph: number): void {
  for (let i = free.length - 1; i >= 0; i--) {
    const f = free[i];
    if (used.x >= f.x + f.w || used.x + used.w <= f.x ||
        used.y >= f.y + f.h || used.y + used.h <= f.y) continue;
    free.splice(i, 1);

    // Right side
    const rW = (f.x + f.w) - (used.x + used.w);
    // Bottom side
    const bH = (f.y + f.h) - (used.y + used.h);
    // Left side
    const lW = used.x - f.x;
    // Top side
    const tH = used.y - f.y;

    // Horizontal and vertical split choices for the large remainder
    if (rW > 0) {
      // Shorter leftover: extend right rect full height or only placed height?
      if (bH > rW) {
        // Bottom is bigger leftover → give bottom full width, right gets only placed height
        free.push({ x: used.x + used.w, y: f.y, w: rW, h: used.y + used.h - f.y });
      } else {
        // Right is bigger → give right full height
        free.push({ x: used.x + used.w, y: f.y, w: rW, h: f.h });
      }
    }
    if (bH > 0) {
      if (bH > rW) {
        // Bottom full width
        free.push({ x: f.x, y: used.y + used.h, w: f.w, h: bH });
      } else {
        free.push({ x: f.x, y: used.y + used.h, w: used.x + used.w - f.x, h: bH });
      }
    }
    if (lW > 0) free.push({ x: f.x, y: f.y, w: lW, h: f.h });
    if (tH > 0) free.push({ x: f.x, y: f.y, w: f.w, h: tH });
  }
}

function pruneFree(free: FR[]): void {
  for (let i = free.length - 1; i >= 0; i--) {
    if (free[i].w < 1 || free[i].h < 1) { free.splice(i, 1); continue; }
    for (let j = 0; j < free.length; j++) {
      if (i === j || i >= free.length) continue;
      const a = free[i], b = free[j];
      if (a.x >= b.x && a.y >= b.y && a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h) {
        free.splice(i, 1); break;
      }
    }
  }
}

// ═══════════════════════════════════════════════════════════
// ITERATED GREEDY — with simulated annealing acceptance
// ═══════════════════════════════════════════════════════════
function iteratedGreedy(initial: CuttingPlan[], mat: Material, uw: number, uh: number, cfg: OptimizationConfig, deadline: number): CuttingPlan[] {
  let best = initial;
  let bestScore = scorePlans(best, uw, uh);
  let current = best;
  let currentScore = bestScore;
  const heurs = ALL_H;
  let iter = 0;
  const startTemp = 50;
  const igStart = performance.now();
  const igBudget = deadline - igStart; // remaining time from now to deadline
  const igEnd = igStart + igBudget * 0.82; // use 82% of remaining budget

  while (performance.now() < igEnd) {
    iter++;
    const elapsed = (performance.now() - igStart) / Math.max(1, igBudget);
    const temp = startTemp * Math.max(0.01, 1 - elapsed);

    // Adaptive destruction rate — starts small, grows
    const rate = 0.10 + Math.random() * 0.30;
    const all = current.flatMap(p => p.pieces);
    if (all.length === 0) break;
    const n = Math.max(1, Math.floor(all.length * rate));
    const shuffled = [...all].sort(() => Math.random() - 0.5);
    const kept = shuffled.slice(n).map(pp => fromPlaced(pp));
    const removed = shuffled.slice(0, n).map(pp => fromPlaced(pp));

    const sf = ADV_SORTS[iter % ADV_SORTS.length];
    const h = heurs[iter % heurs.length];

    // Repair: interleave kept and removed with sort
    const repair = [...kept, ...removed].sort(sf);
    const plans = iter % 3 === 0
      ? shelfGuillotine(repair, mat, uw, uh, cfg)
      : maxRectsPlace(repair, mat, uw, uh, cfg, h);

    const s = scorePlans(plans, uw, uh);

    // SA acceptance
    const delta = s - currentScore;
    if (delta > 0 || Math.random() < Math.exp(delta / Math.max(temp, 0.1))) {
      current = plans;
      currentScore = s;
    }
    if (s > bestScore) { bestScore = s; best = plans; }
  }
  return best;
}

// ═══════════════════════════════════════════════════════════
// BIN REDUCTION — try to pack into fewer sheets
// ═══════════════════════════════════════════════════════════
function tryReduceSheets(plans: CuttingPlan[], mat: Material, uw: number, uh: number, cfg: OptimizationConfig, deadline: number): CuttingPlan[] {
  let best = [...plans];
  let bestScore = scorePlans(best, uw, uh);
  const all = best.flatMap(p => p.pieces.map(pp => fromPlaced(pp)));
  const heurs = ALL_H;

  for (const sf of ADV_SORTS) {
    if (performance.now() > deadline) break;
    const sorted = [...all].sort(sf);
    for (const h of heurs) {
      if (performance.now() > deadline) break;
      const np = maxRectsPlace(sorted, mat, uw, uh, cfg, h);
      const ns = scorePlans(np, uw, uh);
      if (np.length < best.length || (np.length === best.length && ns > bestScore)) {
        best = np; bestScore = ns;
      }
    }
    // Also try guillotine
    const gp = shelfGuillotine(sorted, mat, uw, uh, cfg);
    const gs = scorePlans(gp, uw, uh);
    if (gp.length < best.length || (gp.length === best.length && gs > bestScore)) {
      best = gp; bestScore = gs;
    }
  }
  return best;
}

// ═══════════════════════════════════════════════════════════
// PER-SHEET RE-OPTIMIZATION
// ═══════════════════════════════════════════════════════════
function reoptPerSheet(plans: CuttingPlan[], mat: Material, uw: number, uh: number, cfg: OptimizationConfig, deadline: number): CuttingPlan[] {
  const result: CuttingPlan[] = [];
  for (const plan of plans) {
    if (performance.now() > deadline) { result.push(plan); continue; }
    const pcs = plan.pieces.map(pp => fromPlaced(pp));
    let bp = plan, bu = plan.utilizationPercent;
    for (const h of ALL_H) {
      for (const sf of ADV_SORTS) {
        if (performance.now() > deadline) break;
        const sorted = [...pcs].sort(sf);
        const np = maxRectsPlace(sorted, mat, uw, uh, cfg, h);
        if (np.length === 1 && np[0].pieces.length === pcs.length && np[0].utilizationPercent > bu) {
          bu = np[0].utilizationPercent; bp = np[0];
        }
      }
    }
    // Also try guillotine
    for (const sf of ADV_SORTS) {
      if (performance.now() > deadline) break;
      const np = shelfGuillotine([...pcs].sort(sf), mat, uw, uh, cfg);
      if (np.length === 1 && np[0].pieces.length === pcs.length && np[0].utilizationPercent > bu) {
        bu = np[0].utilizationPercent; bp = np[0];
      }
    }
    result.push(bp);
  }
  return result;
}

// ═══════════════════════════════════════════════════════════
// LAST-SHEET OPTIMIZATION — try to redistribute last sheet
// pieces into earlier sheets to reduce waste
// ═══════════════════════════════════════════════════════════
function optimizeLastSheet(plans: CuttingPlan[], mat: Material, uw: number, uh: number, cfg: OptimizationConfig): CuttingPlan[] {
  if (plans.length < 2) return plans;

  const last = plans[plans.length - 1];
  const lastUtil = (uw * uh) > 0 ? last.usedArea / (uw * uh) : 1;
  if (lastUtil > 0.5) return plans; // Last sheet is already reasonably full

  // Try to fit last-sheet pieces into earlier sheets via maxrects
  const lastPieces = last.pieces.map(pp => fromPlaced(pp));
  const otherPlans = plans.slice(0, -1);

  // For each earlier sheet, try to add pieces from last sheet
  const remaining = [...lastPieces];
  const newPlans: CuttingPlan[] = [];

  for (const plan of otherPlans) {
    const planPieces = plan.pieces.map(pp => fromPlaced(pp));
    const extras: PP[] = [];

    // Try adding remaining pieces one by one
    for (let i = remaining.length - 1; i >= 0; i--) {
      const candidate = [...planPieces, ...extras, remaining[i]];
      // Can they all fit in one sheet?
      let fits = false;
      for (const h of ALL_H) {
        const np = maxRectsPlace(candidate, mat, uw, uh, cfg, h);
        if (np.length === 1 && np[0].pieces.length === candidate.length) {
          fits = true; break;
        }
      }
      if (fits) {
        extras.push(remaining[i]);
        remaining.splice(i, 1);
      }
    }

    // Re-optimize this sheet with extras
    if (extras.length > 0) {
      const combined = [...planPieces, ...extras];
      let bestPlan = plan;
      let bestUtil = plan.utilizationPercent;
      for (const h of ALL_H) {
        for (const sf of SORTS) {
          const np = maxRectsPlace([...combined].sort(sf), mat, uw, uh, cfg, h);
          if (np.length === 1 && np[0].pieces.length === combined.length && np[0].utilizationPercent > bestUtil) {
            bestUtil = np[0].utilizationPercent; bestPlan = np[0];
          }
        }
      }
      newPlans.push(bestPlan);
    } else {
      newPlans.push(plan);
    }
  }

  // If all last-sheet pieces were absorbed, skip the last sheet entirely
  if (remaining.length === 0) {
    return newPlans;
  }

  // Otherwise, make a new last sheet with what's left
  let bestLast: CuttingPlan | null = null;
  let bestLastUtil = 0;
  for (const h of ALL_H) {
    for (const sf of SORTS) {
      const np = maxRectsPlace([...remaining].sort(sf), mat, uw, uh, cfg, h);
      if (np.length >= 1 && np[0].utilizationPercent > bestLastUtil) {
        bestLastUtil = np[0].utilizationPercent;
        bestLast = np[0];
      }
    }
  }
  if (bestLast) newPlans.push(bestLast);
  if (remaining.length > 1) {
    // Some pieces might need extra sheets
    for (const sf of SORTS) {
      const np = maxRectsPlace([...remaining].sort(sf), mat, uw, uh, cfg, 'BSSF');
      if (np.length >= 1) {
        // Replace last with all needed sheets
        newPlans.splice(newPlans.length - 1, 1, ...np);
        break;
      }
    }
  }

  // Only use new plan if it's actually better
  const origScore = scorePlans(plans, uw, uh);
  const newScore = scorePlans(newPlans, uw, uh);
  return newScore > origScore ? newPlans : plans;
}

// ═══════════════════════════════════════════════════════════
// WORKER MESSAGE HANDLER
// ═══════════════════════════════════════════════════════════
self.onmessage = (e: MessageEvent<WorkerInput>) => {
  const { pieces, materials, edgeBands, config } = e.data;
  try {
    const result = runOptimization(pieces, materials, edgeBands, config);
    self.postMessage({ type: 'result', data: result } satisfies WorkerResultMsg);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown optimization error';
    self.postMessage({ type: 'error', message: msg } satisfies WorkerErrorMsg);
  }
};
