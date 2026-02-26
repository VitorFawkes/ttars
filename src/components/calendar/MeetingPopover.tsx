import { useEffect, useRef, useState } from 'react'
import { format, addMinutes } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { useNavigate } from 'react-router-dom'
import { X, Edit2, CalendarClock, ExternalLink, CheckCircle2, XCircle, Users, Clock, Loader2, Eye } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { useMeetingMutation } from '@/hooks/calendar/useMeetingMutation'
import type { CalendarMeeting } from '@/hooks/calendar/useCalendarMeetings'

interface MeetingPopoverProps {
    meeting: CalendarMeeting
    anchor: { x: number; y: number }
    onClose: () => void
    onEdit?: (meeting: CalendarMeeting) => void
    onReschedule?: (meeting: CalendarMeeting) => void
    onViewDetails?: (meeting: CalendarMeeting) => void
}

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
    agendada: { label: 'Agendada', className: 'bg-blue-100 text-blue-700' },
    realizada: { label: 'Realizada', className: 'bg-green-100 text-green-700' },
    cancelada: { label: 'Cancelada', className: 'bg-red-100 text-red-700' },
    reagendada: { label: 'Reagendada', className: 'bg-orange-100 text-orange-700' },
    nao_compareceu: { label: 'Não compareceu', className: 'bg-gray-100 text-gray-700' },
}

export function MeetingPopover({ meeting, anchor, onClose, onEdit, onReschedule, onViewDetails }: MeetingPopoverProps) {
    const navigate = useNavigate()
    const popoverRef = useRef<HTMLDivElement>(null)
    const { completeMeeting } = useMeetingMutation()
    const [showOutcomes, setShowOutcomes] = useState(false)

    const meetingDate = meeting.data_vencimento ? new Date(meeting.data_vencimento) : null
    const endTime = meetingDate ? addMinutes(meetingDate, meeting.duration_minutes) : null
    const status = meeting.status || 'agendada'
    const statusInfo = STATUS_BADGE[status] || STATUS_BADGE.agendada
    const isActive = !meeting.concluida && status === 'agendada'

    // Reset showOutcomes when meeting changes
    useEffect(() => {
        setShowOutcomes(false)
    }, [meeting.id])

    // Position popover to stay within viewport
    useEffect(() => {
        if (!popoverRef.current) return
        const el = popoverRef.current
        const rect = el.getBoundingClientRect()
        const vw = window.innerWidth
        const vh = window.innerHeight

        let newLeft = anchor.x - 160
        let newTop = anchor.y

        if (newLeft + rect.width > vw - 16) {
            newLeft = vw - rect.width - 16
        }
        if (newLeft < 16) {
            newLeft = 16
        }
        if (newTop + rect.height > vh - 16) {
            newTop = anchor.y - rect.height - 8
        }

        el.style.left = `${newLeft}px`
        el.style.top = `${newTop}px`
    }, [anchor])

    // Close on outside click — delayed to avoid race with meeting click
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
                onClose()
            }
        }
        // Use setTimeout to avoid closing immediately when another meeting is clicked
        const timer = setTimeout(() => {
            document.addEventListener('mousedown', handler)
        }, 10)
        return () => {
            clearTimeout(timer)
            document.removeEventListener('mousedown', handler)
        }
    }, [onClose])

    // Close on Escape
    useEffect(() => {
        const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
        document.addEventListener('keydown', handler)
        return () => document.removeEventListener('keydown', handler)
    }, [onClose])

    const handleComplete = (outcome: string) => {
        completeMeeting.mutate({
            id: meeting.id,
            card_id: meeting.card_id,
            outcome,
        }, {
            onSuccess: () => onClose(),
        })
    }

    const isCompleting = completeMeeting.isPending

    return (
        <div
            ref={popoverRef}
            className="fixed z-[60] bg-white shadow-xl rounded-xl border border-slate-200 w-80 animate-in fade-in zoom-in-95 duration-150"
            style={{ left: anchor.x - 160, top: anchor.y }}
        >
            {/* Header */}
            <div className="flex items-start justify-between px-4 pt-4 pb-2">
                <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-slate-900 truncate">
                        {meeting.titulo}
                    </h3>
                    {meetingDate && (
                        <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {format(meetingDate, "d MMM yyyy • HH:mm", { locale: ptBR })}
                            {endTime && ` – ${format(endTime, 'HH:mm')}`}
                        </p>
                    )}
                    <span className={cn(
                        "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium mt-1.5",
                        statusInfo.className
                    )}>
                        {statusInfo.label}
                    </span>
                </div>
                <button
                    onClick={onClose}
                    className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-md transition-colors flex-shrink-0"
                >
                    <X className="h-4 w-4" />
                </button>
            </div>

            {/* Details */}
            <div className="px-4 py-2 space-y-2 border-t border-slate-100">
                {meeting.responsavel && (
                    <div className="flex items-center gap-2 text-xs text-slate-600">
                        <div className="w-5 h-5 rounded-full bg-purple-100 flex items-center justify-center flex-shrink-0">
                            <span className="text-[10px] font-medium text-purple-700">
                                {(meeting.responsavel.nome || meeting.responsavel.email || '?')[0].toUpperCase()}
                            </span>
                        </div>
                        <span className="truncate">{meeting.responsavel.nome || meeting.responsavel.email}</span>
                    </div>
                )}

                {meeting.card && (
                    <div className="flex items-center gap-2 text-xs text-slate-600">
                        <ExternalLink className="h-3.5 w-3.5 flex-shrink-0 text-slate-400" />
                        <button
                            onClick={() => navigate(`/cards/${meeting.card!.id}`)}
                            className="truncate text-purple-600 hover:text-purple-800 hover:underline"
                        >
                            {meeting.card.titulo}
                        </button>
                    </div>
                )}

                {meeting.participantes_externos && meeting.participantes_externos.length > 0 && (
                    <div className="flex items-start gap-2 text-xs text-slate-600">
                        <Users className="h-3.5 w-3.5 flex-shrink-0 text-slate-400 mt-0.5" />
                        <div className="truncate">
                            {meeting.participantes_externos.join(', ')}
                        </div>
                    </div>
                )}

                {meeting.descricao && (
                    <p className="text-xs text-slate-500 line-clamp-2 pt-1">
                        {meeting.descricao}
                    </p>
                )}
            </div>

            {/* Actions */}
            <div className="px-4 py-3 border-t border-slate-100 space-y-2">
                {isActive && !showOutcomes && (
                    <div className="flex items-center gap-2">
                        {onEdit ? (
                            <Button
                                size="sm"
                                variant="outline"
                                className="flex-1 text-xs h-8"
                                onClick={() => onEdit(meeting)}
                            >
                                <Edit2 className="h-3 w-3 mr-1" />
                                Editar
                            </Button>
                        ) : (
                            <Button
                                size="sm"
                                variant="outline"
                                className="flex-1 text-xs h-8"
                                onClick={() => navigate(`/cards/${meeting.card_id}`)}
                            >
                                <ExternalLink className="h-3 w-3 mr-1" />
                                Ver Card
                            </Button>
                        )}
                        {onReschedule ? (
                            <Button
                                size="sm"
                                variant="outline"
                                className="flex-1 text-xs h-8"
                                onClick={() => onReschedule(meeting)}
                            >
                                <CalendarClock className="h-3 w-3 mr-1" />
                                Reagendar
                            </Button>
                        ) : (
                            <Button
                                size="sm"
                                variant="outline"
                                className="flex-1 text-xs h-8"
                                onClick={() => navigate(`/cards/${meeting.card_id}`)}
                            >
                                <CalendarClock className="h-3 w-3 mr-1" />
                                Reagendar
                            </Button>
                        )}
                    </div>
                )}

                {isActive && !showOutcomes && (
                    <div className="flex items-center gap-2">
                        <Button
                            size="sm"
                            className="flex-1 text-xs h-8 bg-green-600 hover:bg-green-700 text-white"
                            onClick={() => handleComplete('realizada')}
                            disabled={isCompleting}
                        >
                            {isCompleting ? (
                                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                            ) : (
                                <CheckCircle2 className="h-3 w-3 mr-1" />
                            )}
                            Realizada
                        </Button>
                        <Button
                            size="sm"
                            variant="outline"
                            className="flex-1 text-xs h-8 text-red-600 border-red-200 hover:bg-red-50"
                            onClick={() => setShowOutcomes(true)}
                            disabled={isCompleting}
                        >
                            <XCircle className="h-3 w-3 mr-1" />
                            Não ocorreu
                        </Button>
                    </div>
                )}

                {isActive && showOutcomes && (
                    <div className="space-y-1.5">
                        <p className="text-xs text-slate-500 font-medium">O que aconteceu?</p>
                        <button
                            onClick={() => handleComplete('nao_compareceu')}
                            disabled={isCompleting}
                            className="w-full text-left px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-50 rounded-md border border-slate-200 disabled:opacity-50"
                        >
                            {isCompleting ? 'Salvando...' : 'Não compareceu'}
                        </button>
                        <button
                            onClick={() => handleComplete('cancelada')}
                            disabled={isCompleting}
                            className="w-full text-left px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-50 rounded-md border border-slate-200 disabled:opacity-50"
                        >
                            {isCompleting ? 'Salvando...' : 'Cancelada'}
                        </button>
                        <button
                            onClick={() => setShowOutcomes(false)}
                            disabled={isCompleting}
                            className="w-full text-center text-xs text-slate-400 hover:text-slate-600 py-1"
                        >
                            Voltar
                        </button>
                    </div>
                )}

                {!isActive && meeting.card && (
                    <Button
                        size="sm"
                        variant="outline"
                        className="w-full text-xs h-8"
                        onClick={() => navigate(`/cards/${meeting.card!.id}`)}
                    >
                        <ExternalLink className="h-3 w-3 mr-1" />
                        Ver Card
                    </Button>
                )}

                {onViewDetails && (
                    <Button
                        size="sm"
                        variant="outline"
                        className="w-full text-xs h-8 text-purple-600 border-purple-200 hover:bg-purple-50"
                        onClick={() => onViewDetails(meeting)}
                    >
                        <Eye className="h-3 w-3 mr-1" />
                        Ver Detalhes
                    </Button>
                )}
            </div>
        </div>
    )
}
