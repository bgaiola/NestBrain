import { create } from 'zustand';
import { OptimizationConfig, OptimizationResult, TabId, AppNotification, Locale, Currency } from '@/types';
import { generateId } from '@/utils/helpers';

interface AppState {
  // UI
  activeTab: TabId;
  setActiveTab: (tab: TabId) => void;

  // Locale / i18n
  locale: Locale;
  setLocale: (locale: Locale) => void;

  // Cost Management
  costEnabled: boolean;
  setCostEnabled: (val: boolean) => void;
  currency: Currency;
  setCurrency: (c: Currency) => void;

  // Optimization Config
  config: OptimizationConfig;
  updateConfig: (updates: Partial<OptimizationConfig>) => void;

  // Results
  result: OptimizationResult | null;
  isOptimizing: boolean;
  optimizationProgress: number; // 0-100
  setResult: (result: OptimizationResult | null) => void;
  setOptimizing: (val: boolean) => void;
  setProgress: (val: number) => void;

  // Notifications
  notifications: AppNotification[];
  addNotification: (n: Omit<AppNotification, 'id'>) => void;
  removeNotification: (id: string) => void;

  // Project
  projectName: string;
  setProjectName: (name: string) => void;
}

export const useAppStore = create<AppState>()((set) => ({
  activeTab: 'pieces',
  setActiveTab: (tab) => set({ activeTab: tab }),

  locale: 'es',
  setLocale: (locale) => set({ locale }),

  costEnabled: false,
  setCostEnabled: (val) => set({ costEnabled: val }),
  currency: 'EUR',
  setCurrency: (c) => set({ currency: c }),

  config: {
    bladeThickness: 4,
    mode: 'guillotine',
    guillotineMaxLevels: 4,
    maxStackThickness: 0,
    allowRotation: false,
  },
  updateConfig: (updates) =>
    set((s) => ({ config: { ...s.config, ...updates } })),

  result: null,
  isOptimizing: false,
  optimizationProgress: 0,
  setResult: (result) => set({ result, activeTab: result ? 'results' : 'pieces' }),
  setOptimizing: (val) => set({ isOptimizing: val, optimizationProgress: 0 }),
  setProgress: (val) => set({ optimizationProgress: val }),

  notifications: [],
  addNotification: (n) => {
    const id = generateId();
    set((s) => ({
      notifications: [...s.notifications, { ...n, id }],
    }));
    if (n.duration !== 0) {
      setTimeout(() => {
        set((s) => ({
          notifications: s.notifications.filter((x) => x.id !== id),
        }));
      }, n.duration || 4000);
    }
  },
  removeNotification: (id) =>
    set((s) => ({
      notifications: s.notifications.filter((n) => n.id !== id),
    })),

  projectName: 'Nuevo Proyecto',
  setProjectName: (name) => set({ projectName: name }),
}));
