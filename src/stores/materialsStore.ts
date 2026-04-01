import { create } from 'zustand';
import { Material } from '@/types';
import { generateId } from '@/utils/helpers';

interface MaterialsState {
  materials: Material[];
  selectedMaterialId: string | null;
  addMaterial: (partial?: Partial<Material>) => void;
  importMaterials: (partials: Partial<Material>[]) => void;
  updateMaterial: (id: string, updates: Partial<Material>) => void;
  removeMaterials: (ids: string[]) => void;
  setMaterials: (materials: Material[]) => void;
  selectMaterial: (id: string | null) => void;
}

function createDefaultMaterial(overrides?: Partial<Material>): Material {
  return {
    id: generateId(),
    code: '',
    description: '',
    thickness: 15,
    sheetWidth: 2750,
    sheetHeight: 1830,
    trimTop: 0,
    trimBottom: 0,
    trimLeft: 0,
    trimRight: 0,
    minScrapWidth: 300,
    minScrapHeight: 300,
    grainDirection: 'none',
    pricePerM2: 0,
    wasteCostPerM2: 0,
    cutCostPerLinearM: 0,
    ...overrides,
  };
}

export const useMaterialsStore = create<MaterialsState>()((set) => ({
  materials: [],
  selectedMaterialId: null,

  addMaterial: (partial) => {
    const mat = createDefaultMaterial(partial);
    set((s) => ({ materials: [...s.materials, mat] }));
  },

  importMaterials: (partials) => {
    const newMats = partials.map((p) => createDefaultMaterial(p));
    set((s) => ({ materials: [...s.materials, ...newMats] }));
  },

  updateMaterial: (id, updates) => {
    set((s) => ({
      materials: s.materials.map((m) => (m.id === id ? { ...m, ...updates } : m)),
    }));
  },

  removeMaterials: (ids) => {
    set((s) => ({
      materials: s.materials.filter((m) => !ids.includes(m.id)),
      selectedMaterialId: ids.includes(s.selectedMaterialId || '') ? null : s.selectedMaterialId,
    }));
  },

  setMaterials: (materials) => set({ materials }),

  selectMaterial: (id) => set({ selectedMaterialId: id }),
}));
