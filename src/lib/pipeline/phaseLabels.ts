import type { PipelinePhase } from '@/types/pipeline'
import { SystemPhase } from '@/types/pipeline'

// Fallbacks caso os dados do banco ainda não tenham carregado
const PHASE_FALLBACKS: Record<string, string> = {
    [SystemPhase.SDR]: 'SDR',
    [SystemPhase.PLANNER]: 'Planner',
    [SystemPhase.POS_VENDA]: 'Pós-Venda',
    [SystemPhase.RESOLUCAO]: 'Resolução',
}

/**
 * Retorna o label de exibição de uma fase a partir do slug.
 * Busca primeiro em `phase.label`, depois `phase.name`, e por último um fallback estático.
 */
export function getPhaseLabel(phases: PipelinePhase[] | undefined | null, slug: string): string {
    const phase = phases?.find(p => p.slug === slug)
    return phase?.label || phase?.name || PHASE_FALLBACKS[slug] || slug
}

const MILESTONE_TO_SLUG: Record<string, string> = {
    ganho_sdr: SystemPhase.SDR,
    ganho_planner: SystemPhase.PLANNER,
    ganho_pos: SystemPhase.POS_VENDA,
}

/**
 * Converte milestoneKey (ex: 'ganho_sdr') → "Marco: {label da fase}"
 */
export function getMilestoneLabel(phases: PipelinePhase[] | undefined | null, milestoneKey: string): string {
    const slug = MILESTONE_TO_SLUG[milestoneKey]
    if (!slug) return milestoneKey
    return `Marco: ${getPhaseLabel(phases, slug)}`
}

/**
 * Detecta se um card é "Ganho Direto" (venda fechada sem passar por pós-venda).
 * Centraliza a lógica antes duplicada em KanbanCard e PipelineListView.
 */
export function isGanhoDireto(card: {
    ganho_planner?: boolean | null
    ganho_pos?: boolean | null
    fase?: string | null
}): boolean {
    return (
        card.ganho_planner === true &&
        card.ganho_pos !== true &&
        card.fase !== 'Pós-venda'
    )
}

/**
 * Retorna o campo de owner no banco correspondente a uma fase.
 */
export function getPhaseOwnerField(slug: string): 'sdr_owner_id' | 'vendas_owner_id' | 'pos_owner_id' | null {
    switch (slug) {
        case SystemPhase.SDR: return 'sdr_owner_id'
        case SystemPhase.PLANNER: return 'vendas_owner_id'
        case SystemPhase.POS_VENDA: return 'pos_owner_id'
        default: return null
    }
}

/**
 * Retorna o nome do owner correspondente à fase do card.
 * Cada fase tem seu próprio campo de owner — ex: se o card está em pós-venda,
 * mostra o nome do pos_owner, não do dono_atual.
 */
export function getPhaseOwnerName(
    card: {
        sdr_owner_nome?: string | null
        sdr_nome?: string | null
        vendas_nome?: string | null
        pos_owner_nome?: string | null
        dono_atual_nome?: string | null
    },
    phaseSlug: string | null | undefined
): string | null {
    switch (phaseSlug) {
        case SystemPhase.SDR:
            return card.sdr_owner_nome ?? card.sdr_nome ?? null
        case SystemPhase.PLANNER:
            return card.vendas_nome ?? null
        case SystemPhase.POS_VENDA:
        case SystemPhase.RESOLUCAO:
            return card.pos_owner_nome ?? null
        default:
            return card.dono_atual_nome ?? null
    }
}
