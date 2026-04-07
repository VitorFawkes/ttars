import { useMemo, useState } from 'react'
import { Plus, Trash2, GripVertical, Info } from 'lucide-react'
import {
    useStageFieldConfirmationsByStage,
    useUpsertStageFieldConfirmation,
    useDeleteStageFieldConfirmation,
} from '../../../hooks/useStageFieldConfirmations'
import { getFieldRegistry } from '../../../lib/fieldRegistry'
import { cn } from '../../../lib/utils'

interface StageFieldConfirmationsPanelProps {
    stageId: string
    produto: string | null
}

export default function StageFieldConfirmationsPanel({ stageId, produto }: StageFieldConfirmationsPanelProps) {
    const { data: confirmations = [], isLoading } = useStageFieldConfirmationsByStage(stageId)
    const upsert = useUpsertStageFieldConfirmation()
    const del = useDeleteStageFieldConfirmation()
    const [showPicker, setShowPicker] = useState(false)

    // Campos disponíveis: do fieldRegistry do produto do pipeline
    const availableFields = useMemo(() => {
        if (!produto) return []
        const registry = getFieldRegistry(produto)
        return Object.values(registry).map(f => ({ key: f.name, label: f.label }))
    }, [produto])

    // Filtra os já adicionados
    const alreadyAdded = new Set(confirmations.map(c => c.field_key))
    const pickable = availableFields.filter(f => !alreadyAdded.has(f.key))

    // Campos extras (ex: data_exata_da_viagem) que não estão no fieldRegistry legado
    // mas aparecem já configurados via seed — mostrar como "custom"
    const extraKeys = confirmations
        .filter(c => !availableFields.some(f => f.key === c.field_key))
        .map(c => c.field_key)

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
                        const registryLabel = availableFields.find(f => f.key === c.field_key)?.label
                        const displayLabel = c.field_label || registryLabel || c.field_key
                        const isExtra = extraKeys.includes(c.field_key)
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
                <div className="space-y-1 border border-slate-200 rounded-xl p-2 bg-white">
                    {pickable.length === 0 ? (
                        <p className="text-xs text-slate-500 p-2">Todos os campos já foram adicionados.</p>
                    ) : (
                        pickable.map(f => (
                            <button
                                key={f.key}
                                type="button"
                                onClick={() => handleAdd(f.key, f.label)}
                                className="w-full text-left px-3 py-2 rounded-lg hover:bg-indigo-50 text-sm text-slate-700"
                            >
                                <span className="font-medium">{f.label}</span>
                                <span className="ml-2 text-xs text-slate-400 font-mono">{f.key}</span>
                            </button>
                        ))
                    )}
                    <button
                        type="button"
                        onClick={() => setShowPicker(false)}
                        className="w-full text-center text-xs text-slate-500 py-1 hover:text-slate-700"
                    >
                        Cancelar
                    </button>
                </div>
            ) : (
                <button
                    type="button"
                    onClick={() => setShowPicker(true)}
                    disabled={pickable.length === 0}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 border border-dashed border-slate-300 rounded-xl text-sm text-slate-600 hover:border-indigo-400 hover:text-indigo-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <Plus className="w-4 h-4" />
                    Adicionar campo para conferência
                </button>
            )}
        </div>
    )
}
