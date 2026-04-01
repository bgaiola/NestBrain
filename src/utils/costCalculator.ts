import { Material, OptimizationResult, CuttingPlan } from '@/types';

/**
 * Enriches an OptimizationResult with cost calculations per plan and totals.
 * All areas are in mm² internally; costs use m² and linear meters.
 * 
 * Per plan:
 *   materialCost   = sheetArea (m²) × stackCount × pricePerM²
 *   wasteCost      = wasteArea (m²) × stackCount × wasteCostPerM²
 *   cuttingCost    = totalCutLength (linear m) × stackCount × cutCostPerLinearM
 *   totalPlanCost  = materialCost + wasteCost + cuttingCost
 */
export function enrichResultWithCosts(
  result: OptimizationResult,
  materials: Material[],
): OptimizationResult {
  const materialMap = new Map(materials.map((m) => [m.code, m]));

  let totalMaterialCost = 0;
  let totalWasteCost = 0;
  let totalCuttingCost = 0;

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

    const materialCost = sheetAreaM2 * plan.stackCount * mat.pricePerM2;
    const wasteCost = wasteAreaM2 * plan.stackCount * mat.wasteCostPerM2;
    const cuttingCost = totalCutLengthM * plan.stackCount * mat.cutCostPerLinearM;
    const totalPlanCost = materialCost + wasteCost + cuttingCost;

    totalMaterialCost += materialCost;
    totalWasteCost += wasteCost;
    totalCuttingCost += cuttingCost;

    return {
      ...plan,
      materialCost,
      wasteCost,
      cuttingCost,
      totalPlanCost,
    };
  });

  return {
    ...result,
    plans: enrichedPlans,
    totalMaterialCost,
    totalWasteCost,
    totalCuttingCost,
    grandTotalCost: totalMaterialCost + totalWasteCost + totalCuttingCost,
  };
}
