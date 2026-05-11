import type { FilterState } from '../hooks/usePipelineFilters'
import type { SubView } from '../hooks/usePipelineFilters'

/** Campos de pessoa que sao limpos ao mudar de escopo */
const PERSON_FIELDS: (keyof FilterState)[] = [
    'ownerIds', 'sdrIds', 'plannerIds', 'posIds',
]

const PERSON_AND_ORG_FIELDS: (keyof FilterState)[] = [
    ...PERSON_FIELDS, 'teamIds', 'departmentIds',
]

interface CascadeResult {
    filters: FilterState
    cleared: string[]
}

/**
 * Aplica regras de cascading ao mudar de escopo (subView).
 * Remove filtros de pessoa/org que ficam redundantes no novo escopo.
 */
export function applyScopeCascade(
    currentFilters: FilterState,
    newSubView: SubView,
): CascadeResult {
    const cleared: string[] = []

    const fieldsToClear: (keyof FilterState)[] =
        newSubView === 'MY_QUEUE' ? PERSON_AND_ORG_FIELDS :
        newSubView === 'TEAM_VIEW' ? PERSON_FIELDS :
        [] // ALL, FORECAST, etc. — nao limpa nada

    if (fieldsToClear.length === 0) {
        return { filters: currentFilters, cleared }
    }

    const newFilters = { ...currentFilters }
    for (const field of fieldsToClear) {
        const val = newFilters[field]
        const hasValue = Array.isArray(val) ? val.length > 0 : val != null
        if (hasValue) {
            cleared.push(field)
            delete newFilters[field]
        }
    }

    return { filters: newFilters, cleared }
}

/**
 * Aplica cascading ao ativar quick toggle que conflita com statusComercial.
 * showWonDirect e showClosedCards ambos tornam statusComercial redundante.
 */
export function applyToggleCascade(
    currentFilters: FilterState,
    toggle: 'showWonDirect' | 'showClosedCards',
): CascadeResult {
    const cleared: string[] = []

    if (toggle === 'showWonDirect' || toggle === 'showClosedCards') {
        if (currentFilters.statusComercial?.length) {
            cleared.push('statusComercial')
            const newFilters = { ...currentFilters }
            delete newFilters.statusComercial
            return { filters: newFilters, cleared }
        }
    }

    return { filters: currentFilters, cleared }
}

/** Labels legíveis para filtros limpos (para toasts) */
export const FILTER_LABELS: Record<string, string> = {
    ownerIds: 'Responsáveis',
    sdrIds: 'SDRs',
    plannerIds: 'Planners',
    posIds: 'Pós-Venda',
    teamIds: 'Times',
    departmentIds: 'Macro Áreas',
    statusComercial: 'Status Comercial',
}
