import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/**
 * Sub-rotina simples do cérebro analítico — toggle + instrução custom.
 * Quando instruction vem vazia, o router usa o default hardcoded.
 */
export interface SimpleRoutine {
  enabled: boolean
  /** Instrução customizada que substitui o default. Pode usar variáveis {curly}/<angle>. */
  instruction: string
}

/**
 * Sub-rotina "Saturação de pitch" — toggle + instrução + params avançados.
 *
 * O router compara o histórico recente do agente com `pitch_keywords` na
 * janela `window_turns`. Se ocorre >= `threshold` vezes → marca saturado.
 */
export interface PitchSaturationRoutine extends SimpleRoutine {
  /** Palavras-chave/frases que contam como "pitch" (ex: "reunião com a Wedding Planner"). */
  pitch_keywords?: string[]
  /** Quantos turnos recentes do agente olhar. Default 5. */
  window_turns?: number
  /** Quantas ocorrências de pitch na janela disparam saturação. Default 2. */
  threshold?: number
}

/**
 * Sub-rotina "Auditoria de viabilidade econômica" — toggle + instrução +
 * params estruturados pra calcular automaticamente:
 *   valor_por_convidado = budget_field / guests_field
 * E classificar em zonas (cada uma com ação sugerida).
 */
export interface ViabilityRoutine extends SimpleRoutine {
  /** Slug do campo do CRM com o orçamento (ex: 'ww_orcamento_faixa'). */
  budget_field?: string
  /** Slug do campo do CRM com o número de convidados (ex: 'ww_num_convidados'). */
  guests_field?: string
  /** Zonas de classificação por valor/convidado em BRL, ordenadas por max ascendente. */
  zones?: Array<{
    /** Teto da zona em R$/convidado. Acima disso, próxima zona. */
    max_per_guest_brl: number
    /** Label curto (ex: 'abaixo_minimo_resistente'). */
    label: string
    /** Ação ou orientação pro agente (ex: 'desfecho_nao_qualificado direto'). */
    action: string
  }>
  /** Cotações pra conversão de moeda estrangeira em runtime (1 EUR = X BRL etc). */
  currency_rates?: Array<{
    from: 'EUR' | 'USD' | 'GBP' | string
    to_brl: number
  }>
}

export interface CognitiveAuditConfig {
  detect_contradictions?: SimpleRoutine
  detect_pending_promises?: SimpleRoutine
  detect_unanswered_questions?: SimpleRoutine
  detect_pitch_saturation?: PitchSaturationRoutine
  audit_viability?: ViabilityRoutine
}

export const ROUTINE_DEFAULTS: Record<
  keyof CognitiveAuditConfig,
  { label: string; description: string; defaultInstruction: string }
> = {
  detect_contradictions: {
    label: 'Detectar contradições do lead',
    description:
      'Compara a última mensagem do lead com tudo que ele disse antes na conversa. Quando há contradição factual relevante (clima vs destino, orçamento vs expectativa, etc.), pede esclarecimento sem acusação.',
    defaultInstruction:
      'Compare a última mensagem do lead com tudo que ele disse antes na MESMA conversa. Se há contradição factual relevante (clima vs destino, orçamento vs expectativa, presença de família, data passada vs futura), registre em `contradicao_detectada` como objeto { campos: [...], descricao: "..." }. Se não há, omita o campo.',
  },
  detect_pending_promises: {
    label: 'Detectar promessas pendentes minhas',
    description:
      'Releia: "fiz alguma promessa que não cumpri?". Se sim, validator bloqueia tentar prometer de novo sem cumprir.',
    defaultInstruction:
      'Identifique a última promessa explícita que você fez e ainda não cumpriu ("vou verificar", "confirmo por email", "vou ver agenda"). Registre em `pendencias_patricia` como string curta. Se não há promessa pendente, omita o campo.',
  },
  detect_unanswered_questions: {
    label: 'Detectar perguntas não respondidas do lead',
    description:
      'Lista até 3 perguntas do lead nos últimos turnos que ainda não foram respondidas. Validator bloqueia se tentar pular.',
    defaultInstruction:
      'Liste até 3 perguntas que o lead fez nos últimos 3 turnos dele que você ainda não respondeu diretamente. Registre em `perguntas_pendentes`.',
  },
  detect_pitch_saturation: {
    label: 'Detectar saturação de pitch',
    description:
      'Conta quantas vezes nos últimos turnos você já ofereceu o pitch principal (reunião, próxima ação). Se ≥ threshold → marca saturado e validator bloqueia nova oferta.',
    defaultInstruction:
      'Releia seus 5 últimos turnos. Conte ocorrências de oferta do pitch principal. Se >= 2, marque `pitch_saturado = true`.',
  },
  audit_viability: {
    label: 'Auditar viabilidade econômica',
    description:
      'Quando tem orçamento + número de convidados, calcula valor/convidado e classifica em zonas (abaixo do mínimo / fronteira / normal). Converte moeda estrangeira antes.',
    defaultInstruction:
      'Quando temos {budget_field} e {guests_field}: converta moeda estrangeira se necessário (cotações configuradas abaixo), calcule valor_por_convidado = orcamento / convidados, e classifique nas zonas configuradas. Use o resultado pra decidir próxima ação.',
  },
}

/**
 * Hook CRUD do cognitive_audit_config (coluna JSONB em ai_agents,
 * adicionada na migration 20260520h).
 */
export function useAgentCognitiveAudit(agentId?: string) {
  const qc = useQueryClient()

  const query = useQuery({
    queryKey: ['agent-cognitive-audit', agentId],
    enabled: !!agentId,
    queryFn: async () => {
      if (!agentId) return null
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('ai_agents')
        .select('cognitive_audit_config')
        .eq('id', agentId)
        .single()
      if (error) throw error
      return (data?.cognitive_audit_config as CognitiveAuditConfig | null) ?? {}
    },
  })

  const save = useMutation({
    mutationFn: async (config: CognitiveAuditConfig) => {
      if (!agentId) throw new Error('agentId required')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('ai_agents')
        .update({ cognitive_audit_config: config })
        .eq('id', agentId)
      if (error) throw error
      return config
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agent-cognitive-audit', agentId] }),
  })

  return { config: query.data ?? {}, isLoading: query.isLoading, save }
}
