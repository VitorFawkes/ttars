/**
 * ExecutionsPanel — drawer lateral direito que mostra execuções "ao vivo"
 * da automação aberta. Polling 5s via useTemplateInstances.
 *
 * Layout:
 *   - Header: contadores (rodando agora, completas, canceladas, falhas)
 *   - Lista de instances (status colorido, card_titulo, etapa, last event,
 *     elapsed time)
 *   - Painel inferior: stream de eventos das últimas 2h (collapse)
 */
import React, { useState, useMemo } from 'react'
import { X, Activity, Loader2, ChevronRight, RotateCw, StopCircle } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { supabase } from '@/lib/supabase'
import { useTemplateInstances } from '../hooks/useTemplateInstances'
import { useWorkflowStore } from '../store/useWorkflowStore'
import { STATUS_META, formatRelative } from '../lib/instanceFormat'

const ACTIVE_STATUSES = new Set(['active', 'waiting_task', 'paused'])

interface ExecutionsPanelProps {
    templateId: string | null
    onClose: () => void
}

export const ExecutionsPanel: React.FC<ExecutionsPanelProps> = ({ templateId, onClose }) => {
    const [showEvents, setShowEvents] = useState(false)
    const { data, isLoading, isFetching } = useTemplateInstances(templateId, { refreshMs: 5000 })
    const highlightedInstanceId = useWorkflowStore((s) => s.highlightedInstanceId)
    const setHighlightedInstance = useWorkflowStore((s) => s.setHighlightedInstance)

    const counts = data?.counts || {}
    const runningCount = data?.runningCount ?? 0
    const instances = data?.instances || []
    const events = data?.events || []

    const groupedInstances = useMemo(() => {
        const running = instances.filter((i) => ['active', 'waiting_task', 'paused'].includes(i.status))
        const closed = instances.filter((i) => !['active', 'waiting_task', 'paused'].includes(i.status))
        return { running, closed }
    }, [instances])

    if (!templateId) {
        return (
            <aside className="w-96 bg-white border-l border-slate-200 flex flex-col h-full">
                <div className="p-4 text-sm text-slate-500 text-center">
                    Salve o workflow pra ver execuções.
                </div>
            </aside>
        )
    }

    return (
        <aside className="w-96 bg-white border-l border-slate-200 flex flex-col h-full">
            {/* Header */}
            <div className="px-4 py-3 border-b border-slate-200 flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                        <Activity className="w-4 h-4 text-emerald-600" />
                        <div className="text-sm font-semibold text-slate-900">Execuções</div>
                        {isFetching && <Loader2 className="w-3 h-3 animate-spin text-slate-400" />}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                        Atualiza a cada 5 segundos
                    </div>
                    {highlightedInstanceId && (
                        <button
                            onClick={() => setHighlightedInstance(null)}
                            className="mt-1 text-[11px] text-cyan-700 hover:text-cyan-900 underline"
                        >
                            Limpar destaque do canvas
                        </button>
                    )}
                </div>
                <Button variant="ghost" size="sm" onClick={onClose} className="-mr-2">
                    <X className="w-4 h-4" />
                </Button>
            </div>

            {/* Counters */}
            <div className="px-4 py-3 border-b border-slate-200 grid grid-cols-2 gap-2">
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                    <div className="text-[10px] uppercase tracking-wide font-medium text-emerald-700">Rodando</div>
                    <div className="text-2xl font-semibold text-emerald-900 leading-tight">{runningCount}</div>
                </div>
                <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
                    <div className="text-[10px] uppercase tracking-wide font-medium text-blue-700">Completas</div>
                    <div className="text-2xl font-semibold text-blue-900 leading-tight">{counts.completed || 0}</div>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                    <div className="text-[10px] uppercase tracking-wide font-medium text-slate-600">Canceladas</div>
                    <div className="text-2xl font-semibold text-slate-700 leading-tight">{counts.cancelled || 0}</div>
                </div>
                <div className="bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
                    <div className="text-[10px] uppercase tracking-wide font-medium text-rose-700">Falhas</div>
                    <div className="text-2xl font-semibold text-rose-900 leading-tight">{counts.failed || 0}</div>
                </div>
            </div>

            {/* Lista */}
            <div className="flex-1 overflow-y-auto">
                {isLoading && (
                    <div className="p-4 text-xs text-slate-500 flex items-center gap-2">
                        <Loader2 className="w-3 h-3 animate-spin" /> Carregando…
                    </div>
                )}

                {!isLoading && instances.length === 0 && (
                    <div className="p-6 text-xs text-slate-500 text-center">
                        Nenhuma execução ainda.<br />
                        Use "Disparar agora" pra iniciar uma instância de teste.
                    </div>
                )}

                {groupedInstances.running.length > 0 && (
                    <div>
                        <div className="px-4 pt-3 pb-1 text-[10px] uppercase tracking-wide font-medium text-slate-500">
                            Rodando agora
                        </div>
                        {groupedInstances.running.map((inst) => (
                            <InstanceRow key={inst.id} inst={inst} templateId={templateId} />
                        ))}
                    </div>
                )}

                {groupedInstances.closed.length > 0 && (
                    <div>
                        <div className="px-4 pt-3 pb-1 text-[10px] uppercase tracking-wide font-medium text-slate-500">
                            Encerradas (50 mais recentes)
                        </div>
                        {groupedInstances.closed.map((inst) => (
                            <InstanceRow key={inst.id} inst={inst} templateId={templateId} />
                        ))}
                    </div>
                )}
            </div>

            {/* Events stream */}
            <div className="border-t border-slate-200">
                <button
                    onClick={() => setShowEvents((v) => !v)}
                    className="w-full px-4 py-2 text-left text-[11px] uppercase tracking-wide font-medium text-slate-500 hover:bg-slate-50 flex items-center justify-between"
                >
                    <span>Eventos das últimas 2h</span>
                    <span>{showEvents ? '▴' : '▾'} ({events.length})</span>
                </button>
                {showEvents && (
                    <div className="max-h-64 overflow-y-auto bg-slate-50 border-t border-slate-200">
                        {events.length === 0 ? (
                            <div className="p-3 text-[11px] text-slate-500 text-center">Nenhum evento.</div>
                        ) : (
                            <ul className="divide-y divide-slate-200">
                                {events.map((e) => (
                                    <li key={e.id} className="px-4 py-2 text-[11px]">
                                        <div className="flex items-center justify-between gap-2">
                                            <code className="text-slate-700 truncate">{e.event_type}</code>
                                            <span className="text-slate-400 flex-shrink-0">{formatRelative(e.created_at)}</span>
                                        </div>
                                        {e.action_taken && (
                                            <div className="text-slate-500 truncate">→ {e.action_taken}</div>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                )}
            </div>
        </aside>
    )
}

interface InstanceRowProps {
    inst: import('../hooks/useTemplateInstances').TemplateInstance
    templateId: string | null
}

const InstanceRow: React.FC<InstanceRowProps> = ({ inst, templateId }) => {
    const meta = STATUS_META[inst.status] || { label: inst.status, color: 'bg-slate-100 text-slate-700 border-slate-200', icon: Activity }
    const Icon = meta.icon
    const elapsed = formatRelative(inst.started_at)
    const highlightedInstanceId = useWorkflowStore((s) => s.highlightedInstanceId)
    const setHighlightedInstance = useWorkflowStore((s) => s.setHighlightedInstance)
    const isHighlighted = highlightedInstanceId === inst.id
    const isActive = ACTIVE_STATUSES.has(inst.status)
    const queryClient = useQueryClient()

    const refetchAll = () => {
        queryClient.invalidateQueries({ queryKey: ['template-instances'] })
        queryClient.invalidateQueries({ queryKey: ['instance-trail', inst.id] })
    }

    const cancelMutation = useMutation({
        mutationFn: async () => {
            const { data, error } = await supabase.functions.invoke('cadence-engine', {
                body: { action: 'cancel_cadence', instance_id: inst.id, reason: 'manual_panel' },
            })
            if (error) throw error
            return data
        },
        onSuccess: () => {
            toast.success('Execução encerrada')
            refetchAll()
        },
        onError: (err: Error) => toast.error(`Falha ao encerrar: ${err.message}`),
    })

    const rerunMutation = useMutation({
        mutationFn: async () => {
            if (!templateId) throw new Error('Salve o workflow antes de reexecutar')
            // Se ainda está rodando, cancela primeiro (engine soft-deleta tarefas pendentes).
            if (isActive) {
                const { error: cancelErr } = await supabase.functions.invoke('cadence-engine', {
                    body: { action: 'cancel_cadence', instance_id: inst.id, reason: 'manual_rerun' },
                })
                if (cancelErr) throw cancelErr
            }
            const { data, error } = await supabase.functions.invoke('cadence-engine', {
                body: { action: 'start_cadence', card_id: inst.card_id, template_id: templateId, force: true },
            })
            if (error) throw error
            return data
        },
        onSuccess: () => {
            toast.success('Execução reiniciada')
            refetchAll()
        },
        onError: (err: Error) => toast.error(`Falha ao reexecutar: ${err.message}`),
    })

    const busy = cancelMutation.isPending || rerunMutation.isPending

    return (
        <div
            role="button"
            tabIndex={0}
            onClick={() => setHighlightedInstance(isHighlighted ? null : inst.id)}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    setHighlightedInstance(isHighlighted ? null : inst.id)
                }
            }}
            className={`group w-full text-left px-4 py-2.5 border-b border-slate-100 transition-colors cursor-pointer ${
                isHighlighted ? 'bg-cyan-50 hover:bg-cyan-100 ring-1 ring-inset ring-cyan-300' : 'hover:bg-slate-50'
            }`}
        >
            <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                        <Badge className={`text-[10px] flex items-center gap-1 ${meta.color}`}>
                            <Icon className="w-3 h-3" />
                            {meta.label}
                        </Badge>
                        <span className="text-[10px] text-slate-400">{elapsed}</span>
                    </div>
                    <div className="text-sm font-medium text-slate-900 truncate mt-1">
                        {inst.card_titulo || `Card ${inst.card_id.slice(0, 8)}`}
                    </div>
                    {inst.stage_nome && (
                        <div className="text-[11px] text-slate-500 truncate">📍 {inst.stage_nome}</div>
                    )}
                    {inst.cancelled_reason && (
                        <div className="text-[11px] text-rose-600 truncate">{inst.cancelled_reason}</div>
                    )}
                </div>
                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    {(inst.total_contacts_attempted ?? 0) > 0 && (
                        <div className="text-right text-[10px] text-slate-500">
                            <div>{inst.successful_contacts}/{inst.total_contacts_attempted}</div>
                            <div>contatos</div>
                        </div>
                    )}
                    {isHighlighted && (
                        <ChevronRight className="w-3 h-3 text-cyan-700" />
                    )}
                </div>
            </div>

            {/* Acoes — aparecem em hover ou quando a row esta destacada */}
            <div className={`mt-2 flex items-center gap-1 ${isHighlighted ? 'flex' : 'hidden group-hover:flex'}`}>
                {isActive && (
                    <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); cancelMutation.mutate() }}
                        disabled={busy}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium bg-white border border-slate-300 hover:bg-rose-50 hover:border-rose-300 hover:text-rose-700 disabled:opacity-50"
                        title="Cancelar essa execução (soft-deleta tarefas pendentes dela)"
                    >
                        {cancelMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <StopCircle className="w-3 h-3" />}
                        Encerrar
                    </button>
                )}
                <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); rerunMutation.mutate() }}
                    disabled={busy || !templateId}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium bg-white border border-slate-300 hover:bg-cyan-50 hover:border-cyan-300 hover:text-cyan-700 disabled:opacity-50"
                    title={isActive ? 'Cancela essa execução e roda uma nova no mesmo card' : 'Roda uma nova execução no mesmo card'}
                >
                    {rerunMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCw className="w-3 h-3" />}
                    Reexecutar
                </button>
            </div>
        </div>
    )
}

export default ExecutionsPanel
