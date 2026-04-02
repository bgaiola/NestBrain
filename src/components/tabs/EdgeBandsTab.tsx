import { useState, useRef } from 'react';
import { useEdgeBandsStore } from '@/stores/edgeBandsStore';
import { EdgeBand } from '@/types';
import { parseNumberSafe, csvToArray } from '@/utils/helpers';
import { useTranslation } from '@/i18n';
import { Plus, Trash2, Upload, Download } from 'lucide-react';

export function EdgeBandsTab() {
  const { t } = useTranslation();
  const edgeBands = useEdgeBandsStore((s) => s.edgeBands);
  const addEdgeBand = useEdgeBandsStore((s) => s.addEdgeBand);
  const updateEdgeBand = useEdgeBandsStore((s) => s.updateEdgeBand);
  const removeEdgeBands = useEdgeBandsStore((s) => s.removeEdgeBands);
  const setEdgeBands = useEdgeBandsStore((s) => s.setEdgeBands);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleChange = (id: string, key: keyof EdgeBand, value: string) => {
    if (key === 'supplementaryIncrease' || key === 'costPerLinearM') {
      updateEdgeBand(id, { [key]: parseNumberSafe(value, 0) });
    } else {
      updateEdgeBand(id, { [key]: value } as Partial<EdgeBand>);
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleImportCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const rows = csvToArray(reader.result as string);
      if (rows.length < 2) return;
      const header = rows[0].map((h) => h.toLowerCase().trim());
      const dataRows = rows.slice(1).filter((r) => r.some((c) => c.trim()));

      const get = (row: string[], name: string) => row[header.indexOf(name)]?.trim() || '';

      const mapped: Partial<EdgeBand>[] = dataRows.map((row) => {
        const g = (name: string) => get(row, name);
        return {
          code: g('code') || g('código') || g('codigo') || '',
          description: g('description') || g('descripción') || g('descrição') || g('desc') || '',
          supplementaryIncrease: parseNumberSafe(
            g('increase') || g('aumento') || g('supplementaryincrease') || g('suplemento') || g('aumento (mm)'),
            2,
          ),
          costPerLinearM: parseNumberSafe(
            g('costperlinearm') || g('costo ml') || g('custo ml') || g('cost per linear m') || g('coût ml') || g('costo m lineal') || g('precio ml'),
            0,
          ),
        };
      });

      const newBands = mapped.map((m) => ({
        id: crypto.randomUUID?.() || Math.random().toString(36).slice(2),
        code: m.code || '',
        description: m.description || '',
        supplementaryIncrease: m.supplementaryIncrease ?? 2,
        costPerLinearM: m.costPerLinearM ?? 0,
      }));
      setEdgeBands(newBands);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleExportCSV = () => {
    const header = 'code,description,increase,costPerLinearM';
    const rows = edgeBands.map((eb) =>
      `${eb.code},${eb.description.replace(/,/g, ';')},${eb.supplementaryIncrease},${eb.costPerLinearM}`
    );
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'cantos.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-surface-200 bg-surface-0">
        <button className="btn-primary btn-sm" onClick={() => addEdgeBand()}>
          <Plus className="w-3.5 h-3.5" /> {t.edgeBandsTab.newBand}
        </button>
        <button
          className="btn-danger btn-sm"
          onClick={() => { removeEdgeBands(Array.from(selectedIds)); setSelectedIds(new Set()); }}
          disabled={selectedIds.size === 0}
        >
          <Trash2 className="w-3.5 h-3.5" /> {t.edgeBandsTab.remove}
        </button>
        <div className="h-5 w-px bg-surface-200 mx-1" />
        <button className="btn-secondary btn-sm" onClick={() => fileInputRef.current?.click()}>
          <Upload className="w-3.5 h-3.5" /> {t.edgeBandsTab.importCSV}
        </button>
        <input
          type="file"
          ref={fileInputRef}
          accept=".csv,.txt,.tsv"
          className="hidden"
          onChange={handleImportCSV}
        />
        <button
          className="btn-secondary btn-sm"
          onClick={handleExportCSV}
          disabled={edgeBands.length === 0}
        >
          <Download className="w-3.5 h-3.5" /> {t.edgeBandsTab.exportCSV}
        </button>
        <div className="flex-1" />
        <span className="text-xs text-surface-400">{t.edgeBandsTab.count.replace('{count}', String(edgeBands.length))}</span>
      </div>

      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse max-w-2xl">
          <thead className="sticky top-0 z-10">
            <tr>
              <th className="grid-cell-header w-8">
                <input
                  type="checkbox"
                  checked={selectedIds.size === edgeBands.length && edgeBands.length > 0}
                  onChange={(e) => {
                    if (e.target.checked) setSelectedIds(new Set(edgeBands.map((eb) => eb.id)));
                    else setSelectedIds(new Set());
                  }}
                />
              </th>
              <th className="grid-cell-header w-32">{t.edgeBandsTab.colCode}</th>
              <th className="grid-cell-header w-64">{t.edgeBandsTab.colDescription}</th>
              <th className="grid-cell-header w-36">{t.edgeBandsTab.colIncrease}</th>
              <th className="grid-cell-header w-36">{t.edgeBandsTab.colCostPerLM}</th>
            </tr>
          </thead>
          <tbody>
            {edgeBands.map((eb) => (
              <tr key={eb.id} className={selectedIds.has(eb.id) ? 'grid-row-selected' : 'hover:bg-surface-50'}>
                <td className="grid-cell w-8 text-center">
                  <input type="checkbox" checked={selectedIds.has(eb.id)}
                    onChange={() => toggleSelect(eb.id)} />
                </td>
                <td className="grid-cell w-32">
                  <input className="grid-cell-input" value={eb.code}
                    onChange={(e) => handleChange(eb.id, 'code', e.target.value)} />
                </td>
                <td className="grid-cell w-64">
                  <input className="grid-cell-input" value={eb.description}
                    onChange={(e) => handleChange(eb.id, 'description', e.target.value)} />
                </td>
                <td className="grid-cell w-36">
                  <input className="grid-cell-input" type="number" step={0.1}
                    value={eb.supplementaryIncrease}
                    onChange={(e) => handleChange(eb.id, 'supplementaryIncrease', e.target.value)} />
                </td>
                <td className="grid-cell w-36">
                  <input className="grid-cell-input" type="number" step={0.01}
                    value={eb.costPerLinearM}
                    onChange={(e) => handleChange(eb.id, 'costPerLinearM', e.target.value)} />
                </td>
              </tr>
            ))}
            {edgeBands.length === 0 && (
              <tr>
                <td colSpan={5} className="text-center py-12 text-surface-400">
                  <p>{t.edgeBandsTab.emptyTitle}</p>
                  <p className="text-xs mt-1">{t.edgeBandsTab.emptyHint}</p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      
      {/* Info */}
      <div className="px-3 py-2 border-t border-surface-200 bg-surface-50 text-xs text-surface-500">
        {t.edgeBandsTab.info}
      </div>
    </div>
  );
}
