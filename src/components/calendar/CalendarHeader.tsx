import { useState } from 'react'
import { format, startOfWeek, endOfWeek } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, Plus, Users, User, Search, ChevronsUpDown, Check, X } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { useCalendarFilters, type CalendarViewMode, type MeetingStatus } from '@/hooks/calendar/useCalendarFilters'

interface CalendarHeaderProps {
    onNewMeeting: () => void
}

const VIEW_OPTIONS: { value: CalendarViewMode; label: string; shortcut: string }[] = [
    { value: 'day', label: 'Dia', shortcut: 'D' },
    { value: 'week', label: 'Semana', shortcut: 'W' },
    { value: 'month', label: 'Mês', shortcut: 'M' },
]

const STATUS_OPTIONS: { value: MeetingStatus; label: string; dot: string; activeBg: string; activeBorder: string; activeText: string }[] = [
    { value: 'agendada', label: 'Agendada', dot: 'bg-blue-500', activeBg: 'bg-blue-50', activeBorder: 'border-blue-300', activeText: 'text-blue-700' },
    { value: 'realizada', label: 'Realizada', dot: 'bg-green-500', activeBg: 'bg-green-50', activeBorder: 'border-green-300', activeText: 'text-green-700' },
    { value: 'cancelada', label: 'Cancelada', dot: 'bg-red-500', activeBg: 'bg-red-50', activeBorder: 'border-red-300', activeText: 'text-red-700' },
    { value: 'reagendada', label: 'Reagendada', dot: 'bg-orange-500', activeBg: 'bg-orange-50', activeBorder: 'border-orange-300', activeText: 'text-orange-700' },
    { value: 'nao_compareceu', label: 'Não compareceu', dot: 'bg-gray-500', activeBg: 'bg-gray-50', activeBorder: 'border-gray-300', activeText: 'text-gray-700' },
]

function getDateLabel(viewMode: CalendarViewMode, currentDate: string): string {
    const date = new Date(currentDate)
    switch (viewMode) {
        case 'month':
            return format(date, "MMMM 'de' yyyy", { locale: ptBR })
        case 'week': {
            const ws = startOfWeek(date, { weekStartsOn: 1 })
            const we = endOfWeek(date, { weekStartsOn: 1 })
            const sameMonth = ws.getMonth() === we.getMonth()
            if (sameMonth) {
                return `${format(ws, 'd', { locale: ptBR })} – ${format(we, "d 'de' MMMM", { locale: ptBR })}`
            }
            return `${format(ws, "d 'de' MMM", { locale: ptBR })} – ${format(we, "d 'de' MMM", { locale: ptBR })}`
        }
        case 'day':
            return format(date, "EEEE, d 'de' MMMM", { locale: ptBR })
    }
}

export function CalendarHeader({ onNewMeeting }: CalendarHeaderProps) {
    const {
        viewMode, setViewMode, currentDate,
        goToday, goNext, goPrev,
        teamView, setTeamView,
        selectedUserIds, setSelectedUserIds, toggleUserFilter,
        statusFilter, toggleStatus,
        search, setSearch,
        clearFilters, hasActiveFilters,
    } = useCalendarFilters()

    const [showUserDropdown, setShowUserDropdown] = useState(false)
    const [userSearch, setUserSearch] = useState('')

    const { data: profiles } = useQuery({
        queryKey: ['profiles-list'],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('profiles')
                .select('id, nome, email')
                .order('nome')
            if (error) throw error
            return data
        },
        staleTime: 1000 * 60 * 5,
        refetchOnWindowFocus: false,
    })

    const filteredProfiles = profiles?.filter((p) => {
        if (!userSearch) return true
        const s = userSearch.toLowerCase()
        return (p.nome?.toLowerCase().includes(s)) || (p.email?.toLowerCase().includes(s))
    })

    return (
        <div className="flex-shrink-0 bg-white border-b border-gray-200/60 z-10">
            {/* Row 1: Navigation + View Toggle + New Button */}
            <div className="flex items-center justify-between px-6 py-3">
                {/* Left: Navigation */}
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-0.5">
                        <button
                            onClick={goPrev}
                            title="Anterior (←)"
                            className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                        >
                            <ChevronLeft className="h-4 w-4" />
                        </button>
                        <button
                            onClick={goToday}
                            title="Hoje (T)"
                            className="px-3 py-1 text-xs font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
                        >
                            Hoje
                        </button>
                        <button
                            onClick={goNext}
                            title="Próximo (→)"
                            className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                        >
                            <ChevronRight className="h-4 w-4" />
                        </button>
                    </div>

                    <span className="text-sm font-semibold text-gray-800 capitalize min-w-[200px]">
                        {getDateLabel(viewMode, currentDate)}
                    </span>
                </div>

                {/* Center: View Toggle */}
                <div className="flex bg-gray-100/60 p-0.5 rounded-lg border border-gray-200/50">
                    {VIEW_OPTIONS.map((opt) => (
                        <button
                            key={opt.value}
                            onClick={() => setViewMode(opt.value)}
                            title={`${opt.label} (${opt.shortcut})`}
                            className={cn(
                                "px-3.5 py-1.5 text-xs font-medium rounded-md transition-all",
                                viewMode === opt.value
                                    ? "bg-white text-gray-900 shadow-sm border border-gray-200/50"
                                    : "text-gray-500 hover:text-gray-700"
                            )}
                        >
                            {opt.label}
                        </button>
                    ))}
                </div>

                {/* Right: New Meeting */}
                <Button
                    onClick={onNewMeeting}
                    title="Nova Reunião (N)"
                    className="bg-purple-600 hover:bg-purple-700 text-white text-sm"
                >
                    <Plus className="h-4 w-4 mr-1.5" />
                    Nova Reunião
                </Button>
            </div>

            {/* Row 2: Filters */}
            <div className="flex items-center justify-between px-6 py-2 border-t border-gray-100 gap-4">
                {/* Left: Team Toggle + User Filter */}
                <div className="flex items-center gap-2.5">
                    <div className="flex bg-gray-100/50 p-0.5 rounded-lg border border-gray-200/50">
                        <button
                            onClick={() => setTeamView(false)}
                            className={cn(
                                "flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-all",
                                !teamView
                                    ? "bg-white text-gray-900 shadow-sm border border-gray-200/50"
                                    : "text-gray-500 hover:text-gray-700"
                            )}
                        >
                            <User className="h-3 w-3" />
                            Meu
                        </button>
                        <button
                            onClick={() => setTeamView(true)}
                            className={cn(
                                "flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-all",
                                teamView
                                    ? "bg-white text-gray-900 shadow-sm border border-gray-200/50"
                                    : "text-gray-500 hover:text-gray-700"
                            )}
                        >
                            <Users className="h-3 w-3" />
                            Equipe
                        </button>
                    </div>

                    {/* User Filter (Team View only) */}
                    {teamView && (
                        <div className="relative">
                            <button
                                onClick={() => setShowUserDropdown(!showUserDropdown)}
                                className={cn(
                                    "flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium bg-white border rounded-lg hover:bg-gray-50 transition-colors",
                                    selectedUserIds.length > 0
                                        ? "text-purple-700 border-purple-300"
                                        : "text-gray-600 border-gray-200"
                                )}
                            >
                                <Users className="h-3 w-3" />
                                {selectedUserIds.length > 0
                                    ? `${selectedUserIds.length} consultor${selectedUserIds.length > 1 ? 'es' : ''}`
                                    : 'Todos'}
                                <ChevronsUpDown className="h-3 w-3 text-gray-400" />
                            </button>

                            {showUserDropdown && (
                                <>
                                    <div className="fixed inset-0 z-30" onClick={() => setShowUserDropdown(false)} />
                                    <div className="absolute left-0 top-full mt-1 w-64 bg-white border border-gray-200 rounded-lg shadow-lg z-40 max-h-64 overflow-hidden">
                                        <div className="p-2 border-b border-gray-100">
                                            <div className="relative">
                                                <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-gray-400" />
                                                <input
                                                    value={userSearch}
                                                    onChange={(e) => setUserSearch(e.target.value)}
                                                    placeholder="Buscar consultor..."
                                                    className="w-full pl-7 pr-2 py-1.5 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-purple-500"
                                                    autoFocus
                                                />
                                            </div>
                                        </div>
                                        <div className="max-h-48 overflow-y-auto p-1">
                                            {selectedUserIds.length > 0 && (
                                                <button
                                                    onClick={() => setSelectedUserIds([])}
                                                    className="w-full text-left px-2 py-1.5 text-xs text-purple-600 hover:bg-purple-50 rounded-md font-medium"
                                                >
                                                    Limpar seleção
                                                </button>
                                            )}
                                            {filteredProfiles?.map((p) => (
                                                <button
                                                    key={p.id}
                                                    onClick={() => toggleUserFilter(p.id)}
                                                    className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-gray-700 hover:bg-gray-50 rounded-md"
                                                >
                                                    <div className={cn(
                                                        "w-4 h-4 rounded border flex items-center justify-center flex-shrink-0",
                                                        selectedUserIds.includes(p.id)
                                                            ? "bg-purple-600 border-purple-600"
                                                            : "border-gray-300"
                                                    )}>
                                                        {selectedUserIds.includes(p.id) && <Check className="h-3 w-3 text-white" />}
                                                    </div>
                                                    <span className="truncate">{p.nome || p.email}</span>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    )}
                </div>

                {/* Center: Status Filter Pills */}
                <div className="flex items-center gap-1">
                    {STATUS_OPTIONS.map((opt) => {
                        const isActive = statusFilter.includes(opt.value)
                        return (
                            <button
                                key={opt.value}
                                onClick={() => toggleStatus(opt.value)}
                                className={cn(
                                    "flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full border transition-all",
                                    isActive
                                        ? `${opt.activeBg} ${opt.activeText} ${opt.activeBorder}`
                                        : "bg-white text-gray-400 border-gray-200 hover:text-gray-600 hover:border-gray-300"
                                )}
                            >
                                <span className={cn("w-1.5 h-1.5 rounded-full", isActive ? opt.dot : 'bg-gray-300')} />
                                {opt.label}
                            </button>
                        )
                    })}
                </div>

                {/* Right: Search + Clear */}
                <div className="flex items-center gap-2">
                    <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                        <input
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Buscar..."
                            className="pl-8 pr-8 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-lg w-40 focus:outline-none focus:ring-1 focus:ring-purple-500 focus:border-purple-300 focus:w-52 transition-all"
                        />
                        {search && (
                            <button
                                onClick={() => setSearch('')}
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                            >
                                <X className="h-3 w-3" />
                            </button>
                        )}
                    </div>

                    {hasActiveFilters() && (
                        <button
                            onClick={clearFilters}
                            className="flex items-center gap-1 px-2 py-1 text-xs text-red-500 hover:text-red-700 hover:bg-red-50 rounded-md transition-colors whitespace-nowrap"
                        >
                            <X className="h-3 w-3" />
                            Limpar
                        </button>
                    )}
                </div>
            </div>
        </div>
    )
}
