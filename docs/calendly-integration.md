# Integração direta Calendly → CRM

Recebe webhooks do Calendly direto no CRM (sem passar mais pelo ActiveCampaign).
A edge function **só registra** o webhook no banco e tenta fazer match do contato/card por email/telefone — ela **não cria tarefa nem move card**. A reação ao webhook é 100% configurada pelo usuário via automações no Workflow Editor (gatilho `calendly_invitee_created`).

## Componentes

- **Tabela**: [`calendly_webhook_events`](../supabase/migrations/20260525b_calendly_webhook_events.sql) — log de todos os webhooks recebidos (raw payload, status, match com card).
- **Edge function**: [`calendly-webhook`](../supabase/functions/calendly-webhook/index.ts) — endpoint público que recebe, valida HMAC, persiste log e atualiza match em background.
- **Trigger SQL**: [`process_cadence_entry_on_calendly_invitee`](../supabase/migrations/20260526_calendly_invitee_created_trigger.sql) — quando `calendly_webhook_events` vira `success`, enfileira automações ativas em `cadence_entry_queue`. Se a automação tem "criar card se não existir" marcado, cria contato + card antes de enfileirar.
- **Trigger UI**: tipo `calendly_invitee_created` aparece como gatilho tanto no canvas do **Workflow Editor v2** quanto no **builder v1**. Aceita filtros opcionais (organizer_email, event_name_pattern) e opção de "criar card novo se não existir" (com pipeline + etapa inicial configuráveis).
- **Script de ativação**: [`scripts/calendly-create-subscription.js`](../scripts/calendly-create-subscription.js) — registra a subscription no Calendly.

## Passo-a-passo de ativação

> **Antes**: tenha em mãos um PAT do Calendly de um usuário **Owner ou Admin** da organização (necessário pra criar subscription `organization`-scope).

### 1) Aplicar migration (já feito)

```bash
bash .claude/hooks/promote-to-prod.sh supabase/migrations/20260525b_calendly_webhook_events.sql
```

Validar:

```bash
source .env
curl -s "https://szyrzxvlptqqheizyrxu.supabase.co/rest/v1/calendly_webhook_events?select=count" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Prefer: count=exact" -I | grep -i content-range
# Esperado: content-range: */0
```

### 2) Deploy da edge function (já feito)

```bash
npx supabase functions deploy calendly-webhook --no-verify-jwt --project-ref szyrzxvlptqqheizyrxu
```

URL pública resultante: `https://szyrzxvlptqqheizyrxu.supabase.co/functions/v1/calendly-webhook`

### 3) Criar subscription no Calendly

Cole o PAT no shell (não no `.env` versionado):

```bash
export CALENDLY_PAT='<token Owner/Admin>'
node scripts/calendly-create-subscription.js
```

O script:
- Identifica seu usuário e a organização ativa.
- Cria subscription `organization`-scope com events `invitee.created` + `invitee.canceled`.
- **Imprime o `signing_key` na tela uma vez só** — copie imediatamente.

### 4) Configurar signing_key como secret

```bash
npx supabase secrets set CALENDLY_SIGNING_KEY='<signing_key impresso no passo 3>' \
  --project-ref szyrzxvlptqqheizyrxu
```

Sem essa key configurada, a edge function **aceita qualquer requisição** (sem validar HMAC) e loga warning. Com a key, requisições com assinatura inválida recebem 401.

### 5) Smoke test end-to-end

1. Vá no Calendly e marque uma reunião teste **usando o email de um contato que JÁ existe no CRM**.
2. Aguarde alguns segundos.
3. Confira o log:

```bash
source .env
curl -s "https://szyrzxvlptqqheizyrxu.supabase.co/rest/v1/calendly_webhook_events?select=event_type,invitee_email,processed_status,tarefa_id,card_id,created_at&order=created_at.desc&limit=5" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
```

Espera-se ver uma linha com `processed_status='success'`, `tarefa_id` e `card_id` preenchidos.

4. Confira o card: deve estar na etapa "Reunião Agendada".

## Comportamento esperado

A edge function **sempre** termina em `processed_status='success'` (a menos que dê erro técnico). Quem decide o que fazer com o evento é o trigger SQL conforme as automações ativas.

| Cenário | Edge function | Trigger SQL → cadence_entry_queue |
|---------|---------------|-----------------------------------|
| Lead com card existente | `success` + `card_id` populado | Enfileira pra cada automação cujos filtros batem |
| Lead novo (sem contato/card) | `success` + `card_id` null | Enfileira só se automação tem "criar card se não existir" marcado — cria contato + card antes |
| `invitee.canceled` | `success` | Não dispara (escopo atual = só `invitee.created`) |
| HMAC inválido | (não persiste, retorna 401) | — |
| Webhook duplicado (mesmo `event_uuid`) | (retorna 200, não duplica) | — |

**Importante:** se nenhuma automação está configurada pra `calendly_invitee_created`, o webhook fica só no log. Nada acontece com o card.

## Queries úteis pra debug

**Últimos webhooks recebidos**:
```sql
SELECT created_at, event_type, invitee_email, processed_status, error_message
FROM calendly_webhook_events
ORDER BY created_at DESC
LIMIT 20;
```

**Unmatched (precisam revisão manual)**:
```sql
SELECT created_at, invitee_email, invitee_name, event_start_time, payload->'payload'->>'name' AS event_name
FROM calendly_webhook_events
WHERE processed_status = 'unmatched'
ORDER BY created_at DESC;
```

**Reuniões criadas via Calendly**:
```sql
SELECT t.id, t.titulo, t.data_vencimento, t.status, c.titulo AS card
FROM tarefas t
JOIN cards c ON c.id = t.card_id
WHERE t.external_source = 'calendly'
ORDER BY t.created_at DESC
LIMIT 20;
```

## Kill switch

Se algo der errado e precisar parar o processamento sem deletar a subscription:

1. **Opção 1 — Pausar no Calendly**: deletar a subscription via API ou dashboard.
2. **Opção 2 — Deletar `CALENDLY_SIGNING_KEY` do Supabase**: vai rejeitar todas as requisições com 401 (Calendly retenta por 24h depois desativa sozinha).

## Próximos passos (fora do escopo deste pacote)

- Página admin em Configurações pra ver `calendly_webhook_events` em tela.
- Auto-criação de contato+card quando `unmatched`.
- Desligar o caminho ActiveCampaign para reuniões (depois de validar 100%).
- Rotacionar o PAT do Calendly periodicamente.
