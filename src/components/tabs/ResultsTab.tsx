import { useState, useMemo } from 'react';
import { useAppStore } from '@/stores/appStore';
import { CuttingPlanViewer } from '@/components/results/CuttingPlanViewer';
import { colorFromIndex } from '@/utils/helpers';
import { useTranslation } from '@/i18n';
import {
  Eye, EyeOff, Download, FileJson, FileImage,
} from 'lucide-react';

export function ResultsTab() {
  const { t } = useTranslation();
  const result = useAppStore((s) => s.result);
  const [selectedPlanIdx, setSelectedPlanIdx] = useState(0);
  const [hoveredPieceId, setHoveredPieceId] = useState<string | null>(null);

  // Toggle states
  const [showLabels, setShowLabels] = useState(true);
  const [showKerf, setShowKerf] = useState(true);
  const [showTrims, setShowTrims] = useState(true);
  const [showEdgeBands, setShowEdgeBands] = useState(true);
  const [showScraps, setShowScraps] = useState(true);

  // Build color map
  const pieceColorMap = useMemo(() => {
    const map = new Map<string, string>();
    if (!result) return map;
    const allCodes = new Set<string>();
    result.plans.forEach((p) => p.pieces.forEach((pc) => allCodes.add(pc.code)));
    let i = 0;
    allCodes.forEach((code) => { map.set(code, colorFromIndex(i++)); });
    return map;
  }, [result]);

  if (!result) {
    return (
      <div className="flex items-center justify-center h-full text-surface-400">
        <div className="text-center">
          <p className="text-lg font-medium mb-2">{t.resultsTab.noResult}</p>
          <p className="text-sm">{t.resultsTab.noResultHint}</p>
        </div>
      </div>
    );
  }

  const plan = result.plans[selectedPlanIdx];

  const handleExportJSON = () => {
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'cutmaster-result.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportSVG = () => {
    const svgEl = document.querySelector('.cutting-plan-svg');
    if (!svgEl) return;
    const blob = new Blob([svgEl.outerHTML], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `plano-${selectedPlanIdx + 1}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="h-full flex">
      {/* Left panel — thumbnails */}
      <div className="w-48 border-r border-surface-200 bg-surface-0 overflow-y-auto flex-shrink-0">
        <div className="p-2">
          <h3 className="text-xs font-semibold text-surface-500 uppercase tracking-wider mb-2">
            {t.resultsTab.plans} ({result.plans.length})
          </h3>
          {result.plans.map((p, idx) => (
            <button
              key={p.planId}
              className={`w-full text-left p-2 rounded-md mb-1 transition-colors ${
                idx === selectedPlanIdx
                  ? 'bg-brand-100 border border-brand-300'
                  : 'hover:bg-surface-100 border border-transparent'
              }`}
              onClick={() => setSelectedPlanIdx(idx)}
            >
              <div className="text-xs font-medium text-surface-700">{t.resultsTab.plan} {idx + 1}</div>
              <div className="text-2xs text-surface-500">{p.materialCode}</div>
              <div className="text-2xs text-surface-500">
                {t.resultsTab.piecesCount.replace('{count}', String(p.pieces.length))} — {p.utilizationPercent.toFixed(1)}%
              </div>
              {/* Mini preview */}
              <svg className="w-full h-12 mt-1 bg-surface-50 rounded" viewBox={`0 0 ${p.sheetWidth} ${p.sheetHeight}`}
                preserveAspectRatio="xMidYMid meet">
                <rect width={p.sheetWidth} height={p.sheetHeight} fill="white" stroke="#cbd5e1" strokeWidth={4} />
                {p.pieces.map((pc, pi) => (
                  <rect key={pi} x={pc.x} y={pc.y} width={pc.width} height={pc.height}
                    fill={pieceColorMap.get(pc.code) || '#93c5fd'} opacity={0.5} />
                ))}
              </svg>
            </button>
          ))}
        </div>
      </div>

      {/* Center panel — main viewer */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Controls bar */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-surface-200 bg-surface-0 flex-wrap">
          <span className="text-sm font-medium text-surface-700">{t.resultsTab.plan} {selectedPlanIdx + 1}</span>
          <span className="text-xs text-surface-400">
            {plan.materialCode} — {plan.sheetWidth}×{plan.sheetHeight}mm
            {plan.stackCount > 1 && ` — ${t.resultsTab.stackedSheets.replace('{count}', String(plan.stackCount))}`}
          </span>
          <div className="flex-1" />

          {/* Toggles */}
          {[
            { label: t.resultsTab.labels, state: showLabels, set: setShowLabels },
            { label: t.resultsTab.kerf, state: showKerf, set: setShowKerf },
            { label: t.resultsTab.trims, state: showTrims, set: setShowTrims },
            { label: t.resultsTab.bands, state: showEdgeBands, set: setShowEdgeBands },
            { label: t.resultsTab.scrapsToggle, state: showScraps, set: setShowScraps },
          ].map((toggle) => (
            <button
              key={toggle.label}
              className={`btn-sm flex items-center gap-1 text-xs ${
                toggle.state ? 'text-brand-600 bg-brand-50' : 'text-surface-400 bg-surface-100'
              } rounded px-2 py-0.5`}
              onClick={() => toggle.set(!toggle.state)}
            >
              {toggle.state ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
              {toggle.label}
            </button>
          ))}

          <div className="h-4 w-px bg-surface-200 mx-1" />

          <button className="btn-secondary btn-sm" onClick={handleExportJSON}>
            <FileJson className="w-3.5 h-3.5" /> JSON
          </button>
          <button className="btn-secondary btn-sm" onClick={handleExportSVG}>
            <FileImage className="w-3.5 h-3.5" /> SVG
          </button>
        </div>

        {/* Viewer */}
        <div className="flex-1 p-2">
          {plan && (
            <CuttingPlanViewer
              plan={plan}
              pieceColorMap={pieceColorMap}
              hoveredPieceId={hoveredPieceId}
              onHoverPiece={setHoveredPieceId}
              showLabels={showLabels}
              showKerf={showKerf}
              showTrims={showTrims}
              showEdgeBands={showEdgeBands}
              showScraps={showScraps}
            />
          )}
        </div>

        {/* Stats bar */}
        <div className="flex items-center gap-6 px-3 py-2 border-t border-surface-200 bg-surface-50 text-xs">
          <div>
            <span className="text-surface-500">{t.resultsTab.utilization} </span>
            <span className={`font-bold ${plan.utilizationPercent >= 80 ? 'text-emerald-600' : plan.utilizationPercent >= 60 ? 'text-amber-600' : 'text-red-600'}`}>
              {plan.utilizationPercent.toFixed(1)}%
            </span>
          </div>
          <div>
            <span className="text-surface-500">{t.resultsTab.piecesLabel} </span>
            <span className="font-medium">{plan.pieces.length}</span>
          </div>
          <div>
            <span className="text-surface-500">{t.resultsTab.cuts} </span>
            <span className="font-medium">{plan.totalCuts}</span>
          </div>
          <div>
            <span className="text-surface-500">{t.resultsTab.scraps} </span>
            <span className="font-medium text-emerald-600">{plan.scraps.filter((s) => s.usable).length}</span>
            <span className="text-surface-400"> / {t.resultsTab.discards} </span>
            <span className="font-medium text-surface-500">{plan.scraps.filter((s) => !s.usable).length}</span>
          </div>
          <div className="flex-1" />
          <div>
            <span className="text-surface-500">{t.resultsTab.global} </span>
            <span className="font-bold text-brand-600">{result.globalUtilization.toFixed(1)}%</span>
            <span className="text-surface-400 ml-2">{result.totalSheets} {t.common.sheets} — {result.computeTimeMs.toFixed(0)}ms</span>
          </div>
        </div>
      </div>

      {/* Right panel — piece list */}
      <div className="w-56 border-l border-surface-200 bg-surface-0 overflow-y-auto flex-shrink-0">
        <div className="p-2">
          <h3 className="text-xs font-semibold text-surface-500 uppercase tracking-wider mb-2">
            {t.resultsTab.planPieces}
          </h3>
          {plan.pieces.map((piece, idx) => (
            <div
              key={`${piece.pieceId}-${idx}`}
              className={`flex items-center gap-2 px-2 py-1.5 rounded text-xs cursor-pointer transition-colors ${
                hoveredPieceId === piece.pieceId ? 'bg-brand-50 ring-1 ring-brand-300' : 'hover:bg-surface-50'
              }`}
              onMouseEnter={() => setHoveredPieceId(piece.pieceId)}
              onMouseLeave={() => setHoveredPieceId(null)}
            >
              <span className="w-3 h-3 rounded-sm flex-shrink-0"
                style={{ backgroundColor: pieceColorMap.get(piece.code) || '#93c5fd' }} />
              <span className="font-mono font-medium">{piece.code}</span>
              <span className="text-surface-400 flex-1 truncate">
                {piece.originalWidth}×{piece.originalHeight}
              </span>
              {piece.rotated && <span className="text-amber-500 text-2xs" title={t.resultsTab.rotated}>↻</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
