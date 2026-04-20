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
export function getPhaseLabel(phases: PipelinePhase[] | undefined | null, slug: string | null | undefined): string {
    if (!slug) return 'Outros'
    const phase = phases?.find(p => p.slug === slug)
    return phase?.label || phase?.name || PHASE_FALLBACKS[slug] || slug
}

/**
 * Label para agrupar um profile na UI a partir do slug da fase do time.
 * Usa phase.label/phase.name do banco; fallback para team_name; fallback para 'Outros'.
 */
export function getProfileGroupLabel(
    phases: PipelinePhase[] | undefined | null,
    phaseSlug: string | null | undefined,
    teamName?: string | null
): string {
    if (!phaseSlug) return teamName || 'Outros'
    const phase = phases?.find(p => p.slug === phaseSlug)
    return phase?.label || phase?.name || teamName || PHASE_FALLBACKS[phaseSlug] || phaseSlug
}

// Tokens de cor Tailwind por slug canônico.
// Maps indexados por name/label PT quebram quando admin renomeia a fase.
export interface PhaseColorTokens {
    bg: string
    border: string
    text: string
    activeBg: string
    dot: string
    hex: string
}

export const PHASE_DEFAULT_COLOR: PhaseColorTokens = {
    bg: 'bg-slate-50',
    border: 'border-slate-200',
    text: 'text-slate-700',
    activeBg: 'bg-slate-100',
    dot: 'bg-slate-400',
    hex: '#64748b',
}

export const PHASE_SLUG_COLORS: Record<string, PhaseColorTokens> = {
    [SystemPhase.SDR]: {
        bg: 'bg-blue-50',
        border: 'border-blue-200',
        text: 'text-blue-700',
        activeBg: 'bg-blue-100',
        dot: 'bg-blue-400',
        hex: '#3b82f6',
    },
    [SystemPhase.PLANNER]: {
        bg: 'bg-purple-50',
        border: 'border-purple-200',
        text: 'text-purple-700',
        activeBg: 'bg-purple-100',
        dot: 'bg-violet-400',
        hex: '#8b5cf6',
    },
    [SystemPhase.POS_VENDA]: {
        bg: 'bg-emerald-50',
        border: 'border-emerald-200',
        text: 'text-emerald-700',
        activeBg: 'bg-emerald-100',
        dot: 'bg-green-400',
        hex: '#10b981',
    },
    [SystemPhase.RESOLUCAO]: PHASE_DEFAULT_COLOR,
}

/**
 * Retorna tokens de cor Tailwind para uma fase, indexado por slug.
 * Fallback para cor neutra slate quando slug é desconhecido.
 */
export function getPhaseColor(slug: string | null | undefined): PhaseColorTokens {
    if (!slug) return PHASE_DEFAULT_COLOR
    return PHASE_SLUG_COLORS[slug] || PHASE_DEFAULT_COLOR
}

/**
 * Retorna true se a fase é terminal (resolução/fechamento). Prefere `phase.is_terminal_phase`
 * do banco; fallback para slug canônico RESOLUCAO.
 */
export function isTerminalPhase(phase: { is_terminal_phase?: boolean | null; slug?: string | null } | null | undefined): boolean {
    if (!phase) return false
    if (phase.is_terminal_phase === true) return true
    return phase.slug === SystemPhase.RESOLUCAO
}

/**
 * Legado: converte `cards.fase` (coluna PT) para slug canônico.
 * Usar apenas quando `phase_slug` não estiver disponível no payload.
 * Em orgs com nomes de fase diferentes retorna null — a UI deve cair em cor neutra.
 */
export function legacyFaseToSlug(fase: string | null | undefined): string | null {
    if (!fase) return null
    const f = fase.toLowerCase()
    if (f === 'sdr' || f.includes('pré-venda') || f.includes('pre-venda')) return SystemPhase.SDR
    if (f === 'planner' || f.includes('venda') && !f.includes('pós') && !f.includes('pos')) return SystemPhase.PLANNER
    if (f.includes('pós') || f.includes('pos')) return SystemPhase.POS_VENDA
    if (f.includes('resol')) return SystemPhase.RESOLUCAO
    return null
}

/**
 * Gera classes Tailwind compostas (bg+text+border) a partir do slug da fase.
 * Facilita uso em badges dos cards.
 */
export function getPhaseBadgeClass(slug: string | null | undefined): string {
    const c = getPhaseColor(slug)
    return `${c.activeBg} ${c.text} ${c.border}`
}

/**
 * Abreviatura curta (até 4 chars) para badges compactos. Escolhe a primeira palavra
 * com 3+ letras — evita abreviações ruins vindas de "T. Planner" ou "SDR (Pré-Venda)".
 * Exemplos:
 *   "SDR" → "SDR"
 *   "SDR (Pré-Venda)" → "SDR"
 *   "T. Planner" → "PLAN"
 *   "Pós-Venda" → "PÓS"
 *   "Planejamento" → "PLAN"
 *   "Entrega" → "ENTR"
 */
export function getPhaseAbbr(label: string | null | undefined): string {
    if (!label) return ''
    const words = label
        .replace(/[()]/g, '')
        .split(/[\s.-]+/)
        .filter(w => w.length >= 3)
    const pick = words[0] || label
    return pick.slice(0, 4).toUpperCase()
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
