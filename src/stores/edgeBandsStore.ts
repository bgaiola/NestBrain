import { create } from 'zustand';
import { EdgeBand } from '@/types';
import { generateId } from '@/utils/helpers';

interface EdgeBandsState {
  edgeBands: EdgeBand[];
  selectedEdgeBandId: string | null;
  addEdgeBand: (partial?: Partial<EdgeBand>) => void;
  updateEdgeBand: (id: string, updates: Partial<EdgeBand>) => void;
  removeEdgeBands: (ids: string[]) => void;
  setEdgeBands: (edgeBands: EdgeBand[]) => void;
  selectEdgeBand: (id: string | null) => void;
}

function createDefaultEdgeBand(overrides?: Partial<EdgeBand>): EdgeBand {
  return {
    id: generateId(),
    code: '',
    description: '',
    supplementaryIncrease: 2,
    costPerLinearM: 0,
    ...overrides,
  };
}

export const useEdgeBandsStore = create<EdgeBandsState>()((set) => ({
  edgeBands: [],
  selectedEdgeBandId: null,

  addEdgeBand: (partial) => {
    const eb = createDefaultEdgeBand(partial);
    set((s) => ({ edgeBands: [...s.edgeBands, eb] }));
  },

  updateEdgeBand: (id, updates) => {
    set((s) => ({
      edgeBands: s.edgeBands.map((e) => (e.id === id ? { ...e, ...updates } : e)),
    }));
  },

  removeEdgeBands: (ids) => {
    set((s) => ({
      edgeBands: s.edgeBands.filter((e) => !ids.includes(e.id)),
      selectedEdgeBandId: ids.includes(s.selectedEdgeBandId || '') ? null : s.selectedEdgeBandId,
    }));
  },

  setEdgeBands: (edgeBands) => set({ edgeBands }),

  selectEdgeBand: (id) => set({ selectedEdgeBandId: id }),
}));
