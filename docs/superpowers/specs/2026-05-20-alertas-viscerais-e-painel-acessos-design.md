# Alertas Viscerais de Pendência + Painel de Acessos do Admin

**Data:** 2026-05-20
**Status:** Design aprovado (brainstorm com Vitor em 2026-05-20)
**Próximo passo:** Plano de implementação (writing-plans)

---

## 1. Contexto

Hoje o WelcomeCRM já tem motor de regras de alerta (`card_alert_rules`, `evaluate_alert_condition`, `generate_card_alerts`) que cria notificações na tabela `notifications` e as entrega via sininho realtime (`NotificationCenter`). Funciona, mas é silencioso demais — operador só sente a regra quando tenta mover um card e é bloqueado pelo Quality Gate, ou quando casualmente abre o sininho.

Vitor quer **viscerar** essas pendências: um modal de boas-vindas no primeiro acesso do dia que lista o que está pendente, e uma faixa colorida no topo do card no Kanban indicando a pendência principal. Tudo configurável por regra no admin.

Aproveitando a abertura, Vitor também pediu um **Painel de Acessos do Admin** — página greenfield para listar usuários, ver histórico de logins (com IP/dispositivo), auditar ações realizadas no CRM e desativar/forçar logout. Isso resolve gap de observabilidade administrativa que hoje não existe.

**Resultado esperado:** operadores começam o dia sabendo exatamente o que precisa de atenção; admins têm visão clara de quem acessa o sistema e o que fazem nele.

---

## 2. O que JÁ existe (reaproveitar)

| Peça | Status | Será estendida? |
|---|---|---|
| `card_alert_rules` (tabela) | Pronta | Sim — novas colunas pra canais e destinatário |
| `evaluate_alert_condition` (RPC) | Avalia stage_requirements, field_missing, days_in_stage, field_equals, no_contact, contact_missing_data, and/or/not | Sim — adicionar `task_overdue` |
| `generate_card_alerts` (RPC) | Roda diariamente às 6h via cron, dedup por (user, card, rule) | Sim — resolver destinatário dinâmico |
| `notifications` (tabela) | Linha por (user, card, rule), realtime via Supabase | Mantida intacta |
| `NotificationCenter` (componente) | Sininho draggável bottom-right, realtime | Mantido |
| `useNotifications` (hook) | Lê notifications do user logado | Reusado (modal e faixa lêem dele) |
| `CardAlertRulesPage` em `/admin/regras-de-alerta` | Tela de criação/edição de regras | Sim — ganha toggles de canal e seletor de destinatário |
| `KanbanCard` (componente) | Renderiza cards no board | Sim — recebe faixa de pendência |
| `QualityGateModal` | Modal de bloqueio ao mover card | Mantido (cobre o caso "tentar mover sem requisito"; o novo sistema é proativo) |

---

## 3. Escopo do MVP (Marco A)

### 3.1 Tipos de pendência incluídos no MVP

| Tipo | Condição no motor | Status |
|---|---|---|
| Campo obrigatório vazio | `stage_requirements` | Já existe |
| Card parado há N dias na etapa | `days_in_stage` (>= N) | Já existe |
| Tarefa atrasada do dono | `task_overdue` | **Criar no Marco A** |
| Contato com dados faltando | `contact_missing_data` | Já existe |

### 3.2 Canais de entrega (configurável por regra)

Cada regra em `card_alert_rules` ganha 4 toggles independentes:

- `show_in_modal` — aparece no modal de boas-vindas do dia
- `show_in_kanban_banner` — aparece como faixa no topo do card no Kanban
- `show_in_bell` — aparece no sininho de notificações
- `send_email` — manda email (já existe, mantemos)

Toggles independentes → o admin pode ter regras só-faixa (discretas), só-modal (acordar), só-sininho (informativo), ou combinadas.

### 3.3 Destinatários (configurável por regra)

Hoje toda regra cria notificação só pro `dono_atual_id` do card. No MVP, cada regra escolhe:

| Modo | Descrição |
|---|---|
| `card_owner` (default) | Dono atual do card (comportamento atual) |
| `team_managers` | Admins do workspace (`profiles.is_admin = true`) |
| `specific_roles` | Array de papéis (SDR, Planner, Pós-venda, Concierge) — aplica ao dono daquele papel no card |
| `specific_users` | Array de `profile_id` — usuários explícitos |

A RPC `generate_card_alerts` ganha lógica de resolução: para cada regra, gera uma notificação por usuário-destinatário (dedup mantido por user × card × rule).

### 3.4 Cenário de uso (Maria, planner)

**Segunda 09h** — Maria abre o CRM (já estava logada, aba esteve fechada):
1. Kanban carrega normalmente.
2. Modal "Bom dia, Maria — você tem 3 pendências hoje" aparece sobre o board.
3. Lista clicável: cada item mostra `[severidade] Nome do card — texto da pendência [Abrir]`.
4. Clicar em "Abrir" → modal fecha e o card abre direto pra resolver.
5. Clicar em "Fechar" → modal some pelo resto do dia.

**Resto do dia** — Maria troca de aba/dispositivo, modal não reaparece. Cards com pendência têm faixa colorida no topo do KanbanCard com o texto da pendência principal (mais severa) + "e mais 2" se houver outras.

**Terça 08h** — Primeiro acesso do dia novo → modal reaparece, dessa vez recalculado: pendências resolvidas saem; pendências novas que surgiram ontem entram.

### 3.5 Detecção de "1º acesso do dia"

Sem novo login forçado. Sinais detectáveis no browser:

| Sinal | API |
|---|---|
| SPA inicializou | Mount do AuthProvider/AppShell |
| Aba voltou a ficar visível | `document.visibilitychange` (Page Visibility API) |
| Usuário voltou de ausência | Eventos de input após X min idle (`mousemove`, `keydown`) |

Algoritmo:
1. Ao detectar qualquer um dos sinais, ler `localStorage.lastPendenciaModalShownDate` (formato `YYYY-MM-DD`).
2. Se ausente OU diferente de hoje → mostrar modal, gravar data de hoje.
3. Se igual → silenciar.

Limitações aceitas:
- Múltiplos browsers/dispositivos no mesmo dia → modal aparece 1× em cada (aceitável; quem usa 2 lugares vê 2).
- Reset de localStorage (limpou cache) → modal reaparece (aceitável).

Não vai pro banco: simples, suficiente, evita poluir queries.

### 3.6 Comportamento do "Fechar" no modal

- Marca a chave `lastPendenciaModalShownDate` com a data de hoje.
- **NÃO** marca as notificações em si como lidas. Elas continuam não-lidas no sininho e voltam no modal de amanhã até a pessoa resolver.
- Botão "Resolvido / Não me incomode mais" não entra no MVP (evitar atalho de silenciar sem resolver).

### 3.7 Visual da faixa no card (Kanban)

Faixa horizontal no topo do `KanbanCard`, acima do título. Texto curto da pendência principal (a mais severa). Cor pela severidade:

| Severidade | Cor (Tailwind) | Exemplo |
|---|---|---|
| `critical` | `bg-red-50 border-red-200 text-red-800` | "Orçamento previsto vazio" |
| `warning` | `bg-amber-50 border-amber-200 text-amber-800` | "Parado há 11 dias em Proposta" |
| `info` | `bg-sky-50 border-sky-200 text-sky-800` | "Contato sem email" |

Se houver mais de 1 pendência: sufixo `" • + 2"` (não detalha, só conta).

Light-mode-first per CLAUDE.md (sem `text-white` sem container escuro).

---

## 4. Marco A — Implementação (5–7 dias)

### A.1 — Migration: novas colunas em `card_alert_rules`

```sql
ALTER TABLE card_alert_rules
  ADD COLUMN show_in_modal BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN show_in_kanban_banner BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN show_in_bell BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN recipient_mode TEXT NOT NULL DEFAULT 'card_owner'
    CHECK (recipient_mode IN ('card_owner','team_managers','specific_roles','specific_users')),
  ADD COLUMN recipient_target JSONB DEFAULT '[]'::jsonb;
-- send_email já existe
```

**Backfill:** regras existentes ficam com `show_in_bell=true`, demais `false` (preserva comportamento atual).

Aplicar via `bash .claude/hooks/apply-to-staging.sh` (per CLAUDE.md, NUNCA direto em produção).

### A.2 — Novo tipo de condição: `task_overdue`

Atualizar `evaluate_alert_condition(card_id, condition_jsonb)`:

```json
{
  "type": "task_overdue",
  "days_overdue": 1,
  "tarefa_tipo": "follow_up" // opcional
}
```

Lógica SQL: card tem alguma activity tipo `task` (ou da `tarefa_tipo` específica) com `data_prevista < NOW() - INTERVAL 'X days'` e `status != 'concluida'`.

Adicionar query de smoke test em `.claude/hooks/schema-smoke-test.sh`.

### A.3 — RPC `generate_card_alerts` — destinatário dinâmico

Resolver destinatários conforme `recipient_mode`:

| Modo | Resolução |
|---|---|
| `card_owner` | `card.dono_atual_id` (atual) |
| `team_managers` | `SELECT id FROM profiles WHERE org_id = card.org_id AND is_admin = true` |
| `specific_roles` | Olhar `recipient_target` (ex: `["sdr","planner"]`) → pegar `card.sdr_owner_id`, `card.planner_owner_id`, etc. |
| `specific_users` | `recipient_target` é array de `profile_id` direto |

Para cada destinatário, gerar uma `notifications` linha (dedup user × card × rule mantido). Notificação carrega no metadata: `{rule_id, severity, missing_fields, channels: {modal, banner, bell}}` para o frontend filtrar.

### A.4 — Frontend Admin: `CardAlertRulesPage`

Estender a tela em `src/pages/admin/CardAlertRulesPage.tsx`:

- 4 toggles em uma seção "Canais": Modal / Faixa no Kanban / Sininho / Email
- Dropdown "Destinatário": Dono do card / Admins do workspace / Papéis específicos / Usuários específicos
- Se "Papéis específicos" → checkbox-list (SDR, Planner, Pós-venda, Concierge)
- Se "Usuários específicos" → multi-select de profiles do workspace (via `useFilterProfiles()` per CLAUDE.md, NUNCA `profiles.eq('org_id')` direto)
- Para o tipo `task_overdue`: campo "Dias de atraso" + dropdown opcional "Tipo de tarefa"

Visual seguir DESIGN_SYSTEM.md: light mode first, `bg-white border border-slate-200 shadow-sm rounded-xl`, tokens semânticos.

### A.5 — Hook `usePendingNotifications`

Novo hook em `src/hooks/usePendingNotifications.ts`. Lê de `notifications` filtrando por:
- `user_id = current_user.id`
- `read = false`
- `type = 'card_alert_rule'`
- Channel filter: helper `byChannel('modal' | 'banner' | 'bell')` filtra metadata.

Reusa cliente Supabase do `useNotifications`. Não duplica subscription realtime — extende.

### A.6 — Componente `PendenciasModalDiario`

Novo em `src/components/notifications/PendenciasModalDiario.tsx`.

Lógica:
1. Mount: lê `localStorage.lastPendenciaModalShownDate`.
2. Listener: `visibilitychange` quando `document.visibilityState === 'visible'`.
3. Comparar data salva com `new Date().toISOString().slice(0,10)`.
4. Se diferente → setar `isOpen = true`, gravar data.

UI (per parte 3 do design):
```
┌─ Bom dia, Maria ─────────────────────┐
│ Você tem 3 pendências hoje:          │
│                                      │
│ ⚠ Ana & João                         │
│   Orçamento previsto vazio  [Abrir]  │
│ ⚠ Bruno & Carla                      │
│   Parado 11d em Proposta    [Abrir]  │
│ ⚠ Felipe & Marina                    │
│   Tarefa atrasada 3d        [Abrir]  │
│                                      │
│                          [Fechar]    │
└──────────────────────────────────────┘
```

- Lista ordenada por severidade (critical > warning > info), depois por `created_at` desc.
- Item: `[ícone-severidade] [Título do card]` em uma linha, texto da pendência em linha menor.
- Clicar "Abrir" → `navigate(/card/:id)` + fecha modal (mas mantém `lastPendenciaModalShownDate` setado).
- "Fechar" → só fecha.

Montado no `AppShell` (`src/components/layout/AppShell.tsx`) para estar disponível em qualquer rota autenticada.

### A.7 — Componente `KanbanCardPendenciaFaixa`

Novo em `src/components/pipeline/KanbanCardPendenciaFaixa.tsx`.

Props: `cardId: string`.
Lê via `usePendingNotifications().byChannel('banner').filter(n => n.card_id === cardId)`.
Renderiza faixa colorida no topo se houver itens; nada caso contrário.

Integrar em `src/components/pipeline/KanbanCard.tsx` — adicionar `<KanbanCardPendenciaFaixa cardId={card.id} />` antes do título.

Considerar performance: o hook carrega todas notificações do usuário 1×, e filtra em memória por card. Não fazer query separada por card (poluiria o board com N queries em paralelo). Já é o padrão do `useNotifications`.

### A.8 — Testes E2E

Adicionar `tests/e2e/10-pendencias.spec.ts` (smoke):
- Login → modal aparece se tiver pendência → clica "Fechar" → recarrega aba → modal não aparece de novo no mesmo dia.
- Verificar faixa no card no Kanban com texto correto.
- Mockar data via Playwright `clock.install()` pra simular "amanhã" → modal volta.

### A.9 — Promoção e validação

- Aplicar migrations via `promote-to-prod.sh` (per CLAUDE.md).
- Smoke test do schema passa.
- Build passa.
- Validação visual em staging antes de prod.

---

## 5. Marco B — Painel de Acessos do Admin (4–6 dias)

### B.1 — Tabela de auditoria

Verificar primeiro `platform_audit_log` (mencionado no CLAUDE.md como infra de tenancy). Se já cobrir o necessário, estendê-la; se não, criar `audit_log` complementar:

```sql
CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL DEFAULT requesting_org_id() REFERENCES organizations(id),
  user_id UUID REFERENCES profiles(id),
  action_type TEXT NOT NULL,
  -- 'login','logout','card_create','card_move','card_archive',
  -- 'contact_edit','proposal_send','user_invite','user_deactivate'
  entity_type TEXT, -- 'card','contact','proposal','user'
  entity_id UUID,
  metadata JSONB,
  ip TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ON audit_log (org_id, created_at DESC);
CREATE INDEX ON audit_log (user_id, created_at DESC);
CREATE INDEX ON audit_log (action_type, created_at DESC);
```

RLS: somente `is_admin` do workspace pode ler. Service role escreve.

### B.2 — Captura de IP/UA no login

Hook do Supabase Auth (Edge Function `auth-hook`) ou trigger pós-login. Capturar IP via header `x-forwarded-for` e UA via `user-agent`. Inserir linha em `audit_log` com `action_type='login'`.

Se não existir edge function dedicada, criar `supabase/functions/audit-login/index.ts` que recebe webhook de auth event.

### B.3 — Triggers de auditoria nas tabelas-chave

Triggers `AFTER INSERT OR UPDATE OR DELETE` em:
- `cards` → action: `card_create`, `card_move` (se `etapa_id` mudou), `card_archive` (se `archived_at` setado)
- `contatos` → `contact_create`, `contact_edit`
- `proposals` → `proposal_send` (status muda pra `sent`)
- `profiles` → `user_invite`, `user_deactivate`

Cada trigger insere em `audit_log` com `user_id = auth.uid()`, `entity_type`, `entity_id`, `metadata` (diff entre OLD e NEW se relevante).

### B.4 — Página `/admin/acessos`

Novo arquivo `src/pages/admin/AcessosPage.tsx`. Rota em `App.tsx` com guard `is_admin`.

3 abas via query param `?tab=`:

#### Aba 1 — Usuários
- Lista de profiles do workspace (via `useFilterProfiles()` ou similar — `org_members` join `profiles`, per CLAUDE.md).
- Colunas: Nome, Email, Papel, Último acesso (`audit_log.action_type='login'` mais recente), Status (ativo/inativo), Ações.
- Botões: "Desativar" (seta `profiles.active = false`), "Forçar logout" (chama edge function que invalida sessions no Supabase Auth).
- Filtro: ativo / inativo / nunca logou.

#### Aba 2 — Logins
- Timeline filtrável de `audit_log` com `action_type='login'` ou `'logout'`.
- Colunas: Data/hora, Usuário, IP, Dispositivo (parseado do UA), Status (sucesso/falha).
- Filtros: usuário, período (últimos 7d / 30d / custom), IP.
- Marca logins suspeitos: IP novo pra esse user, IP de país diferente (se geo-locate disponível — não obrigatório no MVP).

#### Aba 3 — Ações
- Timeline filtrável de `audit_log` com `action_type != 'login'`.
- Colunas: Data/hora, Usuário, Ação, Entidade (card/contato/etc), Detalhes (resumo do metadata).
- Filtros: usuário, tipo de ação, entidade, período.
- Clicar em entidade → leva pro card/contato/proposta direto.

Visual: light mode, tabela em `bg-white border border-slate-200 rounded-xl` com hover suave. Paginação 50/página.

### B.5 — Exportar histórico

Botão "Exportar CSV" em cada aba. Edge function `supabase/functions/audit-export/index.ts` gera CSV com Latin-1 (per `feedback_csv_encoding.md`).

### B.6 — Smoke test + validação

- Criar e-mail teste, logar, verificar que aparece em Logins com IP correto.
- Mover card de etapa, verificar que aparece em Ações.
- Desativar usuário teste, verificar que login dele para de funcionar.

---

## 6. Backlog mapeado — tipos de pendência NÃO incluídos no MVP

Pra não esquecer (pedido explícito do Vitor):

| Tipo de pendência | Como implementar | Quando |
|---|---|---|
| **Combinado** "campo vazio E há X dias parado" | Motor já tem `and` — só precisa expor no editor visual da regra (hoje exige JSON manual) | Fase 2 |
| **Proposta** não enviada há X dias | Novo tipo `proposal_not_sent`: card sem nenhuma proposta com status `sent` E criado há >= X dias | Fase 2 |
| **Proposta** sem aceite há X dias | Novo tipo `proposal_no_acceptance`: proposta `sent` há >= X dias, status atual != `accepted` | Fase 2 |
| **Atividade zerada** no card há X dias | Novo tipo `no_activity`: card sem activity nos últimos X dias | Fase 2 |
| **TRIPS/WEDDING:** evento próximo sem taxa paga | Novo tipo `event_close_no_payment`: cruzar `data_evento` com pagamento de taxa | Fase 3 (lógica específica de produto) |
| **TRIPS:** viajantes incompletos | Novo tipo `travelers_incomplete`: lista de viajantes vazia E `data_evento` < 30d | Fase 3 |
| **Documento** obrigatório ausente | Motor já tem `document` no `evaluate_alert_condition` — falta expor no editor visual e UI de upload | Fase 2 |
| **Owner faltando** (ex: card sem SDR) | Motor já tem `team_member` — falta expor no editor | Fase 2 |
| **Contato sem vínculo** | Motor já tem `no_contact` — incluir no MVP é trivial, mas Vitor priorizou os outros 4 primeiro | Fase 2 (rapidíssimo) |
| **Métrica do mês** abaixo da meta | Cross-card, escopo de analytics — não é "pendência por card" e sim "alerta gerencial". Vai pra dashboard, não pro modal/faixa | Fase futura, outro projeto |

---

## 7. Sucesso — como medir

| Métrica | Como medir | Meta |
|---|---|---|
| Operadores resolvem pendências em <24h | `audit_log` "card sem pendência" 1 dia após detecção / total de pendências | 50% no 1º mês |
| Adoção do modal | % de modais "Fechar" ou ação direta vs. ignorar (refresh sem interagir) | >70% |
| Cards com faixa visível diminuem ao longo da semana | Histograma de `notifications` não-lidas tipo `card_alert_rule` por dia | Tendência decrescente |
| Painel de Acessos é usado | % de admins que abrem `/admin/acessos` semanalmente | >50% dos admins |

Instrumentar via `audit_log` próprio.

---

## 8. Decisões em aberto / riscos

| Item | Risco | Mitigação |
|---|---|---|
| `localStorage` pra "1º acesso do dia" | Usuário com 2 dispositivos vê modal 2× no dia | Aceitável. Migrar pra banco se virar pain point. |
| Triggers de auditoria em tabelas quentes (`cards`) | Performance hit em inserts/updates massivos | Trigger leve (só insere linha), índice composto. Bench em staging. |
| Migration `card_alert_rules` quebrar regras existentes | Backfill incorreto silencia regras vigentes | Backfill `show_in_bell=true` preserva comportamento; testar em staging primeiro. |
| `task_overdue` perfornance | Query de activities pode ser lenta com muitos cards | Index em `activities(card_id, status, data_prevista)`. |
| Painel de Acessos mostrar dados sensíveis | IP/UA podem ser PII em alguns contextos | RLS estrita (só is_admin lê); LGPD: incluir aviso no Termos de Uso. |
| Forçar logout via Supabase Auth | API pública limitada | Edge function com `service_role` invalida session. Documentar no marco B.4. |

---

## 9. Verificação end-to-end

Antes de declarar pronto cada Marco:

### Marco A
- [ ] Migration aplicada em staging com `apply-to-staging.sh`
- [ ] Schema smoke test passa
- [ ] `npm run build` passa
- [ ] Testes E2E `10-pendencias.spec.ts` passam
- [ ] Validação manual em staging: criar regra "Proposta Enviada sem Orçamento Previsto" → ver faixa no card → ver modal de manhã → resolver → confirmar que some
- [ ] Promovido pra prod com `promote-to-prod.sh`
- [ ] Validação manual em prod com card real

### Marco B
- [ ] Migrations de `audit_log` + triggers aplicadas em staging
- [ ] Testes manuais: login → ver em Logins; mover card → ver em Ações; desativar user → confirmar bloqueio
- [ ] Performance bench: inserir 1000 cards e medir overhead dos triggers
- [ ] Página `/admin/acessos` renderiza nas 3 abas
- [ ] Promovido pra prod
- [ ] Validação manual com admin real

---

## 10. Referências

- **Investigação inicial:** ver memória da conversa de 2026-05-20 (brainstorm com Vitor)
- **Sistema atual de regras de alerta:** `supabase/migrations/20260407_card_alert_rules_table.sql`, `20260407_evaluate_alert_condition.sql`, `20260407_generate_card_alerts.sql`
- **Página admin atual:** `src/pages/admin/CardAlertRulesPage.tsx`
- **Componente sininho:** `src/components/layout/notifications/`
- **Hook notifications:** `src/hooks/useNotifications.ts`
- **Quality Gate (sistema complementar):** `src/hooks/useQualityGate.ts`, `src/components/card/QualityGateModal.tsx`
- **CLAUDE.md regras críticas aplicadas:** workspace isolation (org_id em todas listagens), multi-tenant org_members (não profiles.eq.org_id), migration staging-first, light-mode-first design
