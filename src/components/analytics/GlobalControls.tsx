import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Calendar, ChevronDown, Check, User, Tag } from 'lucide-react'
import { useAnalyticsFilters, type AnalysisMode, type DatePreset, type Granularity } from '@/hooks/analytics/useAnalyticsFilters'
import { usePipelineStages } from '@/hooks/usePipelineStages'
import { usePipelinePhases } from '@/hooks/usePipelinePhases'
import { useCardTags } from '@/hooks/useCardTags'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import {
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'

const presets: { value: DatePreset; label: string }[] = [
    { value: 'this_month', label: 'Este Mês' },
    { value: 'last_month', label: 'Mês Passado' },
    { value: 'last_3_months', label: 'Últimos 3M' },
    { value: 'last_6_months', label: 'Últimos 6M' },
    { value: 'this_year', label: 'Este Ano' },
    { value: 'all_time', label: 'Todo Período' },
]

const granularities: { value: Granularity; label: string }[] = [
    { value: 'day', label: 'Dia' },
    { value: 'week', label: 'Semana' },
    { value: 'month', label: 'Mês' },
]

function useConsultants() {
    return useQuery({
        queryKey: ['analytics', 'consultants-list'],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('profiles')
                .select('id, nome')
                .not('nome', 'is', null)
                .order('nome')
            if (error) throw error
            return data || []
        },
        staleTime: 5 * 60 * 1000,
    })
}

export default function GlobalControls() {
    const {
        datePreset,
        dateRange,
        granularity,
        mode,
        stageId,
        ownerIds,
        tagIds,
        activeView,
        setDatePreset,
        setDateRange,
        setGranularity,
        setModeWithStage,
        setOwnerIds,
        toggleOwnerId,
        setTagIds,
        toggleTagId,
    } = useAnalyticsFilters()

    const isSnapshotView = activeView === 'pipeline'

    const { data: stages } = usePipelineStages()
    const { data: phases } = usePipelinePhases()
    const { data: consultants } = useConsultants()
    const { allTags } = useCardTags()

    // Group stages by phase for the Coorte section (exclude Resolucao)
    const stagesByPhase = useMemo(() => {
        if (!stages || !phases) return []
        const phaseMap = new Map(phases.map(p => [p.id, p]))
        const grouped = new Map<string, { phaseName: string; orderIndex: number; stages: typeof stages }>()

        for (const stage of stages) {
            if (!stage.phase_id) continue
            const phase = phaseMap.get(stage.phase_id)
            if (!phase || phase.slug === 'resolucao') continue

            if (!grouped.has(stage.phase_id)) {
                grouped.set(stage.phase_id, { phaseName: phase.label || phase.name, orderIndex: phase.order_index, stages: [] })
            }
            grouped.get(stage.phase_id)!.stages.push(stage)
        }

        return Array.from(grouped.values()).sort((a, b) => a.orderIndex - b.orderIndex)
    }, [stages, phases])

    // Trigger label based on current mode
    const triggerLabel = useMemo(() => {
        switch (mode) {
            case 'entries': return 'Entradas por Etapa'
            case 'cohort': return 'Coorte: Criação'
            case 'stage_entry':
                if (stageId && stages) {
                    const stage = stages.find(s => s.id === stageId)
                    return `Coorte: ${stage?.nome ?? '...'}`
                }
                return 'Entradas por Etapa'
            case 'ganho_sdr': return 'Ganho SDR'
            case 'ganho_planner': return 'Ganho Planner'
            case 'ganho_total': return 'Ganho Total'
            default: return 'Entradas por Etapa'
        }
    }, [mode, stageId, stages])

    const ownerLabel = useMemo(() => {
        if (ownerIds.length === 0) return 'Todos'
        if (ownerIds.length === 1) {
            const c = consultants?.find(p => p.id === ownerIds[0])
            return c?.nome ?? '...'
        }
        return `${ownerIds.length} selecionados`
    }, [ownerIds, consultants])

    const tagLabel = useMemo(() => {
        if (tagIds.length === 0) return 'Tags'
        if (tagIds.length === 1) {
            const t = allTags.find(t => t.id === tagIds[0])
            return t?.name ?? 'Tag'
        }
        return `${tagIds.length} tags`
    }, [tagIds, allTags])

    const isSelected = (value: string) => {
        if (value === 'entries') return mode === 'entries'
        if (value === 'cohort') return mode === 'cohort'
        if (value === 'ganho_sdr' || value === 'ganho_planner' || value === 'ganho_total') return mode === value
        // UUID = specific stage
        return mode === 'stage_entry' && stageId === value
    }

    const handleSelect = (value: string) => {
        if (value === 'entries' || value === 'cohort' || value === 'ganho_sdr' || value === 'ganho_planner' || value === 'ganho_total') {
            setModeWithStage(value as AnalysisMode, null)
        } else {
            // UUID = stage_entry with specific stage
            setModeWithStage('stage_entry', value)
        }
    }

    return (
        <div className="sticky top-0 z-10 bg-white/80 backdrop-blur-md border-b border-slate-200 px-6 py-3">
            <div className="flex items-center gap-2 min-w-0">
            {/* Left: scrollable controls */}
            <div className="flex items-center gap-3 flex-1 min-w-0 overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none']">
                {isSnapshotView && (
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-indigo-50 border border-indigo-200">
                        <span className="text-xs font-semibold text-indigo-700">Pipeline Atual</span>
                        <span className="text-[10px] text-indigo-500">Snapshot em tempo real</span>
                    </div>
                )}
                {/* Analysis mode dropdown — 3 sections */}
                {!isSnapshotView && <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <button className="inline-flex items-center gap-1.5 h-8 px-3 text-xs font-medium rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition-colors focus:outline-none focus:ring-1 focus:ring-indigo-500">
                            <span className="max-w-[200px] truncate">{triggerLabel}</span>
                            <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-60 max-h-[420px] overflow-y-auto">
                        {/* Section 1: Entradas */}
                        <DropdownMenuItem
                            onClick={() => handleSelect('entries')}
                            className="flex items-center gap-2 text-xs font-medium"
                        >
                            <Check className={cn('w-3.5 h-3.5', isSelected('entries') ? 'opacity-100' : 'opacity-0')} />
                            Entradas por Etapa
                        </DropdownMenuItem>

                        {/* Section 2: Coorte */}
                        <DropdownMenuSeparator />
                        <DropdownMenuLabel className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
                            Coorte (a partir de)
                        </DropdownMenuLabel>
                        <DropdownMenuItem
                            onClick={() => handleSelect('cohort')}
                            className="flex items-center gap-2 text-xs"
                        >
                            <Check className={cn('w-3.5 h-3.5', isSelected('cohort') ? 'opacity-100' : 'opacity-0')} />
                            Criação do Lead
                        </DropdownMenuItem>

                        {stagesByPhase.map((group) => (
                            <div key={group.phaseName}>
                                <div className="px-2 py-1 mt-1">
                                    <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">
                                        {group.phaseName}
                                    </span>
                                </div>
                                {group.stages.map((stage) => (
                                    <DropdownMenuItem
                                        key={stage.id}
                                        onClick={() => handleSelect(stage.id)}
                                        className="flex items-center gap-2 text-xs pl-4"
                                    >
                                        <Check className={cn('w-3.5 h-3.5', isSelected(stage.id) ? 'opacity-100' : 'opacity-0')} />
                                        <span
                                            className="w-2 h-2 rounded-full shrink-0"
                                            style={{ backgroundColor: stage.cor || '#94a3b8' }}
                                        />
                                        {stage.nome}
                                    </DropdownMenuItem>
                                ))}
                            </div>
                        ))}

                        {/* Section 3: Ganho (reverso) */}
                        <DropdownMenuSeparator />
                        <DropdownMenuLabel className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
                            Ganho (reverso)
                        </DropdownMenuLabel>
                        <DropdownMenuItem
                            onClick={() => handleSelect('ganho_sdr')}
                            className="flex items-center gap-2 text-xs"
                        >
                            <Check className={cn('w-3.5 h-3.5', isSelected('ganho_sdr') ? 'opacity-100' : 'opacity-0')} />
                            Ganho SDR
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            onClick={() => handleSelect('ganho_planner')}
                            className="flex items-center gap-2 text-xs"
                        >
                            <Check className={cn('w-3.5 h-3.5', isSelected('ganho_planner') ? 'opacity-100' : 'opacity-0')} />
                            Ganho Planner
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            onClick={() => handleSelect('ganho_total')}
                            className="flex items-center gap-2 text-xs"
                        >
                            <Check className={cn('w-3.5 h-3.5', isSelected('ganho_total') ? 'opacity-100' : 'opacity-0')} />
                            Ganho Total
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>}

                {!isSnapshotView && <>
                {/* Granularity toggle */}
                <div className="flex items-center rounded-lg border border-slate-200 bg-white overflow-hidden">
                    {granularities.map((g) => (
                        <button
                            key={g.value}
                            onClick={() => setGranularity(g.value)}
                            className={cn(
                                'px-3 py-1.5 text-xs font-medium transition-colors',
                                granularity === g.value
                                    ? 'bg-indigo-600 text-white'
                                    : 'text-slate-600 hover:bg-slate-50'
                            )}
                        >
                            {g.label}
                        </button>
                    ))}
                </div>

                {/* Date range inputs */}
                <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-slate-400" />
                    <input
                        type="date"
                        value={dateRange.start.split('T')[0]}
                        onChange={(e) => setDateRange({ ...dateRange, start: e.target.value + 'T00:00:00.000Z' })}
                        className="px-2 py-1.5 text-xs border border-slate-200 rounded-lg bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                    <span className="text-slate-400 text-xs">—</span>
                    <input
                        type="date"
                        value={dateRange.end.split('T')[0]}
                        onChange={(e) => setDateRange({ ...dateRange, end: e.target.value + 'T23:59:59.999Z' })}
                        className="px-2 py-1.5 text-xs border border-slate-200 rounded-lg bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                </div>

                {/* Date presets */}
                <div className="flex items-center gap-1">
                    {presets.map((p) => (
                        <button
                            key={p.value}
                            onClick={() => setDatePreset(p.value)}
                            className={cn(
                                'px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors',
                                datePreset === p.value
                                    ? 'bg-slate-900 text-white'
                                    : 'text-slate-500 hover:bg-slate-100'
                            )}
                        >
                            {p.label}
                        </button>
                    ))}
                </div>
                </>}
            </div>{/* end left scrollable */}

                {/* Right-side filters: Tags + Consultant + Product */}
                <div className="flex items-center gap-2 shrink-0">
                {/* Tag filter (only shown if there are tags) */}
                {allTags.length > 0 && (
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <button className={cn(
                                'inline-flex items-center gap-1.5 h-8 px-3 text-xs font-medium rounded-lg border transition-colors focus:outline-none focus:ring-1 focus:ring-indigo-500',
                                tagIds.length > 0
                                    ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
                                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                            )}>
                                <Tag className="w-3.5 h-3.5 shrink-0" />
                                <span className="max-w-[100px] truncate">{tagLabel}</span>
                                <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-52 max-h-[320px] overflow-y-auto">
                            <div className="flex items-center justify-between px-2 py-1">
                                <DropdownMenuLabel className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold p-0">
                                    Tags
                                </DropdownMenuLabel>
                                {tagIds.length > 0 && (
                                    <button
                                        onClick={(e) => { e.stopPropagation(); setTagIds([]) }}
                                        className="text-[10px] text-indigo-600 hover:text-indigo-800 font-medium"
                                    >
                                        Limpar
                                    </button>
                                )}
                            </div>
                            <DropdownMenuSeparator />
                            {allTags.filter(t => t.is_active).map((tag) => (
                                <DropdownMenuItem
                                    key={tag.id}
                                    onClick={(e) => { e.preventDefault(); toggleTagId(tag.id) }}
                                    className="flex items-center gap-2 text-xs cursor-pointer"
                                >
                                    <div className={cn(
                                        'w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 transition-colors',
                                        tagIds.includes(tag.id)
                                            ? 'border-transparent'
                                            : 'border-slate-300'
                                    )} style={tagIds.includes(tag.id) ? { backgroundColor: tag.color } : {}}>
                                        {tagIds.includes(tag.id) && <Check className="w-2.5 h-2.5 text-white" />}
                                    </div>
                                    <span
                                        className="w-2 h-2 rounded-full shrink-0"
                                        style={{ backgroundColor: tag.color }}
                                    />
                                    {tag.name}
                                </DropdownMenuItem>
                            ))}
                        </DropdownMenuContent>
                    </DropdownMenu>
                )}

                {/* Consultant filter (multi-select) */}
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <button className={cn(
                            'inline-flex items-center gap-1.5 h-8 px-3 text-xs font-medium rounded-lg border transition-colors focus:outline-none focus:ring-1 focus:ring-indigo-500',
                            ownerIds.length > 0
                                ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
                                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                        )}>
                            <User className="w-3.5 h-3.5 shrink-0" />
                            <span className="max-w-[120px] truncate">{ownerLabel}</span>
                            <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-52 max-h-[320px] overflow-y-auto">
                        <div className="flex items-center justify-between px-2 py-1">
                            <DropdownMenuLabel className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold p-0">
                                Consultores
                            </DropdownMenuLabel>
                            {ownerIds.length > 0 && (
                                <button
                                    onClick={(e) => { e.stopPropagation(); setOwnerIds([]) }}
                                    className="text-[10px] text-indigo-600 hover:text-indigo-800 font-medium"
                                >
                                    Limpar
                                </button>
                            )}
                        </div>
                        <DropdownMenuSeparator />
                        {(consultants || []).map((c) => (
                            <DropdownMenuItem
                                key={c.id}
                                onClick={(e) => { e.preventDefault(); toggleOwnerId(c.id) }}
                                className="flex items-center gap-2 text-xs cursor-pointer"
                            >
                                <div className={cn(
                                    'w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 transition-colors',
                                    ownerIds.includes(c.id)
                                        ? 'bg-indigo-600 border-indigo-600'
                                        : 'border-slate-300'
                                )}>
                                    {ownerIds.includes(c.id) && <Check className="w-2.5 h-2.5 text-white" />}
                                </div>
                                {c.nome}
                            </DropdownMenuItem>
                        ))}
                    </DropdownMenuContent>
                </DropdownMenu>

                </div>
            </div>
        </div>
    )
}
