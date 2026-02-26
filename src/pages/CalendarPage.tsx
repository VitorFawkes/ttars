import { useEffect, useState, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Calendar as CalendarIcon, Search } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'
import { CalendarHeader } from '@/components/calendar/CalendarHeader'
import { MonthView } from '@/components/calendar/MonthView'
import { WeekView } from '@/components/calendar/WeekView'
import { DayView } from '@/components/calendar/DayView'
import { MeetingDetailDrawer } from '@/components/calendar/MeetingDetailDrawer'
import { useCalendarFilters } from '@/hooks/calendar/useCalendarFilters'
import { useCalendarMeetings, type CalendarMeeting } from '@/hooks/calendar/useCalendarMeetings'
import { SmartTaskModal } from '@/components/card/SmartTaskModal'

function CalendarContent() {
    const { viewMode, setViewMode, setCurrentDate, goToday, goNext, goPrev, hasActiveFilters, clearFilters } = useCalendarFilters()
    const { data: meetings, isLoading, isFetching, isPlaceholderData } = useCalendarMeetings()
    const [searchParams] = useSearchParams()

    // Smart Task Modal state — create
    const [isCreateOpen, setIsCreateOpen] = useState(false)
    const [createDefaults, setCreateDefaults] = useState<{
        date?: string
        time?: string
    }>({})

    // Smart Task Modal state — edit / reschedule
    const [editingMeeting, setEditingMeeting] = useState<CalendarMeeting | null>(null)
    const [reschedulingMeeting, setReschedulingMeeting] = useState<CalendarMeeting | null>(null)

    // Meeting Detail Drawer state
    const [detailMeeting, setDetailMeeting] = useState<CalendarMeeting | null>(null)

    // Deep-link: ?date=YYYY-MM-DD
    useEffect(() => {
        const dateParam = searchParams.get('date')
        if (dateParam) {
            setCurrentDate(new Date(dateParam).toISOString())
        }
    }, [searchParams, setCurrentDate])

    const handleCreateFromSlot = useCallback((date: string, time?: string) => {
        setCreateDefaults({ date, time })
        setIsCreateOpen(true)
    }, [])

    const handleNewMeeting = useCallback(() => {
        const today = new Date().toISOString().split('T')[0]
        setCreateDefaults({ date: today })
        setIsCreateOpen(true)
    }, [])

    const handleCloseCreate = useCallback(() => {
        setIsCreateOpen(false)
        setCreateDefaults({})
    }, [])

    const handleEdit = useCallback((meeting: CalendarMeeting) => {
        setEditingMeeting(meeting)
    }, [])

    const handleReschedule = useCallback((meeting: CalendarMeeting) => {
        setReschedulingMeeting(meeting)
    }, [])

    const handleCloseEdit = useCallback(() => {
        setEditingMeeting(null)
    }, [])

    const handleCloseReschedule = useCallback(() => {
        setReschedulingMeeting(null)
    }, [])

    const handleViewDetails = useCallback((meeting: CalendarMeeting) => {
        setDetailMeeting(meeting)
    }, [])

    const handleCloseDetail = useCallback(() => {
        setDetailMeeting(null)
    }, [])

    // Keyboard shortcuts — all callbacks defined BEFORE this effect
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            const tag = (e.target as HTMLElement).tagName
            if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
            if (isCreateOpen || editingMeeting || reschedulingMeeting || detailMeeting) return

            switch (e.key.toLowerCase()) {
                case 't': goToday(); break
                case 'd': setViewMode('day'); break
                case 'w': setViewMode('week'); break
                case 'm': setViewMode('month'); break
                case 'n': e.preventDefault(); handleNewMeeting(); break
                case 'arrowleft': goPrev(); break
                case 'arrowright': goNext(); break
            }
        }
        window.addEventListener('keydown', handler)
        return () => window.removeEventListener('keydown', handler)
    }, [goToday, goNext, goPrev, setViewMode, isCreateOpen, editingMeeting, reschedulingMeeting, detailMeeting, handleNewMeeting])

    // Show skeleton only on initial load (no previous data)
    const showSkeleton = isLoading && !meetings

    if (showSkeleton) {
        return (
            <>
                <CalendarHeader onNewMeeting={handleNewMeeting} />
                <div className="flex-1 min-h-0 overflow-auto">
                    <CalendarSkeleton viewMode={viewMode} />
                </div>
            </>
        )
    }

    // Empty state
    const isEmpty = !meetings || meetings.length === 0
    const filtersActive = hasActiveFilters()

    // Meetings data for conflict detection in SmartTaskModal
    const existingMeetings = meetings || []

    return (
        <>
            <CalendarHeader onNewMeeting={handleNewMeeting} />

            {/* Subtle loading bar for background refetches */}
            {isFetching && isPlaceholderData && (
                <div className="h-0.5 bg-purple-200 overflow-hidden flex-shrink-0">
                    <div className="h-full w-1/3 bg-purple-500 animate-pulse rounded-r" />
                </div>
            )}

            <div className="flex-1 min-h-0 overflow-auto">
                {isEmpty ? (
                    <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
                        <div className="rounded-full bg-purple-100 p-4">
                            {filtersActive
                                ? <Search className="h-8 w-8 text-purple-600" />
                                : <CalendarIcon className="h-8 w-8 text-purple-600" />
                            }
                        </div>
                        <h3 className="text-lg font-semibold text-gray-900">
                            {filtersActive
                                ? 'Nenhuma reunião encontrada'
                                : 'Nenhuma reunião neste período'
                            }
                        </h3>
                        <p className="text-sm text-gray-500">
                            {filtersActive
                                ? 'Tente ajustar os filtros para ver mais resultados'
                                : 'Comece agendando uma nova reunião'
                            }
                        </p>
                        {filtersActive ? (
                            <Button
                                onClick={clearFilters}
                                variant="outline"
                                className="text-purple-600 border-purple-200 hover:bg-purple-50"
                            >
                                Limpar Filtros
                            </Button>
                        ) : (
                            <Button
                                onClick={handleNewMeeting}
                                className="bg-purple-600 hover:bg-purple-700 text-white"
                            >
                                Agendar Reunião
                            </Button>
                        )}
                    </div>
                ) : (
                    <>
                        {viewMode === 'month' && (
                            <MonthView meetings={meetings} onSlotClick={handleCreateFromSlot} onEdit={handleEdit} onReschedule={handleReschedule} onViewDetails={handleViewDetails} />
                        )}
                        {viewMode === 'week' && (
                            <WeekView meetings={meetings} onSlotClick={handleCreateFromSlot} onEdit={handleEdit} onReschedule={handleReschedule} onViewDetails={handleViewDetails} />
                        )}
                        {viewMode === 'day' && (
                            <DayView meetings={meetings} onSlotClick={handleCreateFromSlot} onEdit={handleEdit} onReschedule={handleReschedule} onViewDetails={handleViewDetails} />
                        )}
                    </>
                )}
            </div>

            {/* Create modal */}
            {isCreateOpen && (
                <SmartTaskModal
                    isOpen={isCreateOpen}
                    onClose={handleCloseCreate}
                    defaultType="reuniao"
                    defaultDate={createDefaults.date}
                    defaultTime={createDefaults.time}
                    existingMeetings={existingMeetings}
                />
            )}

            {/* Edit modal */}
            {editingMeeting && (
                <SmartTaskModal
                    isOpen={true}
                    onClose={handleCloseEdit}
                    cardId={editingMeeting.card_id || undefined}
                    initialData={editingMeeting}
                    mode="edit"
                    existingMeetings={existingMeetings}
                />
            )}

            {/* Reschedule modal */}
            {reschedulingMeeting && (
                <SmartTaskModal
                    isOpen={true}
                    onClose={handleCloseReschedule}
                    cardId={reschedulingMeeting.card_id || undefined}
                    initialData={reschedulingMeeting}
                    mode="reschedule"
                    existingMeetings={existingMeetings}
                />
            )}

            {/* Meeting Detail Drawer */}
            {detailMeeting && (
                <MeetingDetailDrawer
                    meeting={detailMeeting}
                    isOpen={true}
                    onClose={handleCloseDetail}
                    onEdit={(m) => { handleCloseDetail(); handleEdit(m) }}
                    onReschedule={(m) => { handleCloseDetail(); handleReschedule(m) }}
                />
            )}
        </>
    )
}

function CalendarSkeleton({ viewMode }: { viewMode: string }) {
    if (viewMode === 'month') {
        return (
            <div className="p-4">
                <div className="grid grid-cols-7 gap-px bg-slate-200 rounded-lg overflow-hidden">
                    {Array.from({ length: 7 }).map((_, i) => (
                        <div key={`h-${i}`} className="bg-slate-50 p-2 text-center">
                            <div className="h-4 w-8 mx-auto bg-slate-200 rounded animate-pulse" />
                        </div>
                    ))}
                    {Array.from({ length: 35 }).map((_, i) => (
                        <div key={i} className="bg-white p-2 min-h-[100px]">
                            <div className="h-4 w-6 bg-slate-200 rounded animate-pulse mb-2" />
                            {i % 3 === 0 && <div className="h-5 w-full bg-purple-100 rounded animate-pulse" />}
                        </div>
                    ))}
                </div>
            </div>
        )
    }

    return (
        <div className="p-4">
            <div className="flex gap-px">
                <div className="w-14 flex-shrink-0 space-y-[44px] pt-10">
                    {Array.from({ length: 14 }).map((_, i) => (
                        <div key={i} className="h-4 w-10 bg-slate-200 rounded animate-pulse" />
                    ))}
                </div>
                <div className="flex-1 grid grid-cols-7 gap-px bg-slate-200 rounded-lg overflow-hidden">
                    {Array.from({ length: 7 }).map((_, i) => (
                        <div key={i} className="bg-white min-h-[840px] p-1">
                            <div className="h-4 w-12 bg-slate-200 rounded animate-pulse mx-auto mb-4" />
                            {i % 2 === 0 && (
                                <div className="mt-20 h-16 bg-purple-100 rounded animate-pulse mx-1" />
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}

export default function CalendarPage() {
    return (
        <ErrorBoundary>
            <div className="h-full flex flex-col relative overflow-hidden bg-gray-50/50">
                <CalendarContent />
            </div>
        </ErrorBoundary>
    )
}
