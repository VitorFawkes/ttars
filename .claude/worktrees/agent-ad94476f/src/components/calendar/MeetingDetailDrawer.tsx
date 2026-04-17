import { format, addMinutes } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { useNavigate } from 'react-router-dom'
import {
    X, Calendar, Clock, Users, ExternalLink, FileText,
    Edit2, CalendarClock, Trash2, CheckCircle2, XCircle, Link2, Video
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { useMeetingMutation } from '@/hooks/calendar/useMeetingMutation'
import type { CalendarMeeting } from '@/hooks/calendar/useCalendarMeetings'

interface MeetingDetailDrawerProps {
    meeting: CalendarMeeting
    isOpen: boolean
    onClose: () => void
    onEdit?: (meeting: CalendarMeeting) => void
    onReschedule?: (meeting: CalendarMeeting) => void
}

const STATUS_INFO: Record<string, { label: string; className: string }> = {
    agendada: { label: 'Agendada', className: 'bg-blue-100 text-blue-700' },
    realizada: { label: 'Realizada', className: 'bg-green-100 text-green-700' },
    cancelada: { label: 'Cancelada', className: 'bg-red-100 text-red-700' },
    reagendada: { label: 'Reagendada', className: 'bg-orange-100 text-orange-700' },
    nao_compareceu: { label: 'Não compareceu', className: 'bg-gray-100 text-gray-700' },
}

export function MeetingDetailDrawer({ meeting, isOpen, onClose, onEdit, onReschedule }: MeetingDetailDrawerProps) {
    const navigate = useNavigate()
    const { deleteMeeting, completeMeeting } = useMeetingMutation()

    if (!isOpen) return null

    const meetingDate = meeting.data_vencimento ? new Date(meeting.data_vencimento) : null
    const endTime = meetingDate ? addMinutes(meetingDate, meeting.duration_minutes) : null
    const status = meeting.status || 'agendada'
    const statusInfo = STATUS_INFO[status] || STATUS_INFO.agendada
    const isActive = !meeting.concluida && status === 'agendada'

    const handleDelete = () => {
        if (!confirm('Tem certeza que deseja excluir esta reunião?')) return
        deleteMeeting.mutate({ id: meeting.id, cardId: meeting.card_id }, {
            onSuccess: () => onClose(),
        })
    }

    const handleComplete = (outcome: string) => {
        completeMeeting.mutate({
            id: meeting.id,
            card_id: meeting.card_id,
            outcome,
        }, {
            onSuccess: () => onClose(),
        })
    }

    return (
        <>
            {/* Backdrop */}
            <div
                className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40"
                onClick={onClose}
            />

            {/* Drawer */}
            <div className="fixed inset-y-0 right-0 w-[460px] max-w-full bg-white shadow-2xl z-50 border-l border-gray-100 flex flex-col animate-in slide-in-from-right duration-200">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-purple-100 rounded-xl">
                            <Calendar className="h-5 w-5 text-purple-600" />
                        </div>
                        <div>
                            <h2 className="text-base font-bold text-gray-900 truncate max-w-[280px]">
                                {meeting.titulo}
                            </h2>
                            <span className={cn(
                                "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium",
                                statusInfo.className
                            )}>
                                {statusInfo.label}
                            </span>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-gray-50/50">
                    {/* Date & Time */}
                    <section className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm space-y-3">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 flex items-center gap-2">
                            <Clock className="h-3 w-3" /> Data & Horário
                        </h3>
                        {meetingDate && (
                            <div className="text-sm text-gray-700">
                                <p className="font-medium capitalize">
                                    {format(meetingDate, "EEEE, d 'de' MMMM 'de' yyyy", { locale: ptBR })}
                                </p>
                                <p className="text-gray-500 mt-0.5">
                                    {format(meetingDate, 'HH:mm')}
                                    {endTime && ` – ${format(endTime, 'HH:mm')}`}
                                    {' '}({meeting.duration_minutes} min)
                                </p>
                            </div>
                        )}
                    </section>

                    {/* Meeting Link */}
                    {meeting.meeting_link && (
                        <section className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
                            <a
                                href={meeting.meeting_link}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-3 px-4 py-3 bg-indigo-50 hover:bg-indigo-100 rounded-lg border border-indigo-200 transition-colors group"
                            >
                                <Video className="h-5 w-5 text-indigo-600" />
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-indigo-700">Entrar na reunião</p>
                                    <p className="text-xs text-indigo-500 truncate group-hover:underline">
                                        {meeting.meeting_link}
                                    </p>
                                </div>
                                <ExternalLink className="h-4 w-4 text-indigo-400 flex-shrink-0" />
                            </a>
                        </section>
                    )}

                    {/* Responsible */}
                    {meeting.responsavel && (
                        <section className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm space-y-3">
                            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 flex items-center gap-2">
                                <Users className="h-3 w-3" /> Responsável
                            </h3>
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center">
                                    <span className="text-sm font-medium text-purple-700">
                                        {(meeting.responsavel.nome || meeting.responsavel.email || '?')[0].toUpperCase()}
                                    </span>
                                </div>
                                <div>
                                    <p className="text-sm font-medium text-gray-900">
                                        {meeting.responsavel.nome || 'Sem nome'}
                                    </p>
                                    <p className="text-xs text-gray-500">{meeting.responsavel.email}</p>
                                </div>
                            </div>
                        </section>
                    )}

                    {/* Card */}
                    {meeting.card && (
                        <section className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm space-y-3">
                            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 flex items-center gap-2">
                                <Link2 className="h-3 w-3" /> Card Vinculado
                            </h3>
                            <button
                                onClick={() => navigate(`/cards/${meeting.card!.id}`)}
                                className="flex items-center gap-2 text-sm text-purple-600 hover:text-purple-800 hover:underline"
                            >
                                <ExternalLink className="h-3.5 w-3.5" />
                                {meeting.card.titulo}
                            </button>
                            {meeting.card.contato && (
                                <p className="text-xs text-gray-500">
                                    Contato: {meeting.card.contato.nome} {meeting.card.contato.sobrenome || ''}
                                </p>
                            )}
                        </section>
                    )}

                    {/* Participants */}
                    {meeting.participantes_externos && meeting.participantes_externos.length > 0 && (
                        <section className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm space-y-3">
                            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 flex items-center gap-2">
                                <Users className="h-3 w-3" /> Participantes ({meeting.participantes_externos.length})
                            </h3>
                            <div className="space-y-1.5">
                                {meeting.participantes_externos.map((email, i) => (
                                    <div key={i} className="text-sm text-gray-700 flex items-center gap-2">
                                        <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                                            <span className="text-[10px] font-medium text-gray-500">
                                                {email[0].toUpperCase()}
                                            </span>
                                        </div>
                                        {email}
                                    </div>
                                ))}
                            </div>
                        </section>
                    )}

                    {/* Description */}
                    {meeting.descricao && (
                        <section className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm space-y-3">
                            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 flex items-center gap-2">
                                <FileText className="h-3 w-3" /> Descrição
                            </h3>
                            <p className="text-sm text-gray-700 whitespace-pre-wrap">{meeting.descricao}</p>
                        </section>
                    )}

                    {/* Outcome (for completed meetings) */}
                    {meeting.concluida && (
                        <section className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm space-y-3">
                            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 flex items-center gap-2">
                                <CheckCircle2 className="h-3 w-3" /> Resultado
                            </h3>
                            {meeting.resultado && (
                                <p className="text-sm text-gray-700">{meeting.resultado}</p>
                            )}
                            {meeting.feedback && (
                                <p className="text-sm text-gray-500 italic">{meeting.feedback}</p>
                            )}
                            {!meeting.resultado && !meeting.feedback && (
                                <p className="text-sm text-gray-400">Sem detalhes registrados</p>
                            )}
                        </section>
                    )}

                    {/* Transcription */}
                    {meeting.transcricao && (
                        <section className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm space-y-3">
                            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400">
                                Transcrição
                            </h3>
                            <p className="text-sm text-gray-700 whitespace-pre-wrap max-h-48 overflow-y-auto">
                                {meeting.transcricao}
                            </p>
                        </section>
                    )}
                </div>

                {/* Footer Actions */}
                <div className="p-4 border-t border-gray-100 bg-white space-y-2">
                    {isActive && (
                        <>
                            <div className="flex gap-2">
                                <Button
                                    size="sm"
                                    className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                                    onClick={() => handleComplete('realizada')}
                                >
                                    <CheckCircle2 className="h-4 w-4 mr-1.5" />
                                    Realizada
                                </Button>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    className="flex-1 text-orange-600 border-orange-200 hover:bg-orange-50"
                                    onClick={() => handleComplete('nao_compareceu')}
                                >
                                    <XCircle className="h-4 w-4 mr-1.5" />
                                    Não compareceu
                                </Button>
                            </div>
                            <div className="flex gap-2">
                                <Button
                                    size="sm"
                                    variant="outline"
                                    className="flex-1"
                                    onClick={() => onEdit?.(meeting)}
                                >
                                    <Edit2 className="h-3.5 w-3.5 mr-1.5" />
                                    Editar
                                </Button>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    className="flex-1"
                                    onClick={() => onReschedule?.(meeting)}
                                >
                                    <CalendarClock className="h-3.5 w-3.5 mr-1.5" />
                                    Reagendar
                                </Button>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    className="text-red-500 border-red-200 hover:bg-red-50"
                                    onClick={handleDelete}
                                >
                                    <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                            </div>
                        </>
                    )}

                    {!isActive && meeting.card && (
                        <Button
                            size="sm"
                            variant="outline"
                            className="w-full"
                            onClick={() => navigate(`/cards/${meeting.card!.id}`)}
                        >
                            <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                            Ver Card
                        </Button>
                    )}
                </div>
            </div>
        </>
    )
}
