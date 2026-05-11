/**
 * Duplica a Estela v2 (id `9f46efff-...`) como uma "Estela v3 (sandbox)".
 *
 * Objetivo: ter uma cópia completa da configuração da Estela em produção pra
 * brincar com red lines, anchor_text, plays, sondagem, scoring e ver o
 * comportamento sem afetar a Estela v2 que está atendendo casais reais.
 *
 * O que duplica:
 *   - ai_agents (com novo id, nome "Estela v3 (sandbox)", ativa=false,
 *     whitelist apenas com o número do Vitor pra teste)
 *   - ai_agent_business_config
 *   - ai_agent_moments (todos os flows + plays)
 *   - ai_agent_silent_signals
 *   - ai_agent_scoring_config
 *   - ai_agent_scoring_rules
 *   - ai_agent_few_shot_examples
 *
 * O que NÃO duplica:
 *   - ai_agent_kb_links (a v2 não tem KB hoje — quando criar, decide se
 *     compartilha entre v2 e v3)
 *   - Histórico de conversas, turnos, métricas — são por agente, mantemos
 *     isolado pra v3 começar zerada.
 *
 * Idempotência: se a v3 já existe (detectada por nome), o script aborta.
 * Pra recriar, apague manualmente ou ajuste o nome.
 *
 * Uso:
 *   source .env && npx tsx scripts/duplicate-estela-as-v3-sandbox.ts
 *
 * Saída:
 *   - imprime os IDs criados (agent_id principal e contagem por tabela)
 *   - exit 0 sucesso, exit 1 se algo deu errado
 */

const ESTELA_V2_AGENT_ID = '9f46efff-4447-4352-aa00-9879c3a5d1cd'
const SUPABASE_URL = 'https://szyrzxvlptqqheizyrxu.supabase.co'

const V3_NAME = 'Estela v3 (sandbox)'
const V3_DESCRIPTION = 'Sandbox da Estela v2. Use pra testar mudanças de configuração antes de propagar pra v2 que está em produção.'
const VITOR_TEST_NUMBER = '5511964293533'

type Json = Record<string, unknown> | unknown[] | string | number | boolean | null

const headers = () => {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY não está no env. Rode: source .env')
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  }
}

async function fetchOne<T>(table: string, filter: string): Promise<T | null> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filter}&select=*`, { headers: headers() })
  if (!res.ok) throw new Error(`${table}: ${res.status} ${await res.text()}`)
  const arr = (await res.json()) as T[]
  return arr[0] ?? null
}

async function fetchMany<T>(table: string, filter: string): Promise<T[]> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filter}&select=*`, { headers: headers() })
  if (!res.ok) throw new Error(`${table}: ${res.status} ${await res.text()}`)
  return (await res.json()) as T[]
}

async function insertOne<T>(table: string, row: Json): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(row),
  })
  if (!res.ok) throw new Error(`POST ${table}: ${res.status} ${await res.text()}`)
  const data = (await res.json()) as T[]
  return data[0]
}

async function insertMany<T>(table: string, rows: Json[]): Promise<T[]> {
  if (rows.length === 0) return []
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(rows),
  })
  if (!res.ok) throw new Error(`POST ${table} (batch): ${res.status} ${await res.text()}`)
  return (await res.json()) as T[]
}

/** Remove campos que o banco gera (id, created_at, updated_at) e que não devem ser copiados literalmente. */
function stripGenerated<T extends Record<string, unknown>>(row: T): Partial<T> {
  const out: Record<string, unknown> = { ...row }
  delete out.id
  delete out.created_at
  delete out.updated_at
  return out as Partial<T>
}

async function main() {
  console.log('🔄 Duplicando Estela v2 → Estela v3 (sandbox)\n')

  // 0. Idempotência: se já existe, aborta
  const existing = await fetchOne<{ id: string; nome: string }>(
    'ai_agents',
    `nome=eq.${encodeURIComponent(V3_NAME)}`
  )
  if (existing) {
    console.log(`⚠️  Já existe um agente "${V3_NAME}" (id ${existing.id}).`)
    console.log('    Pra recriar do zero, apague-o manualmente. Saindo sem alterar nada.')
    process.exit(0)
  }

  // 1. Carrega ai_agents
  console.log('1. Carregando Estela v2...')
  const v2 = await fetchOne<Record<string, unknown>>('ai_agents', `id=eq.${ESTELA_V2_AGENT_ID}`)
  if (!v2) throw new Error(`Estela v2 não encontrada (id ${ESTELA_V2_AGENT_ID}).`)
  console.log(`   ✓ ${v2.nome}`)

  // 2. Cria ai_agents v3
  console.log('2. Criando ai_agents v3...')
  const v3Row = {
    ...stripGenerated(v2),
    nome: V3_NAME,
    descricao: V3_DESCRIPTION,
    ativa: false,
    is_template_based: v2.is_template_based ?? false,
    ativa_changed_at: null,
    ativa_changed_by: null,
    test_mode_phone_whitelist: [VITOR_TEST_NUMBER],
    // playbook_enabled mantém true (é um v2/v3 do playbook)
    // n8n_webhook_url mantém igual (pode ser null)
  }
  const v3 = await insertOne<{ id: string; nome: string; ativa: boolean }>('ai_agents', v3Row)
  console.log(`   ✓ Criada com id ${v3.id}`)

  // 3. Duplica ai_agent_business_config
  console.log('3. Duplicando business_config...')
  const v2Bc = await fetchOne<Record<string, unknown>>(
    'ai_agent_business_config',
    `agent_id=eq.${ESTELA_V2_AGENT_ID}`
  )
  if (v2Bc) {
    await insertOne('ai_agent_business_config', {
      ...stripGenerated(v2Bc),
      agent_id: v3.id,
    })
    console.log(`   ✓ 1 row`)
  } else {
    console.log(`   - sem business_config na v2, pulando`)
  }

  // 4. Duplica ai_agent_moments
  console.log('4. Duplicando moments...')
  const v2Moments = await fetchMany<Record<string, unknown>>(
    'ai_agent_moments',
    `agent_id=eq.${ESTELA_V2_AGENT_ID}`
  )
  const v3Moments = v2Moments.map(m => ({
    ...stripGenerated(m),
    agent_id: v3.id,
  }))
  const insertedMoments = await insertMany('ai_agent_moments', v3Moments)
  console.log(`   ✓ ${insertedMoments.length} rows`)

  // 5. Duplica ai_agent_silent_signals
  console.log('5. Duplicando silent_signals...')
  const v2Signals = await fetchMany<Record<string, unknown>>(
    'ai_agent_silent_signals',
    `agent_id=eq.${ESTELA_V2_AGENT_ID}`
  )
  const v3Signals = v2Signals.map(s => ({
    ...stripGenerated(s),
    agent_id: v3.id,
  }))
  const insertedSignals = await insertMany('ai_agent_silent_signals', v3Signals)
  console.log(`   ✓ ${insertedSignals.length} rows`)

  // 6. Duplica ai_agent_scoring_config (PK composta agent_id+org_id, sem id próprio)
  console.log('6. Duplicando scoring_config...')
  const v2Sc = await fetchOne<Record<string, unknown>>(
    'ai_agent_scoring_config',
    `agent_id=eq.${ESTELA_V2_AGENT_ID}`
  )
  if (v2Sc) {
    const sc = { ...v2Sc }
    delete sc.created_at
    delete sc.updated_at
    sc.agent_id = v3.id
    await insertOne('ai_agent_scoring_config', sc)
    console.log(`   ✓ 1 row (threshold=${v2Sc.threshold_qualify}, enabled=${v2Sc.enabled})`)
  } else {
    console.log(`   - sem scoring_config na v2, pulando`)
  }

  // 7. Duplica ai_agent_scoring_rules
  console.log('7. Duplicando scoring_rules...')
  const v2Rules = await fetchMany<Record<string, unknown>>(
    'ai_agent_scoring_rules',
    `agent_id=eq.${ESTELA_V2_AGENT_ID}`
  )
  const v3Rules = v2Rules.map(r => ({
    ...stripGenerated(r),
    agent_id: v3.id,
  }))
  const insertedRules = await insertMany('ai_agent_scoring_rules', v3Rules)
  console.log(`   ✓ ${insertedRules.length} rows`)

  // 8. Duplica ai_agent_few_shot_examples
  console.log('8. Duplicando few_shot_examples...')
  const v2FewShot = await fetchMany<Record<string, unknown>>(
    'ai_agent_few_shot_examples',
    `agent_id=eq.${ESTELA_V2_AGENT_ID}`
  )
  const v3FewShot = v2FewShot.map(f => ({
    ...stripGenerated(f),
    agent_id: v3.id,
  }))
  const insertedFewShot = await insertMany('ai_agent_few_shot_examples', v3FewShot)
  console.log(`   ✓ ${insertedFewShot.length} rows`)

  // 9. Resumo
  console.log()
  console.log('✓ Estela v3 (sandbox) criada com sucesso!')
  console.log()
  console.log(`  Agent ID:           ${v3.id}`)
  console.log(`  Nome:               ${V3_NAME}`)
  console.log(`  Ativa em produção:  não (sandbox)`)
  console.log(`  Whitelist de teste: ${VITOR_TEST_NUMBER}`)
  console.log(`  Moments:            ${insertedMoments.length}`)
  console.log(`  Signals:            ${insertedSignals.length}`)
  console.log(`  Scoring rules:      ${insertedRules.length}`)
  console.log(`  Few-shot examples:  ${insertedFewShot.length}`)
  console.log()
  console.log(`  Acesse:             /admin/ai-agents/${v3.id}`)
  console.log()
}

main().catch(err => {
  console.error('❌ Erro:', err.message ?? err)
  process.exit(1)
})
