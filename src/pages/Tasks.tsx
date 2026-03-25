import { useState, useMemo } from 'react'
import {
    Search, CheckSquare, Phone, MessageSquare, Mail,
    Calendar, FileText, Send, Clock, AlertCircle, Check,
    X, ListFilter, ChevronRight
} from 'lucide-react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { cn } from '../lib/utils'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useTaskFilters } from '../hooks/useTaskFilters'
import { useTasksList } from '../hooks/useTasksList'
import { useFilterOptions } from '../hooks/useFilterOptions'
import { TaskOutcomeModal } from '../components/shared/TaskOutcomeModal'
import { useTaskTypesWithOutcomes } from '../hooks/useTaskOutcomes'
import { toast } from 'sonner'
import type { TaskDeadlineFilter } from '../hooks/useTaskFilters'
import type { TaskListItem } from '../hooks/useTasksList'

// --- Task type config ---
const TASK_TYPE_CONFIG: Record<string, { icon: typeof Phone; label: string; color: string; bg: string }> = {
    tarefa: { icon: CheckSquare, label: 'Tarefa', color: 'text-slate-600', bg: 'bg-slate-100' },
    contato: { icon: Phone, label: 'Contato', color: 'text-blue-600', bg: 'bg-blue-50' },
    // Legacy: ligacao/whatsapp foram unificados em "contato" — fallback para dados antigos
    ligacao: { icon: Phone, label: 'Contato', color: 'text-blue-600', bg: 'bg-blue-50' },
    whatsapp: { icon: MessageSquare, label: 'Contato', color: 'text-blue-600', bg: 'bg-blue-50' },
    email: { icon: Mail, label: 'Email', color: 'text-orange-600', bg: 'bg-orange-50' },
    reuniao: { icon: Calendar, label: 'Reuniao', color: 'text-purple-600', bg: 'bg-purple-50' },
    enviar_proposta: { icon: Send, label: 'Proposta', color: 'text-indigo-600', bg: 'bg-indigo-50' },
    coleta_documentos: { icon: FileText, label: 'Docs', color: 'text-amber-600', bg: 'bg-amber-50' },
    solicitacao_mudanca: { icon: FileText, label: 'Mudanca', color: 'text-rose-600', bg: 'bg-rose-50' },
    envio_presente: { icon: CheckSquare, label: 'Presente', color: 'text-pink-600', bg: 'bg-pink-50' },
}

const DEADLINE_OPTIONS: { value: TaskDeadlineFilter; label: string; variant: string }[] = [
    { value: 'all', label: 'Todas', variant: 'default' },
    { value: 'overdue', label: 'Atrasadas', variant: 'overdue' },
    { value: 'today', label: 'Hoje', variant: 'today' },
    { value: 'tomorrow', label: 'Amanha', variant: 'future' },
    { value: 'this_week', label: 'Esta Semana', variant: 'future' },
    { value: 'next_week', label: 'Prox. Semana', variant: 'future' },
    { value: 'no_date', label: 'Sem Prazo', variant: 'default' },
]

export default function Tasks() {
    const { profile } = useAuth()
    const { filters, setFilters, reset } = useTaskFilters()
    const { data: tasks, isLoading } = useTasksList({ filters })
    const { data: options } = useFilterOptions()
    const queryClient = useQueryClient()

    const [showFilters, setShowFilters] = useState(false)
    const [personSearch, setPersonSearch] = useState('')

    // Outcome modal state
    const [outcomeModalOpen, setOutcomeModalOpen] = useState(false)
    const [taskToComplete, setTaskToComplete] = useState<TaskListItem | null>(null)
    const typesWithOutcomes = useTaskTypesWithOutcomes()

    const profiles = options?.profiles || []

    // Complete task mutation (with optional outcome)
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
            toast.success('Tarefa concluida')
        },
        onError: (error: Error) => {
            toast.error('Erro ao concluir tarefa', { description: error.message })
        },
    })

    // Uncomplete task mutation
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
            queryClient.invalidateQueries({ queryKey: ['cards'] })
            toast.success('Tarefa reaberta')
        },
        onError: (error: Error) => {
            toast.error('Erro ao reabrir tarefa', { description: error.message })
        },
    })

    const handleComplete = (task: TaskListItem) => {
        if (typesWithOutcomes.has(task.tipo)) {
            setTaskToComplete(task)
            setOutcomeModalOpen(true)
        } else {
            completeMutation.mutate({ taskId: task.id })
        }
    }

    // Count active filters
    const activeFilterCount = useMemo(() => {
        let count = 0
        if (filters.tipos.length > 0) count++
        if (filters.responsavelIds.length > 0) count++
        if (filters.dateFrom || filters.dateTo) count++
        if (filters.deadlineFilter !== 'all') count++
        if (filters.search) count++
        return count
    }, [filters])

    const hasFilters = activeFilterCount > 0 || filters.statusFilter !== 'pending'

    const filteredProfiles = personSearch
        ? profiles.filter(p =>
            (p.full_name || '').toLowerCase().includes(personSearch.toLowerCase()) ||
            (p.email || '').toLowerCase().includes(personSearch.toLowerCase())
        )
        : profiles

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="flex-shrink-0 border-b border-slate-200 bg-white px-6 py-4">
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <h1 className="text-xl font-bold text-slate-900 tracking-tight">Tarefas</h1>
                        <p className="text-sm text-slate-500 mt-0.5">
                            {isLoading ? 'Carregando...' : `${tasks?.length || 0} tarefas`}
                        </p>
                    </div>
                </div>

                {/* Status toggle + Search + Filter button */}
                <div className="flex items-center gap-3">
                    {/* Status toggle */}
                    <div className="flex bg-slate-100 rounded-lg p-0.5">
                        <StatusButton
                            active={filters.statusFilter === 'pending'}
                            onClick={() => setFilters({ statusFilter: 'pending' })}
                            label="Pendentes"
                        />
                        <StatusButton
                            active={filters.statusFilter === 'completed'}
                            onClick={() => setFilters({ statusFilter: 'completed' })}
                            label="Concluidas"
                        />
                    </div>

                    {/* Search */}
                    <div className="relative flex-1 max-w-sm">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Buscar por titulo..."
                            value={filters.search}
                            onChange={(e) => setFilters({ search: e.target.value })}
                            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-300"
                        />
                        {filters.search && (
                            <button
                                onClick={() => setFilters({ search: '' })}
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        )}
                    </div>

                    {/* Filter toggle */}
                    <button
                        onClick={() => setShowFilters(!showFilters)}
                        className={cn(
                            "flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg border transition-all",
                            showFilters
                                ? "bg-indigo-50 border-indigo-200 text-indigo-700"
                                : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                        )}
                    >
                        <ListFilter className="h-4 w-4" />
                        Filtros
                        {activeFilterCount > 0 && (
                            <span className="text-[10px] font-bold min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-indigo-100 text-indigo-700">
                                {activeFilterCount}
                            </span>
                        )}
                    </button>

                    {hasFilters && (
                        <button
                            onClick={reset}
                            className="text-xs text-slate-500 hover:text-slate-700 underline"
                        >
                            Limpar
                        </button>
                    )}
                </div>

                {/* Deadline pills */}
                <div className="flex items-center gap-1.5 mt-3 overflow-x-auto scrollbar-hide">
                    {DEADLINE_OPTIONS.map((opt) => (
                        <DeadlinePill
                            key={opt.value}
                            label={opt.label}
                            active={filters.deadlineFilter === opt.value}
                            variant={opt.variant}
                            onClick={() => setFilters({ deadlineFilter: opt.value, dateFrom: undefined, dateTo: undefined })}
                        />
                    ))}
                </div>
            </div>

            {/* Expanded filters panel */}
            {showFilters && (
                <div className="flex-shrink-0 border-b border-slate-200 bg-slate-50/50 px-6 py-4 animate-in slide-in-from-top-2 duration-200">
                    <div className="flex flex-wrap gap-6">
                        {/* Tipo filter */}
                        <div className="min-w-[200px]">
                            <label className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2 block">Tipo</label>
                            <div className="flex flex-wrap gap-1.5">
                                {Object.entries(TASK_TYPE_CONFIG).filter(([key]) => key !== 'ligacao' && key !== 'whatsapp').map(([key, cfg]) => {
                                    const Icon = cfg.icon
                                    const isSelected = filters.tipos.includes(key)
                                    return (
                                        <button
                                            key={key}
                                            onClick={() => {
                                                const tipos = isSelected
                                                    ? filters.tipos.filter(t => t !== key)
                                                    : [...filters.tipos, key]
                                                setFilters({ tipos })
                                            }}
                                            className={cn(
                                                "flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md border transition-all",
                                                isSelected
                                                    ? `${cfg.bg} ${cfg.color} border-current/20`
                                                    : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                                            )}
                                        >
                                            <Icon className="h-3 w-3" />
                                            {cfg.label}
                                        </button>
                                    )
                                })}
                            </div>
                        </div>

                        {/* Responsavel filter */}
                        <div className="min-w-[220px]">
                            <label className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2 block">Responsavel</label>
                            <div className="relative mb-2">
                                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                                <input
                                    type="text"
                                    placeholder="Buscar pessoa..."
                                    value={personSearch}
                                    onChange={(e) => setPersonSearch(e.target.value)}
                                    className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-300"
                                />
                            </div>
                            <div className="flex flex-wrap gap-1.5 max-h-[100px] overflow-y-auto">
                                {filteredProfiles.map((p) => {
                                    const isSelected = filters.responsavelIds.includes(p.id)
                                    return (
                                        <button
                                            key={p.id}
                                            onClick={() => {
                                                const ids = isSelected
                                                    ? filters.responsavelIds.filter(id => id !== p.id)
                                                    : [...filters.responsavelIds, p.id]
                                                setFilters({ responsavelIds: ids })
                                            }}
                                            className={cn(
                                                "flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md border transition-all",
                                                isSelected
                                                    ? "bg-indigo-50 border-indigo-200 text-indigo-700"
                                                    : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                                            )}
                                        >
                                            <div className={cn(
                                                "flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold flex-shrink-0",
                                                isSelected ? "bg-indigo-200 text-indigo-800" : "bg-slate-200 text-slate-600"
                                            )}>
                                                {(p.full_name || '?').charAt(0).toUpperCase()}
                                            </div>
                                            {(p.full_name || p.email || '').split(' ')[0]}
                                        </button>
                                    )
                                })}
                            </div>
                        </div>

                        {/* Date range filter */}
                        <div className="min-w-[200px]">
                            <label className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2 block">Periodo (vencimento)</label>
                            <div className="flex items-center gap-2">
                                <input
                                    type="date"
                                    value={filters.dateFrom || ''}
                                    onChange={(e) => setFilters({ dateFrom: e.target.value || undefined, deadlineFilter: 'all' })}
                                    className="px-2 py-1.5 text-xs border border-slate-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                                />
                                <span className="text-xs text-slate-400">ate</span>
                                <input
                                    type="date"
                                    value={filters.dateTo || ''}
                                    onChange={(e) => setFilters({ dateTo: e.target.value || undefined, deadlineFilter: 'all' })}
                                    className="px-2 py-1.5 text-xs border border-slate-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Active filter chips */}
                    {activeFilterCount > 0 && (
                        <div className="flex flex-wrap items-center gap-1.5 mt-3 pt-3 border-t border-slate-200">
                            {filters.tipos.map(tipo => {
                                const cfg = TASK_TYPE_CONFIG[tipo]
                                return (
                                    <span key={tipo} className={cn("inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full", cfg?.bg, cfg?.color)}>
                                        {cfg?.label || tipo}
                                        <button onClick={() => setFilters({ tipos: filters.tipos.filter(t => t !== tipo) })}>
                                            <X className="h-3 w-3" />
                                        </button>
                                    </span>
                                )
                            })}
                            {filters.responsavelIds.map(id => {
                                const p = profiles.find(pr => pr.id === id)
                                return (
                                    <span key={id} className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-indigo-50 text-indigo-700">
                                        {(p?.full_name || '').split(' ')[0] || id.slice(0, 8)}
                                        <button onClick={() => setFilters({ responsavelIds: filters.responsavelIds.filter(r => r !== id) })}>
                                            <X className="h-3 w-3" />
                                        </button>
                                    </span>
                                )
                            })}
                            {(filters.dateFrom || filters.dateTo) && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-slate-100 text-slate-600">
                                    {filters.dateFrom || '...'} a {filters.dateTo || '...'}
                                    <button onClick={() => setFilters({ dateFrom: undefined, dateTo: undefined })}>
                                        <X className="h-3 w-3" />
                                    </button>
                                </span>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* Task list */}
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
                        <p className="text-xs mt-1">Ajuste os filtros ou crie novas tarefas</p>
                    </div>
                ) : (
                    <div className="divide-y divide-slate-100">
                        {tasks.map((task) => (
                            <TaskRow
                                key={task.id}
                                task={task}
                                onComplete={() => handleComplete(task)}
                                onUncomplete={() => uncompleteMutation.mutate(task.id)}
                                isCompleting={completeMutation.isPending}
                            />
                        ))}
                    </div>
                )}
            </div>

            {/* Outcome Modal */}
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
        </div>
    )
}

// --- Outcome label helpers ---
const OUTCOME_LABELS: Record<string, string> = {
    atendeu: 'Atendeu',
    nao_atendeu: 'Nao Atendeu',
    caixa_postal: 'Caixa Postal',
    numero_invalido: 'Num. Invalido',
    respondido: 'Respondido',
    visualizado: 'Visualizado',
    enviado: 'Enviado',
    realizada: 'Realizada',
    cancelada: 'Cancelada',
    nao_compareceu: 'Nao Compareceu',
    remarcada: 'Remarcada',
    resolvido: 'Resolvido',
    cancelado_cliente: 'Canc. Cliente',
    adiada: 'Adiada',
    escalado: 'Escalado',
    resolvido_com_custo: 'Resol. c/ Custo',
}

const OUTCOME_STYLES: Record<string, string> = {
    atendeu: 'text-green-600 bg-green-50 border-green-200',
    nao_atendeu: 'text-red-600 bg-red-50 border-red-200',
    caixa_postal: 'text-amber-600 bg-amber-50 border-amber-200',
    numero_invalido: 'text-red-600 bg-red-50 border-red-200',
    respondido: 'text-green-600 bg-green-50 border-green-200',
    realizada: 'text-green-600 bg-green-50 border-green-200',
    cancelada: 'text-red-600 bg-red-50 border-red-200',
    resolvido: 'text-green-600 bg-green-50 border-green-200',
}

// --- Sub-components ---

function StatusButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
    return (
        <button
            onClick={onClick}
            className={cn(
                "px-3 py-1.5 text-xs font-medium rounded-md transition-all",
                active
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
            )}
        >
            {label}
        </button>
    )
}

function DeadlinePill({ label, active, variant, onClick }: { label: string; active: boolean; variant: string; onClick: () => void }) {
    const styles: Record<string, { base: string; active: string }> = {
        default: { base: 'border-slate-200 text-slate-600', active: 'bg-slate-100 border-slate-300 shadow-sm' },
        overdue: { base: 'border-red-200 text-red-700', active: 'bg-red-50 border-red-300 shadow-sm' },
        today: { base: 'border-blue-200 text-blue-700', active: 'bg-blue-50 border-blue-300 shadow-sm' },
        future: { base: 'border-emerald-200 text-emerald-700', active: 'bg-emerald-50 border-emerald-300 shadow-sm' },
    }

    const s = styles[variant] || styles.default

    return (
        <button
            onClick={onClick}
            className={cn(
                "px-2.5 py-1 text-xs font-medium rounded-full border transition-all whitespace-nowrap",
                s.base,
                active ? s.active : "bg-white hover:shadow-sm"
            )}
        >
            {label}
        </button>
    )
}

function TaskRow({ task, onComplete, onUncomplete, isCompleting }: {
    task: TaskListItem
    onComplete: () => void
    onUncomplete: () => void
    isCompleting: boolean
}) {
    const config = TASK_TYPE_CONFIG[task.tipo] || TASK_TYPE_CONFIG.tarefa
    const Icon = config.icon

    // Build deadline badge
    let deadlineBadge: { text: string; className: string } | null = null
    if (task.diff_days !== null) {
        if (task.diff_days < 0) {
            const abs = Math.abs(task.diff_days)
            deadlineBadge = {
                text: `Atrasada ${abs} ${abs === 1 ? 'dia' : 'dias'}`,
                className: 'bg-red-50 text-red-700 border-red-100',
            }
        } else if (task.diff_days === 0) {
            deadlineBadge = {
                text: 'Hoje',
                className: 'bg-blue-50 text-blue-700 border-blue-100',
            }
        } else if (task.diff_days === 1) {
            deadlineBadge = {
                text: 'Amanha',
                className: 'bg-emerald-50 text-emerald-700 border-emerald-100',
            }
        } else {
            deadlineBadge = {
                text: `Em ${task.diff_days} dias`,
                className: 'bg-slate-50 text-slate-600 border-slate-100',
            }
        }
    }

    const dateStr = task.data_vencimento
        ? format(new Date(task.data_vencimento), "dd/MM/yy HH:mm", { locale: ptBR })
        : null
    const hasTime = dateStr && !dateStr.endsWith('00:00')

    return (
        <div className={cn(
            "flex items-center gap-3 px-6 py-3 hover:bg-slate-50/80 transition-colors group",
            task.concluida && "opacity-60"
        )}>
            {/* Complete checkbox */}
            <button
                onClick={(e) => { e.stopPropagation(); if (task.concluida) { onUncomplete() } else { onComplete() } }}
                disabled={isCompleting}
                className={cn(
                    "flex-shrink-0 h-5 w-5 rounded-full border-2 flex items-center justify-center transition-all",
                    task.concluida
                        ? "bg-emerald-500 border-emerald-500 text-white"
                        : "border-slate-300 hover:border-emerald-400 hover:bg-emerald-50"
                )}
            >
                {task.concluida && <Check className="h-3 w-3" />}
            </button>

            {/* Type icon */}
            <div className={cn("flex-shrink-0 h-7 w-7 rounded-md flex items-center justify-center", config.bg)}>
                <Icon className={cn("h-3.5 w-3.5", config.color)} />
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <span className={cn(
                        "text-sm font-medium text-slate-900 truncate",
                        task.concluida && "line-through text-slate-500"
                    )}>
                        {task.titulo}
                    </span>
                    <span className={cn("text-xs px-1.5 py-0.5 rounded font-medium", config.bg, config.color)}>
                        {config.label}
                    </span>
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                    {task.card_titulo && (
                        <a
                            href={`/cards/${task.card_id}`}
                            className="text-xs text-slate-500 hover:text-indigo-600 truncate max-w-[200px] flex items-center gap-0.5"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <ChevronRight className="h-3 w-3" />
                            {task.card_titulo}
                        </a>
                    )}
                    {task.contato_nome && (
                        <span className="text-xs text-slate-400 truncate max-w-[150px]">
                            {task.contato_nome}
                        </span>
                    )}
                </div>
            </div>

            {/* Responsavel */}
            {task.responsavel_nome && (
                <div className="flex items-center gap-1.5 flex-shrink-0">
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-bold">
                        {task.responsavel_nome.charAt(0).toUpperCase()}
                    </div>
                    <span className="text-xs text-slate-500 hidden sm:inline max-w-[80px] truncate">
                        {task.responsavel_nome.split(' ')[0]}
                    </span>
                </div>
            )}

            {/* Outcome badge (completed tasks) */}
            {task.concluida && (task.outcome || task.resultado) && (() => {
                const outcomeKey = task.outcome || task.resultado || ''
                const label = OUTCOME_LABELS[outcomeKey] || outcomeKey.replace(/_/g, ' ')
                const style = OUTCOME_STYLES[outcomeKey] || 'text-gray-600 bg-gray-50 border-gray-200'
                return (
                    <span className={cn("flex-shrink-0 inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border", style)}>
                        {label}
                    </span>
                )
            })()}

            {/* Deadline badge */}
            {!task.concluida && deadlineBadge && (
                <span className={cn(
                    "flex-shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium border",
                    deadlineBadge.className
                )}>
                    {task.diff_days !== null && task.diff_days < 0 && <AlertCircle className="h-3 w-3" />}
                    {task.diff_days === 0 && <Clock className="h-3 w-3" />}
                    {deadlineBadge.text}
                </span>
            )}

            {/* Date */}
            {dateStr && (
                <span className="flex-shrink-0 text-xs text-slate-400 tabular-nums min-w-[70px] text-right">
                    {hasTime ? dateStr : dateStr.replace(' 00:00', '')}
                </span>
            )}
        </div>
    )
}
