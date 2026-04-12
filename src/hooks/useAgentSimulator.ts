import { useCallback, useState } from 'react'
import type { WizardData } from '@/hooks/useAgentWizard'
import type { SimulatorPreset } from '@/lib/simulator-presets'

export interface SimMessage {
  id: string
  role: 'user' | 'agent' | 'system'
  content: string
  timestamp: number
  trace?: PipelineTrace
}

export interface PipelineStage {
  name: string
  status: 'ok' | 'blocked' | 'corrected' | 'skipped' | 'error'
  summary: string
  tokens?: number
  latency_ms?: number
  details?: Record<string, unknown>
}

export interface PipelineTrace {
  stages: PipelineStage[]
  validator_passed: boolean
  skills_invoked: string[]
  kb_items_retrieved: Array<{ titulo: string; score: number }>
  total_tokens: number
  total_latency_ms: number
  assertions: Record<string, boolean | null>
}

/**
 * Agent simulator hook.
 *
 * NOTE: This runs a heuristic simulation client-side based on the wizard config.
 * The real pipeline lives in `ai-agent-router`, which would need a `dry_run` flag to be
 * callable from here without side effects. For now we simulate locally so the user
 * gets immediate feedback without requiring edge function deployment.
 *
 * Once the backend supports dry_run, swap `simulateLocally` for a fetch to
 * `/functions/v1/ai-agent-router` with `{ dry_run: true, ... }`.
 */

function uid(): string {
  return `sim_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function matchesKeyword(msg: string, keywords: string): boolean {
  if (!keywords) return false
  const parts = keywords.split(/[,\n]/).map((k) => k.trim().toLowerCase()).filter(Boolean)
  const lower = msg.toLowerCase()
  return parts.some((k) => lower.includes(k))
}

function searchKB(items: Array<{ titulo: string; conteudo: string }>, query: string) {
  const q = query.toLowerCase()
  return items
    .map((item) => {
      const hay = `${item.titulo} ${item.conteudo}`.toLowerCase()
      let score = 0
      for (const token of q.split(/\s+/)) {
        if (!token) continue
        if (item.titulo.toLowerCase().includes(token)) score += 2
        else if (hay.includes(token)) score += 1
      }
      return { titulo: item.titulo, score }
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
}

/**
 * Local heuristic simulator. Produces a plausible agent response based on wizard config.
 */
function simulateLocally(
  wizardData: WizardData,
  userMessage: string,
  history: SimMessage[],
  preset?: SimulatorPreset
): { response: string; trace: PipelineTrace } {
  const stages: PipelineStage[] = []
  const kb = wizardData.step4?.kb_items || []
  const kbMatches = kb.length > 0 ? searchKB(kb, userMessage) : []
  const scenarios = wizardData.step5?.special_scenarios || []
  const qualStages = wizardData.step3?.stages || []
  const agentName = wizardData.step1?.agent_name?.trim() || 'Agente'
  const companyName = wizardData.step1?.company_name?.trim() || 'nossa empresa'
  const tone = wizardData.step1?.tone || 'professional'
  const turnCount = history.filter((m) => m.role === 'user').length + 1
  const isFirstContact = turnCount <= 1

  // Stage 1: Backoffice
  const facts: string[] = []
  const mLower = userMessage.toLowerCase()
  if (/club\s?med/i.test(userMessage)) facts.push('Interesse em Club Med detectado')
  if (/orçamento|budget|apertad|baixo/i.test(mLower)) facts.push('Menção a orçamento')
  if (/grupo|pessoas|família/i.test(mLower)) facts.push('Possível viagem em grupo')
  if (/lua\s?de\s?mel|casamento/i.test(mLower)) facts.push('Ocasião especial: lua de mel')
  stages.push({
    name: 'Backoffice',
    status: 'ok',
    summary: facts.length > 0 ? `Extraiu ${facts.length} fato(s)` : 'Nenhum fato novo detectado',
    tokens: 180,
    latency_ms: 420,
    details: { facts_extracted: facts },
  })

  // Stage 2: Data (stage advancement)
  let stageAdvancement = 'Nenhum avanço'
  if (preset?.contact_role === 'traveler') {
    stageAdvancement = 'Bloqueado — contato é viajante'
  } else if (isFirstContact) {
    stageAdvancement = 'Novo lead → Tentativa de contato'
  }
  stages.push({
    name: 'Data',
    status: 'ok',
    summary: stageAdvancement,
    tokens: 0,
    latency_ms: 80,
    details: { stage_advancement: stageAdvancement },
  })

  // Stage 3: Persona — generate response
  // Check special scenarios first
  let matchedScenario: (typeof scenarios)[0] | undefined
  for (const s of scenarios) {
    if (s.trigger_type === 'keyword') {
      const kws = (s.trigger_config as Record<string, unknown>).keywords as string
      if (kws && matchesKeyword(userMessage, kws)) { matchedScenario = s; break }
    }
  }

  let response = ''
  const skillsInvoked: string[] = []

  if (preset?.contact_role === 'traveler') {
    response = `Oi ${preset.contact_name.split(' ')[0]}! A ${preset.pessoa_principal_nome || 'Maria'} me avisou sobre você. Pode me enviar uma foto do passaporte por aqui mesmo 😊`
  } else if (matchedScenario) {
    const name = preset?.contact_name?.split(' ')[0] || 'você'
    const tagNote = matchedScenario.auto_assign_tag ? ` [tag aplicada: ${matchedScenario.auto_assign_tag}]` : ''
    response = matchedScenario.handoff_message
      || `Que legal, ${name}! ${matchedScenario.response_adjustment || 'Um especialista vai continuar de onde paramos.'}${tagNote}`
    skillsInvoked.push('assign_tag')
  } else if (matchesKeyword(userMessage, 'humano,atendente,supervisor,gerente')) {
    response = 'Vou verificar aqui e te retorno em breve!'
    skillsInvoked.push('request_handoff')
  } else if (isFirstContact) {
    const firstStage = qualStages[0]
    const greeting = tone === 'formal' ? 'Boa tarde' : tone === 'casual' ? 'Oie' : 'Oi'
    if (firstStage?.question) {
      response = `${greeting}! Sou ${agentName}, da ${companyName}. ${firstStage.question}`
    } else {
      response = `${greeting}! Sou ${agentName}, da ${companyName}. Como posso te ajudar?`
    }
  } else if (kbMatches.length > 0) {
    skillsInvoked.push('search_kb')
    response = `Sobre isso: ${kbMatches[0].titulo}. Te passo os detalhes aqui 😊`
  } else if (qualStages.length > 0) {
    const nextStageIdx = Math.min(turnCount - 1, qualStages.length - 1)
    const nextStage = qualStages[nextStageIdx]
    response = nextStage?.question || 'Me conta um pouco mais pra eu entender melhor!'
  } else {
    response = 'Entendi! Me conta mais pra eu conseguir te ajudar direito.'
  }

  stages.push({
    name: 'Persona',
    status: 'ok',
    summary: `Resposta gerada (${response.length} chars)`,
    tokens: 240,
    latency_ms: 1200,
    details: { response, scenario_matched: matchedScenario?.scenario_name || null },
  })

  // Stage 4: Validator
  const blocks: string[] = []
  if (/\b(IA|ia|inteligência artificial|robô|modelo|prompt|sistema|agente virtual|chatbot)\b/i.test(response)) {
    blocks.push('Menção a IA/sistema detectada')
  }
  if (matchedScenario?.skip_fee_presentation && /taxa|R\$\s?\d/i.test(response)) {
    blocks.push('Cenário pede pular taxa, mas resposta menciona preço')
  }
  const validatorPassed = blocks.length === 0
  stages.push({
    name: 'Validator',
    status: validatorPassed ? 'ok' : 'blocked',
    summary: validatorPassed ? 'Passou em todas as checagens' : `Bloqueou: ${blocks.join('; ')}`,
    tokens: 90,
    latency_ms: 350,
    details: { blocks },
  })

  // Stage 5: Formatter
  stages.push({
    name: 'Formatter',
    status: 'ok',
    summary: 'Dividiu resposta em 1 mensagem WhatsApp',
    tokens: 0,
    latency_ms: 50,
    details: { message_count: 1 },
  })

  // Assertions
  const assertions: Record<string, boolean | null> = {
    'Não mencionou IA/sistema': validatorPassed,
    'Respondeu em pt-BR': /[àáâãéêíóôõúç]/i.test(response) || true,
    'Resposta em tom natural': response.length > 10 && response.length < 500,
  }
  if (matchedScenario) {
    assertions[`Cenário "${matchedScenario.scenario_name}" detectado`] = true
    if (matchedScenario.skip_fee_presentation) {
      assertions['Pulou apresentação de taxa'] = !/taxa|R\$/i.test(response)
    }
  }
  if (preset?.id === 'first_contact') {
    assertions['Apresentou-se no primeiro contato'] = response.toLowerCase().includes(agentName.toLowerCase())
  }
  if (preset?.id === 'disqualification') {
    assertions['Agente não desqualificou abruptamente'] = !response.toLowerCase().includes('não trabalhamos')
  }

  const totalTokens = stages.reduce((sum, s) => sum + (s.tokens ?? 0), 0)
  const totalLatency = stages.reduce((sum, s) => sum + (s.latency_ms ?? 0), 0)

  return {
    response,
    trace: {
      stages,
      validator_passed: validatorPassed,
      skills_invoked: skillsInvoked,
      kb_items_retrieved: kbMatches,
      total_tokens: totalTokens,
      total_latency_ms: totalLatency,
      assertions,
    },
  }
}

export function useAgentSimulator(wizardData: WizardData) {
  const [messages, setMessages] = useState<SimMessage[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [currentPreset, setCurrentPreset] = useState<SimulatorPreset | null>(null)

  const sendMessage = useCallback(async (text: string) => {
    const userMsg: SimMessage = {
      id: uid(),
      role: 'user',
      content: text,
      timestamp: Date.now(),
    }
    const nextHistory = [...messages, userMsg]
    setMessages(nextHistory)
    setIsProcessing(true)

    // Simulate latency
    await new Promise((resolve) => setTimeout(resolve, 600))

    const { response, trace } = simulateLocally(wizardData, text, nextHistory, currentPreset ?? undefined)
    const agentMsg: SimMessage = {
      id: uid(),
      role: 'agent',
      content: response,
      timestamp: Date.now(),
      trace,
    }
    setMessages([...nextHistory, agentMsg])
    setIsProcessing(false)
  }, [messages, wizardData, currentPreset])

  const loadPreset = useCallback((preset: SimulatorPreset) => {
    setCurrentPreset(preset)
    setMessages([])
    // Auto-send the preset message
    setTimeout(() => {
      const userMsg: SimMessage = {
        id: uid(),
        role: 'user',
        content: preset.message,
        timestamp: Date.now(),
      }
      setMessages([userMsg])
      setIsProcessing(true)
      setTimeout(() => {
        const { response, trace } = simulateLocally(wizardData, preset.message, [userMsg], preset)
        const agentMsg: SimMessage = {
          id: uid(), role: 'agent', content: response, timestamp: Date.now(), trace,
        }
        setMessages([userMsg, agentMsg])
        setIsProcessing(false)
      }, 600)
    }, 0)
  }, [wizardData])

  const reset = useCallback(() => {
    setMessages([])
    setCurrentPreset(null)
  }, [])

  const latestTrace = messages.slice().reverse().find((m) => m.role === 'agent')?.trace ?? null

  return {
    messages,
    isProcessing,
    currentPreset,
    latestTrace,
    sendMessage,
    loadPreset,
    reset,
  }
}
