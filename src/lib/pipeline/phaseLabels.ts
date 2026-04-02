import type { PipelinePhase } from '@/types/pipeline'
import { SystemPhase } from '@/types/pipeline'

// Fallbacks caso os dados do banco ainda não tenham carregado
const PHASE_FALLBACKS: Record<string, string> = {
    [SystemPhase.SDR]: 'SDR',
    [SystemPhase.PLANNER]: 'Planner',
    [SystemPhase.POS_VENDA]: 'Pós-Venda',
    [SystemPhase.RESOLUCAO]: 'Resolução',
}

// Fallback owner field mapping used when phase capabilities aren't in DB yet
const PHASE_OWNER_FIELD_FALLBACK: Record<string, string> = {
    [SystemPhase.SDR]: 'sdr_owner_id',
    [SystemPhase.PLANNER]: 'vendas_owner_id',
    [SystemPhase.POS_VENDA]: 'pos_owner_id',
    [SystemPhase.RESOLUCAO]: 'pos_owner_id',
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
    phase_slug?: string | null
    fase?: string | null
}): boolean {
    // Usa phase_slug (invariante) quando disponível, senão fallback para fase (legado)
    const isInPosVenda = card.phase_slug
        ? card.phase_slug === SystemPhase.POS_VENDA
        : card.fase === 'Pós-venda'
    return card.ganho_planner === true && card.ganho_pos !== true && !isInPosVenda
}

/**
 * Retorna o campo de owner no banco correspondente a uma fase.
 * Lê owner_field do banco (phase capabilities) quando disponível;
 * caso contrário usa fallback estático por slug.
 */
export function getPhaseOwnerField(
    slug: string,
    phases?: PipelinePhase[] | null
): 'sdr_owner_id' | 'vendas_owner_id' | 'pos_owner_id' | null {
    // Try dynamic: use owner_field from DB phase capabilities
    if (phases) {
        const phase = phases.find(p => p.slug === slug)
        const ownerField = (phase as unknown as Record<string, unknown>)?.owner_field as string | null
        if (ownerField) return ownerField as 'sdr_owner_id' | 'vendas_owner_id' | 'pos_owner_id'
    }
    // Fallback: static mapping by well-known slugs
    return (PHASE_OWNER_FIELD_FALLBACK[slug] ?? null) as 'sdr_owner_id' | 'vendas_owner_id' | 'pos_owner_id' | null
}

// Maps owner field → card name field for display
const OWNER_FIELD_TO_NAME_FIELD: Record<string, keyof {
    sdr_owner_nome?: string | null
    sdr_nome?: string | null
    vendas_nome?: string | null
    pos_owner_nome?: string | null
    dono_atual_nome?: string | null
}> = {
    sdr_owner_id: 'sdr_owner_nome',
    vendas_owner_id: 'vendas_nome',
    pos_owner_id: 'pos_owner_nome',
}

/**
 * Retorna o nome do owner correspondente à fase do card.
 * Cada fase tem seu próprio campo de owner — ex: se o card está em pós-venda,
 * mostra o nome do pos_owner, não do dono_atual.
 *
 * Aceita `phases` opcionalmente para usar owner_field das capabilities do banco
 * em vez de comparações hardcoded de slug.
 */
export function getPhaseOwnerName(
    card: {
        sdr_owner_nome?: string | null
        sdr_nome?: string | null
        vendas_nome?: string | null
        pos_owner_nome?: string | null
        dono_atual_nome?: string | null
    },
    phaseSlug: string | null | undefined,
    phases?: PipelinePhase[] | null
): string | null {
    // Try dynamic: resolve name field via owner_field from DB capabilities
    if (phases && phaseSlug) {
        const phase = phases.find(p => p.slug === phaseSlug)
        const ownerField = (phase as unknown as Record<string, unknown>)?.owner_field as string | null
        if (ownerField) {
            const nameField = OWNER_FIELD_TO_NAME_FIELD[ownerField]
            if (nameField) return (card[nameField] as string | null | undefined) ?? card.dono_atual_nome ?? null
        }
    }
    // Fallback: static slug-based mapping
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
