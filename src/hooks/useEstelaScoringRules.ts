import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

export const ESTELA_AGENT_ID = '43180319-650c-490a-87be-f275550285f8'
export const WEDDINGS_ORG_ID = 'b0000000-0000-0000-0000-000000000002'

export type ScoringRule = {
    id: string
    dimension: string
    label: string | null
    rule_type: 'qualify' | 'disqualify' | 'bonus'
    condition_type: 'equals' | 'range' | 'boolean_true' | 'ai_subjective'
    condition_value: Record<string, unknown>
    weight: number
    exclusion_group: string | null
    ordem: number
    ativa: boolean
}

export type ScoringConfig = {
    enabled: boolean
    threshold_qualify: number
    max_sinal_bonus: number
    fallback_action: string | null
}

export type EstelaScoringData = {
    rules: ScoringRule[]
    config: ScoringConfig
    rulesVersion: string
}

// Cast pra contornar tipos defasados — database.types.ts (CLI 2.74) ainda não tem
// sdr_compute_rules_version nem exclusion_group. Chamada inline preserva `this` do client.

async function fetchEstelaScoring(agentId: string): Promise<EstelaScoringData> {
    const [rulesRes, configRes, versionRes] = await Promise.all([
        supabase
            .from('ai_agent_scoring_rules')
            .select('id, dimension, label, rule_type, condition_type, condition_value, weight, exclusion_group, ordem, ativa')
            .eq('agent_id', agentId)
            .eq('ativa', true)
            .order('rule_type')
            .order('ordem'),
        supabase
            .from('ai_agent_scoring_config')
            .select('enabled, threshold_qualify, max_sinal_bonus, fallback_action')
            .eq('agent_id', agentId)
            .maybeSingle(),
        supabase.rpc('sdr_compute_rules_version', { p_agent_id: agentId }) as unknown as Promise<{ data: unknown; error: { message: string } | null }>,
    ])

    if (rulesRes.error) throw rulesRes.error
    if (configRes.error) throw configRes.error
    if (versionRes.error) throw versionRes.error

    const config: ScoringConfig = configRes.data
        ? {
              enabled: configRes.data.enabled ?? false,
              threshold_qualify: Number(configRes.data.threshold_qualify ?? 25),
              max_sinal_bonus: Number(configRes.data.max_sinal_bonus ?? 10),
              fallback_action: configRes.data.fallback_action ?? null,
          }
        : { enabled: false, threshold_qualify: 25, max_sinal_bonus: 10, fallback_action: null }

    return {
        rules: ((rulesRes.data ?? []) as unknown) as ScoringRule[],
        config,
        rulesVersion: (versionRes.data as unknown as string) ?? '',
    }
}

/**
 * Lê regras e config da Estela (read-only). Cache 5min.
 * Tabelas ai_agent_scoring_rules / ai_agent_scoring_config — NUNCA são modificadas
 * por esta feature; apenas consultadas pra renderizar o formulário.
 */
export function useEstelaScoringRules(agentId: string = ESTELA_AGENT_ID) {
    return useQuery({
        queryKey: ['estela-scoring-rules', agentId],
        queryFn: () => fetchEstelaScoring(agentId),
        staleTime: 5 * 60 * 1000,
    })
}
