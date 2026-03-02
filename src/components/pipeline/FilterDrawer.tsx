import { useState, useEffect } from 'react'
import { X, Filter, Calendar, User, Users, Search, Clock, Target, Link, FileText, Tag } from 'lucide-react'
import { Button } from '../ui/Button'
import { usePipelineFilters } from '../../hooks/usePipelineFilters'
import { cn } from '../../lib/utils'
import { useFilterOptions } from '../../hooks/useFilterOptions'
import { ALL_ORIGEM_OPTIONS } from '../../lib/constants/origem'
import { useCardTags } from '../../hooks/useCardTags'


interface FilterDrawerProps {
    isOpen: boolean
    onClose: () => void
}

const STATUS_COMERCIAL_OPTIONS = [
    { value: 'aberto', label: 'Em Aberto' },
    { value: 'pausado', label: 'Pausado' },
    { value: 'ganho', label: 'Ganho' },
    { value: 'perdido', label: 'Perdido' },
]

const DOC_STATUS_OPTIONS = [
    { value: 'pendente', label: 'Pendente', color: 'bg-amber-500 text-white border-amber-500' },
    { value: 'completo', label: 'Completo', color: 'bg-green-500 text-white border-green-500' },
    { value: 'sem_documentos', label: 'Sem Documentos', color: 'bg-gray-500 text-white border-gray-500' },
]



export function FilterDrawer({ isOpen, onClose }: FilterDrawerProps) {
    const { filters, setFilters } = usePipelineFilters()

    // Use cached data from React Query
    const { data: options } = useFilterOptions()
    const { tags: availableTags } = useCardTags()

    // Local state for the form
    const [localFilters, setLocalFilters] = useState(filters || {})

    // Search states
    const [searchOwner, setSearchOwner] = useState('')
    const [searchSdr, setSearchSdr] = useState('')
    const [searchPlanner, setSearchPlanner] = useState('')
    const [searchPos, setSearchPos] = useState('')
    const [searchTeam, setSearchTeam] = useState('')

    // Sync local state when global filters change (controlled component pattern)
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync externo (zustand store → local state)
    useEffect(() => { setLocalFilters(filters || {}) }, [filters])

    if (!isOpen) return null

    const profiles = options?.profiles || []
    const teams = options?.teams || []
    const departments = options?.departments || []

    const applyFilters = () => {
        setFilters(localFilters)
        onClose()
    }

    const clearFilters = () => {
        setLocalFilters({})
        setFilters({})
    }

    const toggleSelection = (field: 'ownerIds' | 'sdrIds' | 'plannerIds' | 'posIds' | 'teamIds' | 'departmentIds' | 'statusComercial' | 'origem' | 'docStatus' | 'tagIds', value: string) => {
        setLocalFilters(prev => {
            const current = (prev[field] as string[]) || []
            const updated = current.includes(value)
                ? current.filter(id => id !== value)
                : [...current, value]
            return { ...prev, [field]: updated }
        })
    }

    // Filtered lists based on search
    const filteredProfiles = profiles.filter(p =>
        (p.full_name?.toLowerCase() || '').includes(searchOwner.toLowerCase()) ||
        (p.email?.toLowerCase() || '').includes(searchOwner.toLowerCase())
    )

    const filteredSdrs = profiles.filter(p =>
        (p.full_name?.toLowerCase() || '').includes(searchSdr.toLowerCase()) ||
        (p.email?.toLowerCase() || '').includes(searchSdr.toLowerCase())
    )

    const filteredPlanners = profiles.filter(p =>
        (p.full_name?.toLowerCase() || '').includes(searchPlanner.toLowerCase()) ||
        (p.email?.toLowerCase() || '').includes(searchPlanner.toLowerCase())
    )

    const filteredPos = profiles.filter(p =>
        (p.full_name?.toLowerCase() || '').includes(searchPos.toLowerCase()) ||
        (p.email?.toLowerCase() || '').includes(searchPos.toLowerCase())
    )

    const filteredTeams = teams.filter(t => t.name.toLowerCase().includes(searchTeam.toLowerCase()))

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
                            <h2 className="text-lg font-bold text-gray-900">Filtros Avançados</h2>
                            <p className="text-xs text-gray-500">Refine sua visualização do pipeline</p>
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

                    {/* Section: Status Comercial */}
                    <div className="space-y-4">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 flex items-center gap-2">
                            <Target className="h-3 w-3" /> Status Comercial
                        </h3>
                        <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
                            <div className="flex flex-wrap gap-2">
                                {STATUS_COMERCIAL_OPTIONS.map(opt => {
                                    const isSelected = (localFilters.statusComercial || []).includes(opt.value)
                                    return (
                                        <button
                                            key={opt.value}
                                            onClick={() => toggleSelection('statusComercial', opt.value)}
                                            className={cn(
                                                "px-3 py-1.5 text-xs font-medium rounded-lg border transition-all",
                                                isSelected
                                                    ? opt.value === 'ganho' ? "bg-green-500 text-white border-green-500 shadow-sm"
                                                    : opt.value === 'perdido' ? "bg-red-500 text-white border-red-500 shadow-sm"
                                                    : opt.value === 'pausado' ? "bg-gray-500 text-white border-gray-500 shadow-sm"
                                                    : "bg-primary text-white border-primary shadow-sm"
                                                    : "border-gray-200 text-gray-600 hover:border-primary/50 hover:text-primary bg-white"
                                            )}
                                        >
                                            {opt.label}
                                        </button>
                                    )
                                })}
                            </div>
                        </div>
                    </div>

                    {/* Section: Origem */}
                    <div className="space-y-4">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 flex items-center gap-2">
                            <Link className="h-3 w-3" /> Origem do Lead
                        </h3>
                        <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm space-y-3">
                            <label className="text-sm font-semibold text-gray-700 block">Origem</label>
                            <div className="flex flex-wrap gap-2">
                                {ALL_ORIGEM_OPTIONS.map(opt => {
                                    const isSelected = (localFilters.origem || []).includes(opt.value)
                                    return (
                                        <button
                                            key={opt.value}
                                            onClick={() => toggleSelection('origem', opt.value)}
                                            className={cn(
                                                "px-3 py-1.5 text-sm font-medium rounded-lg border transition-all",
                                                isSelected
                                                    ? opt.color + " border-transparent shadow-sm"
                                                    : "border-gray-200 text-gray-600 hover:border-gray-300 bg-white"
                                            )}
                                        >
                                            {opt.label}
                                        </button>
                                    )
                                })}
                            </div>
                        </div>
                    </div>

                    {/* Section: Documentos */}
                    <div className="space-y-4">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 flex items-center gap-2">
                            <FileText className="h-3 w-3" /> Documentos
                        </h3>
                        <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
                            <div className="flex flex-wrap gap-2">
                                {DOC_STATUS_OPTIONS.map(opt => {
                                    const isSelected = (localFilters.docStatus || []).includes(opt.value)
                                    return (
                                        <button
                                            key={opt.value}
                                            onClick={() => toggleSelection('docStatus', opt.value)}
                                            className={cn(
                                                "px-3 py-1.5 text-xs font-medium rounded-lg border transition-all",
                                                isSelected
                                                    ? opt.color + " shadow-sm"
                                                    : "border-gray-200 text-gray-600 hover:border-gray-300 bg-white"
                                            )}
                                        >
                                            {opt.label}
                                        </button>
                                    )
                                })}
                            </div>
                        </div>
                    </div>

                    {/* Section: Dates */}
                    <div className="space-y-4">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 flex items-center gap-2">
                            <Calendar className="h-3 w-3" /> Datas
                        </h3>

                        {/* Data da Viagem */}
                        <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm space-y-3">
                            <label className="text-sm font-semibold text-gray-700 block">Data da Viagem</label>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1">
                                    <span className="text-xs text-gray-500 ml-1">De</span>
                                    <input
                                        type="date"
                                        className="w-full h-10 rounded-lg border-slate-200 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 bg-slate-50 outline-none transition-all px-3"
                                        value={localFilters.startDate || ''}
                                        onChange={(e) => setLocalFilters(prev => ({ ...prev, startDate: e.target.value }))}
                                    />
                                </div>
                                <div className="space-y-1">
                                    <span className="text-xs text-gray-500 ml-1">Até</span>
                                    <input
                                        type="date"
                                        className="w-full h-10 rounded-lg border-slate-200 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 bg-slate-50 outline-none transition-all px-3"
                                        value={localFilters.endDate || ''}
                                        onChange={(e) => setLocalFilters(prev => ({ ...prev, endDate: e.target.value }))}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Data de Criação */}
                        <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm space-y-3">
                            <label className="text-sm font-semibold text-gray-700 block flex items-center gap-2">
                                <Clock className="h-3.5 w-3.5 text-gray-400" /> Data de Criação
                            </label>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1">
                                    <span className="text-xs text-gray-500 ml-1">De</span>
                                    <input
                                        type="date"
                                        className="w-full h-10 rounded-lg border-slate-200 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 bg-slate-50 outline-none transition-all px-3"
                                        value={localFilters.creationStartDate || ''}
                                        onChange={(e) => setLocalFilters(prev => ({ ...prev, creationStartDate: e.target.value }))}
                                    />
                                </div>
                                <div className="space-y-1">
                                    <span className="text-xs text-gray-500 ml-1">Até</span>
                                    <input
                                        type="date"
                                        className="w-full h-10 rounded-lg border-slate-200 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 bg-slate-50 outline-none transition-all px-3"
                                        value={localFilters.creationEndDate || ''}
                                        onChange={(e) => setLocalFilters(prev => ({ ...prev, creationEndDate: e.target.value }))}
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

                        {/* Responsáveis */}
                        <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm space-y-3">
                            <label className="text-sm font-semibold text-gray-700 block">Responsáveis (Dono Atual)</label>
                            <div className="relative">
                                <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                                <input
                                    type="text"
                                    placeholder="Buscar responsável..."
                                    className="w-full pl-9 h-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all mb-2"
                                    value={searchOwner}
                                    onChange={(e) => setSearchOwner(e.target.value)}
                                />
                            </div>
                            <div className="max-h-40 overflow-y-auto border border-gray-100 rounded-lg p-1 space-y-0.5 bg-gray-50/30 custom-scrollbar">
                                {filteredProfiles.map(profile => {
                                    const isSelected = (localFilters.ownerIds || []).includes(profile.id)
                                    return (
                                        <label key={profile.id} className={cn(
                                            "flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors",
                                            isSelected ? "bg-primary/5" : "hover:bg-white"
                                        )}>
                                            <input
                                                type="checkbox"
                                                className="rounded border-gray-300 text-primary focus:ring-primary"
                                                checked={isSelected}
                                                onChange={() => toggleSelection('ownerIds', profile.id)}
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

                        {/* SDRs */}
                        <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm space-y-3">
                            <label className="text-sm font-semibold text-gray-700 block">SDRs (Pré-venda)</label>
                            <div className="relative">
                                <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                                <input
                                    type="text"
                                    placeholder="Buscar SDR..."
                                    className="w-full pl-9 h-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all mb-2"
                                    value={searchSdr}
                                    onChange={(e) => setSearchSdr(e.target.value)}
                                />
                            </div>
                            <div className="max-h-40 overflow-y-auto border border-gray-100 rounded-lg p-1 space-y-0.5 bg-gray-50/30 custom-scrollbar">
                                {filteredSdrs.map(profile => {
                                    const isSelected = (localFilters.sdrIds || []).includes(profile.id)
                                    return (
                                        <label key={`sdr-${profile.id}`} className={cn(
                                            "flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors",
                                            isSelected ? "bg-secondary/5" : "hover:bg-white"
                                        )}>
                                            <input
                                                type="checkbox"
                                                className="rounded border-gray-300 text-secondary focus:ring-secondary"
                                                checked={isSelected}
                                                onChange={() => toggleSelection('sdrIds', profile.id)}
                                            />
                                            <div className="flex items-center gap-2">
                                                <div className="h-6 w-6 rounded-full bg-secondary/10 flex items-center justify-center text-xs font-bold text-secondary border border-secondary/20">
                                                    {(profile.full_name || profile.email || '?').substring(0, 2).toUpperCase()}
                                                </div>
                                                <span className={cn("text-sm", isSelected ? "font-medium text-secondary-dark" : "text-gray-700")}>
                                                    {profile.full_name || profile.email}
                                                </span>
                                            </div>
                                        </label>
                                    )
                                })}
                            </div>
                        </div>

                        {/* Planners */}
                        <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm space-y-3">
                            <label className="text-sm font-semibold text-gray-700 block">Planners (Vendas)</label>
                            <div className="relative">
                                <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                                <input
                                    type="text"
                                    placeholder="Buscar Planner..."
                                    className="w-full pl-9 h-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all mb-2"
                                    value={searchPlanner}
                                    onChange={(e) => setSearchPlanner(e.target.value)}
                                />
                            </div>
                            <div className="max-h-40 overflow-y-auto border border-gray-100 rounded-lg p-1 space-y-0.5 bg-gray-50/30 custom-scrollbar">
                                {filteredPlanners.map(profile => {
                                    const isSelected = (localFilters.plannerIds || []).includes(profile.id)
                                    return (
                                        <label key={`planner-${profile.id}`} className={cn(
                                            "flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors",
                                            isSelected ? "bg-amber-50" : "hover:bg-white"
                                        )}>
                                            <input
                                                type="checkbox"
                                                className="rounded border-gray-300 text-amber-600 focus:ring-amber-500"
                                                checked={isSelected}
                                                onChange={() => toggleSelection('plannerIds', profile.id)}
                                            />
                                            <div className="flex items-center gap-2">
                                                <div className="h-6 w-6 rounded-full bg-amber-100 flex items-center justify-center text-xs font-bold text-amber-700 border border-amber-200">
                                                    {(profile.full_name || profile.email || '?').substring(0, 2).toUpperCase()}
                                                </div>
                                                <span className={cn("text-sm", isSelected ? "font-medium text-amber-700" : "text-gray-700")}>
                                                    {profile.full_name || profile.email}
                                                </span>
                                            </div>
                                        </label>
                                    )
                                })}
                            </div>
                        </div>

                        {/* Pós-Venda */}
                        <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm space-y-3">
                            <label className="text-sm font-semibold text-gray-700 block">Pós-Venda</label>
                            <div className="relative">
                                <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                                <input
                                    type="text"
                                    placeholder="Buscar Pós-Venda..."
                                    className="w-full pl-9 h-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all mb-2"
                                    value={searchPos}
                                    onChange={(e) => setSearchPos(e.target.value)}
                                />
                            </div>
                            <div className="max-h-40 overflow-y-auto border border-gray-100 rounded-lg p-1 space-y-0.5 bg-gray-50/30 custom-scrollbar">
                                {filteredPos.map(profile => {
                                    const isSelected = (localFilters.posIds || []).includes(profile.id)
                                    return (
                                        <label key={`pos-${profile.id}`} className={cn(
                                            "flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors",
                                            isSelected ? "bg-emerald-50" : "hover:bg-white"
                                        )}>
                                            <input
                                                type="checkbox"
                                                className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                                                checked={isSelected}
                                                onChange={() => toggleSelection('posIds', profile.id)}
                                            />
                                            <div className="flex items-center gap-2">
                                                <div className="h-6 w-6 rounded-full bg-emerald-100 flex items-center justify-center text-xs font-bold text-emerald-700 border border-emerald-200">
                                                    {(profile.full_name || profile.email || '?').substring(0, 2).toUpperCase()}
                                                </div>
                                                <span className={cn("text-sm", isSelected ? "font-medium text-emerald-700" : "text-gray-700")}>
                                                    {profile.full_name || profile.email}
                                                </span>
                                            </div>
                                        </label>
                                    )
                                })}
                            </div>
                        </div>
                    </div>

                    {/* Section: Organization */}
                    <div className="space-y-4">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 flex items-center gap-2">
                            <Users className="h-3 w-3" /> Organização
                        </h3>

                        {/* Times */}
                        <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm space-y-3">
                            <label className="text-sm font-semibold text-gray-700 block">Times</label>
                            <input
                                type="text"
                                placeholder="Filtrar times..."
                                className="w-full h-10 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all mb-2"
                                value={searchTeam}
                                onChange={(e) => setSearchTeam(e.target.value)}
                            />
                            <div className="flex flex-wrap gap-2">
                                {filteredTeams.map(team => (
                                    <button
                                        key={team.id}
                                        onClick={() => toggleSelection('teamIds', team.id)}
                                        className={cn(
                                            "px-3 py-1.5 text-xs font-medium rounded-lg border transition-all",
                                            (localFilters.teamIds || []).includes(team.id)
                                                ? "bg-primary text-white border-primary shadow-sm"
                                                : "border-gray-200 text-gray-600 hover:border-primary/50 hover:text-primary bg-white"
                                        )}
                                    >
                                        {team.name}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Macro Áreas */}
                        <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm space-y-3">
                            <label className="text-sm font-semibold text-gray-700 block">Macro Áreas</label>
                            <div className="flex flex-wrap gap-2">
                                {departments.map(dept => (
                                    <button
                                        key={dept.id}
                                        onClick={() => toggleSelection('departmentIds', dept.id)}
                                        className={cn(
                                            "px-3 py-1.5 text-xs font-medium rounded-lg border transition-all",
                                            (localFilters.departmentIds || []).includes(dept.id)
                                                ? "bg-secondary text-white border-secondary shadow-sm"
                                                : "border-gray-200 text-gray-600 hover:border-secondary/50 hover:text-secondary bg-white"
                                        )}
                                    >
                                        {dept.name}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Tags */}
                    {availableTags.length > 0 && (
                        <div className="p-6 border-t border-gray-100 space-y-4">
                            <div className="flex items-center gap-2">
                                <Tag className="w-4 h-4 text-gray-400" />
                                <h3 className="text-sm font-semibold text-gray-700">Tags</h3>
                            </div>
                            <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
                                <div className="flex flex-wrap gap-2">
                                    {availableTags.map(tag => {
                                        const selected = (localFilters.tagIds || []).includes(tag.id)
                                        return (
                                            <button
                                                key={tag.id}
                                                onClick={() => toggleSelection('tagIds', tag.id)}
                                                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full border transition-all"
                                                style={selected ? {
                                                    backgroundColor: tag.color + '25',
                                                    color: tag.color,
                                                    borderColor: tag.color + '60',
                                                } : {
                                                    backgroundColor: 'white',
                                                    color: '#6b7280',
                                                    borderColor: '#e5e7eb',
                                                }}
                                            >
                                                <span
                                                    className="w-2 h-2 rounded-full shrink-0"
                                                    style={{ backgroundColor: tag.color }}
                                                />
                                                {tag.name}
                                            </button>
                                        )
                                    })}
                                </div>
                            </div>
                        </div>
                    )}

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
