import { Check, Phone, MessageSquare, Mail, Calendar, FileText, CheckSquare, Users, Send, Clock } from 'lucide-react'
import { format, differenceInDays, isToday, isTomorrow, startOfDay } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { cn } from '../../lib/utils'
import type { MyDayTask } from '../../hooks/useMyDayTasks'

const TASK_TYPE_CONFIG: Record<string, { icon: typeof Phone; label: string; color: string }> = {
    tarefa: { icon: CheckSquare, label: 'Tarefa', color: 'text-slate-500' },
    contato: { icon: Users, label: 'Contato', color: 'text-blue-500' },
    ligacao: { icon: Phone, label: 'Ligação', color: 'text-green-500' },
    whatsapp: { icon: MessageSquare, label: 'WhatsApp', color: 'text-emerald-500' },
    email: { icon: Mail, label: 'Email', color: 'text-orange-500' },
    reuniao: { icon: Calendar, label: 'Reunião', color: 'text-purple-500' },
    enviar_proposta: { icon: Send, label: 'Proposta', color: 'text-indigo-500' },
    coleta_documentos: { icon: FileText, label: 'Docs', color: 'text-amber-500' },
    solicitacao_mudanca: { icon: FileText, label: 'Mudança', color: 'text-rose-500' },
}

interface MyDayTaskCardProps {
    task: MyDayTask
    isOverdue?: boolean
    showOwner?: boolean
    onComplete: (taskId: string) => void
    isCompleting?: boolean
}

export function MyDayTaskCard({ task, isOverdue, showOwner, onComplete, isCompleting }: MyDayTaskCardProps) {
    const config = TASK_TYPE_CONFIG[task.tipo] || TASK_TYPE_CONFIG.tarefa
    const Icon = config.icon

    const dueDate = task.data_vencimento ? new Date(task.data_vencimento) : null
    const timeStr = dueDate ? format(dueDate, 'HH:mm') : null
    const hasTime = timeStr && timeStr !== '00:00'

    // Build date label
    let dateLabel = ''
    let dateColor = 'text-slate-400'
    if (dueDate) {
        const now = new Date()
        if (isOverdue) {
            const daysLate = differenceInDays(startOfDay(now), startOfDay(dueDate))
            dateLabel = daysLate === 1 ? 'há 1 dia' : `há ${daysLate} dias`
            dateColor = 'text-red-500'
        } else if (isToday(dueDate)) {
            dateLabel = hasTime ? `Hoje ${timeStr}` : 'Hoje'
            dateColor = 'text-blue-500'
        } else if (isTomorrow(dueDate)) {
            dateLabel = hasTime ? `Amanhã ${timeStr}` : 'Amanhã'
        } else {
            const dayPart = format(dueDate, "EEE dd/MM", { locale: ptBR }).replace(/^\w/, c => c.toUpperCase())
            dateLabel = hasTime ? `${dayPart} ${timeStr}` : dayPart
        }
    }

    const cardUrl = `/cards/${task.card_id}`

    return (
        <a
            href={cardUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
                "flex-shrink-0 w-[220px] bg-white border rounded-lg p-3 flex flex-col gap-2 transition-all hover:shadow-md cursor-pointer no-underline",
                isOverdue
                    ? "border-red-200 bg-red-50/50"
                    : "border-slate-200"
            )}
        >
            {/* Type + Date */}
            <div className="flex items-center justify-between">
                <div className={cn("flex items-center gap-1.5 text-xs font-medium", config.color)}>
                    <Icon className="h-3.5 w-3.5" />
                    <span>{config.label}</span>
                </div>
                {dateLabel && (
                    <div className={cn("flex items-center gap-1 text-xs font-medium", dateColor)}>
                        <Clock className="h-3 w-3" />
                        <span>{dateLabel}</span>
                    </div>
                )}
            </div>

            {/* Title */}
            <p className="text-sm font-medium text-slate-900 line-clamp-2 leading-tight">
                {task.titulo}
            </p>

            {/* Card + Contact */}
            <div className="flex flex-col gap-0.5">
                {task.card_titulo && (
                    <p className="text-xs text-slate-500 truncate">{task.card_titulo}</p>
                )}
                {task.contato_nome && (
                    <p className="text-xs text-slate-400 truncate">{task.contato_nome}</p>
                )}
            </div>

            {/* Footer: owner + actions */}
            <div className="flex items-center gap-1.5 mt-auto pt-1 border-t border-slate-100">
                {showOwner && task.responsavel_nome && (
                    <div className="flex items-center gap-1.5 mr-auto min-w-0">
                        <div className="flex h-5 w-5 items-center justify-center rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-bold flex-shrink-0">
                            {task.responsavel_nome.charAt(0).toUpperCase()}
                        </div>
                        <span className="text-[11px] text-slate-500 truncate max-w-[70px]">
                            {task.responsavel_nome.split(' ')[0]}
                        </span>
                    </div>
                )}
                <button
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); onComplete(task.id) }}
                    disabled={isCompleting}
                    className={cn(
                        "flex items-center gap-1 px-2 py-1 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-md transition-colors disabled:opacity-50",
                        showOwner && task.responsavel_nome ? "" : "mr-auto"
                    )}
                >
                    <Check className="h-3 w-3" />
                    Concluir
                </button>
            </div>
        </a>
    )
}
