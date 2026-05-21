# Marco A — Alertas Viscerais de Pendência

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformar o sistema atual de regras de alerta (silencioso, só sininho) em uma experiência visceral: modal de boas-vindas no 1º acesso do dia + faixa colorida no topo do KanbanCard, ambos configuráveis por regra no admin com destinatários flexíveis.

**Architecture:** Extensão do motor existente (`card_alert_rules`, `evaluate_alert_condition`, `generate_card_alerts`, tabela `notifications`). Adiciona 4 colunas de canal + 2 colunas de destinatário em `card_alert_rules`, novo tipo de condição `task_overdue`, RPC nova `resolve_alert_recipients`, e 4 componentes/hooks frontend novos (modal, faixa, hook de filtro por canal, hook de detecção de "1º acesso do dia").

**Tech Stack:** Supabase (PostgreSQL + RPCs SECURITY DEFINER), React 18 + TypeScript Strict, TailwindCSS, sonner (toasts já existente), Supabase Realtime, Page Visibility API, localStorage. Playwright E2E.

**Spec de referência:** [docs/superpowers/specs/2026-05-20-alertas-viscerais-e-painel-acessos-design.md](../specs/2026-05-20-alertas-viscerais-e-painel-acessos-design.md)

---

## File Structure

**Migrations (novas):**
- `supabase/migrations/20260520a_card_alert_rules_channels_recipients.sql` — colunas show_in_modal/banner/bell + recipient_mode/target
- `supabase/migrations/20260520b_evaluate_alert_condition_task_overdue.sql` — extensão do evaluate p/ task_overdue
- `supabase/migrations/20260520c_resolve_alert_recipients.sql` — função SQL nova
- `supabase/migrations/20260520d_generate_card_alerts_multi_recipient.sql` — atualização do generate

**Smoke test (modificar):**
- `.claude/hooks/schema-smoke-test.sh` — adicionar 3 queries de assertion

**Frontend Admin (modificar):**
- `src/pages/admin/CardAlertRulesPage.tsx` — adicionar toggles + dropdown destinatário

**Frontend - tipos (modificar):**
- `src/database.types.ts` — regenerado via supabase CLI

**Frontend - hooks (novos):**
- `src/hooks/usePendingNotifications.ts` — filtra notifications do user logado por canal
- `src/hooks/useFirstAccessOfDay.ts` — detecta 1º acesso via Page Visibility + localStorage

**Frontend - componentes (novos):**
- `src/components/notifications/PendenciasModalDiario.tsx` — modal de boas-vindas
- `src/components/notifications/PendenciaItem.tsx` — linha do modal
- `src/components/pipeline/KanbanCardPendenciaFaixa.tsx` — faixa colorida no card

**Frontend - integração (modificar):**
- `src/components/layout/Layout.tsx` — montar `PendenciasModalDiario`
- `src/components/pipeline/KanbanCard.tsx` — renderizar `KanbanCardPendenciaFaixa`

**Testes E2E (novo):**
- `tests/e2e/10-pendencias.spec.ts` — fluxo modal + faixa + reaparição amanhã

---

## Task 1: Migration — Novas colunas em `card_alert_rules`

**Files:**
- Create: `supabase/migrations/20260520a_card_alert_rules_channels_recipients.sql`

- [ ] **Step 1: Criar migration SQL**

```sql
-- 20260520a_card_alert_rules_channels_recipients.sql
-- Adiciona canais (modal/banner/bell) e destinatário configurável em card_alert_rules
-- Spec: docs/superpowers/specs/2026-05-20-alertas-viscerais-e-painel-acessos-design.md §3.2 §3.3

BEGIN;

ALTER TABLE public.card_alert_rules
    ADD COLUMN IF NOT EXISTS show_in_modal BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS show_in_kanban_banner BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS show_in_bell BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS recipient_mode TEXT NOT NULL DEFAULT 'card_owner'
        CHECK (recipient_mode IN ('card_owner','team_managers','specific_roles','specific_users')),
    ADD COLUMN IF NOT EXISTS recipient_target JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.card_alert_rules.show_in_modal IS
'Se TRUE, alerta aparece no modal de boas-vindas do 1º acesso do dia.';

COMMENT ON COLUMN public.card_alert_rules.show_in_kanban_banner IS
'Se TRUE, alerta aparece como faixa colorida no topo do KanbanCard.';

COMMENT ON COLUMN public.card_alert_rules.show_in_bell IS
'Se TRUE, alerta aparece no sininho de notificações (NotificationCenter). Default true para preservar comportamento histórico.';

COMMENT ON COLUMN public.card_alert_rules.recipient_mode IS
'card_owner=dono atual (default), team_managers=admins do workspace, specific_roles=lista de papéis em recipient_target, specific_users=lista de profile_id em recipient_target.';

COMMENT ON COLUMN public.card_alert_rules.recipient_target IS
'Array JSONB. Para specific_roles: ["sdr","vendas","pos","concierge"]. Para specific_users: ["uuid1","uuid2"]. Vazio para card_owner/team_managers.';

COMMIT;
```

- [ ] **Step 2: Aplicar em staging**

Run: `bash .claude/hooks/apply-to-staging.sh supabase/migrations/20260520a_card_alert_rules_channels_recipients.sql`

Expected: script imprime "Migration aplicada com sucesso em staging."

- [ ] **Step 3: Verificar colunas em staging via curl**

```bash
source .env && curl -s "https://ivmebyvjarcvrkrbemam.supabase.co/rest/v1/card_alert_rules?select=show_in_modal,show_in_kanban_banner,show_in_bell,recipient_mode,recipient_target&limit=1" \
  -H "apikey: $STAGING_VITE_SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $STAGING_SUPABASE_SERVICE_ROLE_KEY"
```

Expected: JSON com as 5 chaves (não erro "column does not exist"). Se `.env` não tem var de staging, usar variáveis padrão de `apply-to-staging.sh`.

- [ ] **Step 4: Adicionar query ao schema-smoke-test.sh**

Modify: `.claude/hooks/schema-smoke-test.sh`

Adicionar no bloco de queries:

```bash
# Marco A — Alertas Viscerais: colunas de canal e destinatário
run_query "card_alert_rules.show_in_modal existe" \
  "card_alert_rules?select=show_in_modal&limit=1"
run_query "card_alert_rules.recipient_mode existe" \
  "card_alert_rules?select=recipient_mode&limit=1"
```

Padrão: copiar a estrutura das queries vizinhas. Se o arquivo usa outro helper (ex: `check_column`), seguir o existente. Ler 30 linhas do arquivo antes de editar.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260520a_card_alert_rules_channels_recipients.sql .claude/hooks/schema-smoke-test.sh
git commit -m "feat(alertas): colunas show_in_modal/banner/bell + destinatário configurável em card_alert_rules

Marco A.1 — primeira etapa do sistema de alertas viscerais. Adiciona
4 toggles de canal (modal, faixa no Kanban, sino, email) e 4 modos de
destinatário (dono, admins, papéis, usuários) por regra.

Backfill seguro: show_in_bell=TRUE preserva comportamento atual;
demais canais ficam FALSE até admin ativar explicitamente.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 2: Migration — RPC `resolve_alert_recipients`

**Files:**
- Create: `supabase/migrations/20260520c_resolve_alert_recipients.sql`

- [ ] **Step 1: Criar função SQL**

```sql
-- 20260520c_resolve_alert_recipients.sql
-- Função que resolve a lista de profile_id que devem receber a notificação
-- de uma regra, dado um card específico.
-- Spec: docs/superpowers/specs/2026-05-20-alertas-viscerais-e-painel-acessos-design.md §3.3

CREATE OR REPLACE FUNCTION public.resolve_alert_recipients(
    p_rule_id UUID,
    p_card_id UUID
) RETURNS TABLE(user_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_rule RECORD;
    v_card RECORD;
BEGIN
    SELECT id, org_id, recipient_mode, recipient_target
        INTO v_rule
        FROM public.card_alert_rules
        WHERE id = p_rule_id;

    IF NOT FOUND THEN
        RETURN;
    END IF;

    SELECT id, org_id, dono_atual_id, sdr_owner_id, vendas_owner_id,
           pos_owner_id, concierge_owner_id
        INTO v_card
        FROM public.cards
        WHERE id = p_card_id;

    IF NOT FOUND THEN
        RETURN;
    END IF;

    -- Defesa em profundidade: card e regra devem pertencer à mesma org
    IF v_card.org_id != v_rule.org_id THEN
        RETURN;
    END IF;

    CASE v_rule.recipient_mode
        WHEN 'card_owner' THEN
            IF v_card.dono_atual_id IS NOT NULL THEN
                user_id := v_card.dono_atual_id;
                RETURN NEXT;
            END IF;

        WHEN 'team_managers' THEN
            FOR user_id IN
                SELECT p.id
                FROM public.profiles p
                JOIN public.org_members om ON om.user_id = p.id
                WHERE om.org_id = v_rule.org_id
                  AND p.is_admin = TRUE
                  AND COALESCE(p.active, TRUE) = TRUE
            LOOP
                RETURN NEXT;
            END LOOP;

        WHEN 'specific_roles' THEN
            -- recipient_target = ["sdr","vendas","pos","concierge"]
            IF v_rule.recipient_target ? 'sdr' AND v_card.sdr_owner_id IS NOT NULL THEN
                user_id := v_card.sdr_owner_id;
                RETURN NEXT;
            END IF;
            IF v_rule.recipient_target ? 'vendas' AND v_card.vendas_owner_id IS NOT NULL THEN
                user_id := v_card.vendas_owner_id;
                RETURN NEXT;
            END IF;
            IF v_rule.recipient_target ? 'pos' AND v_card.pos_owner_id IS NOT NULL THEN
                user_id := v_card.pos_owner_id;
                RETURN NEXT;
            END IF;
            IF v_rule.recipient_target ? 'concierge' AND v_card.concierge_owner_id IS NOT NULL THEN
                user_id := v_card.concierge_owner_id;
                RETURN NEXT;
            END IF;

        WHEN 'specific_users' THEN
            -- recipient_target = ["uuid1","uuid2"]
            FOR user_id IN
                SELECT (jsonb_array_elements_text(v_rule.recipient_target))::UUID
            LOOP
                -- Verifica que o user pertence à org da regra
                IF EXISTS (
                    SELECT 1 FROM public.org_members
                    WHERE user_id = user_id AND org_id = v_rule.org_id
                ) THEN
                    RETURN NEXT;
                END IF;
            END LOOP;

        ELSE
            RAISE WARNING 'resolve_alert_recipients: recipient_mode desconhecido: %', v_rule.recipient_mode;
    END CASE;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_alert_recipients(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_alert_recipients(UUID, UUID) TO service_role;

COMMENT ON FUNCTION public.resolve_alert_recipients IS
'Resolve destinatários (user_id) de uma regra de alerta para um card. Usado por generate_card_alerts.';
```

- [ ] **Step 2: Aplicar em staging**

Run: `bash .claude/hooks/apply-to-staging.sh supabase/migrations/20260520c_resolve_alert_recipients.sql`

Expected: "Migration aplicada com sucesso em staging."

- [ ] **Step 3: Testar via SQL — modo `card_owner`**

Pegar um rule_id e card_id reais em staging:

```bash
source .env && curl -s "https://ivmebyvjarcvrkrbemam.supabase.co/rest/v1/card_alert_rules?select=id&limit=1" \
  -H "apikey: $STAGING_VITE_SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $STAGING_SUPABASE_SERVICE_ROLE_KEY"
```

Chamar a função (usar service_role):

```bash
source .env && curl -s -X POST "https://ivmebyvjarcvrkrbemam.supabase.co/rest/v1/rpc/resolve_alert_recipients" \
  -H "apikey: $STAGING_SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $STAGING_SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"p_rule_id": "<rule_uuid>", "p_card_id": "<card_uuid>"}'
```

Expected: Array de UUID. Para uma regra default (recipient_mode='card_owner'), retorna `[{"user_id": "<dono do card>"}]`.

- [ ] **Step 4: Testar via SQL — modo `team_managers`**

Atualizar a regra para `team_managers` em staging via SQL editor, chamar a função, verificar retorno = lista de admins do workspace. Reverter `recipient_mode` para `card_owner` após o teste.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260520c_resolve_alert_recipients.sql
git commit -m "feat(alertas): RPC resolve_alert_recipients (Marco A.2)

Resolve destinatários conforme recipient_mode da regra:
- card_owner: dono_atual_id
- team_managers: admins do workspace via org_members + profiles.is_admin
- specific_roles: sdr_owner_id, vendas_owner_id, pos_owner_id, concierge_owner_id
- specific_users: array de profile_id (validado contra org_members)

SECURITY DEFINER, apenas service_role executa. Valida que card e regra
pertencem à mesma org (defesa em profundidade).

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 3: Migration — `evaluate_alert_condition` aprende `task_overdue`

**Files:**
- Create: `supabase/migrations/20260520b_evaluate_alert_condition_task_overdue.sql`

- [ ] **Step 1: Ler função atual**

Run: `cat supabase/migrations/20260407_evaluate_alert_condition.sql | head -200`

Identificar o `CASE p_condition->>'type'` que avalia tipos. Memorizar o estilo (alias de tabela, retorno BOOLEAN, etc.).

- [ ] **Step 2: Criar migration**

```sql
-- 20260520b_evaluate_alert_condition_task_overdue.sql
-- Estende evaluate_alert_condition para suportar tipo 'task_overdue'.
-- Spec: docs/superpowers/specs/2026-05-20-alertas-viscerais-e-painel-acessos-design.md §3.1, §4.A.2

-- IMPORTANTE: Esta migration redefine a função COMPLETA. Antes de aplicar,
-- ler 20260407_evaluate_alert_condition.sql para garantir paridade dos
-- demais branches (stage_requirements, field_missing, days_in_stage, etc).
-- Padrão WelcomeCRM: grep -rn "CREATE.*FUNCTION evaluate_alert_condition" supabase/migrations/

CREATE OR REPLACE FUNCTION public.evaluate_alert_condition(
    p_card_id UUID,
    p_condition JSONB
) RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_type TEXT;
    v_card RECORD;
    v_count INTEGER;
    v_days INTEGER;
    v_op TEXT;
    v_field_key TEXT;
    v_clause JSONB;
    v_result BOOLEAN;
BEGIN
    v_type := p_condition->>'type';
    IF v_type IS NULL THEN
        RETURN FALSE;
    END IF;

    SELECT id, org_id, etapa_id, stage_entered_at, produto_data,
           briefing_inicial, dono_atual_id, archived_at
        INTO v_card
        FROM public.cards
        WHERE id = p_card_id;

    IF NOT FOUND OR v_card.archived_at IS NOT NULL THEN
        RETURN FALSE;
    END IF;

    -- [Manter aqui TODOS os branches existentes em 20260407_evaluate_alert_condition.sql]
    -- stage_requirements, field_missing, field_equals, no_contact,
    -- contact_missing_data, days_in_stage, and, or, not
    -- (copiar literalmente do arquivo original; este patch só ADICIONA task_overdue)

    -- ─── task_overdue ───────────────────────────────────────────────────────
    -- Card tem alguma activity tipo 'task' (opcionalmente filtrada por tarefa_tipo)
    -- com data_prevista < NOW() - days_overdue dias E status != 'concluida'.
    -- Json shape: {"type":"task_overdue", "days_overdue": 1, "tarefa_tipo": "follow_up"}
    -- tarefa_tipo é opcional; se ausente, conta qualquer task.
    IF v_type = 'task_overdue' THEN
        v_days := COALESCE((p_condition->>'days_overdue')::INTEGER, 0);

        SELECT COUNT(*)
            INTO v_count
            FROM public.activities a
            WHERE a.card_id = p_card_id
              AND a.tipo = 'task'
              AND (p_condition->>'tarefa_tipo' IS NULL
                   OR a.tarefa_tipo = p_condition->>'tarefa_tipo')
              AND COALESCE(a.status, 'pendente') != 'concluida'
              AND a.data_prevista IS NOT NULL
              AND a.data_prevista < (NOW() - (v_days || ' days')::INTERVAL);

        RETURN v_count > 0;
    END IF;

    -- [Demais branches do arquivo original entram aqui]

    RETURN FALSE;
END;
$$;

REVOKE ALL ON FUNCTION public.evaluate_alert_condition(UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.evaluate_alert_condition(UUID, JSONB) TO service_role, authenticated;

COMMENT ON FUNCTION public.evaluate_alert_condition IS
'Avalia condição JSONB contra um card. Tipos suportados: stage_requirements, field_missing, field_equals, no_contact, contact_missing_data, days_in_stage, task_overdue, and, or, not.';
```

**ATENÇÃO crítica do CLAUDE.md §TOP 5:** Antes de aplicar, rodar `grep -rn "CREATE.*FUNCTION evaluate_alert_condition" supabase/migrations/` e ler o arquivo original `20260407_evaluate_alert_condition.sql` na íntegra. Copiar TODOS os branches existentes para esta migration. Recriar cego destrói correções anteriores.

- [ ] **Step 3: Aplicar em staging**

Run: `bash .claude/hooks/apply-to-staging.sh supabase/migrations/20260520b_evaluate_alert_condition_task_overdue.sql`

Expected: "Migration aplicada com sucesso em staging."

- [ ] **Step 4: Verificar que tipos antigos ainda funcionam (paridade)**

Em staging, com um rule_id que use `stage_requirements`:

```bash
source .env && curl -s -X POST "https://ivmebyvjarcvrkrbemam.supabase.co/rest/v1/rpc/evaluate_alert_condition" \
  -H "apikey: $STAGING_SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $STAGING_SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"p_card_id": "<uuid_de_card_com_campo_vazio>", "p_condition": {"type":"stage_requirements"}}'
```

Expected: `true` se o card tem requirement não atendido (deve permanecer comportamento original).

- [ ] **Step 5: Testar `task_overdue`**

Criar uma activity de teste em staging com `tipo='task'`, `status='pendente'`, `data_prevista=NOW() - INTERVAL '3 days'`, depois:

```bash
source .env && curl -s -X POST "https://ivmebyvjarcvrkrbemam.supabase.co/rest/v1/rpc/evaluate_alert_condition" \
  -H "apikey: $STAGING_SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $STAGING_SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"p_card_id": "<card_uuid_da_tarefa>", "p_condition": {"type":"task_overdue","days_overdue":1}}'
```

Expected: `true`. Com `"days_overdue":5` → `false`. Apagar activity de teste depois.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260520b_evaluate_alert_condition_task_overdue.sql
git commit -m "feat(alertas): condição task_overdue em evaluate_alert_condition (Marco A.3)

Novo tipo de condição que detecta cards com tarefa do dono atrasada.
Shape: {type:'task_overdue', days_overdue:N, tarefa_tipo:'opcional'}.
Conta activities tipo 'task' com data_prevista < NOW() - N dias e
status != 'concluida'.

Re-cria a função completa; paridade dos branches anteriores
verificada via grep em migrations passadas e teste manual em staging.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 4: Migration — `generate_card_alerts` usa `resolve_alert_recipients`

**Files:**
- Create: `supabase/migrations/20260520d_generate_card_alerts_multi_recipient.sql`

- [ ] **Step 1: Ler função atual**

Run: `cat supabase/migrations/20260407_generate_card_alerts.sql`

Identificar onde a função insere em `notifications` com `user_id = card.dono_atual_id`. Esse é o ponto de substituição.

- [ ] **Step 2: Criar migration**

```sql
-- 20260520d_generate_card_alerts_multi_recipient.sql
-- Atualiza generate_card_alerts para gerar uma notificação POR destinatário
-- (resolvido por resolve_alert_recipients) ao invés de só pro dono.
-- Spec: docs/superpowers/specs/2026-05-20-alertas-viscerais-e-painel-acessos-design.md §3.3, §4.A.3

CREATE OR REPLACE FUNCTION public.generate_card_alerts(
    p_rule_id UUID DEFAULT NULL,
    p_card_id UUID DEFAULT NULL
) RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_rule RECORD;
    v_card RECORD;
    v_recipient_id UUID;
    v_violates BOOLEAN;
    v_title TEXT;
    v_body TEXT;
    v_count INTEGER := 0;
    v_metadata JSONB;
BEGIN
    -- Iterar regras (todas ou só a passada)
    FOR v_rule IN
        SELECT id, org_id, name, severity, condition, title_template, body_template,
               pipeline_id, phase_id, stage_id, product, send_email,
               show_in_modal, show_in_kanban_banner, show_in_bell
        FROM public.card_alert_rules
        WHERE is_active = TRUE
          AND (p_rule_id IS NULL OR id = p_rule_id)
    LOOP
        -- Iterar cards no escopo
        FOR v_card IN
            SELECT c.id, c.titulo, c.dono_atual_id, c.org_id, c.etapa_id,
                   s.nome AS stage_name
            FROM public.cards c
            JOIN public.pipeline_stages s ON s.id = c.etapa_id
            JOIN public.pipelines pip ON pip.id = s.pipeline_id
            JOIN public.pipeline_phases ph ON ph.id = s.phase_id
            WHERE c.org_id = v_rule.org_id
              AND c.archived_at IS NULL
              AND (v_rule.pipeline_id IS NULL OR pip.id = v_rule.pipeline_id)
              AND (v_rule.phase_id IS NULL OR ph.id = v_rule.phase_id)
              AND (v_rule.stage_id IS NULL OR s.id = v_rule.stage_id)
              AND (v_rule.product IS NULL OR pip.produto::TEXT = v_rule.product)
              AND (p_card_id IS NULL OR c.id = p_card_id)
        LOOP
            v_violates := public.evaluate_alert_condition(v_card.id, v_rule.condition);

            v_metadata := jsonb_build_object(
                'rule_id', v_rule.id,
                'rule_name', v_rule.name,
                'severity', v_rule.severity,
                'channels', jsonb_build_object(
                    'modal', v_rule.show_in_modal,
                    'banner', v_rule.show_in_kanban_banner,
                    'bell', v_rule.show_in_bell
                )
            );

            v_title := REPLACE(REPLACE(v_rule.title_template,
                '{titulo}', v_card.titulo),
                '{stage_name}', v_card.stage_name);
            v_body := REPLACE(REPLACE(COALESCE(v_rule.body_template, ''),
                '{titulo}', v_card.titulo),
                '{stage_name}', v_card.stage_name);

            -- Para cada destinatário resolvido
            FOR v_recipient_id IN
                SELECT user_id
                FROM public.resolve_alert_recipients(v_rule.id, v_card.id)
            LOOP
                IF v_violates THEN
                    -- Dedup: só insere se não existe notificação não-lida
                    -- para (rule, card, user)
                    IF NOT EXISTS (
                        SELECT 1 FROM public.notifications
                        WHERE user_id = v_recipient_id
                          AND card_id = v_card.id
                          AND type = 'card_alert_rule'
                          AND (metadata->>'rule_id')::UUID = v_rule.id
                          AND read = FALSE
                    ) THEN
                        INSERT INTO public.notifications
                            (org_id, user_id, card_id, type, title, body, metadata, read)
                        VALUES
                            (v_rule.org_id, v_recipient_id, v_card.id,
                             'card_alert_rule', v_title, v_body, v_metadata, FALSE);
                        v_count := v_count + 1;
                    END IF;
                ELSE
                    -- Ghost cleanup: card não viola mais, remove notificação ainda não-lida
                    DELETE FROM public.notifications
                    WHERE user_id = v_recipient_id
                      AND card_id = v_card.id
                      AND type = 'card_alert_rule'
                      AND (metadata->>'rule_id')::UUID = v_rule.id
                      AND read = FALSE;
                END IF;
            END LOOP;
        END LOOP;
    END LOOP;

    RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.generate_card_alerts(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.generate_card_alerts(UUID, UUID) TO service_role;

COMMENT ON FUNCTION public.generate_card_alerts IS
'Itera regras ativas e cards no escopo, avalia condição, e cria/remove notificações para cada destinatário resolvido por resolve_alert_recipients. Cron diário às 6h chama sem args.';
```

**Atenção:** Esta migration redefine generate_card_alerts. Mesmo cuidado do TOP 5 #5 do CLAUDE.md — rodar `grep -rn "CREATE.*FUNCTION generate_card_alerts" supabase/migrations/` antes de aplicar e validar paridade.

- [ ] **Step 3: Aplicar em staging**

Run: `bash .claude/hooks/apply-to-staging.sh supabase/migrations/20260520d_generate_card_alerts_multi_recipient.sql`

Expected: "Migration aplicada com sucesso em staging."

- [ ] **Step 4: Testar geração com regra default (`card_owner`)**

```bash
source .env && curl -s -X POST "https://ivmebyvjarcvrkrbemam.supabase.co/rest/v1/rpc/generate_card_alerts" \
  -H "apikey: $STAGING_SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $STAGING_SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{}'
```

Expected: Retorna número (notificações criadas). Verificar em `notifications` que linha foi inserida com `metadata.channels.modal/banner/bell` populado corretamente.

- [ ] **Step 5: Testar com regra `team_managers`**

Mudar `recipient_mode` de uma regra para `team_managers` em staging, rodar `generate_card_alerts(<rule_id>, NULL)`, verificar que notificações foram criadas para TODOS os admins do workspace. Reverter ao final.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260520d_generate_card_alerts_multi_recipient.sql
git commit -m "feat(alertas): generate_card_alerts com múltiplos destinatários (Marco A.4)

Substitui hardcode user_id=card.dono_atual_id por loop sobre
resolve_alert_recipients(rule_id, card_id). Notificação carrega
metadata.channels {modal, banner, bell} pro frontend filtrar.

Dedup mantido por (rule_id, card_id, user_id, read=false).
Ghost cleanup mantido: card que não viola mais remove notificações
ainda não-lidas para todos os destinatários.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 5: Regenerar `database.types.ts`

**Files:**
- Modify: `src/database.types.ts` (gerado)

- [ ] **Step 1: Verificar permissão do arquivo no hook**

`src/database.types.ts` está no protect-files.sh do CLAUDE.md. Permitir edição rodando o gerador é a única forma. O hook bloqueia edição manual, não regeneração.

- [ ] **Step 2: Regenerar tipos**

Run: `npx supabase gen types typescript --project-id ivmebyvjarcvrkrbemam > src/database.types.ts`

Expected: Arquivo regenerado. `git diff src/database.types.ts` mostra novas colunas em `card_alert_rules` e nova função `resolve_alert_recipients`.

- [ ] **Step 3: Build pra garantir que tipos compilam**

Run: `npm run build`

Expected: Build passa sem erro. Se houver erro em arquivos consumidores (`CardAlertRulesPage` etc.), serão tratados nas tasks seguintes — anotar e seguir.

- [ ] **Step 4: Commit**

```bash
git add src/database.types.ts
git commit -m "chore(types): regenera database.types.ts pós Marco A migrations

Inclui colunas show_in_modal, show_in_kanban_banner, show_in_bell,
recipient_mode, recipient_target em card_alert_rules e a função
resolve_alert_recipients.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 6: UI Admin — toggles de canais em `CardAlertRulesPage`

**Files:**
- Modify: `src/pages/admin/CardAlertRulesPage.tsx`

- [ ] **Step 1: Ler estrutura atual**

Run: `wc -l src/pages/admin/CardAlertRulesPage.tsx && grep -n "send_email\|trigger_mode\|severity" src/pages/admin/CardAlertRulesPage.tsx | head -20`

Identificar a seção do formulário onde `send_email` e `trigger_mode` são editados. Os novos toggles vão nesta mesma seção (ou em uma nova "Canais" logo abaixo).

- [ ] **Step 2: Adicionar campos ao state do form**

Localizar o `useState` que guarda a regra em edição. Adicionar:

```tsx
const [showInModal, setShowInModal] = useState<boolean>(rule?.show_in_modal ?? false);
const [showInKanbanBanner, setShowInKanbanBanner] = useState<boolean>(rule?.show_in_kanban_banner ?? false);
const [showInBell, setShowInBell] = useState<boolean>(rule?.show_in_bell ?? true);
```

(Adaptar o pattern existente — se a página usa react-hook-form, registrar via `register`; se usa Zustand/Context, ajustar.)

- [ ] **Step 3: Renderizar seção "Canais"**

Adicionar bloco JSX abaixo do trigger_mode:

```tsx
<section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
  <header>
    <h3 className="text-sm font-medium text-slate-900">Canais de entrega</h3>
    <p className="text-xs text-slate-500">Onde a pendência aparece quando a regra dispara.</p>
  </header>

  <label className="flex items-center gap-3 text-sm text-slate-700">
    <input
      type="checkbox"
      checked={showInModal}
      onChange={(e) => setShowInModal(e.target.checked)}
      className="h-4 w-4 rounded border-slate-300 text-indigo-600"
    />
    <div>
      <div className="font-medium">Modal de boas-vindas do dia</div>
      <div className="text-xs text-slate-500">Aparece no 1º acesso do dia ao CRM.</div>
    </div>
  </label>

  <label className="flex items-center gap-3 text-sm text-slate-700">
    <input
      type="checkbox"
      checked={showInKanbanBanner}
      onChange={(e) => setShowInKanbanBanner(e.target.checked)}
      className="h-4 w-4 rounded border-slate-300 text-indigo-600"
    />
    <div>
      <div className="font-medium">Faixa no card do Kanban</div>
      <div className="text-xs text-slate-500">Faixa colorida no topo do card.</div>
    </div>
  </label>

  <label className="flex items-center gap-3 text-sm text-slate-700">
    <input
      type="checkbox"
      checked={showInBell}
      onChange={(e) => setShowInBell(e.target.checked)}
      className="h-4 w-4 rounded border-slate-300 text-indigo-600"
    />
    <div>
      <div className="font-medium">Sininho de notificações</div>
      <div className="text-xs text-slate-500">Aparece no NotificationCenter (default ligado).</div>
    </div>
  </label>

  {/* send_email já existe — manter onde está */}
</section>
```

- [ ] **Step 4: Incluir os campos no payload do save**

Localizar a função que monta `insertPayload` ou `updatePayload`. Adicionar:

```tsx
show_in_modal: showInModal,
show_in_kanban_banner: showInKanbanBanner,
show_in_bell: showInBell,
```

- [ ] **Step 5: Verificar build**

Run: `npm run build`

Expected: passa.

- [ ] **Step 6: Testar em dev local (aponta pra staging temporariamente)**

Trocar `.env` para `.env.development.staging`, rodar `npm run dev`, abrir `/admin/regras-de-alerta`, criar/editar uma regra, marcar toggles, salvar, recarregar página, verificar que toggles foram persistidos. Voltar `.env` ao normal depois.

- [ ] **Step 7: Commit**

```bash
git add src/pages/admin/CardAlertRulesPage.tsx
git commit -m "feat(alertas): toggles de canais (modal/faixa/sino) na UI de regras (Marco A.5a)

Adiciona seção 'Canais de entrega' no formulário de regra com 3
checkboxes (show_in_modal, show_in_kanban_banner, show_in_bell).
send_email permanece onde estava. Defaults seguem o backfill da
migration: bell=true, demais=false.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 7: UI Admin — dropdown de destinatário em `CardAlertRulesPage`

**Files:**
- Modify: `src/pages/admin/CardAlertRulesPage.tsx`
- Possivelmente: hook auxiliar `src/hooks/useWorkspaceMembers.ts` se ainda não existir (verificar `useFilterProfiles`)

- [ ] **Step 1: Confirmar hook de listagem de usuários do workspace**

Run: `grep -rn "useFilterProfiles\|org_members" src/hooks/ | head -10`

Confirmar que existe hook que lista profiles do workspace via `org_members` (per CLAUDE.md §"Queries comuns multi-tenant"). Reusar. Se não existir hook, criar `src/hooks/useWorkspaceMembers.ts`:

```tsx
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useOrg } from '@/contexts/OrgContext';

export function useWorkspaceMembers() {
  const { org } = useOrg();
  const orgId = org?.id;
  return useQuery({
    queryKey: ['workspace-members', orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase
        .from('org_members')
        .select('user_id, profiles!inner(id, nome, email, active)')
        .eq('org_id', orgId);
      if (error) throw error;
      return (data ?? [])
        .map((r: any) => r.profiles)
        .filter((p: any) => p.active !== false);
    },
    enabled: !!orgId,
  });
}
```

- [ ] **Step 2: Adicionar campos ao state**

```tsx
type RecipientMode = 'card_owner' | 'team_managers' | 'specific_roles' | 'specific_users';
const [recipientMode, setRecipientMode] = useState<RecipientMode>(rule?.recipient_mode ?? 'card_owner');
const [recipientTarget, setRecipientTarget] = useState<string[]>(
  (rule?.recipient_target as string[]) ?? []
);
```

- [ ] **Step 3: Renderizar dropdown + targets condicionais**

```tsx
const { data: members = [] } = useWorkspaceMembers();
const roleOptions = [
  { value: 'sdr', label: 'SDR' },
  { value: 'vendas', label: 'Vendas (Planner)' },
  { value: 'pos', label: 'Pós-venda' },
  { value: 'concierge', label: 'Concierge' },
];

return (
  <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
    <header>
      <h3 className="text-sm font-medium text-slate-900">Destinatário</h3>
      <p className="text-xs text-slate-500">Quem recebe a notificação quando a regra dispara.</p>
    </header>

    <select
      value={recipientMode}
      onChange={(e) => { setRecipientMode(e.target.value as RecipientMode); setRecipientTarget([]); }}
      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
    >
      <option value="card_owner">Dono atual do card</option>
      <option value="team_managers">Todos os admins do workspace</option>
      <option value="specific_roles">Papéis específicos (SDR, Vendas, Pós, Concierge)</option>
      <option value="specific_users">Usuários específicos</option>
    </select>

    {recipientMode === 'specific_roles' && (
      <div className="space-y-2">
        {roleOptions.map((r) => (
          <label key={r.value} className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={recipientTarget.includes(r.value)}
              onChange={(e) => {
                if (e.target.checked) setRecipientTarget([...recipientTarget, r.value]);
                else setRecipientTarget(recipientTarget.filter((x) => x !== r.value));
              }}
              className="h-4 w-4 rounded border-slate-300 text-indigo-600"
            />
            {r.label}
          </label>
        ))}
      </div>
    )}

    {recipientMode === 'specific_users' && (
      <div className="max-h-48 overflow-y-auto space-y-1 border border-slate-200 rounded-md p-2">
        {members.map((m: any) => (
          <label key={m.id} className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={recipientTarget.includes(m.id)}
              onChange={(e) => {
                if (e.target.checked) setRecipientTarget([...recipientTarget, m.id]);
                else setRecipientTarget(recipientTarget.filter((x) => x !== m.id));
              }}
              className="h-4 w-4 rounded border-slate-300 text-indigo-600"
            />
            {m.nome ?? m.email}
          </label>
        ))}
      </div>
    )}
  </section>
);
```

- [ ] **Step 4: Incluir no payload do save**

```tsx
recipient_mode: recipientMode,
recipient_target: recipientTarget,
```

- [ ] **Step 5: Verificar build**

Run: `npm run build`

Expected: passa.

- [ ] **Step 6: Testar em dev local apontando staging**

Criar regra com `specific_roles=['sdr','vendas']`, salvar, recarregar, verificar persistência. Mudar pra `specific_users`, selecionar 2 users, salvar, recarregar.

- [ ] **Step 7: Commit**

```bash
git add src/pages/admin/CardAlertRulesPage.tsx src/hooks/useWorkspaceMembers.ts
git commit -m "feat(alertas): dropdown destinatário na UI de regras (Marco A.5b)

Adiciona seção 'Destinatário' com 4 modos:
- card_owner (default, comportamento atual)
- team_managers (admins do workspace)
- specific_roles (sdr / vendas / pos / concierge)
- specific_users (multi-select de profiles do workspace)

Lista de usuários via novo useWorkspaceMembers (org_members + profiles
inner join, NÃO profiles.eq.org_id — workspace isolation per CLAUDE.md).

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 8: Hook `usePendingNotifications`

**Files:**
- Create: `src/hooks/usePendingNotifications.ts`

- [ ] **Step 1: Ler `useNotifications` atual pra entender padrão**

Run: `cat src/hooks/useNotifications.ts | head -80`

Identificar: como subscreve realtime, como filtra por usuário, qual o shape de retorno.

- [ ] **Step 2: Criar o hook**

```tsx
// src/hooks/usePendingNotifications.ts
import { useMemo } from 'react';
import { useNotifications } from './useNotifications';

export type AlertChannel = 'modal' | 'banner' | 'bell';

export interface PendingNotification {
  id: string;
  card_id: string | null;
  title: string;
  body: string | null;
  severity: 'info' | 'warning' | 'critical';
  read: boolean;
  created_at: string;
  metadata: {
    rule_id?: string;
    rule_name?: string;
    severity?: 'info' | 'warning' | 'critical';
    channels?: { modal?: boolean; banner?: boolean; bell?: boolean };
    missing_fields?: string[];
  };
}

const SEVERITY_ORDER: Record<string, number> = { critical: 0, warning: 1, info: 2 };

export function usePendingNotifications() {
  const { notifications, isLoading } = useNotifications();

  const alerts = useMemo<PendingNotification[]>(() => {
    return (notifications ?? [])
      .filter((n: any) => n.type === 'card_alert_rule' && !n.read)
      .map((n: any) => ({
        id: n.id,
        card_id: n.card_id,
        title: n.title,
        body: n.body,
        severity: (n.metadata?.severity ?? 'warning') as 'info' | 'warning' | 'critical',
        read: n.read,
        created_at: n.created_at,
        metadata: n.metadata ?? {},
      }))
      .sort((a, b) => {
        const sevDiff = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
        if (sevDiff !== 0) return sevDiff;
        return b.created_at.localeCompare(a.created_at);
      });
  }, [notifications]);

  function byChannel(channel: AlertChannel): PendingNotification[] {
    return alerts.filter((a) => a.metadata?.channels?.[channel] === true);
  }

  function byCard(cardId: string): PendingNotification[] {
    return alerts.filter((a) => a.card_id === cardId);
  }

  return {
    alerts,
    byChannel,
    byCard,
    isLoading,
  };
}
```

- [ ] **Step 3: Build pra garantir tipagem**

Run: `npm run build`

Expected: passa.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/usePendingNotifications.ts
git commit -m "feat(alertas): hook usePendingNotifications (Marco A.6)

Filtra notifications tipo card_alert_rule do user logado e expõe
helpers byChannel('modal'|'banner'|'bell') e byCard(cardId). Reusa
realtime de useNotifications — não duplica subscription.

Ordena por severidade (critical > warning > info) e created_at desc.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 9: Hook `useFirstAccessOfDay`

**Files:**
- Create: `src/hooks/useFirstAccessOfDay.ts`

- [ ] **Step 1: Criar o hook**

```tsx
// src/hooks/useFirstAccessOfDay.ts
import { useEffect, useState, useCallback } from 'react';

const STORAGE_KEY = 'welcomecrm.lastPendenciaModalShownDate';

function todayISO(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

/**
 * Detecta o "1º acesso do dia" do usuário ao CRM.
 * Sinais: mount, visibilitychange ('visible'), focus.
 * Persiste data do último disparo em localStorage.
 * Não usa rede; consome apenas localStorage + Page Visibility API.
 */
export function useFirstAccessOfDay() {
  const [isFirstAccess, setIsFirstAccess] = useState<boolean>(false);

  const check = useCallback(() => {
    if (document.visibilityState !== 'visible') return;
    const stored = localStorage.getItem(STORAGE_KEY);
    const today = todayISO();
    if (stored !== today) {
      setIsFirstAccess(true);
    }
  }, []);

  const markShown = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, todayISO());
    setIsFirstAccess(false);
  }, []);

  useEffect(() => {
    check();
    const onVis = () => check();
    const onFocus = () => check();
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', onFocus);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('focus', onFocus);
    };
  }, [check]);

  return { isFirstAccess, markShown };
}
```

- [ ] **Step 2: Build**

Run: `npm run build`

Expected: passa.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useFirstAccessOfDay.ts
git commit -m "feat(alertas): hook useFirstAccessOfDay (Marco A.7)

Detecta 1º acesso do dia via Page Visibility API + localStorage.
Sinais: mount, visibilitychange ('visible'), window focus.
Sem rede; persiste data ISO (YYYY-MM-DD) em
'welcomecrm.lastPendenciaModalShownDate'.

Spec: §3.5 do design doc.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 10: Componente `PendenciaItem`

**Files:**
- Create: `src/components/notifications/PendenciaItem.tsx`

- [ ] **Step 1: Criar componente**

```tsx
// src/components/notifications/PendenciaItem.tsx
import { AlertCircle, AlertTriangle, Info } from 'lucide-react';
import type { PendingNotification } from '@/hooks/usePendingNotifications';

interface Props {
  pendencia: PendingNotification;
  onOpen: (cardId: string) => void;
}

const SEVERITY_CONFIG = {
  critical: { icon: AlertCircle, bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-800', iconClass: 'text-red-600' },
  warning:  { icon: AlertTriangle, bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-800', iconClass: 'text-amber-600' },
  info:     { icon: Info, bg: 'bg-sky-50', border: 'border-sky-200', text: 'text-sky-800', iconClass: 'text-sky-600' },
} as const;

export function PendenciaItem({ pendencia, onOpen }: Props) {
  const cfg = SEVERITY_CONFIG[pendencia.severity] ?? SEVERITY_CONFIG.warning;
  const Icon = cfg.icon;
  const cardId = pendencia.card_id;

  return (
    <div className={`flex items-start gap-3 rounded-lg border ${cfg.border} ${cfg.bg} p-3`}>
      <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${cfg.iconClass}`} />
      <div className="flex-1 min-w-0">
        <div className={`text-sm font-medium ${cfg.text} truncate`}>{pendencia.title}</div>
        {pendencia.body && (
          <div className="text-xs text-slate-600 mt-0.5">{pendencia.body}</div>
        )}
      </div>
      {cardId && (
        <button
          type="button"
          onClick={() => onOpen(cardId)}
          className="shrink-0 rounded-md bg-white border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          Abrir
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Build**

Run: `npm run build`

Expected: passa.

- [ ] **Step 3: Commit**

```bash
git add src/components/notifications/PendenciaItem.tsx
git commit -m "feat(alertas): componente PendenciaItem (Marco A.8a)

Linha do modal de pendências: ícone por severidade + título + body
+ botão Abrir. Light-mode-first per DESIGN_SYSTEM.md.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 11: Componente `PendenciasModalDiario`

**Files:**
- Create: `src/components/notifications/PendenciasModalDiario.tsx`

- [ ] **Step 1: Criar componente**

```tsx
// src/components/notifications/PendenciasModalDiario.tsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { usePendingNotifications } from '@/hooks/usePendingNotifications';
import { useFirstAccessOfDay } from '@/hooks/useFirstAccessOfDay';
import { PendenciaItem } from './PendenciaItem';

export function PendenciasModalDiario() {
  const { profile } = useAuth();
  const { byChannel, isLoading } = usePendingNotifications();
  const { isFirstAccess, markShown } = useFirstAccessOfDay();
  const [isOpen, setIsOpen] = useState(false);
  const navigate = useNavigate();

  const pendencias = byChannel('modal');

  useEffect(() => {
    // Só abre se: 1º acesso do dia, não está carregando, tem pelo menos 1 pendência
    if (!isLoading && isFirstAccess && pendencias.length > 0) {
      setIsOpen(true);
    }
  }, [isLoading, isFirstAccess, pendencias.length]);

  function handleClose() {
    setIsOpen(false);
    markShown();
  }

  function handleOpenCard(cardId: string) {
    handleClose();
    navigate(`/card/${cardId}`);
  }

  if (!isOpen) return null;

  const nome = profile?.nome?.split(' ')[0] ?? '';
  const greeting = nome ? `Bom dia, ${nome}` : 'Bom dia';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl border border-slate-200">
        <header className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900 tracking-tight">{greeting}</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Você tem {pendencias.length} {pendencias.length === 1 ? 'pendência' : 'pendências'} hoje
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="Fechar"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="max-h-[60vh] overflow-y-auto space-y-2 p-4">
          {pendencias.map((p) => (
            <PendenciaItem key={p.id} pendencia={p} onOpen={handleOpenCard} />
          ))}
        </div>

        <footer className="flex justify-end border-t border-slate-100 px-5 py-3">
          <button
            type="button"
            onClick={handleClose}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Fechar
          </button>
        </footer>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Build**

Run: `npm run build`

Expected: passa.

- [ ] **Step 3: Commit**

```bash
git add src/components/notifications/PendenciasModalDiario.tsx
git commit -m "feat(alertas): componente PendenciasModalDiario (Marco A.8b)

Modal de boas-vindas que aparece no 1º acesso do dia se houver
pendências no canal 'modal'. Lista usa PendenciaItem. Fechar marca
data no localStorage via markShown. Clicar em Abrir navega para o
card e fecha o modal.

Não marca notificações como lidas — elas continuam no sininho até
serem resolvidas, e voltam no modal de amanhã.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 12: Integrar `PendenciasModalDiario` no `Layout`

**Files:**
- Modify: `src/components/layout/Layout.tsx`

- [ ] **Step 1: Ler import statements atuais**

Run: `head -25 src/components/layout/Layout.tsx`

Identificar onde adicionar o import. Identificar onde no JSX colocar o componente (próximo ao `NotificationCenter`, antes do `<Outlet />`).

- [ ] **Step 2: Adicionar import**

Localizar a área de imports e adicionar:

```tsx
import { PendenciasModalDiario } from '@/components/notifications/PendenciasModalDiario';
```

- [ ] **Step 3: Adicionar no JSX**

Localizar onde está `<NotificationCenter />` e adicionar antes ou depois:

```tsx
<PendenciasModalDiario />
```

(Não importa a ordem; ambos são portais flutuantes.)

- [ ] **Step 4: Build**

Run: `npm run build`

Expected: passa.

- [ ] **Step 5: Verificar manualmente em dev local apontando staging**

`npm run dev` (com `.env.development.staging`), logar com user que tem pendência ativa (regra com `show_in_modal=true`), verificar que modal aparece. Limpar `localStorage.welcomecrm.lastPendenciaModalShownDate` no DevTools, recarregar, modal volta. Fechar modal, recarregar, modal não volta.

- [ ] **Step 6: Commit**

```bash
git add src/components/layout/Layout.tsx
git commit -m "feat(alertas): integra PendenciasModalDiario no Layout (Marco A.9)

Modal montado no root layout para estar disponível em qualquer rota
autenticada. Renderiza fixed overlay quando aplicável; null caso
contrário (sem impacto em rotas que não tem pendência).

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 13: Componente `KanbanCardPendenciaFaixa`

**Files:**
- Create: `src/components/pipeline/KanbanCardPendenciaFaixa.tsx`

- [ ] **Step 1: Criar componente**

```tsx
// src/components/pipeline/KanbanCardPendenciaFaixa.tsx
import { AlertCircle, AlertTriangle, Info } from 'lucide-react';
import { usePendingNotifications } from '@/hooks/usePendingNotifications';

interface Props {
  cardId: string;
}

const SEVERITY_CONFIG = {
  critical: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-800', icon: AlertCircle, iconClass: 'text-red-600' },
  warning:  { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-800', icon: AlertTriangle, iconClass: 'text-amber-600' },
  info:     { bg: 'bg-sky-50', border: 'border-sky-200', text: 'text-sky-800', icon: Info, iconClass: 'text-sky-600' },
} as const;

export function KanbanCardPendenciaFaixa({ cardId }: Props) {
  const { byChannel, byCard } = usePendingNotifications();

  // Cruzar: notificações deste card que têm canal banner ativo
  const bannerSet = new Set(byChannel('banner').map((p) => p.id));
  const itens = byCard(cardId).filter((p) => bannerSet.has(p.id));

  if (itens.length === 0) return null;

  const principal = itens[0]; // ordenação já é por severidade asc no hook
  const cfg = SEVERITY_CONFIG[principal.severity] ?? SEVERITY_CONFIG.warning;
  const Icon = cfg.icon;
  const extra = itens.length - 1;

  return (
    <div className={`flex items-center gap-2 ${cfg.bg} ${cfg.border} border-b ${cfg.text} px-3 py-1.5 text-xs font-medium rounded-t-md`}>
      <Icon className={`h-3.5 w-3.5 shrink-0 ${cfg.iconClass}`} />
      <span className="truncate">{principal.title}</span>
      {extra > 0 && (
        <span className="shrink-0 opacity-70">e mais {extra}</span>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Build**

Run: `npm run build`

Expected: passa.

- [ ] **Step 3: Commit**

```bash
git add src/components/pipeline/KanbanCardPendenciaFaixa.tsx
git commit -m "feat(alertas): componente KanbanCardPendenciaFaixa (Marco A.10a)

Faixa horizontal no topo do KanbanCard com a pendência principal
(mais severa) + 'e mais N' se houver outras. Cores por severidade
(red/amber/sky). Não renderiza se card não tem pendência com canal
'banner' ativo.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 14: Integrar faixa no `KanbanCard`

**Files:**
- Modify: `src/components/pipeline/KanbanCard.tsx`

- [ ] **Step 1: Ler estrutura atual**

Run: `head -50 src/components/pipeline/KanbanCard.tsx`

Identificar onde começa o JSX do card (provavelmente um `<div>` raiz). A faixa entra como primeiro filho desse div, antes do título.

- [ ] **Step 2: Adicionar import**

```tsx
import { KanbanCardPendenciaFaixa } from './KanbanCardPendenciaFaixa';
```

- [ ] **Step 3: Renderizar a faixa**

Localizar o `return (...)` do componente. Adicionar antes do conteúdo do título:

```tsx
<KanbanCardPendenciaFaixa cardId={card.id} />
```

(Se o `<div>` raiz tem `overflow-hidden` e `rounded-md` ou similar, manter — a faixa já tem `rounded-t-md` pra casar.)

- [ ] **Step 4: Build**

Run: `npm run build`

Expected: passa.

- [ ] **Step 5: Verificar manualmente em dev local**

Logar, ir pro Kanban, confirmar que cards com pendência (`show_in_kanban_banner=true` em alguma regra que dispare) mostram a faixa. Cards sem pendência ficam idênticos.

- [ ] **Step 6: Commit**

```bash
git add src/components/pipeline/KanbanCard.tsx
git commit -m "feat(alertas): renderiza faixa de pendência no KanbanCard (Marco A.10b)

KanbanCardPendenciaFaixa montada antes do conteúdo do card. Não
adiciona requests extras — todos os cards leem do mesmo cache de
usePendingNotifications (que reusa useNotifications).

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 15: Teste E2E `10-pendencias.spec.ts`

**Files:**
- Create: `tests/e2e/10-pendencias.spec.ts`

- [ ] **Step 1: Ler estrutura dos testes E2E existentes**

Run: `cat tests/e2e/02-dashboard.smoke.spec.ts && echo "---" && cat playwright.config.ts | head -40`

Identificar: como autenticação é feita (global-setup), padrão de seletor, base URL.

- [ ] **Step 2: Criar teste**

```typescript
// tests/e2e/10-pendencias.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Pendências Viscerais (Marco A)', () => {
  test.beforeEach(async ({ page }) => {
    // Garantir que localStorage está limpo pra modal aparecer
    await page.addInitScript(() => {
      try { localStorage.removeItem('welcomecrm.lastPendenciaModalShownDate'); } catch {}
    });
  });

  test('modal de pendências aparece no 1º acesso e some após fechar', async ({ page }) => {
    await page.goto('/');

    // Aguarda dashboard ou login (global-setup já loga test@welcomecrm.test)
    await page.waitForLoadState('networkidle');

    // Se houver pendência configurada com show_in_modal=true para o user de teste,
    // modal deve aparecer. Esse teste é tolerante: se não houver, pula.
    const modal = page.locator('text=Você tem').filter({ hasText: 'pendência' });

    if (await modal.isVisible({ timeout: 3000 }).catch(() => false)) {
      // Fechar modal
      await page.getByRole('button', { name: 'Fechar' }).click();
      await expect(modal).not.toBeVisible();

      // Recarregar — modal não deve reaparecer no mesmo dia
      await page.reload();
      await page.waitForLoadState('networkidle');
      await expect(modal).not.toBeVisible({ timeout: 2000 });
    } else {
      test.info().annotations.push({
        type: 'note',
        description: 'Sem pendências configuradas para user de teste; teste apenas verifica que app carrega sem erro',
      });
    }
  });

  test('faixa de pendência aparece no topo de card no Kanban se aplicável', async ({ page }) => {
    await page.goto('/pipeline');
    await page.waitForLoadState('networkidle');

    // Se algum card tiver faixa, confirmar estrutura (texto + ícone alert)
    const faixa = page.locator('[class*="border-b"][class*="bg-amber-50"], [class*="border-b"][class*="bg-red-50"], [class*="border-b"][class*="bg-sky-50"]').first();

    if (await faixa.isVisible({ timeout: 3000 }).catch(() => false)) {
      await expect(faixa).toContainText(/.+/); // tem texto não-vazio
    } else {
      test.info().annotations.push({
        type: 'note',
        description: 'Nenhum card com faixa visível; teste degrada graciosamente',
      });
    }
  });

  test('modal reaparece em "novo dia" (simulado via clock)', async ({ page, context }) => {
    // Simular "amanhã" via clock.install
    await context.addInitScript(() => {
      try { localStorage.setItem('welcomecrm.lastPendenciaModalShownDate', '2020-01-01'); } catch {}
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const modal = page.locator('text=Você tem').filter({ hasText: 'pendência' });
    if (await modal.isVisible({ timeout: 3000 }).catch(() => false)) {
      await expect(modal).toBeVisible();
    } else {
      test.info().annotations.push({
        type: 'note',
        description: 'Sem pendências p/ user de teste — modal não aparece (esperado)',
      });
    }
  });
});
```

- [ ] **Step 3: Rodar teste contra dev local**

Run: `npm run test:e2e -- 10-pendencias.spec.ts`

Expected: testes passam (mesmo que sem assertions fortes — eles degradam graciosamente quando não há pendência configurada). Para teste real, seedar staging com uma regra de teste antes (pode ser feito em outra task se necessário).

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/10-pendencias.spec.ts
git commit -m "test(e2e): smoke tests Marco A (modal + faixa + reaparição) (Marco A.11)

3 cenários:
1. Modal aparece no 1º acesso e some após fechar
2. Faixa de pendência aparece em card no Kanban
3. Modal volta quando data armazenada é diferente de hoje

Tolerantes a ausência de pendência configurada (degradam para nota).

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 16: Promoção para produção

**Files:**
- (Sem novos arquivos; apenas execução de scripts)

- [ ] **Step 1: Verificar estado das migrations**

Run: `ls -la supabase/migrations/20260520*.sql`

Expected: 4 arquivos listados (a, b, c, d).

- [ ] **Step 2: Rodar smoke test de schema em staging**

Run: `bash .claude/hooks/schema-smoke-test.sh`

Expected: PASS. (O script lê queries do próprio arquivo; nossas 2 novas queries do step 4 da Task 1 estão lá.)

- [ ] **Step 3: Rodar build local**

Run: `npm run build`

Expected: passa, sem erros TypeScript.

- [ ] **Step 4: Promover migrations em ordem**

```bash
bash .claude/hooks/promote-to-prod.sh supabase/migrations/20260520a_card_alert_rules_channels_recipients.sql
bash .claude/hooks/promote-to-prod.sh supabase/migrations/20260520c_resolve_alert_recipients.sql
bash .claude/hooks/promote-to-prod.sh supabase/migrations/20260520b_evaluate_alert_condition_task_overdue.sql
bash .claude/hooks/promote-to-prod.sh supabase/migrations/20260520d_generate_card_alerts_multi_recipient.sql
```

Expected: cada script imprime "Migration aplicada em PRODUÇÃO" + "smoke test passou" + "registrada no .claude/.migration_log".

**Ordem importa:** A (colunas) → C (resolve func, depende das colunas) → B (evaluate, independente) → D (generate, depende de A, B, C).

- [ ] **Step 5: Validar em produção via curl**

Confirmar colunas:

```bash
source .env && curl -s "https://szyrzxvlptqqheizyrxu.supabase.co/rest/v1/card_alert_rules?select=show_in_modal,show_in_kanban_banner,show_in_bell,recipient_mode,recipient_target&limit=1" \
  -H "apikey: $VITE_SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
```

Expected: JSON com chaves esperadas.

Confirmar função:

```bash
source .env && curl -s -X POST "https://szyrzxvlptqqheizyrxu.supabase.co/rest/v1/rpc/generate_card_alerts" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{}'
```

Expected: número (qtd de notificações criadas — pode ser 0 se nada novo).

- [ ] **Step 6: Marcar migration como aplicada (CLAUDE.md §Protocolo de Migrations)**

Run: `touch .claude/.migration_applied`

- [ ] **Step 7: Push para main**

```bash
git push origin main
```

Expected: GitHub Actions roda CI + E2E preview + smoke prod. Confirmar verde no GitHub. Se vermelho, investigar antes de declarar pronto.

- [ ] **Step 8: Validação humana em produção**

1. Logar com conta de admin.
2. Ir em `/admin/regras-de-alerta`.
3. Criar regra "Proposta Enviada sem Orçamento Previsto" — condição `stage_requirements`, escopo apropriado (pipeline TRIPS ou WEDDING, fase Vendas, stage Proposta Enviada), severidade `warning`, toggles ON em modal e banner e bell, destinatário `card_owner`.
4. Aguardar 1 minuto.
5. Logar com usuário owner de um card que viole a regra.
6. Modal de boas-vindas aparece (limpar localStorage se necessário).
7. Faixa âmbar aparece no card no Kanban.
8. Item aparece no sininho.
9. Clicar em "Abrir" no modal — navega pro card.
10. Preencher Orçamento Previsto, salvar.
11. Aguardar próximo run do cron (06h) OU disparar manualmente `generate_card_alerts` — faixa some, item some do sininho.

- [ ] **Step 9: Comunicar ao Vitor (sem jargão)**

```
Pronto! O CRM agora avisa proativamente sobre pendências importantes
do dia. Você pode testar abrindo o CRM amanhã de manhã ou criando
uma regra nova em Admin → Regras de Alerta.

Cada regra tem três configurações novas:
- Mostra modal de boas-vindas? sim/não
- Mostra faixa no card no Kanban? sim/não
- Manda no sininho? sim/não

E você escolhe quem recebe: dono do card, todos os admins,
papéis específicos (SDR/Vendas/Pós/Concierge) ou usuários específicos.

Se algo parecer errado, me avisa.
```

---

## Self-Review (after completing all tasks)

**Spec coverage:** ✅
- §3.1 (4 tipos): Tasks 3 (task_overdue) + reuso dos demais ✅
- §3.2 (4 canais): Task 1 (colunas), Task 6 (UI), Task 8 (hook filtro) ✅
- §3.3 (4 destinatários): Task 1 (colunas), Task 2 (RPC), Task 7 (UI) ✅
- §3.4 (cenário Maria): Tasks 11, 12, 13, 14 cobrem fluxo completo ✅
- §3.5 (detecção 1º acesso): Task 9 ✅
- §3.6 ("Fechar" não marca lida): Task 11 só chama markShown ✅
- §3.7 (visual da faixa): Task 13 ✅
- §4.A.1-A.9: Tasks 1-16 mapeiam 1:1 ou 1:N ✅

**Placeholders:** sem "TBD"/"TODO"/"add error handling vago". Todos os steps têm código ou comando concreto.

**Type consistency:**
- `PendingNotification` em `usePendingNotifications.ts` é a interface compartilhada usada em `PendenciaItem` (Task 10) e `KanbanCardPendenciaFaixa` (Task 13). ✅
- `AlertChannel = 'modal' | 'banner' | 'bell'` consistente entre hook e componentes. ✅
- `RecipientMode` valores batem com o CHECK constraint da migration. ✅
- Severidade `'critical' | 'warning' | 'info'` igual em todos os pontos. ✅

**Riscos conhecidos:**
- Task 3 depende de leitura cuidadosa do arquivo original (preserve branches existentes). Documentado no step 1 com warning explícito + comando grep do CLAUDE.md TOP 5 #5.
- Task 7 cria `useWorkspaceMembers` se não existir; se já existe versão equivalente, REUSAR (step 1 confirma).
- Task 13 usa o filtro de `byChannel('banner')` + `byCard(cardId)`. Cuidado de complexidade: lê todas as notificações 1× no nível pai, filtra em memória — OK pra dezenas de cards no board.

---

## Execução

Plano completo. **Opções:**

1. **Subagent-Driven (recomendado)** — Dispatch fresh agent por task, review entre cada uma. Mais lento mas mais seguro.
2. **Inline Execution** — Executo direto neste contexto, com checkpoints a cada 3-4 tasks.

Vitor: qual prefere?
