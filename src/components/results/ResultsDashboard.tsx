import { useMemo } from 'react';
import { OptimizationResult } from '@/types';
import { useAppStore } from '@/stores/appStore';
import { useTranslation } from '@/i18n';
import { BarChart3, PieChart, Layers, Package } from 'lucide-react';

interface Props {
  result: OptimizationResult;
}

// ─── Color palette ──────────────────────────────────────────
const COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
  '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1',
  '#14b8a6', '#e11d48',
];

function getColor(i: number) {
  return COLORS[i % COLORS.length];
}

// ─── Summary Cards ──────────────────────────────────────────
function SummaryCards({ result }: Props) {
  const { t } = useTranslation();
  const utilColor = result.globalUtilization >= 80 ? 'text-emerald-600' : result.globalUtilization >= 60 ? 'text-amber-600' : 'text-red-500';

  const cards = [
    { label: t.resultsTab.summaryTotalSheets, value: String(result.totalStackedSheets), icon: Layers, color: 'bg-blue-50 text-blue-600' },
    { label: t.resultsTab.summaryTotalPieces, value: String(result.totalPieces), icon: Package, color: 'bg-violet-50 text-violet-600' },
    { label: t.resultsTab.summaryGlobalUtil, value: `${result.globalUtilization.toFixed(1)}%`, icon: PieChart, color: 'bg-emerald-50', textColor: utilColor },
    { label: t.resultsTab.summaryUsableScrap, value: `${(result.totalUsableScrapArea / 1e6).toFixed(2)} m²`, icon: BarChart3, color: 'bg-amber-50 text-amber-600' },
  ];

  return (
    <div className="grid grid-cols-4 gap-3 mb-4">
      {cards.map((c, i) => (
        <div key={i} className="bg-white rounded-lg border border-surface-200 p-3 flex items-center gap-3">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${c.color}`}>
            <c.icon className="w-5 h-5" />
          </div>
          <div>
            <div className={`text-lg font-bold ${c.textColor || c.color.split(' ')[1]}`}>{c.value}</div>
            <div className="text-2xs text-surface-500 uppercase tracking-wide">{c.label}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Utilization Donut ──────────────────────────────────────
function UtilizationDonut({ result }: Props) {
  const { t } = useTranslation();
  const util = result.globalUtilization;
  const waste = 100 - util;
  const r = 40;
  const circumference = 2 * Math.PI * r;
  const utilStroke = (util / 100) * circumference;
  const color = util >= 80 ? '#10b981' : util >= 60 ? '#f59e0b' : '#ef4444';

  return (
    <div className="bg-white rounded-lg border border-surface-200 p-4">
      <h4 className="text-xs font-semibold text-surface-600 mb-3 flex items-center gap-1.5">
        <PieChart className="w-3.5 h-3.5" />
        {t.resultsTab.chartUtilization}
      </h4>
      <div className="flex items-center justify-center">
        <svg width="120" height="120" viewBox="0 0 100 100">
          {/* Background ring */}
          <circle cx="50" cy="50" r={r} fill="none" stroke="#f1f5f9" strokeWidth="12" />
          {/* Util ring */}
          <circle cx="50" cy="50" r={r} fill="none" stroke={color} strokeWidth="12"
            strokeDasharray={`${utilStroke} ${circumference}`}
            strokeLinecap="round"
            transform="rotate(-90 50 50)"
            className="transition-all duration-700" />
          {/* Center text */}
          <text x="50" y="46" textAnchor="middle" className="text-lg font-bold" fill={color} fontSize="18" fontWeight="700">
            {util.toFixed(1)}%
          </text>
          <text x="50" y="60" textAnchor="middle" fill="#94a3b8" fontSize="7">
            {t.resultsTab.chartUsed}
          </text>
        </svg>
      </div>
      <div className="flex justify-center gap-4 mt-2 text-2xs">
        <div className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
          {t.resultsTab.chartUsed} {util.toFixed(1)}%
        </div>
        <div className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-full bg-surface-200" />
          {t.resultsTab.chartWasteLabel} {waste.toFixed(1)}%
        </div>
      </div>
    </div>
  );
}

// ─── Material Consumption Bar Chart ─────────────────────────
interface MaterialStats {
  code: string;
  sheets: number;
  usedArea: number;
  wasteArea: number;
  utilization: number;
  pieces: number;
}

function MaterialBarChart({ result }: Props) {
  const { t } = useTranslation();

  const stats = useMemo(() => {
    const map = new Map<string, MaterialStats>();
    result.plans.forEach((plan) => {
      const existing = map.get(plan.materialCode) || {
        code: plan.materialCode,
        sheets: 0,
        usedArea: 0,
        wasteArea: 0,
        utilization: 0,
        pieces: 0,
      };
      existing.sheets += plan.stackCount;
      existing.usedArea += plan.usedArea * plan.stackCount;
      existing.wasteArea += plan.wasteArea * plan.stackCount;
      existing.pieces += plan.pieces.length * plan.stackCount;
      map.set(plan.materialCode, existing);
    });
    return Array.from(map.values()).map((s) => ({
      ...s,
      utilization: s.usedArea + s.wasteArea > 0 ? (s.usedArea / (s.usedArea + s.wasteArea)) * 100 : 0,
    }));
  }, [result]);

  const maxSheets = Math.max(...stats.map((s) => s.sheets), 1);
  const barW = 100 / Math.max(stats.length, 1);

  return (
    <div className="bg-white rounded-lg border border-surface-200 p-4">
      <h4 className="text-xs font-semibold text-surface-600 mb-3 flex items-center gap-1.5">
        <BarChart3 className="w-3.5 h-3.5" />
        {t.resultsTab.chartSheetsUsed}
      </h4>
      <svg width="100%" height="140" viewBox="0 0 300 140" preserveAspectRatio="xMidYMid meet">
        {/* Y axis labels */}
        {[0, Math.ceil(maxSheets / 2), maxSheets].map((v, i) => {
          const y = 120 - (v / maxSheets) * 100;
          return (
            <g key={i}>
              <line x1="30" y1={y} x2="290" y2={y} stroke="#e2e8f0" strokeWidth="0.5" />
              <text x="26" y={y + 3} textAnchor="end" fill="#94a3b8" fontSize="8">{v}</text>
            </g>
          );
        })}
        {/* Bars */}
        {stats.map((s, i) => {
          const bw = Math.min(barW * 2.6, 40);
          const gap = (260 - bw * stats.length) / (stats.length + 1);
          const x = 30 + gap + i * (bw + gap);
          const h = (s.sheets / maxSheets) * 100;
          const y = 120 - h;
          return (
            <g key={s.code}>
              <rect x={x} y={y} width={bw} height={h} rx="3" fill={getColor(i)} opacity={0.85}
                className="transition-all duration-500" />
              <text x={x + bw / 2} y={y - 4} textAnchor="middle" fill={getColor(i)} fontSize="9" fontWeight="600">
                {s.sheets}
              </text>
              <text x={x + bw / 2} y="133" textAnchor="middle" fill="#64748b" fontSize="6.5"
                transform={stats.length > 5 ? `rotate(-25 ${x + bw / 2} 133)` : ''}>
                {s.code.length > 12 ? s.code.substring(0, 12) + '…' : s.code}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ─── Waste Distribution ─────────────────────────────────────
function WasteBreakdown({ result }: Props) {
  const { t } = useTranslation();
  const totalArea = result.plans.reduce((s, p) => s + p.usableArea, 0);
  const usedArea = result.plans.reduce((s, p) => s + p.usedArea, 0);
  const usableScrapArea = result.totalUsableScrapArea;
  const wasteArea = totalArea - usedArea - usableScrapArea;

  const segments = [
    { label: t.resultsTab.chartUsed, value: usedArea, color: '#10b981' },
    { label: t.resultsTab.chartUsableScrap, value: usableScrapArea, color: '#f59e0b' },
    { label: t.resultsTab.chartWasteLabel, value: wasteArea, color: '#ef4444' },
  ].filter((s) => s.value > 0);

  const total = segments.reduce((s, seg) => s + seg.value, 0);

  return (
    <div className="bg-white rounded-lg border border-surface-200 p-4">
      <h4 className="text-xs font-semibold text-surface-600 mb-3 flex items-center gap-1.5">
        <PieChart className="w-3.5 h-3.5" />
        {t.resultsTab.chartWaste}
      </h4>
      {/* Stacked horizontal bar */}
      <div className="h-8 rounded-full overflow-hidden flex bg-surface-100 mb-3">
        {segments.map((seg, i) => {
          const pct = total > 0 ? (seg.value / total) * 100 : 0;
          return (
            <div key={i}
              className="h-full transition-all duration-500 flex items-center justify-center"
              style={{ width: `${pct}%`, backgroundColor: seg.color }}>
              {pct > 12 && (
                <span className="text-white text-2xs font-bold">{pct.toFixed(0)}%</span>
              )}
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-3 text-2xs">
        {segments.map((seg, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: seg.color }} />
            <span className="text-surface-600">{seg.label}</span>
            <span className="font-medium text-surface-800">{(seg.value / 1e6).toFixed(2)} m²</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Pieces by Material mini table ──────────────────────────
function PiecesByMaterial({ result }: Props) {
  const { t } = useTranslation();

  const stats = useMemo(() => {
    const map = new Map<string, { code: string; sheets: number; pieces: number; util: number; usedA: number; totalA: number }>();
    result.plans.forEach((plan) => {
      const existing = map.get(plan.materialCode) || { code: plan.materialCode, sheets: 0, pieces: 0, util: 0, usedA: 0, totalA: 0 };
      existing.sheets += plan.stackCount;
      existing.pieces += plan.pieces.length * plan.stackCount;
      existing.usedA += plan.usedArea * plan.stackCount;
      existing.totalA += plan.usableArea * plan.stackCount;
      map.set(plan.materialCode, existing);
    });
    return Array.from(map.values()).map((s) => ({
      ...s,
      util: s.totalA > 0 ? (s.usedA / s.totalA) * 100 : 0,
    }));
  }, [result]);

  return (
    <div className="bg-white rounded-lg border border-surface-200 p-4">
      <h4 className="text-xs font-semibold text-surface-600 mb-3 flex items-center gap-1.5">
        <Package className="w-3.5 h-3.5" />
        {t.resultsTab.chartMaterialConsumption}
      </h4>
      <div className="space-y-2">
        {stats.map((s, i) => {
          const utilColor = s.util >= 80 ? '#10b981' : s.util >= 60 ? '#f59e0b' : '#ef4444';
          return (
            <div key={s.code} className="flex items-center gap-2 text-xs">
              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: getColor(i) }} />
              <span className="font-medium text-surface-700 min-w-0 truncate flex-1">{s.code}</span>
              <span className="text-surface-400">{s.sheets} {t.resultsTab.chartSheets}</span>
              <span className="text-surface-400">·</span>
              <span className="text-surface-500">{s.pieces} pcs</span>
              <div className="w-16 h-1.5 bg-surface-100 rounded-full overflow-hidden flex-shrink-0">
                <div className="h-full rounded-full transition-all duration-500" style={{ width: `${s.util}%`, backgroundColor: utilColor }} />
              </div>
              <span className="text-2xs font-medium w-10 text-right" style={{ color: utilColor }}>
                {s.util.toFixed(0)}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main Dashboard Component ───────────────────────────────
export function ResultsDashboard({ result }: Props) {
  return (
    <div className="px-4 py-3 overflow-y-auto">
      <SummaryCards result={result} />
      <div className="grid grid-cols-4 gap-3">
        <UtilizationDonut result={result} />
        <MaterialBarChart result={result} />
        <WasteBreakdown result={result} />
        <PiecesByMaterial result={result} />
      </div>
    </div>
  );
}
