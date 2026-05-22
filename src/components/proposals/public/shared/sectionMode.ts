/**
 * Resolve o modo de seleção EFETIVO da seção.
 *
 * Lê `proposal_sections.config.selection_mode` quando o consultor configurou
 * explicitamente. Senão usa fallback automático compatível com o comportamento
 * antigo (≥2 items = escolher 1 obrigatório; 1 item = tudo incluído).
 */
import type { SectionSelectionMode } from '@/types/proposals'

export interface SectionShape {
    items?: unknown[]
    // Aceita qualquer tipo (Json/null/objeto) — fazemos narrow internamente.
    config?: unknown
}

export type EffectiveMode = Exclude<SectionSelectionMode, 'auto'>

export function resolveSelectionMode(section: SectionShape): EffectiveMode {
    const cfg = section.config
    const configured =
        cfg && typeof cfg === 'object' && !Array.isArray(cfg)
            ? (cfg as { selection_mode?: SectionSelectionMode }).selection_mode
            : undefined
    if (configured && configured !== 'auto') return configured

    // Fallback automático: replica o comportamento histórico
    const count = section.items?.length ?? 0
    return count >= 2 ? 'pick_one_required' : 'all_included'
}

export const SELECTION_MODE_LABELS: Record<SectionSelectionMode, string> = {
    auto: 'Automático',
    pick_one_required: 'Escolha 1 (obrigatório)',
    pick_one_or_more: 'Pelo menos 1 (vários)',
    pick_any_optional: 'Escolha quantos quiser',
    all_included: 'Todos incluídos (sem escolha)',
}

export const SELECTION_MODE_DESCRIPTIONS: Record<SectionSelectionMode, string> = {
    auto: 'O sistema decide: 1 item = incluído, 2+ = cliente escolhe 1.',
    pick_one_required: 'Cliente vê opções como radio. Precisa escolher exatamente 1 para aceitar.',
    pick_one_or_more: 'Cliente vê opções como checkbox. Precisa escolher 1+ para aceitar.',
    pick_any_optional: 'Cliente vê opções como checkbox. Pode adicionar/remover livremente.',
    all_included: 'Todos os itens fazem parte da proposta — cliente não tem o que escolher.',
}
