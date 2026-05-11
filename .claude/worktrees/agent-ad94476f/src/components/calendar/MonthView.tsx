import { useMemo, useState, useRef, useCallback } from 'react'
import {
    startOfMonth, endOfMonth, startOfWeek, endOfWeek,
    eachDayOfInterval, isSameMonth, isToday, format
} from 'date-fns'
import { Mic } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useCalendarFilters } from '@/hooks/calendar/useCalendarFilters'
import { MeetingPopover } from './MeetingPopover'
import type { CalendarMeeting } from '@/hooks/calendar/useCalendarMeetings'

interface MonthViewProps {
    meetings: CalendarMeeting[]
    onSlotClick: (date: string, time?: string) => void
    onEdit?: (meeting: CalendarMeeting) => void
    onReschedule?: (meeting: CalendarMeeting) => void
    onViewDetails?: (meeting: CalendarMeeting) => void
}

const WEEKDAY_LABELS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']

const STATUS_DOT: Record<string, string> = {
    agendada: 'bg-blue-500',
    realizada: 'bg-green-500',
    cancelada: 'bg-red-500',
    reagendada: 'bg-orange-500',
    nao_compareceu: 'bg-gray-500',
}

const STATUS_CHIP_BG: Record<string, string> = {
    agendada: 'hover:bg-blue-50',
    realizada: 'hover:bg-green-50',
    cancelada: 'hover:bg-red-50',
    reagendada: 'hover:bg-amber-50',
    nao_compareceu: 'hover:bg-gray-50',
}

export function MonthView({ meetings, onSlotClick, onEdit, onReschedule, onViewDetails }: MonthViewProps) {
    const { currentDate, setCurrentDate, setViewMode } = useCalendarFilters()
    const [selectedMeeting, setSelectedMeeting] = useState<CalendarMeeting | null>(null)
    const [popoverAnchor, setPopoverAnchor] = useState<{ x: number; y: number } | null>(null)
    const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    const current = new Date(currentDate)
    const monthStart = startOfMonth(current)
    const monthEnd = endOfMonth(current)

    const days = useMemo(() => {
        const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 })
        const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 })
        return eachDayOfInterval({ start: gridStart, end: gridEnd })
    }, [currentDate])

    const meetingsByDay = useMemo(() => {
        const map = new Map<string, CalendarMeeting[]>()
        meetings.forEach((m) => {
            if (!m.data_vencimento) return
            const key = format(new Date(m.data_vencimento), 'yyyy-MM-dd')
            if (!map.has(key)) map.set(key, [])
            map.get(key)!.push(m)
        })
        return map
    }, [meetings])

    const handleMeetingClick = (e: React.MouseEvent, meeting: CalendarMeeting) => {
        e.stopPropagation()
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
        setPopoverAnchor({ x: rect.left + rect.width / 2, y: rect.bottom + 4 })
        setSelectedMeeting(meeting)
    }

    // Debounced click: single click → new meeting, double click → navigate to day view
    const handleDayClick = useCallback((day: Date) => {
        if (clickTimerRef.current) {
            clearTimeout(clickTimerRef.current)
            clickTimerRef.current = null
            // Double click
            setCurrentDate(day.toISOString())
            setViewMode('day')
            return
        }
        clickTimerRef.current = setTimeout(() => {
            clickTimerRef.current = null
            const dateStr = format(day, 'yyyy-MM-dd')
            onSlotClick(dateStr)
        }, 250)
    }, [onSlotClick, setCurrentDate, setViewMode])

    return (
        <div className="p-4 h-full flex flex-col">
            {/* Header */}
            <div className="grid grid-cols-7 gap-px mb-px">
                {WEEKDAY_LABELS.map((label) => (
                    <div
                        key={label}
                        className="text-center py-2 text-xs font-semibold text-slate-500 uppercase tracking-wider"
                    >
                        {label}
                    </div>
                ))}
            </div>

            {/* Grid */}
            <div className="grid grid-cols-7 gap-px bg-slate-200 rounded-lg overflow-hidden flex-1">
                {days.map((day) => {
                    const dayKey = format(day, 'yyyy-MM-dd')
                    const dayMeetings = meetingsByDay.get(dayKey) || []
                    const isCurrentMonth = isSameMonth(day, current)
                    const isDayToday = isToday(day)
                    const maxVisible = 3
                    const overflow = dayMeetings.length - maxVisible

                    return (
                        <div
                            key={dayKey}
                            className={cn(
                                "bg-white p-1.5 min-h-[100px] cursor-pointer hover:bg-slate-50 transition-colors",
                                !isCurrentMonth && "bg-slate-50/50"
                            )}
                            onClick={() => handleDayClick(day)}
                        >
                            <div className="flex items-center justify-between mb-1">
                                <span
                                    className={cn(
                                        "text-sm font-medium w-7 h-7 flex items-center justify-center rounded-full",
                                        isDayToday && "bg-purple-600 text-white",
                                        !isDayToday && isCurrentMonth && "text-slate-900",
                                        !isDayToday && !isCurrentMonth && "text-slate-300"
                                    )}
                                >
                                    {format(day, 'd')}
                                </span>
                            </div>

                            <div className="space-y-0.5">
                                {dayMeetings.slice(0, maxVisible).map((meeting) => {
                                    const status = meeting.status || 'agendada'
                                    const contactName = meeting.card?.contato?.nome
                                        ? `${meeting.card.contato.nome}${meeting.card.contato.sobrenome ? ` ${meeting.card.contato.sobrenome}` : ''}`
                                        : ''
                                    const tooltipParts = [
                                        meeting.titulo,
                                        meeting.card?.titulo ? `Card: ${meeting.card.titulo}` : '',
                                        contactName ? `Contato: ${contactName}` : '',
                                    ].filter(Boolean)

                                    return (
                                        <button
                                            key={meeting.id}
                                            onClick={(e) => handleMeetingClick(e, meeting)}
                                            title={tooltipParts.join('\n')}
                                            className={cn(
                                                "w-full flex items-center gap-1 px-1.5 py-0.5 rounded text-xs truncate transition-colors text-left",
                                                STATUS_CHIP_BG[status] || 'hover:bg-purple-50'
                                            )}
                                        >
                                            <span className={cn(
                                                "w-1.5 h-1.5 rounded-full flex-shrink-0",
                                                STATUS_DOT[status] || STATUS_DOT.agendada
                                            )} />
                                            <span className="text-slate-500 flex-shrink-0">
                                                {meeting.data_vencimento
                                                    ? format(new Date(meeting.data_vencimento), 'HH:mm')
                                                    : ''}
                                            </span>
                                            {meeting.transcricao && (
                                                <Mic className="h-2.5 w-2.5 text-slate-400 flex-shrink-0" />
                                            )}
                                            <span className="truncate text-slate-700 font-medium">
                                                {meeting.titulo}
                                            </span>
                                        </button>
                                    )
                                })}
                                {overflow > 0 && (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation()
                                            setCurrentDate(day.toISOString())
                                            setViewMode('day')
                                        }}
                                        className="text-xs text-purple-600 font-medium px-1.5 hover:underline"
                                    >
                                        +{overflow} mais
                                    </button>
                                )}
                            </div>
                        </div>
                    )
                })}
            </div>

            {/* Meeting Popover */}
            {selectedMeeting && popoverAnchor && (
                <MeetingPopover
                    meeting={selectedMeeting}
                    anchor={popoverAnchor}
                    onClose={() => { setSelectedMeeting(null); setPopoverAnchor(null) }}
                    onEdit={onEdit ? (m) => { setSelectedMeeting(null); setPopoverAnchor(null); onEdit(m) } : undefined}
                    onReschedule={onReschedule ? (m) => { setSelectedMeeting(null); setPopoverAnchor(null); onReschedule(m) } : undefined}
                    onViewDetails={onViewDetails ? (m) => { setSelectedMeeting(null); setPopoverAnchor(null); onViewDetails(m) } : undefined}
                />
            )}
        </div>
    )
}
