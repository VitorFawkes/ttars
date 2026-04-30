/**
 * Script de invariants da Estela v2 — valida que a configuração em produção
 * mantém as garantias mínimas pra ela não regredir comportamento.
 *
 * Roda contra o banco de PRODUÇÃO via REST API. Use como smoke test antes
 * de qualquer deploy ou mudança de UI no editor de agentes.
 *
 * Uso:
 *   source .env && npx tsx scripts/check-estela-config.ts
 *
 * Saída:
 *   - exit 0 se tudo passa
 *   - exit 1 se algum invariant quebrou
 *
 * Cada check é independente. Adicione novos checks na lista CHECKS quando
 * descobrir um novo invariant que não pode regredir.
 */

const ESTELA_V2_AGENT_ID = '9f46efff-4447-4352-aa00-9879c3a5d1cd'
const SUPABASE_URL = 'https://szyrzxvlptqqheizyrxu.supabase.co'

type CheckResult = { name: string; ok: boolean; message: string }

interface Moment {
  id: string
  moment_key: string
  moment_label: string
  kind: 'flow' | 'play'
  trigger_type: string
  trigger_config: Record<string, unknown>
  message_mode: string
  delivery_mode: string
  anchor_text: string | null
  red_lines: string[]
  discovery_config: { slots: Array<{ key: string; questions: string[] }> } | null
  enabled: boolean
}

interface ScoringRule {
  dimension: string
  rule_type: string
  weight: number
}

async function fetchTable<T>(table: string, filter: string): Promise<T[]> {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY não está no env. Rode: source .env')
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filter}&select=*`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  })
  if (!res.ok) throw new Error(`${table} fetch failed: ${res.status} ${await res.text()}`)
  return res.json() as Promise<T[]>
}

// ───────────────────────────────────────────────────────────────────────
// CHECKS
// ───────────────────────────────────────────────────────────────────────

async function checkAberturaHasTwoQuestions(): Promise<CheckResult> {
  const moments = await fetchTable<Moment>('ai_agent_moments', `agent_id=eq.${ESTELA_V2_AGENT_ID}&moment_key=eq.abertura`)
  if (moments.length === 0) return { name: 'abertura-2-perguntas', ok: false, message: 'Momento Abertura não existe' }
  const m = moments[0]
  const text = m.anchor_text ?? ''
  // Conta '?' como número de perguntas
  const matches = text.match(/\?+/g)
  const count = matches ? matches.length : 0
  if (count < 2) {
    return { name: 'abertura-2-perguntas', ok: false, message: `Abertura tem ${count} pergunta(s) — esperado 2 ou mais. Texto começa com: "${text.slice(0, 80)}…"` }
  }
  return { name: 'abertura-2-perguntas', ok: true, message: `${count} perguntas no texto âncora` }
}

async function checkAberturaRedLinesNoConflict(): Promise<CheckResult> {
  const moments = await fetchTable<Moment>('ai_agent_moments', `agent_id=eq.${ESTELA_V2_AGENT_ID}&moment_key=eq.abertura`)
  if (moments.length === 0) return { name: 'abertura-red-lines', ok: false, message: 'Momento Abertura não existe' }
  const m = moments[0]
  const conflicting = (m.red_lines ?? []).filter(rl => {
    const t = rl.toLowerCase()
    if (t.includes('exceção') || t.includes('mesmo tema') || t.includes('em geral')) return false
    return t.includes('uma pergunta só') || t.includes('uma pergunta so') || t.includes('não perguntar 2') || t.includes('nao perguntar 2')
  })
  if (conflicting.length > 0) {
    return { name: 'abertura-red-lines', ok: false, message: `Red line conflitante encontrada: "${conflicting[0].slice(0, 80)}"` }
  }
  return { name: 'abertura-red-lines', ok: true, message: 'Nenhuma red line conflitante na Abertura' }
}

async function checkSondagemSlotsHaveQuestions(): Promise<CheckResult> {
  const moments = await fetchTable<Moment>('ai_agent_moments', `agent_id=eq.${ESTELA_V2_AGENT_ID}&moment_key=eq.sondagem`)
  if (moments.length === 0) return { name: 'sondagem-slots', ok: false, message: 'Momento Sondagem não existe' }
  const m = moments[0]
  const slots = m.discovery_config?.slots ?? []
  const empty = slots.filter(s => !s.questions || s.questions.length === 0)
  if (empty.length > 0) {
    return { name: 'sondagem-slots', ok: false, message: `${empty.length} slots sem pergunta: ${empty.map(s => s.key).join(', ')}` }
  }
  return { name: 'sondagem-slots', ok: true, message: `${slots.length} slots, todos com pergunta` }
}

async function checkScoringRulesNamingConvention(): Promise<CheckResult> {
  const rules = await fetchTable<ScoringRule>('ai_agent_scoring_rules', `agent_id=eq.${ESTELA_V2_AGENT_ID}`)
  // Convenção: snake_case sem caracteres especiais (parênteses, dois-pontos, $, ç sem acento)
  // Excluem-se 2 dimensões legadas que têm comportamento especial: 'sinal_indireto' (boolean_true), 'ww_orcamento_faixa' (equals)
  const exceptions = ['sinal_indireto', 'ww_orcamento_faixa']
  const bad = rules.filter(r => {
    if (exceptions.includes(r.dimension)) return false
    return /[():$]/.test(r.dimension) || r.dimension.startsWith('ai_')
  })
  if (bad.length > 0) {
    return { name: 'scoring-naming', ok: false, message: `${bad.length} regras com naming não-padronizado: ${bad.slice(0, 3).map(r => r.dimension).join(', ')}…` }
  }
  return { name: 'scoring-naming', ok: true, message: `${rules.length} regras com naming padronizado` }
}

async function checkExpectedPlaysPresent(): Promise<CheckResult> {
  const moments = await fetchTable<Moment>('ai_agent_moments', `agent_id=eq.${ESTELA_V2_AGENT_ID}&kind=eq.play`)
  const expectedKeys = ['objecao_preco', 'lua_de_mel', 'destino_fora_catalogo', 'objecao_preciso_pensar', 'familia_co_financiadora']
  const presentKeys = moments.map(m => m.moment_key)
  const missing = expectedKeys.filter(k => !presentKeys.includes(k))
  if (missing.length > 0) {
    return { name: 'plays-presentes', ok: false, message: `Plays faltando: ${missing.join(', ')}` }
  }
  return { name: 'plays-presentes', ok: true, message: `${presentKeys.length} plays cadastradas (${expectedKeys.length} esperadas)` }
}

async function checkFormDataFieldsCoverage(): Promise<CheckResult> {
  type BC = { form_data_fields: string[]; auto_update_fields: string[] }
  const [bc] = await fetchTable<BC>('ai_agent_business_config', `agent_id=eq.${ESTELA_V2_AGENT_ID}`)
  if (!bc) return { name: 'form-data-fields', ok: false, message: 'business_config não encontrado' }
  const required = ['ww_destino', 'ww_data_casamento', 'ww_num_convidados', 'ww_orcamento_faixa', 'ww_sdr_visao_casamento', 'ww_sdr_ajuda_familia', 'ww_sdr_perfil_viagem_internacional']
  const missing = required.filter(f => !bc.form_data_fields?.includes(f))
  if (missing.length > 0) {
    return { name: 'form-data-fields', ok: false, message: `Campos faltando em form_data_fields: ${missing.join(', ')}` }
  }
  return { name: 'form-data-fields', ok: true, message: `${bc.form_data_fields.length} campos em form_data_fields` }
}

async function checkSilentSignalsCoverage(): Promise<CheckResult> {
  type Signal = { signal_key: string; enabled: boolean }
  const signals = await fetchTable<Signal>('ai_agent_silent_signals', `agent_id=eq.${ESTELA_V2_AGENT_ID}`)
  const required = ['referencia_casamento_premium', 'viagem_internacional_recente', 'familia_co_financiadora']
  const missing = required.filter(k => !signals.find(s => s.signal_key === k && s.enabled))
  if (missing.length > 0) {
    return { name: 'silent-signals', ok: false, message: `Sinais silenciosos faltando ou desativados: ${missing.join(', ')}` }
  }
  return { name: 'silent-signals', ok: true, message: `${signals.length} sinais silenciosos ativos` }
}

async function checkSystemPromptHasException(): Promise<CheckResult> {
  type Agent = { system_prompt: string }
  const [a] = await fetchTable<Agent>('ai_agents', `id=eq.${ESTELA_V2_AGENT_ID}`)
  if (!a) return { name: 'system-prompt-excecao', ok: false, message: 'Agente não encontrado' }
  // O prompt clássico tem regra "Uma pergunta por turno". Garantimos que existe a EXCEÇÃO pra mesmo tema.
  if (!a.system_prompt.toLowerCase().includes('mesmo tema') && !a.system_prompt.toLowerCase().includes('exceção')) {
    return { name: 'system-prompt-excecao', ok: false, message: 'system_prompt não tem exceção pra perguntas do mesmo tema — risco de cortar a 2ª pergunta' }
  }
  return { name: 'system-prompt-excecao', ok: true, message: 'Exceção pra mesmo tema presente no system_prompt' }
}

const CHECKS = [
  checkAberturaHasTwoQuestions,
  checkAberturaRedLinesNoConflict,
  checkSondagemSlotsHaveQuestions,
  checkScoringRulesNamingConvention,
  checkExpectedPlaysPresent,
  checkFormDataFieldsCoverage,
  checkSilentSignalsCoverage,
  checkSystemPromptHasException,
]

// ───────────────────────────────────────────────────────────────────────
// Runner
// ───────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n🔍 Validando configuração da Estela v2 em produção...\n`)
  let failed = 0
  for (const check of CHECKS) {
    try {
      const result = await check()
      const icon = result.ok ? '✓' : '✗'
      const color = result.ok ? '\x1b[32m' : '\x1b[31m'
      console.log(`  ${color}${icon}\x1b[0m ${result.name.padEnd(28)} ${result.message}`)
      if (!result.ok) failed++
    } catch (err) {
      console.log(`  \x1b[31m✗\x1b[0m ${check.name.padEnd(28)} ERRO: ${(err as Error).message}`)
      failed++
    }
  }

  console.log()
  if (failed === 0) {
    console.log(`\x1b[32m✓ Todos os ${CHECKS.length} invariants OK\x1b[0m\n`)
    process.exit(0)
  } else {
    console.log(`\x1b[31m✗ ${failed} de ${CHECKS.length} invariants falharam\x1b[0m\n`)
    process.exit(1)
  }
}

main().catch(err => {
  console.error('Erro fatal:', err)
  process.exit(2)
})
