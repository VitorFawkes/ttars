import { Check, AlertCircle, Clock, Phone, Mail, MessageSquare, ChevronRight, Copy } from 'lucide-react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { toast } from 'sonner'
import { cn } from '../../lib/utils'
import { useAuth } from '../../contexts/AuthContext'
import type { TaskListItem } from '../../hooks/useTasksList'
import { TaskQuickActions } from './TaskQuickActions'
import {
    getTaskTypeConfig,
    PRIORIDADE_CONFIG,
    ORIGEM_CONFIG,
    OUTCOME_LABELS,
    OUTCOME_STYLES,
    formatCurrencyBRL,
    sanitizePhone,
} from './taskTypeConfig'

interface Props {
    task: TaskListItem
    onComplete: () => void
    onUncomplete: () => void
    onReschedule: () => void
    isCompleting: boolean
    selected?: boolean
    onToggleSelect?: () => void
    showSelector?: boolean
}

export function TaskRow({
    task, onComplete, onUncomplete, onReschedule,
    isCompleting, selected, onToggleSelect, showSelector,
}: Props) {
    const { profile } = useAuth()
    const isManager = !!profile?.is_admin || profile?.role_info?.name === 'manager'
    const config = getTaskTypeConfig(task.tipo)
    const Icon = config.icon
    const prioridadeCfg = task.prioridade ? PRIORIDADE_CONFIG[task.prioridade] : null
    // "integracao" é ubíqua (quase toda tarefa veio de sync) — não poluir a linha.
    // Mostrar badge só para cadencia/automacao que são informativas.
    const showOrigemBadge = task.origem === 'cadencia' || task.origem === 'automacao'
    const origemCfg = ORIGEM_CONFIG[task.origem]

    // Deadline badge
    let deadlineBadge: { text: string; className: string; icon?: typeof Clock } | null = null
    if (task.diff_days !== null) {
        if (task.diff_days < 0) {
            const abs = Math.abs(task.diff_days)
            deadlineBadge = {
                text: `Atrasada ${abs}d`,
                className: 'bg-red-50 text-red-700 border-red-200',
                icon: AlertCircle,
            }
        } else if (task.diff_days === 0) {
            deadlineBadge = { text: 'Hoje', className: 'bg-blue-50 text-blue-700 border-blue-200', icon: Clock }
        } else if (task.diff_days === 1) {
            deadlineBadge = { text: 'Amanhã', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' }
        } else {
            deadlineBadge = { text: `Em ${task.diff_days}d`, className: 'bg-slate-50 text-slate-600 border-slate-200' }
        }
    }

    const dateStr = task.data_vencimento
        ? format(new Date(task.data_vencimento), "dd/MM HH:mm", { locale: ptBR })
        : null

    const wa = sanitizePhone(task.contato_telefone)
    const valorStr = formatCurrencyBRL(task.card_valor)

    const copyEmail = () => {
        if (!task.contato_email) return
        navigator.clipboard.writeText(task.contato_email)
        toast.success('Email copiado')
    }

    const isReschedulable = !task.concluida

    return (
        <div className={cn(
            "group relative flex items-start gap-3 px-6 py-3 hover:bg-slate-50/80 transition-colors",
            task.concluida && "opacity-60"
        )}>
            {/* Priority color bar (left) */}
            {prioridadeCfg && (
                <span
                    className={cn("absolute left-0 top-3 bottom-3 w-1 rounded-r", prioridadeCfg.bar)}
                    aria-label={`Prioridade ${prioridadeCfg.label}`}
                />
            )}

            {/* Bulk selector */}
            {showSelector && onToggleSelect && (
                <input
                    type="checkbox"
                    checked={selected}
                    onChange={onToggleSelect}
                    onClick={(e) => e.stopPropagation()}
                    className="mt-1 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
            )}

            {/* Complete checkbox */}
            <button
                onClick={(e) => { e.stopPropagation(); if (task.concluida) onUncomplete(); else onComplete() }}
                disabled={isCompleting}
                className={cn(
                    "flex-shrink-0 mt-0.5 h-5 w-5 rounded-full border-2 flex items-center justify-center transition-all",
                    task.concluida
                        ? "bg-emerald-500 border-emerald-500 text-white"
                        : "border-slate-300 hover:border-emerald-400 hover:bg-emerald-50"
                )}
                aria-label={task.concluida ? 'Reabrir' : 'Concluir'}
            >
                {task.concluida && <Check className="h-3 w-3" />}
            </button>

            {/* Type icon */}
            <div className={cn("flex-shrink-0 mt-0.5 h-7 w-7 rounded-md flex items-center justify-center", config.bg)}>
                <Icon className={cn("h-3.5 w-3.5", config.color)} />
            </div>

            {/* Content column */}
            <div className="flex-1 min-w-0">
                {/* Line 1: título + badges */}
                <div className="flex items-center gap-2 flex-wrap">
                    <span className={cn(
                        "text-sm font-medium text-slate-900 truncate max-w-[320px]",
                        task.concluida && "line-through text-slate-500"
                    )}>
                        {task.titulo}
                    </span>
                    <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-medium", config.bg, config.color)}>
                        {config.label}
                    </span>
                    {prioridadeCfg && (
                        <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-medium border", prioridadeCfg.chip, prioridadeCfg.chipText)}>
                            {prioridadeCfg.label}
                        </span>
                    )}
                    {showOrigemBadge && origemCfg && (
                        <span
                            className={cn("text-[10px] px-1.5 py-0.5 rounded font-medium border", origemCfg.chip)}
                            title={task.cadencia_nome || origemCfg.label}
                        >
                            {task.cadencia_nome ? `${origemCfg.label}: ${task.cadencia_nome}` : origemCfg.label}
                        </span>
                    )}
                </div>

                {/* Line 2: descricao (se houver) */}
                {task.descricao && (
                    <p className="text-xs text-slate-500 mt-0.5 truncate max-w-[560px]">
                        {task.descricao}
                    </p>
                )}

                {/* Line 3: card + contato + fase */}
                <div className="flex items-center gap-3 mt-1 flex-wrap text-xs">
                    {task.card_titulo && (
                        <a
                            href={`/cards/${task.card_id}`}
                            className="flex items-center gap-0.5 text-slate-600 hover:text-indigo-600 truncate max-w-[220px]"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <ChevronRight className="h-3 w-3 flex-shrink-0" />
                            <span className="truncate font-medium">{task.card_titulo}</span>
                        </a>
                    )}
                    {task.card_stage_nome && (
                        <span className="text-slate-400">· {task.card_stage_nome}</span>
                    )}
                    {valorStr && (
                        <span className="text-slate-500 font-medium tabular-nums">{valorStr}</span>
                    )}
                    {task.contato_nome && (
                        <span className="flex items-center gap-1 text-slate-500 truncate max-w-[180px]">
                            <span className="text-slate-400">·</span>
                            <span className="truncate">{task.contato_nome}</span>
                        </span>
                    )}
                    {wa && (
                        <a
                            href={`https://wa.me/${wa}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-0.5 text-emerald-600 hover:text-emerald-700"
                            title="Abrir no WhatsApp"
                        >
                            <MessageSquare className="h-3 w-3" />
                            WhatsApp
                        </a>
                    )}
                    {task.contato_telefone && (
                        <a
                            href={`tel:${task.contato_telefone}`}
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-0.5 text-slate-500 hover:text-indigo-600"
                            title="Ligar"
                        >
                            <Phone className="h-3 w-3" />
                        </a>
                    )}
                    {task.contato_email && (
                        <button
                            onClick={(e) => { e.stopPropagation(); copyEmail() }}
                            className="inline-flex items-center gap-0.5 text-slate-500 hover:text-indigo-600"
                            title={`Copiar ${task.contato_email}`}
                        >
                            <Mail className="h-3 w-3" />
                            <Copy className="h-2.5 w-2.5" />
                        </button>
                    )}
                </div>

                {/* Linha de auditoria (admin/gestor): criado por / concluído por */}
                {isManager && (task.created_by_nome || task.concluido_por_nome) && (
                    <div className="flex items-center gap-2 mt-1 flex-wrap text-[11px] text-slate-400">
                        {task.created_by_nome && (
                            <span title={`Criado por ${task.created_by_nome}`}>
                                Criado por <span className="text-slate-600 font-medium">{task.created_by_nome.split(' ')[0]}</span>
                            </span>
                        )}
                        {task.concluido_por_nome && task.concluida && (
                            <>
                                <span>·</span>
                                <span title={`Concluído por ${task.concluido_por_nome}`}>
                                    Concluído por <span className="text-slate-600 font-medium">{task.concluido_por_nome.split(' ')[0]}</span>
                                </span>
                            </>
                        )}
                    </div>
                )}
            </div>

            {/* Responsável */}
            {task.responsavel_nome && (
                <div className="flex flex-col items-end gap-0.5 flex-shrink-0 mt-0.5">
                    <div className="flex items-center gap-1.5">
                        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-bold">
                            {task.responsavel_nome.charAt(0).toUpperCase()}
                        </div>
                        <span className="text-xs text-slate-600 hidden sm:inline max-w-[100px] truncate">
                            {task.responsavel_nome.split(' ')[0]}
                        </span>
                    </div>
                    {task.responsavel_fase_nome && (
                        <span className="text-[10px] text-slate-400 hidden sm:inline">
                            {task.responsavel_fase_nome}
                        </span>
                    )}
                </div>
            )}

            {/* Outcome badge (completed) */}
            {task.concluida && (task.outcome || task.resultado) && (() => {
                const outcomeKey = task.outcome || task.resultado || ''
                const label = OUTCOME_LABELS[outcomeKey] || outcomeKey.replace(/_/g, ' ')
                const style = OUTCOME_STYLES[outcomeKey] || 'text-slate-600 bg-slate-50 border-slate-200'
                return (
                    <span className={cn("flex-shrink-0 mt-0.5 inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border", style)}>
                        {label}
                    </span>
                )
            })()}

            {/* Deadline badge */}
            {!task.concluida && deadlineBadge && (
                <span className={cn(
                    "flex-shrink-0 mt-0.5 inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium border whitespace-nowrap",
                    deadlineBadge.className
                )}>
                    {deadlineBadge.icon && <deadlineBadge.icon className="h-3 w-3" />}
                    {deadlineBadge.text}
                </span>
            )}

            {/* Date */}
            {dateStr && (
                <span className="flex-shrink-0 mt-1 text-xs text-slate-400 tabular-nums min-w-[80px] text-right">
                    {dateStr}
                </span>
            )}

            {/* Quick actions menu */}
            <TaskQuickActions
                task={task}
                onReschedule={onReschedule}
                onComplete={onComplete}
                onUncomplete={onUncomplete}
            />
            {!isReschedulable && null}
        </div>
    )
}
