import { useState, useEffect } from 'react'
import { X, Filter, Calendar, User, DollarSign, Clock, Layers, MapPin, Link, Tag } from 'lucide-react'
import { Button } from '../ui/Button'
import type { LeadsFilterState } from '../../hooks/useLeadsFilters'
import { cn } from '../../lib/utils'
import { useFilterOptions } from '../../hooks/useFilterOptions'
import { usePipelineStages } from '../../hooks/usePipelineStages'
import { usePipelines } from '../../hooks/usePipelines'
import { useCardTags } from '../../hooks/useCardTags'
import { useProductContext } from '../../hooks/useProductContext'
import { useCurrentProductMeta } from '../../hooks/useCurrentProductMeta'
import { ALL_ORIGEM_OPTIONS } from '../../lib/constants/origem'

interface LeadsFilterDrawerProps {
    isOpen: boolean
    onClose: () => void
    filters: LeadsFilterState
    setFilters: (filters: Partial<LeadsFilterState>) => void
}

export function LeadsFilterDrawer({ isOpen, onClose, filters, setFilters }: LeadsFilterDrawerProps) {
    const { currentProduct } = useProductContext()
    const { pipelineId } = useCurrentProductMeta()
    const { data: options } = useFilterOptions()
    const { data: stages } = usePipelineStages(pipelineId)
    const { data: pipelines } = usePipelines()
    const { tags: availableTags } = useCardTags(currentProduct)

    // Local state for the form
    const [localFilters, setLocalFilters] = useState<Partial<LeadsFilterState>>(filters)

    // Search states
    const [searchOwner, setSearchOwner] = useState('')
    const [searchStage, setSearchStage] = useState('')

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
        const clearedFilters: Partial<LeadsFilterState> = {
            search: undefined,
            creationStartDate: undefined,
            creationEndDate: undefined,
            ownerIds: undefined,
            stageIds: undefined,
            statusComercial: undefined,
            prioridade: undefined,
            pipelineIds: undefined,
            dataViagemStart: undefined,
            dataViagemEnd: undefined,
            valorMin: undefined,
            valorMax: undefined,
            diasSemContatoMin: undefined,
            diasSemContatoMax: undefined,
            origem: undefined,
            tagIds: undefined,
            noTag: undefined,
        }
        setLocalFilters(clearedFilters)
        setFilters(clearedFilters)
    }

    const toggleSelection = (field: 'ownerIds' | 'stageIds' | 'statusComercial' | 'prioridade' | 'pipelineIds' | 'origem' | 'tagIds', value: string) => {
        setLocalFilters(prev => {
            const current = (prev[field] as string[]) || []
            const updated = current.includes(value)
                ? current.filter(id => id !== value)
                : [...current, value]
            const extra = field === 'tagIds' ? { noTag: undefined } : {}
            return { ...prev, [field]: updated, ...extra }
        })
    }

    const toggleNoTag = () => {
        setLocalFilters(prev => ({
            ...prev,
            noTag: !prev.noTag || undefined,
            tagIds: undefined,
        }))
    }

    // Filtered lists based on search
    const filteredOwners = profiles.filter(p =>
        (p.full_name?.toLowerCase() || '').includes(searchOwner.toLowerCase()) ||
        (p.email?.toLowerCase() || '').includes(searchOwner.toLowerCase())
    )

    const filteredStages = (stages || []).filter(s =>
        s.nome.toLowerCase().includes(searchStage.toLowerCase())
    )

    const STATUS_OPTIONS = [
        { value: 'aberto', label: 'Aberto', color: 'bg-blue-100 text-blue-700' },
        { value: 'ganho', label: 'Ganho', color: 'bg-green-100 text-green-700' },
        { value: 'perdido', label: 'Perdido', color: 'bg-red-100 text-red-700' }
    ]

    const PRIORIDADE_OPTIONS = [
        { value: 'alta', label: 'Alta', color: 'bg-red-100 text-red-700' },
        { value: 'media', label: 'Média', color: 'bg-yellow-100 text-yellow-700' },
        { value: 'baixa', label: 'Baixa', color: 'bg-green-100 text-green-700' }
    ]

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
                            <p className="text-xs text-gray-500">Refine sua busca de leads</p>
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

                        {/* Data de Criação */}
                        <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm space-y-3">
                            <label className="text-sm font-semibold text-gray-700 block">Data de Criação</label>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1">
                                    <span className="text-xs text-gray-500 ml-1">De</span>
                                    <input
                                        type="date"
                                        className="w-full h-10 rounded-lg border-slate-200 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 bg-slate-50 outline-none transition-all px-3"
                                        value={localFilters.creationStartDate || ''}
                                        onChange={(e) => setLocalFilters(prev => ({ ...prev, creationStartDate: e.target.value || undefined }))}
                                    />
                                </div>
                                <div className="space-y-1">
                                    <span className="text-xs text-gray-500 ml-1">Até</span>
                                    <input
                                        type="date"
                                        className="w-full h-10 rounded-lg border-slate-200 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 bg-slate-50 outline-none transition-all px-3"
                                        value={localFilters.creationEndDate || ''}
                                        onChange={(e) => setLocalFilters(prev => ({ ...prev, creationEndDate: e.target.value || undefined }))}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Data da Viagem */}
                        <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm space-y-3">
                            <label className="text-sm font-semibold text-gray-700 block flex items-center gap-2">
                                <MapPin className="h-4 w-4 text-gray-400" />
                                Data da Viagem
                            </label>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1">
                                    <span className="text-xs text-gray-500 ml-1">De</span>
                                    <input
                                        type="date"
                                        className="w-full h-10 rounded-lg border-slate-200 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 bg-slate-50 outline-none transition-all px-3"
                                        value={localFilters.dataViagemStart || ''}
                                        onChange={(e) => setLocalFilters(prev => ({ ...prev, dataViagemStart: e.target.value || undefined }))}
                                    />
                                </div>
                                <div className="space-y-1">
                                    <span className="text-xs text-gray-500 ml-1">Até</span>
                                    <input
                                        type="date"
                                        className="w-full h-10 rounded-lg border-slate-200 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 bg-slate-50 outline-none transition-all px-3"
                                        value={localFilters.dataViagemEnd || ''}
                                        onChange={(e) => setLocalFilters(prev => ({ ...prev, dataViagemEnd: e.target.value || undefined }))}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Section: Pipeline & Stage */}
                    <div className="space-y-4">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 flex items-center gap-2">
                            <Layers className="h-3 w-3" /> Pipeline & Etapa
                        </h3>

                        {/* Pipeline */}
                        {pipelines && pipelines.length > 0 && (
                            <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm space-y-3">
                                <label className="text-sm font-semibold text-gray-700 block">Pipeline</label>
                                <div className="flex flex-wrap gap-2">
                                    {pipelines.map(pipeline => {
                                        const isSelected = (localFilters.pipelineIds || []).includes(pipeline.id)
                                        return (
                                            <button
                                                key={pipeline.id}
                                                onClick={() => toggleSelection('pipelineIds', pipeline.id)}
                                                className={cn(
                                                    "px-3 py-1.5 text-sm font-medium rounded-lg border transition-all",
                                                    isSelected
                                                        ? "bg-primary text-white border-primary shadow-sm"
                                                        : "border-gray-200 text-gray-600 hover:border-primary/50 hover:text-primary bg-white"
                                                )}
                                            >
                                                {pipeline.nome}
                                            </button>
                                        )
                                    })}
                                </div>
                            </div>
                        )}

                        {/* Etapa */}
                        <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm space-y-3">
                            <label className="text-sm font-semibold text-gray-700 block">Etapa</label>
                            <input
                                type="text"
                                placeholder="Buscar etapa..."
                                className="w-full h-10 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all mb-2"
                                value={searchStage}
                                onChange={(e) => setSearchStage(e.target.value)}
                            />
                            <div className="max-h-40 overflow-y-auto border border-gray-100 rounded-lg p-1 space-y-0.5 bg-gray-50/30 custom-scrollbar">
                                {filteredStages.map(stage => {
                                    const isSelected = (localFilters.stageIds || []).includes(stage.id)
                                    return (
                                        <label key={stage.id} className={cn(
                                            "flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors",
                                            isSelected ? "bg-primary/5" : "hover:bg-white"
                                        )}>
                                            <input
                                                type="checkbox"
                                                className="rounded border-gray-300 text-primary focus:ring-primary"
                                                checked={isSelected}
                                                onChange={() => toggleSelection('stageIds', stage.id)}
                                            />
                                            <div
                                                className="w-2 h-2 rounded-full"
                                                style={{ backgroundColor: stage.cor || '#6b7280' }}
                                            />
                                            <span className={cn("text-sm", isSelected ? "font-medium text-primary-dark" : "text-gray-700")}>
                                                {stage.nome}
                                            </span>
                                        </label>
                                    )
                                })}
                            </div>
                        </div>
                    </div>

                    {/* Section: People */}
                    <div className="space-y-4">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 flex items-center gap-2">
                            <User className="h-3 w-3" /> Responsável
                        </h3>

                        <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm space-y-3">
                            <label className="text-sm font-semibold text-gray-700 block">Responsável Atual</label>
                            <input
                                type="text"
                                placeholder="Buscar usuário..."
                                className="w-full h-10 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all mb-2"
                                value={searchOwner}
                                onChange={(e) => setSearchOwner(e.target.value)}
                            />
                            <div className="max-h-40 overflow-y-auto border border-gray-100 rounded-lg p-1 space-y-0.5 bg-gray-50/30 custom-scrollbar">
                                {filteredOwners.map(profile => {
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
                    </div>

                    {/* Section: Financial */}
                    <div className="space-y-4">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 flex items-center gap-2">
                            <DollarSign className="h-3 w-3" /> Valor Estimado
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
                                            value={localFilters.valorMin ?? ''}
                                            onChange={(e) => setLocalFilters(prev => ({ ...prev, valorMin: e.target.value ? Number(e.target.value) : undefined }))}
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
                                            value={localFilters.valorMax ?? ''}
                                            onChange={(e) => setLocalFilters(prev => ({ ...prev, valorMax: e.target.value ? Number(e.target.value) : undefined }))}
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Section: Engagement */}
                    <div className="space-y-4">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 flex items-center gap-2">
                            <Clock className="h-3 w-3" /> Engajamento
                        </h3>
                        <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm space-y-3">
                            <label className="text-sm font-semibold text-gray-700 block">Dias sem Contato</label>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1">
                                    <span className="text-xs text-gray-500 ml-1">Mínimo</span>
                                    <input
                                        type="number"
                                        min="0"
                                        className="w-full h-10 rounded-lg border-slate-200 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 bg-slate-50 outline-none transition-all px-3"
                                        value={localFilters.diasSemContatoMin ?? ''}
                                        onChange={(e) => setLocalFilters(prev => ({ ...prev, diasSemContatoMin: e.target.value ? Number(e.target.value) : undefined }))}
                                    />
                                </div>
                                <div className="space-y-1">
                                    <span className="text-xs text-gray-500 ml-1">Máximo</span>
                                    <input
                                        type="number"
                                        min="0"
                                        className="w-full h-10 rounded-lg border-slate-200 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 bg-slate-50 outline-none transition-all px-3"
                                        value={localFilters.diasSemContatoMax ?? ''}
                                        onChange={(e) => setLocalFilters(prev => ({ ...prev, diasSemContatoMax: e.target.value ? Number(e.target.value) : undefined }))}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Section: Status */}
                    <div className="space-y-4">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 flex items-center gap-2">
                            Status & Prioridade
                        </h3>

                        {/* Status Comercial */}
                        <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm space-y-3">
                            <label className="text-sm font-semibold text-gray-700 block">Status Comercial</label>
                            <div className="flex flex-wrap gap-2">
                                {STATUS_OPTIONS.map(status => {
                                    const isSelected = (localFilters.statusComercial || []).includes(status.value)
                                    return (
                                        <button
                                            key={status.value}
                                            onClick={() => toggleSelection('statusComercial', status.value)}
                                            className={cn(
                                                "px-3 py-1.5 text-sm font-medium rounded-lg border transition-all",
                                                isSelected
                                                    ? status.color + " border-transparent shadow-sm"
                                                    : "border-gray-200 text-gray-600 hover:border-gray-300 bg-white"
                                            )}
                                        >
                                            {status.label}
                                        </button>
                                    )
                                })}
                            </div>
                        </div>

                        {/* Prioridade */}
                        <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm space-y-3">
                            <label className="text-sm font-semibold text-gray-700 block">Prioridade</label>
                            <div className="flex flex-wrap gap-2">
                                {PRIORIDADE_OPTIONS.map(prio => {
                                    const isSelected = (localFilters.prioridade || []).includes(prio.value)
                                    return (
                                        <button
                                            key={prio.value}
                                            onClick={() => toggleSelection('prioridade', prio.value)}
                                            className={cn(
                                                "px-3 py-1.5 text-sm font-medium rounded-lg border transition-all",
                                                isSelected
                                                    ? prio.color + " border-transparent shadow-sm"
                                                    : "border-gray-200 text-gray-600 hover:border-gray-300 bg-white"
                                            )}
                                        >
                                            {prio.label}
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

                    {/* Section: Tags */}
                    {availableTags.length > 0 && (
                        <div className="space-y-4">
                            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 flex items-center gap-2">
                                <Tag className="h-3 w-3" /> Tags
                            </h3>
                            <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
                                <div className="flex flex-wrap gap-2">
                                    <button
                                        onClick={toggleNoTag}
                                        className={cn(
                                            "inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full border transition-all",
                                            localFilters.noTag
                                                ? "bg-slate-200 text-slate-800 border-slate-400"
                                                : "bg-white text-gray-500 border-gray-200 hover:border-gray-300"
                                        )}
                                    >
                                        <span className="w-2 h-2 rounded-full shrink-0 bg-slate-400" />
                                        Sem tag
                                    </button>
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
