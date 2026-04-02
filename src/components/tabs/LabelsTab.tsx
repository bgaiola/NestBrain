import { useState, useRef, useCallback, useMemo } from 'react';
import { useAppStore } from '@/stores/appStore';
import { useTranslation } from '@/i18n';
import { LabelElement, LabelTemplate, DynamicField, PlacedPiece } from '@/types';
import { generateId } from '@/utils/helpers';
import {
  Tag, Trash2, Plus, Eye, Settings2,
  BarChart, FileDown, ChevronLeft, ChevronRight, GripVertical, Download,
} from 'lucide-react';
import JsBarcode from 'jsbarcode';
import jsPDF from 'jspdf';

// ─── Default label template ─────────────────────────────────
function createDefaultTemplate(): LabelTemplate {
  return {
    id: generateId(),
    name: 'Default',
    width: 100,
    height: 50,
    elements: [
      {
        id: generateId(), type: 'dynamic', x: 3, y: 3, width: 40, height: 6,
        content: 'pieceId', fontSize: 12, fontWeight: 'bold', textAlign: 'left', rotation: 0,
      },
      {
        id: generateId(), type: 'dynamic', x: 55, y: 3, width: 42, height: 5,
        content: 'material', fontSize: 9, fontWeight: 'normal', textAlign: 'right', rotation: 0,
      },
      {
        id: generateId(), type: 'dynamic', x: 3, y: 12, width: 60, height: 5,
        content: 'description', fontSize: 9, fontWeight: 'normal', textAlign: 'left', rotation: 0,
      },
      {
        id: generateId(), type: 'dynamic', x: 3, y: 20, width: 50, height: 5,
        content: 'width', fontSize: 9, fontWeight: 'normal', textAlign: 'left', rotation: 0,
      },
      {
        id: generateId(), type: 'dynamic', x: 3, y: 38, width: 50, height: 4,
        content: 'planNumber', fontSize: 7, fontWeight: 'normal', textAlign: 'left', rotation: 0,
      },
      {
        id: generateId(), type: 'dynamic', x: 3, y: 43, width: 50, height: 4,
        content: 'productionDate', fontSize: 7, fontWeight: 'normal', textAlign: 'left', rotation: 0,
      },
      {
        id: generateId(), type: 'barcode', x: 55, y: 22, width: 42, height: 24,
        content: 'pieceId', fontSize: 8, fontWeight: 'normal', textAlign: 'center', rotation: 0,
      },
    ],
  };
}

// ─── Available fields ───────────────────────────────────────
const AVAILABLE_FIELDS: { key: DynamicField; category: string }[] = [
  { key: 'pieceId', category: 'info' },
  { key: 'description', category: 'info' },
  { key: 'description2', category: 'info' },
  { key: 'material', category: 'info' },
  { key: 'width', category: 'dim' },
  { key: 'height', category: 'dim' },
  { key: 'thickness', category: 'dim' },
  { key: 'quantity', category: 'dim' },
  { key: 'edgeBandTop', category: 'edge' },
  { key: 'edgeBandBottom', category: 'edge' },
  { key: 'edgeBandLeft', category: 'edge' },
  { key: 'edgeBandRight', category: 'edge' },
  { key: 'planNumber', category: 'meta' },
  { key: 'sheetNumber', category: 'meta' },
  { key: 'sequence', category: 'meta' },
  { key: 'productionDate', category: 'meta' },
  { key: 'projectName', category: 'meta' },
];

// ─── Resolve dynamic value ──────────────────────────────────
type PieceWithMeta = PlacedPiece & { planNumber: number; sheetNumber: number };

function resolveField(field: DynamicField, piece: PieceWithMeta, projectName: string): string {
  switch (field) {
    case 'pieceId': return piece.code;
    case 'description': return piece.description || '';
    case 'description2': return piece.description2 || '';
    case 'material': return piece.material;
    case 'width': return `${piece.originalWidth}×${piece.originalHeight} mm`;
    case 'height': return `${piece.originalHeight} mm`;
    case 'thickness': return '';
    case 'edgeBandTop': return piece.edgeBandTop || '—';
    case 'edgeBandBottom': return piece.edgeBandBottom || '—';
    case 'edgeBandLeft': return piece.edgeBandLeft || '—';
    case 'edgeBandRight': return piece.edgeBandRight || '—';
    case 'planNumber': return `Plan ${piece.planNumber}`;
    case 'sheetNumber': return `Sheet ${piece.sheetNumber}`;
    case 'quantity': return String(piece.quantity);
    case 'sequence': return piece.sequence != null ? String(piece.sequence) : '—';
    case 'productionDate': return new Date().toLocaleDateString();
    case 'projectName': return projectName;
    default: return '';
  }
}

// ─── Field labels hook ──────────────────────────────────────
function useFieldLabels(): Record<string, string> {
  const { t } = useTranslation();
  return useMemo(() => ({
    pieceId: t.labelsTab.fieldPieceId,
    description: t.labelsTab.fieldDescription,
    description2: t.labelsTab.fieldDescription2,
    material: t.labelsTab.fieldMaterial,
    width: t.labelsTab.fieldWidth,
    height: t.labelsTab.fieldHeight,
    thickness: t.labelsTab.fieldThickness,
    edgeBandTop: t.labelsTab.fieldEdgeBandTop,
    edgeBandBottom: t.labelsTab.fieldEdgeBandBottom,
    edgeBandLeft: t.labelsTab.fieldEdgeBandLeft,
    edgeBandRight: t.labelsTab.fieldEdgeBandRight,
    planNumber: t.labelsTab.fieldPlanNumber,
    sheetNumber: t.labelsTab.fieldSheetNumber,
    quantity: t.labelsTab.fieldQuantity,
    sequence: t.labelsTab.fieldSequence,
    productionDate: t.labelsTab.fieldDate,
    projectName: t.labelsTab.fieldProjectName,
  }), [t]);
}

// ─── Barcode to Data URL ────────────────────────────────────
function barcodeToDataURL(text: string, h: number): string {
  try {
    const canvas = document.createElement('canvas');
    JsBarcode(canvas, text || '0000', {
      format: 'CODE128', width: 1.5, height: Math.max(h * 1.5, 20),
      displayValue: true, fontSize: 10, margin: 2,
    });
    return canvas.toDataURL('image/png');
  } catch {
    return '';
  }
}

const CANVAS_SCALE = 3.78; // ~1mm ≈ 3.78px

// ════════════════════════════════════════════════════════════
export function LabelsTab() {
  const { t } = useTranslation();
  const fieldLabels = useFieldLabels();
  const result = useAppStore((s) => s.result);
  const projectName = useAppStore((s) => s.projectName);

  const [template, setTemplate] = useState<LabelTemplate>(createDefaultTemplate);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [previewPage, setPreviewPage] = useState(0);

  const [pdfColumns, setPdfColumns] = useState(2);
  const [pdfRowGap, setPdfRowGap] = useState(3);
  const [pdfColGap, setPdfColGap] = useState(3);
  const [pdfMargin, setPdfMargin] = useState(10);

  const canvasRef = useRef<HTMLDivElement>(null);

  // ─── All pieces flat ──────────────────────────────────────
  const allPieces: PieceWithMeta[] = useMemo(() => {
    if (!result) return [];
    return result.plans.flatMap((p, planIdx) =>
      p.pieces.map((piece) => ({ ...piece, planNumber: planIdx + 1, sheetNumber: planIdx + 1 }))
    );
  }, [result]);

  const samplePiece: PieceWithMeta = allPieces[0] || {
    pieceId: 'SAMPLE', code: 'P-0001', x: 0, y: 0, width: 500, height: 300,
    rotated: false, originalWidth: 500, originalHeight: 300, grainDirection: 'none' as const,
    description: 'Sample', description2: '', material: 'MAT-01',
    sequence: 1, edgeBandTop: 'FB-1', edgeBandBottom: '', edgeBandLeft: 'FB-1',
    edgeBandRight: '', quantity: 2, planNumber: 1, sheetNumber: 1,
  };

  // ─── Helpers ──────────────────────────────────────────────
  const updateElement = useCallback((id: string, upd: Partial<LabelElement>) => {
    setTemplate((prev) => ({
      ...prev,
      elements: prev.elements.map((el) => (el.id === id ? { ...el, ...upd } : el)),
    }));
  }, []);

  const removeElement = useCallback((id: string) => {
    setTemplate((prev) => ({ ...prev, elements: prev.elements.filter((el) => el.id !== id) }));
    setSelectedElementId(null);
  }, []);

  const addField = useCallback((fieldKey: DynamicField) => {
    const el: LabelElement = {
      id: generateId(), type: 'dynamic',
      x: 5 + Math.random() * 20, y: 5 + Math.random() * 20,
      width: 40, height: 6, content: fieldKey,
      fontSize: 9, fontWeight: 'normal', textAlign: 'left', rotation: 0,
    };
    setTemplate((prev) => ({ ...prev, elements: [...prev.elements, el] }));
    setSelectedElementId(el.id);
  }, []);

  const addBarcode = useCallback(() => {
    const el: LabelElement = {
      id: generateId(), type: 'barcode',
      x: 50, y: 20, width: 45, height: 25, content: 'pieceId',
      fontSize: 8, fontWeight: 'normal', textAlign: 'center', rotation: 0,
    };
    setTemplate((prev) => ({ ...prev, elements: [...prev.elements, el] }));
    setSelectedElementId(el.id);
  }, []);

  // ─── Drag on canvas (with click detection) ────────────────
  const handleMouseDown = useCallback((e: React.MouseEvent, elementId: string) => {
    e.stopPropagation();
    setSelectedElementId(elementId);
    const el = template.elements.find((x) => x.id === elementId);
    if (!el) return;
    const startX = e.clientX;
    const startY = e.clientY;
    let dragging = false;
    const THRESHOLD = 3; // px before we consider it a drag

    const move = (ev: MouseEvent) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (!dragging && Math.abs(dx) < THRESHOLD && Math.abs(dy) < THRESHOLD) return;
      dragging = true;
      if (!canvasRef.current) return;
      const rect = canvasRef.current.getBoundingClientRect();
      const sx = template.width / rect.width;
      const sy = template.height / rect.height;
      const nx = Math.max(0, Math.min(template.width - 5, el.x + dx * sx));
      const ny = Math.max(0, Math.min(template.height - 5, el.y + dy * sy));
      updateElement(elementId, { x: nx, y: ny });
    };
    const up = () => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  }, [template, updateElement]);

  // ─── Drop from palette ────────────────────────────────────
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const key = e.dataTransfer.getData('text/plain');
    if (!key || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const sx = template.width / rect.width;
    const sy = template.height / rect.height;
    const x = Math.max(0, (e.clientX - rect.left) * sx);
    const y = Math.max(0, (e.clientY - rect.top) * sy);
    const isBar = key === 'barcode';
    const el: LabelElement = {
      id: generateId(), type: isBar ? 'barcode' : 'dynamic',
      x, y, width: isBar ? 42 : 40, height: isBar ? 22 : 6,
      content: isBar ? 'pieceId' : key, fontSize: 9,
      fontWeight: 'normal', textAlign: 'left', rotation: 0,
    };
    setTemplate((prev) => ({ ...prev, elements: [...prev.elements, el] }));
    setSelectedElementId(el.id);
  }, [template]);

  // ─── Render SVG element ───────────────────────────────────
  const renderElement = useCallback((el: LabelElement, piece: PieceWithMeta, selected: boolean) => {
    const value = resolveField(el.content as DynamicField, piece, projectName);

    if (el.type === 'barcode') {
      const src = barcodeToDataURL(value, el.height * CANVAS_SCALE);
      return (
        <g key={el.id}>
          {/* Invisible hit area for click/drag */}
          <rect x={el.x} y={el.y} width={el.width} height={el.height} fill="transparent" style={{ cursor: 'move' }} />
          {src && <image href={src} x={el.x} y={el.y} width={el.width} height={el.height} preserveAspectRatio="xMidYMid meet" style={{ pointerEvents: 'none' }} />}
          {selected && <rect x={el.x - 0.5} y={el.y - 0.5} width={el.width + 1} height={el.height + 1} fill="none" stroke="#3b82f6" strokeWidth="0.5" strokeDasharray="1.5" rx="0.5" style={{ pointerEvents: 'none' }} />}
        </g>
      );
    }

    const anchor = el.textAlign === 'center' ? 'middle' : el.textAlign === 'right' ? 'end' : 'start';
    const tx = el.textAlign === 'center' ? el.x + el.width / 2 : el.textAlign === 'right' ? el.x + el.width : el.x;

    return (
      <g key={el.id}>
        {/* Invisible hit area for click/drag */}
        <rect x={el.x} y={el.y} width={el.width} height={el.height} fill="transparent" style={{ cursor: 'move' }} />
        <text x={tx} y={el.y + el.fontSize * 0.35} fontSize={el.fontSize * 0.35}
          fontWeight={el.fontWeight} textAnchor={anchor} fill="#1e293b" dominantBaseline="hanging" style={{ pointerEvents: 'none' }}>
          {value || `[${fieldLabels[el.content] || el.content}]`}
        </text>
        {selected && <rect x={el.x - 0.5} y={el.y - 0.5} width={el.width + 1} height={el.height + 1} fill="none" stroke="#3b82f6" strokeWidth="0.5" strokeDasharray="1.5" rx="0.5" style={{ pointerEvents: 'none' }} />}
      </g>
    );
  }, [fieldLabels, projectName]);

  // ─── PDF generation ───────────────────────────────────────
  const generatePDF = useCallback(() => {
    if (allPieces.length === 0) return;
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageW = 210;
    const pageH = 297;
    const labelW = template.width;
    const labelH = template.height;
    const cols = pdfColumns;
    const margin = pdfMargin;
    const usableW = pageW - margin * 2;
    const cg = cols > 1 ? pdfColGap : 0;
    const effW = Math.min(labelW, (usableW - cg * (cols - 1)) / cols);
    const sc = effW / labelW;
    const effH = labelH * sc;
    const rowsPerPage = Math.floor((pageH - margin * 2 + pdfRowGap) / (effH + pdfRowGap));

    let col = 0;
    let row = 0;

    allPieces.forEach((piece, idx) => {
      if (idx > 0 && col === 0 && row === 0) pdf.addPage();
      const x = margin + col * (effW + cg);
      const y = margin + row * (effH + pdfRowGap);

      pdf.setDrawColor(200); pdf.setLineWidth(0.2);
      pdf.rect(x, y, effW, effH);

      template.elements.forEach((el) => {
        const val = resolveField(el.content as DynamicField, piece, projectName);
        const ex = x + el.x * sc;
        const ey = y + el.y * sc;

        if (el.type === 'barcode') {
          try {
            const canvas = document.createElement('canvas');
            JsBarcode(canvas, val || '0000', { format: 'CODE128', width: 1.5, height: Math.max(el.height * 2, 20), displayValue: true, fontSize: 10, margin: 2 });
            pdf.addImage(canvas.toDataURL('image/png'), 'PNG', ex, ey, el.width * sc, el.height * sc);
          } catch { /* skip */ }
        } else {
          const fs = el.fontSize * sc * 0.85;
          pdf.setFontSize(fs);
          pdf.setFont('helvetica', el.fontWeight === 'bold' ? 'bold' : 'normal');
          pdf.setTextColor(30, 41, 59);
          const align = el.textAlign === 'center' ? 'center' : el.textAlign === 'right' ? 'right' : 'left';
          const textX = align === 'center' ? ex + (el.width * sc) / 2 : align === 'right' ? ex + el.width * sc : ex;
          pdf.text(val || '', textX, ey + fs * 0.4, { align });
        }
      });

      col++;
      if (col >= cols) { col = 0; row++; }
      if (row >= rowsPerPage) { row = 0; col = 0; }
    });

    pdf.save('nestbrain-labels.pdf');
  }, [allPieces, template, pdfColumns, pdfRowGap, pdfColGap, pdfMargin, projectName]);

  // ─── Export labels CSV ──────────────────────────────────────
  const handleExportCSV = useCallback(() => {
    if (allPieces.length === 0) return;
    const headers = template.elements.map((el) => fieldLabels[el.content] || el.content);
    const rows = allPieces.map((piece) =>
      template.elements.map((el) => resolveField(el.content as DynamicField, piece, projectName))
    );
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'nestbrain-labels.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  }, [allPieces, template, fieldLabels, projectName]);

  // ─── Preview pages ────────────────────────────────────────
  const previewPages = useMemo(() => {
    if (allPieces.length === 0) return [];
    const pageH = 297;
    const margin = pdfMargin;
    const cols = pdfColumns;
    const usableW = 210 - margin * 2;
    const cg = cols > 1 ? pdfColGap : 0;
    const effW = Math.min(template.width, (usableW - cg * (cols - 1)) / cols);
    const sc = effW / template.width;
    const effH = template.height * sc;
    const rowsPerPage = Math.floor((pageH - margin * 2 + pdfRowGap) / (effH + pdfRowGap));
    const perPage = rowsPerPage * cols;
    const pages: PieceWithMeta[][] = [];
    for (let i = 0; i < allPieces.length; i += perPage) {
      pages.push(allPieces.slice(i, i + perPage));
    }
    return pages;
  }, [allPieces, template, pdfColumns, pdfRowGap, pdfColGap, pdfMargin]);

  const selectedElement = template.elements.find((el) => el.id === selectedElementId);

  if (!result) {
    return (
      <div className="flex items-center justify-center h-full text-surface-400">
        {t.labelsTab.optimizeFirst}
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-surface-200 bg-surface-0">
        <Tag className="w-4 h-4 text-surface-500" />
        <span className="text-sm font-medium text-surface-700">{t.labelsTab.title}</span>
        <span className="text-2xs text-surface-400 ml-1">
          {t.labelsTab.totalLabels.replace('{count}', String(allPieces.length))}
        </span>
        <div className="flex-1" />
        <button className="btn-secondary btn-sm flex items-center gap-1 text-xs" onClick={handleExportCSV}>
          <Download className="w-3.5 h-3.5" /> CSV
        </button>
        <button
          className={`btn-sm flex items-center gap-1 text-xs px-2 py-1 rounded ${showPreview ? 'btn-secondary' : 'text-surface-500 hover:bg-surface-100'}`}
          onClick={() => { setShowPreview(!showPreview); setPreviewPage(0); }}
        >
          <Eye className="w-3.5 h-3.5" /> {t.labelsTab.previewPDF}
        </button>
        <button className="btn-primary btn-sm" onClick={generatePDF}>
          <FileDown className="w-3.5 h-3.5" /> {t.labelsTab.generatePDF}
        </button>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* LEFT: Fields Palette */}
        <div className="w-56 border-r border-surface-200 bg-surface-0 overflow-y-auto flex-shrink-0">
          {/* Label Size */}
          <div className="p-3 border-b border-surface-100">
            <h4 className="text-2xs font-semibold text-surface-500 uppercase tracking-wider mb-2">
              {t.labelsTab.labelSize}
            </h4>
            <div className="flex gap-2">
              <div>
                <label className="text-2xs text-surface-400">{t.labelsTab.labelWidth}</label>
                <input type="number" min={20} defaultValue={template.width}
                  onBlur={(e) => {
                    const v = Math.max(20, Math.min(300, Number(e.target.value) || 20));
                    e.target.value = String(v);
                    setTemplate((p) => ({ ...p, width: v }));
                  }}
                  onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                  className="input-field text-xs w-full mt-0.5" />
              </div>
              <div>
                <label className="text-2xs text-surface-400">{t.labelsTab.labelHeight}</label>
                <input type="number" min={10} defaultValue={template.height}
                  onBlur={(e) => {
                    const v = Math.max(10, Math.min(200, Number(e.target.value) || 10));
                    e.target.value = String(v);
                    setTemplate((p) => ({ ...p, height: v }));
                  }}
                  onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                  className="input-field text-xs w-full mt-0.5" />
              </div>
            </div>
          </div>

          {/* Available Fields */}
          <div className="p-3">
            <h4 className="text-2xs font-semibold text-surface-500 uppercase tracking-wider mb-1">
              {t.labelsTab.availableFields}
            </h4>
            <p className="text-2xs text-surface-400 mb-2">{t.labelsTab.dragHint}</p>
            <div className="space-y-0.5">
              {AVAILABLE_FIELDS.map((f) => (
                <div key={f.key} draggable
                  onDragStart={(e) => e.dataTransfer.setData('text/plain', f.key)}
                  className="flex items-center gap-2 px-2 py-1.5 rounded text-xs text-surface-700 hover:bg-brand-50 hover:text-brand-700 cursor-grab active:cursor-grabbing transition-colors"
                >
                  <GripVertical className="w-3 h-3 text-surface-300" />
                  <span>{fieldLabels[f.key] || f.key}</span>
                  <Plus className="w-3 h-3 ml-auto text-surface-300 hover:text-brand-500 cursor-pointer"
                    onClick={() => addField(f.key)} />
                </div>
              ))}
              <div className="border-t border-surface-100 mt-2 pt-2">
                <div draggable onDragStart={(e) => e.dataTransfer.setData('text/plain', 'barcode')}
                  className="flex items-center gap-2 px-2 py-1.5 rounded text-xs text-surface-700 hover:bg-amber-50 hover:text-amber-700 cursor-grab active:cursor-grabbing transition-colors">
                  <BarChart className="w-3 h-3 text-surface-300" />
                  <span>{t.labelsTab.fieldBarcode}</span>
                  <Plus className="w-3 h-3 ml-auto text-surface-300 hover:text-amber-500 cursor-pointer" onClick={addBarcode} />
                </div>
              </div>
            </div>
          </div>

          {/* PDF Settings */}
          <div className="p-3 border-t border-surface-100">
            <h4 className="text-2xs font-semibold text-surface-500 uppercase tracking-wider mb-2 flex items-center gap-1">
              <Settings2 className="w-3 h-3" /> PDF
            </h4>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-2xs text-surface-400">{t.labelsTab.pdfColumns}</label>
                <input type="number" min={1} max={5} value={pdfColumns}
                  onChange={(e) => setPdfColumns(Math.max(1, Math.min(5, Number(e.target.value))))}
                  className="input-field text-xs w-full mt-0.5" />
              </div>
              <div>
                <label className="text-2xs text-surface-400">{t.labelsTab.pdfMargin}</label>
                <input type="number" min={0} max={30} value={pdfMargin}
                  onChange={(e) => setPdfMargin(Number(e.target.value))}
                  className="input-field text-xs w-full mt-0.5" />
              </div>
              <div>
                <label className="text-2xs text-surface-400">{t.labelsTab.pdfRowGap}</label>
                <input type="number" min={0} max={20} value={pdfRowGap}
                  onChange={(e) => setPdfRowGap(Number(e.target.value))}
                  className="input-field text-xs w-full mt-0.5" />
              </div>
              <div>
                <label className="text-2xs text-surface-400">{t.labelsTab.pdfColGap}</label>
                <input type="number" min={0} max={20} value={pdfColGap}
                  onChange={(e) => setPdfColGap(Number(e.target.value))}
                  className="input-field text-xs w-full mt-0.5" />
              </div>
            </div>
          </div>
        </div>

        {/* CENTER: Canvas / Preview */}
        <div className="flex-1 flex flex-col overflow-hidden bg-surface-100">
          {!showPreview ? (
            <div className="flex-1 flex items-center justify-center p-6">
              <div className="bg-white shadow-lg rounded-lg overflow-hidden" style={{ maxWidth: '100%' }}>
                <div className="px-3 py-1.5 bg-surface-50 border-b border-surface-200 text-2xs text-surface-500">
                  {t.labelsTab.layoutTitle} — {template.width} × {template.height} mm
                </div>
                <div ref={canvasRef} className="relative"
                  style={{ width: `${template.width * CANVAS_SCALE}px`, height: `${template.height * CANVAS_SCALE}px`, maxWidth: '100%' }}
                  onDragOver={(e) => e.preventDefault()} onDrop={handleDrop}
                  onClick={() => setSelectedElementId(null)}>
                  <svg width="100%" height="100%" viewBox={`0 0 ${template.width} ${template.height}`} className="bg-white">
                    <defs>
                      <pattern id="label-grid" width="5" height="5" patternUnits="userSpaceOnUse">
                        <circle cx="0" cy="0" r="0.15" fill="#e2e8f0" />
                      </pattern>
                    </defs>
                    <rect width={template.width} height={template.height} fill="url(#label-grid)" />
                    <rect x="0.25" y="0.25" width={template.width - 0.5} height={template.height - 0.5}
                      fill="none" stroke="#cbd5e1" strokeWidth="0.3" strokeDasharray="1" rx="0.5" />
                    {template.elements.map((el) => (
                      <g key={el.id} onMouseDown={(e) => handleMouseDown(e, el.id)} className="cursor-move">
                        {renderElement(el, samplePiece, el.id === selectedElementId)}
                      </g>
                    ))}
                  </svg>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center p-4 overflow-y-auto">
              {previewPages.length > 0 && (
                <>
                  <div className="flex items-center gap-3 mb-3">
                    <button className="btn-secondary btn-sm" disabled={previewPage === 0}
                      onClick={() => setPreviewPage((p) => Math.max(0, p - 1))}>
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>
                    <span className="text-xs text-surface-600">
                      {t.labelsTab.page} {previewPage + 1} {t.labelsTab.of} {previewPages.length}
                    </span>
                    <button className="btn-secondary btn-sm" disabled={previewPage >= previewPages.length - 1}
                      onClick={() => setPreviewPage((p) => Math.min(previewPages.length - 1, p + 1))}>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="bg-white shadow-xl rounded" style={{ width: '500px', aspectRatio: '210/297', padding: `${(pdfMargin / 210) * 100}%` }}>
                    <div className="w-full h-full flex flex-wrap content-start"
                      style={{ gap: `${pdfRowGap * (500 / 210)}px ${pdfColGap * (500 / 210)}px` }}>
                      {previewPages[previewPage]?.map((piece, idx) => {
                        const cols = pdfColumns;
                        const usableW = 500 - (pdfMargin / 210) * 500 * 2;
                        const cg = cols > 1 ? pdfColGap * (500 / 210) : 0;
                        const lw = (usableW - cg * (cols - 1)) / cols;
                        const lh = lw * (template.height / template.width);
                        return (
                          <div key={idx} className="border border-surface-200 rounded-sm overflow-hidden flex-shrink-0"
                            style={{ width: `${lw}px`, height: `${lh}px` }}>
                            <svg width="100%" height="100%" viewBox={`0 0 ${template.width} ${template.height}`} className="bg-white">
                              {template.elements.map((el) => renderElement(el, piece, false))}
                            </svg>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* RIGHT: Properties */}
        <div className="w-60 border-l border-surface-200 bg-surface-0 overflow-y-auto flex-shrink-0">
          {selectedElement ? (
            <div className="p-3 border-b border-surface-100">
              <h4 className="text-2xs font-semibold text-surface-500 uppercase tracking-wider mb-2">
                {fieldLabels[selectedElement.content] || selectedElement.content}
              </h4>
              {selectedElement.type !== 'barcode' && (
                <>
                  <div className="mb-2">
                    <label className="text-2xs text-surface-400">{t.labelsTab.fontSize}</label>
                    <input type="number" min={5} max={30} value={selectedElement.fontSize}
                      onChange={(e) => updateElement(selectedElement.id, { fontSize: Number(e.target.value) })}
                      className="input-field text-xs w-full mt-0.5" />
                  </div>
                  <div className="flex gap-1 mb-2">
                    <button className={`btn-sm flex-1 text-2xs ${selectedElement.fontWeight === 'bold' ? 'bg-brand-100 text-brand-700' : 'bg-surface-100 text-surface-500'}`}
                      onClick={() => updateElement(selectedElement.id, { fontWeight: selectedElement.fontWeight === 'bold' ? 'normal' : 'bold' })}>
                      <b>B</b> {t.labelsTab.fontBold}
                    </button>
                  </div>
                  <div className="flex gap-1 mb-2">
                    {(['left', 'center', 'right'] as const).map((align) => (
                      <button key={align}
                        className={`btn-sm flex-1 text-2xs ${selectedElement.textAlign === align ? 'bg-brand-100 text-brand-700' : 'bg-surface-100 text-surface-500'}`}
                        onClick={() => updateElement(selectedElement.id, { textAlign: align })}>
                        {align === 'left' ? t.labelsTab.alignLeft : align === 'center' ? t.labelsTab.alignCenter : t.labelsTab.alignRight}
                      </button>
                    ))}
                  </div>
                </>
              )}
              {selectedElement.type === 'barcode' && (
                <div className="mb-2">
                  <label className="text-2xs text-surface-400">{t.labelsTab.barcodeField}</label>
                  <select value={selectedElement.content}
                    onChange={(e) => updateElement(selectedElement.id, { content: e.target.value })}
                    className="input-field text-xs w-full mt-0.5">
                    {AVAILABLE_FIELDS.map((f) => (
                      <option key={f.key} value={f.key}>{fieldLabels[f.key]}</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="grid grid-cols-2 gap-1.5 mb-2">
                <div>
                  <label className="text-2xs text-surface-400">X (mm)</label>
                  <input type="number" value={Math.round(selectedElement.x * 10) / 10}
                    onChange={(e) => updateElement(selectedElement.id, { x: Number(e.target.value) })}
                    className="input-field text-xs w-full mt-0.5" />
                </div>
                <div>
                  <label className="text-2xs text-surface-400">Y (mm)</label>
                  <input type="number" value={Math.round(selectedElement.y * 10) / 10}
                    onChange={(e) => updateElement(selectedElement.id, { y: Number(e.target.value) })}
                    className="input-field text-xs w-full mt-0.5" />
                </div>
                <div>
                  <label className="text-2xs text-surface-400">W (mm)</label>
                  <input type="number" value={Math.round(selectedElement.width * 10) / 10}
                    onChange={(e) => updateElement(selectedElement.id, { width: Number(e.target.value) })}
                    className="input-field text-xs w-full mt-0.5" />
                </div>
                <div>
                  <label className="text-2xs text-surface-400">H (mm)</label>
                  <input type="number" value={Math.round(selectedElement.height * 10) / 10}
                    onChange={(e) => updateElement(selectedElement.id, { height: Number(e.target.value) })}
                    className="input-field text-xs w-full mt-0.5" />
                </div>
              </div>
              <button className="btn-sm w-full text-red-600 bg-red-50 hover:bg-red-100 text-xs flex items-center justify-center gap-1"
                onClick={() => removeElement(selectedElement.id)}>
                <Trash2 className="w-3 h-3" /> {t.labelsTab.deleteElement}
              </button>
            </div>
          ) : (
            <div className="p-3 border-b border-surface-100 text-2xs text-surface-400 text-center">
              {t.labelsTab.dragHint}
            </div>
          )}

          <div className="p-2">
            <h4 className="text-2xs font-semibold text-surface-500 uppercase tracking-wider mb-1">
              {t.labelsTab.pieces} ({allPieces.length})
            </h4>
            <div className="space-y-0.5 max-h-96 overflow-y-auto">
              {allPieces.slice(0, 100).map((piece, idx) => (
                <div key={idx} className="px-2 py-1 text-xs hover:bg-surface-50 rounded flex justify-between">
                  <span className="font-mono text-surface-700">{piece.code}</span>
                  <span className="text-surface-400">{piece.originalWidth}×{piece.originalHeight}</span>
                </div>
              ))}
              {allPieces.length > 100 && (
                <div className="text-2xs text-surface-400 text-center py-1">+{allPieces.length - 100} more...</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
