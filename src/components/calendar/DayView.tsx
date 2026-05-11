import { useMemo, useRef, useEffect, useState } from 'react'
import { format, isToday, getHours, getMinutes, addMinutes } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Mic } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useCalendarFilters } from '@/hooks/calendar/useCalendarFilters'
import { useMeetingDrag } from '@/hooks/calendar/useMeetingDrag'
import { getConflictingMeetingIds } from '@/utils/meetingConflicts'
import { getUserColor } from './userColors'
import { MeetingPopover } from './MeetingPopover'
import type { CalendarMeeting } from '@/hooks/calendar/useCalendarMeetings'

interface DayViewProps {
    meetings: CalendarMeeting[]
    onSlotClick: (date: string, time?: string) => void
    onEdit?: (meeting: CalendarMeeting) => void
    onReschedule?: (meeting: CalendarMeeting) => void
    onViewDetails?: (meeting: CalendarMeeting) => void
}

const HOUR_HEIGHT = 72 // Larger than week view for more detail
const START_HOUR = 7
const END_HOUR = 21
const TOTAL_HOURS = END_HOUR - START_HOUR

// Status-based colors for meeting blocks
const STATUS_COLORS: Record<string, { bg: string; border: string; text: string }> = {
    agendada:       { bg: 'bg-blue-50',   border: 'border-blue-500',  text: 'text-blue-700' },
    realizada:      { bg: 'bg-green-50',  border: 'border-green-500', text: 'text-green-700' },
    cancelada:      { bg: 'bg-red-50',    border: 'border-red-500',   text: 'text-red-700' },
    reagendada:     { bg: 'bg-amber-50',  border: 'border-amber-500', text: 'text-amber-700' },
    nao_compareceu: { bg: 'bg-gray-100',  border: 'border-gray-400',  text: 'text-gray-600' },
}

const DEFAULT_STATUS_COLOR = STATUS_COLORS.agendada

function getStatusColor(status: string | null) {
    return STATUS_COLORS[status || 'agendada'] || DEFAULT_STATUS_COLOR
}

export function DayView({ meetings, onSlotClick, onEdit, onReschedule, onViewDetails }: DayViewProps) {
    const { currentDate, teamView } = useCalendarFilters()
    const scrollRef = useRef<HTMLDivElement>(null)
    const [selectedMeeting, setSelectedMeeting] = useState<CalendarMeeting | null>(null)
    const [popoverAnchor, setPopoverAnchor] = useState<{ x: number; y: number } | null>(null)

    // Drag-and-drop
    const { gridRef, dragState, canDrag, getMeetingDragHandlers } = useMeetingDrag({
        hourHeight: HOUR_HEIGHT,
        startHour: START_HOUR,
        endHour: END_HOUR,
        snapMinutes: 15,
    })

    // Conflict detection
    const conflictIds = useMemo(() => getConflictingMeetingIds(meetings), [meetings])

    const current = new Date(currentDate)
    const dayKey = format(current, 'yyyy-MM-dd')
    const dayIsToday = isToday(current)

    const dayMeetings = useMemo(() => {
        return meetings.filter((m) => {
            if (!m.data_vencimento) return false
            return format(new Date(m.data_vencimento), 'yyyy-MM-dd') === dayKey
        })
    }, [meetings, dayKey])

    // Auto-scroll to current hour
    useEffect(() => {
        if (scrollRef.current) {
            const now = new Date()
            const scrollTo = Math.max(0, (getHours(now) - START_HOUR - 1) * HOUR_HEIGHT)
            scrollRef.current.scrollTop = scrollTo
        }
    }, [])

    const handleSlotClick = (hour: number) => {
        onSlotClick(dayKey, `${String(hour).padStart(2, '0')}:00`)
    }

    const handleMeetingClick = (e: React.MouseEvent, meeting: CalendarMeeting) => {
        if (dragState.isDragging) return
        e.stopPropagation()
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
        setPopoverAnchor({ x: rect.left + rect.width / 2, y: rect.bottom + 4 })
        setSelectedMeeting(meeting)
    }

    // Positioned meetings
    const positioned = useMemo(() => computeDayPositions(dayMeetings), [dayMeetings])

    // Now line
    const now = new Date()
    const nowMinutes = (getHours(now) - START_HOUR) * 60 + getMinutes(now)
    const nowPx = nowMinutes * (HOUR_HEIGHT / 60)
    const showNowLine = dayIsToday && nowMinutes >= 0 && nowMinutes <= TOTAL_HOURS * 60

    return (
        <div className="flex flex-col h-full">
            {/* Day header */}
            <div className="flex items-center justify-center py-3 border-b border-slate-200 bg-white sticky top-0 z-[5]">
                <div className="text-center">
                    <div className="text-xs text-slate-500 uppercase font-medium">
                        {format(current, 'EEEE', { locale: ptBR })}
                    </div>
                    <div className={cn(
                        "text-2xl font-bold mt-0.5 w-12 h-12 flex items-center justify-center mx-auto rounded-full",
                        dayIsToday && "bg-purple-600 text-white",
                        !dayIsToday && "text-slate-900"
                    )}>
                        {format(current, 'd')}
                    </div>
                </div>
            </div>

            {/* Time grid */}
            <div
                ref={(el) => { scrollRef.current = el; gridRef(el) }}
                className="flex-1 overflow-auto"
            >
                <div className="flex relative" style={{ height: TOTAL_HOURS * HOUR_HEIGHT }}>
                    {/* Hour labels */}
                    <div className="w-16 flex-shrink-0 relative">
                        {Array.from({ length: TOTAL_HOURS }).map((_, i) => (
                            <div
                                key={i}
                                className="absolute right-3 text-xs text-slate-400 -translate-y-1/2"
                                style={{ top: i * HOUR_HEIGHT }}
                            >
                                {String(START_HOUR + i).padStart(2, '0')}:00
                            </div>
                        ))}
                    </div>

                    {/* Main column */}
                    <div
                        data-day-key={dayKey}
                        className={cn(
                            "flex-1 relative border-l border-slate-200",
                            dayIsToday && "bg-purple-50/20"
                        )}
                    >
                        {/* Hour lines */}
                        {Array.from({ length: TOTAL_HOURS }).map((_, i) => (
                            <div
                                key={i}
                                className="absolute left-0 right-0 border-t border-slate-100 cursor-pointer hover:bg-slate-50/50 transition-colors"
                                style={{ top: i * HOUR_HEIGHT, height: HOUR_HEIGHT }}
                                onClick={() => handleSlotClick(START_HOUR + i)}
                            />
                        ))}

                        {/* Meeting blocks */}
                        {positioned.map(({ meeting, top, height, left, width }) => {
                            const colors = getStatusColor(meeting.status)
                            const meetDate = meeting.data_vencimento ? new Date(meeting.data_vencimento) : null
                            const endTime = meetDate ? addMinutes(meetDate, meeting.duration_minutes || 30) : null
                            const draggable = canDrag(meeting)
                            const isBeingDragged = dragState.isDragging && dragState.draggedMeeting?.id === meeting.id
                            const hasConflict = conflictIds.has(meeting.id)
                            const dragHandlers = draggable ? getMeetingDragHandlers(meeting) : {}

                            return (
                                <button
                                    key={meeting.id}
                                    onClick={(e) => handleMeetingClick(e, meeting)}
                                    {...dragHandlers}
                                    className={cn(
                                        "absolute border-l-[3px] rounded-r-md px-3 py-2 overflow-hidden text-left transition-all hover:shadow-md hover:z-10",
                                        colors.bg, colors.border, colors.text,
                                        draggable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
                                        isBeingDragged && "opacity-30 pointer-events-none",
                                    )}
                                    style={{
                                        top: `${top}px`,
                                        height: `${Math.max(height, 24)}px`,
                                        left: `${left}%`,
                                        width: `${width}%`,
                                        touchAction: draggable ? 'none' : undefined,
                                    }}
                                >
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-semibold">
                                            {meetDate ? format(meetDate, 'HH:mm') : ''}
                                            {endTime ? ` – ${format(endTime, 'HH:mm')}` : ''}
                                        </span>
                                        {meeting.transcricao && (
                                            <Mic className="h-3 w-3 opacity-60 flex-shrink-0" />
                                        )}
                                        <span className="text-sm font-medium truncate opacity-90">
                                            {meeting.titulo}
                                        </span>
                                    </div>
                                    {height > 48 && (
                                        <div className="mt-1 space-y-0.5">
                                            {meeting.card && (
                                                <div className="text-xs truncate opacity-80">
                                                    {meeting.card.titulo}
                                                    {meeting.card.contato?.nome && (
                                                        <span className="opacity-70"> · {meeting.card.contato.nome}{meeting.card.contato.sobrenome ? ` ${meeting.card.contato.sobrenome}` : ''}</span>
                                                    )}
                                                </div>
                                            )}
                                            {meeting.participantes_externos && meeting.participantes_externos.length > 0 && (
                                                <div className="text-xs truncate opacity-70">
                                                    {meeting.participantes_externos.length} participante{meeting.participantes_externos.length > 1 ? 's' : ''}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                    {height > 80 && meeting.descricao && (
                                        <div className="text-xs mt-1 line-clamp-2 opacity-60">
                                            {meeting.descricao}
                                        </div>
                                    )}
                                    {height > 80 && meeting.transcricao && (
                                        <div className="text-[10px] flex items-center gap-1 mt-0.5 opacity-50">
                                            <Mic className="h-2.5 w-2.5" />
                                            Transcrição disponível
                                        </div>
                                    )}
                                    {/* Conflict indicator */}
                                    {hasConflict && (
                                        <div
                                            className="absolute top-1 right-1 w-2 h-2 rounded-full bg-red-500 ring-1 ring-white"
                                            title="Conflito de horário"
                                        />
                                    )}
                                    {/* Team view: colored avatar badge */}
                                    {teamView && meeting.responsavel && height > 48 && (() => {
                                        const color = getUserColor(meeting.responsavel!.id)
                                        return (
                                            <div
                                                className={cn(
                                                    "absolute bottom-1 right-1 w-5 h-5 rounded-full flex items-center justify-center shadow-sm ring-1 ring-white/50",
                                                    color.bg
                                                )}
                                                title={meeting.responsavel!.nome || meeting.responsavel!.email || ''}
                                            >
                                                <span className={cn("text-[9px] font-bold uppercase", color.text)}>
                                                    {(meeting.responsavel!.nome || meeting.responsavel!.email || '?')[0]}
                                                </span>
                                            </div>
                                        )
                                    })()}
                                </button>
                            )
                        })}

                        {/* Drag ghost overlay */}
                        {dragState.isDragging && dragState.targetDayKey === dayKey && dragState.draggedMeeting && (
                            <div
                                className="absolute rounded-r-md px-3 py-2 border-l-[3px] border-dashed pointer-events-none z-20 bg-purple-100/60 border-purple-400 text-purple-700 ring-2 ring-purple-300/50"
                                style={{
                                    top: `${dragState.ghostTop}px`,
                                    height: `${Math.max(dragState.ghostHeight, 24)}px`,
                                    left: '1%',
                                    width: '93%',
                                }}
                            >
                                <div className="text-sm font-semibold">{dragState.timeLabel}</div>
                                <div className="text-xs truncate opacity-80">{dragState.draggedMeeting.titulo}</div>
                            </div>
                        )}

                        {/* Now line */}
                        {showNowLine && (
                            <div
                                className="absolute left-0 right-0 z-[4] pointer-events-none"
                                style={{ top: nowPx }}
                            >
                                <div className="flex items-center">
                                    <div className="w-2.5 h-2.5 rounded-full bg-red-500 -ml-1" />
                                    <div className="flex-1 border-t-2 border-red-500" />
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Floating time label during drag */}
            {dragState.isDragging && (
                <div
                    className="fixed z-[100] px-2 py-1 rounded-md bg-slate-900 text-white text-xs font-mono shadow-lg pointer-events-none"
                    style={{
                        left: dragState.cursorPosition.x + 16,
                        top: dragState.cursorPosition.y - 8,
                    }}
                >
                    {dragState.timeLabel}
                </div>
            )}

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

interface PositionedMeeting {
    meeting: CalendarMeeting
    top: number
    height: number
    left: number
    width: number
}

function computeDayPositions(meetings: CalendarMeeting[]): PositionedMeeting[] {
    if (meetings.length === 0) return []

    const pxPerMinute = HOUR_HEIGHT / 60

    const items = meetings
        .filter((m) => m.data_vencimento)
        .map((m) => {
            const date = new Date(m.data_vencimento!)
            const startMinutes = (getHours(date) - START_HOUR) * 60 + getMinutes(date)
            const duration = m.duration_minutes || 30
            return {
                meeting: m,
                startMinutes,
                endMinutes: startMinutes + duration,
                topPx: startMinutes * pxPerMinute,
                heightPx: duration * pxPerMinute,
            }
        })
        .sort((a, b) => a.startMinutes - b.startMinutes || b.heightPx - a.heightPx)

    const columns: { endMinutes: number }[][] = []

    return items.map((item) => {
        let col = 0
        for (col = 0; col < columns.length; col++) {
            const lastInCol = columns[col][columns[col].length - 1]
            if (lastInCol.endMinutes <= item.startMinutes) {
                columns[col].push({ endMinutes: item.endMinutes })
                break
            }
        }
        if (col === columns.length) {
            columns.push([{ endMinutes: item.endMinutes }])
        }

        const totalCols = columns.length
        const colWidth = 94 / totalCols
        return {
            meeting: item.meeting,
            top: item.topPx,
            height: item.heightPx,
            left: 1 + col * colWidth,
            width: colWidth,
        }
    })
}
