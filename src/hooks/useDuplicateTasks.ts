import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useOrg } from '../contexts/OrgContext'
import type { TaskScopeFilter, TaskOrigemFilter } from './useTaskFilters'

export type DuplicateTier = 'exact' | 'possible' | 'fuzzy' | 'chain'

export interface DuplicateTaskItem {
    id: string
    titulo: string
    created_at: string
    data_vencimento: string | null
    responsavel_id: string | null
    concluida: boolean
    status: string | null
    origem: TaskOrigemFilter
}

export interface DuplicateTaskGroup {
    /** Confiança da deteção */
    tier: DuplicateTier
    /** Explicação humana ("Mesmo passo de cadência re-disparado", etc.) */
    reason: string
    similarity_score: number

    /** Card / viagem */
    card_id: string
    card_titulo: string | null
    card_produto: string | null
    card_stage_nome: string | null
    contato_nome: string | null

    /** Assinatura do grupo */
    tipo: string
    titulos_distintos: string[]
    titulo_exemplo: string | null
    qtd: number

    items: DuplicateTaskItem[]
}

interface RawRow {
    tier: DuplicateTier
    reason: string
    card_id: string
    card_titulo: string | null
    card_produto: string | null
    card_stage_nome: string | null
    contato_nome: string | null
    tipo: string
    titulos_distintos: string[]
    titulo_exemplo: string | null
    task_ids: string[]
    created_ats: string[]
    data_vencimentos: (string | null)[]
    responsavel_ids: (string | null)[]
    concluidas: boolean[]
    statuses: (string | null)[]
    titulos: string[]
    metadatas: (Record<string, unknown> | null)[]
    qtd: number
    similarity_score: number
}

function deriveOrigem(metadata: Record<string, unknown> | null): TaskOrigemFilter {
    if (!metadata) return 'manual'
    if (metadata.cadence_instance_id || metadata.cadence_step_id || metadata.origin === 'cadence') return 'cadencia'
    if (metadata.automation_rule_id || metadata.origin === 'automation') return 'automacao'
    if (metadata.external_source || metadata.origin === 'integration') return 'integracao'
    return 'manual'
}

interface UseDuplicateTasksParams {
    scope: TaskScopeFilter
    enabled?: boolean
}

export function useDuplicateTasks({ scope, enabled = true }: UseDuplicateTasksParams) {
    const { profile } = useAuth()
    const { org } = useOrg()
    const orgId = org?.id

    return useQuery({
        queryKey: ['duplicate-tasks', orgId, scope, profile?.id],
        enabled: enabled && !!profile?.id && !!orgId,
        queryFn: async (): Promise<DuplicateTaskGroup[]> => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data, error } = await (supabase.rpc as any)('find_duplicate_tasks_tiered', {
                p_scope: scope,
                p_user_id: profile?.id || null,
            })
            if (error) throw error

            const rows = (data || []) as unknown as RawRow[]

            return rows.map((r) => ({
                tier: r.tier,
                reason: r.reason,
                similarity_score: Number(r.similarity_score) || 1,
                card_id: r.card_id,
                card_titulo: r.card_titulo,
                card_produto: r.card_produto,
                card_stage_nome: r.card_stage_nome,
                contato_nome: r.contato_nome,
                tipo: r.tipo,
                titulos_distintos: r.titulos_distintos || [],
                titulo_exemplo: r.titulo_exemplo,
                qtd: Number(r.qtd),
                items: r.task_ids.map((id, i) => ({
                    id,
                    titulo: r.titulos[i] || '',
                    created_at: r.created_ats[i],
                    data_vencimento: r.data_vencimentos[i] || null,
                    responsavel_id: r.responsavel_ids[i] || null,
                    concluida: r.concluidas[i],
                    status: r.statuses[i] || null,
                    origem: deriveOrigem(r.metadatas[i]),
                })),
            }))
        },
        staleTime: 30_000,
    })
}
