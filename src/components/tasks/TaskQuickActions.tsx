import { useState, useRef, useEffect } from 'react'
import { MoreHorizontal, Clock, UserPlus, ExternalLink, RotateCcw, Trash2, Check } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useFilterOptions } from '../../hooks/useFilterOptions'
import { cn } from '../../lib/utils'
import type { TaskListItem } from '../../hooks/useTasksList'

export function TaskQuickActions({
    task,
    onReschedule,
    onComplete,
    onUncomplete,
}: {
    task: TaskListItem
    onReschedule: () => void
    onComplete: () => void
    onUncomplete: () => void
}) {
    const { profile } = useAuth()
    const { data: options } = useFilterOptions()
    const queryClient = useQueryClient()
    const [open, setOpen] = useState(false)
    const [showReassign, setShowReassign] = useState(false)
    const menuRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                setOpen(false); setShowReassign(false)
            }
        }
        if (open) document.addEventListener('mousedown', handler)
        return () => document.removeEventListener('mousedown', handler)
    }, [open])

    const reassignMutation = useMutation({
        mutationFn: async (responsavelId: string) => {
            const { error } = await supabase
                .from('tarefas')
                .update({ responsavel_id: responsavelId })
                .eq('id', task.id)
            if (error) throw error
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['tasks-list'] })
            queryClient.invalidateQueries({ queryKey: ['my-day-tasks'] })
            toast.success('Responsável atualizado')
            setOpen(false); setShowReassign(false)
        },
        onError: (err: Error) => toast.error('Erro ao reatribuir', { description: err.message }),
    })

    const deleteMutation = useMutation({
        mutationFn: async () => {
            const { error } = await supabase
                .from('tarefas')
                .update({ deleted_at: new Date().toISOString() })
                .eq('id', task.id)
            if (error) throw error
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['tasks-list'] })
            queryClient.invalidateQueries({ queryKey: ['my-day-tasks'] })
            toast.success('Tarefa excluída')
        },
        onError: (err: Error) => toast.error('Erro ao excluir', { description: err.message }),
    })

    const profiles = options?.profiles || []

    return (
        <div ref={menuRef} className="relative" onClick={(e) => e.stopPropagation()}>
            <button
                onClick={() => setOpen(!open)}
                className="p-1.5 rounded-md hover:bg-slate-100 text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity"
                aria-label="Ações"
            >
                <MoreHorizontal className="h-4 w-4" />
            </button>

            {open && (
                <div className="absolute right-0 top-full mt-1 w-52 bg-white border border-slate-200 rounded-lg shadow-lg z-20 overflow-hidden">
                    {showReassign ? (
                        <div>
                            <div className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400 border-b border-slate-100">
                                Reatribuir para
                            </div>
                            <div className="max-h-[240px] overflow-y-auto">
                                {profile?.id && profile.id !== task.responsavel_id && (
                                    <button
                                        onClick={() => reassignMutation.mutate(profile.id)}
                                        disabled={reassignMutation.isPending}
                                        className="w-full text-left px-3 py-1.5 text-xs hover:bg-indigo-50 text-indigo-700 font-medium"
                                    >
                                        ← Para mim
                                    </button>
                                )}
                                {profiles.filter(p => p.id !== task.responsavel_id).map((p) => (
                                    <button
                                        key={p.id}
                                        onClick={() => reassignMutation.mutate(p.id)}
                                        disabled={reassignMutation.isPending}
                                        className="w-full text-left px-3 py-1.5 text-xs hover:bg-slate-50 truncate"
                                    >
                                        {p.full_name || p.email}
                                    </button>
                                ))}
                            </div>
                            <button
                                onClick={() => setShowReassign(false)}
                                className="w-full text-center px-3 py-1.5 text-xs text-slate-500 border-t border-slate-100 hover:bg-slate-50"
                            >
                                Voltar
                            </button>
                        </div>
                    ) : (
                        <div className="py-1">
                            {!task.concluida && (
                                <ActionItem
                                    icon={Check}
                                    label="Concluir"
                                    onClick={() => { setOpen(false); onComplete() }}
                                />
                            )}
                            {task.concluida && (
                                <ActionItem
                                    icon={RotateCcw}
                                    label="Reabrir"
                                    onClick={() => { setOpen(false); onUncomplete() }}
                                />
                            )}
                            {!task.concluida && (
                                <ActionItem
                                    icon={Clock}
                                    label="Reagendar"
                                    onClick={() => { setOpen(false); onReschedule() }}
                                />
                            )}
                            <ActionItem
                                icon={UserPlus}
                                label="Reatribuir"
                                onClick={() => setShowReassign(true)}
                            />
                            <a
                                href={`/cards/${task.card_id}`}
                                onClick={() => setOpen(false)}
                                className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
                            >
                                <ExternalLink className="h-3.5 w-3.5 text-slate-400" />
                                Abrir card
                            </a>
                            <div className="border-t border-slate-100 my-1" />
                            <ActionItem
                                icon={Trash2}
                                label="Excluir"
                                danger
                                onClick={() => {
                                    if (confirm('Excluir esta tarefa?')) deleteMutation.mutate()
                                    setOpen(false)
                                }}
                            />
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}

function ActionItem({
    icon: Icon,
    label,
    onClick,
    danger,
}: {
    icon: typeof Clock
    label: string
    onClick: () => void
    danger?: boolean
}) {
    return (
        <button
            onClick={onClick}
            className={cn(
                "flex items-center gap-2 w-full px-3 py-1.5 text-xs hover:bg-slate-50 text-left",
                danger ? "text-red-600 hover:bg-red-50" : "text-slate-700"
            )}
        >
            <Icon className={cn("h-3.5 w-3.5", danger ? "text-red-500" : "text-slate-400")} />
            {label}
        </button>
    )
}
