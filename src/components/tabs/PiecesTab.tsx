import { useMemo, useCallback, useRef, useState } from 'react';
import { usePiecesStore } from '@/stores/piecesStore';
import { useMaterialsStore } from '@/stores/materialsStore';
import { useEdgeBandsStore } from '@/stores/edgeBandsStore';
import { PiecePreview } from '@/components/pieces/PiecePreview';
import { Piece, GrainDirection } from '@/types';
import { csvToArray, parseNumberSafe } from '@/utils/helpers';
import { validateCSVFile, clampDimension, clampQuantity } from '@/utils/validation';
import { useTranslation } from '@/i18n';
import {
  Plus, Trash2, Copy, Upload, ArrowUpDown, Layers,
} from 'lucide-react';
import { FigureEditor } from '@/components/figures/FigureEditor';

export function PiecesTab() {
  const { t } = useTranslation();
  const pieces = usePiecesStore((s) => s.pieces);
  const selectedPieceId = usePiecesStore((s) => s.selectedPieceId);
  const addPiece = usePiecesStore((s) => s.addPiece);
  const updatePiece = usePiecesStore((s) => s.updatePiece);
  const removePieces = usePiecesStore((s) => s.removePieces);
  const duplicatePieces = usePiecesStore((s) => s.duplicatePieces);
  const selectPiece = usePiecesStore((s) => s.selectPiece);
  const importPieces = usePiecesStore((s) => s.importPieces);
  const pushHistory = usePiecesStore((s) => s.pushHistory);

  const materials = useMaterialsStore((s) => s.materials);
  const edgeBands = useEdgeBandsStore((s) => s.edgeBands);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sortCol, setSortCol] = useState<keyof Piece | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [filter, setFilter] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showFigureEditor, setShowFigureEditor] = useState(false);

  const selectedPiece = useMemo(
    () => pieces.find((p) => p.id === selectedPieceId) || null,
    [pieces, selectedPieceId]
  );

  const filteredPieces = useMemo(() => {
    let result = [...pieces];
    if (filter) {
      const f = filter.toLowerCase();
      result = result.filter(
        (p) =>
          p.code.toLowerCase().includes(f) ||
          p.material.toLowerCase().includes(f) ||
          p.description.toLowerCase().includes(f) ||
          p.description2.toLowerCase().includes(f)
      );
    }
    if (sortCol) {
      result.sort((a, b) => {
        const va = a[sortCol] ?? '';
        const vb = b[sortCol] ?? '';
        if (typeof va === 'number' && typeof vb === 'number') {
          return sortDir === 'asc' ? va - vb : vb - va;
        }
        return sortDir === 'asc'
          ? String(va).localeCompare(String(vb))
          : String(vb).localeCompare(String(va));
      });
    }
    return result;
  }, [pieces, filter, sortCol, sortDir]);

  const handleSort = (col: keyof Piece) => {
    if (sortCol === col) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortCol(col);
      setSortDir('asc');
    }
  };

  const handleCellChange = useCallback(
    (id: string, field: keyof Piece, value: string) => {
      const numFields = ['quantity', 'width', 'height', 'sequence'];
      if (numFields.includes(field)) {
        const num = parseNumberSafe(value, 0);
        updatePiece(id, { [field]: field === 'sequence' && value === '' ? null : num } as Partial<Piece>);
      } else {
        updatePiece(id, { [field]: value } as Partial<Piece>);
      }
    },
    [updatePiece]
  );

  const handleCellBlur = useCallback(() => {
    pushHistory();
  }, [pushHistory]);

  const toggleSelect = (id: string, _shift: boolean) => {
    selectPiece(id);
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
    const err = validateCSVFile(file);
    if (err) { alert(err.message); e.target.value = ''; return; }
    const reader = new FileReader();
    reader.onload = () => {
      const rows = csvToArray(reader.result as string);
      if (rows.length < 2) return;
      const header = rows[0].map((h) => h.toLowerCase().trim());
      const dataRows = rows.slice(1).filter((r) => r.some((c) => c));

      const mapped: Partial<Piece>[] = dataRows.map((row) => {
        const get = (name: string) => row[header.indexOf(name)] || '';
        const grainRaw = (get('veta') || get('veio') || get('grain') || '').toLowerCase();
        let grainDirection: GrainDirection = 'none';
        if (grainRaw === 'horizontal' || grainRaw === 'h') grainDirection = 'horizontal';
        else if (grainRaw === 'vertical' || grainRaw === 'v') grainDirection = 'vertical';
        return {
          material: get('material') || get('código material'),
          quantity: clampQuantity(parseInt(get('quantidade') || get('qty') || get('cantidad') || '1', 10) || 1),
          width: clampDimension(parseNumberSafe(get('largura') || get('width') || get('ancho'), 0)),
          height: clampDimension(parseNumberSafe(get('altura') || get('height') || get('alto'), 0)),
          grainDirection,
          edgeBandTop: get('fita superior') || get('fita sup') || get('cinta sup') || get('canto sup') || get('edge top') || '',
          edgeBandBottom: get('fita inferior') || get('fita inf') || get('cinta inf') || get('canto inf') || get('edge bottom') || '',
          edgeBandLeft: get('fita esquerda') || get('fita esq') || get('cinta izq') || get('canto izq') || get('edge left') || '',
          edgeBandRight: get('fita direita') || get('fita dir') || get('cinta der') || get('canto der') || get('edge right') || '',
          sequence: get('sequência') || get('seq') || get('secuencia') ? parseInt(get('sequência') || get('seq') || get('secuencia'), 10) : null,
          description: get('descrição') || get('description') || get('desc') || get('descripción') || '',
          description2: get('descrição 2') || get('desc2') || get('descripción 2') || '',
        };
      });
      importPieces(mapped);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const columns: { key: keyof Piece; label: string; width: string; type: 'text' | 'number' | 'select' | 'readonly' | 'grainSelect' }[] = [
    { key: 'code', label: t.piecesTab.colId, width: 'w-20', type: 'readonly' },
    { key: 'material', label: t.piecesTab.colMaterial, width: 'w-32', type: 'select' },
    { key: 'quantity', label: t.piecesTab.colQuantity, width: 'w-16', type: 'number' },
    { key: 'width', label: t.piecesTab.colWidth, width: 'w-24', type: 'number' },
    { key: 'height', label: t.piecesTab.colHeight, width: 'w-24', type: 'number' },
    { key: 'grainDirection', label: t.piecesTab.colGrain, width: 'w-28', type: 'grainSelect' },
    { key: 'edgeBandTop', label: t.piecesTab.colEdgeTop, width: 'w-24', type: 'select' },
    { key: 'edgeBandBottom', label: t.piecesTab.colEdgeBottom, width: 'w-24', type: 'select' },
    { key: 'edgeBandLeft', label: t.piecesTab.colEdgeLeft, width: 'w-24', type: 'select' },
    { key: 'edgeBandRight', label: t.piecesTab.colEdgeRight, width: 'w-24', type: 'select' },
    { key: 'sequence', label: t.piecesTab.colSequence, width: 'w-16', type: 'number' },
    { key: 'description', label: t.piecesTab.colDescription, width: 'w-40', type: 'text' },
    { key: 'description2', label: t.piecesTab.colDescription2, width: 'w-40', type: 'text' },
  ];

  const hasValidation = (p: Piece): string[] => {
    const errors: string[] = [];
    if (!p.material) errors.push('material');
    if (p.width <= 0) errors.push('width');
    if (p.height <= 0) errors.push('height');
    if (p.quantity < 1) errors.push('quantity');
    return errors;
  };

  return (
    <div className="h-full flex">
      {/* Grid area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-surface-200 bg-surface-0">
          <button className="btn-primary btn-sm" onClick={() => addPiece()}>
            <Plus className="w-3.5 h-3.5" /> {t.piecesTab.newPiece}
          </button>
          <button
            className="btn-secondary btn-sm"
            onClick={() => duplicatePieces(Array.from(selectedIds))}
            disabled={selectedIds.size === 0}
          >
            <Copy className="w-3.5 h-3.5" /> {t.piecesTab.duplicate}
          </button>
          <button
            className="btn-danger btn-sm"
            onClick={() => {
              removePieces(Array.from(selectedIds));
              setSelectedIds(new Set());
            }}
            disabled={selectedIds.size === 0}
          >
            <Trash2 className="w-3.5 h-3.5" /> {t.piecesTab.remove}
          </button>
          <button
            className="btn-secondary btn-sm flex items-center gap-1"
            onClick={() => setShowFigureEditor(true)}
            disabled={selectedIds.size < 2}
            title={t.figures.createTooltip}
          >
            <Layers className="w-3.5 h-3.5" /> {t.figures.create}
          </button>
          <div className="h-5 w-px bg-surface-200 mx-1" />
          <button className="btn-secondary btn-sm" onClick={() => fileInputRef.current?.click()}>
            <Upload className="w-3.5 h-3.5" /> {t.piecesTab.importCSV}
          </button>
          <input
            type="file"
            ref={fileInputRef}
            accept=".csv,.txt,.tsv"
            className="hidden"
            onChange={handleImportCSV}
          />
          <div className="flex-1" />
          <input
            className="input w-48 py-1"
            placeholder={t.piecesTab.filterPlaceholder}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          <span className="text-xs text-surface-400">{t.piecesTab.count.replace('{count}', String(filteredPieces.length))}</span>
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-auto">
          <table className="w-full border-collapse min-w-[900px]">
            <thead className="sticky top-0 z-10">
              <tr>
                <th className="grid-cell-header w-8">
                  <input
                    type="checkbox"
                    checked={selectedIds.size === pieces.length && pieces.length > 0}
                    onChange={(e) => {
                      if (e.target.checked) setSelectedIds(new Set(pieces.map((p) => p.id)));
                      else setSelectedIds(new Set());
                    }}
                  />
                </th>
                {columns.map((col) => (
                  <th
                    key={col.key}
                    className={`grid-cell-header ${col.width} cursor-pointer hover:bg-surface-100`}
                    onClick={() => handleSort(col.key)}
                  >
                    <div className="flex items-center gap-1">
                      {col.label}
                      {sortCol === col.key && (
                        <ArrowUpDown className="w-3 h-3 text-brand-500" />
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredPieces.map((piece) => {
                const errors = hasValidation(piece);
                const isSelected = selectedIds.has(piece.id);
                return (
                  <tr
                    key={piece.id}
                    className={`${isSelected ? 'grid-row-selected' : 'hover:bg-surface-50'} 
                               ${piece.id === selectedPieceId ? 'ring-1 ring-inset ring-brand-400' : ''}`}
                    onClick={(e) => toggleSelect(piece.id, e.shiftKey)}
                  >
                    <td className="grid-cell w-8 text-center">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(piece.id, false)}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </td>
                    {columns.map((col) => {
                      const hasError = errors.includes(col.key);
                      const val = piece[col.key];

                      if (col.type === 'readonly') {
                        return (
                          <td key={col.key} className={`grid-cell ${col.width} font-mono text-xs text-surface-500`}>
                            {String(val)}
                          </td>
                        );
                      }

                      if (col.key === 'material') {
                        return (
                          <td key={col.key} className={`grid-cell ${col.width} ${hasError ? 'bg-red-50' : ''}`}>
                            <select
                              className="grid-cell-input"
                              value={String(val)}
                              onChange={(e) => handleCellChange(piece.id, col.key, e.target.value)}
                              onBlur={handleCellBlur}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <option value="">—</option>
                              {materials.map((m) => (
                                <option key={m.id} value={m.code}>{m.code} — {m.description}</option>
                              ))}
                            </select>
                          </td>
                        );
                      }

                      if (col.type === 'grainSelect') {
                        return (
                          <td key={col.key} className={`grid-cell ${col.width}`}>
                            <select
                              className="grid-cell-input"
                              value={String(val || 'none')}
                              onChange={(e) => handleCellChange(piece.id, col.key, e.target.value)}
                              onBlur={handleCellBlur}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <option value="none">{t.common.grainNone}</option>
                              <option value="horizontal">{t.common.grainHorizontal}</option>
                              <option value="vertical">{t.common.grainVertical}</option>
                            </select>
                          </td>
                        );
                      }

                      if (col.key.startsWith('edgeBand')) {
                        return (
                          <td key={col.key} className={`grid-cell ${col.width}`}>
                            <select
                              className="grid-cell-input"
                              value={String(val || '')}
                              onChange={(e) => handleCellChange(piece.id, col.key, e.target.value)}
                              onBlur={handleCellBlur}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <option value="">—</option>
                              {edgeBands.map((eb) => (
                                <option key={eb.id} value={eb.code}>{eb.code} — {eb.description}</option>
                              ))}
                            </select>
                          </td>
                        );
                      }

                      return (
                        <td key={col.key} className={`grid-cell ${col.width} ${hasError ? 'bg-red-50' : ''}`}>
                          <input
                            className="grid-cell-input"
                            type={col.type === 'number' ? 'number' : 'text'}
                            value={val === null ? '' : String(val)}
                            onChange={(e) => handleCellChange(piece.id, col.key, e.target.value)}
                            onBlur={handleCellBlur}
                            onClick={(e) => e.stopPropagation()}
                            min={col.key === 'quantity' ? 1 : undefined}
                            step={col.key === 'width' || col.key === 'height' ? 0.1 : 1}
                          />
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
              {pieces.length === 0 && (
                <tr>
                  <td colSpan={columns.length + 1} className="text-center py-12 text-surface-400">
                    <div className="flex flex-col items-center gap-2">
                      <Plus className="w-8 h-8 text-surface-300" />
                      <p>{t.piecesTab.emptyTitle}</p>
                      <p className="text-xs">{t.piecesTab.emptyHint}</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Preview panel */}
      <div className="w-80 border-l border-surface-200 bg-surface-0 p-4 flex-shrink-0 overflow-y-auto">
        <h3 className="text-xs font-semibold text-surface-500 uppercase tracking-wider mb-3">
          {t.piecesTab.previewTitle}
        </h3>
        {selectedPiece ? (
          <PiecePreview piece={selectedPiece} />
        ) : (
          <div className="flex items-center justify-center h-48 text-surface-400 text-sm text-center">
            {t.piecesTab.selectToPreview}
          </div>
        )}

        {selectedPiece && (
          <div className="mt-4 space-y-1.5">
            <div className="text-xs">
              <span className="text-surface-500">{t.common.area}: </span>
              <span className="font-medium">{((selectedPiece.width * selectedPiece.height) / 1000000).toFixed(4)} m²</span>
            </div>
            <div className="text-xs">
              <span className="text-surface-500">{t.common.material}: </span>
              <span className="font-medium">{selectedPiece.material || '—'}</span>
            </div>
            <div className="text-xs">
              <span className="text-surface-500">{t.common.quantity}: </span>
              <span className="font-medium">{selectedPiece.quantity}</span>
            </div>
            <div className="text-xs">
              <span className="text-surface-500">{t.common.grain}: </span>
              <span className="font-medium">
                {selectedPiece.grainDirection === 'none' ? t.common.grainNone : 
                 selectedPiece.grainDirection === 'horizontal' ? t.common.grainHorizontal : t.common.grainVertical}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Figure Editor Modal */}
      {showFigureEditor && selectedIds.size >= 2 && (
        <FigureEditor
          pieceIds={Array.from(selectedIds)}
          onClose={() => setShowFigureEditor(false)}
          onSave={() => setShowFigureEditor(false)}
        />
      )}
    </div>
  );
}
