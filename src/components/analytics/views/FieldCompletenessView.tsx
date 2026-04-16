import { useState, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, X, ChevronDown, Columns3, Filter, ListFilter, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'
import { usePipelineStages } from '@/hooks/usePipelineStages'
import { usePipelinePhases } from '@/hooks/usePipelinePhases'
import { useCurrentProductMeta } from '@/hooks/useCurrentProductMeta'
import { useProductContext } from '@/hooks/useProductContext'
import {
    useFieldCompleteness,
    EXTRA_COLUMNS,
    type ExtraColumnKey,
    type CardCompleteness,
} from '@/hooks/analytics/useFieldCompleteness'
import type { PipelinePhase, PipelineStage } from '@/types/pipeline'

// ── Constants ──────────────────────────────────────────────────────────

const PAGE_SIZE = 50
const LS_COLUMNS_KEY = 'completeness_selected_columns'
const LS_EXTRAS_KEY = 'completeness_selected_extras'

function loadFromLS(key: string): string[] | null {
    try {
        const v = localStorage.getItem(key)
        return v ? JSON.parse(v) : null
    } catch { return null }
}

function saveToLS(key: string, value: string[]) {
    localStorage.setItem(key, JSON.stringify(value))
}

// ── Stage Multi-Select (2 levels: phase + individual stages) ──────────

function StageSelector({
    phases,
    stages,
    selectedStageIds,
    onChange,
}: {
    phases: PipelinePhase[]
    stages: PipelineStage[]
    selectedStageIds: string[]
    onChange: (ids: string[]) => void
}) {
    const [expandedPhase, setExpandedPhase] = useState<string | null>(null)

    const stagesByPhase = useMemo(() => {
        const map = new Map<string, PipelineStage[]>()
        for (const s of stages) {
            if (!s.phase_id) continue
            const arr = map.get(s.phase_id) || []
            arr.push(s)
            map.set(s.phase_id, arr)
        }
        return map
    }, [stages])

    const getPhaseState = (phaseId: string): 'all' | 'some' | 'none' => {
        const phaseStages = stagesByPhase.get(phaseId) || []
        if (phaseStages.length === 0) return 'none'
        const selected = phaseStages.filter(s => selectedStageIds.includes(s.id))
        if (selected.length === phaseStages.length) return 'all'
        if (selected.length > 0) return 'some'
        return 'none'
    }

    const togglePhase = (phaseId: string) => {
        const phaseStages = stagesByPhase.get(phaseId) || []
        const phaseStageIds = phaseStages.map(s => s.id)
        const state = getPhaseState(phaseId)

        if (state === 'all') {
            // Deselect all
            onChange(selectedStageIds.filter(id => !phaseStageIds.includes(id)))
        } else {
            // Select all
            const current = new Set(selectedStageIds)
            for (const id of phaseStageIds) current.add(id)
            onChange([...current])
        }
    }

    const toggleStage = (stageId: string) => {
        if (selectedStageIds.includes(stageId)) {
            onChange(selectedStageIds.filter(id => id !== stageId))
        } else {
            onChange([...selectedStageIds, stageId])
        }
    }

    const toggleExpand = (phaseId: string) => {
        setExpandedPhase(prev => prev === phaseId ? null : phaseId)
    }

    return (
        <div className="space-y-1">
            <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">Etapas</label>
            <div className="flex flex-wrap gap-2">
                {phases.map(phase => {
                    const state = getPhaseState(phase.id)
                    const phaseStages = stagesByPhase.get(phase.id) || []
                    const isExpanded = expandedPhase === phase.id

                    return (
                        <div key={phase.id} className="relative">
                            <div className="flex items-center gap-0.5">
                                <button
                                    onClick={() => togglePhase(phase.id)}
                                    className={cn(
                                        'px-3 py-1.5 text-xs font-medium rounded-l-lg border transition-all',
                                        state === 'all' && 'bg-indigo-50 border-indigo-200 text-indigo-700',
                                        state === 'some' && 'bg-indigo-50/50 border-indigo-200 text-indigo-600',
                                        state === 'none' && 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50',
                                    )}
                                >
                                    {state === 'some' && <span className="inline-block w-1.5 h-1.5 rounded-full bg-indigo-400 mr-1.5" />}
                                    {phase.label}
                                </button>
                                <button
                                    onClick={() => toggleExpand(phase.id)}
                                    className={cn(
                                        'px-1.5 py-1.5 text-xs border border-l-0 rounded-r-lg transition-all',
                                        state !== 'none' ? 'bg-indigo-50 border-indigo-200 text-indigo-600' : 'bg-white border-slate-200 text-slate-400 hover:bg-slate-50',
                                    )}
                                >
                                    <ChevronDown className={cn('w-3 h-3 transition-transform', isExpanded && 'rotate-180')} />
                                </button>
                            </div>

                            {isExpanded && phaseStages.length > 0 && (
                                <div className="absolute top-full left-0 mt-1 z-20 bg-white border border-slate-200 rounded-lg shadow-lg p-2 min-w-[180px]">
                                    {phaseStages.map(stage => (
                                        <button
                                            key={stage.id}
                                            onClick={() => toggleStage(stage.id)}
                                            className={cn(
                                                'flex items-center gap-2 w-full px-2.5 py-1.5 text-xs rounded-md transition-all',
                                                selectedStageIds.includes(stage.id)
                                                    ? 'bg-indigo-50 text-indigo-700 font-medium'
                                                    : 'text-slate-600 hover:bg-slate-50',
                                            )}
                                        >
                                            <span
                                                className="w-2 h-2 rounded-full flex-shrink-0"
                                                style={{ backgroundColor: stage.cor || '#94a3b8' }}
                                            />
                                            {stage.nome}
                                            {selectedStageIds.includes(stage.id) && <Check className="w-3 h-3 ml-auto" />}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    )
                })}
            </div>
            {selectedStageIds.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                    {stages.filter(s => selectedStageIds.includes(s.id)).map(s => (
                        <span
                            key={s.id}
                            className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded-full bg-slate-100 text-slate-600"
                        >
                            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: s.cor || '#94a3b8' }} />
                            {s.nome}
                            <button onClick={() => toggleStage(s.id)} className="text-slate-400 hover:text-slate-600">
                                <X className="w-2.5 h-2.5" />
                            </button>
                        </span>
                    ))}
                </div>
            )}
        </div>
    )
}

// ── Column Manager (popover with checkboxes) ──────────────────────────

function ColumnManager({
    sections,
    selectedKeys,
    selectedExtras,
    onChangeKeys,
    onChangeExtras,
}: {
    sections: { key: string; label: string; fields: { key: string; label: string }[] }[]
    selectedKeys: string[]
    selectedExtras: ExtraColumnKey[]
    onChangeKeys: (keys: string[]) => void
    onChangeExtras: (keys: ExtraColumnKey[]) => void
}) {
    const [open, setOpen] = useState(false)
    const totalSelected = selectedKeys.length + selectedExtras.length

    const toggleField = (key: string) => {
        if (selectedKeys.includes(key)) {
            onChangeKeys(selectedKeys.filter(k => k !== key))
        } else {
            onChangeKeys([...selectedKeys, key])
        }
    }

    const toggleExtra = (key: ExtraColumnKey) => {
        if (selectedExtras.includes(key)) {
            onChangeExtras(selectedExtras.filter(k => k !== key))
        } else {
            onChangeExtras([...selectedExtras, key])
        }
    }

    const toggleSection = (sectionKey: string) => {
        const section = sections.find(s => s.key === sectionKey)
        if (!section) return

        if (sectionKey === '_extras') {
            const allExtras = EXTRA_COLUMNS.map(e => e.key)
            const allSelected = allExtras.every(k => selectedExtras.includes(k))
            if (allSelected) {
                onChangeExtras([])
            } else {
                onChangeExtras([...allExtras])
            }
            return
        }

        const sectionFieldKeys = section.fields.map(f => f.key)
        const allSelected = sectionFieldKeys.every(k => selectedKeys.includes(k))
        if (allSelected) {
            onChangeKeys(selectedKeys.filter(k => !sectionFieldKeys.includes(k)))
        } else {
            const current = new Set(selectedKeys)
            for (const k of sectionFieldKeys) current.add(k)
            onChangeKeys([...current])
        }
    }

    return (
        <div className="relative">
            <button
                onClick={() => setOpen(o => !o)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-all shadow-sm"
            >
                <Columns3 className="w-3.5 h-3.5 text-slate-500" />
                Colunas{totalSelected > 0 && `: ${totalSelected}`}
                <ChevronDown className={cn('w-3 h-3 text-slate-400 transition-transform', open && 'rotate-180')} />
            </button>

            {open && (
                <>
                    <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
                    <div className="absolute top-full left-0 mt-1 z-40 bg-white border border-slate-200 rounded-xl shadow-xl p-3 w-[280px] max-h-[400px] overflow-y-auto">
                        {sections.map(sec => {
                            const isExtras = sec.key === '_extras'
                            const sectionFieldKeys = sec.fields.map(f => f.key)
                            const allSelected = isExtras
                                ? EXTRA_COLUMNS.every(e => selectedExtras.includes(e.key))
                                : sectionFieldKeys.every(k => selectedKeys.includes(k))
                            const someSelected = isExtras
                                ? EXTRA_COLUMNS.some(e => selectedExtras.includes(e.key))
                                : sectionFieldKeys.some(k => selectedKeys.includes(k))

                            return (
                                <div key={sec.key} className="mb-3 last:mb-0">
                                    <button
                                        onClick={() => toggleSection(sec.key)}
                                        className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 hover:text-slate-600 transition-colors"
                                    >
                                        <span className={cn(
                                            'w-3 h-3 rounded border flex items-center justify-center flex-shrink-0',
                                            allSelected ? 'bg-indigo-600 border-indigo-600' : someSelected ? 'border-indigo-300 bg-indigo-50' : 'border-slate-300',
                                        )}>
                                            {allSelected && <Check className="w-2 h-2 text-white" />}
                                            {!allSelected && someSelected && <span className="w-1 h-1 rounded-full bg-indigo-400" />}
                                        </span>
                                        {sec.label}
                                    </button>
                                    <div className="space-y-0.5 ml-1">
                                        {sec.fields.map(f => {
                                            const isSelected = isExtras
                                                ? selectedExtras.includes(f.key as ExtraColumnKey)
                                                : selectedKeys.includes(f.key)

                                            return (
                                                <button
                                                    key={f.key}
                                                    onClick={() => isExtras ? toggleExtra(f.key as ExtraColumnKey) : toggleField(f.key)}
                                                    className={cn(
                                                        'flex items-center gap-2 w-full px-2 py-1 text-xs rounded transition-all',
                                                        isSelected ? 'text-indigo-700 bg-indigo-50/50' : 'text-slate-600 hover:bg-slate-50',
                                                    )}
                                                >
                                                    <span className={cn(
                                                        'w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0',
                                                        isSelected ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300',
                                                    )}>
                                                        {isSelected && <Check className="w-2.5 h-2.5 text-white" />}
                                                    </span>
                                                    {f.label}
                                                </button>
                                            )
                                        })}
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </>
            )}
        </div>
    )
}

// ── Filter Bar ─────────────────────────────────────────────────────────

type FieldFilter = { key: string; mode: 'filled' | 'empty' }

function FilterManager({
    allColumns,
    filters,
    onChange,
}: {
    allColumns: { key: string; label: string }[]
    filters: FieldFilter[]
    onChange: (filters: FieldFilter[]) => void
}) {
    const [open, setOpen] = useState(false)

    const addFilter = (key: string, mode: 'filled' | 'empty') => {
        // Replace if same key exists
        const existing = filters.filter(f => f.key !== key)
        onChange([...existing, { key, mode }])
        setOpen(false)
    }

    const removeFilter = (key: string) => {
        onChange(filters.filter(f => f.key !== key))
    }

    const colLabel = (key: string) => allColumns.find(c => c.key === key)?.label || key

    return (
        <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
                <button
                    onClick={() => setOpen(o => !o)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-all shadow-sm"
                >
                    <ListFilter className="w-3.5 h-3.5 text-slate-500" />
                    Filtrar
                </button>

                {open && (
                    <>
                        <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
                        <div className="absolute top-full left-0 mt-1 z-40 bg-white border border-slate-200 rounded-xl shadow-xl p-2 w-[240px] max-h-[300px] overflow-y-auto">
                            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-2 py-1">Mostrar leads onde...</div>
                            {allColumns.map(col => (
                                <div key={col.key} className="flex items-center gap-1 px-1 py-0.5">
                                    <span className="text-xs text-slate-600 flex-1 truncate">{col.label}</span>
                                    <button
                                        onClick={() => addFilter(col.key, 'empty')}
                                        className="px-2 py-0.5 text-[10px] rounded bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
                                    >
                                        vazio
                                    </button>
                                    <button
                                        onClick={() => addFilter(col.key, 'filled')}
                                        className="px-2 py-0.5 text-[10px] rounded bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-colors"
                                    >
                                        preenchido
                                    </button>
                                </div>
                            ))}
                        </div>
                    </>
                )}
            </div>

            {filters.map(f => (
                <span
                    key={f.key}
                    className={cn(
                        'inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded-full',
                        f.mode === 'empty' ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700',
                    )}
                >
                    {colLabel(f.key)}: {f.mode === 'empty' ? 'vazio' : 'preenchido'}
                    <button onClick={() => removeFilter(f.key)} className="hover:opacity-70">
                        <X className="w-2.5 h-2.5" />
                    </button>
                </span>
            ))}
        </div>
    )
}

// ── Main View ──────────────────────────────────────────────────────────

export default function FieldCompletenessView() {
    const navigate = useNavigate()
    const { currentProduct } = useProductContext()
    const { pipelineId } = useCurrentProductMeta()
    const { data: phases = [] } = usePipelinePhases(pipelineId ?? undefined)
    const { data: stages = [] } = usePipelineStages(pipelineId ?? undefined)

    // State
    const [selectedStageIds, setSelectedStageIds] = useState<string[]>([])
    const [selectedFieldKeys, setSelectedFieldKeys] = useState<string[]>(() => loadFromLS(LS_COLUMNS_KEY) || [])
    const [selectedExtras, setSelectedExtras] = useState<ExtraColumnKey[]>(() => (loadFromLS(LS_EXTRAS_KEY) || []) as ExtraColumnKey[])
    const [fieldFilters, setFieldFilters] = useState<FieldFilter[]>([])
    const [page, setPage] = useState(0)
    const [sortCol, setSortCol] = useState<string | null>(null)
    const [sortAsc, setSortAsc] = useState(true)

    const handleSetFieldKeys = useCallback((keys: string[]) => {
        setSelectedFieldKeys(keys)
        saveToLS(LS_COLUMNS_KEY, keys)
        setPage(0)
    }, [])

    const handleSetExtras = useCallback((keys: ExtraColumnKey[]) => {
        setSelectedExtras(keys)
        saveToLS(LS_EXTRAS_KEY, keys)
        setPage(0)
    }, [])

    const { selectableFields, rows, fieldTypeMap, isLoading } = useFieldCompleteness({
        stageIds: selectedStageIds,
        selectedFieldKeys,
        selectedExtraKeys: selectedExtras,
        productFilter: currentProduct,
    })

    // All visible columns (for filter dropdown)
    const allColumns = useMemo(() => {
        const cols: { key: string; label: string }[] = []
        for (const sec of selectableFields) {
            for (const f of sec.fields) {
                if (selectedFieldKeys.includes(f.key) || selectedExtras.includes(f.key as ExtraColumnKey)) {
                    cols.push({ key: f.key, label: f.label })
                }
            }
        }
        return cols
    }, [selectableFields, selectedFieldKeys, selectedExtras])

    // Apply filters
    const filteredRows = useMemo(() => {
        if (fieldFilters.length === 0) return rows
        return rows.filter(row =>
            fieldFilters.every(f => {
                const isFilled = row.filled[f.key] ?? false
                return f.mode === 'filled' ? isFilled : !isFilled
            })
        )
    }, [rows, fieldFilters])

    // Sort
    const sortedRows = useMemo(() => {
        if (!sortCol) return filteredRows
        const sorted = [...filteredRows]
        sorted.sort((a, b) => {
            if (sortCol === '_titulo') {
                const va = a.card.titulo || ''
                const vb = b.card.titulo || ''
                return sortAsc ? va.localeCompare(vb) : vb.localeCompare(va)
            }
            if (sortCol === '_etapa') {
                const va = a.card.etapa_nome || ''
                const vb = b.card.etapa_nome || ''
                return sortAsc ? va.localeCompare(vb) : vb.localeCompare(va)
            }
            if (sortCol === '_dono') {
                const va = a.card.dono_atual_nome || ''
                const vb = b.card.dono_atual_nome || ''
                return sortAsc ? va.localeCompare(vb) : vb.localeCompare(va)
            }
            // Date column: sort by actual date value
            const fieldType = fieldTypeMap.get(sortCol)
            if (fieldType && ['date', 'date_range', 'flexible_date'].includes(fieldType)) {
                const da = a.values[sortCol] || ''
                const db = b.values[sortCol] || ''
                if (!da && !db) return 0
                if (!da) return sortAsc ? -1 : 1
                if (!db) return sortAsc ? 1 : -1
                return sortAsc ? da.localeCompare(db) : db.localeCompare(da)
            }
            // Boolean column: sort by filled (true first when asc)
            const fa = a.filled[sortCol] ? 1 : 0
            const fb = b.filled[sortCol] ? 1 : 0
            return sortAsc ? fa - fb : fb - fa
        })
        return sorted
    }, [filteredRows, sortCol, sortAsc, fieldTypeMap])

    // Paginate
    const totalPages = Math.max(1, Math.ceil(sortedRows.length / PAGE_SIZE))
    const pagedRows = sortedRows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

    const handleSort = (col: string) => {
        if (sortCol === col) {
            setSortAsc(prev => !prev)
        } else {
            setSortCol(col)
            setSortAsc(true)
        }
    }



    // ── Render ──

    const hasColumns = selectedFieldKeys.length + selectedExtras.length > 0
    const hasStages = selectedStageIds.length > 0

    return (
        <div className="space-y-4">
            {/* Stage Selector */}
            <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-4">
                <StageSelector
                    phases={phases}
                    stages={stages}
                    selectedStageIds={selectedStageIds}
                    onChange={ids => { setSelectedStageIds(ids); setPage(0) }}
                />
            </div>

            {/* Controls Bar */}
            <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-3 flex items-center gap-3 flex-wrap">
                <ColumnManager
                    sections={selectableFields}
                    selectedKeys={selectedFieldKeys}
                    selectedExtras={selectedExtras}
                    onChangeKeys={handleSetFieldKeys}
                    onChangeExtras={handleSetExtras}
                />

                {hasColumns && (
                    <FilterManager
                        allColumns={allColumns}
                        filters={fieldFilters}
                        onChange={f => { setFieldFilters(f); setPage(0) }}
                    />
                )}

                <span className="text-xs text-slate-400 ml-auto">
                    {hasStages
                        ? `${filteredRows.length} lead${filteredRows.length !== 1 ? 's' : ''} encontrado${filteredRows.length !== 1 ? 's' : ''}`
                        : 'Selecione etapas acima'
                    }
                </span>
            </div>

            {/* Table */}
            {!hasStages ? (
                <EmptyState message="Selecione uma ou mais etapas para ver os leads" />
            ) : !hasColumns ? (
                <EmptyState message="Selecione colunas para verificar o preenchimento" />
            ) : isLoading ? (
                <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-12 flex items-center justify-center">
                    <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                </div>
            ) : pagedRows.length === 0 ? (
                <EmptyState message="Nenhum lead encontrado com os filtros aplicados" />
            ) : (
                <div className="bg-white border border-slate-200 shadow-sm rounded-xl overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-slate-200 bg-slate-50/50">
                                    <SortableHeader col="_titulo" label="Lead" sortCol={sortCol} sortAsc={sortAsc} onClick={handleSort} sticky />
                                    <SortableHeader col="_etapa" label="Etapa" sortCol={sortCol} sortAsc={sortAsc} onClick={handleSort} />
                                    <SortableHeader col="_dono" label="Dono" sortCol={sortCol} sortAsc={sortAsc} onClick={handleSort} />
                                    {selectedFieldKeys.map(fk => {
                                        const field = selectableFields.flatMap(s => s.fields).find(f => f.key === fk)
                                        return (
                                            <SortableHeader
                                                key={fk}
                                                col={fk}
                                                label={field?.label || fk}
                                                sortCol={sortCol}
                                                sortAsc={sortAsc}
                                                onClick={handleSort}
                                            />
                                        )
                                    })}
                                    {selectedExtras.map(ek => {
                                        const extra = EXTRA_COLUMNS.find(e => e.key === ek)
                                        return (
                                            <SortableHeader
                                                key={ek}
                                                col={ek}
                                                label={extra?.label || ek}
                                                sortCol={sortCol}
                                                sortAsc={sortAsc}
                                                onClick={handleSort}
                                            />
                                        )
                                    })}
                                </tr>
                            </thead>
                            <tbody>
                                {pagedRows.map(row => (
                                    <CardRow
                                        key={row.card.id}
                                        row={row}
                                        fieldKeys={selectedFieldKeys}
                                        extraKeys={selectedExtras}
                                        fieldTypeMap={fieldTypeMap}
                                        onNavigate={() => navigate(`/cards/${row.card.id}`)}
                                    />
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination */}
                    {totalPages > 1 && (
                        <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100">
                            <span className="text-xs text-slate-400">
                                Página {page + 1} de {totalPages}
                            </span>
                            <div className="flex items-center gap-1">
                                <button
                                    onClick={() => setPage(p => Math.max(0, p - 1))}
                                    disabled={page === 0}
                                    className="px-2.5 py-1 text-xs rounded border border-slate-200 disabled:opacity-40 hover:bg-slate-50 transition-colors"
                                >
                                    Anterior
                                </button>
                                <button
                                    onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                                    disabled={page >= totalPages - 1}
                                    className="px-2.5 py-1 text-xs rounded border border-slate-200 disabled:opacity-40 hover:bg-slate-50 transition-colors"
                                >
                                    Próximo
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}

// ── Sub-components ─────────────────────────────────────────────────────

function SortableHeader({
    col, label, sortCol, sortAsc, onClick, sticky,
}: {
    col: string; label: string; sortCol: string | null; sortAsc: boolean; onClick: (col: string) => void; sticky?: boolean
}) {
    const isActive = sortCol === col
    return (
        <th
            onClick={() => onClick(col)}
            className={cn(
                'px-3 py-2.5 text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest cursor-pointer select-none whitespace-nowrap hover:text-slate-600 transition-colors',
                sticky && 'sticky left-0 z-10 bg-slate-50/50',
                isActive && 'text-indigo-600',
            )}
        >
            {label}
            {isActive && <span className="ml-0.5">{sortAsc ? '↑' : '↓'}</span>}
        </th>
    )
}

const DATE_TYPES = new Set(['date', 'date_range', 'flexible_date'])

function formatDateBR(iso: string | null): string {
    if (!iso) return ''
    const [y, m, d] = iso.split('-')
    if (!y || !m || !d) return iso
    return `${d}/${m}/${y}`
}

function CardRow({
    row,
    fieldKeys,
    extraKeys,
    fieldTypeMap,
    onNavigate,
}: {
    row: CardCompleteness
    fieldKeys: string[]
    extraKeys: ExtraColumnKey[]
    fieldTypeMap: Map<string, string>
    onNavigate: () => void
}) {
    const { card, filled, values } = row

    return (
        <tr className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50 transition-colors">
            <td className="px-3 py-2.5 sticky left-0 bg-white z-10">
                <button
                    onClick={onNavigate}
                    className="flex items-center gap-1.5 text-sm font-medium text-slate-900 hover:text-indigo-600 transition-colors group max-w-[200px]"
                >
                    <span className="truncate">{card.titulo || '(sem título)'}</span>
                    <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-60 flex-shrink-0" />
                </button>
                {card.pessoa_nome && (
                    <div className="text-[11px] text-slate-400 truncate max-w-[200px]">{card.pessoa_nome}</div>
                )}
            </td>
            <td className="px-3 py-2.5 text-xs text-slate-600 whitespace-nowrap">{card.etapa_nome || '—'}</td>
            <td className="px-3 py-2.5 text-xs text-slate-600 whitespace-nowrap">{card.dono_atual_nome || '—'}</td>
            {fieldKeys.map(fk => {
                const fieldType = fieldTypeMap.get(fk)
                const isDate = fieldType && DATE_TYPES.has(fieldType)

                if (isDate) {
                    const dateVal = values[fk]
                    return (
                        <td key={fk} className="px-3 py-2.5 text-center whitespace-nowrap">
                            {dateVal
                                ? <span className="text-xs text-slate-700">{formatDateBR(dateVal)}</span>
                                : <X className="w-4 h-4 text-slate-300 mx-auto" />
                            }
                        </td>
                    )
                }

                return (
                    <td key={fk} className="px-3 py-2.5 text-center">
                        <FillIndicator filled={filled[fk] ?? false} />
                    </td>
                )
            })}
            {extraKeys.map(ek => (
                <td key={ek} className="px-3 py-2.5 text-center">
                    <FillIndicator filled={filled[ek] ?? false} />
                </td>
            ))}
        </tr>
    )
}

function FillIndicator({ filled }: { filled: boolean }) {
    return filled
        ? <Check className="w-4 h-4 text-emerald-500 mx-auto" />
        : <X className="w-4 h-4 text-slate-300 mx-auto" />
}

function EmptyState({ message }: { message: string }) {
    return (
        <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-12 text-center">
            <Filter className="w-8 h-8 text-slate-300 mx-auto mb-3" />
            <p className="text-sm text-slate-500">{message}</p>
        </div>
    )
}
