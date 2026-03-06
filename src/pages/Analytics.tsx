
import { useState, useRef, useEffect } from 'react';
import { AnalyticsProvider, useAnalytics, type Product, type StatusFilter, type DateReference } from '../features/analytics/context/AnalyticsContext';
import { Overview } from '../features/analytics/pages/Overview';
import { startOfMonth, endOfMonth, subMonths, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Calendar, ChevronDown, Filter, X, Users, MapPin, CheckCircle } from 'lucide-react';
import { cn } from '../lib/utils';

function AnalyticsContent() {
    const {
        dateRange,
        setDateRange,
        granularity,
        setGranularity,
        dateReference,
        setDateReference,
        filters,
        updateFilter,
        clearFilters,
        availableOrigins,
        availableOwners,
        filteredData,
    } = useAnalytics();

    const [showFilters, setShowFilters] = useState(false);
    const [datePreset, setDatePreset] = useState('all_time');
    const [customStartDate, setCustomStartDate] = useState('');
    const [customEndDate, setCustomEndDate] = useState('');

    // Owner dropdown state
    const [showOwnerDropdown, setShowOwnerDropdown] = useState(false);
    const ownerDropdownRef = useRef<HTMLDivElement>(null);

    // Origin dropdown state
    const [showOriginDropdown, setShowOriginDropdown] = useState(false);
    const originDropdownRef = useRef<HTMLDivElement>(null);

    // Close dropdowns on outside click
    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            if (ownerDropdownRef.current && !ownerDropdownRef.current.contains(e.target as Node)) {
                setShowOwnerDropdown(false);
            }
            if (originDropdownRef.current && !originDropdownRef.current.contains(e.target as Node)) {
                setShowOriginDropdown(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleDatePresetChange = (preset: string) => {
        setDatePreset(preset);
        const today = new Date();

        if (preset === 'all_time') {
            // From 2020 to today - covers all historical data
            setDateRange({ start: new Date(2020, 0, 1), end: today });
        } else if (preset === 'this_month') {
            setDateRange({ start: startOfMonth(today), end: today });
        } else if (preset === 'last_month') {
            const last = subMonths(today, 1);
            setDateRange({ start: startOfMonth(last), end: endOfMonth(last) });
        } else if (preset === 'last_3_months') {
            setDateRange({ start: startOfMonth(subMonths(today, 2)), end: today });
        } else if (preset === 'last_6_months') {
            setDateRange({ start: startOfMonth(subMonths(today, 5)), end: today });
        } else if (preset === 'this_year') {
            setDateRange({ start: new Date(today.getFullYear(), 0, 1), end: today });
        } else if (preset === 'last_year') {
            setDateRange({
                start: new Date(today.getFullYear() - 1, 0, 1),
                end: new Date(today.getFullYear() - 1, 11, 31)
            });
        }
    };

    const handleCustomDateChange = () => {
        if (customStartDate && customEndDate) {
            setDateRange({
                start: new Date(customStartDate + 'T00:00:00'),
                end: new Date(customEndDate + 'T23:59:59')
            });
            setDatePreset('custom');
        }
    };

    const toggleOwner = (ownerId: string) => {
        const current = filters.ownerIds;
        const updated = current.includes(ownerId)
            ? current.filter(id => id !== ownerId)
            : [...current, ownerId];
        updateFilter('ownerIds', updated);
    };

    const toggleOrigin = (origin: string) => {
        const current = filters.origins;
        const updated = current.includes(origin)
            ? current.filter(o => o !== origin)
            : [...current, origin];
        updateFilter('origins', updated);
    };

    const hasActiveFilters = filters.ownerIds.length > 0 ||
        filters.origins.length > 0 ||
        filters.status !== 'all';

    const activeFilterCount = [
        filters.ownerIds.length > 0,
        filters.origins.length > 0,
        filters.status !== 'all'
    ].filter(Boolean).length;

    return (
        <div className="h-full overflow-y-auto bg-slate-50/50 p-8 space-y-6">
            {/* Header */}
            <div className="flex flex-col gap-4">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Analytics</h1>
                        <p className="text-sm text-slate-500">
                            Visão geral de performance e funil de vendas.
                            <span className="ml-2 text-slate-400">
                                ({filteredData.leads.length} leads | {filteredData.trips.length} viagens)
                            </span>
                        </p>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                        {/* Granularity */}
                        <div className="flex items-center bg-white p-1 rounded-lg border border-slate-200 shadow-sm">
                            <select
                                className="text-sm border-none bg-transparent focus:ring-0 text-slate-600 font-medium cursor-pointer pr-6"
                                value={granularity}
                                onChange={(e) => setGranularity(e.target.value as 'day' | 'week' | 'month')}
                            >
                                <option value="week">Semanal</option>
                                <option value="month">Mensal</option>
                            </select>
                        </div>

                        {/* Date Preset */}
                        <div className="flex items-center bg-white p-1 rounded-lg border border-slate-200 shadow-sm">
                            <select
                                className="text-sm border-none bg-transparent focus:ring-0 text-slate-600 font-medium cursor-pointer pr-6"
                                value={datePreset}
                                onChange={(e) => handleDatePresetChange(e.target.value)}
                            >
                                <option value="all_time">Todos</option>
                                <option value="this_month">Este Mês</option>
                                <option value="last_month">Mês Passado</option>
                                <option value="last_3_months">Últimos 3 Meses</option>
                                <option value="last_6_months">Últimos 6 Meses</option>
                                <option value="this_year">Este Ano</option>
                                <option value="last_year">Ano Passado</option>
                            </select>
                        </div>

                        {/* Date Reference */}
                        <div className="flex items-center bg-white p-1 rounded-lg border border-slate-200 shadow-sm">
                            <select
                                className="text-sm border-none bg-transparent focus:ring-0 text-slate-600 font-medium cursor-pointer pr-6"
                                value={dateReference}
                                onChange={(e) => setDateReference(e.target.value as DateReference)}
                            >
                                <option value="created">Data Criação</option>
                                <option value="trip">Data Viagem</option>
                            </select>
                        </div>

                        {/* Filters Toggle */}
                        <button
                            onClick={() => setShowFilters(!showFilters)}
                            className={cn(
                                "flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-all",
                                showFilters || hasActiveFilters
                                    ? "bg-indigo-50 border-indigo-200 text-indigo-700"
                                    : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
                            )}
                        >
                            <Filter className="h-4 w-4" />
                            Filtros
                            {activeFilterCount > 0 && (
                                <span className="ml-1 px-1.5 py-0.5 text-xs bg-indigo-600 text-white rounded-full">
                                    {activeFilterCount}
                                </span>
                            )}
                        </button>
                    </div>
                </div>

                {/* Filter Panel */}
                {showFilters && (
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 animate-in fade-in slide-in-from-top-2 duration-200">
                        <div className="flex flex-wrap gap-4 items-end">
                            {/* Custom Date Range */}
                            <div className="flex flex-col gap-1">
                                <label className="text-xs font-medium text-slate-500 uppercase tracking-wider flex items-center gap-1">
                                    <Calendar className="h-3 w-3" /> Período
                                </label>
                                <div className="flex items-center gap-2">
                                    <input
                                        type="date"
                                        value={customStartDate}
                                        onChange={(e) => setCustomStartDate(e.target.value)}
                                        className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                                    />
                                    <span className="text-slate-400">até</span>
                                    <input
                                        type="date"
                                        value={customEndDate}
                                        onChange={(e) => setCustomEndDate(e.target.value)}
                                        className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                                    />
                                    <button
                                        onClick={handleCustomDateChange}
                                        disabled={!customStartDate || !customEndDate}
                                        className="px-3 py-1.5 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        Aplicar
                                    </button>
                                </div>
                            </div>

                            <div className="h-8 w-px bg-slate-200 hidden sm:block" />

                            {/* Product Filter */}
                            <div className="flex flex-col gap-1">
                                <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                                    Produto
                                </label>
                                <select
                                    value={filters.product}
                                    onChange={(e) => updateFilter('product', e.target.value as Product)}
                                    className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 min-w-[120px]"
                                >
                                    <option value="ALL">Todos</option>
                                    <option value="TRIPS">TRIPS</option>
                                    <option value="WEDDING">WEDDING</option>
                                    <option value="CORP">CORP</option>
                                </select>
                            </div>

                            {/* Status Filter */}
                            <div className="flex flex-col gap-1">
                                <label className="text-xs font-medium text-slate-500 uppercase tracking-wider flex items-center gap-1">
                                    <CheckCircle className="h-3 w-3" /> Status
                                </label>
                                <select
                                    value={filters.status}
                                    onChange={(e) => updateFilter('status', e.target.value as StatusFilter)}
                                    className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 min-w-[120px]"
                                >
                                    <option value="all">Todos</option>
                                    <option value="open">Em Aberto</option>
                                    <option value="won">Ganho</option>
                                    <option value="lost">Perdido</option>
                                </select>
                            </div>

                            {/* Owner Filter */}
                            <div className="flex flex-col gap-1 relative" ref={ownerDropdownRef}>
                                <label className="text-xs font-medium text-slate-500 uppercase tracking-wider flex items-center gap-1">
                                    <Users className="h-3 w-3" /> Responsável
                                </label>
                                <button
                                    onClick={() => setShowOwnerDropdown(!showOwnerDropdown)}
                                    className={cn(
                                        "flex items-center justify-between gap-2 text-sm border rounded-lg px-3 py-1.5 min-w-[160px] text-left",
                                        filters.ownerIds.length > 0
                                            ? "border-indigo-300 bg-indigo-50 text-indigo-700"
                                            : "border-slate-200 text-slate-600"
                                    )}
                                >
                                    <span className="truncate">
                                        {filters.ownerIds.length === 0
                                            ? 'Todos'
                                            : `${filters.ownerIds.length} selecionado(s)`}
                                    </span>
                                    <ChevronDown className="h-4 w-4 flex-shrink-0" />
                                </button>
                                {showOwnerDropdown && (
                                    <div className="absolute top-full left-0 mt-1 w-64 bg-white border border-slate-200 rounded-lg shadow-lg z-50 max-h-60 overflow-y-auto">
                                        {availableOwners.map(owner => (
                                            <label
                                                key={owner.id}
                                                className="flex items-center gap-2 px-3 py-2 hover:bg-slate-50 cursor-pointer"
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={filters.ownerIds.includes(owner.id)}
                                                    onChange={() => toggleOwner(owner.id)}
                                                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                                />
                                                <span className="text-sm text-slate-700 truncate">{owner.name}</span>
                                            </label>
                                        ))}
                                        {availableOwners.length === 0 && (
                                            <div className="px-3 py-2 text-sm text-slate-400">Nenhum responsável</div>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Origin Filter */}
                            <div className="flex flex-col gap-1 relative" ref={originDropdownRef}>
                                <label className="text-xs font-medium text-slate-500 uppercase tracking-wider flex items-center gap-1">
                                    <MapPin className="h-3 w-3" /> Origem
                                </label>
                                <button
                                    onClick={() => setShowOriginDropdown(!showOriginDropdown)}
                                    className={cn(
                                        "flex items-center justify-between gap-2 text-sm border rounded-lg px-3 py-1.5 min-w-[140px] text-left",
                                        filters.origins.length > 0
                                            ? "border-indigo-300 bg-indigo-50 text-indigo-700"
                                            : "border-slate-200 text-slate-600"
                                    )}
                                >
                                    <span className="truncate">
                                        {filters.origins.length === 0
                                            ? 'Todas'
                                            : `${filters.origins.length} selecionada(s)`}
                                    </span>
                                    <ChevronDown className="h-4 w-4 flex-shrink-0" />
                                </button>
                                {showOriginDropdown && (
                                    <div className="absolute top-full left-0 mt-1 w-48 bg-white border border-slate-200 rounded-lg shadow-lg z-50 max-h-60 overflow-y-auto">
                                        {availableOrigins.map(origin => (
                                            <label
                                                key={origin}
                                                className="flex items-center gap-2 px-3 py-2 hover:bg-slate-50 cursor-pointer"
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={filters.origins.includes(origin)}
                                                    onChange={() => toggleOrigin(origin)}
                                                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                                />
                                                <span className="text-sm text-slate-700 truncate">{origin}</span>
                                            </label>
                                        ))}
                                        {availableOrigins.length === 0 && (
                                            <div className="px-3 py-2 text-sm text-slate-400">Nenhuma origem</div>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Clear Filters */}
                            {hasActiveFilters && (
                                <button
                                    onClick={clearFilters}
                                    className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
                                >
                                    <X className="h-4 w-4" />
                                    Limpar
                                </button>
                            )}
                        </div>

                        {/* Active Filter Chips */}
                        {hasActiveFilters && (
                            <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-slate-100">
                                <span className="inline-flex items-center gap-1 px-2 py-1 bg-indigo-50 text-indigo-700 rounded-full text-xs font-medium">
                                        Produto: {filters.product}
                                    </span>
                                {filters.status !== 'all' && (
                                    <span className="inline-flex items-center gap-1 px-2 py-1 bg-indigo-50 text-indigo-700 rounded-full text-xs font-medium">
                                        Status: {filters.status === 'open' ? 'Em Aberto' : filters.status === 'won' ? 'Ganho' : 'Perdido'}
                                        <button onClick={() => updateFilter('status', 'all')} className="hover:bg-indigo-100 rounded-full p-0.5">
                                            <X className="h-3 w-3" />
                                        </button>
                                    </span>
                                )}
                                {filters.ownerIds.map(ownerId => {
                                    const owner = availableOwners.find(o => o.id === ownerId);
                                    return (
                                        <span key={ownerId} className="inline-flex items-center gap-1 px-2 py-1 bg-indigo-50 text-indigo-700 rounded-full text-xs font-medium">
                                            Resp: {owner?.name || ownerId.slice(0, 8)}
                                            <button onClick={() => toggleOwner(ownerId)} className="hover:bg-indigo-100 rounded-full p-0.5">
                                                <X className="h-3 w-3" />
                                            </button>
                                        </span>
                                    );
                                })}
                                {filters.origins.map(origin => (
                                    <span key={origin} className="inline-flex items-center gap-1 px-2 py-1 bg-indigo-50 text-indigo-700 rounded-full text-xs font-medium">
                                        Origem: {origin}
                                        <button onClick={() => toggleOrigin(origin)} className="hover:bg-indigo-100 rounded-full p-0.5">
                                            <X className="h-3 w-3" />
                                        </button>
                                    </span>
                                ))}
                            </div>
                        )}

                        {/* Current Date Range Display */}
                        <div className="mt-3 text-xs text-slate-500">
                            Período: {format(dateRange.start, "dd 'de' MMM yyyy", { locale: ptBR })} - {format(dateRange.end, "dd 'de' MMM yyyy", { locale: ptBR })}
                        </div>
                    </div>
                )}
            </div>

            <Overview />
        </div>
    );
}

export default function AnalyticsPage() {
    return (
        <AnalyticsProvider>
            <AnalyticsContent />
        </AnalyticsProvider>
    );
}
