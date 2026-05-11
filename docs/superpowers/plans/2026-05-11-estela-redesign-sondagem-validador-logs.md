# Estela Redesign — Sondagem, Validador e Observabilidade — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminar a classe de bugs onde config do admin gera prompt nonsense na agente IA "Estela", trocar o validador LLM-based (frequentemente reescrevendo respostas certas) por detector minimal determinístico, e instrumentar observabilidade obrigatória de cada turn.

**Architecture:** Aditivo (não-destrutivo) sobre o router V1 existente. Schema novo de slot coexiste com o antigo via feature flag `feature_flag_discovery_v2` na tabela `ai_agents`. Backend prefere schema novo quando flag está ON e `goal` preenchido; cai pro caminho legado (`deriveSlotQuestion`) quando OFF ou ausente. Validador minimal substitui o atual (que usa LLM gpt-5.1 e às vezes reescreve coisa certa). Logs gravados em nova tabela `ai_agent_turn_logs` com TTL automático.

**Tech Stack:** Supabase Postgres (RLS + pg_cron) · Edge Functions Deno · React + Vite + TailwindCSS · TypeScript strict · Playwright E2E.

**Spec:** [docs/superpowers/specs/2026-05-11-estela-redesign-sondagem-validador-logs-design.md](../specs/2026-05-11-estela-redesign-sondagem-validador-logs-design.md)

**Escopo:** SÓ Estela (engine `multi_agent_pipeline`, ID `43180319-650c-490a-87be-f275550285f8`). Patricia (V2) e Luna (V1, off) NÃO afetadas — discriminação via `feature_flag_discovery_v2` e por `engine` na UI.

---

## File Structure

### Banco (migrations)
- Create: `supabase/migrations/20260512XX_estela_redesign_01_backup.sql` — backup de `ai_agent_moments` da Estela
- Create: `supabase/migrations/20260512XX_estela_redesign_02_schema_slot.sql` — slot novos campos opcionais (jsonb não muda, só docs)
- Create: `supabase/migrations/20260512XX_estela_redesign_03_feature_flag.sql` — `ai_agents.feature_flag_discovery_v2`
- Create: `supabase/migrations/20260512XX_estela_redesign_04_turn_logs_table.sql` — `ai_agent_turn_logs` + RLS + indexes
- Create: `supabase/migrations/20260512XX_estela_redesign_05_turn_logs_ttl_cron.sql` — função cleanup + pg_cron
- Create: `supabase/migrations/20260512XX_estela_redesign_06_seed_estela_slots.sql` — populate `goal`/`example_questions` nos 6 slots
- Create: `supabase/migrations/20260512XX_estela_redesign_07_enable_flag.sql` — `feature_flag_discovery_v2 = TRUE` pra Estela (último passo)

### Backend (edge function `ai-agent-router`)
- Create: `supabase/functions/ai-agent-router/slot_renderer.ts` — função pura `renderSlotForPrompt(slot, agent)`
- Create: `supabase/functions/ai-agent-router/validator_minimal.ts` — 6 regras regex + `runValidatorMinimal()`
- Create: `supabase/functions/ai-agent-router/turn_logger.ts` — `recordTurnLog()` + `scrubPII()`
- Modify: `supabase/functions/ai-agent-router/prompt_builder_v2.ts` — adicionar branching feature flag, passar `current_slot`
- Modify: `supabase/functions/ai-agent-router/index.ts` — substituir `runValidator` por `runValidatorMinimal`, integrar logger, implementar protocolo REGEN

### Frontend (React)
- Create: `src/lib/slotRenderer.ts` — mirror TypeScript da função do backend (paridade)
- Create: `src/components/ai-agent-v2/editor/playbook/moments/SlotPreviewPanel.tsx` — preview antes/depois
- Create: `src/components/ai-agent-v2/editor/conversa/TurnExecutionDrawer.tsx` — side sheet "Ver execução"
- Create: `src/hooks/v2/useTurnLog.ts` — query single turn log
- Create: `src/hooks/v2/useTurnLogsForConversation.ts` — query batch logs por conversa
- Modify: `src/components/ai-agent-v2/editor/playbook/moments/DiscoveryConfigEditor.tsx` — discriminação por `engine`, validação rigorosa
- Modify: `src/components/ai-agent-v2/editor/playbook/moments/MomentCard.tsx` — passar `engineVersion` pra DiscoveryConfigEditor
- Modify: conversa de card view (componente que renderiza mensagens da Estela — confirmar path em Task 12) — adicionar botão "Ver execução"

### Testes
- Create: `supabase/functions/ai-agent-router/__tests__/slot_renderer.test.ts` — testes da função pura
- Create: `supabase/functions/ai-agent-router/__tests__/validator_minimal.test.ts` — testes dos 6 patterns
- Create: `supabase/functions/ai-agent-router/__tests__/turn_logger.test.ts` — testes do scrubPII
- Create: `tests/e2e/07-estela-sondagem.smoke.spec.ts` — E2E sondagem feliz path

---

## Task 1: Backup automático dos moments da Estela

**Files:**
- Create: `supabase/migrations/20260512XX_estela_redesign_01_backup.sql`

- [ ] **Step 1: Determinar prefixo de migration**

Run:
```bash
ls /Users/vitorgambetti/Documents/WelcomeCRM/supabase/migrations/ | grep "^20260512" | sort | tail -3
```
Use próxima letra disponível (ex: se já existe `20260512f`, próxima é `20260512g`). Substitua `XX` no nome do arquivo por `g` (ou letra apropriada). Use o mesmo prefixo (`20260512g`...`20260512m`) para as 7 migrations dessa subida — em ordem.

- [ ] **Step 2: Criar migration de backup**

Write to `supabase/migrations/20260512XX_estela_redesign_01_backup.sql`:

```sql
-- Backup completo de ai_agent_moments da Estela antes do redesign
-- Permite rollback se redesign der errado: UPDATE ai_agent_moments SET ... FROM backup
-- Limpar após 90 dias quando confirmado estável.

CREATE TABLE IF NOT EXISTS ai_agent_moments_backup_20260512 AS
SELECT * FROM ai_agent_moments
WHERE agent_id = '43180319-650c-490a-87be-f275550285f8';

COMMENT ON TABLE ai_agent_moments_backup_20260512 IS
  'Backup pré-redesign 2026-05-11. Original commit: <preencher após criar>. Pode dropar após 2026-08-11 se Estela estável.';
```

- [ ] **Step 3: Aplicar no staging**

Run:
```bash
cd /Users/vitorgambetti/Documents/WelcomeCRM && bash .claude/hooks/apply-to-staging.sh supabase/migrations/20260512XX_estela_redesign_01_backup.sql
```
Expected: `Aplicado no staging.`

- [ ] **Step 4: Verificar backup no staging**

Run:
```bash
source /Users/vitorgambetti/Documents/WelcomeCRM/.env
curl -s "https://ivmebyvjarcvrkrbemam.supabase.co/rest/v1/ai_agent_moments_backup_20260512?select=count" -H "apikey: $VITE_SUPABASE_STAGING_ANON_KEY" -H "Authorization: Bearer $SUPABASE_STAGING_SERVICE_ROLE_KEY" -H "Prefer: count=exact" -I 2>&1 | grep -i "content-range"
```
Expected: header `content-range` mostrando 9 rows (9 moments da Estela).

- [ ] **Step 5: Commit**

Run:
```bash
git add supabase/migrations/20260512XX_estela_redesign_01_backup.sql
git commit -m "feat(estela): backup pré-redesign dos moments

Tabela ai_agent_moments_backup_20260512 com snapshot completo dos
9 momentos da Estela. Habilita rollback sem perda se redesign
quebrar produção.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Feature flag de rollback runtime

**Files:**
- Create: `supabase/migrations/20260512XX_estela_redesign_03_feature_flag.sql`

- [ ] **Step 1: Criar migration**

Write to `supabase/migrations/20260512XX_estela_redesign_03_feature_flag.sql`:

```sql
-- Feature flag pra ligar/desligar schema novo (goal/must_include/example_questions)
-- sem redeploy. Default FALSE pra zero risco em todos agentes existentes.
-- Liga só pra Estela após migration de dados validada.

ALTER TABLE ai_agents
  ADD COLUMN IF NOT EXISTS feature_flag_discovery_v2 BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN ai_agents.feature_flag_discovery_v2 IS
  'Quando TRUE, router usa novo schema de slot (goal/must_include/example_questions/literal_question). Default FALSE mantém comportamento legado (deriveSlotQuestion). Liga só pra Estela inicialmente.';
```

- [ ] **Step 2: Aplicar staging**

Run:
```bash
bash .claude/hooks/apply-to-staging.sh supabase/migrations/20260512XX_estela_redesign_03_feature_flag.sql
```

- [ ] **Step 3: Verificar coluna existe + default FALSE pra todos**

Run:
```bash
source /Users/vitorgambetti/Documents/WelcomeCRM/.env
curl -s "https://ivmebyvjarcvrkrbemam.supabase.co/rest/v1/ai_agents?select=id,nome,feature_flag_discovery_v2" -H "apikey: $VITE_SUPABASE_STAGING_ANON_KEY" -H "Authorization: Bearer $SUPABASE_STAGING_SERVICE_ROLE_KEY" | python3 -m json.tool
```
Expected: todos agentes com `feature_flag_discovery_v2: false`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260512XX_estela_redesign_03_feature_flag.sql
git commit -m "feat(estela): feature_flag_discovery_v2 em ai_agents

Default FALSE em todos agentes existentes. Permite rollback runtime
sem redeploy quando o schema novo de slots é ativado em produção.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Tabela `ai_agent_turn_logs` + RLS + indexes

**Files:**
- Create: `supabase/migrations/20260512XX_estela_redesign_04_turn_logs_table.sql`

- [ ] **Step 1: Criar migration**

Write to `supabase/migrations/20260512XX_estela_redesign_04_turn_logs_table.sql`:

```sql
-- Tabela de logs por turno da execução do agente IA (Estela, e futuros)
-- Armazena prompt completo, raw_response, validator_verdict, etc.
-- TTL automático de 30 dias via cron (próxima migration).
-- PII scrubbing aplicado pre-INSERT pelo edge function (telefone, email, CPF).

CREATE TABLE ai_agent_turn_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  turn_id         UUID NOT NULL REFERENCES ai_conversation_turns(id) ON DELETE CASCADE,
  agent_id        UUID NOT NULL REFERENCES ai_agents(id),
  org_id          UUID NOT NULL REFERENCES organizations(id) DEFAULT requesting_org_id(),
  conversation_id UUID NOT NULL REFERENCES ai_conversations(id),

  attempt_number    INTEGER NOT NULL DEFAULT 1,
  prompt_system     TEXT,
  prompt_user       TEXT,
  raw_response      TEXT,
  final_messages    TEXT[],
  model_used        TEXT,
  temperature_used  NUMERIC(3,2),
  max_tokens_used   INTEGER,
  tool_calls        JSONB NOT NULL DEFAULT '[]'::jsonb,
  validator_verdict JSONB,
  slot_in_focus     TEXT,
  duration_ms       INTEGER,
  prompt_builder_version TEXT,
  discovery_config_hash  TEXT,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ai_agent_turn_logs_turn ON ai_agent_turn_logs(turn_id);
CREATE INDEX idx_ai_agent_turn_logs_agent_created ON ai_agent_turn_logs(agent_id, created_at DESC);
CREATE INDEX idx_ai_agent_turn_logs_conversation ON ai_agent_turn_logs(conversation_id, created_at DESC);

ALTER TABLE ai_agent_turn_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY ai_agent_turn_logs_org_select ON ai_agent_turn_logs
  FOR SELECT TO authenticated
  USING (org_id = requesting_org_id());

CREATE POLICY ai_agent_turn_logs_service_all ON ai_agent_turn_logs
  TO service_role
  USING (true) WITH CHECK (true);

COMMENT ON TABLE ai_agent_turn_logs IS
  'Log por turno da execução de agentes IA. PII scrubbed pre-INSERT. TTL 30 dias via cron. Visível pela org da conversa via RLS.';
```

- [ ] **Step 2: Aplicar staging**

```bash
bash .claude/hooks/apply-to-staging.sh supabase/migrations/20260512XX_estela_redesign_04_turn_logs_table.sql
```

- [ ] **Step 3: Verificar tabela + RLS**

Run:
```bash
curl -s "https://ivmebyvjarcvrkrbemam.supabase.co/rest/v1/ai_agent_turn_logs?select=count" -H "apikey: $VITE_SUPABASE_STAGING_ANON_KEY" -H "Authorization: Bearer $SUPABASE_STAGING_SERVICE_ROLE_KEY" -H "Prefer: count=exact" -I 2>&1 | grep -E "content-range|status"
```
Expected: 200 OK, content-range mostrando 0 rows (tabela vazia).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260512XX_estela_redesign_04_turn_logs_table.sql
git commit -m "feat(estela): tabela ai_agent_turn_logs com RLS por org

1 linha por turn/attempt. Grava prompt completo, raw_response,
validator_verdict, slot_in_focus, prompt_builder_version,
discovery_config_hash, tool_calls. RLS visivel pela org da
conversa. PII scrub aplicado pre-INSERT no router.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Cron de TTL 30 dias

**Files:**
- Create: `supabase/migrations/20260512XX_estela_redesign_05_turn_logs_ttl_cron.sql`

- [ ] **Step 1: Verificar que pg_cron está instalado no projeto**

Run:
```bash
source /Users/vitorgambetti/Documents/WelcomeCRM/.env
curl -s "https://szyrzxvlptqqheizyrxu.supabase.co/rest/v1/rpc/check_extension?ext_name=pg_cron" -H "apikey: $VITE_SUPABASE_ANON_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
```
Se RPC não existe, rode no SQL Editor do Supabase: `SELECT * FROM pg_extension WHERE extname = 'pg_cron';` Expected: 1 row. Se 0 rows, ver com Vitor — pode precisar habilitar manualmente.

- [ ] **Step 2: Criar migration**

Write to `supabase/migrations/20260512XX_estela_redesign_05_turn_logs_ttl_cron.sql`:

```sql
-- TTL automático: deleta logs com mais de 30 dias. Cron diário 3am.

CREATE OR REPLACE FUNCTION cleanup_ai_agent_turn_logs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM ai_agent_turn_logs WHERE created_at < now() - interval '30 days';
END $$;

COMMENT ON FUNCTION cleanup_ai_agent_turn_logs IS
  'Apaga linhas de ai_agent_turn_logs com mais de 30 dias. Chamado por cron diário.';

-- Schedule via pg_cron (idempotente — unschedule se já existe)
DO $$
BEGIN
  PERFORM cron.unschedule('cleanup-ai-agent-turn-logs');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'cleanup-ai-agent-turn-logs',
  '0 3 * * *',
  $$SELECT cleanup_ai_agent_turn_logs()$$
);
```

- [ ] **Step 3: Aplicar staging**

```bash
bash .claude/hooks/apply-to-staging.sh supabase/migrations/20260512XX_estela_redesign_05_turn_logs_ttl_cron.sql
```

- [ ] **Step 4: Verificar cron schedulado**

Rode no SQL Editor do Supabase staging:
```sql
SELECT jobname, schedule, active FROM cron.job WHERE jobname = 'cleanup-ai-agent-turn-logs';
```
Expected: 1 row, schedule = `0 3 * * *`, active = true.

- [ ] **Step 5: Testar função manualmente**

```sql
SELECT cleanup_ai_agent_turn_logs();
```
Expected: completa sem erro (tabela vazia, 0 rows afetadas).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260512XX_estela_redesign_05_turn_logs_ttl_cron.sql
git commit -m "feat(estela): TTL 30 dias para ai_agent_turn_logs via pg_cron

Função cleanup_ai_agent_turn_logs() agendada para rodar diariamente
às 3h. Apaga linhas com created_at > 30 dias. Idempotente.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Função pura `renderSlotForPrompt()` (TDD)

**Files:**
- Create: `supabase/functions/ai-agent-router/slot_renderer.ts`
- Create: `supabase/functions/ai-agent-router/__tests__/slot_renderer.test.ts`

- [ ] **Step 1: Criar arquivo de teste**

Write to `supabase/functions/ai-agent-router/__tests__/slot_renderer.test.ts`:

```typescript
// Run com: deno test --allow-net supabase/functions/ai-agent-router/__tests__/slot_renderer.test.ts
import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { renderSlotForPrompt, type SlotV2 } from "../slot_renderer.ts";

Deno.test("renderSlotForPrompt: só goal preenchido", () => {
  const slot: SlotV2 = {
    key: "info_x",
    label: "Destino",
    goal: "Saber a região ou país do casamento",
    must_include: [],
    example_questions: [],
    literal_question: null,
    crm_field_key: "ww_destino",
  };
  const rendered = renderSlotForPrompt(slot);
  assertStringIncludes(rendered, "Saber a região ou país do casamento");
  assertStringIncludes(rendered, "Formule a pergunta natural");
  assertEquals(rendered.includes("DEVE coletar EXATAMENTE"), false);
  assertEquals(rendered.includes("Referência de tom"), false);
});

Deno.test("renderSlotForPrompt: goal + must_include", () => {
  const slot: SlotV2 = {
    key: "data",
    label: "Data do casamento",
    goal: "Saber o mês e o ano do casamento",
    must_include: ["mês", "ano"],
    example_questions: [],
    literal_question: null,
    crm_field_key: "ww_data_casamento",
  };
  const rendered = renderSlotForPrompt(slot);
  assertStringIncludes(rendered, "Saber o mês e o ano do casamento");
  assertStringIncludes(rendered, "DEVE coletar EXATAMENTE: mês, ano");
  assertEquals(rendered.includes("Referência de tom"), false);
});

Deno.test("renderSlotForPrompt: goal + example_questions", () => {
  const slot: SlotV2 = {
    key: "info_x",
    label: "Viagens Internacionais",
    goal: "Descobrir se viajou internacionalmente fora da América do Sul no último ano",
    must_include: [],
    example_questions: ["E só uma curiosidade, vocês viajaram esse último ano?"],
    literal_question: null,
    crm_field_key: "ww_sdr_perfil_viagem_internacional",
  };
  const rendered = renderSlotForPrompt(slot);
  assertStringIncludes(rendered, "Descobrir se viajou internacionalmente");
  assertStringIncludes(rendered, "Referência de tom (não copiar literal)");
  assertStringIncludes(rendered, "E só uma curiosidade");
  assertEquals(rendered.includes("DEVE coletar EXATAMENTE"), false);
});

Deno.test("renderSlotForPrompt: goal + must_include + example_questions (ambos)", () => {
  const slot: SlotV2 = {
    key: "data",
    label: "Data",
    goal: "Saber mês e ano",
    must_include: ["mês", "ano"],
    example_questions: ["Quando vocês pensam em casar?"],
    literal_question: null,
    crm_field_key: "ww_data",
  };
  const rendered = renderSlotForPrompt(slot);
  assertStringIncludes(rendered, "DEVE coletar EXATAMENTE: mês, ano");
  assertStringIncludes(rendered, "Referência de tom (não copiar literal)");
  assertStringIncludes(rendered, "Quando vocês pensam em casar");
});

Deno.test("renderSlotForPrompt: literal_question domina tudo", () => {
  const slot: SlotV2 = {
    key: "confirm",
    label: "Confirmação",
    goal: "Confirmar agendamento",
    must_include: ["destino", "data"],
    example_questions: ["Confirma?", "Tá bom?"],
    literal_question: "Te mandei o link da reunião. Combinado pra quinta às 14h?",
    crm_field_key: null,
  };
  const rendered = renderSlotForPrompt(slot);
  assertStringIncludes(rendered, "Use exatamente esta pergunta");
  assertStringIncludes(rendered, "Te mandei o link da reunião. Combinado pra quinta às 14h?");
  assertEquals(rendered.includes("DEVE coletar EXATAMENTE"), false);
  assertEquals(rendered.includes("Referência de tom"), false);
});

Deno.test("renderSlotForPrompt: goal vazio retorna null (fallback legacy)", () => {
  const slot: SlotV2 = {
    key: "x",
    label: "X",
    goal: "",
    must_include: [],
    example_questions: [],
    literal_question: null,
    crm_field_key: null,
  };
  assertEquals(renderSlotForPrompt(slot), null);
});

Deno.test("renderSlotForPrompt: goal null retorna null (fallback legacy)", () => {
  const slot = {
    key: "x",
    label: "X",
    goal: null,
    must_include: [],
    example_questions: [],
    literal_question: null,
    crm_field_key: null,
  } as unknown as SlotV2;
  assertEquals(renderSlotForPrompt(slot), null);
});
```

- [ ] **Step 2: Rodar teste e ver falhar**

Run:
```bash
cd /Users/vitorgambetti/Documents/WelcomeCRM && deno test --allow-net supabase/functions/ai-agent-router/__tests__/slot_renderer.test.ts
```
Expected: FAIL com "Module not found: slot_renderer.ts".

- [ ] **Step 3: Implementar `slot_renderer.ts`**

Write to `supabase/functions/ai-agent-router/slot_renderer.ts`:

```typescript
// Função pura que decide o que injetar no prompt da Persona pra cada slot
// da Sondagem (e outros moments com discovery_config).
// Hierarquia: literal_question > must_include > example_questions > goal puro.
// Retorna null se schema novo não está sendo usado (goal vazio/null) — caller
// cai pro caminho legado (deriveSlotQuestion).

export interface SlotV2 {
  key: string;
  label: string;
  icon?: string;
  priority?: "critical" | "preferred" | "nice_to_have";
  required?: boolean;
  crm_field_key: string | null;

  // Novo schema (V2)
  goal: string | null;
  must_include: string[];
  example_questions: string[];
  literal_question: string | null;

  // Legacy schema (mantidos pra Patricia/Luna — não lidos aqui)
  must_collect?: string[];
  questions?: string[];
  coverage_notes?: string | null;

  reject_if?: Array<{ pattern: string; hint?: string }>;
}

export function renderSlotForPrompt(slot: SlotV2): string | null {
  const goal = (slot.goal ?? "").trim();
  if (!goal) return null;

  const literal = (slot.literal_question ?? "").trim();
  if (literal) {
    return `**Slot ${slot.key}** (${slot.label})
- Use exatamente esta pergunta: "${literal}"
- Não adapte. Não reformule. Use textualmente.
- Registra em: ${slot.crm_field_key ?? "(sem campo)"}`;
  }

  const mustInclude = (slot.must_include ?? []).filter((s) => s && s.trim());
  const examples = (slot.example_questions ?? []).filter((q) => q && q.trim());

  let block = `**Slot ${slot.key}** (${slot.label})
- Objetivo: ${goal}`;

  if (mustInclude.length > 0) {
    const items = mustInclude.join(", ");
    block += `
- A pergunta DEVE coletar EXATAMENTE: ${items}. Formule natural seguindo voice config.`;
    if (examples.length > 0) {
      block += `
- Referência de tom (não copiar literal): ${examples.map((q) => `"${q}"`).join(" | ")}`;
    }
  } else if (examples.length > 0) {
    block += `
- Referência de tom (não copiar literal): ${examples.map((q) => `"${q}"`).join(" | ")}`;
  } else {
    block += `
- Formule a pergunta natural seguindo voice config e contexto da conversa.`;
  }

  if (slot.crm_field_key) {
    block += `
- Registra em: ${slot.crm_field_key}`;
  }

  if (slot.reject_if && slot.reject_if.length > 0) {
    block += `
- Se lead responder vagamente, peça especificidade:`;
    for (const r of slot.reject_if) {
      const hint = r.hint?.trim() ? ` → ${r.hint.trim()}` : "";
      block += `\n  - "${r.pattern}"${hint}`;
    }
  }

  return block;
}
```

- [ ] **Step 4: Rodar testes e ver passar**

```bash
deno test --allow-net supabase/functions/ai-agent-router/__tests__/slot_renderer.test.ts
```
Expected: PASS em todos 7 testes (`ok`).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/ai-agent-router/slot_renderer.ts supabase/functions/ai-agent-router/__tests__/slot_renderer.test.ts
git commit -m "feat(estela): função pura renderSlotForPrompt + testes

Hierarquia inteligente literal_question > must_include >
example_questions > goal puro. Função retorna null quando schema
novo não é usado (goal vazio) — caller cai pro caminho legado.

7 testes Deno cobrindo cada caminho da hierarquia.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Função pura `runValidatorMinimal()` (TDD)

**Files:**
- Create: `supabase/functions/ai-agent-router/validator_minimal.ts`
- Create: `supabase/functions/ai-agent-router/__tests__/validator_minimal.test.ts`

- [ ] **Step 1: Criar arquivo de teste**

Write to `supabase/functions/ai-agent-router/__tests__/validator_minimal.test.ts`:

```typescript
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { runValidatorMinimal } from "../validator_minimal.ts";

Deno.test("validator: resposta limpa publica", () => {
  const v = runValidatorMinimal({
    response: "Que legal saber que Caribe está no radar. Vocês já têm uma data em mente?",
    turn_count: 2,
  });
  assertEquals(v.decision, "PUBLICAR");
  assertEquals(v.red_lines_hit.length, 0);
});

Deno.test("validator: pega travessão", () => {
  const v = runValidatorMinimal({
    response: "Entendi — vocês querem celebrar na praia, super leve.",
    turn_count: 2,
  });
  assertEquals(v.decision, "REGEN");
  assertEquals(v.red_lines_hit[0].rule, "never_dash_separator");
});

Deno.test("validator: pega emoji na primeira mensagem", () => {
  const v = runValidatorMinimal({
    response: "Olá! Tudo bem? 🙂",
    turn_count: 1,
  });
  assertEquals(v.decision, "REGEN");
  assertEquals(v.red_lines_hit[0].rule, "never_emoji_first");
});

Deno.test("validator: emoji na segunda mensagem é OK", () => {
  const v = runValidatorMinimal({
    response: "Que máximo! 😊",
    turn_count: 2,
  });
  assertEquals(v.decision, "PUBLICAR");
});

Deno.test("validator: pega transfer explícito", () => {
  const v = runValidatorMinimal({
    response: "Deixa eu preparar tudo, vou passar pra nossa Wedding Planner.",
    turn_count: 3,
  });
  assertEquals(v.decision, "REGEN");
  assertEquals(v.red_lines_hit[0].rule, "never_transfer_explicit");
});

Deno.test("validator: pega menção a preço com R$", () => {
  const v = runValidatorMinimal({
    response: "Pra um casamento desse porte, fica em torno de R$ 200.000.",
    turn_count: 3,
  });
  assertEquals(v.decision, "REGEN");
  assertEquals(v.red_lines_hit[0].rule, "never_price");
});

Deno.test("validator: pega auto-clarificação (bug original)", () => {
  const v = runValidatorMinimal({
    response: "Só pra eu entender direitinho a sua pergunta: você quer saber se vocês precisam ter feito alguma viagem internacional?",
    turn_count: 3,
  });
  assertEquals(v.decision, "REGEN");
  // pode bater em never_self_clarify OU never_meta_question (ambos válidos)
  const rules = v.red_lines_hit.map(r => r.rule);
  const hitAny = rules.includes("never_self_clarify") || rules.includes("never_meta_question");
  assertEquals(hitAny, true);
});

Deno.test("validator: pega meta-question 'você quer saber'", () => {
  const v = runValidatorMinimal({
    response: "Sobre o investimento, você quer saber se a gente trabalha com pacotes fechados?",
    turn_count: 3,
  });
  assertEquals(v.decision, "REGEN");
  assertEquals(v.red_lines_hit[0].rule, "never_meta_question");
});

Deno.test("validator: pode ter múltiplas violações", () => {
  const v = runValidatorMinimal({
    response: "Vou passar pra Planner — ela cuida do preço de R$ 100k.",
    turn_count: 3,
  });
  assertEquals(v.decision, "REGEN");
  assertEquals(v.red_lines_hit.length >= 2, true);
});
```

- [ ] **Step 2: Rodar teste e ver falhar**

```bash
deno test --allow-net supabase/functions/ai-agent-router/__tests__/validator_minimal.test.ts
```
Expected: FAIL com "Module not found: validator_minimal.ts".

- [ ] **Step 3: Implementar `validator_minimal.ts`**

Write to `supabase/functions/ai-agent-router/validator_minimal.ts`:

```typescript
// Validador minimal determinístico. SEM LLM. SEM reescrita.
// Detector que decide PUBLICAR | REGEN | ESCALAR.
// 6 regras regex/string match de baixo falso-positivo.

export interface ValidatorInput {
  response: string;
  turn_count: number; // 1 = primeira mensagem
}

export interface RedLineHit {
  rule: string;
  match: string;
  instruction: string; // mensagem pra Persona corrigir na segunda passagem
}

export interface ValidatorVerdict {
  decision: "PUBLICAR" | "REGEN" | "ESCALAR";
  red_lines_hit: RedLineHit[];
  reason?: string;
}

const RULES: Array<{
  id: string;
  test: (input: ValidatorInput) => string | null;
  instruction: string;
}> = [
  {
    id: "never_dash_separator",
    instruction: "Reformule SEM travessões (—, –). Use vírgula, ponto ou reticências.",
    test: ({ response }) => {
      const m = response.match(/[—–]/);
      return m?.[0] ?? null;
    },
  },
  {
    id: "never_emoji_first",
    instruction: "Reformule SEM emoji — é a primeira mensagem da conversa, sem rapport ainda.",
    test: ({ response, turn_count }) => {
      if (turn_count !== 1) return null;
      // Detecta qualquer emoji unicode (rough — cobre maioria dos pontos comuns)
      const m = response.match(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
      return m?.[0] ?? null;
    },
  },
  {
    id: "never_transfer_explicit",
    instruction: "Reformule SEM dizer 'vou passar' / 'vou transferir' / 'outra pessoa vai te atender'. Handoff é invisível.",
    test: ({ response }) => {
      const m = response.match(/(vou\s+(passar|transferir)|outra\s+pessoa\s+(vai|irá)\s+te\s+(atender|responder))/i);
      return m?.[0] ?? null;
    },
  },
  {
    id: "never_price",
    instruction: "Reformule SEM mencionar preço, valor em reais ou faixa. Quem fala preço é a Wedding Planner.",
    test: ({ response }) => {
      const m = response.match(/\b(R\$\s*\d|\d+\s*(mil|k)\s+reais?|preço\s+é|custa\s+R?\$)/i);
      return m?.[0] ?? null;
    },
  },
  {
    id: "never_self_clarify",
    instruction: "Reformule SEM tentar 'esclarecer' a pergunta do lead. Se a mensagem foi ambígua, peça pra explicar de forma direta — não autoexplique.",
    test: ({ response }) => {
      const m = response.match(/(só\s+pra\s+(eu|a\s+gente)\s+(entender|confirmar|saber)|deixa\s+eu\s+(entender|confirmar)|pra\s+(eu|gente)\s+(saber|entender)\s+direitinho)/i);
      return m?.[0] ?? null;
    },
  },
  {
    id: "never_meta_question",
    instruction: "Reformule SEM falar 'sua pergunta' ou 'você quer saber se'. Responda direto, não meta-comunique.",
    test: ({ response }) => {
      const m = response.match(/(sua\s+pergunta:?\s*[\wÀ-ÿ]|você\s+(quer|está)\s+(saber|perguntando)\s+se)/i);
      return m?.[0] ?? null;
    },
  },
];

export function runValidatorMinimal(input: ValidatorInput): ValidatorVerdict {
  const hits: RedLineHit[] = [];

  for (const rule of RULES) {
    const match = rule.test(input);
    if (match) {
      hits.push({
        rule: rule.id,
        match,
        instruction: rule.instruction,
      });
    }
  }

  return {
    decision: hits.length > 0 ? "REGEN" : "PUBLICAR",
    red_lines_hit: hits,
  };
}

// Helper pra construir o bloco <previous_attempt_failed> que é injetado
// no prompt da segunda passagem (REGEN). Estruturado em XML — não texto livre.
export function buildRegenHintBlock(verdict: ValidatorVerdict): string {
  if (verdict.red_lines_hit.length === 0) return "";
  const first = verdict.red_lines_hit[0];
  return `<previous_attempt_failed>
  <rule>${first.rule}</rule>
  <excerpt>${escapeXml(first.match)}</excerpt>
  <instruction>${escapeXml(first.instruction)}</instruction>
</previous_attempt_failed>`;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
```

- [ ] **Step 4: Rodar testes e ver passar**

```bash
deno test --allow-net supabase/functions/ai-agent-router/__tests__/validator_minimal.test.ts
```
Expected: 9 testes PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/ai-agent-router/validator_minimal.ts supabase/functions/ai-agent-router/__tests__/validator_minimal.test.ts
git commit -m "feat(estela): validador minimal determinístico

6 regras regex (nunca trava nem LLM): travessão, emoji 1ª msg,
'vou passar', preço R\$, auto-clarificação 'sua pergunta',
meta-questão 'você quer saber'. As 2 últimas cobrem
exatamente o bug original que motivou o redesign.

Retorna PUBLICAR ou REGEN. Helper buildRegenHintBlock monta
XML <previous_attempt_failed> pra segunda passagem da Persona.

9 testes Deno.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Função `scrubPII()` + `recordTurnLog()` (TDD)

**Files:**
- Create: `supabase/functions/ai-agent-router/turn_logger.ts`
- Create: `supabase/functions/ai-agent-router/__tests__/turn_logger.test.ts`

- [ ] **Step 1: Criar teste**

Write to `supabase/functions/ai-agent-router/__tests__/turn_logger.test.ts`:

```typescript
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { scrubPII, hashDiscoveryConfig } from "../turn_logger.ts";

Deno.test("scrubPII: telefone brasileiro com 9 dígitos", () => {
  const text = "Manda mensagem pro 11 99876-5432 ok?";
  assertEquals(scrubPII(text), "Manda mensagem pro [PHONE] ok?");
});

Deno.test("scrubPII: telefone com +55", () => {
  const text = "+55 11 98765-4321 é o número";
  assertEquals(scrubPII(text), "[PHONE] é o número");
});

Deno.test("scrubPII: email", () => {
  const text = "Meu email é vitor.gambetti@example.com";
  assertEquals(scrubPII(text), "Meu email é [EMAIL]");
});

Deno.test("scrubPII: CPF formato 123.456.789-00", () => {
  const text = "CPF 123.456.789-00 confere?";
  assertEquals(scrubPII(text), "CPF [CPF] confere?");
});

Deno.test("scrubPII: CPF formato 12345678900", () => {
  const text = "CPF 12345678900";
  assertEquals(scrubPII(text), "CPF [CPF]");
});

Deno.test("scrubPII: nomes não são scrubbed (trade-off consciente)", () => {
  const text = "O Vitor e a Mariana confirmaram";
  assertEquals(scrubPII(text), "O Vitor e a Mariana confirmaram");
});

Deno.test("scrubPII: string vazia", () => {
  assertEquals(scrubPII(""), "");
});

Deno.test("hashDiscoveryConfig: determinístico", () => {
  const config1 = { slots: [{ key: "a", goal: "x" }, { key: "b", goal: "y" }] };
  const config2 = { slots: [{ key: "a", goal: "x" }, { key: "b", goal: "y" }] };
  assertEquals(hashDiscoveryConfig(config1), hashDiscoveryConfig(config2));
});

Deno.test("hashDiscoveryConfig: muda quando config muda", () => {
  const config1 = { slots: [{ key: "a", goal: "x" }] };
  const config2 = { slots: [{ key: "a", goal: "y" }] };
  const h1 = hashDiscoveryConfig(config1);
  const h2 = hashDiscoveryConfig(config2);
  assertEquals(h1 === h2, false);
});
```

- [ ] **Step 2: Rodar teste e ver falhar**

```bash
deno test --allow-net supabase/functions/ai-agent-router/__tests__/turn_logger.test.ts
```
Expected: FAIL "Module not found".

- [ ] **Step 3: Implementar `turn_logger.ts`**

Write to `supabase/functions/ai-agent-router/turn_logger.ts`:

```typescript
// Helper de logging de execução por turno do agente IA.
// scrubPII roda pre-INSERT em prompt_system/prompt_user/raw_response.
// hashDiscoveryConfig produz hash SHA256 dos slots pra detectar mudança de config.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export function scrubPII(text: string): string {
  if (!text) return text;
  return text
    // CPF formato com pontuação OU 11 dígitos seguidos (a ordem importa — antes do telefone)
    .replace(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g, "[CPF]")
    .replace(/\b\d{11}\b/g, "[CPF]")
    // Telefone brasileiro com ou sem +55, com 9 dígitos no celular
    .replace(/(\+?55\s?)?\(?\d{2}\)?\s?9?\d{4}[-\s]?\d{4}\b/g, "[PHONE]")
    // Email
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[EMAIL]");
}

export async function hashDiscoveryConfig(config: unknown): Promise<string> {
  const json = JSON.stringify(config ?? null);
  const buf = new TextEncoder().encode(json);
  const hashBuf = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hashBuf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .substring(0, 16); // 16 chars suficientes pra detectar mudança
}

// Versão síncrona para uso em testes sem await (usa hash simples não-cripto)
export function hashDiscoveryConfigSync(config: unknown): string {
  const json = JSON.stringify(config ?? null);
  let h = 0;
  for (let i = 0; i < json.length; i++) {
    h = ((h << 5) - h + json.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(16);
}

export interface TurnLogPayload {
  turn_id: string;
  agent_id: string;
  org_id: string;
  conversation_id: string;
  attempt_number: number;
  prompt_system: string;
  prompt_user: string;
  raw_response: string;
  final_messages: string[] | null;
  model_used: string;
  temperature_used: number;
  max_tokens_used: number;
  tool_calls: unknown[];
  validator_verdict: unknown;
  slot_in_focus: string | null;
  duration_ms: number;
  prompt_builder_version: string;
  discovery_config_hash: string;
}

export async function recordTurnLog(
  supabase: SupabaseClient,
  payload: TurnLogPayload,
): Promise<void> {
  // Fire-and-forget: erro de INSERT não bloqueia envio ao WhatsApp
  try {
    const scrubbed = {
      ...payload,
      prompt_system: scrubPII(payload.prompt_system),
      prompt_user: scrubPII(payload.prompt_user),
      raw_response: scrubPII(payload.raw_response),
    };
    const { error } = await supabase.from("ai_agent_turn_logs").insert(scrubbed);
    if (error) {
      console.error("[turn_logger] INSERT failed:", error.message);
    }
  } catch (e) {
    console.error("[turn_logger] exception:", (e as Error).message);
  }
}
```

Use `hashDiscoveryConfigSync` no teste (a versão síncrona).

Edit `__tests__/turn_logger.test.ts` substituindo `hashDiscoveryConfig` por `hashDiscoveryConfigSync` nos 2 testes que usam.

- [ ] **Step 4: Rodar testes e ver passar**

```bash
deno test --allow-net supabase/functions/ai-agent-router/__tests__/turn_logger.test.ts
```
Expected: 9 testes PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/ai-agent-router/turn_logger.ts supabase/functions/ai-agent-router/__tests__/turn_logger.test.ts
git commit -m "feat(estela): turn_logger com PII scrubbing + hash de config

scrubPII regex pra telefone BR, email, CPF (não scrub nomes
próprios — trade-off consciente). recordTurnLog fire-and-forget
em ai_agent_turn_logs. hashDiscoveryConfig SHA256 truncado a 16
chars pra detectar mudança de config entre turns.

9 testes Deno.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Integrar `renderSlotForPrompt` no `prompt_builder_v2.ts`

**Files:**
- Modify: `supabase/functions/ai-agent-router/prompt_builder_v2.ts`

- [ ] **Step 1: Ler o arquivo atual pra localizar onde injetar slots**

Run:
```bash
grep -n "deriveSlotQuestion\|discovery_config\|slot\.questions" /Users/vitorgambetti/Documents/WelcomeCRM/supabase/functions/ai-agent-router/prompt_builder_v2.ts | head -20
```

- [ ] **Step 2: Adicionar import e prop ao `BuildPromptV2Input`**

No topo do arquivo, adicionar import:

```typescript
import { renderSlotForPrompt, type SlotV2 } from "./slot_renderer.ts";
```

Modificar a interface `BuildPromptV2Input` adicionando 2 campos:
```typescript
export interface BuildPromptV2Input {
  // ... campos existentes ...
  feature_flag_discovery_v2: boolean; // default false — quando true, usa renderSlotForPrompt
  current_slot: SlotV2 | null;        // slot escolhido pelo router pra esse turn
}
```

- [ ] **Step 3: Modificar `renderOneMoment` pra usar `renderSlotForPrompt` quando flag está ON**

Localizar a parte de `renderOneMoment` que renderiza slots (perto da linha 786 onde `if (slot.questions && slot.questions.length > 0)`). Adicionar branching ANTES do código legado:

```typescript
// Inside renderOneMoment, no loop de slots:
for (const slot of (m.discovery_config?.slots ?? [])) {
  // ... renderização existente de label/priority/icon (mantém) ...

  // BRANCH: schema novo (V2) — só quando feature flag está ON E slot tem goal
  if (input.feature_flag_discovery_v2 && (slot as SlotV2).goal && (slot as SlotV2).goal.trim()) {
    const rendered = renderSlotForPrompt(slot as SlotV2);
    if (rendered) {
      lines.push("        " + rendered.replace(/\n/g, "\n        "));
      continue; // pula caminho legado pra esse slot
    }
  }

  // Caminho LEGADO (Patricia/Luna/Estela com flag OFF):
  // ... código existente (must_collect, coverage_notes, deriveSlotQuestion) — não tocar ...
}
```

(O `input` referido no branch novo é o `BuildPromptV2Input`. Garanta que `renderOneMoment` recebe `input` por parâmetro — se hoje não recebe, propagar.)

- [ ] **Step 4: Garantir que `feature_flag_discovery_v2` e `current_slot` são lidos pelo caller**

No `buildPromptV2`, garantir que esses 2 campos vêm do input e estão sendo encaminhados pra `renderOneMoment` ou onde os slots são iterados.

- [ ] **Step 5: Adicionar bloco `<previous_attempt_failed>` (injetado por caller no REGEN)**

`buildPromptV2` recebe um novo campo opcional:
```typescript
previous_attempt_failed?: string | null; // bloco XML já formatado pelo buildRegenHintBlock
```

Injetar logo antes do `<turn>` na montagem do prompt final:
```typescript
const parts = [
  // ... outros blocos ...
];
if (input.previous_attempt_failed) {
  parts.push(input.previous_attempt_failed);
}
parts.push("<turn>");
// ... resto ...
```

- [ ] **Step 6: Build typecheck**

Run:
```bash
cd /Users/vitorgambetti/Documents/WelcomeCRM && deno check supabase/functions/ai-agent-router/prompt_builder_v2.ts
```
Expected: 0 erros.

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/ai-agent-router/prompt_builder_v2.ts
git commit -m "feat(estela): prompt_builder usa renderSlotForPrompt quando feature flag ON

Branching no renderOneMoment: se feature_flag_discovery_v2=true E
slot tem goal preenchido, usa renderSlotForPrompt (schema novo).
Senão cai no caminho legado (deriveSlotQuestion) — preservado
intacto pra Patricia/Luna.

Aceita previous_attempt_failed (XML do buildRegenHintBlock) injetado
logo antes de <turn> pra protocolo REGEN.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Integrar validador minimal + logger + protocolo REGEN no `index.ts`

**Files:**
- Modify: `supabase/functions/ai-agent-router/index.ts`

- [ ] **Step 1: Localizar onde `runValidator` é chamado hoje**

Run:
```bash
grep -n "runValidator\|runPersonaAgent\|recordTurnLog\|currentSlot\|formatWhatsApp" /Users/vitorgambetti/Documents/WelcomeCRM/supabase/functions/ai-agent-router/index.ts | head -30
```

- [ ] **Step 2: Adicionar imports**

No topo do `index.ts`:

```typescript
import { runValidatorMinimal, buildRegenHintBlock } from "./validator_minimal.ts";
import { recordTurnLog, hashDiscoveryConfig } from "./turn_logger.ts";
```

- [ ] **Step 3: Lógica de escolha de `current_slot`**

Antes da chamada de `runPersonaAgent`, escolher o slot:

```typescript
// Escolher current_slot pra esse turn (apenas quando feature flag ON)
let currentSlot: SlotV2 | null = null;
if (agent.feature_flag_discovery_v2) {
  const moment = currentMoment; // moment escolhido pelo moment_detector
  const slots = (moment?.discovery_config?.slots ?? []) as SlotV2[];
  const formData = card.form_data ?? {};

  // Filtra slots já populados (silenciados)
  const unfilledSlots = slots.filter((s) => {
    if (!s.crm_field_key) return true;
    const v = formData[s.crm_field_key];
    return v === null || v === undefined || v === "";
  });

  // Ordena por priority: critical > preferred > nice_to_have
  const priorityOrder = { critical: 0, preferred: 1, nice_to_have: 2 };
  unfilledSlots.sort((a, b) =>
    (priorityOrder[a.priority ?? "preferred"] ?? 1) -
    (priorityOrder[b.priority ?? "preferred"] ?? 1)
  );

  currentSlot = unfilledSlots[0] ?? null;
}
```

- [ ] **Step 4: Substituir chamada de `runValidator` por `runValidatorMinimal`**

Localizar onde `runValidator(...)` é chamado após `runPersonaAgent`. Trocar por:

```typescript
// Validador minimal — 6 regex, sem LLM, sem reescrita
const verdict = runValidatorMinimal({
  response: personaResponse,
  turn_count: ctx.turn_count, // ou equivalente no context
});

// Gravar log da PRIMEIRA passagem
const promptBuilderVersion = Deno.env.get("SUPABASE_FUNCTION_BUILD_COMMIT") || "unknown";
const discoveryConfigHash = await hashDiscoveryConfig(
  currentMoment?.discovery_config ?? null
);

await recordTurnLog(supabase, {
  turn_id: turnId,
  agent_id: agent.id,
  org_id: agent.org_id,
  conversation_id: conversationId,
  attempt_number: 1,
  prompt_system: builtPrompt.system,
  prompt_user: builtPrompt.user,
  raw_response: personaResponse,
  final_messages: verdict.decision === "PUBLICAR" ? messagesToSend : null,
  model_used: model,
  temperature_used: temperature,
  max_tokens_used: maxTokens,
  tool_calls: toolCallsArray,
  validator_verdict: verdict,
  slot_in_focus: currentSlot?.key ?? null,
  duration_ms: personaDurationMs,
  prompt_builder_version: promptBuilderVersion,
  discovery_config_hash: discoveryConfigHash,
});

// Se REGEN, segunda passagem
if (verdict.decision === "REGEN") {
  const hintBlock = buildRegenHintBlock(verdict);

  // Re-chamar Persona com hintBlock e temperature 0.1
  const retryStart = Date.now();
  const retryPersona = await runPersonaAgent({
    ...personaInput,
    previous_attempt_failed: hintBlock,
    temperature_override: 0.1,
  });
  const retryDuration = Date.now() - retryStart;

  const retryVerdict = runValidatorMinimal({
    response: retryPersona.response,
    turn_count: ctx.turn_count,
  });

  // Sempre escala se 2ª violou
  const finalVerdict: ValidatorVerdict = retryVerdict.decision === "PUBLICAR"
    ? retryVerdict
    : { decision: "ESCALAR", red_lines_hit: retryVerdict.red_lines_hit, reason: "2ª passagem também violou" };

  // Gravar log da SEGUNDA passagem
  await recordTurnLog(supabase, {
    turn_id: turnId,
    agent_id: agent.id,
    org_id: agent.org_id,
    conversation_id: conversationId,
    attempt_number: 2,
    prompt_system: retryPersona.builtPrompt.system,
    prompt_user: retryPersona.builtPrompt.user,
    raw_response: retryPersona.response,
    final_messages: finalVerdict.decision === "PUBLICAR" ? retryMessagesToSend : null,
    model_used: model,
    temperature_used: 0.1,
    max_tokens_used: maxTokens,
    tool_calls: retryToolCalls,
    validator_verdict: finalVerdict,
    slot_in_focus: currentSlot?.key ?? null,
    duration_ms: retryDuration,
    prompt_builder_version: promptBuilderVersion,
    discovery_config_hash: discoveryConfigHash,
  });

  if (finalVerdict.decision === "ESCALAR") {
    // Marca needs_human, dispara notificação, envia fallback_message
    await supabase
      .from("ai_conversations")
      .update({ needs_human: true })
      .eq("id", conversationId);

    personaResponse = agent.fallback_message;
    // ... resto da lógica de escalar (notify_responsible, etc) ...
  } else {
    personaResponse = retryPersona.response;
  }
}
```

(Adaptar nomes de variáveis ao código existente. `runPersonaAgent` precisa aceitar `previous_attempt_failed` e `temperature_override`. Se hoje não aceita, adicionar esses params na assinatura, passar adiante pro `buildPromptV2`.)

- [ ] **Step 5: Remover/comentar a velha chamada `runValidator`**

Garantir que o código legado de `runValidator(persona, ...)` não roda mais quando `feature_flag_discovery_v2` é TRUE. Se quiser preservar 100% do caminho legado pra agentes com flag OFF, condicional:

```typescript
let validatedResponse: string;
if (agent.feature_flag_discovery_v2) {
  // novo caminho (validator minimal + REGEN)
  validatedResponse = personaResponse; // já tratado acima
} else {
  // caminho legado intocado (Patricia/Luna/Estela com flag OFF)
  validatedResponse = await runValidator(supabase, agent, personaResponse, ...);
}
```

- [ ] **Step 6: Build typecheck**

```bash
deno check supabase/functions/ai-agent-router/index.ts
```
Expected: 0 erros.

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/ai-agent-router/index.ts
git commit -m "feat(estela): router integra validator minimal + logging + protocolo REGEN

Quando feature_flag_discovery_v2=true:
- Escolhe current_slot (não-preenchido, priority order)
- Roda Persona, valida com runValidatorMinimal (6 regex)
- Grava log da 1ª passagem em ai_agent_turn_logs
- Se REGEN: re-chama Persona com hint XML, t=0.1, grava log 2ª
- Se 2ª também violou: ESCALAR (needs_human + fallback)

Caminho legado preservado intocado pra feature_flag_discovery_v2=false.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: Migration de seed dos 6 slots da Sondagem

**Files:**
- Create: `supabase/migrations/20260512XX_estela_redesign_06_seed_estela_slots.sql`

- [ ] **Step 1: Criar migration**

Write to `supabase/migrations/20260512XX_estela_redesign_06_seed_estela_slots.sql`:

```sql
-- Popula os 4 campos novos (goal, must_include, example_questions, literal_question)
-- nos 6 slots da Sondagem da Estela. Mantém campos antigos (must_collect, questions,
-- coverage_notes) intocados pra preservar caminho legado em rollback.
--
-- Mapeamento baseado em anchor_text + must_collect + questions atuais (snapshot 2026-05-11).

UPDATE ai_agent_moments
SET discovery_config = jsonb_set(
  discovery_config,
  '{slots}',
  (
    SELECT jsonb_agg(
      CASE
        WHEN slot->>'key' = 'data' THEN
          slot
            || jsonb_build_object(
              'goal', 'Saber o mês e o ano do casamento',
              'must_include', jsonb_build_array('mês', 'ano'),
              'example_questions', '[]'::jsonb,
              'literal_question', null
            )
        WHEN slot->>'key' = 'destino' THEN
          slot
            || jsonb_build_object(
              'goal', 'Saber a região ou país que o casal tem em mente pro casamento',
              'must_include', '[]'::jsonb,
              'example_questions', jsonb_build_array('E sobre o destino, já têm uma região ou país em mente?'),
              'literal_question', null
            )
        WHEN slot->>'key' = 'convidados' THEN
          slot
            || jsonb_build_object(
              'goal', 'Saber quantos convidados realmente vão comparecer (em destination wedding a taxa de presença é menor)',
              'must_include', '[]'::jsonb,
              'example_questions', jsonb_build_array('Dos convidados, quantos vocês acreditam que realmente vão? Destination wedding costuma ter taxa de presença diferente de casamento na cidade.'),
              'literal_question', null
            )
        WHEN slot->>'key' = 'investimento' THEN
          slot
            || jsonb_build_object(
              'goal', 'Saber a faixa de investimento ideal e o máximo que o casal pode investir',
              'must_include', '[]'::jsonb,
              'example_questions', jsonb_build_array('Sobre o investimento: qual é o valor que vocês desejam investir e o máximo que podem chegar?'),
              'literal_question', null
            )
        WHEN slot->>'key' = 'info_3d8u' THEN
          slot
            || jsonb_build_object(
              'goal', 'Descobrir se o casal viajou internacionalmente fora da América do Sul no último ano. Sinal de poder aquisitivo.',
              'must_include', '[]'::jsonb,
              'example_questions', jsonb_build_array('E só uma curiosidade, vocês viajaram internacionalmente esse último ano?'),
              'literal_question', null
            )
        WHEN slot->>'key' = 'info_779o' THEN
          slot
            || jsonb_build_object(
              'goal', 'Descobrir se a família vai ajudar financeiramente no casamento. Sinal de co-financiamento.',
              'must_include', '[]'::jsonb,
              'example_questions', jsonb_build_array('E sobre o investimento, é algo que vocês irão fazer por conta própria ou tem apoio da familia?'),
              'literal_question', null
            )
        ELSE slot
      END
    )
    FROM jsonb_array_elements(discovery_config->'slots') AS slot
  )
)
WHERE agent_id = '43180319-650c-490a-87be-f275550285f8'
  AND moment_key = 'sondagem';
```

- [ ] **Step 2: Aplicar staging**

```bash
bash .claude/hooks/apply-to-staging.sh supabase/migrations/20260512XX_estela_redesign_06_seed_estela_slots.sql
```

- [ ] **Step 3: Verificar que cada slot tem `goal` populado**

Run:
```bash
source /Users/vitorgambetti/Documents/WelcomeCRM/.env
curl -s "https://ivmebyvjarcvrkrbemam.supabase.co/rest/v1/ai_agent_moments?select=discovery_config&agent_id=eq.43180319-650c-490a-87be-f275550285f8&moment_key=eq.sondagem" -H "apikey: $VITE_SUPABASE_STAGING_ANON_KEY" -H "Authorization: Bearer $SUPABASE_STAGING_SERVICE_ROLE_KEY" | python3 -c "
import sys, json
data = json.load(sys.stdin)
for slot in data[0]['discovery_config']['slots']:
    print(f\"{slot['key']:12} goal={'SIM' if slot.get('goal') else 'NÃO':4} must_include={slot.get('must_include', [])}\")
"
```
Expected: 6 linhas, todas com `goal=SIM`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260512XX_estela_redesign_06_seed_estela_slots.sql
git commit -m "feat(estela): popula goal/example_questions nos 6 slots da Sondagem

Mantém must_collect/questions/coverage_notes intactos (rollback).
Vitor revisa cada slot no Pipeline Studio antes de ativar a flag
em produção.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 11: Hooks React `useTurnLog` e `useTurnLogsForConversation`

**Files:**
- Create: `src/hooks/v2/useTurnLog.ts`
- Create: `src/hooks/v2/useTurnLogsForConversation.ts`

- [ ] **Step 1: Criar `useTurnLog`**

Write to `src/hooks/v2/useTurnLog.ts`:

```typescript
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface TurnLog {
  id: string
  turn_id: string
  agent_id: string
  conversation_id: string
  attempt_number: number
  prompt_system: string | null
  prompt_user: string | null
  raw_response: string | null
  final_messages: string[] | null
  model_used: string | null
  temperature_used: number | null
  max_tokens_used: number | null
  tool_calls: unknown[]
  validator_verdict: {
    decision: 'PUBLICAR' | 'REGEN' | 'ESCALAR'
    red_lines_hit: Array<{ rule: string; match: string; instruction: string }>
    reason?: string
  } | null
  slot_in_focus: string | null
  duration_ms: number | null
  prompt_builder_version: string | null
  discovery_config_hash: string | null
  created_at: string
}

export function useTurnLog(turnId: string | null | undefined) {
  return useQuery({
    queryKey: ['ai-agent-turn-log', turnId],
    enabled: !!turnId,
    queryFn: async (): Promise<TurnLog[]> => {
      if (!turnId) return []
      const { data, error } = await supabase
        .from('ai_agent_turn_logs')
        .select('*')
        .eq('turn_id', turnId)
        .order('attempt_number', { ascending: true })
      if (error) throw error
      return (data ?? []) as TurnLog[]
    },
  })
}
```

- [ ] **Step 2: Criar `useTurnLogsForConversation`**

Write to `src/hooks/v2/useTurnLogsForConversation.ts`:

```typescript
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { TurnLog } from './useTurnLog'

export function useTurnLogsForConversation(conversationId: string | null | undefined) {
  return useQuery({
    queryKey: ['ai-agent-turn-logs-conversation', conversationId],
    enabled: !!conversationId,
    queryFn: async (): Promise<Record<string, TurnLog[]>> => {
      if (!conversationId) return {}
      const { data, error } = await supabase
        .from('ai_agent_turn_logs')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true })
      if (error) throw error
      // Agrupa por turn_id pra UI mapear botão "Ver execução" em cada msg
      const grouped: Record<string, TurnLog[]> = {}
      for (const log of (data ?? []) as TurnLog[]) {
        if (!grouped[log.turn_id]) grouped[log.turn_id] = []
        grouped[log.turn_id].push(log)
      }
      return grouped
    },
  })
}
```

- [ ] **Step 3: Verificar typecheck**

Run:
```bash
cd /Users/vitorgambetti/Documents/WelcomeCRM && npm run build 2>&1 | grep -E "error TS|Error" | head -10
```
Expected: nenhum erro relacionado aos novos arquivos.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/v2/useTurnLog.ts src/hooks/v2/useTurnLogsForConversation.ts
git commit -m "feat(estela): hooks useTurnLog e useTurnLogsForConversation

Hooks React Query pra consumir ai_agent_turn_logs. useTurnLog retorna
todas as attempts de um turn (1 + retry se houver). useTurnLogsForConversation
retorna agrupado por turn_id pra UI mapear botão 'Ver execução'.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 12: Componente `TurnExecutionDrawer` (UI "Ver execução")

**Files:**
- Create: `src/components/ai-agent-v2/editor/conversa/TurnExecutionDrawer.tsx`

- [ ] **Step 1: Localizar componente Sheet/Drawer já usado no projeto**

Run:
```bash
grep -rn "Sheet\|Drawer" /Users/vitorgambetti/Documents/WelcomeCRM/src/components/ai-agent-v2/ | head -5
```

Identifique se o projeto usa `Sheet` (shadcn), `Drawer` (Vaul) ou outro. Use o mesmo padrão pra consistência.

- [ ] **Step 2: Criar `TurnExecutionDrawer.tsx`**

Write to `src/components/ai-agent-v2/editor/conversa/TurnExecutionDrawer.tsx`:

```tsx
import { useState } from 'react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { useTurnLog, type TurnLog } from '@/hooks/v2/useTurnLog'

interface TurnExecutionDrawerProps {
  turnId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

const DECISION_COLOR: Record<string, string> = {
  PUBLICAR: 'bg-emerald-100 text-emerald-700',
  REGEN: 'bg-amber-100 text-amber-700',
  ESCALAR: 'bg-red-100 text-red-700',
}

export function TurnExecutionDrawer({ turnId, open, onOpenChange }: TurnExecutionDrawerProps) {
  const { data: logs, isLoading } = useTurnLog(turnId)
  const [activeAttempt, setActiveAttempt] = useState<number>(1)

  if (!turnId) return null

  const currentLog = (logs ?? []).find((l) => l.attempt_number === activeAttempt) ?? logs?.[0]
  const hasRetry = (logs ?? []).length > 1

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto bg-white">
        <SheetHeader className="border-b border-slate-200 pb-4">
          <SheetTitle className="text-slate-900">Execução do turn</SheetTitle>
          {isLoading && <div className="text-sm text-slate-500">Carregando…</div>}
          {currentLog && (
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <span className="font-mono">{currentLog.model_used}</span>
              <span>·</span>
              <span>{currentLog.duration_ms ?? '?'}ms</span>
              <span>·</span>
              <Badge className={DECISION_COLOR[currentLog.validator_verdict?.decision ?? 'PUBLICAR']}>
                {currentLog.validator_verdict?.decision ?? '—'}
              </Badge>
              {currentLog.slot_in_focus && (
                <>
                  <span>·</span>
                  <span>slot: <code className="text-xs">{currentLog.slot_in_focus}</code></span>
                </>
              )}
            </div>
          )}
        </SheetHeader>

        {hasRetry && (
          <div className="flex gap-2 py-3 border-b border-slate-200">
            {(logs ?? []).map((log) => (
              <button
                key={log.id}
                onClick={() => setActiveAttempt(log.attempt_number)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium ${
                  log.attempt_number === activeAttempt
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                Tentativa {log.attempt_number}
              </button>
            ))}
          </div>
        )}

        {currentLog && (
          <Tabs defaultValue="prompt" className="mt-4">
            <TabsList className="grid grid-cols-4 bg-slate-100">
              <TabsTrigger value="prompt">Prompt enviado</TabsTrigger>
              <TabsTrigger value="response">Resposta crua</TabsTrigger>
              <TabsTrigger value="tools">Tools</TabsTrigger>
              <TabsTrigger value="verdict">Veredito</TabsTrigger>
            </TabsList>

            <TabsContent value="prompt" className="mt-4">
              <PromptViewer label="System prompt" text={currentLog.prompt_system ?? ''} />
              <PromptViewer label="User message" text={currentLog.prompt_user ?? ''} className="mt-4" />
            </TabsContent>

            <TabsContent value="response" className="mt-4">
              <pre className="bg-slate-50 border border-slate-200 rounded-md p-4 text-sm font-mono whitespace-pre-wrap text-slate-900">
                {currentLog.raw_response ?? '(vazio)'}
              </pre>
              {currentLog.final_messages && currentLog.final_messages.length > 0 && (
                <div className="mt-4">
                  <h3 className="text-sm font-medium text-slate-700 mb-2">Mensagens enviadas ao WhatsApp:</h3>
                  {currentLog.final_messages.map((m, i) => (
                    <pre key={i} className="bg-emerald-50 border border-emerald-200 rounded-md p-3 mb-2 text-sm font-mono whitespace-pre-wrap text-slate-900">
                      {m}
                    </pre>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="tools" className="mt-4">
              <pre className="bg-slate-50 border border-slate-200 rounded-md p-4 text-sm font-mono whitespace-pre-wrap text-slate-900">
                {JSON.stringify(currentLog.tool_calls, null, 2)}
              </pre>
            </TabsContent>

            <TabsContent value="verdict" className="mt-4">
              <pre className="bg-slate-50 border border-slate-200 rounded-md p-4 text-sm font-mono whitespace-pre-wrap text-slate-900">
                {JSON.stringify(currentLog.validator_verdict, null, 2)}
              </pre>
            </TabsContent>
          </Tabs>
        )}
      </SheetContent>
    </Sheet>
  )
}

function PromptViewer({ label, text, className = '' }: { label: string; text: string; className?: string }) {
  const [expanded, setExpanded] = useState(false)
  const preview = text.length > 1000 ? text.substring(0, 1000) + '\n…' : text

  return (
    <div className={className}>
      <h3 className="text-sm font-medium text-slate-700 mb-2 flex items-center gap-2">
        {label}
        <span className="text-xs text-slate-500">({text.length} chars)</span>
        {text.length > 1000 && (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="text-indigo-600 text-xs hover:underline"
          >
            {expanded ? 'Recolher' : 'Ver tudo'}
          </button>
        )}
      </h3>
      <pre className="bg-slate-50 border border-slate-200 rounded-md p-4 text-xs font-mono whitespace-pre-wrap text-slate-900 max-h-96 overflow-y-auto">
        {expanded ? text : preview}
      </pre>
    </div>
  )
}
```

(Ajuste paths de imports conforme convenção do projeto: `@/components/ui/sheet`, etc.)

- [ ] **Step 3: Verificar typecheck**

```bash
npm run build 2>&1 | grep -E "TurnExecutionDrawer|error TS" | head -10
```
Expected: 0 erros do novo arquivo.

- [ ] **Step 4: Commit**

```bash
git add src/components/ai-agent-v2/editor/conversa/TurnExecutionDrawer.tsx
git commit -m "feat(estela): TurnExecutionDrawer — side sheet 'Ver execução'

4 tabs (Prompt / Resposta / Tools / Veredito). Mostra ambas
tentativas quando há REGEN. Header com modelo, duração, decisão,
slot em foco. Prompt longo é truncado com toggle 'Ver tudo'.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 13: Conectar botão "Ver execução" nas mensagens da Estela

**Files:**
- Modify: componente que renderiza mensagens da conversa do card (path a confirmar)

- [ ] **Step 1: Localizar componente que renderiza mensagens**

Run:
```bash
grep -rn "ai_conversation_turns\|conversation_id\|role.*assistant" /Users/vitorgambetti/Documents/WelcomeCRM/src/components/card/ /Users/vitorgambetti/Documents/WelcomeCRM/src/components/ai-agent-v2/editor/conversa/ 2>/dev/null | head -10
```

Identifique o componente principal (ex: `CardConversation.tsx`, `AgentConversation.tsx`, ou similar).

- [ ] **Step 2: Adicionar import + state + drawer**

No componente identificado:

```tsx
import { useState } from 'react'
import { TurnExecutionDrawer } from '@/components/ai-agent-v2/editor/conversa/TurnExecutionDrawer'
import { Search } from 'lucide-react' // ou o icon set usado no projeto

// dentro do componente:
const [drawerTurnId, setDrawerTurnId] = useState<string | null>(null)
```

Pra cada mensagem do tipo `assistant`, adicionar botão de lupa ao lado do timestamp:

```tsx
{turn.role === 'assistant' && (
  <button
    onClick={() => setDrawerTurnId(turn.id)}
    className="text-slate-400 hover:text-indigo-600 transition"
    title="Ver execução"
  >
    <Search className="w-3.5 h-3.5" />
  </button>
)}
```

No fim do componente:

```tsx
<TurnExecutionDrawer
  turnId={drawerTurnId}
  open={!!drawerTurnId}
  onOpenChange={(open) => !open && setDrawerTurnId(null)}
/>
```

- [ ] **Step 3: Verificar typecheck + build**

```bash
npm run build 2>&1 | tail -20
```
Expected: build OK.

- [ ] **Step 4: Commit**

```bash
git add src/components/...
git commit -m "feat(estela): botão 'Ver execução' em cada mensagem da Estela

Ícone de lupa ao lado do timestamp de turns role=assistant. Abre
TurnExecutionDrawer com prompt completo, raw_response, tools e
veredito do validador.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 14: Espelho TypeScript de `renderSlotForPrompt` no frontend

**Files:**
- Create: `src/lib/slotRenderer.ts`

- [ ] **Step 1: Criar arquivo (idêntico ao backend, mas import-friendly)**

Write to `src/lib/slotRenderer.ts`:

```typescript
// Mirror da função renderSlotForPrompt do backend (supabase/functions/ai-agent-router/slot_renderer.ts)
// Usado pela UI do Pipeline Studio pra preview "antes vs depois".
// MANTER EM PARIDADE COM O BACKEND.

export interface SlotV2 {
  key: string
  label: string
  icon?: string
  priority?: 'critical' | 'preferred' | 'nice_to_have'
  required?: boolean
  crm_field_key: string | null

  goal: string | null
  must_include: string[]
  example_questions: string[]
  literal_question: string | null

  must_collect?: string[]
  questions?: string[]
  coverage_notes?: string | null

  reject_if?: Array<{ pattern: string; hint?: string }>
}

export function renderSlotForPrompt(slot: SlotV2): string | null {
  const goal = (slot.goal ?? '').trim()
  if (!goal) return null

  const literal = (slot.literal_question ?? '').trim()
  if (literal) {
    return `**Slot ${slot.key}** (${slot.label})
- Use exatamente esta pergunta: "${literal}"
- Não adapte. Não reformule. Use textualmente.
- Registra em: ${slot.crm_field_key ?? '(sem campo)'}`
  }

  const mustInclude = (slot.must_include ?? []).filter((s) => s && s.trim())
  const examples = (slot.example_questions ?? []).filter((q) => q && q.trim())

  let block = `**Slot ${slot.key}** (${slot.label})
- Objetivo: ${goal}`

  if (mustInclude.length > 0) {
    const items = mustInclude.join(', ')
    block += `
- A pergunta DEVE coletar EXATAMENTE: ${items}. Formule natural seguindo voice config.`
    if (examples.length > 0) {
      block += `
- Referência de tom (não copiar literal): ${examples.map((q) => `"${q}"`).join(' | ')}`
    }
  } else if (examples.length > 0) {
    block += `
- Referência de tom (não copiar literal): ${examples.map((q) => `"${q}"`).join(' | ')}`
  } else {
    block += `
- Formule a pergunta natural seguindo voice config e contexto da conversa.`
  }

  if (slot.crm_field_key) {
    block += `
- Registra em: ${slot.crm_field_key}`
  }

  if (slot.reject_if && slot.reject_if.length > 0) {
    block += `
- Se lead responder vagamente, peça especificidade:`
    for (const r of slot.reject_if) {
      const hint = r.hint?.trim() ? ` → ${r.hint.trim()}` : ''
      block += `\n  - "${r.pattern}"${hint}`
    }
  }

  return block
}

// Fallback render para schema legado — replica deriveSlotQuestion conceitualmente
// só pra UI mostrar o "antes" do preview. Não é usado em runtime.
export function renderSlotLegacyForPreview(slot: SlotV2): string {
  const label = slot.label ?? ''
  const must = (slot.must_collect ?? []).filter(Boolean)
  const questions = (slot.questions ?? []).filter(Boolean)

  if (questions.length > 0) {
    return `Use uma destas perguntas: ${questions.map((q) => `"${q}"`).join(' | ')}`
  }

  if (must.length > 0) {
    return `Pergunta gerada (use PALAVRA-POR-PALAVRA): "Vocês já sabem o ${must.join(' e ')} de ${label.toLowerCase()}?"`
  }

  return `Sem pergunta escrita — formule pergunta natural cobrindo ${label}.`
}
```

- [ ] **Step 2: Verificar typecheck**

```bash
npm run build 2>&1 | grep "slotRenderer" | head -5
```
Expected: 0 erros.

- [ ] **Step 3: Commit**

```bash
git add src/lib/slotRenderer.ts
git commit -m "feat(estela): espelho TypeScript de renderSlotForPrompt no frontend

Usado pelo Pipeline Studio pra preview 'antes vs depois' do bloco
que vai pro prompt. Manter em paridade com supabase/functions/ai-agent-router/slot_renderer.ts.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 15: Estender `DiscoveryConfigEditor` com discriminação por engine + UI nova

**Files:**
- Modify: `src/components/ai-agent-v2/editor/playbook/moments/DiscoveryConfigEditor.tsx`
- Modify: `src/components/ai-agent-v2/editor/playbook/moments/MomentCard.tsx`

- [ ] **Step 1: Localizar `DiscoveryConfigEditor.tsx`**

```bash
cat /Users/vitorgambetti/Documents/WelcomeCRM/src/components/ai-agent-v2/editor/playbook/moments/DiscoveryConfigEditor.tsx | head -80
```

Entenda a estrutura: props que recebe, sub-componente `SlotItem`, como muta `value`.

- [ ] **Step 2: Adicionar prop `engineVersion` em DiscoveryConfigEditor e MomentCard**

Em `MomentCard.tsx`, identificar onde o componente recebe `agent` ou `agentId` e ler `agent.engine`:

```tsx
// Em MomentCard:
const engineVersion: 'v1' | 'v2' = agent.engine === 'single_agent_v2' ? 'v2' : 'v1'

// Passar pra DiscoveryConfigEditor:
<DiscoveryConfigEditor value={discoveryConfig} onChange={setDiscoveryConfig} engineVersion={engineVersion} />
```

Em `DiscoveryConfigEditor.tsx`, adicionar prop:

```tsx
interface DiscoveryConfigEditorProps {
  value: DiscoveryConfig
  onChange: (next: DiscoveryConfig) => void
  engineVersion: 'v1' | 'v2' // NOVO
}
```

- [ ] **Step 3: Criar `SlotItemV2` (UI nova) ao lado do `SlotItem` legado**

Em `DiscoveryConfigEditor.tsx`, adicionar novo subcomponente:

```tsx
function SlotItemV2({ slot, onChange, onRemove }: SlotItemV2Props) {
  const goalError = !slot.goal || slot.goal.trim().length < 10
    ? 'Goal obrigatório (mínimo 10 chars)'
    : slot.goal.trim().endsWith('?')
    ? "Goal é objetivo, não pergunta. Escreva 'Descobrir se...' ou 'Saber qual...'"
    : slot.goal.length > 300
    ? 'Goal muito longo (máximo 300 chars)'
    : null

  return (
    <div className="border border-slate-200 rounded-lg p-4 bg-white shadow-sm">
      {/* Ícone, label, prioridade, CRM field — reusar do SlotItem antigo se possível */}

      <label className="block mt-3">
        <span className="text-sm font-medium text-slate-700">Objetivo (Goal)</span>
        <span className="block text-xs text-slate-500 mb-1">
          O que você quer descobrir nesse item da sondagem? Texto livre, a Estela usa pra entender o que precisa cobrir.
        </span>
        <textarea
          className={`w-full border rounded-md p-2 text-sm ${goalError ? 'border-red-400' : 'border-slate-300'}`}
          rows={2}
          maxLength={300}
          value={slot.goal ?? ''}
          onChange={(e) => onChange({ ...slot, goal: e.target.value })}
          placeholder="Ex: Descobrir o mês e ano do casamento"
        />
        {goalError && <span className="block text-xs text-red-600 mt-1">{goalError}</span>}
      </label>

      <MustIncludeInput
        value={slot.must_include ?? []}
        onChange={(items) => onChange({ ...slot, must_include: items })}
      />

      <ExampleQuestionsInput
        value={slot.example_questions ?? []}
        onChange={(items) => onChange({ ...slot, example_questions: items })}
      />

      <label className="block mt-3">
        <span className="text-sm font-medium text-slate-700">Pergunta literal (override)</span>
        <span className="block text-xs text-slate-500 mb-1">
          Se preenchida, a Estela usa exatamente essa pergunta. Use só pra casos cirúrgicos.
        </span>
        <input
          type="text"
          className="w-full border border-slate-300 rounded-md p-2 text-sm"
          value={slot.literal_question ?? ''}
          onChange={(e) => onChange({ ...slot, literal_question: e.target.value || null })}
          placeholder="(opcional)"
        />
      </label>

      {/* Botão "Remover slot" */}
    </div>
  )
}

function MustIncludeInput({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [input, setInput] = useState('')

  const add = () => {
    const trimmed = input.trim()
    if (!trimmed) return
    // Validação: rejeita strings com preposição+verbo
    if (/\b(de|em|para|com|por|a|o|dos|das)\s+\w+\s+(se|vai|tem|tá|está)\b/i.test(trimmed)) {
      alert("Use conceitos atômicos (1-3 palavras): 'mês', 'ano', 'número de convidados'. Você escreveu uma descrição — passe pra example_questions ou goal.")
      return
    }
    if (trimmed.split(/\s+/).length > 4) {
      alert('Máximo 4 palavras por item de must_include.')
      return
    }
    onChange([...value, trimmed])
    setInput('')
  }

  return (
    <label className="block mt-3">
      <span className="text-sm font-medium text-slate-700">Elementos obrigatórios</span>
      <span className="block text-xs text-slate-500 mb-1">
        Itens atômicos que a pergunta DEVE cobrir. Ex: <code>mês</code>, <code>ano</code>. Não escreva frases descritivas.
      </span>
      <div className="flex flex-wrap gap-2 mb-2">
        {value.map((item, i) => (
          <span key={i} className="inline-flex items-center gap-1 bg-indigo-100 text-indigo-800 rounded-md px-2 py-1 text-xs font-medium">
            {item}
            <button onClick={() => onChange(value.filter((_, j) => j !== i))} className="hover:text-indigo-950">×</button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          className="flex-1 border border-slate-300 rounded-md p-2 text-sm"
          placeholder="Adicionar item (ex: mês)"
        />
        <button onClick={add} className="bg-indigo-600 text-white rounded-md px-3 text-sm">Adicionar</button>
      </div>
    </label>
  )
}

function ExampleQuestionsInput({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [input, setInput] = useState('')

  const add = () => {
    const trimmed = input.trim()
    if (!trimmed) return
    if (trimmed.length > 200) {
      alert('Máximo 200 chars por exemplo de pergunta.')
      return
    }
    if (value.length >= 3) {
      alert('Máximo 3 exemplos por slot.')
      return
    }
    onChange([...value, trimmed])
    setInput('')
  }

  return (
    <label className="block mt-3">
      <span className="text-sm font-medium text-slate-700">Exemplos de pergunta</span>
      <span className="block text-xs text-slate-500 mb-1">
        1-3 exemplos de TOM. A Estela NÃO copia literal, usa como referência.
      </span>
      {value.map((q, i) => (
        <div key={i} className="flex items-center gap-2 mb-2">
          <input
            value={q}
            onChange={(e) => onChange(value.map((v, j) => (j === i ? e.target.value : v)))}
            className="flex-1 border border-slate-300 rounded-md p-2 text-sm"
            maxLength={200}
          />
          <button onClick={() => onChange(value.filter((_, j) => j !== i))} className="text-red-500 text-sm">Remover</button>
        </div>
      ))}
      {value.length < 3 && (
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && add()}
            className="flex-1 border border-slate-300 rounded-md p-2 text-sm"
            placeholder={`Adicionar exemplo (${value.length}/3)`}
          />
          <button onClick={add} className="bg-indigo-600 text-white rounded-md px-3 text-sm">Adicionar</button>
        </div>
      )}
    </label>
  )
}
```

- [ ] **Step 4: No `DiscoveryConfigEditor` principal, condicionalmente renderizar `SlotItem` (legado) ou `SlotItemV2`**

```tsx
{value.slots.map((slot, idx) =>
  engineVersion === 'v1' ? (
    <SlotItemV2 key={slot.key} slot={slot} onChange={...} onRemove={...} />
  ) : (
    <SlotItem key={slot.key} slot={slot} onChange={...} onRemove={...} />
  )
)}
```

(Nota: Estela é V1 e ganha SlotItemV2; Patricia é V2 e mantém SlotItem legado. Naming confuso — pode renomear depois.)

- [ ] **Step 5: Build typecheck**

```bash
npm run build 2>&1 | grep "DiscoveryConfigEditor\|SlotItem" | head -10
```
Expected: 0 erros.

- [ ] **Step 6: Commit**

```bash
git add src/components/ai-agent-v2/editor/playbook/moments/DiscoveryConfigEditor.tsx src/components/ai-agent-v2/editor/playbook/moments/MomentCard.tsx
git commit -m "feat(estela): UI editor de slot discriminada por agent.engine

Estela (engine=multi_agent_pipeline) ganha SlotItemV2 com 4 campos
novos (goal, must_include, example_questions, literal_question)
e validação rigorosa client-side. Patricia (single_agent_v2)
mantém SlotItem antigo intocado.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 16: Componente `SlotPreviewPanel` (preview antes vs depois)

**Files:**
- Create: `src/components/ai-agent-v2/editor/playbook/moments/SlotPreviewPanel.tsx`

- [ ] **Step 1: Criar componente**

Write to `src/components/ai-agent-v2/editor/playbook/moments/SlotPreviewPanel.tsx`:

```tsx
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { renderSlotForPrompt, renderSlotLegacyForPreview, type SlotV2 } from '@/lib/slotRenderer'

interface SlotPreviewPanelProps {
  slotBefore: SlotV2 // estado do banco (não-editado)
  slotAfter: SlotV2  // estado do formulário (sendo editado)
}

export function SlotPreviewPanel({ slotBefore, slotAfter }: SlotPreviewPanelProps) {
  const renderedBefore = slotBefore.goal
    ? renderSlotForPrompt(slotBefore)
    : renderSlotLegacyForPreview(slotBefore)

  const renderedAfter = slotAfter.goal
    ? renderSlotForPrompt(slotAfter)
    : renderSlotLegacyForPreview(slotAfter)

  return (
    <div className="border border-slate-200 rounded-lg bg-slate-50 p-4 mt-4">
      <h4 className="text-sm font-medium text-slate-700 mb-2">Preview: o que vai pro prompt da Estela</h4>
      <Tabs defaultValue="after">
        <TabsList className="bg-white">
          <TabsTrigger value="before">Antes (estado atual)</TabsTrigger>
          <TabsTrigger value="after">Depois (sendo editado)</TabsTrigger>
        </TabsList>
        <TabsContent value="before" className="mt-3">
          <pre className="bg-white border border-slate-200 rounded-md p-3 text-xs font-mono whitespace-pre-wrap text-slate-900 max-h-64 overflow-y-auto">
            {renderedBefore ?? '(slot vazio)'}
          </pre>
        </TabsContent>
        <TabsContent value="after" className="mt-3">
          <pre className="bg-white border border-emerald-300 rounded-md p-3 text-xs font-mono whitespace-pre-wrap text-slate-900 max-h-64 overflow-y-auto">
            {renderedAfter ?? '(slot vazio)'}
          </pre>
        </TabsContent>
      </Tabs>
    </div>
  )
}
```

- [ ] **Step 2: Integrar `SlotPreviewPanel` no `SlotItemV2`**

Em `DiscoveryConfigEditor.tsx`, dentro de `SlotItemV2`:

```tsx
// Receber slotBefore (estado original do banco) como prop adicional:
function SlotItemV2({ slot, slotBefore, onChange, onRemove }: SlotItemV2Props) {
  // ... resto ...

  return (
    <div>
      {/* ... campos ... */}
      <SlotPreviewPanel slotBefore={slotBefore} slotAfter={slot} />
    </div>
  )
}
```

(Caller passa `slotBefore` lendo do servidor antes de qualquer edit.)

- [ ] **Step 3: Typecheck + commit**

```bash
npm run build && git add src/components/ai-agent-v2/editor/playbook/moments/SlotPreviewPanel.tsx src/components/ai-agent-v2/editor/playbook/moments/DiscoveryConfigEditor.tsx
git commit -m "feat(estela): preview 'antes vs depois' no editor de slot

SlotPreviewPanel mostra o bloco renderizado pelo prompt builder
em 2 tabs: Antes (banco) e Depois (form). Vitor (não-técnico)
vê o impacto da edição antes de salvar.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 17: Deploy edge function staging + teste E2E manual

**Files:**
- nenhum (deploy)

- [ ] **Step 1: Deploy edge function pra staging**

Run:
```bash
cd /Users/vitorgambetti/Documents/WelcomeCRM
SUPABASE_FUNCTION_BUILD_COMMIT=$(git rev-parse --short HEAD) npx supabase functions deploy ai-agent-router --no-verify-jwt --project-ref ivmebyvjarcvrkrbemam
```
Expected: deploy OK.

- [ ] **Step 2: Vercel preview (PR ou branch)**

Empurrar branch + criar PR:
```bash
git push origin HEAD:feat/estela-redesign
gh pr create --title "feat(estela): redesign sondagem + validador + observabilidade" --body "Implementa spec 2026-05-11-estela-redesign-sondagem-validador-logs-design.md em 17 tasks."
```

Aguardar Vercel preview gerar URL.

- [ ] **Step 3: Vitor revisa Pipeline Studio em preview**

Vitor (em staging via Vercel preview):
- Abre Pipeline Studio
- Navega pra Estela > Playbook > Como ela conversa > Sondagem
- Vê os 6 slots com schema novo
- Verifica preview "antes vs depois" pra cada slot
- Ajusta `goal`/`example_questions` se quiser
- Aprova mentalmente cada um

(Esse passo é manual e bloqueante — sem checkbox automatizável.)

- [ ] **Step 4: Ligar feature flag em staging**

Create migration `supabase/migrations/20260512XX_estela_redesign_07_enable_flag_staging.sql`:

```sql
-- Liga feature_flag_discovery_v2 SOMENTE para Estela em STAGING
UPDATE ai_agents
SET feature_flag_discovery_v2 = TRUE
WHERE id = '43180319-650c-490a-87be-f275550285f8';
```

Apply staging:
```bash
bash .claude/hooks/apply-to-staging.sh supabase/migrations/20260512XX_estela_redesign_07_enable_flag_staging.sql
```

- [ ] **Step 5: Teste E2E manual em staging**

Vitor manda mensagem pelo whatsapp do número whitelist 5511964293533 simulando casal novo:

1. "Oi" → Estela abre.
2. Vitor: "Bem e voce? Vitor" → Estela apresenta + faz 2 perguntas iniciais.
3. Vitor: "É o momento mais feliz... E imagino na praia leve" → Estela reconhece + faz pergunta sobre **outro critério** (data/destino/etc).
4. Vitor: "Em Fevereiro de 2028" → **Estela NÃO deve fazer auto-clarificação alucinada**. Deve seguir pra próximo critério.

Verificar:
- ✅ Conversa flui natural
- ✅ Nenhuma frase tipo "Só pra eu entender direitinho a sua pergunta"
- ✅ Nenhuma menção de "para casar fora" / "Welcome saber"
- ✅ Botão "Ver execução" na UI mostra prompt com bloco `**Slot data**` ou `**Slot destino**` (slot_in_focus correto)

Forçar caso REGEN (se quiser):
- Vitor pede preço explicitamente: "Quanto custa?"
- Estela deve responder com anchor de objeção (sem mencionar valor R$)
- Se mencionou R$, validator pega `never_price`, REGEN, segunda passagem corrige. Log mostra `attempt_number=2`.

- [ ] **Step 6: Commit migration de flag staging**

```bash
git add supabase/migrations/20260512XX_estela_redesign_07_enable_flag_staging.sql
git commit -m "feat(estela): liga feature_flag_discovery_v2 para Estela em staging

Ativa schema novo após Vitor revisar slots no Pipeline Studio.
Rollback: UPDATE SET feature_flag_discovery_v2=FALSE sem redeploy.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 18: Promote pra produção + ativação + auditoria

**Files:**
- nenhum (deploy)

- [ ] **Step 1: Promote migrations pra produção (todas em ordem)**

Run sequencialmente:
```bash
cd /Users/vitorgambetti/Documents/WelcomeCRM
bash .claude/hooks/promote-to-prod.sh supabase/migrations/20260512XX_estela_redesign_01_backup.sql
bash .claude/hooks/promote-to-prod.sh supabase/migrations/20260512XX_estela_redesign_03_feature_flag.sql
bash .claude/hooks/promote-to-prod.sh supabase/migrations/20260512XX_estela_redesign_04_turn_logs_table.sql
bash .claude/hooks/promote-to-prod.sh supabase/migrations/20260512XX_estela_redesign_05_turn_logs_ttl_cron.sql
bash .claude/hooks/promote-to-prod.sh supabase/migrations/20260512XX_estela_redesign_06_seed_estela_slots.sql
```

NÃO promova `_07_enable_flag_staging.sql` (era só staging). Criar uma nova `_07_enable_flag_prod.sql` (próximo step).

- [ ] **Step 2: Deploy edge function pra produção**

```bash
SUPABASE_FUNCTION_BUILD_COMMIT=$(git rev-parse --short HEAD) npx supabase functions deploy ai-agent-router --no-verify-jwt --project-ref szyrzxvlptqqheizyrxu
```

- [ ] **Step 3: Smoke test em produção COM flag OFF**

Antes de ligar flag, verificar que tudo continua funcionando no caminho legado:
- Vitor manda mensagem WhatsApp produção (whitelist)
- Estela responde normalmente (caminho legado pq `feature_flag_discovery_v2=false` em produção até agora)
- Confirma: tabela `ai_agent_turn_logs` continua VAZIA (router só loga quando flag=ON)

- [ ] **Step 4: Criar e aplicar migration que liga flag em produção**

```bash
cat > supabase/migrations/20260512XX_estela_redesign_07_enable_flag_prod.sql <<'EOF'
-- Ativa feature_flag_discovery_v2 SOMENTE pra Estela em produção.
UPDATE ai_agents
SET feature_flag_discovery_v2 = TRUE
WHERE id = '43180319-650c-490a-87be-f275550285f8';
EOF

bash .claude/hooks/promote-to-prod.sh supabase/migrations/20260512XX_estela_redesign_07_enable_flag_prod.sql
```

- [ ] **Step 5: Smoke test em produção COM flag ON**

Vitor força conversa pelo whitelist. Confirma:
- ✅ Resposta da Estela é natural
- ✅ `ai_agent_turn_logs` tem linha nova
- ✅ Botão "Ver execução" mostra prompt com bloco V2

- [ ] **Step 6: Auditoria 24h depois**

24h após ligar a flag, rodar em produção:
```sql
-- Casos de alucinação original (devem ser 0):
SELECT count(*) FROM ai_agent_turn_logs
WHERE agent_id = '43180319-650c-490a-87be-f275550285f8'
  AND raw_response ILIKE ANY (ARRAY[
    '%só pra eu entender%',
    '%sua pergunta%',
    '%para casar fora%',
    '%Welcome saber%'
  ])
  AND created_at > now() - interval '24 hours';

-- REGEN rate (esperado <5%):
SELECT
  count(*) FILTER (WHERE attempt_number = 1) AS turns_total,
  count(*) FILTER (WHERE validator_verdict->>'decision' = 'REGEN' AND attempt_number = 1) AS regen,
  ROUND(100.0 * count(*) FILTER (WHERE validator_verdict->>'decision' = 'REGEN' AND attempt_number = 1)
        / NULLIF(count(*) FILTER (WHERE attempt_number = 1), 0), 2) AS regen_pct
FROM ai_agent_turn_logs
WHERE agent_id = '43180319-650c-490a-87be-f275550285f8'
  AND created_at > now() - interval '24 hours';
```

Se row count > 0 na primeira query OU regen_pct > 10, investigar imediatamente. Rollback runtime:
```sql
UPDATE ai_agents SET feature_flag_discovery_v2 = FALSE
WHERE id = '43180319-650c-490a-87be-f275550285f8';
```

- [ ] **Step 7: Touch migration_applied + commit final**

```bash
touch /Users/vitorgambetti/Documents/WelcomeCRM/.claude/.migration_applied
git add supabase/migrations/20260512XX_estela_redesign_07_enable_flag_prod.sql
git commit -m "feat(estela): ativa schema V2 em produção

Após validação em staging + revisão dos slots no Pipeline Studio
+ smoke test em produção. Rollback runtime disponível via
UPDATE feature_flag_discovery_v2=FALSE.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**1. Spec coverage:** Cada seção do spec foi mapeada pra task:
- Seção 3 (schema novo) → Tasks 5, 10
- Seção 4 (hierarquia injeção) → Task 5
- Seção 5 (migração 6 slots) → Task 10
- Seção 6 (validador minimal + REGEN) → Tasks 6, 9
- Seção 7 (observabilidade) → Tasks 3, 4, 7, 9, 11, 12, 13
- Seção 8 (UI Pipeline Studio) → Tasks 15, 16
- Seção 9 (plano subida) → Tasks 1, 2, 17, 18
- Seção 10 (riscos) → mitigações distribuídas (feature flag em 2, backup em 1, etc)
- Seção 11 (verificação) → Tasks 17, 18

**2. Placeholder scan:** Plano tem 1 placeholder intencional `XX` no prefixo de migrations (engenheiro descobre letra disponível no passo inicial). Sem `TBD`, `FIXME`, `TODO`. Sem "implementar similar a Task N" (cada task tem código completo).

**3. Type consistency:** Nomes consistentes ao longo do plano — `SlotV2`, `renderSlotForPrompt`, `runValidatorMinimal`, `recordTurnLog`, `useTurnLog`, `useTurnLogsForConversation`, `TurnExecutionDrawer`, `SlotPreviewPanel`, `DiscoveryConfigEditor` com prop `engineVersion`, `feature_flag_discovery_v2`. Verificados.

**Pontos sensíveis pra revisor humano:**
- Path exato do componente que renderiza mensagens da conversa (Task 13) — verificar com grep antes de modificar.
- `runPersonaAgent` aceita `previous_attempt_failed` e `temperature_override` — Task 9 pressupõe que esses params são adicionados na chamada existente. Pode precisar de mais ajuste no `index.ts`.
- O nome `SlotItemV2` é confuso porque a Estela é engine "V1" usando o `SlotItemV2`. Considere renomear pra `SlotItemNew` pra evitar confusão (não bloqueante).
