import { useAppStore } from '@/stores/appStore';
import { TabId } from '@/types';
import { useTranslation } from '@/i18n';
import {
  LayoutGrid,
  Layers,
  Ribbon,
  BarChart3,
  Tag,
  FileText,
  DollarSign,
} from 'lucide-react';

const tabDefs: { id: TabId; labelKey: keyof ReturnType<typeof import('@/i18n').useTranslation>['t']['tabs']; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'pieces', labelKey: 'pieces', icon: LayoutGrid },
  { id: 'materials', labelKey: 'materials', icon: Layers },
  { id: 'edgeBands', labelKey: 'edgeBands', icon: Ribbon },
  { id: 'results', labelKey: 'results', icon: BarChart3 },
  { id: 'labels', labelKey: 'labels', icon: Tag },
  { id: 'reports', labelKey: 'reports', icon: FileText },
  { id: 'costs', labelKey: 'costs', icon: DollarSign },
];

export function TabBar() {
  const { t } = useTranslation();
  const activeTab = useAppStore((s) => s.activeTab);
  const setActiveTab = useAppStore((s) => s.setActiveTab);
  const result = useAppStore((s) => s.result);
  const costEnabled = useAppStore((s) => s.costEnabled);

  return (
    <div className="flex items-end px-2 gap-0 border-t border-surface-100 bg-surface-50/50">
      {tabDefs.map((tab) => {
        const isActive = activeTab === tab.id;
        const isResultTab = tab.id === 'results' || tab.id === 'labels' || tab.id === 'reports';
        const isCostTab = tab.id === 'costs';
        const isDisabled = (isResultTab && !result) || (isCostTab && (!result || !costEnabled));

        return (
          <button
            key={tab.id}
            className={`
              flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-all duration-150
              ${isActive
                ? 'text-brand-600 border-brand-600 bg-surface-0'
                : 'text-surface-500 border-transparent hover:text-surface-700 hover:bg-surface-100/50'
              }
              ${isDisabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}
            `}
            onClick={() => !isDisabled && setActiveTab(tab.id)}
            disabled={isDisabled}
          >
            <tab.icon className="w-4 h-4" />
            <span>{t.tabs[tab.labelKey]}</span>
          </button>
        );
      })}
    </div>
  );
}
