import { useState, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, X, ChevronDown, Columns3, Filter, ListFilter, ExternalLink, ClipboardList, ArrowRight, UserPlus, Zap, Download, Bell, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { usePipelineStages } from '@/hooks/usePipelineStages'
import { usePipelinePhases } from '@/hooks/usePipelinePhases'
import { useCurrentProductMeta } from '@/hooks/useCurrentProductMeta'
import { useProductContext } from '@/hooks/useProductContext'
import { useBulkLeadActions } from '@/hooks/useBulkLeadActions'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { toast } from 'sonner'
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
            onChange(selectedStageIds.filter(id => !phaseStageIds.includes(id)))
        } else {
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
                                            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: stage.cor || '#94a3b8' }} />
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
                        <span key={s.id} className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded-full bg-slate-100 text-slate-600">
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

// ── Column Manager ────────────────────────────────────────────────────

function ColumnManager({
    sections, selectedKeys, selectedExtras, onChangeKeys, onChangeExtras,
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
        if (selectedKeys.includes(key)) { onChangeKeys(selectedKeys.filter(k => k !== key)) } else { onChangeKeys([...selectedKeys, key]) }
    }
    const toggleExtra = (key: ExtraColumnKey) => {
        if (selectedExtras.includes(key)) { onChangeExtras(selectedExtras.filter(k => k !== key)) } else { onChangeExtras([...selectedExtras, key]) }
    }
    const toggleSection = (sectionKey: string) => {
        const section = sections.find(s => s.key === sectionKey)
        if (!section) return
        if (sectionKey === '_extras') {
            const allExtras = EXTRA_COLUMNS.map(e => e.key)
            if (allExtras.every(k => selectedExtras.includes(k))) { onChangeExtras([]) } else { onChangeExtras([...allExtras]) }
            return
        }
        const keys = section.fields.map(f => f.key)
        if (keys.every(k => selectedKeys.includes(k))) {
            onChangeKeys(selectedKeys.filter(k => !keys.includes(k)))
        } else {
            onChangeKeys([...new Set([...selectedKeys, ...keys])])
        }
    }

    return (
        <div className="relative">
            <button onClick={() => setOpen(o => !o)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-all shadow-sm">
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
                            const keys = sec.fields.map(f => f.key)
                            const allSel = isExtras ? EXTRA_COLUMNS.every(e => selectedExtras.includes(e.key)) : keys.every(k => selectedKeys.includes(k))
                            const someSel = isExtras ? EXTRA_COLUMNS.some(e => selectedExtras.includes(e.key)) : keys.some(k => selectedKeys.includes(k))
                            return (
                                <div key={sec.key} className="mb-3 last:mb-0">
                                    <button onClick={() => toggleSection(sec.key)} className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 hover:text-slate-600 transition-colors">
                                        <span className={cn('w-3 h-3 rounded border flex items-center justify-center flex-shrink-0', allSel ? 'bg-indigo-600 border-indigo-600' : someSel ? 'border-indigo-300 bg-indigo-50' : 'border-slate-300')}>
                                            {allSel && <Check className="w-2 h-2 text-white" />}
                                            {!allSel && someSel && <span className="w-1 h-1 rounded-full bg-indigo-400" />}
                                        </span>
                                        {sec.label}
                                    </button>
                                    <div className="space-y-0.5 ml-1">
                                        {sec.fields.map(f => {
                                            const isSel = isExtras ? selectedExtras.includes(f.key as ExtraColumnKey) : selectedKeys.includes(f.key)
                                            return (
                                                <button key={f.key} onClick={() => isExtras ? toggleExtra(f.key as ExtraColumnKey) : toggleField(f.key)} className={cn('flex items-center gap-2 w-full px-2 py-1 text-xs rounded transition-all', isSel ? 'text-indigo-700 bg-indigo-50/50' : 'text-slate-600 hover:bg-slate-50')}>
                                                    <span className={cn('w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0', isSel ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300')}>
                                                        {isSel && <Check className="w-2.5 h-2.5 text-white" />}
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

function FilterManager({ allColumns, filters, onChange }: {
    allColumns: { key: string; label: string }[]
    filters: FieldFilter[]
    onChange: (filters: FieldFilter[]) => void
}) {
    const [open, setOpen] = useState(false)
    const addFilter = (key: string, mode: 'filled' | 'empty') => {
        onChange([...filters.filter(f => f.key !== key), { key, mode }])
        setOpen(false)
    }
    const removeFilter = (key: string) => onChange(filters.filter(f => f.key !== key))
    const colLabel = (key: string) => allColumns.find(c => c.key === key)?.label || key

    return (
        <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
                <button onClick={() => setOpen(o => !o)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-all shadow-sm">
                    <ListFilter className="w-3.5 h-3.5 text-slate-500" />
                    Filtrar
                </button>
                {open && (
                    <>
                        <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
                        <div className="absolute top-full left-0 mt-1 z-40 bg-white border border-slate-200 rounded-xl shadow-xl p-2 w-[360px] max-h-[300px] overflow-y-auto">
                            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-2 py-1">Mostrar leads onde...</div>
                            {allColumns.map(col => (
                                <div key={col.key} className="flex items-center gap-2 px-1 py-1">
                                    <span className="text-xs text-slate-600 flex-1">{col.label}</span>
                                    <button onClick={() => addFilter(col.key, 'empty')} className="px-2.5 py-0.5 text-[10px] rounded bg-red-50 text-red-600 hover:bg-red-100 transition-colors whitespace-nowrap flex-shrink-0">vazio</button>
                                    <button onClick={() => addFilter(col.key, 'filled')} className="px-2.5 py-0.5 text-[10px] rounded bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-colors whitespace-nowrap flex-shrink-0">preenchido</button>
                                </div>
                            ))}
                        </div>
                    </>
                )}
            </div>
            {filters.map(f => (
                <span key={f.key} className={cn('inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded-full', f.mode === 'empty' ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700')}>
                    {colLabel(f.key)}: {f.mode === 'empty' ? 'vazio' : 'preenchido'}
                    <button onClick={() => removeFilter(f.key)} className="hover:opacity-70"><X className="w-2.5 h-2.5" /></button>
                </span>
            ))}
        </div>
    )
}

// ── Bulk Task Modal ───────────────────────────────────────────────────

function BulkTaskModal({ cardCount, onConfirm, onClose }: {
    cardCount: number
    onConfirm: (titulo: string, prazo: string, prioridade: string) => void
    onClose: () => void
}) {
    const [titulo, setTitulo] = useState('Completar dados do lead')
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 3)
    const [prazo, setPrazo] = useState(tomorrow.toISOString().slice(0, 10))
    const [prioridade, setPrioridade] = useState('media')

    return (
        <>
            <div className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm" onClick={onClose} />
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 space-y-4">
                    <h3 className="text-base font-semibold text-slate-900">Criar tarefa para {cardCount} lead{cardCount > 1 ? 's' : ''}</h3>
                    <div className="space-y-3">
                        <div>
                            <label className="text-xs font-medium text-slate-500 mb-1 block">Título da tarefa</label>
                            <input type="text" value={titulo} onChange={e => setTitulo(e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500" />
                        </div>
                        <div className="flex gap-3">
                            <div className="flex-1">
                                <label className="text-xs font-medium text-slate-500 mb-1 block">Prazo</label>
                                <input type="date" value={prazo} onChange={e => setPrazo(e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500" />
                            </div>
                            <div className="flex-1">
                                <label className="text-xs font-medium text-slate-500 mb-1 block">Prioridade</label>
                                <select value={prioridade} onChange={e => setPrioridade(e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500">
                                    <option value="alta">Alta</option>
                                    <option value="media">Média</option>
                                    <option value="baixa">Baixa</option>
                                </select>
                            </div>
                        </div>
                    </div>
                    <p className="text-xs text-slate-400">Cada lead receberá uma tarefa atribuída ao seu dono atual.</p>
                    <div className="flex justify-end gap-2 pt-2">
                        <button onClick={onClose} className="px-4 py-2 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">Cancelar</button>
                        <button onClick={() => onConfirm(titulo, prazo, prioridade)} disabled={!titulo.trim()} className="px-4 py-2 text-xs font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-40">Criar tarefas</button>
                    </div>
                </div>
            </div>
        </>
    )
}

// ── Bulk Stage Move Dropdown ──────────────────────────────────────────

function StageMoveDropdown({ stages, onSelect, onClose }: {
    stages: PipelineStage[]
    onSelect: (stageId: string) => void
    onClose: () => void
}) {
    return (
        <>
            <div className="fixed inset-0 z-50" onClick={onClose} />
            <div className="absolute bottom-full left-0 mb-1 z-50 bg-white border border-slate-200 rounded-xl shadow-xl p-2 w-[220px] max-h-[250px] overflow-y-auto">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-2 py-1 mb-1">Mover para...</div>
                {stages.map(s => (
                    <button key={s.id} onClick={() => { onSelect(s.id); onClose() }} className="flex items-center gap-2 w-full px-2.5 py-1.5 text-xs rounded-md text-slate-600 hover:bg-slate-50 transition-all">
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: s.cor || '#94a3b8' }} />
                        {s.nome}
                    </button>
                ))}
            </div>
        </>
    )
}

// ── Bulk Owner Modal ──────────────────────────────────────────────────

function OwnerAssignModal({ cardCount, onConfirm, onClose }: {
    cardCount: number
    onConfirm: (field: string, ownerId: string) => void
    onClose: () => void
}) {
    const [field, setField] = useState('dono_atual_id')
    const [ownerId, setOwnerId] = useState('')

    const { data: profiles } = useQuery({
        queryKey: ['profiles-active-list'],
        queryFn: async () => {
            const { data } = await supabase.from('profiles').select('id, nome, email').eq('active', true).order('nome')
            return data ?? []
        },
        staleTime: 1000 * 60 * 5,
    })

    return (
        <>
            <div className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm" onClick={onClose} />
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 space-y-4">
                    <h3 className="text-base font-semibold text-slate-900">Atribuir dono para {cardCount} lead{cardCount > 1 ? 's' : ''}</h3>
                    <div className="space-y-3">
                        <div>
                            <label className="text-xs font-medium text-slate-500 mb-1 block">Tipo de dono</label>
                            <select value={field} onChange={e => setField(e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500">
                                <option value="dono_atual_id">Dono Atual</option>
                                <option value="sdr_owner_id">SDR</option>
                                <option value="vendas_owner_id">Planejamento</option>
                                <option value="pos_owner_id">Pós-Venda</option>
                            </select>
                        </div>
                        <div>
                            <label className="text-xs font-medium text-slate-500 mb-1 block">Pessoa</label>
                            <select value={ownerId} onChange={e => setOwnerId(e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500">
                                <option value="">Selecione...</option>
                                {profiles?.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                            </select>
                        </div>
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                        <button onClick={onClose} className="px-4 py-2 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">Cancelar</button>
                        <button onClick={() => onConfirm(field, ownerId)} disabled={!ownerId} className="px-4 py-2 text-xs font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-40">Atribuir</button>
                    </div>
                </div>
            </div>
        </>
    )
}

// ── Bulk Priority Dropdown ────────────────────────────────────────────

function PriorityDropdown({ onSelect, onClose }: {
    onSelect: (p: 'alta' | 'media' | 'baixa') => void
    onClose: () => void
}) {
    return (
        <>
            <div className="fixed inset-0 z-50" onClick={onClose} />
            <div className="absolute bottom-full left-0 mb-1 z-50 bg-white border border-slate-200 rounded-xl shadow-xl p-2 w-[140px]">
                {([['alta', 'Alta', 'text-red-600'], ['media', 'Média', 'text-amber-600'], ['baixa', 'Baixa', 'text-slate-600']] as const).map(([val, label, color]) => (
                    <button key={val} onClick={() => { onSelect(val); onClose() }} className={`flex items-center gap-2 w-full px-2.5 py-1.5 text-xs rounded-md hover:bg-slate-50 ${color}`}>{label}</button>
                ))}
            </div>
        </>
    )
}

// ── Bulk Alert Modal ──────────────────────────────────────────────────

function BulkAlertModal({ cardCount, onConfirm, onClose }: {
    cardCount: number
    onConfirm: (titulo: string, corpo: string) => void
    onClose: () => void
}) {
    const [titulo, setTitulo] = useState('Dados incompletos nos seus leads')
    const [corpo, setCorpo] = useState('Por favor, complete os dados pendentes dos leads abaixo.')

    return (
        <>
            <div className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm" onClick={onClose} />
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 space-y-4">
                    <h3 className="text-base font-semibold text-slate-900">Enviar alerta para donos de {cardCount} lead{cardCount > 1 ? 's' : ''}</h3>
                    <div className="space-y-3">
                        <div>
                            <label className="text-xs font-medium text-slate-500 mb-1 block">Título do alerta</label>
                            <input type="text" value={titulo} onChange={e => setTitulo(e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500" />
                        </div>
                        <div>
                            <label className="text-xs font-medium text-slate-500 mb-1 block">Mensagem</label>
                            <textarea value={corpo} onChange={e => setCorpo(e.target.value)} rows={3} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 resize-none" />
                        </div>
                    </div>
                    <p className="text-xs text-slate-400">Cada dono receberá 1 alerta com a lista dos seus leads. Os leads serão agrupados por dono.</p>
                    <div className="flex justify-end gap-2 pt-2">
                        <button onClick={onClose} className="px-4 py-2 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">Cancelar</button>
                        <button onClick={() => onConfirm(titulo, corpo)} disabled={!titulo.trim()} className="px-4 py-2 text-xs font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-40">Enviar alertas</button>
                    </div>
                </div>
            </div>
        </>
    )
}

// ── CSV Export ─────────────────────────────────────────────────────────

function exportCSV(
    rows: CardCompleteness[],
    fieldKeys: string[],
    extraKeys: ExtraColumnKey[],
    allColumns: { key: string; label: string }[],
    fieldTypeMap: Map<string, string>,
) {
    const DATE_TYPES = new Set(['date', 'date_range', 'flexible_date'])
    const headers = ['Lead', 'Contato', 'Etapa', 'Dono', ...allColumns.map(c => c.label)]
    const csvRows = rows.map(({ card, filled, values }) => {
        const base = [
            card.titulo || '',
            card.pessoa_nome || '',
            card.etapa_nome || '',
            card.dono_atual_nome || '',
        ]
        const fields = [...fieldKeys, ...extraKeys].map(key => {
            const ft = fieldTypeMap.get(key)
            if (ft && DATE_TYPES.has(ft)) {
                const v = values[key]
                if (!v) return 'vazio'
                const [y, m, d] = v.split('-')
                return `${d}/${m}/${y}`
            }
            return filled[key] ? 'preenchido' : 'vazio'
        })
        return [...base, ...fields]
    })

    const escape = (s: string) => s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s
    const csv = [headers.map(escape).join(','), ...csvRows.map(r => r.map(escape).join(','))].join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `preenchimento_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success(`CSV exportado com ${rows.length} leads`)
}

// ── Main View ──────────────────────────────────────────────────────────

export default function FieldCompletenessView() {
    const navigate = useNavigate()
    const { currentProduct } = useProductContext()
    const { pipelineId } = useCurrentProductMeta()
    const { data: phases = [] } = usePipelinePhases(pipelineId ?? undefined)
    const { data: stages = [] } = usePipelineStages(pipelineId ?? undefined)
    const { profile } = useAuth()
    const queryClient = useQueryClient()
    const { bulkMoveStage, bulkChangeOwner, bulkChangePriority, isLoading: bulkLoading } = useBulkLeadActions()

    // State
    const [selectedStageIds, setSelectedStageIds] = useState<string[]>([])
    const [selectedFieldKeys, setSelectedFieldKeys] = useState<string[]>(() => loadFromLS(LS_COLUMNS_KEY) || [])
    const [selectedExtras, setSelectedExtras] = useState<ExtraColumnKey[]>(() => (loadFromLS(LS_EXTRAS_KEY) || []) as ExtraColumnKey[])
    const [fieldFilters, setFieldFilters] = useState<FieldFilter[]>([])
    const [searchTerm, setSearchTerm] = useState('')
    const [page, setPage] = useState(0)
    const [sortCol, setSortCol] = useState<string | null>(null)
    const [sortAsc, setSortAsc] = useState(true)

    // Selection state
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

    // Bulk action modals
    const [showTaskModal, setShowTaskModal] = useState(false)
    const [showStageDropdown, setShowStageDropdown] = useState(false)
    const [showOwnerModal, setShowOwnerModal] = useState(false)
    const [showPriorityDropdown, setShowPriorityDropdown] = useState(false)
    const [showAlertModal, setShowAlertModal] = useState(false)

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

    const filteredRows = useMemo(() => {
        let result = rows

        // Text search
        if (searchTerm.trim()) {
            const term = searchTerm.toLowerCase().trim()
            result = result.filter(row =>
                (row.card.titulo || '').toLowerCase().includes(term) ||
                (row.card.pessoa_nome || '').toLowerCase().includes(term) ||
                (row.card.dono_atual_nome || '').toLowerCase().includes(term)
            )
        }

        // Field filters
        if (fieldFilters.length > 0) {
            result = result.filter(row => fieldFilters.every(f => {
                const isFilled = row.filled[f.key] ?? false
                return f.mode === 'filled' ? isFilled : !isFilled
            }))
        }

        return result
    }, [rows, fieldFilters, searchTerm])

    const sortedRows = useMemo(() => {
        if (!sortCol) return filteredRows
        const sorted = [...filteredRows]
        sorted.sort((a, b) => {
            if (sortCol === '_titulo') return sortAsc ? (a.card.titulo || '').localeCompare(b.card.titulo || '') : (b.card.titulo || '').localeCompare(a.card.titulo || '')
            if (sortCol === '_etapa') return sortAsc ? (a.card.etapa_nome || '').localeCompare(b.card.etapa_nome || '') : (b.card.etapa_nome || '').localeCompare(a.card.etapa_nome || '')
            if (sortCol === '_dono') return sortAsc ? (a.card.dono_atual_nome || '').localeCompare(b.card.dono_atual_nome || '') : (b.card.dono_atual_nome || '').localeCompare(a.card.dono_atual_nome || '')
            const ft = fieldTypeMap.get(sortCol)
            if (ft && ['date', 'date_range', 'flexible_date'].includes(ft)) {
                const da = a.values[sortCol] || '', db = b.values[sortCol] || ''
                if (!da && !db) return 0
                if (!da) return sortAsc ? -1 : 1
                if (!db) return sortAsc ? 1 : -1
                return sortAsc ? da.localeCompare(db) : db.localeCompare(da)
            }
            return sortAsc ? (a.filled[sortCol] ? 1 : 0) - (b.filled[sortCol] ? 1 : 0) : (b.filled[sortCol] ? 1 : 0) - (a.filled[sortCol] ? 1 : 0)
        })
        return sorted
    }, [filteredRows, sortCol, sortAsc, fieldTypeMap])

    const totalPages = Math.max(1, Math.ceil(sortedRows.length / PAGE_SIZE))
    const pagedRows = sortedRows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

    const handleSort = (col: string) => {
        if (sortCol === col) setSortAsc(prev => !prev)
        else { setSortCol(col); setSortAsc(true) }
    }

    // Selection helpers
    const toggleSelect = (id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev)
            if (next.has(id)) { next.delete(id) } else { next.add(id) }
            return next
        })
    }
    const toggleSelectAll = () => {
        const pageIds = pagedRows.map(r => r.card.id!).filter(Boolean)
        const allSelected = pageIds.every(id => selectedIds.has(id))
        setSelectedIds(prev => {
            const next = new Set(prev)
            if (allSelected) { pageIds.forEach(id => next.delete(id)) }
            else { pageIds.forEach(id => next.add(id)) }
            return next
        })
    }
    const clearSelection = () => setSelectedIds(new Set())

    // Get selected card IDs as array
    const selectedCardIds = useMemo(() => [...selectedIds], [selectedIds])
    const selectedCards = useMemo(() => rows.filter(r => r.card.id && selectedIds.has(r.card.id)), [rows, selectedIds])

    // ── Bulk action handlers ──

    const handleBulkCreateTask = async (titulo: string, prazo: string, prioridade: string) => {
        const tasks = selectedCards.map(r => ({
            card_id: r.card.id!,
            titulo,
            tipo: 'tarefa',
            responsavel_id: r.card.dono_atual_id,
            data_vencimento: prazo ? new Date(prazo + 'T12:00:00').toISOString() : null,
            prioridade,
            status: 'pendente',
            concluida: false,
            created_by: profile?.id,
            metadata: { origin: 'completeness_bulk' },
        }))

        const { error } = await supabase.from('tarefas').insert(tasks)
        if (error) { toast.error('Erro ao criar tarefas: ' + error.message); return }
        toast.success(`${tasks.length} tarefas criadas!`)
        queryClient.invalidateQueries({ queryKey: ['tasks'] })
        setShowTaskModal(false)
        clearSelection()
    }

    const handleBulkMoveStage = async (stageId: string) => {
        await bulkMoveStage({ cardIds: selectedCardIds, stageId })
        queryClient.invalidateQueries({ queryKey: ['completeness-cards'] })
        clearSelection()
    }

    const handleBulkAssignOwner = async (field: string, ownerId: string) => {
        if (field === 'dono_atual_id') {
            await bulkChangeOwner({ cardIds: selectedCardIds, ownerId })
        } else {
            const { error } = await supabase.from('cards').update({ [field]: ownerId }).in('id', selectedCardIds)
            if (error) { toast.error('Erro: ' + error.message); return }
            toast.success(`Dono atualizado em ${selectedCardIds.length} leads!`)
            queryClient.invalidateQueries({ queryKey: ['cards'] })
        }
        queryClient.invalidateQueries({ queryKey: ['completeness-cards'] })
        setShowOwnerModal(false)
        clearSelection()
    }

    const handleBulkPriority = async (p: 'alta' | 'media' | 'baixa') => {
        await bulkChangePriority({ cardIds: selectedCardIds, prioridade: p })
        queryClient.invalidateQueries({ queryKey: ['completeness-cards'] })
        clearSelection()
    }

    const handleBulkAlert = async (titulo: string, corpo: string) => {
        // Group cards by owner to avoid duplicate notifications
        const byOwner = new Map<string, string[]>()
        for (const r of selectedCards) {
            const ownerId = r.card.dono_atual_id
            if (!ownerId) continue
            const arr = byOwner.get(ownerId) || []
            arr.push(r.card.titulo || '(sem título)')
            byOwner.set(ownerId, arr)
        }

        const notifications = [...byOwner.entries()].map(([userId, cardTitles]) => ({
            user_id: userId,
            type: 'card_alert',
            title: titulo,
            body: `${corpo}\n\nLeads: ${cardTitles.slice(0, 5).join(', ')}${cardTitles.length > 5 ? ` e mais ${cardTitles.length - 5}` : ''}`,
            metadata: { origin: 'completeness_bulk', card_count: cardTitles.length },
        }))

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase as any).from('notifications').insert(notifications)
        if (error) { toast.error('Erro ao criar alertas: ' + error.message); return }
        toast.success(`${notifications.length} alerta${notifications.length > 1 ? 's' : ''} enviado${notifications.length > 1 ? 's' : ''}!`)
        setShowAlertModal(false)
        clearSelection()
    }

    const handleExportCSV = () => {
        const rowsToExport = selectedCards.length > 0 ? selectedCards : sortedRows
        exportCSV(rowsToExport, selectedFieldKeys, selectedExtras, allColumns, fieldTypeMap)
    }

    // ── Render ──

    const hasColumns = selectedFieldKeys.length + selectedExtras.length > 0
    const hasStages = selectedStageIds.length > 0
    const hasSelection = selectedIds.size > 0

    return (
        <div className="space-y-4">
            {/* Stage Selector */}
            <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-4">
                <StageSelector phases={phases} stages={stages} selectedStageIds={selectedStageIds} onChange={ids => { setSelectedStageIds(ids); setPage(0); clearSelection() }} />
            </div>

            {/* Controls Bar */}
            <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-3 flex items-center gap-3 flex-wrap">
                {/* Search */}
                <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                        type="search"
                        placeholder="Buscar lead, contato ou dono..."
                        value={searchTerm}
                        onChange={e => { setSearchTerm(e.target.value); setPage(0) }}
                        className="pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg w-[220px] focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 placeholder-slate-400 [&::-webkit-search-cancel-button]:hidden"
                        autoComplete="off"
                    />
                </div>

                <ColumnManager sections={selectableFields} selectedKeys={selectedFieldKeys} selectedExtras={selectedExtras} onChangeKeys={handleSetFieldKeys} onChangeExtras={handleSetExtras} />
                {hasColumns && <FilterManager allColumns={allColumns} filters={fieldFilters} onChange={f => { setFieldFilters(f); setPage(0) }} />}

                {/* Export button (always visible when there are results) */}
                {hasStages && hasColumns && sortedRows.length > 0 && (
                    <button onClick={handleExportCSV} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-all shadow-sm">
                        <Download className="w-3.5 h-3.5 text-slate-500" />
                        Exportar
                    </button>
                )}

                <span className="text-xs text-slate-400 ml-auto">
                    {hasStages ? `${filteredRows.length} lead${filteredRows.length !== 1 ? 's' : ''} encontrado${filteredRows.length !== 1 ? 's' : ''}` : 'Selecione etapas acima'}
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
                                    <th className="px-3 py-2.5 w-8">
                                        <input type="checkbox" checked={pagedRows.length > 0 && pagedRows.every(r => r.card.id && selectedIds.has(r.card.id))} onChange={toggleSelectAll} className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
                                    </th>
                                    <SortableHeader col="_titulo" label="Lead" sortCol={sortCol} sortAsc={sortAsc} onClick={handleSort} sticky />
                                    <SortableHeader col="_etapa" label="Etapa" sortCol={sortCol} sortAsc={sortAsc} onClick={handleSort} />
                                    <SortableHeader col="_dono" label="Dono" sortCol={sortCol} sortAsc={sortAsc} onClick={handleSort} />
                                    {selectedFieldKeys.map(fk => {
                                        const field = selectableFields.flatMap(s => s.fields).find(f => f.key === fk)
                                        return <SortableHeader key={fk} col={fk} label={field?.label || fk} sortCol={sortCol} sortAsc={sortAsc} onClick={handleSort} />
                                    })}
                                    {selectedExtras.map(ek => {
                                        const extra = EXTRA_COLUMNS.find(e => e.key === ek)
                                        return <SortableHeader key={ek} col={ek} label={extra?.label || ek} sortCol={sortCol} sortAsc={sortAsc} onClick={handleSort} />
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
                                        isSelected={!!row.card.id && selectedIds.has(row.card.id)}
                                        onToggleSelect={() => row.card.id && toggleSelect(row.card.id)}
                                        onNavigate={() => navigate(`/cards/${row.card.id}`)}
                                    />
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination */}
                    {totalPages > 1 && (
                        <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100">
                            <span className="text-xs text-slate-400">Página {page + 1} de {totalPages}</span>
                            <div className="flex items-center gap-1">
                                <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} className="px-2.5 py-1 text-xs rounded border border-slate-200 disabled:opacity-40 hover:bg-slate-50 transition-colors">Anterior</button>
                                <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} className="px-2.5 py-1 text-xs rounded border border-slate-200 disabled:opacity-40 hover:bg-slate-50 transition-colors">Próximo</button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Bulk Actions Floating Bar */}
            {hasSelection && (
                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40">
                    <div className="flex items-center gap-2 bg-white border border-slate-200 shadow-xl rounded-xl px-4 py-2.5 animate-in fade-in slide-in-from-bottom-4 duration-200">
                        <span className="text-sm font-medium text-slate-700 mr-1">
                            {selectedIds.size} selecionado{selectedIds.size > 1 ? 's' : ''}
                        </span>
                        <div className="h-5 w-px bg-slate-200" />

                        <button onClick={() => setShowTaskModal(true)} disabled={bulkLoading} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 rounded-lg hover:bg-slate-50 transition-colors">
                            <ClipboardList className="w-3.5 h-3.5" /> Criar Tarefa
                        </button>

                        <button onClick={() => setShowAlertModal(true)} disabled={bulkLoading} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 rounded-lg hover:bg-slate-50 transition-colors">
                            <Bell className="w-3.5 h-3.5" /> Alerta
                        </button>

                        <div className="relative">
                            <button onClick={() => setShowStageDropdown(o => !o)} disabled={bulkLoading} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 rounded-lg hover:bg-slate-50 transition-colors">
                                <ArrowRight className="w-3.5 h-3.5" /> Mover Etapa
                            </button>
                            {showStageDropdown && <StageMoveDropdown stages={stages} onSelect={handleBulkMoveStage} onClose={() => setShowStageDropdown(false)} />}
                        </div>

                        <button onClick={() => setShowOwnerModal(true)} disabled={bulkLoading} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 rounded-lg hover:bg-slate-50 transition-colors">
                            <UserPlus className="w-3.5 h-3.5" /> Atribuir Dono
                        </button>

                        <div className="relative">
                            <button onClick={() => setShowPriorityDropdown(o => !o)} disabled={bulkLoading} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 rounded-lg hover:bg-slate-50 transition-colors">
                                <Zap className="w-3.5 h-3.5" /> Prioridade
                            </button>
                            {showPriorityDropdown && <PriorityDropdown onSelect={handleBulkPriority} onClose={() => setShowPriorityDropdown(false)} />}
                        </div>

                        <button onClick={handleExportCSV} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 rounded-lg hover:bg-slate-50 transition-colors">
                            <Download className="w-3.5 h-3.5" /> Exportar
                        </button>

                        <div className="h-5 w-px bg-slate-200" />
                        <button onClick={clearSelection} className="px-2 py-1.5 text-xs text-slate-400 hover:text-slate-600 transition-colors">Limpar</button>
                    </div>
                </div>
            )}

            {/* Modals */}
            {showTaskModal && <BulkTaskModal cardCount={selectedIds.size} onConfirm={handleBulkCreateTask} onClose={() => setShowTaskModal(false)} />}
            {showAlertModal && <BulkAlertModal cardCount={selectedIds.size} onConfirm={handleBulkAlert} onClose={() => setShowAlertModal(false)} />}
            {showOwnerModal && <OwnerAssignModal cardCount={selectedIds.size} onConfirm={handleBulkAssignOwner} onClose={() => setShowOwnerModal(false)} />}
        </div>
    )
}

// ── Sub-components ─────────────────────────────────────────────────────

function SortableHeader({ col, label, sortCol, sortAsc, onClick, sticky }: {
    col: string; label: string; sortCol: string | null; sortAsc: boolean; onClick: (col: string) => void; sticky?: boolean
}) {
    const isActive = sortCol === col
    return (
        <th onClick={() => onClick(col)} className={cn('px-3 py-2.5 text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest cursor-pointer select-none whitespace-nowrap hover:text-slate-600 transition-colors', sticky && 'sticky left-0 z-10 bg-slate-50/50', isActive && 'text-indigo-600')}>
            {label}
            {isActive && <span className="ml-0.5">{sortAsc ? '↑' : '↓'}</span>}
        </th>
    )
}

const DATE_TYPES_RENDER = new Set(['date', 'date_range', 'flexible_date'])

function formatDateBR(iso: string | null): string {
    if (!iso) return ''
    const [y, m, d] = iso.split('-')
    if (!y || !m || !d) return iso
    return `${d}/${m}/${y}`
}

function CardRow({ row, fieldKeys, extraKeys, fieldTypeMap, isSelected, onToggleSelect, onNavigate }: {
    row: CardCompleteness; fieldKeys: string[]; extraKeys: ExtraColumnKey[]; fieldTypeMap: Map<string, string>
    isSelected: boolean; onToggleSelect: () => void; onNavigate: () => void
}) {
    const { card, filled, values } = row
    return (
        <tr className={cn('border-b border-slate-100 last:border-0 transition-colors', isSelected ? 'bg-indigo-50/30' : 'hover:bg-slate-50/50')}>
            <td className="px-3 py-2.5 w-8">
                <input type="checkbox" checked={isSelected} onChange={onToggleSelect} className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
            </td>
            <td className="px-3 py-2.5 sticky left-0 z-10" style={{ backgroundColor: isSelected ? 'rgb(238 242 255 / 0.3)' : 'white' }}>
                <button onClick={onNavigate} className="flex items-center gap-1.5 text-sm font-medium text-slate-900 hover:text-indigo-600 transition-colors group max-w-[200px]">
                    <span className="truncate">{card.titulo || '(sem título)'}</span>
                    <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-60 flex-shrink-0" />
                </button>
                {card.pessoa_nome && <div className="text-[11px] text-slate-400 truncate max-w-[200px]">{card.pessoa_nome}</div>}
            </td>
            <td className="px-3 py-2.5 text-xs text-slate-600 whitespace-nowrap">{card.etapa_nome || '—'}</td>
            <td className="px-3 py-2.5 text-xs text-slate-600 whitespace-nowrap">{card.dono_atual_nome || '—'}</td>
            {fieldKeys.map(fk => {
                const ft = fieldTypeMap.get(fk)
                if (ft && DATE_TYPES_RENDER.has(ft)) {
                    const dateVal = values[fk]
                    return (
                        <td key={fk} className="px-3 py-2.5 text-center whitespace-nowrap">
                            {dateVal ? <span className="text-xs text-slate-700">{formatDateBR(dateVal)}</span> : <X className="w-4 h-4 text-slate-300 mx-auto" />}
                        </td>
                    )
                }
                return <td key={fk} className="px-3 py-2.5 text-center"><FillIndicator filled={filled[fk] ?? false} /></td>
            })}
            {extraKeys.map(ek => <td key={ek} className="px-3 py-2.5 text-center"><FillIndicator filled={filled[ek] ?? false} /></td>)}
        </tr>
    )
}

function FillIndicator({ filled }: { filled: boolean }) {
    return filled ? <Check className="w-4 h-4 text-emerald-500 mx-auto" /> : <X className="w-4 h-4 text-slate-300 mx-auto" />
}

function EmptyState({ message }: { message: string }) {
    return (
        <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-12 text-center">
            <Filter className="w-8 h-8 text-slate-300 mx-auto mb-3" />
            <p className="text-sm text-slate-500">{message}</p>
        </div>
    )
}
