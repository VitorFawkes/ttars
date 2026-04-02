import { usePipelinePhases } from './usePipelinePhases'

export interface PhaseCapabilities {
    id: string
    slug: string | null
    name: string
    label: string
    color: string
    orderIndex: number
    supportsWin: boolean
    winAction: 'advance_to_next' | 'close_deal' | 'choose' | null
    ownerField: string | null
    ownerLabel: string | null
    accentColor: string | null
    isEntryPhase: boolean
    isTerminalPhase: boolean
}

/**
 * Returns capabilities for a specific phase by slug.
 * Reads from pipeline_phases DB columns instead of hardcoded slug checks.
 *
 * Usage: Replace `if (phaseSlug === 'sdr')` with `if (phase.supportsWin)`
 */
export function usePhaseCapabilities(pipelineId?: string) {
    const { data: phases } = usePipelinePhases(pipelineId)

    const phaseCaps: PhaseCapabilities[] = (phases ?? []).map(p => ({
        id: p.id,
        slug: p.slug,
        name: p.name,
        label: p.label,
        color: p.color,
        orderIndex: p.order_index,
        supportsWin: p.supports_win ?? false,
        winAction: (p.win_action as PhaseCapabilities['winAction']) ?? null,
        ownerField: p.owner_field ?? null,
        ownerLabel: p.owner_label ?? null,
        accentColor: p.accent_color ?? null,
        isEntryPhase: p.is_entry_phase ?? false,
        isTerminalPhase: p.is_terminal_phase ?? false,
    }))

    function getPhase(slug: string): PhaseCapabilities | undefined {
        return phaseCaps.find(p => p.slug === slug)
    }

    function getNextPhase(currentSlug: string): PhaseCapabilities | undefined {
        const current = phaseCaps.find(p => p.slug === currentSlug)
        if (!current) return undefined
        return phaseCaps
            .filter(p => p.orderIndex > current.orderIndex)
            .sort((a, b) => a.orderIndex - b.orderIndex)[0]
    }

    function getEntryPhase(): PhaseCapabilities | undefined {
        return phaseCaps.find(p => p.isEntryPhase) ?? phaseCaps[0]
    }

    function getOwnerPhases(): PhaseCapabilities[] {
        return phaseCaps.filter(p => p.ownerField)
    }

    return {
        phases: phaseCaps,
        getPhase,
        getNextPhase,
        getEntryPhase,
        getOwnerPhases,
    }
}
