import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

/**
 * Pré-checagem antes de mover um sub-card: detecta se a mudança vai
 * disparar o auto-merge no card pai (ver migration 20260424b).
 *
 * Regra do trigger no banco:
 *  - card_type='sub_card' E sub_card_status='active'
 *  - mudança de pipeline_stage_id
 *  - OLD = primeira etapa ativa de pos_venda do pipeline (ex: "App & Conteúdo")
 *  - NEW = outra etapa de pos_venda do mesmo pipeline
 *
 * Quando atende, retorna info do pai pra exibir no modal de confirmação.
 */
export interface AutoMergePreflightInfo {
    willMerge: boolean
    reason?: 'not_sub_card' | 'sub_card_inactive' | 'no_parent' | 'old_not_first_pv' | 'new_not_pv' | 'eligible'
    parent?: {
        id: string
        titulo: string | null
        status_comercial: string
        archived: boolean
        stage_nome: string | null
        phase_slug: string | null
        pessoa_nome: string | null
        valor_final: number | null
        valor_estimado: number | null
        receita: number | null
        data_viagem_inicio: string | null
        data_viagem_fim: string | null
        items_count: number
        will_be_reopened: boolean
        will_be_moved_to_new_stage: boolean
    }
    targetStageNome?: string
}

interface SubCardInput {
    id: string
    card_type?: string | null
    sub_card_status?: string | null
    parent_card_id?: string | null
    pipeline_stage_id?: string | null
    pipeline_id?: string | null
}

/**
 * Função pura (sem hook) — pode ser chamada de event handlers.
 * Detecta se mover esse sub-card para `novaEtapaId` vai disparar o auto-merge.
 *
 * Aceita um SubCardInput parcial (ex: vindo da view view_cards_acoes que não
 * expõe card_type/parent_card_id). Se faltar info, busca direto na tabela cards.
 */
export async function detectAutoMergePreflight(
    subCardOrId: SubCardInput | string | null | undefined,
    novaEtapaId: string | null | undefined,
): Promise<AutoMergePreflightInfo> {
    if (!subCardOrId || !novaEtapaId) return { willMerge: false }

    let subCard: SubCardInput | null = null
    if (typeof subCardOrId === 'string') {
        // Buscar campos diretos da tabela
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data } = await (supabase.from('cards') as any)
            .select('id, card_type, sub_card_status, parent_card_id, pipeline_stage_id, pipeline_id')
            .eq('id', subCardOrId)
            .single()
        if (!data) return { willMerge: false }
        subCard = data as SubCardInput
    } else {
        // Se faltar algum campo, complementar via fetch
        const missing =
            subCardOrId.card_type === undefined ||
            subCardOrId.sub_card_status === undefined ||
            subCardOrId.parent_card_id === undefined ||
            subCardOrId.pipeline_id === undefined ||
            subCardOrId.pipeline_stage_id === undefined
        if (missing) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data } = await (supabase.from('cards') as any)
                .select('id, card_type, sub_card_status, parent_card_id, pipeline_stage_id, pipeline_id')
                .eq('id', subCardOrId.id)
                .single()
            if (!data) return { willMerge: false }
            subCard = data as SubCardInput
        } else {
            subCard = subCardOrId
        }
    }

    if (!subCard?.id) return { willMerge: false }
    if (novaEtapaId === subCard.pipeline_stage_id) return { willMerge: false }

    if (subCard.card_type !== 'sub_card') return { willMerge: false, reason: 'not_sub_card' }
    if (subCard.sub_card_status !== 'active') return { willMerge: false, reason: 'sub_card_inactive' }
    if (!subCard.parent_card_id) return { willMerge: false, reason: 'no_parent' }
    if (!subCard.pipeline_id || !subCard.pipeline_stage_id) return { willMerge: false }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: stages, error } = await (supabase.from('pipeline_stages') as any)
        .select('id, nome, ordem, ativo, phase_id, pipeline_phases!pipeline_stages_phase_id_fkey(slug)')
        .eq('pipeline_id', subCard.pipeline_id)
        .order('ordem', { ascending: true })

    if (error || !stages) return { willMerge: false }

    type StageRow = {
        id: string
        nome: string
        ordem: number
        ativo: boolean
        phase_id: string
        pipeline_phases: { slug: string } | { slug: string }[] | null
    }
    const stageList = stages as StageRow[]

    const phaseSlug = (s: StageRow): string | null => {
        const p = s.pipeline_phases
        if (!p) return null
        if (Array.isArray(p)) return p[0]?.slug ?? null
        return p.slug ?? null
    }

    const oldStage = stageList.find(s => s.id === subCard.pipeline_stage_id)
    const newStage = stageList.find(s => s.id === novaEtapaId)
    if (!oldStage || !newStage) return { willMerge: false }

    const oldSlug = phaseSlug(oldStage)
    const newSlug = phaseSlug(newStage)
    if (oldSlug !== 'pos_venda') return { willMerge: false, reason: 'old_not_first_pv' }
    if (newSlug !== 'pos_venda') return { willMerge: false, reason: 'new_not_pv' }

    const firstPv = stageList
        .filter(s => phaseSlug(s) === 'pos_venda' && s.ativo)
        .sort((a, b) => a.ordem - b.ordem)[0]

    if (!firstPv || firstPv.id !== subCard.pipeline_stage_id) {
        return { willMerge: false, reason: 'old_not_first_pv' }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: parent } = await (supabase.from('cards') as any)
        .select(`
            id, titulo, status_comercial, archived_at, valor_final, valor_estimado, receita,
            data_viagem_inicio, data_viagem_fim, pipeline_stage_id,
            pessoa:contatos!cards_pessoa_principal_id_fkey(nome, sobrenome),
            pipeline_stages!cards_pipeline_stage_id_fkey(nome, pipeline_phases!pipeline_stages_phase_id_fkey(slug))
        `)
        .eq('id', subCard.parent_card_id)
        .single()

    if (!parent) return { willMerge: false }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { count: itemsCount } = await (supabase.from('card_financial_items') as any)
        .select('id', { count: 'exact', head: true })
        .eq('card_id', parent.id)

    const pessoa = parent.pessoa as { nome?: string; sobrenome?: string } | null
    const pessoaNome = pessoa
        ? [pessoa.nome, pessoa.sobrenome].filter(Boolean).join(' ').trim() || null
        : null
    const stageJoin = parent.pipeline_stages as
        | { nome: string; pipeline_phases: { slug: string } | { slug: string }[] | null }
        | null
    const stageNome = stageJoin?.nome ?? null
    const phasesObj = stageJoin?.pipeline_phases
    const parentPhaseSlug = phasesObj
        ? Array.isArray(phasesObj)
            ? phasesObj[0]?.slug ?? null
            : phasesObj.slug ?? null
        : null

    const isReopened =
        parent.status_comercial !== 'aberto' ||
        parentPhaseSlug !== 'pos_venda' ||
        parent.archived_at !== null

    return {
        willMerge: true,
        reason: 'eligible',
        targetStageNome: newStage.nome,
        parent: {
            id: parent.id,
            titulo: parent.titulo,
            status_comercial: parent.status_comercial,
            archived: parent.archived_at !== null,
            stage_nome: stageNome,
            phase_slug: parentPhaseSlug,
            pessoa_nome: pessoaNome,
            valor_final: parent.valor_final,
            valor_estimado: parent.valor_estimado,
            receita: parent.receita,
            data_viagem_inicio: parent.data_viagem_inicio,
            data_viagem_fim: parent.data_viagem_fim,
            items_count: itemsCount ?? 0,
            will_be_reopened: isReopened,
            will_be_moved_to_new_stage: isReopened,
        },
    }
}

export function useAutoMergePreflight(
    subCard: SubCardInput | null | undefined,
    novaEtapaId: string | null | undefined,
) {
    const enabled = !!subCard?.id && !!novaEtapaId && novaEtapaId !== subCard?.pipeline_stage_id

    return useQuery({
        queryKey: ['auto-merge-preflight', subCard?.id, novaEtapaId],
        enabled,
        staleTime: 5_000,
        queryFn: () => detectAutoMergePreflight(subCard, novaEtapaId),
    })
}
