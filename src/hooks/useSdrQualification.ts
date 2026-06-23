import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { ESTELA_AGENT_ID } from './useEstelaScoringRules'

// As RPCs sdr_* foram criadas em 20260512d/e mas o database.types.ts gerado
// via Supabase CLI 2.74 ainda não reflete elas. Usamos `supabase.rpc('nome' as never, args)`
// inline em cada chamada — preserva o `this` interno do client naturalmente.

export type SdrScoreResult = {
    enabled: boolean
    score: number
    threshold: number
    qualificado: boolean
    /** Quando true, a qualificação veio do bypass de indicação (não do score). */
    qualified_by_indicacao?: boolean
    disqualified: boolean
    disqualifiers_hit?: Array<{ dimension: string; label: string; rule_id: string }>
    sinal_bonus_applied: number
    max_sinal_bonus: number
    breakdown?: Array<{
        dimension: string
        label: string
        weight: number
        rule_id: string
        rule_type: string
        source?: string
        /** Grupo exclusivo da regra (ex: 'destino', 'valor_convidado'); null se avulsa. */
        exclusion_group?: string | null
    }>
}

export type DadosLead = {
    /** Nome da pessoa que está do outro lado do telefone (principal). */
    nome_contato?: string
    /** Nome do casal completo, ex: "João e Maria" (opcional, complementar). */
    nome_casal?: string
    nome_parceiro?: string
    telefone?: string
    email?: string
    /** Aceita data ISO (yyyy-mm-dd), mês ISO (yyyy-mm) ou texto humano em PT gerado pelo picker (ex: "Janeiro ou Fevereiro de 2027"). */
    data_casamento?: string
    /** Quando modo é "Mês/Ano" com 1+ meses, lista no formato "YYYY-MM" — usada pra reconstituir chips. */
    data_casamento_meses?: string[]
    /** Quando modo é "Data exata" com 1+ datas, lista no formato "YYYY-MM-DD" — usada pra reconstituir chips. */
    data_casamento_datas?: string[]
    num_convidados?: number
    investimento_total?: number
    destino_desejado?: string
    /** Quando casal pede destino fora do catálogo mas está aberto: qual queria originalmente. */
    destino_outro_queria?: string
    /** Quando casal pede destino fora do catálogo mas está aberto: quais destinos do catálogo aceita. */
    destino_outro_aberto_a?: string
    /** Marca se o lead chegou por indicação. */
    is_indicacao?: boolean
    /** Texto livre com quem indicou (nome de cliente, fornecedor, amigo etc). */
    indicado_por?: string
    observacoes?: string
}

export type SdrQualification = {
    id: string
    org_id: string
    agent_id: string
    rules_version: string | null
    contato_id: string | null
    card_id: string | null
    telefone_normalizado: string | null
    status: 'rascunho' | 'finalizado' | 'descartado'
    dados_lead: DadosLead
    scoring_inputs: Record<string, boolean>
    score_result: SdrScoreResult | Record<string, never>
    sdr_user_id: string
    notas: string | null
    finalized_at: string | null
    version: number
    parent_qualification_id: string | null
    created_at: string
    updated_at: string
}

type IniciarParams = {
    contatoId?: string | null
    cardId?: string | null
    telefone?: string | null
    agentId?: string
}

type IniciarResult = {
    id: string
    rules_version: string
    estela_score_recente: { score: number; turn_at: string } | null
}

export function useIniciarPontuacao() {
    return useMutation({
        mutationFn: async ({ contatoId, cardId, telefone, agentId = ESTELA_AGENT_ID }: IniciarParams) => {
            const { data, error } = await supabase.rpc('sdr_iniciar_pontuacao', {
                p_agent_id: agentId,
                p_contato_id: contatoId ?? undefined,
                p_card_id: cardId ?? undefined,
                p_telefone: telefone ?? undefined,
            })
            if (error) throw error
            return data as unknown as IniciarResult
        },
    })
}

type AtualizarParams = {
    id: string
    dadosLead?: DadosLead | null
    scoringInputs?: Record<string, boolean> | null
    notas?: string | null
}

export function useAtualizarPontuacao() {
    return useMutation({
        mutationFn: async ({ id, dadosLead, scoringInputs, notas }: AtualizarParams) => {
            const { data, error } = await supabase.rpc('sdr_atualizar_pontuacao', {
                p_id: id,
                p_dados_lead: (dadosLead ?? undefined) as never,
                p_scoring_inputs: (scoringInputs ?? undefined) as never,
                p_notas: notas ?? undefined,
            })
            if (error) throw error
            return data as unknown as { id: string; score_result: SdrScoreResult }
        },
    })
}

export function useFinalizarPontuacao() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: async (params: { id: string; notas?: string | null; mergeStrategy?: 'preserve' | 'overwrite' | 'update_if_newer' }) => {
            const { data, error } = await supabase.rpc('sdr_finalizar_pontuacao', {
                p_id: params.id,
                p_notas: params.notas ?? undefined,
                p_merge_strategy: params.mergeStrategy ?? 'preserve',
            })
            if (error) throw error
            return data as unknown as { id: string; status: string; score_result: SdrScoreResult }
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['sdr-qualifications'] })
        },
    })
}

export function useReabrirPontuacao() {
    return useMutation({
        mutationFn: async (id: string) => {
            const { data, error } = await supabase.rpc('sdr_reabrir_pontuacao', { p_id: id })
            if (error) throw error
            return data as unknown as { id: string; version: number }
        },
    })
}

export function useDescartarPontuacao() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: async (id: string) => {
            const { error } = await supabase.rpc('sdr_descartar_pontuacao', { p_id: id })
            if (error) throw error
            return id
        },
        onSuccess: () => qc.invalidateQueries({ queryKey: ['sdr-qualifications'] }),
    })
}

export function useVincularACard() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: async (params: { qualificationId: string; cardId: string }) => {
            const { data, error } = await supabase.rpc('sdr_vincular_a_card', {
                p_qualification_id: params.qualificationId,
                p_card_id: params.cardId,
            })
            if (error) throw error
            return data as unknown as { id: string; card_id: string }
        },
        onSuccess: () => qc.invalidateQueries({ queryKey: ['sdr-qualifications'] }),
    })
}

export function useDesvincularDeCard() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: async (qualificationId: string) => {
            const { data, error } = await supabase.rpc('sdr_desvincular_de_card' as never, ({
                p_qualification_id: qualificationId,
            }) as never)
            if (error) throw error
            return data as unknown as { id: string; card_id: string | null; changed: boolean }
        },
        onSuccess: () => qc.invalidateQueries({ queryKey: ['sdr-qualifications'] }),
    })
}

export function useVoltarParaRascunho() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: async (qualificationId: string) => {
            const { data, error } = await supabase.rpc('sdr_voltar_para_rascunho' as never, ({
                p_qualification_id: qualificationId,
            }) as never)
            if (error) throw error
            return data as unknown as { id: string; status: string; changed: boolean }
        },
        onSuccess: () => qc.invalidateQueries({ queryKey: ['sdr-qualifications'] }),
    })
}

type ObterResult = {
    pontuacao: SdrQualification
    historico_versoes: Array<{
        id: string
        version: number
        status: string
        score: number
        qualificado: boolean
        finalized_at: string | null
        sdr_user_id: string
    }>
    rules_version_atual: string
    score_outdated: boolean
}

export function useObterPontuacao(id: string | null | undefined) {
    return useQuery({
        queryKey: ['sdr-qualification', id],
        queryFn: async () => {
            if (!id) return null
            const { data, error } = await supabase.rpc('sdr_obter_pontuacao', { p_id: id })
            if (error) throw error
            return data as unknown as ObterResult
        },
        enabled: !!id,
    })
}

type ListaFiltros = {
    from?: string
    to?: string
    sdr_user_id?: string
    status?: string
    qualificado?: boolean | null
    only_mine?: boolean
    produto?: string
}

type ListaResult = {
    total: number
    qualificados: number
    descartados: number
    rascunhos: number
    score_medio: number | null
    pontuacoes: Array<{
        id: string
        card_id: string | null
        card_titulo: string | null
        contato_id: string | null
        telefone: string | null
        status: string
        version: number
        dados_lead: DadosLead
        scoring_inputs: Record<string, boolean>
        score_result: SdrScoreResult
        rules_version: string | null
        sdr_user_id: string
        sdr_nome: string | null
        notas: string | null
        finalized_at: string | null
        created_at: string
    }>
}

export function useListarPontuacoes(filtros: ListaFiltros = {}) {
    return useQuery({
        queryKey: ['sdr-qualifications', filtros],
        queryFn: async () => {
            const { data, error } = await supabase.rpc('sdr_listar_pontuacoes', {
                p_filtros: filtros as never,
            })
            if (error) throw error
            return data as unknown as ListaResult
        },
    })
}

/**
 * Orquestra o ciclo completo no Sheet: cria rascunho na abertura OU retoma
 * um rascunho existente (quando initial.qualificationId é passado).
 * Debounce em updates (300ms).
 */
type SessionInitial = IniciarParams & { qualificationId?: string | null }

export function useSdrQualificationSession(initial: SessionInitial) {
    const [qualificationId, setQualificationId] = useState<string | null>(null)
    const [scoreResult, setScoreResult] = useState<SdrScoreResult | null>(null)
    const [scoringInputs, setScoringInputs] = useState<Record<string, boolean>>({})
    const [dadosLead, setDadosLead] = useState<DadosLead>({})
    const [notas, setNotas] = useState('')
    const [dirty, setDirty] = useState(false)
    const [saving, setSaving] = useState(false)
    const [loading, setLoading] = useState(false)
    const [estelaScoreRecente, setEstelaScoreRecente] = useState<IniciarResult['estela_score_recente']>(null)
    const [linkedCardId, setLinkedCardId] = useState<string | null>(null)
    const [linkedContatoId, setLinkedContatoId] = useState<string | null>(null)
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const initialKeyRef = useRef<string>('')

    const iniciar = useIniciarPontuacao()
    const atualizar = useAtualizarPontuacao()

    const initialKey = useMemo(
        () => JSON.stringify({ ...initial }),
        [initial],
    )

    useEffect(() => {
        if (initialKeyRef.current === initialKey) return
        initialKeyRef.current = initialKey
        setQualificationId(null)
        setScoreResult(null)
        setScoringInputs({})
        setDadosLead({})
        setNotas('')
        setDirty(false)
        setEstelaScoreRecente(null)
        setLinkedCardId(initial.cardId ?? null)
        setLinkedContatoId(initial.contatoId ?? null)

        if (initial.qualificationId) {
            // Retomar rascunho existente
            setLoading(true)
            ;(async () => {
                const { data, error } = await (supabase.rpc as unknown as (n: string, a?: unknown) => Promise<{ data: unknown; error: { message: string } | null }>)('sdr_obter_pontuacao', { p_id: initial.qualificationId })
                setLoading(false)
                if (error || !data) return
                const result = data as { pontuacao: SdrQualification }
                const p = result.pontuacao
                setQualificationId(p.id)
                setDadosLead(p.dados_lead || {})
                setScoringInputs(p.scoring_inputs || {})
                setNotas(p.notas || '')
                setLinkedCardId(p.card_id)
                setLinkedContatoId(p.contato_id)
                if (p.score_result && typeof (p.score_result as SdrScoreResult).score === 'number') {
                    setScoreResult(p.score_result as SdrScoreResult)
                }
            })()
        } else {
            // Criar novo rascunho
            iniciar.mutate(initial, {
                onSuccess: (res) => {
                    setQualificationId(res.id)
                    setEstelaScoreRecente(res.estela_score_recente)
                },
            })
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initialKey])

    useEffect(() => {
        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current)
        }
    }, [])

    const flush = useCallback(
        async (overrides?: { inputs?: Record<string, boolean>; dados?: DadosLead; notas?: string | null }) => {
            if (!qualificationId) return
            setSaving(true)
            try {
                const res = await atualizar.mutateAsync({
                    id: qualificationId,
                    scoringInputs: overrides?.inputs ?? scoringInputs,
                    dadosLead: overrides?.dados ?? dadosLead,
                    notas: overrides?.notas ?? notas,
                })
                setScoreResult(res.score_result)
                setDirty(false)
            } finally {
                setSaving(false)
            }
        },
        [qualificationId, atualizar, scoringInputs, dadosLead, notas],
    )

    const scheduleUpdate = useCallback(
        (overrides?: { inputs?: Record<string, boolean>; dados?: DadosLead; notas?: string | null }) => {
            setDirty(true)
            if (debounceRef.current) clearTimeout(debounceRef.current)
            debounceRef.current = setTimeout(() => {
                void flush(overrides)
            }, 300)
        },
        [flush],
    )

    const setInputs = useCallback(
        (next: Record<string, boolean>) => {
            setScoringInputs(next)
            scheduleUpdate({ inputs: next })
        },
        [scheduleUpdate],
    )

    const setDados = useCallback(
        (next: DadosLead) => {
            setDadosLead(next)
            scheduleUpdate({ dados: next })
        },
        [scheduleUpdate],
    )

    const setNotasAndSave = useCallback(
        (next: string) => {
            setNotas(next)
            scheduleUpdate({ notas: next })
        },
        [scheduleUpdate],
    )

    return {
        qualificationId,
        scoreResult,
        scoringInputs,
        dadosLead,
        notas,
        dirty,
        saving,
        starting: iniciar.isPending || loading,
        startError: iniciar.error,
        estelaScoreRecente,
        linkedCardId,
        linkedContatoId,
        setLinkedCardId,
        setLinkedContatoId,
        setInputs,
        setDados,
        setNotas: setNotasAndSave,
        flush,
    }
}
