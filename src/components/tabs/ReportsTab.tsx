import { useAppStore } from '@/stores/appStore';
import { useMaterialsStore } from '@/stores/materialsStore';
import { useTranslation } from '@/i18n';
import { FileText, Download } from 'lucide-react';
import { areaM2 } from '@/utils/helpers';
import { CURRENCY_SYMBOLS } from '@/types';

const CHART_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
  '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1',
];

export function ReportsTab() {
  const { t } = useTranslation();
  const result = useAppStore((s) => s.result);
  const projectName = useAppStore((s) => s.projectName);
  const costEnabled = useAppStore((s) => s.costEnabled);
  const currency = useAppStore((s) => s.currency);
  const materials = useMaterialsStore((s) => s.materials);

  if (!result) {
    return (
      <div className="flex items-center justify-center h-full text-surface-400">
        {t.reportsTab.optimizeFirst}
      </div>
    );
  }

  // Material consumption
  const materialMap = new Map<string, { sheets: number; usedArea: number; wasteArea: number }>();
  for (const plan of result.plans) {
    const entry = materialMap.get(plan.materialCode) || { sheets: 0, usedArea: 0, wasteArea: 0 };
    entry.sheets += plan.stackCount;
    entry.usedArea += plan.usedArea;
    entry.wasteArea += plan.wasteArea;
    materialMap.set(plan.materialCode, entry);
  }

  // All produced pieces
  const allPieces = result.plans.flatMap((p, planIdx) =>
    p.pieces.map((piece) => ({ ...piece, planNumber: planIdx + 1 }))
  );

  // Usable scraps
  const allScraps = result.plans.flatMap((p) =>
    p.scraps.filter((s) => s.usable).map((s) => ({ ...s, material: p.materialCode }))
  );

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-5xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-surface-800 flex items-center gap-2">
              <FileText className="w-5 h-5 text-brand-600" />
              {t.reportsTab.title} — {projectName}
            </h2>
            <p className="text-sm text-surface-500 mt-1">
              {t.reportsTab.generatedAt
                .replace('{date}', new Date(result.timestamp).toLocaleString())
                .replace('{time}', result.computeTimeMs.toFixed(0))}
            </p>
          </div>
          <button className="btn-primary" onClick={() => window.print()}>
            <Download className="w-4 h-4" /> {t.reportsTab.exportPrint}
          </button>
        </div>

        {/* 1. Executive Summary */}
        <div className="card p-5">
          <h3 className="text-sm font-bold text-surface-700 uppercase tracking-wider mb-4">
            {t.reportsTab.executiveSummary}
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label={t.reportsTab.totalPieces} value={result.totalPieces} />
            <StatCard label={t.reportsTab.sheetsConsumed} value={result.totalSheets} />
            <StatCard label={t.reportsTab.stackedSheets} value={result.totalStackedSheets} />
            <StatCard
              label={t.reportsTab.globalUtilization}
              value={`${result.globalUtilization.toFixed(1)}%`}
              color={result.globalUtilization >= 80 ? 'text-emerald-600' : 'text-amber-600'}
            />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-4">
            <StatCard label={t.reportsTab.usableScraps} value={`${areaM2(result.totalUsableScrapArea, 1).toFixed(4)} m²`} color="text-emerald-600" />
            <StatCard label={t.reportsTab.totalWaste} value={`${areaM2(result.totalWasteArea, 1).toFixed(4)} m²`} color="text-red-500" />
            <StatCard label={t.reportsTab.computeTime} value={`${result.computeTimeMs.toFixed(0)}ms`} />
          </div>
          {/* Donut-style utilization */}
          <div className="mt-4 flex items-center gap-4">
            <svg width={80} height={80} viewBox="0 0 36 36">
              <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                fill="none" stroke="#e2e8f0" strokeWidth="3" />
              <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                fill="none" stroke="#3b82f6" strokeWidth="3"
                strokeDasharray={`${result.globalUtilization}, 100`}
                strokeLinecap="round" />
              <text x="18" y="20.5" textAnchor="middle" fontSize="7" fontWeight="bold" fill="#1e40af">
                {result.globalUtilization.toFixed(0)}%
              </text>
            </svg>
            <div className="text-xs text-surface-500">
              {t.reportsTab.utilizationDescription}
            </div>
          </div>
        </div>

        {/* 2. Charts — Utilization by Material */}
        <div className="card p-5">
          <h3 className="text-sm font-bold text-surface-700 uppercase tracking-wider mb-4">
            {t.reportsTab.chartUtilByMaterial}
          </h3>
          <div className="space-y-3">
            {Array.from(materialMap).map(([code, data], idx) => {
              const total = data.usedArea + data.wasteArea;
              const pct = total > 0 ? (data.usedArea / total * 100) : 0;
              return (
                <div key={code}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-surface-700">{code}</span>
                    <span className={`text-xs font-bold ${pct >= 80 ? 'text-emerald-600' : pct >= 60 ? 'text-amber-600' : 'text-red-500'}`}>
                      {pct.toFixed(1)}%
                    </span>
                  </div>
                  <div className="h-6 bg-surface-100 rounded-full overflow-hidden flex">
                    <div className="h-full rounded-l-full transition-all"
                      style={{ width: `${pct}%`, backgroundColor: CHART_COLORS[idx % CHART_COLORS.length] }} />
                    <div className="h-full bg-surface-200" style={{ width: `${100 - pct}%` }} />
                  </div>
                  <div className="flex justify-between mt-0.5 text-2xs text-surface-400">
                    <span>{t.reportsTab.chartUsed}: {(data.usedArea / 1e6).toFixed(3)} m²</span>
                    <span>{t.reportsTab.chartWaste}: {(data.wasteArea / 1e6).toFixed(3)} m²</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 3. Chart — Area Distribution */}
        <div className="card p-5">
          <h3 className="text-sm font-bold text-surface-700 uppercase tracking-wider mb-4">
            {t.reportsTab.chartAreaDistribution}
          </h3>
          {(() => {
            const totalArea = result.plans.reduce((s, p) => s + p.sheetWidth * p.sheetHeight * p.stackCount, 0);
            const usedArea = result.plans.reduce((s, p) => s + p.usedArea, 0);
            const scrapArea = result.totalUsableScrapArea;
            const wasteArea = totalArea - usedArea - scrapArea;
            const pUsed = totalArea > 0 ? (usedArea / totalArea * 100) : 0;
            const pScrap = totalArea > 0 ? (scrapArea / totalArea * 100) : 0;
            const pWaste = totalArea > 0 ? (wasteArea / totalArea * 100) : 0;
            const segments = [
              { label: t.reportsTab.chartUsed, pct: pUsed, area: usedArea, color: '#3b82f6' },
              { label: t.reportsTab.chartScrap, pct: pScrap, area: scrapArea, color: '#10b981' },
              { label: t.reportsTab.chartWaste, pct: pWaste, area: wasteArea, color: '#ef4444' },
            ];
            return (
              <div>
                <div className="h-8 rounded-full overflow-hidden flex mb-3">
                  {segments.map((s, i) => (
                    <div key={i} className="h-full flex items-center justify-center text-white text-2xs font-bold"
                      style={{ width: `${Math.max(s.pct, 1)}%`, backgroundColor: s.color }}>
                      {s.pct >= 8 ? `${s.pct.toFixed(0)}%` : ''}
                    </div>
                  ))}
                </div>
                <div className="flex gap-6 justify-center">
                  {segments.map((s, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <span className="w-3 h-3 rounded-sm inline-block" style={{ backgroundColor: s.color }} />
                      <span className="text-surface-600">{s.label}</span>
                      <span className="font-bold text-surface-800">{s.pct.toFixed(1)}%</span>
                      <span className="text-surface-400">({(s.area / 1e6).toFixed(3)} m²)</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
        </div>

        {/* 4. Material Consumption Table */}
        <div className="card p-5">
          <h3 className="text-sm font-bold text-surface-700 uppercase tracking-wider mb-4">
            {t.reportsTab.materialConsumption}
          </h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-200">
                <th className="text-left py-2 text-xs font-semibold text-surface-500">{t.reportsTab.colMaterial}</th>
                <th className="text-right py-2 text-xs font-semibold text-surface-500">{t.reportsTab.colSheets}</th>
                <th className="text-right py-2 text-xs font-semibold text-surface-500">{t.reportsTab.colUsedArea}</th>
                <th className="text-right py-2 text-xs font-semibold text-surface-500">{t.reportsTab.colWaste}</th>
                <th className="text-right py-2 text-xs font-semibold text-surface-500">{t.reportsTab.colUtilization}</th>
              </tr>
            </thead>
            <tbody>
              {Array.from(materialMap).map(([code, data]) => {
                const total = data.usedArea + data.wasteArea;
                const pct = total > 0 ? (data.usedArea / total * 100) : 0;
                return (
                  <tr key={code} className="border-b border-surface-100">
                    <td className="py-2 font-medium">{code}</td>
                    <td className="text-right py-2">{data.sheets}</td>
                    <td className="text-right py-2">{(data.usedArea / 1e6).toFixed(4)}</td>
                    <td className="text-right py-2">{(data.wasteArea / 1e6).toFixed(4)}</td>
                    <td className="text-right py-2">
                      <span className={pct >= 80 ? 'text-emerald-600 font-bold' : 'text-amber-600 font-bold'}>
                        {pct.toFixed(1)}%
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* 5. Produced Pieces List */}
        <div className="card p-5">
          <h3 className="text-sm font-bold text-surface-700 uppercase tracking-wider mb-4">
            {t.reportsTab.producedPieces}
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-surface-200">
                  {[
                    t.reportsTab.colId,
                    t.reportsTab.colDescription,
                    t.reportsTab.colMaterial,
                    t.reportsTab.colWidth,
                    t.reportsTab.colHeight,
                    t.reportsTab.colPlan,
                    t.reportsTab.colPosX,
                    t.reportsTab.colPosY,
                    t.reportsTab.colRotation,
                  ].map((h) => (
                    <th key={h} className="text-left py-2 font-semibold text-surface-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {allPieces.map((piece, idx) => (
                  <tr key={idx} className="border-b border-surface-50 hover:bg-surface-50">
                    <td className="py-1.5 font-mono">{piece.code}</td>
                    <td className="py-1.5 truncate max-w-[200px]">{piece.description || '—'}</td>
                    <td className="py-1.5">{piece.material}</td>
                    <td className="py-1.5">{piece.originalWidth}mm</td>
                    <td className="py-1.5">{piece.originalHeight}mm</td>
                    <td className="py-1.5">{piece.planNumber}</td>
                    <td className="py-1.5">{piece.x.toFixed(1)}</td>
                    <td className="py-1.5">{piece.y.toFixed(1)}</td>
                    <td className="py-1.5">{piece.rotated ? '90°' : '0°'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* 6. Scrap Report */}
        <div className="card p-5">
          <h3 className="text-sm font-bold text-surface-700 uppercase tracking-wider mb-4">
            {t.reportsTab.scrapReport}
          </h3>
          {allScraps.length === 0 ? (
            <p className="text-sm text-surface-400">{t.reportsTab.noUsableScraps}</p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-surface-200">
                  <th className="text-left py-2 font-semibold text-surface-500">{t.reportsTab.colMaterial}</th>
                  <th className="text-right py-2 font-semibold text-surface-500">{t.reportsTab.colScrapWidth}</th>
                  <th className="text-right py-2 font-semibold text-surface-500">{t.reportsTab.colScrapHeight}</th>
                  <th className="text-right py-2 font-semibold text-surface-500">{t.reportsTab.colScrapArea}</th>
                </tr>
              </thead>
              <tbody>
                {allScraps.map((scrap, idx) => (
                  <tr key={idx} className="border-b border-surface-50">
                    <td className="py-1.5">{scrap.material}</td>
                    <td className="text-right py-1.5">{scrap.width.toFixed(1)}</td>
                    <td className="text-right py-1.5">{scrap.height.toFixed(1)}</td>
                    <td className="text-right py-1.5">{(scrap.width * scrap.height / 1e6).toFixed(4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* 7. Cost Report (visible only when costEnabled and costs exist) */}
        {costEnabled && (result.grandTotalCost ?? 0) > 0 && (() => {
          const sym = CURRENCY_SYMBOLS[currency];
          const fmt = (v: number) => `${sym} ${v.toFixed(2)}`;
          const materialMap2 = new Map(materials.map((m) => [m.code, m]));

          // Per-material cost breakdown
          const matCosts = new Map<string, { materialCost: number; wasteCost: number; cuttingCost: number; totalCost: number }>();
          for (const plan of result.plans) {
            const existing = matCosts.get(plan.materialCode) || { materialCost: 0, wasteCost: 0, cuttingCost: 0, totalCost: 0 };
            existing.materialCost += plan.materialCost ?? 0;
            existing.wasteCost += plan.wasteCost ?? 0;
            existing.cuttingCost += plan.cuttingCost ?? 0;
            existing.totalCost += plan.totalPlanCost ?? 0;
            matCosts.set(plan.materialCode, existing);
          }

          const grandTotal = result.grandTotalCost ?? 0;
          const segments = [
            { label: t.reportsTab.costMaterial, value: result.totalMaterialCost ?? 0, color: '#3b82f6' },
            { label: t.reportsTab.costWaste, value: result.totalWasteCost ?? 0, color: '#ef4444' },
            { label: t.reportsTab.costCutting, value: result.totalCuttingCost ?? 0, color: '#f59e0b' },
          ].filter((s) => s.value > 0);

          return (
            <div className="card p-5">
              <h3 className="text-sm font-bold text-surface-700 uppercase tracking-wider mb-4">
                {t.reportsTab.costReport}
              </h3>
              {/* Cost totals */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                <StatCard label={t.reportsTab.costMaterial} value={fmt(result.totalMaterialCost ?? 0)} color="text-blue-600" />
                <StatCard label={t.reportsTab.costWaste} value={fmt(result.totalWasteCost ?? 0)} color="text-red-500" />
                <StatCard label={t.reportsTab.costCutting} value={fmt(result.totalCuttingCost ?? 0)} color="text-amber-600" />
                <StatCard label={t.reportsTab.costTotal} value={fmt(grandTotal)} color="text-emerald-700" />
              </div>
              {/* Cost distribution bar */}
              <div className="h-8 rounded-full overflow-hidden flex mb-3">
                {segments.map((s, i) => {
                  const pct = grandTotal > 0 ? (s.value / grandTotal * 100) : 0;
                  return (
                    <div key={i} className="h-full flex items-center justify-center text-white text-2xs font-bold"
                      style={{ width: `${Math.max(pct, 1)}%`, backgroundColor: s.color }}>
                      {pct >= 8 ? `${pct.toFixed(0)}%` : ''}
                    </div>
                  );
                })}
              </div>
              <div className="flex gap-6 justify-center mb-6">
                {segments.map((s, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span className="w-3 h-3 rounded-sm inline-block" style={{ backgroundColor: s.color }} />
                    <span className="text-surface-600">{s.label}</span>
                    <span className="font-bold text-surface-800">{fmt(s.value)}</span>
                    <span className="text-surface-400">({grandTotal > 0 ? ((s.value / grandTotal) * 100).toFixed(1) : 0}%)</span>
                  </div>
                ))}
              </div>
              {/* Per-material cost table */}
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-surface-200">
                    <th className="text-left py-2 text-xs font-semibold text-surface-500">{t.reportsTab.colMaterial}</th>
                    <th className="text-right py-2 text-xs font-semibold text-surface-500">{t.reportsTab.costMaterial}</th>
                    <th className="text-right py-2 text-xs font-semibold text-surface-500">{t.reportsTab.costWaste}</th>
                    <th className="text-right py-2 text-xs font-semibold text-surface-500">{t.reportsTab.costCutting}</th>
                    <th className="text-right py-2 text-xs font-semibold text-surface-500">{t.reportsTab.costTotal}</th>
                  </tr>
                </thead>
                <tbody>
                  {Array.from(matCosts).map(([code, costs]) => (
                    <tr key={code} className="border-b border-surface-100">
                      <td className="py-2 font-medium">{code}</td>
                      <td className="text-right py-2">{fmt(costs.materialCost)}</td>
                      <td className="text-right py-2">{fmt(costs.wasteCost)}</td>
                      <td className="text-right py-2">{fmt(costs.cuttingCost)}</td>
                      <td className="text-right py-2 font-bold text-emerald-700">{fmt(costs.totalCost)}</td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-surface-300 font-bold">
                    <td className="py-2">{t.reportsTab.costTotal}</td>
                    <td className="text-right py-2">{fmt(result.totalMaterialCost ?? 0)}</td>
                    <td className="text-right py-2">{fmt(result.totalWasteCost ?? 0)}</td>
                    <td className="text-right py-2">{fmt(result.totalCuttingCost ?? 0)}</td>
                    <td className="text-right py-2 text-emerald-700">{fmt(grandTotal)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          );
        })()}
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
