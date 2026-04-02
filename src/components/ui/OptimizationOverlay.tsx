import { useEffect, useState } from 'react';
import { useAppStore } from '@/stores/appStore';
import { useTranslation } from '@/i18n';
import { Loader2, Sparkles } from 'lucide-react';

export function OptimizationOverlay() {
  const { t } = useTranslation();
  const isOptimizing = useAppStore((s) => s.isOptimizing);
  const progress = useAppStore((s) => s.optimizationProgress);
  const detail = useAppStore((s) => s.optimizationDetail);
  const [elapsed, setElapsed] = useState(0);
  const [startTime] = useState(() => Date.now());

  useEffect(() => {
    if (!isOptimizing) return;
    const timer = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime) / 1000));
    }, 500);
    return () => clearInterval(timer);
  }, [isOptimizing, startTime]);

  if (!isOptimizing) return null;

  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;
  const timeStr = minutes > 0
    ? `${minutes}m ${seconds.toString().padStart(2, '0')}s`
    : `${seconds}s`;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full mx-4 text-center animate-in fade-in zoom-in duration-300">
        {/* Animated icon */}
        <div className="relative inline-flex items-center justify-center mb-6">
          <div className="absolute w-20 h-20 rounded-full bg-brand-100 animate-ping opacity-30" />
          <div className="relative w-16 h-16 rounded-full bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center shadow-lg">
            <Sparkles className="w-8 h-8 text-white animate-pulse" />
          </div>
        </div>

        {/* Title */}
        <h2 className="text-xl font-bold text-surface-800 mb-2">
          {t.optimization.overlayTitle}
        </h2>

        {/* Detail (material being processed) */}
        <p className="text-sm text-surface-500 mb-5 h-5">
          {detail
            ? t.optimization.processingMaterial.replace('{material}', detail)
            : t.optimization.preparing}
        </p>

        {/* Progress bar */}
        <div className="w-full bg-surface-100 rounded-full h-3 mb-3 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-brand-500 to-brand-600 transition-all duration-300 ease-out"
            style={{ width: `${Math.max(2, progress)}%` }}
          />
        </div>

        {/* Progress % and time */}
        <div className="flex items-center justify-between text-xs text-surface-400 mb-4">
          <span>{progress}%</span>
          <span>{timeStr}</span>
        </div>

        {/* Spinner + please wait */}
        <div className="flex items-center justify-center gap-2 text-surface-500">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm">{t.optimization.pleaseWait}</span>
        </div>
      </div>
    </div>
  );
}
