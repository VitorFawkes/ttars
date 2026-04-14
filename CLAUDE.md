# WelcomeCRM - Instruções

**Supabase Produção:** `szyrzxvlptqqheizyrxu` | **Org:** `zyxcqlnmbfkkwurykfuf` | **Region:** `us-east-2`
**Supabase Staging:** `ivmebyvjarcvrkrbemam` (defasado — Supabase Branching substitui staging por PR)
**Stack:** React + Vite + TailwindCSS + Supabase (PostgreSQL + Edge Functions) + TypeScript Strict

## Regras Invioláveis
- IMPORTANT: NUNCA hardcode secrets. Use `import.meta.env.VITE_*` ou variáveis de ambiente
- IMPORTANT: NUNCA modifique view/trigger/function SQL sem ler docs/SQL_SOP.md primeiro
- IMPORTANT: Antes de criar hook/componente/página, verificar se já existe em `.agent/CODEBASE.md` ou via MCP `get_context`
- IMPORTANT: Ao criar hook/página/componente novo, rodar `npm run sync:fix` para atualizar inventário
- IMPORTANT: NUNCA aplicar migrations diretamente em PRODUÇÃO. Sempre STAGING primeiro. Ver "Protocolo de Migrations" abaixo.
- IMPORTANT: Ao criar view/coluna nova usada pelo frontend, adicionar a query ao smoke test em `.claude/hooks/schema-smoke-test.sh`
- IMPORTANT: **Isolamento de Produto é obrigatório.** NUNCA misturar dados entre TRIPS e WEDDING. Ver seção "Isolamento de Produto" abaixo.
- IMPORTANT: NUNCA pedir credenciais ao usuário. `.env` tem tudo (Supabase, n8n, Vercel). ActiveCampaign em `integration_settings` no banco.
- Commits em português. Co-author: `Co-Authored-By: Claude <noreply@anthropic.com>`

## Fluxo Autônomo com o Usuário (OBRIGATÓRIO — override de comportamento padrão)

O Vitor (dono do projeto) **não é programador**. Todo agente trabalhando neste repositório segue estas regras:

### Nunca perguntar sobre decisões técnicas
Decidir sozinho, seguindo as convenções do projeto, sobre:
- Branches, merges, push, commits, nomes de commit
- Quais migrations aplicar, quando, em qual ordem
- Deploy de edge functions, config do Vercel
- Formato de código, refatoração, organização de arquivos
- Arquivos modificados/untracked de **outras tarefas** — **ignorar em silêncio, nunca mencionar**

### Só perguntar quando
- **Objetivo de negócio ambíguo** (ex: "esse campo aparece pra admin ou pra todos os usuários?")
- **Ação irreversível de alto impacto** (apagar dados reais de clientes, cobrar de verdade, mandar email em massa pra lista real de produção, deletar tabelas com dados)

### Gatilhos de aprovação → executar pipeline completa até produção
Qualquer uma destas frases significa "sobe tudo pra produção, sem perguntar":
- "pode subir" / "sobe isso" / "pode mandar"
- "tá aprovado" / "está aprovado"
- "manda ver" / "bora" / "coloca no ar"

**Ao detectar gatilho, executar `/subir completo` sem pausas intermediárias.**

### Estilo da resposta final (OBRIGATÓRIO)

**Palavras PROIBIDAS no corpo principal da resposta ao Vitor** (traduzir para linguagem humana):
- `merge`, `branch`, `commit`, `push`, `pull request`, `PR`
- `migration`, `RLS`, `trigger`, `RPC`
- `edge function`, `deploy`, `CI`, `build`
- `staging`, `rollback`, `hash`

**Formato padrão do resumo final:**
```
Pronto! <o que foi feito em 1 frase, sem jargão>.
Você consegue testar em <tela ou link direto>.
Se algo parecer errado, me avisa.
```

**Exceção:** se der erro real que precise da decisão do Vitor, explicar o problema em português claro e sugerir 2–3 caminhos. Nunca jogar stack trace no usuário.

### Rede de segurança em produção
- **Sentry** está ativo (`VITE_SENTRY_DSN` configurado em `.env` e Vercel). Qualquer erro em produção vai pra lá automaticamente.
- Antes de dizer "pronto, tá no ar", confirmar que o build passou (`npm run build`).

## Ambientes (OBRIGATÓRIO ENTENDER)

| Ambiente | Banco | Quando |
|----------|-------|--------|
| `npm run dev` (local) | **PRODUÇÃO** (szyrzxvlptqqheizyrxu) | Padrão — `.env` aponta para produção |
| `npm run dev` (local, staging) | **STAGING** (ivmebyvjarcvrkrbemam) | Após trocar `.env` por `.env.development.staging` |
| Vercel Preview (branches) | **STAGING** (ivmebyvjarcvrkrbemam) | PRs e testes |
| Vercel Production (main) | **PRODUÇÃO** (szyrzxvlptqqheizyrxu) | Usuários finais |

**Regra:** Migrations SEMPRE vão para staging primeiro via script (`apply-to-staging.sh`). O dev local por padrão lê produção. Para testar migrations no staging localmente, troque o `.env` pelo `.env.development.staging`. NUNCA aplique SQL diretamente no banco — use os scripts.

## Protocolo de Migrations (OBRIGATÓRIO)

### Fluxo: Staging → Teste → Produção

**Passo 1 — Aplicar no STAGING:**
```bash
bash .claude/hooks/apply-to-staging.sh supabase/migrations/SEU_ARQUIVO.sql
```

**Passo 2 — Testar:** A migration foi aplicada no staging. Se o dev local aponta para staging (`.env.development.staging`), verificar que funciona. Se aponta para produção, testar via Vercel Preview ou trocar o `.env`.

**Passo 3 — Promover para PRODUÇÃO** (quando o usuário pedir):
```bash
bash .claude/hooks/promote-to-prod.sh supabase/migrations/SEU_ARQUIVO.sql
```
Esse script aplica no banco de produção E roda o smoke test automaticamente.

**Passo 4 — Marcar:**
```bash
touch .claude/.migration_applied
```

### Quando o usuário diz...

| Frase do usuário | O que o agente faz |
|-------------------|-------------------|
| "Crie uma migration" / feature normal | Escrever SQL → aplicar no STAGING → testar → código frontend |
| "Aplique no staging" | `bash .claude/hooks/apply-to-staging.sh <arquivo>` |
| "Promova para produção" / "Suba para produção" | `bash .claude/hooks/promote-to-prod.sh <arquivo>` para CADA migration pendente |
| "Está tudo ok, pode subir" | Promover todas migrations pendentes + `touch .claude/.migration_applied` |

### Regras de segurança
- NUNCA usar `SUPABASE_ACCESS_TOKEN` (produção) direto. Sempre via script `promote-to-prod.sh`
- NUNCA pular o staging. Se urgente, aplicar no staging primeiro mesmo assim.
- Se a migration falhar no staging, corrigir ANTES de promover.
- O Stop hook BLOQUEIA se detectar `.sql` novo/modificado sem registro no `.claude/.migration_log`
- `promote-to-prod.sh` registra automaticamente cada arquivo no log
- Após terminar todas migrations, rodar `touch .claude/.migration_applied` (backward compat)
- **NUNCA deixe migrations intermediárias/rascunho no disco** — se uma migration foi supersedida por outra, DELETE o arquivo antigo
- Após aplicar em produção, **commitar o arquivo .sql** no git para evitar acúmulo de untracked files

## Arquitetura (3 Suns + Multi-Tenant)
Toda entidade orbita 3 entidades centrais: `cards`, `contatos`, `profiles`.
Novas tabelas DEVEM ter FK para pelo menos uma dessas. Sem exceção.

**Multi-Tenant (SaaS):** O sistema é multi-tenant com isolamento por `org_id`.
- Novas tabelas DEVEM ter `org_id UUID NOT NULL DEFAULT requesting_org_id() REFERENCES organizations(id)`
- Novas RLS policies DEVEM usar `USING (org_id = requesting_org_id())`
- `requesting_org_id()` extrai org_id do JWT `app_metadata` (fallback: Welcome Group)
- Frontend: `useOrg()` do OrgContext para acessar org atual
- Edge Functions: `getOrgId(req)` de `_shared/org-context.ts`

### Tabelas globais (EXCEÇÃO — NUNCA adicionar org_id)

O CRM tem **duas categorias** de tabela:

1. **Por-org (default):** dados de negócio (cards, contatos, propostas, agentes IA, mensagens, etc). Toda tabela nova é por-org, SEM EXCEÇÃO, a menos que se encaixe exatamente em um dos casos abaixo.

2. **Global (lista fechada):** catálogos compartilhados ou tabelas técnicas da plataforma. A decisão já foi tomada e registrada em `COMMENT ON TABLE` (rode `\d+ tabela` no psql ou consulte pg_description). A lista atual:

   - `activity_categories` — catálogo de categorias de atividade
   - `integration_field_catalog` — catálogo de campos padronizados de integração
   - `integration_provider_catalog` — catálogo de providers (AC, Monde, etc)
   - `integration_health_rules` — definições de regras de health check
   - `integration_health_pulse` — agregados por canal para dashboard platform
   - `integration_outbox` — fila técnica polimórfica (service_role only)
   - `webhook_logs` — log cru de webhooks para debug de plataforma
   - `ai_extraction_field_config` — config de campos de extração IA
   - `system_fields` — definição dos campos de sistema (PK=key)
   - `destinations` — híbrido: catálogo base compartilhado + destinos custom por org
   - `organizations`, `org_members`, `platform_audit_log` — infra de tenancy

   **REGRA:** se a tabela está nessa lista, **NÃO** adicionar org_id. RLS acessa via `service_role` ou policy pública de leitura. Se precisa expor para o frontend, criar RPC `SECURITY DEFINER` que filtra conforme necessário.

### Policy RLS — regra de ouro

**NUNCA** criar policy `USING (true)` para role `authenticated` ou `public` em tabela por-org. PostgreSQL faz OR entre policies permissivas — uma `USING (true)` neutraliza qualquer `USING (org_id = requesting_org_id())` ao lado, e vaza dados entre workspaces.

Padrão correto para tabela por-org:
```sql
CREATE POLICY tabela_org_all ON tabela TO authenticated
  USING (org_id = requesting_org_id())
  WITH CHECK (org_id = requesting_org_id());
CREATE POLICY tabela_service_all ON tabela TO service_role
  USING (true) WITH CHECK (true);
```

O hook `.claude/hooks/audit-rls-leaks.sh` roda no Stop e BLOQUEIA se detectar `USING (true)` para authenticated/public em tabela fora da GLOBAL_ALLOWLIST. Se você acabou de adicionar uma tabela genuinamente global, ADICIONE ela na allowlist do script ao mesmo tempo.

## Isolamento de Produto / Org (OBRIGATÓRIO)

**Pós-Fase 5 Org Split:** TRIPS e WEDDING são **organizações separadas** (não mais produtos dentro da mesma org). Cada org filha tem exatamente 1 produto e 1 pipeline. O isolamento primário é por `org_id` via RLS — `.eq('produto', ...)` é defesa em profundidade, não mais a fronteira principal.

- Welcome Trips → produto TRIPS → 1 pipeline
- Welcome Weddings → produto WEDDING → 1 pipeline
- Usuário troca via **OrgSwitcher** (não existe mais ProductSwitcher)

### Fontes de verdade (frontend)
- **Org ativa:** `useOrg()` do OrgContext
- **Produto ativo:** `useProductContext().currentProduct` (derivado da org)
- **Metadados do produto atual (incluindo `pipeline_id`):** `useCurrentProductMeta()` → `{ product, pipelineId, slug }`
- **Pipeline de um produto arbitrário (ex: produto do card pai):** `useProductBySlug(slug)?.pipeline_id`
- **Lista de produtos da org (normalmente 1):** `useProducts()` — query à tabela `products` filtrada por `org_id`

### Frontend — Checklist para código novo
1. Ler `useProductContext().currentProduct` (ou `useAnalyticsFilters().product` no Analytics)
2. Passar `currentProduct` como filtro defensivo em queries a `cards` (`.eq('produto', currentProduct)`) — RLS já isola por org, mas o filtro de produto mantém a UI coerente se a org tiver múltiplos produtos
3. Se a query envolve `pipeline_stages` / `pipeline_phases`, filtrar por `pipeline_id` obtido via `useCurrentProductMeta().pipelineId`
4. **NUNCA** fazer `.from('pipelines').eq('produto', X).single()` só para descobrir `pipeline_id` — use `useCurrentProductMeta()` ou `useProductBySlug()` (o `pipeline_id` já está em `products`)
5. Hooks de analytics: `p_product: product` (nunca `null` — opção "ALL" foi removida)
6. Widgets de dashboard: aceitar prop `productFilter` e filtrar por `card.produto`
7. Reuniões/atividades sem `card_id`: manter visíveis (não filtrar)
8. `usePipelineStages(pipelineId?)` — passar `pipelineId` quando produto importa

### Backend (SQL/RPCs) — Checklist para código novo
1. Toda RPC que toca `cards` DEVE ter: `AND (p_product IS NULL OR c.produto::TEXT = p_product)`
2. Toda RPC que toca `pipeline_stages` DEVE ter:
   ```sql
   JOIN pipelines pip ON pip.id = s.pipeline_id
   WHERE (p_product IS NULL OR pip.produto::TEXT = p_product)
   ```
3. JOIN correto: `pipeline_stages.pipeline_id → pipelines.id` (NÃO via `pipeline_phases` — phases não tem `pipeline_id`)
4. Milestone lookups: filtrar por `s.pipeline_id` para evitar conflito entre `taxa_paga` (TRIPS) e `ww_taxa_paga` (WEDDING)
5. Valor para cards abertos: `COALESCE(c.valor_final, c.valor_estimado, 0)`

---

## Descoberta de Código (OBRIGATÓRIO antes de criar)

Antes de criar hook, componente ou página, VERIFICAR se já existe:
1. Chamar MCP `get_context` com descrição da task, OU
2. Ler `.agent/CODEBASE.md` (inventário completo, auto-atualizado via `npm run sync:fix`)
3. Buscar com grep: `grep -r "useNomeDoHook" src/hooks/`

Após criar hook/page/componente → rodar `npm run sync:fix` para atualizar inventário.

## n8n Workflows

Detalhes completos (IDs, webhooks, arquitetura de nós, deploy rules, gotchas): `memory/n8n-workflows.md`
Deploy: `export $(grep -v '^#' .env | xargs) && node scripts/create-n8n-{nome}.js`

## Arquitetura de Identidade

- **Seção do pipeline** (onde trabalha): `teams.phase_id` → `pipeline_phases.slug` (NÃO `profiles.role`)
- **Admin**: `profile.is_admin === true` (NÃO `role === 'admin'`)
- **Handoff**: `pipeline_stages.target_phase_id` (UUID FK, NÃO `target_role` string)
- **Role legacy**: CONGELADO — sync via trigger `trg_sync_role_from_team`. AuthContext traz joins: `profile.team.phase`

---

## Antes de Modificar Código
1. Leia os arquivos que vai mudar
2. Busque usages do que vai modificar (grep imports e referências)
3. Consultar dependências: chamar `get_dependencies` via MCP para ver quem usa o que vai modificar
4. Se criar hook/page/componente novo → `npm run sync:fix`
5. Se estiver na main, crie uma feature branch antes de commitar (`git checkout -b feat/nome`)
6. Se descobrir regra de negócio não documentada → SALVE na memória persistente antes de terminar

## Padrões de Código
- Hooks React: prefixo `use`, em `src/hooks/`
- Páginas: em `src/pages/`, com rota em App.tsx
- Componentes: PascalCase, em `src/components/`

## Design & UI (OBRIGATÓRIO)
**Princípio:** Light Mode First. Se o texto não é legível em fundo branco, está errado.

**Cards/Containers:**
- USAR: `bg-white border border-slate-200 shadow-sm rounded-xl`
- NUNCA: `bg-white/10 backdrop-blur` em fundo branco (invisível)
- NUNCA: `text-white` sem container escuro explícito

**Cores (SEMPRE tokens semânticos):**
- Surface: `bg-white` | Background: `bg-slate-50`
- Text: `text-slate-900` (principal) / `text-slate-500` (secundário)
- Border: `border-slate-200` | Brand: `text-indigo-600` / `bg-indigo-600`
- NUNCA cores hex hardcoded — sempre classes Tailwind

**Glassmorphism — APENAS em:**
- Overlays/modais: `bg-black/20 backdrop-blur-sm`
- Headers sticky: `bg-white/80 backdrop-blur-md border-b border-slate-200`
- Seções explicitamente escuras (sidebar)

**Tipografia:** `tracking-tight` headings | `text-sm` padrão | `font-medium` interativos

## Deploy de Edge Functions (OBRIGATÓRIO)

**Functions públicas** (recebem webhooks externos sem JWT) DEVEM ser deployadas com `--no-verify-jwt`:
```bash
# Functions públicas — SEMPRE com --no-verify-jwt
npx supabase functions deploy webhook-ingest --no-verify-jwt --project-ref szyrzxvlptqqheizyrxu
npx supabase functions deploy webhook-receiver --no-verify-jwt --project-ref szyrzxvlptqqheizyrxu
npx supabase functions deploy webhook-whatsapp --no-verify-jwt --project-ref szyrzxvlptqqheizyrxu
npx supabase functions deploy whatsapp-webhook --no-verify-jwt --project-ref szyrzxvlptqqheizyrxu
npx supabase functions deploy active-campaign-webhook --no-verify-jwt --project-ref szyrzxvlptqqheizyrxu
npx supabase functions deploy integration-sync-deals --no-verify-jwt --project-ref szyrzxvlptqqheizyrxu
```

**Regra:** Se a function tem `verify_jwt = false` no `config.toml`, SEMPRE usar `--no-verify-jwt` no deploy. O hook `.claude/hooks/check-edge-deploy.sh` bloqueia deploys incorretos automaticamente.

## Comandos Úteis
```bash
source .env  # carregar credenciais

# Query rápida ao banco
curl -s "https://szyrzxvlptqqheizyrxu.supabase.co/rest/v1/{tabela}?select=*&limit=5" \
  -H "apikey: $VITE_SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"

# Deploy Edge Function
npx supabase functions deploy {NOME} --project-ref szyrzxvlptqqheizyrxu

# Regenerar Types
npx supabase gen types typescript --project-id szyrzxvlptqqheizyrxu > src/database.types.ts

# Qualidade
npm run build          # build completo (inclui typecheck)
npm run sync:fix       # atualizar CODEBASE.md automaticamente

# Testes E2E (Playwright)
npm run test:e2e              # todos os testes
npm run test:e2e:smoke        # só smoke tests (*.smoke.spec.ts)
npm run test:e2e:install      # instalar navegador Chromium
```

## Automação e Ferramentas (SABER QUE EXISTEM)

### Rede de Segurança Automática (GitHub Actions + Playwright)
Roda automaticamente — NÃO precisa executar manualmente:

| Workflow | Quando roda | O que faz |
|---|---|---|
| `CI` | A cada PR contra main | TypeScript check + build |
| `E2E Preview` | A cada PR contra main | Aguarda preview Vercel → roda 7 testes Playwright contra preview |
| `Smoke Prod + Auto-Rollback` | A cada push na main | Aguarda deploy produção → roda smoke tests → se falhar, faz rollback automático via API Vercel + cria issue de alerta |

**Testes E2E disponíveis** (em `tests/e2e/`):
- `01-login.smoke.spec.ts` — login válido e inválido
- `02-dashboard.smoke.spec.ts` — dashboard carrega pós-login
- `03-pipeline.smoke.spec.ts` — pipeline/kanban renderiza + botão "novo card"
- `04-people.spec.ts` — página de contatos carrega
- `05-proposals.spec.ts` — página de propostas carrega
- `06-health.smoke.spec.ts` — app responde HTML + tela de login renderiza

**Usuário de teste:** `test@welcomecrm.test` / `Test123!@#` (org: Welcome Trips, admin). O global-setup do Playwright loga com ele automaticamente.

**Supabase Branching:** Ativado via GitHub integration. PRs que modificam `supabase/` criam banco descartável automaticamente. Seed em `supabase/seed.sql`.

**Ao criar testes novos:** adicionar em `tests/e2e/`. Se é smoke (deve rodar em produção), usar sufixo `.smoke.spec.ts`. Config em `playwright.config.ts`.

### Hooks automáticos (Claude Code)
Estes hooks rodam automaticamente — não precisam ser chamados:

| Hook | Quando roda | O que faz |
|---|---|---|
| `protect-files.sh` | Ao editar qualquer arquivo | BLOQUEIA edição de `.env`, `database.types.ts`, `package-lock.json` |
| `check-edge-deploy.sh` | Ao rodar deploy de Edge Function | BLOQUEIA deploy sem `--no-verify-jwt` para functions públicas |
| `check-before-done.sh` | Ao encerrar sessão | Roda ESLint + TypeScript + verifica migrations + verifica CODEBASE.md |

### MCP Server welcomecrm-context
Chamar `get_context` ANTES de iniciar qualquer task. É mais inteligente que ler CODEBASE.md direto:
- Retorna: agente sugerido, seções relevantes do CODEBASE.md, arquivos para ler, hooks e tabelas relacionados
- Parâmetros: `task` (descrição), `taskType` (investigation/implementation/debug/design), `keywords` (array)
- Chamar `check_impact` ANTES de modificar arquivos críticos (KanbanBoard, CardHeader, CardDetail, Pipeline)

### Skills disponíveis (comandos /)
| Comando | O que faz |
|---|---|
| `/subir` | Fluxo completo: migrations → qualidade → code review → commit → push |
| `/review` | Lança agente revisor de código (pode ser disparado automaticamente) |
| `/test` | Teste exaustivo: build + análise de código + verificação cruzada |
| `/deploy [fn]` | Deploy de Edge Function |
| `/verify` | Checklist completo de qualidade (segurança, lint, schema, testes) |

## Referências Detalhadas
- `.agent/CODEBASE.md` → Inventário completo (hooks, pages, components, tabelas, views, relacionamentos)
- `docs/SQL_SOP.md` → Procedimentos SQL (OBRIGATÓRIO antes de views/triggers)
- `docs/SYSTEM_CONTEXT.md` → Decisões arquiteturais
- `docs/DESIGN_SYSTEM.md` → Regras de UI
- `memory/n8n-workflows.md` → IDs, webhooks, arquitetura e gotchas n8n
- `memory/integration-gotchas.md` → AC centavos/reais, triggers, mapeamento outbound
- `memory/ai-extraction.md` → Briefing IA, transcrição, campos de extração
