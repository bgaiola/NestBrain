import { useRef, useState } from 'react';
import { useMaterialsStore } from '@/stores/materialsStore';
import { useAppStore } from '@/stores/appStore';
import { GrainDirection, Material } from '@/types';
import { csvToArray, parseNumberSafe } from '@/utils/helpers';
import { useTranslation } from '@/i18n';
import { Plus, Trash2, Upload, Download } from 'lucide-react';

export function MaterialsTab() {
  const { t } = useTranslation();
  const materials = useMaterialsStore((s) => s.materials);
  const addMaterial = useMaterialsStore((s) => s.addMaterial);
  const importMaterials = useMaterialsStore((s) => s.importMaterials);
  const updateMaterial = useMaterialsStore((s) => s.updateMaterial);
  const removeMaterials = useMaterialsStore((s) => s.removeMaterials);
  const costEnabled = useAppStore((s) => s.costEnabled);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);

  const baseColumns: { key: keyof Material; label: string; type: 'text' | 'number' | 'grainSelect'; width: string }[] = [
    { key: 'code', label: t.materialsTab.colCode, type: 'text', width: 'w-28' },
    { key: 'description', label: t.materialsTab.colDescription, type: 'text', width: 'w-48' },
    { key: 'thickness', label: t.materialsTab.colThickness, type: 'number', width: 'w-28' },
    { key: 'sheetWidth', label: t.materialsTab.colSheetWidth, type: 'number', width: 'w-32' },
    { key: 'sheetHeight', label: t.materialsTab.colSheetHeight, type: 'number', width: 'w-32' },
    { key: 'grainDirection', label: t.materialsTab.colGrain, type: 'grainSelect', width: 'w-28' },
    { key: 'trimTop', label: t.materialsTab.colTrimTop, type: 'number', width: 'w-24' },
    { key: 'trimBottom', label: t.materialsTab.colTrimBottom, type: 'number', width: 'w-24' },
    { key: 'trimLeft', label: t.materialsTab.colTrimLeft, type: 'number', width: 'w-24' },
    { key: 'trimRight', label: t.materialsTab.colTrimRight, type: 'number', width: 'w-24' },
    { key: 'minScrapWidth', label: t.materialsTab.colMinScrapWidth, type: 'number', width: 'w-28' },
    { key: 'minScrapHeight', label: t.materialsTab.colMinScrapHeight, type: 'number', width: 'w-28' },
  ];

  const costColumns: { key: keyof Material; label: string; type: 'number'; width: string }[] = [
    { key: 'pricePerM2', label: t.materialsTab.colPricePerM2, type: 'number', width: 'w-28' },
    { key: 'wasteCostPerM2', label: t.materialsTab.colWasteCostPerM2, type: 'number', width: 'w-28' },
    { key: 'cutCostPerLinearM', label: t.materialsTab.colCutCostPerLinearM, type: 'number', width: 'w-28' },
  ];

  const columns = costEnabled ? [...baseColumns, ...costColumns] : baseColumns;

  const handleChange = (id: string, key: keyof Material, value: string) => {
    const numKeys: (keyof Material)[] = [
      'thickness', 'sheetWidth', 'sheetHeight', 'trimTop', 'trimBottom',
      'trimLeft', 'trimRight', 'minScrapWidth', 'minScrapHeight',
      'pricePerM2', 'wasteCostPerM2', 'cutCostPerLinearM',
    ];
    if (numKeys.includes(key)) {
      updateMaterial(id, { [key]: parseNumberSafe(value, 0) } as Partial<Material>);
    } else {
      updateMaterial(id, { [key]: value } as Partial<Material>);
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

      const mapped: Partial<Material>[] = dataRows.map((row) => {
        const g = (name: string) => get(row, name);
        const grainRaw = (g('grain') || g('veta') || g('veio') || '').toLowerCase();
        let grainDirection: GrainDirection = 'none';
        if (grainRaw === 'horizontal' || grainRaw === 'h') grainDirection = 'horizontal';
        else if (grainRaw === 'vertical' || grainRaw === 'v') grainDirection = 'vertical';
        return {
          code: g('code') || g('código') || g('codigo') || '',
          description: g('description') || g('descripción') || g('descrição') || g('desc') || '',
          thickness: parseNumberSafe(g('thickness') || g('espesor') || g('espessura') || g('espessor'), 15),
          sheetWidth: g('sheetwidth') ? parseNumberSafe(g('sheetwidth'), 2750) : parseNumberSafe(g('ancho chapa') || g('largura chapa') || g('ancho') || g('largura') || g('width'), 2750),
          sheetHeight: g('sheetheight') ? parseNumberSafe(g('sheetheight'), 1830) : parseNumberSafe(g('alto chapa') || g('altura chapa') || g('alto') || g('altura') || g('height'), 1830),
          grainDirection,
          trimTop: parseNumberSafe(g('trimtop') || g('recorte sup') || g('recorte superior') || g('trim top'), 0),
          trimBottom: parseNumberSafe(g('trimbottom') || g('recorte inf') || g('recorte inferior') || g('trim bottom'), 0),
          trimLeft: parseNumberSafe(g('trimleft') || g('recorte izq') || g('recorte esq') || g('trim left'), 0),
          trimRight: parseNumberSafe(g('trimright') || g('recorte der') || g('recorte dir') || g('trim right'), 0),
          minScrapWidth: parseNumberSafe(g('minscrapwidth') || g('sobra ancho mín') || g('sobra largura mín') || g('min scrap width'), 300),
          minScrapHeight: parseNumberSafe(g('minscrapheight') || g('sobra alto mín') || g('sobra altura mín') || g('min scrap height'), 300),
          pricePerM2: parseNumberSafe(g('priceperm2') || g('precio m2') || g('preço m2') || g('price per m2'), 0),
          wasteCostPerM2: parseNumberSafe(g('wastecostperm2') || g('coste desperdicio m2') || g('custo desperdicio m2') || g('waste cost per m2'), 0),
          cutCostPerLinearM: parseNumberSafe(g('cutcostperlinearm') || g('coste corte ml') || g('custo corte ml') || g('cut cost per linear m'), 0),
        };
      });
      importMaterials(mapped);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleExportCSV = () => {
    const headers = ['code', 'description', 'thickness', 'sheetWidth', 'sheetHeight', 'grain', 'trimTop', 'trimBottom', 'trimLeft', 'trimRight', 'minScrapWidth', 'minScrapHeight', 'pricePerM2', 'wasteCostPerM2', 'cutCostPerLinearM'];
    const rows = materials.map((m) => [
      m.code, m.description, m.thickness, m.sheetWidth, m.sheetHeight,
      m.grainDirection, m.trimTop, m.trimBottom, m.trimLeft, m.trimRight,
      m.minScrapWidth, m.minScrapHeight, m.pricePerM2, m.wasteCostPerM2, m.cutCostPerLinearM,
    ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','));
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'materiales.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-surface-200 bg-surface-0">
        <button className="btn-primary btn-sm" onClick={() => addMaterial()}>
          <Plus className="w-3.5 h-3.5" /> {t.materialsTab.newMaterial}
        </button>
        <button
          className="btn-danger btn-sm"
          onClick={() => { removeMaterials(Array.from(selectedIds)); setSelectedIds(new Set()); }}
          disabled={selectedIds.size === 0}
        >
          <Trash2 className="w-3.5 h-3.5" /> {t.materialsTab.remove}
        </button>
        <div className="h-4 border-l border-surface-300" />
        <input type="file" ref={fileInputRef} accept=".csv" className="hidden" onChange={handleImportCSV} />
        <button className="btn-secondary btn-sm" onClick={() => fileInputRef.current?.click()}>
          <Upload className="w-3.5 h-3.5" /> {t.materialsTab.importCSV}
        </button>
        <button className="btn-secondary btn-sm" onClick={handleExportCSV} disabled={materials.length === 0}>
          <Download className="w-3.5 h-3.5" /> {t.materialsTab.exportCSV}
        </button>
        <div className="flex-1" />
        <span className="text-xs text-surface-400">{t.materialsTab.count.replace('{count}', String(materials.length))}</span>
      </div>

      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse min-w-[800px]">
          <thead className="sticky top-0 z-10">
            <tr>
              <th className="grid-cell-header w-8">
                <input
                  type="checkbox"
                  checked={selectedIds.size === materials.length && materials.length > 0}
                  onChange={(e) => {
                    if (e.target.checked) setSelectedIds(new Set(materials.map((m) => m.id)));
                    else setSelectedIds(new Set());
                  }}
                />
              </th>
              {columns.map((col) => (
                <th key={col.key} className={`grid-cell-header ${col.width}`}>{col.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {materials.map((mat) => (
              <tr key={mat.id} className={selectedIds.has(mat.id) ? 'grid-row-selected' : 'hover:bg-surface-50'}>
                <td className="grid-cell w-8 text-center">
                  <input type="checkbox" checked={selectedIds.has(mat.id)}
                    onChange={() => toggleSelect(mat.id)} />
                </td>
                {columns.map((col) => {
                  if (col.type === 'grainSelect') {
                    return (
                      <td key={col.key} className={`grid-cell ${col.width}`}>
                        <select
                          className="grid-cell-input"
                          value={String(mat[col.key] || 'none')}
                          onChange={(e) => handleChange(mat.id, col.key, e.target.value)}
                        >
                          <option value="none">{t.common.grainNone}</option>
                          <option value="horizontal">{t.common.grainHorizontal}</option>
                          <option value="vertical">{t.common.grainVertical}</option>
                        </select>
                      </td>
                    );
                  }
                  return (
                    <td key={col.key} className={`grid-cell ${col.width}`}>
                      <input
                        className="grid-cell-input"
                        type={col.type === 'number' ? 'number' : 'text'}
                        value={String(mat[col.key] ?? '')}
                        onChange={(e) => handleChange(mat.id, col.key, e.target.value)}
                        step={col.type === 'number' ? 0.1 : undefined}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
            {materials.length === 0 && (
              <tr>
                <td colSpan={columns.length + 1} className="text-center py-12 text-surface-400">
                  <p>{t.materialsTab.emptyTitle}</p>
                  <p className="text-xs mt-1">{t.materialsTab.emptyHint}</p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
