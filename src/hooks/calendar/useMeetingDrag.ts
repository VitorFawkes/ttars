import { useCallback, useEffect, useRef, useState } from 'react'
import { format, getHours, getMinutes } from 'date-fns'
import { useAuth } from '@/contexts/AuthContext'
import { useMeetingMutation } from './useMeetingMutation'
import type { CalendarMeeting } from './useCalendarMeetings'

// --- Types ---

interface DragConfig {
    /** Pixels por hora na view atual */
    hourHeight: number
    /** Primeira hora visível (ex: 7) */
    startHour: number
    /** Última hora visível (ex: 21) */
    endHour: number
    /** Intervalo de snap em minutos (default 15) */
    snapMinutes?: number
    /** Distância mínima em px para ativar drag (default 5) */
    dragThreshold?: number
}

export interface DragState {
    isDragging: boolean
    draggedMeeting: CalendarMeeting | null
    /** Y do ghost em px (relativo ao grid container, já com scroll) */
    ghostTop: number
    /** Altura do ghost em px */
    ghostHeight: number
    /** Dia alvo (YYYY-MM-DD) — para WeekView detectar coluna */
    targetDayKey: string | null
    /** Label do horário snapped (ex: "14:30") */
    timeLabel: string
    /** Posição do cursor no viewport */
    cursorPosition: { x: number; y: number }
}

export interface UseMeetingDragReturn {
    gridRef: React.RefCallback<HTMLDivElement>
    dragState: DragState
    canDrag: (meeting: CalendarMeeting) => boolean
    getMeetingDragHandlers: (meeting: CalendarMeeting) => {
        onPointerDown: (e: React.PointerEvent) => void
    }
}

// --- Constants ---

const NON_DRAGGABLE_STATUSES = ['cancelada', 'realizada', 'nao_compareceu']

const INITIAL_DRAG_STATE: DragState = {
    isDragging: false,
    draggedMeeting: null,
    ghostTop: 0,
    ghostHeight: 0,
    targetDayKey: null,
    timeLabel: '',
    cursorPosition: { x: 0, y: 0 },
}

// --- Hook ---

export function useMeetingDrag(config: DragConfig): UseMeetingDragReturn {
    const { user, profile } = useAuth()
    const { quickUpdateTime } = useMeetingMutation()

    const snapMinutes = config.snapMinutes ?? 15
    const threshold = config.dragThreshold ?? 5
    const pxPerMinute = config.hourHeight / 60
    const totalMinutesRange = (config.endHour - config.startHour) * 60

    // Refs
    const gridElRef = useRef<HTMLDivElement | null>(null)
    const pointerStartRef = useRef<{
        x: number
        y: number
        meeting: CalendarMeeting
        originalDay: string
    } | null>(null)
    const isDraggingRef = useRef(false)
    // Ref espelhando valores computados para evitar stale closures
    const latestRef = useRef({ targetDayKey: '', timeLabel: '' })

    const [dragState, setDragState] = useState<DragState>(INITIAL_DRAG_STATE)

    // --- Permission check ---

    const canDrag = useCallback(
        (meeting: CalendarMeeting): boolean => {
            if (NON_DRAGGABLE_STATUSES.includes(meeting.status || '')) return false
            if (profile?.is_admin === true) return true
            return meeting.responsavel_id === user?.id
        },
        [user?.id, profile?.is_admin],
    )

    // --- Cleanup helper ---

    const cleanup = useCallback(() => {
        document.body.style.userSelect = ''
        document.body.style.cursor = ''
        isDraggingRef.current = false
        pointerStartRef.current = null
        latestRef.current = { targetDayKey: '', timeLabel: '' }
        setDragState(INITIAL_DRAG_STATE)
    }, [])

    // --- Global pointer handlers (refs para estabilidade) ---

    const handlePointerMove = useCallback(
        (e: PointerEvent) => {
            const start = pointerStartRef.current
            if (!start) return

            // Check threshold
            if (!isDraggingRef.current) {
                const dist = Math.hypot(e.clientX - start.x, e.clientY - start.y)
                if (dist <= threshold) return

                isDraggingRef.current = true
                document.body.style.userSelect = 'none'
                document.body.style.cursor = 'grabbing'
            }

            // Calcula posição snapped no grid
            const gridEl = gridElRef.current
            if (!gridEl) return

            const gridRect = gridEl.getBoundingClientRect()
            const relativeY = e.clientY - gridRect.top + gridEl.scrollTop
            const rawMinutes = relativeY / pxPerMinute
            const snappedMinutes = Math.round(rawMinutes / snapMinutes) * snapMinutes
            const clampedMinutes = Math.max(0, Math.min(snappedMinutes, totalMinutesRange))
            const ghostTop = clampedMinutes * pxPerMinute
            const ghostHeight = (start.meeting.duration_minutes || 30) * pxPerMinute

            // Detecta coluna do dia (WeekView) via data-day-key
            let targetDayKey: string | null = null
            const elements = document.elementsFromPoint(e.clientX, e.clientY)
            for (const el of elements) {
                const dk = (el as HTMLElement).dataset?.dayKey
                if (dk) {
                    targetDayKey = dk
                    break
                }
            }
            // Fallback para DayView (coluna única)
            if (!targetDayKey) {
                targetDayKey = start.originalDay
            }

            // Time label
            const totalMins = config.startHour * 60 + clampedMinutes
            const hours = Math.floor(totalMins / 60)
            const mins = totalMins % 60
            const timeLabel = `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`

            // Atualiza ref + state
            latestRef.current = { targetDayKey: targetDayKey || '', timeLabel }
            setDragState({
                isDragging: true,
                draggedMeeting: start.meeting,
                ghostTop,
                ghostHeight,
                targetDayKey,
                timeLabel,
                cursorPosition: { x: e.clientX, y: e.clientY },
            })
        },
        [pxPerMinute, snapMinutes, totalMinutesRange, config.startHour, threshold],
    )

    const handlePointerUp = useCallback(() => {
        document.removeEventListener('pointermove', handlePointerMove)
        document.removeEventListener('pointerup', handlePointerUp)

        if (isDraggingRef.current && pointerStartRef.current) {
            const { meeting } = pointerStartRef.current
            const { targetDayKey, timeLabel } = latestRef.current

            if (targetDayKey && timeLabel) {
                // Verifica se realmente mudou
                const origDate = meeting.data_vencimento ? new Date(meeting.data_vencimento) : null
                const newDateTime = `${targetDayKey}T${timeLabel}:00`

                if (origDate) {
                    const origDay = format(origDate, 'yyyy-MM-dd')
                    const origTime = `${String(getHours(origDate)).padStart(2, '0')}:${String(getMinutes(origDate)).padStart(2, '0')}`

                    if (origDay !== targetDayKey || origTime !== timeLabel) {
                        quickUpdateTime.mutate({
                            id: meeting.id,
                            cardId: meeting.card_id,
                            newDateTime,
                        })
                    }
                }
            }
        }

        cleanup()
    }, [handlePointerMove, cleanup, quickUpdateTime])

    // --- Pointer down handler (individual por meeting) ---

    const handlePointerDown = useCallback(
        (meeting: CalendarMeeting, e: React.PointerEvent) => {
            if (!canDrag(meeting)) return

            const originalDay = meeting.data_vencimento
                ? format(new Date(meeting.data_vencimento), 'yyyy-MM-dd')
                : ''

            pointerStartRef.current = {
                x: e.clientX,
                y: e.clientY,
                meeting,
                originalDay,
            }

            document.addEventListener('pointermove', handlePointerMove)
            document.addEventListener('pointerup', handlePointerUp)
        },
        [canDrag, handlePointerMove, handlePointerUp],
    )

    // --- Escape handler ---

    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isDraggingRef.current) {
                document.removeEventListener('pointermove', handlePointerMove)
                document.removeEventListener('pointerup', handlePointerUp)
                cleanup()
            }
        }
        document.addEventListener('keydown', handler)
        return () => document.removeEventListener('keydown', handler)
    }, [handlePointerMove, handlePointerUp, cleanup])

    // --- Cleanup on unmount ---

    useEffect(() => {
        return () => {
            document.removeEventListener('pointermove', handlePointerMove)
            document.removeEventListener('pointerup', handlePointerUp)
            if (isDraggingRef.current) cleanup()
        }
    }, [handlePointerMove, handlePointerUp, cleanup])

    // --- Public API ---

    const gridRef = useCallback((el: HTMLDivElement | null) => {
        gridElRef.current = el
    }, [])

    const getMeetingDragHandlers = useCallback(
        (meeting: CalendarMeeting) => ({
            onPointerDown: (e: React.PointerEvent) => handlePointerDown(meeting, e),
        }),
        [handlePointerDown],
    )

    return { gridRef, dragState, canDrag, getMeetingDragHandlers }
}
