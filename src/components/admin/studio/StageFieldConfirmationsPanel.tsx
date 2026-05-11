import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Plus, Trash2, GripVertical, Info } from 'lucide-react'
import {
    useStageFieldConfirmationsByStage,
    useUpsertStageFieldConfirmation,
    useDeleteStageFieldConfirmation,
} from '../../../hooks/useStageFieldConfirmations'
import { useSections } from '../../../hooks/useSections'
import { supabase } from '../../../lib/supabase'
import { cn } from '../../../lib/utils'

interface StageFieldConfirmationsPanelProps {
    stageId: string
    produto: string | null
}

interface SystemFieldRow {
    key: string
    label: string
    section: string | null
}

const EXTRA_CARD_FIELDS: SystemFieldRow[] = [
    { key: 'titulo', label: 'Título', section: 'geral' },
    { key: 'valor_final', label: 'Valor Final', section: 'financeiro' },
    { key: 'valor_estimado', label: 'Valor Estimado', section: 'financeiro' },
]

export default function StageFieldConfirmationsPanel({ stageId, produto }: StageFieldConfirmationsPanelProps) {
    const { data: confirmations = [], isLoading } = useStageFieldConfirmationsByStage(stageId)
    const upsert = useUpsertStageFieldConfirmation()
    const del = useDeleteStageFieldConfirmation()
    const [showPicker, setShowPicker] = useState(false)

    // Seções do produto selecionado — filtra campos de outros produtos
    const { data: productSections = [] } = useSections(produto || undefined)

    const { data: systemFields = [] } = useQuery({
        queryKey: ['system-fields-for-confirmations'],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('system_fields')
                .select('key, label, section')
                .eq('active', true)
                .order('section')
                .order('order_index')
                .order('label')
            if (error) throw error
            return (data as SystemFieldRow[]) || []
        },
        staleTime: 1000 * 60 * 5,
    })

    // Filtra campos: só os que pertencem a seções do produto atual
    const availableFields = useMemo(() => {
        const sectionKeys = new Set(productSections.map(s => s.key))
        const seen = new Set<string>()
        const all: SystemFieldRow[] = []

        for (const f of systemFields) {
            if (seen.has(f.key)) continue
            // Campo sem seção → incluir (genérico)
            // Campo com seção → só se a seção pertence ao produto
            if (f.section && !sectionKeys.has(f.section)) continue
            seen.add(f.key)
            all.push(f)
        }
        for (const f of EXTRA_CARD_FIELDS) {
            if (!seen.has(f.key)) {
                seen.add(f.key)
                all.push(f)
            }
        }
        return all
    }, [systemFields, productSections])

    // Agrupa por seção para exibição no picker
    const groupedPickable = useMemo(() => {
        const alreadyAdded = new Set(confirmations.map(c => c.field_key))
        const pickable = availableFields.filter(f => !alreadyAdded.has(f.key))

        const groups = new Map<string, SystemFieldRow[]>()
        for (const f of pickable) {
            const section = f.section || 'geral'
            const label = productSections.find(s => s.key === section)?.label || humanizeSection(section)
            const key = `${section}|${label}`
            if (!groups.has(key)) groups.set(key, [])
            groups.get(key)!.push(f)
        }
        return groups
    }, [availableFields, confirmations, productSections])

    const totalPickable = [...groupedPickable.values()].reduce((sum, g) => sum + g.length, 0)

    const alreadyAdded = new Set(confirmations.map(c => c.field_key))

    const handleAdd = (fieldKey: string, label: string) => {
        upsert.mutate({
            stage_id: stageId,
            field_key: fieldKey,
            field_label: label,
            ordem: confirmations.length,
            ativo: true,
        })
        setShowPicker(false)
    }

    const handleToggleActive = (c: { id: string; ativo: boolean; stage_id: string; field_key: string }) => {
        upsert.mutate({
            id: c.id,
            stage_id: c.stage_id,
            field_key: c.field_key,
            ativo: !c.ativo,
        })
    }

    const handleDelete = (id: string) => {
        if (!confirm('Remover esta confirmação?')) return
        del.mutate({ id, stage_id: stageId })
    }

    if (isLoading) {
        return <div className="text-sm text-slate-500">Carregando...</div>
    }

    return (
        <div className="space-y-4">
            <div className="flex items-start gap-2 p-3 rounded-xl bg-indigo-50 border border-indigo-100">
                <Info className="w-4 h-4 text-indigo-600 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-indigo-900">
                    Ao mover um card para esta etapa, o usuário verá um modal pedindo para confirmar visualmente os campos listados abaixo antes da movimentação ser concluída.
                </p>
            </div>

            {confirmations.length === 0 ? (
                <div className="text-center py-6 text-sm text-slate-500 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                    Nenhum campo configurado para confirmação.
                </div>
            ) : (
                <div className="space-y-2">
                    {confirmations.map(c => {
                        const fieldMeta = availableFields.find(f => f.key === c.field_key)
                        const displayLabel = c.field_label || fieldMeta?.label || c.field_key
                        const isExtra = !fieldMeta && !alreadyAdded.has(c.field_key)
                        return (
                            <div
                                key={c.id}
                                className={cn(
                                    'flex items-center gap-3 p-3 rounded-xl border',
                                    c.ativo ? 'bg-white border-slate-200' : 'bg-slate-50 border-slate-100 opacity-60'
                                )}
                            >
                                <GripVertical className="w-4 h-4 text-slate-300" />
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-slate-900">{displayLabel}</p>
                                    <p className="text-xs text-slate-400 font-mono">
                                        {c.field_key}
                                        {isExtra && <span className="ml-2 text-amber-600">(customizado)</span>}
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => handleToggleActive(c)}
                                    className={cn(
                                        'relative inline-flex h-5 w-9 items-center rounded-full transition-colors',
                                        c.ativo ? 'bg-indigo-600' : 'bg-slate-300'
                                    )}
                                >
                                    <span
                                        className={cn(
                                            'inline-block h-3 w-3 transform rounded-full bg-white transition-transform',
                                            c.ativo ? 'translate-x-5' : 'translate-x-1'
                                        )}
                                    />
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleDelete(c.id)}
                                    className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                                    title="Remover"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        )
                    })}
                </div>
            )}

            {showPicker ? (
                <div className="border border-slate-200 rounded-xl bg-white max-h-80 overflow-y-auto">
                    {totalPickable === 0 ? (
                        <p className="text-xs text-slate-500 p-3">Todos os campos já foram adicionados.</p>
                    ) : (
                        [...groupedPickable.entries()].map(([groupKey, fields]) => {
                            const sectionLabel = groupKey.split('|')[1]
                            return (
                                <div key={groupKey}>
                                    <div className="px-3 pt-3 pb-1 sticky top-0 bg-white">
                                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                                            {sectionLabel}
                                        </p>
                                    </div>
                                    {fields.map(f => (
                                        <button
                                            key={f.key}
                                            type="button"
                                            onClick={() => handleAdd(f.key, f.label)}
                                            className="w-full text-left px-3 py-2 hover:bg-indigo-50 text-sm text-slate-700 flex items-center justify-between gap-2"
                                        >
                                            <span className="font-medium truncate">{f.label}</span>
                                            <span className="text-xs text-slate-400 font-mono flex-shrink-0">{f.key}</span>
                                        </button>
                                    ))}
                                </div>
                            )
                        })
                    )}
                    <div className="border-t border-slate-100 p-1">
                        <button
                            type="button"
                            onClick={() => setShowPicker(false)}
                            className="w-full text-center text-xs text-slate-500 py-1.5 hover:text-slate-700 rounded-lg hover:bg-slate-50"
                        >
                            Cancelar
                        </button>
                    </div>
                </div>
            ) : (
                <button
                    type="button"
                    onClick={() => setShowPicker(true)}
                    disabled={totalPickable === 0}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 border border-dashed border-slate-300 rounded-xl text-sm text-slate-600 hover:border-indigo-400 hover:text-indigo-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <Plus className="w-4 h-4" />
                    Adicionar campo para conferência
                </button>
            )}
        </div>
    )
}

function humanizeSection(key: string): string {
    return key
        .replace(/_/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase())
}
