import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAgentMoments, type PlaybookMoment } from '@/hooks/v2/playbook/useAgentMoments'
import { useAgentBusinessConfig } from '@/hooks/v2/useAgentBusinessConfig'
import { useAgentKBLinks } from '@/hooks/v2/useAgentKBLinks'
import { useAgentScoring } from '@/hooks/v2/useAgentScoring'
import { useAgentSilentSignals } from '@/hooks/v2/playbook/useAgentSilentSignals'
import { useAgentFewShotExamples } from '@/hooks/v2/playbook/useAgentFewShotExamples'
import { detectMomentAlerts } from '../detectMomentAlerts'
import type { HealthAlert } from './types'

/**
 * Cruza várias fontes de configuração de um agente e retorna alertas de
 * inconsistência detectados — base da aba "Saúde" da redesign UI v3.
 *
 * Princípio: 100% no cliente, lendo dados que outras telas já carregaram
 * (compartilha cache do React Query). Não dispara nenhuma mutation, nenhuma
 * RPC custom, nenhuma migration. Apenas leitura + lógica.
 *
 * Cada check é independente. Se um falhar, os outros continuam.
 *
 * Catálogo de checks atuais:
 *   1. KB vazio + "buscar_kb" ligado            → agente vai improvisar
 *   2. Conflitos por momento (red lines vs anchor)  → usa detectMomentAlerts
 *   3. Plays esperadas faltando                  → fluxos críticos sem cobertura
 *   4. Slots da Sondagem sem pergunta            → IA improvisa
 *   5. system_prompt sem exceção pra mesmo tema  → cortar 2ª pergunta
 *   6. Sinais silenciosos esperados ausentes     → scoring espera mas não há detector
 *   7. Auto-update fields sem form_data_fields   → agente esquece e pergunta de novo
 */

const EXPECTED_PLAYS_KEYS = [
  'objecao_preco',
  'lua_de_mel',
  'destino_fora_catalogo',
  'objecao_preciso_pensar',
  'familia_co_financiadora',
]

interface AgentRow {
  id: string
  nome: string
  system_prompt: string | null
  intelligent_decisions: Record<string, unknown> | null
}

function useAgentRow(agentId?: string) {
  return useQuery<AgentRow | null>({
    queryKey: ['ai-agent-row-for-health', agentId],
    enabled: !!agentId,
    queryFn: async () => {
      if (!agentId) return null
      const { data, error } = await supabase
        .from('ai_agents')
        .select('id, nome, system_prompt, intelligent_decisions')
        .eq('id', agentId)
        .maybeSingle()
      if (error) throw error
      return (data ?? null) as AgentRow | null
    },
  })
}

export function useAgentConfigChecks(agentId?: string): {
  alerts: HealthAlert[]
  isLoading: boolean
  countBySeverity: { blocker: number; warning: number; info: number }
} {
  const agentRowQ = useAgentRow(agentId)
  const { moments, isLoading: momentsLoading } = useAgentMoments(agentId)
  const { config: businessConfig, isLoading: bcLoading } = useAgentBusinessConfig(agentId)
  const { links: kbLinks, isLoading: kbLoading } = useAgentKBLinks(agentId)
  const { config: scoringConfig, rules: scoringRules, isLoading: scoringLoading } = useAgentScoring(agentId)
  const { signals } = useAgentSilentSignals(agentId)
  const { examples: fewShot } = useAgentFewShotExamples(agentId)

  const isLoading =
    agentRowQ.isLoading || momentsLoading || bcLoading || kbLoading || scoringLoading

  const alerts = useMemo<HealthAlert[]>(() => {
    if (isLoading) return []

    const out: HealthAlert[] = []
    const agent = agentRowQ.data

    // ── Check 1: KB vazio + buscar_kb ligado ──
    const id = agent?.intelligent_decisions as Record<string, { enabled?: boolean }> | null
    const buscarKbEnabled = id?.buscar_kb?.enabled === true
    if (buscarKbEnabled && (kbLinks?.length ?? 0) === 0) {
      out.push({
        id: 'kb-empty-but-enabled',
        severity: 'warning',
        category: 'Conhecimento',
        title: 'Knowledge Base vazio',
        detail: 'A decisão "buscar_kb" está LIGADA mas nenhuma base está vinculada. A agente vai improvisar fatos sobre destino, prazo, processo.',
        suggestion: 'Vincule pelo menos uma base com 5-10 itens críticos.',
        navigateTo: 'moments', // não tem aba dedicada hoje, vai pra Conhecimento via decisões
      })
    }

    // ── Check 2: conflitos por momento (red lines vs anchor) ──
    for (const m of moments as PlaybookMoment[]) {
      const momentAlerts = detectMomentAlerts(m)
      for (const a of momentAlerts) {
        out.push({
          id: `moment-${m.id}-${a.id}`,
          severity: a.severity === 'error' ? 'blocker' : 'warning',
          category: m.kind === 'flow' ? 'Roteiro' : 'Jogadas',
          title: `${m.moment_label}: ${a.title}`,
          detail: a.detail,
          suggestion: a.suggestion,
          navigateTo: 'moments',
        })
      }
    }

    // ── Check 3: plays esperadas faltando ──
    const presentKeys = new Set(moments.filter(m => m.kind === 'play').map(m => m.moment_key))
    const missingPlays = EXPECTED_PLAYS_KEYS.filter(k => !presentKeys.has(k))
    if (missingPlays.length > 0 && moments.length > 0) {
      out.push({
        id: 'missing-expected-plays',
        severity: 'info',
        category: 'Jogadas',
        title: `${missingPlays.length} jogadas situacionais comuns ausentes`,
        detail: `Faltam: ${missingPlays.join(', ')}. Se sua agente atende casos como objeção de preço ou lua de mel, recrie elas.`,
        suggestion: 'Use a biblioteca de jogadas pra recriar.',
        navigateTo: 'moments',
      })
    }

    // ── Check 4: system_prompt sem exceção pra mesmo tema ──
    const sp = (agent?.system_prompt ?? '').toLowerCase()
    const hasUmaPerguntaRule = sp.includes('uma pergunta por turno') || sp.includes('uma pergunta só') || sp.includes('uma pergunta so')
    const hasExcecao = sp.includes('exceção') || sp.includes('mesmo tema') || sp.includes('em geral')
    if (hasUmaPerguntaRule && !hasExcecao) {
      out.push({
        id: 'system-prompt-no-exception',
        severity: 'warning',
        category: 'Identidade',
        title: 'Regra "uma pergunta por turno" sem exceção',
        detail: 'O prompt clássico tem regra de uma pergunta por turno mas não abre exceção pra perguntas complementares do mesmo tema. A agente pode cortar a 2ª pergunta da abertura.',
        suggestion: 'Reescreva a regra adicionando exceção pra mesmo tema.',
        navigateTo: 'identity',
      })
    }

    // ── Check 5: sinais silenciosos esperados pelo scoring mas ausentes ──
    if (scoringConfig?.enabled) {
      const signalKeys = new Set(signals.map(s => s.signal_key))
      // dimensão das regras → se aparece em scoring rules mas não tem signal correspondente
      const expectedFromRules: Record<string, string> = {
        viagem_internacional_recente: 'viagem_internacional_recente',
        familia_ajudando: 'familia_co_financiadora',
        sinal_indireto: 'referencia_casamento_premium',
      }
      for (const rule of scoringRules) {
        const expectedSignal = expectedFromRules[rule.dimension]
        if (expectedSignal && !signalKeys.has(expectedSignal)) {
          out.push({
            id: `missing-signal-${expectedSignal}`,
            severity: 'warning',
            category: 'Pontuação',
            title: `Sinal silencioso "${expectedSignal}" não configurado`,
            detail: `A regra de pontuação "${rule.label || rule.dimension}" depende desse sinal pra somar. Sem detector, a regra nunca dispara.`,
            suggestion: 'Configure o sinal silencioso correspondente.',
            navigateTo: 'signals',
          })
        }
      }
    }

    // ── Check 6: slots da Sondagem sem pergunta — agregação dos detectMomentAlerts já cobre via Check 2 ──
    // ── Check 7: auto_update_fields sem form_data_fields correspondente ──
    if (businessConfig) {
      const auto = businessConfig.auto_update_fields ?? []
      const form = businessConfig.form_data_fields ?? []
      const formSet = new Set(form)
      const missingInForm = auto.filter(f => f.startsWith('ww_sdr_') && !formSet.has(f))
      if (missingInForm.length > 0) {
        out.push({
          id: 'auto-update-without-form-data',
          severity: 'warning',
          category: 'Dados',
          title: `${missingInForm.length} ${missingInForm.length > 1 ? 'campos atualizáveis' : 'campo atualizável'} sem leitura`,
          detail: `Esses campos estão em "auto-update" mas não em "form_data_fields": ${missingInForm.join(', ')}. A agente pode esquecer e perguntar de novo no turno seguinte.`,
          suggestion: 'Adicione esses campos em form_data_fields.',
          navigateTo: undefined,
        })
      }
    }

    // ── Check 8: few-shot exemplos vs anchor_text ──
    // Se um exemplo do moment "abertura" tem 0 ou 1 ? mas o anchor tem 2+, conflita
    if (fewShot.length > 0 && moments.length > 0) {
      for (const ex of fewShot) {
        if (!ex.related_moment_key || !ex.enabled) continue
        const related = moments.find(m => m.moment_key === ex.related_moment_key)
        if (!related || !related.anchor_text) continue
        const anchorQ = (related.anchor_text.match(/\?+/g) ?? []).length
        const exQ = (ex.agent_response.match(/\?+/g) ?? []).length
        if (anchorQ >= 2 && exQ < anchorQ) {
          out.push({
            id: `fewshot-question-mismatch-${ex.id}`,
            severity: 'warning',
            category: 'Roteiro',
            title: `Exemplo da fase "${related.moment_label}" tem menos perguntas que o texto âncora`,
            detail: `O texto âncora tem ${anchorQ} perguntas mas o exemplo só ${exQ}. A agente pode aprender pelo exemplo a cortar.`,
            suggestion: 'Atualize o exemplo pra mostrar todas as perguntas.',
            navigateTo: 'examples',
          })
        }
      }
    }

    return out
  }, [
    isLoading,
    agentRowQ.data,
    moments,
    businessConfig,
    kbLinks,
    scoringConfig,
    scoringRules,
    signals,
    fewShot,
  ])

  const countBySeverity = useMemo(
    () => ({
      blocker: alerts.filter(a => a.severity === 'blocker').length,
      warning: alerts.filter(a => a.severity === 'warning').length,
      info: alerts.filter(a => a.severity === 'info').length,
    }),
    [alerts]
  )

  return { alerts, isLoading, countBySeverity }
}
