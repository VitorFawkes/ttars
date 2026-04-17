import { useState, useEffect } from 'react'
import { X, Filter, Calendar, User, DollarSign, Crown } from 'lucide-react'
import { Button } from '../ui/Button'
import type { PeopleFilters } from '../../hooks/usePeopleIntelligence'
import { cn } from '../../lib/utils'
import { useFilterOptions } from '../../hooks/useFilterOptions'

interface PeopleFilterDrawerProps {
    isOpen: boolean
    onClose: () => void
    filters: PeopleFilters
    setFilters: (filters: PeopleFilters) => void
}

export function PeopleFilterDrawer({ isOpen, onClose, filters, setFilters }: PeopleFilterDrawerProps) {
    // Use cached data from React Query
    const { data: options } = useFilterOptions()

    // Local state for the form
    const [localFilters, setLocalFilters] = useState<PeopleFilters>(filters)

    // Search states
    const [searchCreator, setSearchCreator] = useState('')

    // Update local state when global filters change
    useEffect(() => {
        setLocalFilters(filters)
    }, [filters])

    if (!isOpen) return null

    const profiles = options?.profiles || []

    const applyFilters = () => {
        setFilters(localFilters)
        onClose()
    }

    const clearFilters = () => {
        setLocalFilters({
            search: '',
            type: 'all'
        })
        setFilters({
            search: '',
            type: 'all'
        })
    }

    const toggleSelection = (field: 'createdByIds', value: string) => {
        setLocalFilters(prev => {
            const current = (prev[field] as string[]) || []
            const updated = current.includes(value)
                ? current.filter(id => id !== value)
                : [...current, value]
            return { ...prev, [field]: updated }
        })
    }

    // Filtered lists based on search
    const filteredCreators = profiles.filter(p =>
        (p.full_name?.toLowerCase() || '').includes(searchCreator.toLowerCase()) ||
        (p.email?.toLowerCase() || '').includes(searchCreator.toLowerCase())
    )

    return (
        <>
            {/* Backdrop */}
            <div
                className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40 transition-opacity"
                onClick={onClose}
            />

            {/* Drawer */}
            <div className="fixed inset-y-0 right-0 w-[500px] bg-white shadow-2xl z-50 transform transition-transform duration-300 ease-in-out border-l border-gray-100 flex flex-col">
                <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 bg-white">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-primary/5 rounded-xl">
                            <Filter className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-gray-900">Filtros de Pessoas</h2>
                            <p className="text-xs text-gray-500">Refine sua busca de contatos</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-8 bg-gray-50/50">

                    {/* Section: Dates */}
                    <div className="space-y-4">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 flex items-center gap-2">
                            <Calendar className="h-3 w-3" /> Datas
                        </h3>

                        {/* Data da Última Viagem */}
                        <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm space-y-3">
                            <label className="text-sm font-semibold text-gray-700 block">Última Viagem</label>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1">
                                    <span className="text-xs text-gray-500 ml-1">De</span>
                                    <input
                                        type="date"
                                        className="w-full h-10 rounded-lg border-slate-200 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 bg-slate-50 outline-none transition-all px-3"
                                        value={localFilters.lastTripAfter || ''}
                                        onChange={(e) => setLocalFilters(prev => ({ ...prev, lastTripAfter: e.target.value }))}
                                    />
                                </div>
                                <div className="space-y-1">
                                    <span className="text-xs text-gray-500 ml-1">Até</span>
                                    <input
                                        type="date"
                                        className="w-full h-10 rounded-lg border-slate-200 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 bg-slate-50 outline-none transition-all px-3"
                                        value={localFilters.lastTripBefore || ''}
                                        onChange={(e) => setLocalFilters(prev => ({ ...prev, lastTripBefore: e.target.value }))}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Data de Criação */}
                        <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm space-y-3">
                            <label className="text-sm font-semibold text-gray-700 block">Data de Criação</label>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1">
                                    <span className="text-xs text-gray-500 ml-1">De</span>
                                    <input
                                        type="date"
                                        className="w-full h-10 rounded-lg border-slate-200 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 bg-slate-50 outline-none transition-all px-3"
                                        value={localFilters.createdAtStart || ''}
                                        onChange={(e) => setLocalFilters(prev => ({ ...prev, createdAtStart: e.target.value }))}
                                    />
                                </div>
                                <div className="space-y-1">
                                    <span className="text-xs text-gray-500 ml-1">Até</span>
                                    <input
                                        type="date"
                                        className="w-full h-10 rounded-lg border-slate-200 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 bg-slate-50 outline-none transition-all px-3"
                                        value={localFilters.createdAtEnd || ''}
                                        onChange={(e) => setLocalFilters(prev => ({ ...prev, createdAtEnd: e.target.value }))}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Section: People */}
                    <div className="space-y-4">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 flex items-center gap-2">
                            <User className="h-3 w-3" /> Pessoas
                        </h3>

                        {/* Criado Por */}
                        <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm space-y-3">
                            <label className="text-sm font-semibold text-gray-700 block">Criado Por</label>
                            <input
                                type="text"
                                placeholder="Buscar usuário..."
                                className="w-full h-10 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all mb-2"
                                value={searchCreator}
                                onChange={(e) => setSearchCreator(e.target.value)}
                            />
                            <div className="max-h-40 overflow-y-auto border border-gray-100 rounded-lg p-1 space-y-0.5 bg-gray-50/30 custom-scrollbar">
                                {filteredCreators.map(profile => {
                                    const isSelected = (localFilters.createdByIds || []).includes(profile.id)
                                    return (
                                        <label key={profile.id} className={cn(
                                            "flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors",
                                            isSelected ? "bg-primary/5" : "hover:bg-white"
                                        )}>
                                            <input
                                                type="checkbox"
                                                className="rounded border-gray-300 text-primary focus:ring-primary"
                                                checked={isSelected}
                                                onChange={() => toggleSelection('createdByIds', profile.id)}
                                            />
                                            <div className="flex items-center gap-2">
                                                <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary border border-primary/20">
                                                    {(profile.full_name || profile.email || '?').substring(0, 2).toUpperCase()}
                                                </div>
                                                <span className={cn("text-sm", isSelected ? "font-medium text-primary-dark" : "text-gray-700")}>
                                                    {profile.full_name || profile.email}
                                                </span>
                                            </div>
                                        </label>
                                    )
                                })}
                            </div>
                        </div>

                        {/* Tipo de Pessoa */}
                        <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm space-y-3">
                            <label className="text-sm font-semibold text-gray-700 block">Tipo de Pessoa</label>
                            <div className="flex gap-2">
                                {[
                                    { value: 'all', label: 'Todos' },
                                    { value: 'adulto', label: 'Adulto' },
                                    { value: 'crianca', label: 'Não Adulto' }
                                ].map(option => (
                                    <button
                                        key={option.value}
                                        onClick={() => setLocalFilters(prev => ({ ...prev, type: option.value as any }))}
                                        className={cn(
                                            "flex-1 px-3 py-2 text-sm font-medium rounded-lg border transition-all",
                                            localFilters.type === option.value
                                                ? "bg-primary text-white border-primary shadow-sm"
                                                : "border-gray-200 text-gray-600 hover:border-primary/50 hover:text-primary bg-white"
                                        )}
                                    >
                                        {option.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Líder de Grupo */}
                        <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
                            <label className="flex items-center justify-between cursor-pointer">
                                <div className="flex items-center gap-2">
                                    <Crown className="h-4 w-4 text-amber-500" />
                                    <span className="text-sm font-semibold text-gray-700">Apenas Líderes de Grupo</span>
                                </div>
                                <div className={cn(
                                    "w-11 h-6 rounded-full transition-colors relative",
                                    localFilters.isGroupLeader ? "bg-primary" : "bg-gray-200"
                                )}>
                                    <input
                                        type="checkbox"
                                        className="sr-only"
                                        checked={!!localFilters.isGroupLeader}
                                        onChange={(e) => setLocalFilters(prev => ({ ...prev, isGroupLeader: e.target.checked }))}
                                    />
                                    <div className={cn(
                                        "absolute top-1 left-1 bg-white w-4 h-4 rounded-full transition-transform shadow-sm",
                                        localFilters.isGroupLeader ? "translate-x-5" : "translate-x-0"
                                    )} />
                                </div>
                            </label>
                        </div>
                    </div>

                    {/* Section: Financial */}
                    <div className="space-y-4">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 flex items-center gap-2">
                            <DollarSign className="h-3 w-3" /> Financeiro (Valor Total)
                        </h3>
                        <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm space-y-3">
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1">
                                    <span className="text-xs text-gray-500 ml-1">Mínimo</span>
                                    <div className="relative">
                                        <span className="absolute left-3 top-2.5 text-gray-400 text-xs">R$</span>
                                        <input
                                            type="number"
                                            className="w-full pl-8 h-10 rounded-lg border-slate-200 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 bg-slate-50 outline-none transition-all px-3"
                                            value={localFilters.minSpend || ''}
                                            onChange={(e) => setLocalFilters(prev => ({ ...prev, minSpend: e.target.value ? Number(e.target.value) : undefined }))}
                                        />
                                    </div>
                                </div>
                                <div className="space-y-1">
                                    <span className="text-xs text-gray-500 ml-1">Máximo</span>
                                    <div className="relative">
                                        <span className="absolute left-3 top-2.5 text-gray-400 text-xs">R$</span>
                                        <input
                                            type="number"
                                            className="w-full pl-8 h-10 rounded-lg border-slate-200 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 bg-slate-50 outline-none transition-all px-3"
                                            value={localFilters.maxSpend || ''}
                                            onChange={(e) => setLocalFilters(prev => ({ ...prev, maxSpend: e.target.value ? Number(e.target.value) : undefined }))}
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                </div>

                {/* Footer Actions */}
                <div className="p-6 border-t border-gray-100 bg-white flex items-center justify-between gap-4 shadow-[0_-4px_20px_rgba(0,0,0,0.05)] z-10">
                    <button
                        onClick={clearFilters}
                        className="text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors px-4 py-2 rounded-lg hover:bg-gray-50"
                    >
                        Limpar Filtros
                    </button>
                    <Button onClick={applyFilters} className="w-full max-w-[240px] shadow-lg shadow-primary/20">
                        Aplicar Filtros
                    </Button>
                </div>
            </div>
        </>
    )
}
