import { useAppStore } from '@/stores/appStore';
import { useMaterialsStore } from '@/stores/materialsStore';
import { useTranslation } from '@/i18n';
import { DollarSign, Download, TrendingUp, AlertTriangle } from 'lucide-react';
import { CURRENCY_SYMBOLS } from '@/types';

const CHART_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
  '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1',
];

export function CostsTab() {
  const { t } = useTranslation();
  const result = useAppStore((s) => s.result);
  const projectName = useAppStore((s) => s.projectName);
  const costEnabled = useAppStore((s) => s.costEnabled);
  const currency = useAppStore((s) => s.currency);
  const materials = useMaterialsStore((s) => s.materials);

  if (!result) {
    return (
      <div className="flex items-center justify-center h-full text-surface-400">
        {t.costsTab.optimizeFirst}
      </div>
    );
  }

  if (!costEnabled) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-surface-400 gap-3">
        <AlertTriangle className="w-8 h-8 text-amber-400" />
        <p className="text-sm">{t.costsTab.costDisabled}</p>
        <p className="text-xs text-surface-400">{t.costsTab.costDisabledHint}</p>
      </div>
    );
  }

  const hasCosts = (result.grandTotalCost ?? 0) > 0;
  if (!hasCosts) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-surface-400 gap-3">
        <DollarSign className="w-8 h-8 text-surface-300" />
        <p className="text-sm">{t.costsTab.noCosts}</p>
        <p className="text-xs text-surface-400">{t.costsTab.noCostsHint}</p>
      </div>
    );
  }

  const sym = CURRENCY_SYMBOLS[currency];
  const fmt = (v: number) => `${sym} ${v.toFixed(2)}`;

  // Per-material cost breakdown
  const matCosts = new Map<string, {
    materialCost: number; wasteCost: number; cuttingCost: number; totalCost: number;
    sheets: number; sheetAreaM2: number; wasteAreaM2: number;
  }>();
  for (const plan of result.plans) {
    const existing = matCosts.get(plan.materialCode) || {
      materialCost: 0, wasteCost: 0, cuttingCost: 0, totalCost: 0,
      sheets: 0, sheetAreaM2: 0, wasteAreaM2: 0,
    };
    existing.materialCost += plan.materialCost ?? 0;
    existing.wasteCost += plan.wasteCost ?? 0;
    existing.cuttingCost += plan.cuttingCost ?? 0;
    existing.totalCost += plan.totalPlanCost ?? 0;
    existing.sheets += plan.stackCount;
    existing.sheetAreaM2 += (plan.sheetWidth * plan.sheetHeight * plan.stackCount) / 1e6;
    existing.wasteAreaM2 += (plan.wasteArea * plan.stackCount) / 1e6;
    matCosts.set(plan.materialCode, existing);
  }

  const grandTotal = result.grandTotalCost ?? 0;
  const totalMaterial = result.totalMaterialCost ?? 0;
  const totalWaste = result.totalWasteCost ?? 0;
  const totalCutting = result.totalCuttingCost ?? 0;

  const segments = [
    { label: t.costsTab.costMaterial, value: totalMaterial, color: '#3b82f6' },
    { label: t.costsTab.costWaste, value: totalWaste, color: '#ef4444' },
    { label: t.costsTab.costCutting, value: totalCutting, color: '#f59e0b' },
  ].filter((s) => s.value > 0);

  // Cost per piece
  const costPerPiece = result.totalPieces > 0 ? grandTotal / result.totalPieces : 0;
  // Cost per m² of used area
  const totalUsedAreaM2 = result.plans.reduce((s, p) => s + p.usedArea, 0) / 1e6;
  const costPerM2Used = totalUsedAreaM2 > 0 ? grandTotal / totalUsedAreaM2 : 0;

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-5xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-surface-800 flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-emerald-600" />
              {t.costsTab.title} — {projectName}
            </h2>
            <p className="text-sm text-surface-500 mt-1">
              {t.costsTab.subtitle.replace('{currency}', `${sym} ${currency}`)}
            </p>
          </div>
          <button className="btn-primary" onClick={() => window.print()}>
            <Download className="w-4 h-4" /> {t.costsTab.exportPrint}
          </button>
        </div>

        {/* 1. Grand Summary */}
        <div className="card p-5">
          <h3 className="text-sm font-bold text-surface-700 uppercase tracking-wider mb-4">
            {t.costsTab.summary}
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <StatCard label={t.costsTab.costMaterial} value={fmt(totalMaterial)} color="text-blue-600" />
            <StatCard label={t.costsTab.costWaste} value={fmt(totalWaste)} color="text-red-500" />
            <StatCard label={t.costsTab.costCutting} value={fmt(totalCutting)} color="text-amber-600" />
            <StatCard label={t.costsTab.costTotal} value={fmt(grandTotal)} color="text-emerald-700" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <StatCard label={t.costsTab.costPerPiece} value={fmt(costPerPiece)} color="text-violet-600" />
            <StatCard label={t.costsTab.costPerM2} value={fmt(costPerM2Used)} color="text-cyan-600" />
          </div>
        </div>

        {/* 2. Cost Distribution Chart */}
        <div className="card p-5">
          <h3 className="text-sm font-bold text-surface-700 uppercase tracking-wider mb-4">
            <TrendingUp className="w-4 h-4 inline mr-1.5" />
            {t.costsTab.costBreakdown}
          </h3>
          {/* Stacked bar */}
          <div className="h-10 rounded-full overflow-hidden flex mb-3">
            {segments.map((s, i) => {
              const pct = grandTotal > 0 ? (s.value / grandTotal * 100) : 0;
              return (
                <div key={i} className="h-full flex items-center justify-center text-white text-xs font-bold transition-all duration-500"
                  style={{ width: `${Math.max(pct, 1)}%`, backgroundColor: s.color }}>
                  {pct >= 10 ? `${pct.toFixed(0)}%` : ''}
                </div>
              );
            })}
          </div>
          <div className="flex gap-6 justify-center">
            {segments.map((s, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <span className="w-3 h-3 rounded-sm inline-block" style={{ backgroundColor: s.color }} />
                <span className="text-surface-600">{s.label}</span>
                <span className="font-bold text-surface-800">{fmt(s.value)}</span>
                <span className="text-surface-400">({grandTotal > 0 ? ((s.value / grandTotal) * 100).toFixed(1) : 0}%)</span>
              </div>
            ))}
          </div>
        </div>

        {/* 3. Cost by Material (bar chart) */}
        <div className="card p-5">
          <h3 className="text-sm font-bold text-surface-700 uppercase tracking-wider mb-4">
            {t.costsTab.costByMaterial}
          </h3>
          {(() => {
            const matArr = Array.from(matCosts);
            const maxCost = Math.max(...matArr.map(([, c]) => c.totalCost), 1);
            return (
              <div className="space-y-3">
                {matArr.map(([code, costs], idx) => {
                  const matPct = costs.totalCost / maxCost * 100;
                  const matColor = CHART_COLORS[idx % CHART_COLORS.length];
                  return (
                    <div key={code}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium text-surface-700">{code}</span>
                        <span className="text-xs font-bold text-emerald-700">{fmt(costs.totalCost)}</span>
                      </div>
                      <div className="h-6 bg-surface-100 rounded-full overflow-hidden flex">
                        {/* Material portion */}
                        <div className="h-full" style={{
                          width: `${costs.totalCost > 0 ? (costs.materialCost / costs.totalCost * matPct) : 0}%`,
                          backgroundColor: '#3b82f6',
                        }} />
                        {/* Waste portion */}
                        <div className="h-full" style={{
                          width: `${costs.totalCost > 0 ? (costs.wasteCost / costs.totalCost * matPct) : 0}%`,
                          backgroundColor: '#ef4444',
                        }} />
                        {/* Cutting portion */}
                        <div className="h-full" style={{
                          width: `${costs.totalCost > 0 ? (costs.cuttingCost / costs.totalCost * matPct) : 0}%`,
                          backgroundColor: '#f59e0b',
                        }} />
                      </div>
                      <div className="flex gap-4 mt-0.5 text-2xs text-surface-400">
                        <span>{t.costsTab.costMaterial}: {fmt(costs.materialCost)}</span>
                        <span>{t.costsTab.costWaste}: {fmt(costs.wasteCost)}</span>
                        <span>{t.costsTab.costCutting}: {fmt(costs.cuttingCost)}</span>
                        <span className="ml-auto">{costs.sheets} {t.common.sheets}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>

        {/* 4. Detailed Cost Table */}
        <div className="card p-5">
          <h3 className="text-sm font-bold text-surface-700 uppercase tracking-wider mb-4">
            {t.costsTab.detailedTable}
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-200">
                  <th className="text-left py-2 text-xs font-semibold text-surface-500">{t.costsTab.colMaterial}</th>
                  <th className="text-right py-2 text-xs font-semibold text-surface-500">{t.costsTab.colSheets}</th>
                  <th className="text-right py-2 text-xs font-semibold text-surface-500">{t.costsTab.colSheetArea}</th>
                  <th className="text-right py-2 text-xs font-semibold text-surface-500">{t.costsTab.colWasteArea}</th>
                  <th className="text-right py-2 text-xs font-semibold text-surface-500">{t.costsTab.costMaterial}</th>
                  <th className="text-right py-2 text-xs font-semibold text-surface-500">{t.costsTab.costWaste}</th>
                  <th className="text-right py-2 text-xs font-semibold text-surface-500">{t.costsTab.costCutting}</th>
                  <th className="text-right py-2 text-xs font-semibold text-surface-500">{t.costsTab.costTotal}</th>
                </tr>
              </thead>
              <tbody>
                {Array.from(matCosts).map(([code, costs]) => (
                  <tr key={code} className="border-b border-surface-100 hover:bg-surface-50">
                    <td className="py-2 font-medium">{code}</td>
                    <td className="text-right py-2">{costs.sheets}</td>
                    <td className="text-right py-2">{costs.sheetAreaM2.toFixed(3)} m²</td>
                    <td className="text-right py-2">{costs.wasteAreaM2.toFixed(3)} m²</td>
                    <td className="text-right py-2">{fmt(costs.materialCost)}</td>
                    <td className="text-right py-2">{fmt(costs.wasteCost)}</td>
                    <td className="text-right py-2">{fmt(costs.cuttingCost)}</td>
                    <td className="text-right py-2 font-bold text-emerald-700">{fmt(costs.totalCost)}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-surface-300 font-bold">
                  <td className="py-2">{t.costsTab.costTotal}</td>
                  <td className="text-right py-2">{result.totalSheets}</td>
                  <td className="text-right py-2">
                    {(result.plans.reduce((s, p) => s + p.sheetWidth * p.sheetHeight * p.stackCount, 0) / 1e6).toFixed(3)} m²
                  </td>
                  <td className="text-right py-2">
                    {(result.plans.reduce((s, p) => s + p.wasteArea * p.stackCount, 0) / 1e6).toFixed(3)} m²
                  </td>
                  <td className="text-right py-2">{fmt(totalMaterial)}</td>
                  <td className="text-right py-2">{fmt(totalWaste)}</td>
                  <td className="text-right py-2">{fmt(totalCutting)}</td>
                  <td className="text-right py-2 text-emerald-700">{fmt(grandTotal)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* 5. Per-plan cost mini table */}
        <div className="card p-5">
          <h3 className="text-sm font-bold text-surface-700 uppercase tracking-wider mb-4">
            {t.costsTab.costPerPlan}
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-surface-200">
                  <th className="text-left py-2 font-semibold text-surface-500">{t.costsTab.colPlan}</th>
                  <th className="text-left py-2 font-semibold text-surface-500">{t.costsTab.colMaterial}</th>
                  <th className="text-right py-2 font-semibold text-surface-500">{t.costsTab.colSheets}</th>
                  <th className="text-right py-2 font-semibold text-surface-500">{t.costsTab.costMaterial}</th>
                  <th className="text-right py-2 font-semibold text-surface-500">{t.costsTab.costWaste}</th>
                  <th className="text-right py-2 font-semibold text-surface-500">{t.costsTab.costCutting}</th>
                  <th className="text-right py-2 font-semibold text-surface-500">{t.costsTab.costTotal}</th>
                </tr>
              </thead>
              <tbody>
                {result.plans.map((plan, idx) => (
                  <tr key={plan.planId} className="border-b border-surface-50 hover:bg-surface-50">
                    <td className="py-1.5 font-mono">{idx + 1}</td>
                    <td className="py-1.5">{plan.materialCode}</td>
                    <td className="text-right py-1.5">{plan.stackCount}</td>
                    <td className="text-right py-1.5">{fmt(plan.materialCost ?? 0)}</td>
                    <td className="text-right py-1.5">{fmt(plan.wasteCost ?? 0)}</td>
                    <td className="text-right py-1.5">{fmt(plan.cuttingCost ?? 0)}</td>
                    <td className="text-right py-1.5 font-bold text-emerald-700">{fmt(plan.totalPlanCost ?? 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="bg-surface-50 rounded-lg p-3">
      <p className="text-2xs text-surface-500 uppercase tracking-wider">{label}</p>
      <p className={`text-lg font-bold mt-0.5 ${color || 'text-surface-800'}`}>{value}</p>
    </div>
  );
}
