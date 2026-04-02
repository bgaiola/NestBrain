import { useAppStore } from '@/stores/appStore';
import { usePiecesStore } from '@/stores/piecesStore';
import { useMaterialsStore } from '@/stores/materialsStore';
import { useEdgeBandsStore } from '@/stores/edgeBandsStore';
import { runOptimization } from '@/engine/optimizer';
import { enrichResultWithCosts } from '@/utils/costCalculator';
import { useTranslation, localeLabels } from '@/i18n';
import { Locale, Currency, CURRENCY_SYMBOLS } from '@/types';
import {
  Scissors,
  RotateCcw,
  Settings2,
  Play,
  Loader2,
  Globe,
  DollarSign,
  Sparkles,
} from 'lucide-react';

export function Toolbar() {
  const { t } = useTranslation();
  const config = useAppStore((s) => s.config);
  const updateConfig = useAppStore((s) => s.updateConfig);
  const isOptimizing = useAppStore((s) => s.isOptimizing);
  const progress = useAppStore((s) => s.optimizationProgress);
  const setOptimizing = useAppStore((s) => s.setOptimizing);
  const setResult = useAppStore((s) => s.setResult);
  const setProgress = useAppStore((s) => s.setProgress);
  const addNotification = useAppStore((s) => s.addNotification);
  const projectName = useAppStore((s) => s.projectName);
  const setProjectName = useAppStore((s) => s.setProjectName);
  const locale = useAppStore((s) => s.locale);
  const setLocale = useAppStore((s) => s.setLocale);
  const costEnabled = useAppStore((s) => s.costEnabled);
  const setCostEnabled = useAppStore((s) => s.setCostEnabled);
  const currency = useAppStore((s) => s.currency);
  const setCurrency = useAppStore((s) => s.setCurrency);

  const pieces = usePiecesStore((s) => s.pieces);
  const materials = useMaterialsStore((s) => s.materials);
  const edgeBands = useEdgeBandsStore((s) => s.edgeBands);

  const handleOptimize = async () => {
    if (pieces.length === 0) {
      addNotification({ type: 'warning', title: t.notifications.noPieces, message: t.notifications.noPiecesMsg });
      return;
    }
    if (materials.length === 0) {
      addNotification({ type: 'warning', title: t.notifications.noMaterials, message: t.notifications.noMaterialsMsg });
      return;
    }

    const piecesWithoutMaterial = pieces.filter((p) => !p.material);
    if (piecesWithoutMaterial.length > 0) {
      addNotification({
        type: 'warning',
        title: t.notifications.missingMaterial,
        message: t.notifications.missingMaterialMsg.replace('{count}', String(piecesWithoutMaterial.length)),
      });
      return;
    }

    setOptimizing(true);
    try {
      let result = await runOptimization(pieces, materials, edgeBands, config, (pct, detail) => {
        setProgress(pct, detail);
      });
      if (costEnabled) {
        result = enrichResultWithCosts(result, materials, edgeBands);
      }
      setResult(result);
      addNotification({
        type: 'success',
        title: t.notifications.optimizationDone,
        message: t.notifications.optimizationDoneMsg
          .replace('{plans}', String(result.plans.length))
          .replace('{pct}', result.globalUtilization.toFixed(1)),
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      addNotification({ type: 'error', title: t.notifications.optimizationError, message: msg });
    } finally {
      setOptimizing(false);
    }
  };

  return (
    <div className="px-4 py-2 flex items-center gap-4 flex-wrap">
      {/* Logo & project name */}
      <div className="flex items-center gap-2 mr-2">
        <Scissors className="w-5 h-5 text-brand-600" />
        <span className="font-bold text-brand-800 text-base tracking-tight">CutMaster Pro</span>
        <span className="text-surface-300 mx-1">|</span>
        <input
          className="text-sm font-medium text-surface-700 bg-transparent border-none outline-none 
                     hover:bg-surface-100 focus:bg-surface-100 rounded px-1.5 py-0.5 w-40 transition-colors"
          value={projectName}
          onChange={(e) => setProjectName(e.target.value)}
        />
      </div>

      {/* Divider */}
      <div className="h-6 w-px bg-surface-200" />

      {/* Blade thickness */}
      <div className="flex items-center gap-1.5">
        <label className="text-xs text-surface-500 whitespace-nowrap">{t.toolbar.bladeThickness}</label>
        <input
          type="number"
          className="input w-16 text-center py-1"
          value={config.bladeThickness}
          min={0}
          step={0.5}
          onChange={(e) => updateConfig({ bladeThickness: parseFloat(e.target.value) || 0 })}
        />
        <span className="text-xs text-surface-400">mm</span>
      </div>

      {/* Mode */}
      <div className="flex items-center gap-1.5">
        <label className="text-xs text-surface-500 whitespace-nowrap">{t.toolbar.mode}</label>
        <select
          className="input w-36 py-1"
          value={config.mode}
          onChange={(e) => updateConfig({ mode: e.target.value as 'freeform' | 'guillotine' })}
        >
          <option value="guillotine">{t.toolbar.guillotine}</option>
          <option value="freeform">{t.toolbar.freeForm}</option>
        </select>
      </div>

      {/* Guillotine levels */}
      {config.mode === 'guillotine' && (
        <div className="flex items-center gap-1.5">
          <label className="text-xs text-surface-500 whitespace-nowrap">{t.toolbar.levels}</label>
          <input
            type="number"
            className="input w-14 text-center py-1"
            value={config.guillotineMaxLevels}
            min={1}
            max={10}
            onChange={(e) => updateConfig({ guillotineMaxLevels: parseInt(e.target.value) || 2 })}
          />
          {config.guillotineMaxLevels > 5 && (
            <span className="text-2xs text-amber-600 font-medium">{t.toolbar.maySlow}</span>
          )}
        </div>
      )}

      {/* Stack */}
      <div className="flex items-center gap-1.5">
        <label className="text-xs text-surface-500 whitespace-nowrap">{t.toolbar.stack}</label>
        <input
          type="number"
          className="input w-16 text-center py-1"
          value={config.maxStackThickness}
          min={0}
          step={1}
          onChange={(e) => updateConfig({ maxStackThickness: parseFloat(e.target.value) || 0 })}
        />
        <span className="text-xs text-surface-400">mm</span>
      </div>

      {/* Rotation toggle */}
      <button
        className={`btn-sm flex items-center gap-1 rounded-md px-2 py-1 transition-colors ${
          config.allowRotation
            ? 'bg-brand-100 text-brand-700 border border-brand-300'
            : 'bg-surface-100 text-surface-500 border border-surface-300'
        }`}
        onClick={() => updateConfig({ allowRotation: !config.allowRotation })}
        title={t.toolbar.rotationTooltip}
      >
        <RotateCcw className="w-3.5 h-3.5" />
        <span className="text-xs font-medium">{t.toolbar.rotation}</span>
      </button>

      {/* Advanced optimization toggle */}
      <button
        className={`btn-sm flex items-center gap-1 rounded-md px-2 py-1 transition-colors ${
          config.advancedMode
            ? 'bg-amber-100 text-amber-700 border border-amber-300'
            : 'bg-surface-100 text-surface-500 border border-surface-300'
        }`}
        onClick={() => updateConfig({ advancedMode: !config.advancedMode })}
        title={t.toolbar.advancedTooltip}
      >
        <Sparkles className="w-3.5 h-3.5" />
        <span className="text-xs font-medium">{t.toolbar.advancedToggle}</span>
      </button>

      {/* Divider */}
      <div className="h-6 w-px bg-surface-200" />

      {/* Cost management toggle */}
      <button
        className={`btn-sm flex items-center gap-1 rounded-md px-2 py-1 transition-colors ${
          costEnabled
            ? 'bg-emerald-100 text-emerald-700 border border-emerald-300'
            : 'bg-surface-100 text-surface-500 border border-surface-300'
        }`}
        onClick={() => setCostEnabled(!costEnabled)}
        title={t.toolbar.costTooltip}
      >
        <DollarSign className="w-3.5 h-3.5" />
        <span className="text-xs font-medium">{t.toolbar.costToggle}</span>
      </button>

      {/* Currency selector (only visible when cost is enabled) */}
      {costEnabled && (
        <div className="flex items-center gap-1.5">
          <select
            className="input py-1 text-xs w-24"
            value={currency}
            onChange={(e) => setCurrency(e.target.value as Currency)}
          >
            {(Object.entries(CURRENCY_SYMBOLS) as [Currency, string][]).map(([code, symbol]) => (
              <option key={code} value={code}>{symbol} {code}</option>
            ))}
          </select>
        </div>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Language selector */}
      <div className="flex items-center gap-1.5">
        <Globe className="w-3.5 h-3.5 text-surface-400" />
        <select
          className="input py-1 text-xs w-32"
          value={locale}
          onChange={(e) => setLocale(e.target.value as Locale)}
        >
          {(Object.entries(localeLabels) as [Locale, string][]).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
      </div>

      {/* Settings */}
      <button className="btn-ghost btn-sm" title={t.toolbar.settings}>
        <Settings2 className="w-4 h-4" />
      </button>

      {/* Optimize button */}
      <button
        className="btn-primary flex items-center gap-2 px-5 py-2"
        onClick={handleOptimize}
        disabled={isOptimizing}
      >
        {isOptimizing ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>{t.toolbar.optimizing} {progress}%</span>
          </>
        ) : (
          <>
            <Play className="w-4 h-4" />
            <span>{t.toolbar.optimize}</span>
          </>
        )}
      </button>
    </div>
  );
}
