# RPC Auditoria: Julia vs Luna (agent_*)

**Data:** 2026-04-14  
**Status:** Auditoria completa de 3 RPCs críticas

---

## Resumo Executivo

| RPC Pair | Status | Divergências Críticas | Ação Sugerida |
|----------|--------|----------------------|---------------|
| `check_calendar` | ⚠️ DIVERGEM | Retorno estrutura diferente; lucia retorna `available_slots`, agent só `booked_slots` | Alinhar agent_check_calendar |
| `assign_tag` | ⚠️ DIVERGEM | Julia usa table `card_tags` + `card_tag_assignments`; agent usa table `tags` + `card_tags` | Alinhar data model |
| `request_handoff` | ⚠️ DIVERGEM | Julia busca contato; agent não; Julia cria atividade tipo `handoff`, agent usa `nota` | Alinhar campos retornados |

---

## Detalhe 1: check_calendar

### Julia (20260305_julia_calendar_tags.sql)

```sql
CREATE OR REPLACE FUNCTION julia_check_calendar(
    p_owner_id UUID,
    p_date_from DATE DEFAULT CURRENT_DATE,
    p_date_to DATE DEFAULT (CURRENT_DATE + 5)
) RETURNS JSONB AS $$
-- Retorna:
-- {
--   'profile_nome': string,
--   'owner_id': uuid,
--   'range': { from: date, to: date },
--   'busy_slots': [ { date, time, duration_minutes, titulo }, ... ],
--   'available_slots': [ { date, weekday, time }, ... ]  ← JULIA TEM ISSO
-- }
```

**Características:**
- Retorna **slots DISPONÍVEIS** (calculados subtraindo ocupados do grid 09:00-17:30 seg-sex)
- Busca reuniões com tipo em `('reuniao', 'meeting')` — aceita ambos
- Retorna `profile_nome` junto (context enriquecido)
- Trata timezone explicitamente: `AT TIME ZONE 'America/Sao_Paulo'`
- Limita slots disponíveis a 10
- Filtra por `deleted_at IS NULL` nas tarefas

### Agent (20260411_agent_builder_schema.sql)

```sql
CREATE OR REPLACE FUNCTION agent_check_calendar(
  p_owner_id UUID,
  p_date_from DATE DEFAULT CURRENT_DATE,
  p_date_to DATE DEFAULT NULL
)
-- Retorna:
-- {
--   'owner_id': uuid,
--   'date_from': date,
--   'date_to': date,
--   'booked_slots': [ { date, time, title, duration_min }, ... ],
--   'working_hours': { start, end, days, slot_duration_min, timezone }
-- }
```

**Características:**
- Retorna apenas **slots OCUPADOS**, não disponíveis
- Busca reuniões com tipo = `'reuniao'` (não aceita `'meeting'`)
- Não retorna `profile_nome`
- Não trata timezone explicitamente (usa CURRENT_DATE direto)
- Retorna `working_hours` como referência, mas não calcula slots disponíveis

### Divergências Críticas

| Aspecto | Julia | Agent | Impacto |
|---------|-------|-------|--------|
| **Slots disponíveis** | Calcula | Não calcula | Luna precisa fazer cálculo próprio em edge function |
| **Tipos de reunião** | `('reuniao', 'meeting')` | `'reuniao'` apenas | Pode perder meetings tipo "meeting" (edge case) |
| **Profile nome** | Retorna | Não retorna | Agent precisa fazer lookup adicional pra contexto |
| **Timezone** | Explícito `AT TIME ZONE` | Implícito | Agent assume timezone servidor; risco se servidor não está em -03:00 |

### Recomendação

✅ **Alinhar agent_check_calendar para calcular slots disponíveis e retornar `profile_nome`.**  
Risco baixo: é pura adição de lógica, sem quebra de compatibilidade.

---

## Detalhe 2: assign_tag

### Julia (20260305_julia_calendar_tags.sql)

```sql
CREATE OR REPLACE FUNCTION julia_assign_tag(
    p_card_id UUID,
    p_tag_name TEXT,
    p_tag_color TEXT DEFAULT '#ef4444'
) RETURNS JSONB AS $$
-- Schema esperado:
-- - Tabela: card_tags (name, color, produto, is_active)
-- - Tabela: card_tag_assignments (card_id, tag_id)
-- Lógica:
--   1. Busca tag em card_tags (case-insensitive, produto NULL ou = v_produto)
--   2. Se não existe: INSERT em card_tags com (nome, cor, produto=NULL)
--   3. INSERT em card_tag_assignments (card_id, tag_id) ON CONFLICT DO NOTHING
```

**Características:**
- Queries tabelas `card_tags` + `card_tag_assignments` (relação 1:N)
- Tags compartilhadas têm `produto = NULL`
- Cada assign é explícito em outra tabela
- Retorna `{ success, tag_id, tag_name, card_id }`

### Agent (20260411_agent_builder_schema.sql)

```sql
CREATE OR REPLACE FUNCTION agent_assign_tag(
  p_card_id UUID,
  p_tag_name TEXT,
  p_tag_color TEXT DEFAULT '#6366f1'
)
-- Schema esperado:
-- - Tabela: tags (nome, cor, org_id)
-- - Tabela: card_tags (card_id, tag_id) — junction
-- Lógica:
--   1. Get org_id do card
--   2. INSERT em tags (nome, cor, org_id) ON CONFLICT (org_id, nome) DO UPDATE
--   3. INSERT em card_tags (card_id, tag_id) ON CONFLICT DO NOTHING
```

**Características:**
- Queries tabelas `tags` + `card_tags` (mas estrutura diferente de Julia!)
- Tags isoladas por `org_id`
- Criação e assign em 2 statements simples
- Retorna `{ success, tag_id }`

### Divergências Críticas

| Aspecto | Julia | Agent | Impacto |
|---------|-------|-------|--------|
| **Tabela tags** | `card_tags` (atributos: name, color, produto) | `tags` (atributos: nome, cor, org_id) | Schema incompatível — não pode chamar uma função de outra |
| **Isolamento** | Por produto | Por org_id | Julia é multi-org-unaware; agent é org-aware |
| **Junction table** | `card_tag_assignments` | `card_tags` (reutilizada) | Nomes/semantica diferente |
| **Default color** | `#ef4444` (red) | `#6366f1` (indigo) | Cosmético, mas inconsistente |

### Recomendação

🟡 **NÃO alinhar agora — schema de tags é domínio contestado.**  
- Julia está deprecated (vai virar registro em `ai_agents`)
- Novo agente (Luna) usa schema de agent (tags + org_id)
- Conflitar ainda gera risco de regressão em Julia
- **Solução:** Cada um chama sua RPC até o cutover. Post-Fase C1, deprecate julia_assign_tag

---

## Detalhe 3: request_handoff

### Julia (_archived/202602/20260225_julia_ac_data_and_handoff.sql)

```sql
CREATE OR REPLACE FUNCTION julia_request_handoff(
    p_card_id UUID,
    p_reason TEXT DEFAULT 'outro',
    p_context_summary TEXT DEFAULT ''
) RETURNS JSONB AS $$
-- Lógica:
--   1. UPDATE cards SET ai_responsavel = 'humano' WHERE id = card AND ai_responsavel = 'ia'
--   2. SELECT contato FROM contatos WHERE id = card.pessoa_principal_id
--   3. INSERT activities (tipo='handoff', descricao=...)
--   4. Retorna { success, card_id, contact_name, contact_phone, reason }
```

**Características:**
- Valida que card estava em `ai_responsavel = 'ia'` antes de fazer handoff
- Busca contato para retornar nome + telefone (enriquecimento)
- Cria atividade de tipo `'handoff'` (audit trail específico)
- Retorna dados do contato junto

### Agent (20260411_agent_builder_schema.sql)

```sql
CREATE OR REPLACE FUNCTION agent_request_handoff(
  p_card_id UUID,
  p_reason TEXT DEFAULT 'cliente_pede_humano',
  p_context_summary TEXT DEFAULT NULL
)
-- Lógica:
--   1. UPDATE cards SET ai_responsavel = 'humano' WHERE id = card (sem validar estado anterior)
--   2. INSERT activities (tipo='nota', conteudo=...)
--   3. Retorna { success, card_id, assigned_to, reason }
```

**Características:**
- Não valida estado anterior (UPDATE vai funcionar mesmo se já é humano)
- Não busca contato (mais eficiente)
- Cria atividade de tipo `'nota'` (genérico, não auditável como handoff)
- Retorna apenas assigned_to (responsável), não dados do contato

### Divergências Críticas

| Aspecto | Julia | Agent | Impacto |
|---------|-------|-------|--------|
| **Guard** | Valida `ai_responsavel = 'ia'` | Sem guard | Agent pode fazer "handoff" redundante |
| **Busca contato** | Sim | Não | Agent não enriquece contexto de quem é o contato |
| **Tipo atividade** | `'handoff'` (específico) | `'nota'` (genérico) | Edge function perde audit trail de handoffs |
| **Razão padrão** | `'outro'` (genérico) | `'cliente_pede_humano'` (específico) | Semântica diferente |

### Recomendação

🟢 **Alinhar agent_request_handoff — é seguro e melhora auditoria.**  
Mudanças sugeridas:
- Adicionar guard: `AND ai_responsavel = 'ia'`
- Buscar contato e retornar na resposta
- Mudar tipo atividade de `'nota'` para `'handoff'`
- Validar que `p_reason` é um dos valores esperados (enum)

---

## Passo 3: Estratégia de Aplicação

### Fase A — Segura, aplica em staging agora
- agent_check_calendar: adicionar cálculo de slots disponíveis + retornar profile_nome
- agent_request_handoff: adicionar guard + contato + tipo atividade handoff

**Arquivo:** `supabase/migrations/20260414t_align_agent_rpcs.sql`

### Fase B — Posposta (após Julia deprecation)
- julia_assign_tag: deixar como está, deprecate quando Julia virar registro em ai_agents

**Arquivo:** Nenhum (para depois)

---

## Conclusão

De 3 RPCs:
- ✅ 2 podem ser alinhadas com segurança (check_calendar, request_handoff)
- 🟡 1 deve esperar (assign_tag — schema incompatível, Julia ainda em uso)

**Risco geral:** Baixo. As mudanças são aditivas ou guardrail melhorado, não destrutivas.

**Próximo passo:** Criar migration `20260414t_align_agent_rpcs.sql` e testar em staging.
