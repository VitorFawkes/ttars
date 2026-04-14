import { useState, useMemo } from 'react'
import { CheckSquare, Plus, Check, UserPlus, X } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useTaskFilters } from '../hooks/useTaskFilters'
import { useTasksList } from '../hooks/useTasksList'
import { useFilterOptions } from '../hooks/useFilterOptions'
import { TaskOutcomeModal } from '../components/shared/TaskOutcomeModal'
import { useTaskTypesWithOutcomes } from '../hooks/useTaskOutcomes'
import { toast } from 'sonner'
import { cn } from '../lib/utils'
import { TaskRow } from '../components/tasks/TaskRow'
import { TaskFiltersBar } from '../components/tasks/TaskFiltersBar'
import { RescheduleModal } from '../components/tasks/RescheduleModal'
import { CreateTaskModal } from '../components/tasks/CreateTaskModal'
import type { TaskListItem } from '../hooks/useTasksList'

export default function Tasks() {
    const { profile } = useAuth()
    const { filters, setFilters, reset } = useTaskFilters()
    const { data: tasks, isLoading } = useTasksList({ filters })
    const { data: options } = useFilterOptions()
    const queryClient = useQueryClient()
    const typesWithOutcomes = useTaskTypesWithOutcomes()
    const profiles = options?.profiles || []

    const [outcomeModalOpen, setOutcomeModalOpen] = useState(false)
    const [taskToComplete, setTaskToComplete] = useState<TaskListItem | null>(null)
    const [rescheduleTask, setRescheduleTask] = useState<TaskListItem | null>(null)
    const [createOpen, setCreateOpen] = useState(false)

    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
    const selectionActive = selectedIds.size > 0
    const [bulkReassignOpen, setBulkReassignOpen] = useState(false)

    const [groupBy, setGroupBy] = useState<'none' | 'card'>('none')

    const completeMutation = useMutation({
        mutationFn: async ({ taskId, outcome, feedback }: { taskId: string; outcome?: string; feedback?: string }) => {
            const { error } = await supabase
                .from('tarefas')
                .update({
                    concluida: true,
                    concluida_em: new Date().toISOString(),
                    concluido_por: profile!.id,
                    status: 'concluida',
                    ...(outcome ? { outcome, resultado: outcome } : {}),
                    ...(feedback ? { feedback } : {}),
                })
                .eq('id', taskId)
            if (error) throw error
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['tasks-list'] })
            queryClient.invalidateQueries({ queryKey: ['my-day-tasks'] })
            queryClient.invalidateQueries({ queryKey: ['tasks'] })
            queryClient.invalidateQueries({ queryKey: ['cards'] })
            toast.success('Tarefa concluída')
        },
        onError: (error: Error) => toast.error('Erro ao concluir tarefa', { description: error.message }),
    })

    const uncompleteMutation = useMutation({
        mutationFn: async (taskId: string) => {
            const { error } = await supabase
                .from('tarefas')
                .update({
                    concluida: false,
                    concluida_em: null,
                    concluido_por: null,
                    status: 'pendente',
                    outcome: null,
                    resultado: null,
                    feedback: null,
                })
                .eq('id', taskId)
            if (error) throw error
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['tasks-list'] })
            queryClient.invalidateQueries({ queryKey: ['my-day-tasks'] })
            queryClient.invalidateQueries({ queryKey: ['tasks'] })
            toast.success('Tarefa reaberta')
        },
        onError: (error: Error) => toast.error('Erro ao reabrir tarefa', { description: error.message }),
    })

    const bulkCompleteMutation = useMutation({
        mutationFn: async (ids: string[]) => {
            const { error } = await supabase
                .from('tarefas')
                .update({
                    concluida: true,
                    concluida_em: new Date().toISOString(),
                    concluido_por: profile!.id,
                    status: 'concluida',
                })
                .in('id', ids)
            if (error) throw error
        },
        onSuccess: (_d, ids) => {
            queryClient.invalidateQueries({ queryKey: ['tasks-list'] })
            queryClient.invalidateQueries({ queryKey: ['my-day-tasks'] })
            toast.success(`${ids.length} ${ids.length === 1 ? 'tarefa concluída' : 'tarefas concluídas'}`)
            setSelectedIds(new Set())
        },
        onError: (err: Error) => toast.error('Erro ao concluir em lote', { description: err.message }),
    })

    const bulkReassignMutation = useMutation({
        mutationFn: async ({ ids, responsavelId }: { ids: string[]; responsavelId: string }) => {
            const { error } = await supabase
                .from('tarefas')
                .update({ responsavel_id: responsavelId })
                .in('id', ids)
            if (error) throw error
        },
        onSuccess: (_d, { ids }) => {
            queryClient.invalidateQueries({ queryKey: ['tasks-list'] })
            queryClient.invalidateQueries({ queryKey: ['my-day-tasks'] })
            toast.success(`${ids.length} ${ids.length === 1 ? 'tarefa reatribuída' : 'tarefas reatribuídas'}`)
            setSelectedIds(new Set())
            setBulkReassignOpen(false)
        },
        onError: (err: Error) => toast.error('Erro ao reatribuir em lote', { description: err.message }),
    })

    const handleComplete = (task: TaskListItem) => {
        if (typesWithOutcomes.has(task.tipo)) {
            setTaskToComplete(task)
            setOutcomeModalOpen(true)
        } else {
            completeMutation.mutate({ taskId: task.id })
        }
    }

    const toggleSelect = (id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
    }

    const groupedTasks = useMemo(() => {
        if (groupBy !== 'card' || !tasks) return null
        const groups = new Map<string, { cardId: string; cardTitulo: string; items: TaskListItem[] }>()
        for (const t of tasks) {
            const key = t.card_id
            if (!groups.has(key)) groups.set(key, { cardId: t.card_id, cardTitulo: t.card_titulo, items: [] })
            groups.get(key)!.items.push(t)
        }
        return Array.from(groups.values())
    }, [tasks, groupBy])

    return (
        <div className="flex flex-col h-full">
            <div className="flex-shrink-0 border-b border-slate-200 bg-white px-6 py-4">
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <h1 className="text-xl font-bold text-slate-900 tracking-tight">Tarefas</h1>
                        <p className="text-sm text-slate-500 mt-0.5">
                            Seu dia a dia organizado por prioridade, prazo e origem.
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="flex bg-slate-100 rounded-lg p-0.5">
                            <button
                                onClick={() => setGroupBy('none')}
                                className={cn(
                                    "px-2.5 py-1 text-xs font-medium rounded-md transition-all",
                                    groupBy === 'none' ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"
                                )}
                            >
                                Lista
                            </button>
                            <button
                                onClick={() => setGroupBy('card')}
                                className={cn(
                                    "px-2.5 py-1 text-xs font-medium rounded-md transition-all",
                                    groupBy === 'card' ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"
                                )}
                            >
                                Por card
                            </button>
                        </div>
                        <button
                            onClick={() => setCreateOpen(true)}
                            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
                        >
                            <Plus className="h-4 w-4" />
                            Nova tarefa
                        </button>
                    </div>
                </div>

                <TaskFiltersBar
                    filters={filters}
                    setFilters={setFilters}
                    onReset={reset}
                    taskCount={tasks?.length || 0}
                    isLoading={isLoading}
                />
            </div>

            {selectionActive && (
                <div className="flex-shrink-0 bg-indigo-50 border-b border-indigo-200 px-6 py-2 flex items-center gap-3">
                    <span className="text-sm text-indigo-900 font-medium">
                        {selectedIds.size} {selectedIds.size === 1 ? 'selecionada' : 'selecionadas'}
                    </span>
                    <button
                        onClick={() => bulkCompleteMutation.mutate([...selectedIds])}
                        disabled={bulkCompleteMutation.isPending}
                        className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md bg-white border border-indigo-200 text-indigo-700 hover:bg-indigo-100"
                    >
                        <Check className="h-3.5 w-3.5" />
                        Concluir todas
                    </button>
                    <div className="relative">
                        <button
                            onClick={() => setBulkReassignOpen(!bulkReassignOpen)}
                            className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md bg-white border border-indigo-200 text-indigo-700 hover:bg-indigo-100"
                        >
                            <UserPlus className="h-3.5 w-3.5" />
                            Reatribuir
                        </button>
                        {bulkReassignOpen && (
                            <div className="absolute left-0 top-full mt-1 w-64 max-h-[300px] overflow-y-auto bg-white border border-slate-200 rounded-lg shadow-lg z-30">
                                {profiles.map((p) => (
                                    <button
                                        key={p.id}
                                        onClick={() => bulkReassignMutation.mutate({ ids: [...selectedIds], responsavelId: p.id })}
                                        className="w-full text-left px-3 py-1.5 text-xs hover:bg-slate-50 truncate"
                                    >
                                        {p.full_name || p.email}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                    <button
                        onClick={() => setSelectedIds(new Set())}
                        className="ml-auto flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800"
                    >
                        <X className="h-3.5 w-3.5" />
                        Limpar seleção
                    </button>
                </div>
            )}

            <div className="flex-1 overflow-y-auto">
                {isLoading ? (
                    <div className="px-6 py-8 space-y-3">
                        {[1, 2, 3, 4, 5].map(i => (
                            <div key={i} className="h-16 bg-slate-100 rounded-lg animate-pulse" />
                        ))}
                    </div>
                ) : !tasks?.length ? (
                    <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                        <CheckSquare className="h-12 w-12 mb-3 stroke-1" />
                        <p className="text-sm font-medium">Nenhuma tarefa encontrada</p>
                        <p className="text-xs mt-1">Ajuste os filtros ou crie uma nova tarefa.</p>
                    </div>
                ) : groupedTasks ? (
                    <div className="divide-y divide-slate-200">
                        {groupedTasks.map((group) => (
                            <div key={group.cardId}>
                                <div className="px-6 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                                    <a
                                        href={`/cards/${group.cardId}`}
                                        className="text-sm font-semibold text-slate-700 hover:text-indigo-700 truncate"
                                    >
                                        {group.cardTitulo || 'Sem título'}
                                    </a>
                                    <span className="text-xs text-slate-500">
                                        {group.items.length} {group.items.length === 1 ? 'tarefa' : 'tarefas'}
                                    </span>
                                </div>
                                <div className="divide-y divide-slate-100">
                                    {group.items.map((task) => (
                                        <TaskRow
                                            key={task.id}
                                            task={task}
                                            onComplete={() => handleComplete(task)}
                                            onUncomplete={() => uncompleteMutation.mutate(task.id)}
                                            onReschedule={() => setRescheduleTask(task)}
                                            isCompleting={completeMutation.isPending}
                                            selected={selectedIds.has(task.id)}
                                            onToggleSelect={() => toggleSelect(task.id)}
                                            showSelector
                                        />
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="divide-y divide-slate-100">
                        {tasks.map((task) => (
                            <TaskRow
                                key={task.id}
                                task={task}
                                onComplete={() => handleComplete(task)}
                                onUncomplete={() => uncompleteMutation.mutate(task.id)}
                                onReschedule={() => setRescheduleTask(task)}
                                isCompleting={completeMutation.isPending}
                                selected={selectedIds.has(task.id)}
                                onToggleSelect={() => toggleSelect(task.id)}
                                showSelector
                            />
                        ))}
                    </div>
                )}
            </div>

            {taskToComplete && (
                <TaskOutcomeModal
                    open={outcomeModalOpen}
                    onOpenChange={(open) => {
                        setOutcomeModalOpen(open)
                        if (!open) setTaskToComplete(null)
                    }}
                    taskTipo={taskToComplete.tipo}
                    onConfirm={(outcome, feedback) => {
                        completeMutation.mutate({ taskId: taskToComplete.id, outcome, feedback })
                        setTaskToComplete(null)
                    }}
                />
            )}

            <RescheduleModal
                task={rescheduleTask}
                open={!!rescheduleTask}
                onOpenChange={(open) => { if (!open) setRescheduleTask(null) }}
            />

            <CreateTaskModal
                open={createOpen}
                onOpenChange={setCreateOpen}
            />
        </div>
    )
}
