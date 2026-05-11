import { useCallback, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'

export interface ConversationFieldDef {
  field_key: string
  section: string
  field_type: string
  label: string
  prompt_question: string
  prompt_format: string
  allowed_values: string[] | null
}

export interface ConversationViajanteSugerido {
  nome: string
  tipo_vinculo: string | null
  tipo_pessoa: 'adulto' | 'crianca'
  telefone: string | null
  data_nascimento: string | null
  match_type: 'new' | 'existing_phone' | 'existing_fuzzy'
  match_contact_id: string | null
  match_existing_name: string | null
}

export interface ConversationPreview {
  status: 'preview'
  card_id: string
  message_count: number
  campos_card: Record<string, unknown>
  campos_card_atuais: Record<string, unknown>
  contato_principal: Record<string, unknown>
  contato_principal_atual: Record<string, unknown>
  contato_principal_nome_locked: boolean
  viajantes: ConversationViajanteSugerido[]
  viajantes_existentes: Array<{ contato_id: string; nome: string; tipo_vinculo: string | null }>
  field_config: ConversationFieldDef[]
}

export interface CardFieldDecision {
  key: string
  accepted: boolean
  value?: unknown
}

export interface ContactFieldDecision {
  key: string
  accepted: boolean
}

export interface ViajanteDecision {
  index: number
  accepted: boolean
}

export interface ApplyDecisions {
  cardFields: CardFieldDecision[]
  contactFields: ContactFieldDecision[]
  viajantes: ViajanteDecision[]
}

export type ConversationStep = 'idle' | 'extracting' | 'reviewing' | 'applying' | 'done' | 'error'

const DEBOUNCE_MS = 30_000

export function useAIConversationExtraction(cardId: string) {
  const queryClient = useQueryClient()
  const [step, setStep] = useState<ConversationStep>('idle')
  const [preview, setPreview] = useState<ConversationPreview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [lastCallAt, setLastCallAt] = useState<number>(0)

  const extract = useCallback(async () => {
    // Debounce: avisa se operador clicou duas vezes em < 30s
    const sinceLast = Date.now() - lastCallAt
    if (lastCallAt > 0 && sinceLast < DEBOUNCE_MS) {
      const ok = window.confirm(
        `A IA já rodou há ${Math.round(sinceLast / 1000)}s. Quer rodar de novo? (Cada chamada consome tokens.)`
      )
      if (!ok) return
    }
    setLastCallAt(Date.now())
    setStep('extracting')
    setPreview(null)
    setError(null)

    try {
      const { data, error: fnError } = await supabase.functions.invoke('ai-conversation-extraction', {
        body: { card_id: cardId },
      })

      if (fnError) throw fnError
      if (!data) throw new Error('Resposta vazia')

      if (data.status === 'no_messages') {
        setStep('done')
        toast.info('Ainda não há mensagens nessa conversa para a IA analisar.')
        return
      }

      if (data.status !== 'preview') {
        throw new Error(data.error || 'Erro ao extrair conversa')
      }

      // Verifica se há ALGO relevante
      const hasCardFields = Object.keys(data.campos_card || {}).length > 0
      const hasContactFields = Object.keys(data.contato_principal || {}).length > 0
      const hasViajantes = (data.viajantes || []).length > 0

      if (!hasCardFields && !hasContactFields && !hasViajantes) {
        setStep('done')
        toast.info('Julia leu a conversa mas não encontrou nada novo para atualizar.')
        return
      }

      setPreview(data as ConversationPreview)
      setStep('reviewing')
    } catch (err) {
      console.error('[useAIConversationExtraction] extract error:', err)
      setError((err as Error).message)
      setStep('error')
      toast.error('Erro ao processar a conversa com a IA')
    }
  }, [cardId, lastCallAt])

  const apply = useCallback(async (decisions: ApplyDecisions) => {
    if (!preview) return
    setStep('applying')

    try {
      const approvedCardFields = decisions.cardFields.filter((d) => d.accepted)
      const approvedContactFields = decisions.contactFields.filter((d) => d.accepted)
      const approvedViajantes = decisions.viajantes.filter((d) => d.accepted)

      if (approvedCardFields.length === 0 && approvedContactFields.length === 0 && approvedViajantes.length === 0) {
        setStep('done')
        toast.info('Nenhum item selecionado.')
        return
      }

      // Monta produto_data / briefing_inicial considerando as decisões de campo do card
      let produtoDataPayload: Record<string, unknown> | null = null
      let briefingPayload: Record<string, unknown> | null = null

      if (approvedCardFields.length > 0) {
        // Detecta fase do card para rotear (padrão do hook existente: sdr → briefing_inicial, demais → produto_data)
        const { data: cardRow } = await supabase
          .from('cards')
          .select('produto_data, briefing_inicial, pipeline_stage_id')
          .eq('id', cardId)
          .single()

        let fase = 'sdr'
        if (cardRow?.pipeline_stage_id) {
          const { data: stageRow } = await supabase
            .from('pipeline_stages')
            .select('phase_id, pipeline_phases!pipeline_stages_phase_id_fkey(slug)')
            .eq('id', cardRow.pipeline_stage_id)
            .single()
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          fase = (stageRow?.pipeline_phases as any)?.slug || 'sdr'
        }

        const fieldSection: Record<string, string> = {}
        for (const f of preview.field_config || []) {
          fieldSection[f.field_key] = f.section
        }

        const newProdutoData: Record<string, unknown> = {
          ...((cardRow?.produto_data as Record<string, unknown>) || {}),
        }
        const newBriefing: Record<string, unknown> = {
          ...((cardRow?.briefing_inicial as Record<string, unknown>) || {}),
        }

        for (const dec of approvedCardFields) {
          const finalValue = dec.value !== undefined ? dec.value : preview.campos_card[dec.key]
          const section = fieldSection[dec.key] || 'trip_info'

          // Grava em ambos produto_data e briefing_inicial (sincronização bidirecional,
          // mesmo padrão do useAIExtractionReview existente)
          if (section === 'trip_info') {
            newProdutoData[dec.key] = finalValue
            newBriefing[dec.key] = finalValue
          } else {
            // observacoes
            const prodObs = (newProdutoData.observacoes_criticas as Record<string, unknown>) || {}
            prodObs[dec.key] = finalValue
            newProdutoData.observacoes_criticas = prodObs

            const briefObs = (newBriefing.observacoes as Record<string, unknown>) || {}
            briefObs[dec.key] = finalValue
            newBriefing.observacoes = briefObs
          }
          void fase
        }

        produtoDataPayload = newProdutoData
        briefingPayload = newBriefing
      }

      // Monta contato principal aprovado
      let contactFieldsPayload: Record<string, unknown> | null = null
      if (approvedContactFields.length > 0) {
        contactFieldsPayload = {}
        for (const dec of approvedContactFields) {
          const key = dec.key.replace(/^contato_/, '') // contato_nome → nome
          contactFieldsPayload[key] = preview.contato_principal[dec.key]
        }
      }

      // Monta array de viajantes aprovados
      const viajantesPayload = approvedViajantes
        .map((d) => preview.viajantes[d.index])
        .filter(Boolean)

      // Chama wrapper transacional (tipos ainda não regenerados em database.types.ts)
      const { data: result, error: rpcError } = await (
        supabase.rpc as unknown as (
          name: string,
          args: Record<string, unknown>
        ) => Promise<{ data: unknown; error: { message: string } | null }>
      )('apply_ai_conversation_extraction', {
        p_card_id: cardId,
        p_produto_data: produtoDataPayload,
        p_briefing_inicial: briefingPayload,
        p_contact_fields: contactFieldsPayload,
        p_viajantes: viajantesPayload.length > 0 ? viajantesPayload : null,
      })

      if (rpcError) throw rpcError

      const parts: string[] = []
      if (approvedCardFields.length > 0) parts.push(`${approvedCardFields.length} campo${approvedCardFields.length !== 1 ? 's' : ''} da viagem`)
      if (approvedContactFields.length > 0) parts.push('dados do contato')
      if (approvedViajantes.length > 0) parts.push(`${approvedViajantes.length} viajante${approvedViajantes.length !== 1 ? 's' : ''}`)

      toast.success(`Julia atualizou: ${parts.join(' · ')}`)
      void result

      queryClient.invalidateQueries({ queryKey: ['card-detail', cardId] })
      queryClient.invalidateQueries({ queryKey: ['card', cardId] })
      queryClient.invalidateQueries({ queryKey: ['card-people', cardId] })
      queryClient.invalidateQueries({ queryKey: ['activity-feed', cardId] })
      queryClient.invalidateQueries({ queryKey: ['contact'] })

      setStep('done')
    } catch (err) {
      console.error('[useAIConversationExtraction] apply error:', err)
      setError((err as Error).message)
      setStep('error')
      toast.error('Erro ao aplicar as mudanças')
    }
  }, [cardId, preview, queryClient])

  const reset = useCallback(() => {
    setStep('idle')
    setPreview(null)
    setError(null)
  }, [])

  return { step, preview, error, extract, apply, reset }
}
