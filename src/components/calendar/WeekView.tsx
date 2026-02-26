import { useMemo, useRef, useEffect, useState } from 'react'
import {
    startOfWeek, endOfWeek, eachDayOfInterval,
    format, isToday, getHours, getMinutes,
} from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Mic } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useCalendarFilters } from '@/hooks/calendar/useCalendarFilters'
import { useMeetingDrag } from '@/hooks/calendar/useMeetingDrag'
import { getConflictingMeetingIds } from '@/utils/meetingConflicts'
import { getUserColor } from './userColors'
import { MeetingPopover } from './MeetingPopover'
import type { CalendarMeeting } from '@/hooks/calendar/useCalendarMeetings'

interface WeekViewProps {
    meetings: CalendarMeeting[]
    onSlotClick: (date: string, time?: string) => void
    onEdit?: (meeting: CalendarMeeting) => void
    onReschedule?: (meeting: CalendarMeeting) => void
    onViewDetails?: (meeting: CalendarMeeting) => void
}

const HOUR_HEIGHT = 60 // px per hour
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

export function WeekView({ meetings, onSlotClick, onEdit, onReschedule, onViewDetails }: WeekViewProps) {
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
    const weekStart = startOfWeek(current, { weekStartsOn: 1 })
    const weekEnd = endOfWeek(current, { weekStartsOn: 1 })
    const days = useMemo(() => eachDayOfInterval({ start: weekStart, end: weekEnd }), [currentDate])

    // Group meetings by day
    const meetingsByDay = useMemo(() => {
        const map = new Map<string, CalendarMeeting[]>()
        days.forEach((d) => map.set(format(d, 'yyyy-MM-dd'), []))
        meetings.forEach((m) => {
            if (!m.data_vencimento) return
            const key = format(new Date(m.data_vencimento), 'yyyy-MM-dd')
            if (map.has(key)) map.get(key)!.push(m)
        })
        return map
    }, [meetings, days])

    // Auto-scroll to current hour on mount
    useEffect(() => {
        if (scrollRef.current) {
            const now = new Date()
            const currentHour = getHours(now)
            const scrollTo = Math.max(0, (currentHour - START_HOUR - 1) * HOUR_HEIGHT)
            scrollRef.current.scrollTop = scrollTo
        }
    }, [])

    const handleSlotClick = (day: Date, hour: number) => {
        const dateStr = format(day, 'yyyy-MM-dd')
        const timeStr = `${String(hour).padStart(2, '0')}:00`
        onSlotClick(dateStr, timeStr)
    }

    const handleMeetingClick = (e: React.MouseEvent, meeting: CalendarMeeting) => {
        if (dragState.isDragging) return
        e.stopPropagation()
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
        setPopoverAnchor({ x: rect.left + rect.width / 2, y: rect.bottom + 4 })
        setSelectedMeeting(meeting)
    }

    // Current time indicator
    const now = new Date()
    const nowMinutes = (getHours(now) - START_HOUR) * 60 + getMinutes(now)
    const showNowLine = nowMinutes >= 0 && nowMinutes <= TOTAL_HOURS * 60

    return (
        <div className="flex flex-col h-full">
            {/* Day headers */}
            <div className="flex border-b border-slate-200 bg-white sticky top-0 z-[5]">
                <div className="w-14 flex-shrink-0" />
                {days.map((day) => {
                    const dayIsToday = isToday(day)
                    return (
                        <div
                            key={day.toISOString()}
                            className="flex-1 text-center py-2 border-l border-slate-200 first:border-l-0"
                        >
                            <div className="text-xs text-slate-500 uppercase font-medium">
                                {format(day, 'EEE', { locale: ptBR })}
                            </div>
                            <div className={cn(
                                "text-lg font-semibold mt-0.5 w-9 h-9 flex items-center justify-center mx-auto rounded-full",
                                dayIsToday && "bg-purple-600 text-white",
                                !dayIsToday && "text-slate-900"
                            )}>
                                {format(day, 'd')}
                            </div>
                        </div>
                    )
                })}
            </div>

            {/* Time grid */}
            <div
                ref={(el) => { scrollRef.current = el; gridRef(el) }}
                className="flex-1 overflow-auto"
            >
                <div className="flex relative" style={{ height: TOTAL_HOURS * HOUR_HEIGHT }}>
                    {/* Hour labels */}
                    <div className="w-14 flex-shrink-0 relative">
                        {Array.from({ length: TOTAL_HOURS }).map((_, i) => (
                            <div
                                key={i}
                                className="absolute right-2 text-xs text-slate-400 -translate-y-1/2"
                                style={{ top: i * HOUR_HEIGHT }}
                            >
                                {String(START_HOUR + i).padStart(2, '0')}:00
                            </div>
                        ))}
                    </div>

                    {/* Day columns */}
                    {days.map((day) => {
                        const dayKey = format(day, 'yyyy-MM-dd')
                        const dayMeetings = meetingsByDay.get(dayKey) || []
                        const dayIsToday = isToday(day)

                        // Compute overlap groups for positioning
                        const positioned = computePositions(dayMeetings)

                        return (
                            <div
                                key={dayKey}
                                data-day-key={dayKey}
                                className={cn(
                                    "flex-1 relative border-l border-slate-200 first:border-l-0",
                                    dayIsToday && "bg-purple-50/30"
                                )}
                            >
                                {/* Hour lines */}
                                {Array.from({ length: TOTAL_HOURS }).map((_, i) => (
                                    <div
                                        key={i}
                                        className="absolute left-0 right-0 border-t border-slate-100 cursor-pointer hover:bg-slate-50/50 transition-colors"
                                        style={{ top: i * HOUR_HEIGHT, height: HOUR_HEIGHT }}
                                        onClick={() => handleSlotClick(day, START_HOUR + i)}
                                    />
                                ))}

                                {/* Meeting blocks */}
                                {positioned.map(({ meeting, left, width, top, height }) => {
                                    const colors = getStatusColor(meeting.status)
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
                                                "absolute rounded-r-md px-1.5 py-1 border-l-[3px] overflow-hidden text-left transition-all hover:shadow-md hover:z-10",
                                                colors.bg, colors.border, colors.text,
                                                draggable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
                                                isBeingDragged && "opacity-30 pointer-events-none",
                                            )}
                                            style={{
                                                top: `${top}px`,
                                                height: `${Math.max(height, 20)}px`,
                                                left: `${left}%`,
                                                width: `${width}%`,
                                                touchAction: draggable ? 'none' : undefined,
                                            }}
                                        >
                                            <div className="text-xs font-semibold truncate leading-tight flex items-center gap-1">
                                                {meeting.data_vencimento
                                                    ? format(new Date(meeting.data_vencimento), 'HH:mm')
                                                    : ''}
                                                {meeting.transcricao && (
                                                    <Mic className="h-2.5 w-2.5 opacity-60 flex-shrink-0" />
                                                )}
                                            </div>
                                            {height > 30 && (
                                                <div className="text-xs truncate leading-tight opacity-90">
                                                    {meeting.titulo}
                                                </div>
                                            )}
                                            {height > 50 && (
                                                <div className="text-[10px] truncate opacity-70 mt-0.5">
                                                    {meeting.card?.contato
                                                        ? `${meeting.card.contato.nome || ''}${meeting.card.contato.sobrenome ? ` ${meeting.card.contato.sobrenome}` : ''}`
                                                        : meeting.card?.titulo || ''}
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
                                            {teamView && meeting.responsavel && height > 30 && (() => {
                                                const color = getUserColor(meeting.responsavel!.id)
                                                return (
                                                    <div
                                                        className={cn(
                                                            "absolute bottom-0.5 right-0.5 w-4 h-4 rounded-full flex items-center justify-center shadow-sm ring-1 ring-white/50",
                                                            color.bg
                                                        )}
                                                        title={meeting.responsavel!.nome || meeting.responsavel!.email || ''}
                                                    >
                                                        <span className={cn("text-[8px] font-bold uppercase", color.text)}>
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
                                        className="absolute rounded-r-md px-1.5 py-1 border-l-[3px] border-dashed pointer-events-none z-20 bg-purple-100/60 border-purple-400 text-purple-700 ring-2 ring-purple-300/50"
                                        style={{
                                            top: `${dragState.ghostTop}px`,
                                            height: `${Math.max(dragState.ghostHeight, 20)}px`,
                                            left: '2%',
                                            width: '88%',
                                        }}
                                    >
                                        <div className="text-xs font-semibold">{dragState.timeLabel}</div>
                                        <div className="text-xs truncate opacity-80">{dragState.draggedMeeting.titulo}</div>
                                    </div>
                                )}

                                {/* Now line */}
                                {dayIsToday && showNowLine && (
                                    <div
                                        className="absolute left-0 right-0 z-[4] pointer-events-none"
                                        style={{ top: nowMinutes }}
                                    >
                                        <div className="flex items-center">
                                            <div className="w-2 h-2 rounded-full bg-red-500 -ml-1" />
                                            <div className="flex-1 border-t-2 border-red-500" />
                                        </div>
                                    </div>
                                )}
                            </div>
                        )
                    })}
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

/** Compute non-overlapping positions for meetings in a single day */
interface PositionedMeeting {
    meeting: CalendarMeeting
    top: number
    height: number
    left: number
    width: number
}

function computePositions(meetings: CalendarMeeting[]): PositionedMeeting[] {
    if (meetings.length === 0) return []

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
                top: startMinutes,
                height: duration,
            }
        })
        .sort((a, b) => a.startMinutes - b.startMinutes || b.height - a.height)

    // Greedy column assignment
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
        const colWidth = 90 / totalCols // leave some padding
        return {
            meeting: item.meeting,
            top: item.top,
            height: item.height,
            left: 2 + col * colWidth,
            width: colWidth,
        }
    })
}
