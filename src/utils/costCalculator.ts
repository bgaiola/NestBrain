import { Material, EdgeBand, OptimizationResult, CuttingPlan } from '@/types';

/**
 * Enriches an OptimizationResult with cost calculations per plan and totals.
 * All areas are in mm² internally; costs use m² and linear meters.
 * 
 * Per plan:
 *   materialCost   = sheetArea (m²) × stackCount × pricePerM²
 *   wasteCost      = wasteArea (m²) × stackCount × wasteCostPerM²
 *   cuttingCost    = totalCutLength (linear m) × stackCount × cutCostPerLinearM
 *   edgeBandCost   = Σ(edge band linear meters × costPerLinearM) × stackCount
 *   totalPlanCost  = materialCost + wasteCost + cuttingCost + edgeBandCost
 */
export function enrichResultWithCosts(
  result: OptimizationResult,
  materials: Material[],
  edgeBands: EdgeBand[] = [],
): OptimizationResult {
  const materialMap = new Map(materials.map((m) => [m.code, m]));
  const bandMap = new Map(edgeBands.map((eb) => [eb.code, eb]));

  let totalMaterialCost = 0;
  let totalWasteCost = 0;
  let totalCuttingCost = 0;
  let totalEdgeBandCost = 0;

  const enrichedPlans: CuttingPlan[] = result.plans.map((plan) => {
    const mat = materialMap.get(plan.materialCode);
    if (!mat) return plan;

    const sheetAreaM2 = (plan.sheetWidth * plan.sheetHeight) / 1e6;
    const wasteAreaM2 = plan.wasteArea / 1e6;

    // Estimate total cut length:
    // H cuts traverse sheet width, V cuts traverse sheet height (conservative for guillotine)
    const hCuts = plan.cuts.filter((c) => c.type === 'H').length;
    const vCuts = plan.cuts.filter((c) => c.type === 'V').length;
    const totalCutLengthM = ((hCuts * plan.sheetWidth) + (vCuts * plan.sheetHeight)) / 1000;

    // Edge band cost: sum up linear meters per band code for all pieces in plan
    let planEdgeBandCost = 0;
    for (const piece of plan.pieces) {
      const sides: { bandCode: string; lengthMm: number }[] = [
        { bandCode: piece.edgeBandTop, lengthMm: piece.width },
        { bandCode: piece.edgeBandBottom, lengthMm: piece.width },
        { bandCode: piece.edgeBandLeft, lengthMm: piece.height },
        { bandCode: piece.edgeBandRight, lengthMm: piece.height },
      ];
      for (const side of sides) {
        if (!side.bandCode) continue;
        const band = bandMap.get(side.bandCode);
        if (!band || band.costPerLinearM <= 0) continue;
        planEdgeBandCost += (side.lengthMm / 1000) * band.costPerLinearM;
      }
    }
    // Multiply by stack count
    planEdgeBandCost *= plan.stackCount;

    const materialCost = sheetAreaM2 * plan.stackCount * mat.pricePerM2;
    const wasteCost = wasteAreaM2 * plan.stackCount * mat.wasteCostPerM2;
    const cuttingCost = totalCutLengthM * plan.stackCount * mat.cutCostPerLinearM;
    const totalPlanCost = materialCost + wasteCost + cuttingCost + planEdgeBandCost;

    totalMaterialCost += materialCost;
    totalWasteCost += wasteCost;
    totalCuttingCost += cuttingCost;
    totalEdgeBandCost += planEdgeBandCost;

    return {
      ...plan,
      materialCost,
      wasteCost,
      cuttingCost,
      edgeBandCost: planEdgeBandCost,
      totalPlanCost,
    };
  });

  return {
    ...result,
    plans: enrichedPlans,
    totalMaterialCost,
    totalWasteCost,
    totalCuttingCost,
    totalEdgeBandCost,
    grandTotalCost: totalMaterialCost + totalWasteCost + totalCuttingCost + totalEdgeBandCost,
  };
}
