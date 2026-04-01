import { useAppStore } from '@/stores/appStore';
import { Toolbar } from '@/components/layout/Toolbar';
import { TabBar } from '@/components/layout/TabBar';
import { PiecesTab } from '@/components/tabs/PiecesTab';
import { MaterialsTab } from '@/components/tabs/MaterialsTab';
import { EdgeBandsTab } from '@/components/tabs/EdgeBandsTab';
import { ResultsTab } from '@/components/tabs/ResultsTab';
import { LabelsTab } from '@/components/tabs/LabelsTab';
import { ReportsTab } from '@/components/tabs/ReportsTab';
import { CostsTab } from '@/components/tabs/CostsTab';
import { Notifications } from '@/components/ui/Notifications';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';

export default function App() {
  const activeTab = useAppStore((s) => s.activeTab);
  useKeyboardShortcuts();

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-surface-50">
      {/* Header */}
      <header className="flex-shrink-0 bg-surface-0 border-b border-surface-200 shadow-sm">
        <Toolbar />
        <TabBar />
      </header>

      {/* Main content */}
      <main className="flex-1 overflow-hidden">
        <div className={activeTab === 'pieces' ? 'h-full' : 'hidden'}>
          <PiecesTab />
        </div>
        <div className={activeTab === 'materials' ? 'h-full' : 'hidden'}>
          <MaterialsTab />
        </div>
        <div className={activeTab === 'edgeBands' ? 'h-full' : 'hidden'}>
          <EdgeBandsTab />
        </div>
        <div className={activeTab === 'results' ? 'h-full' : 'hidden'}>
          <ResultsTab />
        </div>
        <div className={activeTab === 'labels' ? 'h-full' : 'hidden'}>
          <LabelsTab />
        </div>
        <div className={activeTab === 'reports' ? 'h-full' : 'hidden'}>
          <ReportsTab />
        </div>
        <div className={activeTab === 'costs' ? 'h-full' : 'hidden'}>
          <CostsTab />
        </div>
      </main>

      {/* Notifications */}
      <Notifications />
    </div>
  );
}
