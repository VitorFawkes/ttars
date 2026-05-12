# WelcomeCRM API — Referência de Integração

Documentação consolidada das 44 Supabase Edge Functions do WelcomeCRM. Cobre a API REST pública (`public-api`), webhooks de entrada, RPCs invocadas pelo frontend, AI agent suite, consumidores n8n e workers internos.

- **Project Ref:** `szyrzxvlptqqheizyrxu` (produção) / `ivmebyvjarcvrkrbemam` (staging)
- **Base URL:** `https://szyrzxvlptqqheizyrxu.supabase.co/functions/v1/<function-name>`
- **Código fonte:** [supabase/functions/](../supabase/functions/)

---

## Sumário

1. [Visão geral](#1-visão-geral)
2. [Public REST API (`public-api`)](#2-public-rest-api-public-api)
3. [Webhooks públicos de entrada](#3-webhooks-públicos-de-entrada)
4. [Functions invocadas pelo Frontend](#4-functions-invocadas-pelo-frontend)
5. [AI Agent suite](#5-ai-agent-suite)
6. [Consumidores n8n / workflows](#6-consumidores-n8n--workflows)
7. [Orquestradores / scheduled / internos](#7-orquestradores--scheduled--internos)
8. [Tabela-resumo geral](#8-tabela-resumo-geral)
9. [Apêndices](#9-apêndices)

---

## 1. Visão geral

### 1.1 Inventário

O WelcomeCRM expõe **44 Supabase Edge Functions** organizadas em 6 tiers conforme audiência e modo de invocação. Cada tier tem um padrão de autenticação e ciclo de vida próprio.

| Categoria | Qtd | Audiência |
|---|---|---|
| Public REST API (1 function, ~6 rotas) | 1 | Integradores externos |
| Webhooks públicos de entrada | 4 | Sistemas externos (Meta, ActiveCampaign) |
| Frontend RPCs | ~19 | App React do CRM |
| AI Agent suite | 5 | Frontend + internos |
| n8n consumers | 6 | Workflows n8n |
| Orquestradores / scheduled | ~9 | pg_cron, triggers, outras functions |
| **Total** | **44** | |

### 1.2 Autenticação

Quatro modelos de autenticação coexistem. A escolha depende de quem invoca a função:

| Modelo | Quando | Header |
|---|---|---|
| `X-API-Key` | Apenas em `public-api` para integradores externos | `X-API-Key: <chave>` |
| JWT (Supabase Auth) | Frontend RPCs (padrão, `verify_jwt = true`) | `Authorization: Bearer <jwt>` |
| `service_role` | Functions chamadas de dentro do Supabase (RPCs server-side, outras functions) | `Authorization: Bearer <service_role_key>` |
| Sem auth (`verify_jwt = false`) | Webhooks recebendo de sistemas que não enviam JWT (Meta, ActiveCampaign, n8n direto) | Validação por assinatura/secret no body |

Chaves de API ficam em `api_keys` (hash SHA-256, chave em claro nunca é persistida). A verificação acontece via RPC `validate_api_key(p_key)` que retorna `org_id` + `permissions` quando válida.

Functions com `verify_jwt = false` no `config.toml` precisam ser deployadas com a flag `--no-verify-jwt`:

```bash
npx supabase functions deploy webhook-ingest --no-verify-jwt --project-ref szyrzxvlptqqheizyrxu
```

O hook `.claude/hooks/check-edge-deploy.sh` bloqueia deploys incorretos automaticamente.

### 1.3 Base URL, CORS e formato de erro

**Base URL:**

```
https://szyrzxvlptqqheizyrxu.supabase.co/functions/v1/<function-name>
```

**CORS:** todas as functions aceitam chamadas cross-origin com os headers padrão:

```
Access-Control-Allow-Origin: *
Access-Control-Allow-Headers: authorization, x-client-info, apikey, content-type, x-api-key
Access-Control-Allow-Methods: GET, POST, PUT, DELETE, PATCH, OPTIONS
```

**Formato de erro padrão:**

```json
{
  "error": "mensagem amigável em português",
  "message": "descrição adicional (opcional)"
}
```

**Códigos HTTP:**

| Código | Significado |
|---|---|
| `200` | Sucesso |
| `201` | Criado |
| `400` | Body/parâmetro inválido |
| `401` | Auth inválida/ausente (JWT, API key, service_role) |
| `403` | Auth válida, mas sem permissão para o recurso (RLS/permissions) |
| `404` | Recurso não existe ou não pertence à org |
| `405` | Método HTTP não suportado para a rota |
| `409` | Conflito (ex: registro duplicado, FK violation) |
| `422` | Validação Zod falhou |
| `500` | Erro interno (BD, integração externa) |
| `503` | Provider externo indisponível |

### 1.4 Convenções de payload

- **Org scoping (multi-tenant):** toda inserção em tabela por-org cai em `requesting_org_id()`, extraído do JWT `app_metadata.org_id`. Functions invocadas com `service_role` precisam setar `org_id` explicitamente.
- **RLS:** todas as tabelas por-org têm policy `USING (org_id = requesting_org_id())`. Functions com `service_role` bypass RLS — responsabilidade da function aplicar o filtro manualmente.
- **Idempotência:** a maioria das functions **não é idempotente** por padrão. Webhooks de entrada (`webhook-ingest`, `whatsapp-webhook`) gravam em fila (`integration_outbox` / `webhook_logs`) com dedup por `external_id`. Workers tipo `cadence-engine` e `future-opportunity-processor` usam status (`pending`/`processed`/`failed`) para garantir at-least-once.
- **Datas:** ISO 8601 UTC (`2026-05-12T10:30:00Z`). Quando aplicável, conversão para `America/Sao_Paulo` no servidor.
- **Valores monetários:** centavos em campos `*_cents`, reais em `valor_*` (number). Cuidado com integrações ActiveCampaign — ver `memory/integration-gotchas.md`.

---

## 2. Public REST API (`public-api`)

API REST pública do WelcomeCRM para integrações externas. Stack moderna baseada em **Hono + Zod + OpenAPI**, com schema auto-gerado e Swagger UI embutido.

- **Base URL:** `https://szyrzxvlptqqheizyrxu.supabase.co/functions/v1/public-api`
- **Project Ref:** `szyrzxvlptqqheizyrxu`
- **Código fonte:** [supabase/functions/public-api/index.ts](../supabase/functions/public-api/index.ts)
- **Swagger UI:** `/docs` (interface interativa)
- **OpenAPI spec:** `/openapi.json` (OAS 3.0)

### 2.1 Autenticação

Todas as rotas exceto `/health`, `/openapi.json` e `/docs` exigem o header `X-API-Key`:

```
X-API-Key: <sua-chave-aqui>
```

- A chave é gerada na UI do WelcomeCRM em **Configurações → API Keys** e fica salva apenas como hash SHA-256 na tabela `api_keys`. O valor cru **não pode ser recuperado** depois — guarde no momento da criação.
- Cada request passa pelo middleware de autenticação (linhas 20–90) que chama a RPC `validate_api_key(p_key)` no banco. A função retorna `{ key_id, org_id, permissions, is_valid }` e injeta esse `keyData` no contexto da request via `c.set("apiKey", keyData)`.
- A tabela `api_keys` tem colunas `key_hash`, `key_prefix`, `permissions jsonb`, `rate_limit`, `is_active`, `last_used_at`, `request_count`, `expires_at`.
- Cada request bem-sucedida grava em `api_request_logs` (endpoint, método, status, tempo, IP, user agent) e em `debug_requests` (payload bruto, headers — útil para debug). Ambos os logs são **fire-and-forget** (não bloqueiam a resposta).

> **Gap conhecido:** a coluna `rate_limit` em `api_keys` existe mas **não é aplicada no código atual** — não há checagem contra o `request_count`. O log existe; a enforcement não. Trate isso como ausente até futura migration.

### 2.2 Headers padrão

| Header | Quando usar |
|---|---|
| `X-API-Key: <chave>` | Sempre (exceto `/health`, `/openapi.json`, `/docs`) |
| `Content-Type: application/json` | POST com body JSON |

### 2.3 CORS

A API aceita chamadas cross-origin de qualquer origem (`cors()` aplicado em todas as rotas — linha 17):

```
Access-Control-Allow-Origin: *
```

### 2.4 Formato de erro

Toda resposta de erro segue o schema `ErrorSchema`:

```json
{ "error": "mensagem em português ou inglês" }
```

### 2.5 Códigos HTTP

| Código | Significado |
|---|---|
| `200` | Sucesso (GET) |
| `201` | Criado (POST de criação) |
| `400` | Body inválido ou erro de insert no banco |
| `401` | API key ausente ou inválida (também chave inativa/expirada) |
| `409` | Conflito — recurso duplicado (`/deals/echo` quando já existe deal ativo) |
| `422` | Falha de validação Zod **ou** feature desabilitada na config da linha WhatsApp |
| `500` | Erro interno do banco/Supabase |

### 2.6 Endpoints

#### 2.6.1 Health Check

##### `GET /health`

Health check público. Não exige autenticação — útil para monitoramento externo (uptime probes).

```bash
curl https://szyrzxvlptqqheizyrxu.supabase.co/functions/v1/public-api/health
```

**Resposta `200`:**

```json
{ "status": "ok" }
```

**Código:** [public-api/index.ts:193](../supabase/functions/public-api/index.ts#L193)

---

#### 2.6.2 Deals (Cards)

##### `GET /deals`

Lista deals (cards comerciais) da organização vinculada à chave. Paginação simples por `limit`/`offset`.

**Query params:**

| Campo | Tipo | Default | Descrição |
|---|---|---|---|
| `limit` | string (número) | `50` | Quantidade máxima de items |
| `offset` | string (número) | `0` | Offset inicial |

```bash
curl -H "X-API-Key: $KEY" \
  "https://szyrzxvlptqqheizyrxu.supabase.co/functions/v1/public-api/deals?limit=20&offset=0"
```

**Resposta `200`** (array de `DealSchema`):

```json
[
  {
    "id": "9b1d...",
    "titulo": "Casamento Marina & João",
    "valor_estimado": 45000,
    "pipeline_stage_id": "a3f2...",
    "created_at": "2026-05-10T14:30:00Z"
  }
]
```

**Erros:**

| Código | Cenário |
|---|---|
| `401` | Header `X-API-Key` ausente ou inválido |
| `500` | Erro do Supabase ao consultar `cards` |

**Código:** [public-api/index.ts:210](../supabase/functions/public-api/index.ts#L210) | **Schema:** linhas 104–110

---

##### `POST /deals`

Cria um deal (card) novo. Insert direto em `cards` — sem validação extra além do `CreateDealSchema` Zod.

**Body (`CreateDealSchema`):**

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `titulo` | string (min 1) | Sim | Título do card |
| `valor_estimado` | number | Não | Valor estimado em BRL |
| `pipeline_stage_id` | uuid | Não | Etapa do pipeline |
| `pessoa_principal_id` | uuid | Não | Contato principal (`contatos.id`) |

```bash
curl -X POST \
  -H "X-API-Key: $KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "titulo": "Novo lead corporativo",
    "valor_estimado": 25000,
    "pessoa_principal_id": "<contato-uuid>"
  }' \
  https://szyrzxvlptqqheizyrxu.supabase.co/functions/v1/public-api/deals
```

**Resposta `201`** (shape de `DealSchema`):

```json
{
  "id": "uuid-gerado",
  "titulo": "Novo lead corporativo",
  "valor_estimado": 25000,
  "pipeline_stage_id": null,
  "created_at": "2026-05-12T10:00:00Z"
}
```

**Erros:**

| Código | Cenário |
|---|---|
| `400` | Insert falhou (campo inválido, FK quebrada, RLS) |
| `401` | API key inválida |

**Código:** [public-api/index.ts:246](../supabase/functions/public-api/index.ts#L246) | **Schema:** linhas 112–117

---

##### `POST /deals/echo`

**Endpoint especial** — recebe o webhook de "botão clicado" do **Echo** (sistema externo de WhatsApp) e cria um deal completo com deduplicação automática de contato e card.

Fluxo (resumido):

1. **Valida** payload contra `EchoWebhookSchema`.
2. **Resolve** produto/pipeline consultando `whatsapp_linha_config` por `phone_number_id` ou `phone_number_label` (display_name). Se a linha tem `criar_card = false`, retorna `422`. Caso não haja config, default = `TRIPS` via `PIPELINE_MAP` hardcoded (linhas 92–96).
3. **Resolve stage** — usa `stage_id` da linha config; se não houver, busca a primeira stage do pipeline (ordenada por `pipeline_phases.order_index` + `pipeline_stages.ordem`).
4. **Resolve owner** — prioridade absoluta para `default_owner_id` da linha. Fallback: busca `profiles` por `agent.email`.
5. **Dedup de contato** via RPC `find_contact_by_whatsapp(p_phone, p_convo_id)`. Se não encontrar, cria contato em `contatos` (separa nome/sobrenome por whitespace) + insere em `contato_meios` (whatsapp principal). Se `criar_contato = false` na linha, retorna `422`.
6. **Dedup de card** — busca em `cards` por `pessoa_principal_id + produto + status_comercial NOT IN ('ganho','perdido') + deleted_at IS NULL`. Se já existe → retorna `409`.
7. **Cria card** em `cards` com `origem = 'whatsapp'`, `moeda = 'BRL'`, `status_comercial = 'aberto'`.
8. **Linka** contato ao card via `cards_contatos` (tipo_viajante=`adulto`, ordem=0).

**Pipeline Map (hardcoded — fallback se a linha não tiver `pipeline_id`):**

| Produto | Pipeline ID |
|---|---|
| `TRIPS` | `c8022522-4a1d-411c-9387-efe03ca725ee` |
| `WEDDING` | `f4611f84-ce9c-48ad-814b-dcd6081f15db` |

**Body (`EchoWebhookSchema`):**

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `event` | string | Sim | Tipo do evento (ex: `action_button.clicked`) |
| `timestamp` | string | Não | ISO timestamp |
| `button_label` | string | Não | Label do botão clicado |
| `contact.id` | string | Sim | Echo conversation ID (external) |
| `contact.name` | string (min 1) | Sim | Nome do contato |
| `contact.phone` | string (min 8) | Sim | Telefone (E.164 sem `+`) |
| `agent.email` | email | Não (mas requerido se `agent` presente) | Email do agente — usado pra resolver `dono_atual_id` |
| `agent.id` / `agent.name` | string | Não | Metadados do agente |
| `organization.id` / `organization.name` | string | Não | Metadados da org Echo |
| `phone_number.id` | string | Sim | ID da linha no Echo |
| `phone_number.display_name` | string | Não | Label legível (ex: `Welcome Trips SP`) |
| `phone_number.number` | string | Sim | Número em E.164 |

```bash
curl -X POST \
  -H "X-API-Key: $KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "event": "action_button.clicked",
    "button_label": "Criar deal",
    "contact": {
      "id": "echo-conv-uuid",
      "name": "Maria Santos",
      "phone": "5511999998888"
    },
    "agent": { "email": "consultor@welcometrips.com.br" },
    "phone_number": {
      "id": "echo-phone-uuid",
      "display_name": "Welcome Trips SP",
      "number": "5511955554444"
    }
  }' \
  https://szyrzxvlptqqheizyrxu.supabase.co/functions/v1/public-api/deals/echo
```

**Resposta `201` — deal criado (`EchoDealResponseSchema`):**

```json
{
  "id": "card-uuid",
  "titulo": "Maria Santos",
  "produto": "TRIPS",
  "pipeline_stage_id": "stage-uuid",
  "contact_id": "contato-uuid",
  "contact_created": true,
  "dedup": false,
  "created_at": "2026-05-12T10:15:00Z"
}
```

**Resposta `409` — duplicate (já existe deal ativo pro contato):**

```json
{
  "id": "card-existente-uuid",
  "titulo": "Maria Santos",
  "dedup": true
}
```

**Erros:**

| Código | Cenário |
|---|---|
| `400` | Payload inválido (Zod issues), erro ao criar contato/card |
| `401` | API key inválida |
| `409` | Já existe card ativo para o contato + produto |
| `422` | `criar_card = false` ou `criar_contato = false` na `whatsapp_linha_config` |

**Código:** [public-api/index.ts:280](../supabase/functions/public-api/index.ts#L280) | **Schema:** linhas 154–177 (request) / 179–188 (response)

---

#### 2.6.3 Contacts (Contatos)

##### `GET /contacts`

Lista contatos com joins em conversas WhatsApp e deals (cards diretos + cards via `cards_contatos`).

**Query params:**

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | uuid | Filtra por id único (prioritário sobre `search`) |
| `search` | string | Busca em `nome`, `sobrenome`, `email` (ILIKE) |
| `limit` | string (número) | Default `50` |

```bash
# Buscar por nome
curl -H "X-API-Key: $KEY" \
  "https://szyrzxvlptqqheizyrxu.supabase.co/functions/v1/public-api/contacts?search=Maria&limit=10"

# Buscar por ID exato
curl -H "X-API-Key: $KEY" \
  "https://szyrzxvlptqqheizyrxu.supabase.co/functions/v1/public-api/contacts?id=$CONTACT_UUID"
```

**Resposta `200`** (array de `ContactDetailSchema` — estrutura plana após merge dos deals):

```json
[
  {
    "id": "contato-uuid",
    "nome": "Maria Santos",
    "email": "maria@example.com",
    "telefone": "5511999998888",
    "last_whatsapp_conversation_id": "echo-conv-id",
    "active_conversation_id": "conv-uuid-interno",
    "whatsapp_conversations": [
      {
        "id": "conv-uuid",
        "status": "active",
        "unread_count": 2,
        "last_message_at": "2026-05-12T09:30:00Z"
      }
    ],
    "deals": [
      {
        "id": "card-uuid",
        "titulo": "Lua de mel Maldivas",
        "status_comercial": "aberto",
        "pipeline_stage_id": "stage-uuid"
      }
    ]
  }
]
```

Detalhes do response:

- `last_whatsapp_conversation_id` é o ID **externo** (vindo do Echo, salvo em `contatos.last_whatsapp_conversation_id`).
- `active_conversation_id` é o UUID **interno** da `whatsapp_conversations` — derivado por match entre `whatsapp_conversations.external_conversation_id` e `contatos.last_whatsapp_conversation_id`.
- `deals` é a união deduplicada (por `id`) de:
  - Cards onde o contato é `pessoa_principal_id` (FK direta), e
  - Cards onde o contato aparece em `cards_contatos.contato_id` (relação N:N).

**Erros:**

| Código | Cenário |
|---|---|
| `401` | API key inválida |
| `500` | Erro do Supabase na query com joins |

**Código:** [public-api/index.ts:477](../supabase/functions/public-api/index.ts#L477) | **Schema:** linhas 133–152

---

##### `POST /contacts`

Cria um contato novo. Validação Zod estrita pelo `CreateContactSchema`.

**Body (`CreateContactSchema`):**

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `nome` | string (min 1) | Sim | Primeiro nome |
| `sobrenome` | string (min 1) | Sim | Sobrenome |
| `email` | email | Não | Email válido |
| `telefone` | string (min 1) | Sim | Telefone (formato livre, prefira E.164) |

```bash
curl -X POST \
  -H "X-API-Key: $KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "nome": "João",
    "sobrenome": "Silva",
    "email": "joao@example.com",
    "telefone": "+5511999998888"
  }' \
  https://szyrzxvlptqqheizyrxu.supabase.co/functions/v1/public-api/contacts
```

**Resposta `201`** (shape de `ContactSchema`):

```json
{
  "id": "contato-uuid",
  "nome": "João",
  "email": "joao@example.com",
  "telefone": "+5511999998888"
}
```

**Resposta `422` — validação Zod falhou:**

```json
{
  "error": "Campos obrigatórios: nome, sobrenome, telefone. Faltando: sobrenome"
}
```

**Erros:**

| Código | Cenário |
|---|---|
| `400` | Insert falhou no banco (constraint, RLS) |
| `401` | API key inválida |
| `422` | Validação Zod falhou (campo obrigatório ausente, email malformado, etc) |

**Código:** [public-api/index.ts:554](../supabase/functions/public-api/index.ts#L554) | **Schema:** linhas 126–131

---

#### 2.6.4 Documentação interativa

##### `GET /openapi.json`

Retorna o spec **OpenAPI 3.0** completo, auto-gerado a partir dos schemas Zod via `@hono/zod-openapi`. Útil para gerar clients (TypeScript, Python, etc) com `openapi-generator`.

```bash
curl https://szyrzxvlptqqheizyrxu.supabase.co/functions/v1/public-api/openapi.json
```

**Código:** [public-api/index.ts:595](../supabase/functions/public-api/index.ts#L595)

---

##### `GET /docs`

Swagger UI interativo. Permite explorar e testar todos os endpoints diretamente do navegador (com auth via `X-API-Key`).

```
https://szyrzxvlptqqheizyrxu.supabase.co/functions/v1/public-api/docs
```

**Código:** [public-api/index.ts:610](../supabase/functions/public-api/index.ts#L610)

---

### 2.7 Tabelas auxiliares

| Tabela | Função |
|---|---|
| `api_keys` | Armazena chaves (hash SHA-256), `org_id`, permissões, rate_limit (não enforced), expiração |
| `api_request_logs` | Log de cada request bem-sucedida (endpoint, método, status, latência, IP) |
| `debug_requests` | Log cru de payload + headers (para debug — fire-and-forget) |

---

## 3. Webhooks públicos de entrada

Endpoints públicos (`verify_jwt = false`) que recebem payloads de sistemas externos. **Não exigem JWT** — autenticação acontece via `integration_id` no path/query, `provider`, ou shared secret específico do provedor. Quatro funções cobrem ActiveCampaign e WhatsApp:

| Função | Provedor | Tabela de eventos |
|---|---|---|
| `webhook-ingest` | Genérico (atualmente focado em ActiveCampaign) | `integration_events` |
| `active-campaign-webhook` | ActiveCampaign (legacy, integration_id fixo) | `integration_events` |
| `whatsapp-webhook` | Meta WhatsApp Cloud API + Echo (canônico) | `whatsapp_raw_events` |
| `webhook-whatsapp` | ChatPro + Echo (legado/alternativa) | `whatsapp_raw_events` |

Todos os webhooks seguem o padrão **enqueue + auto-process**: gravam o payload bruto em uma fila e disparam o processador (`integration-process`, `ai-agent-router`, etc) em background com retry. Quase sempre retornam `200`/`202` mesmo em caso de falha interna, para evitar que o sistema externo desabilite o webhook por erros transitórios.

---

### 3.1 `webhook-ingest` — Genérico (ActiveCampaign)

Receiver genérico de webhooks de integrações configuráveis. Atualmente atende **ActiveCampaign** (deals, contacts, automations, campaigns), mas o desenho é polimórfico — qualquer integração cadastrada na tabela `integrations` pode apontar pra cá.

- **Source:** [supabase/functions/webhook-ingest/index.ts](../supabase/functions/webhook-ingest/index.ts) (256 linhas)
- **URL:** `POST https://szyrzxvlptqqheizyrxu.supabase.co/functions/v1/webhook-ingest?id=<integration_uuid>`
- **JWT:** desativado (`verify_jwt = false`)

#### Autenticação

Não há shared secret/HMAC implementado hoje — o comentário no código (linha 147) é explícito: `TODO: Implement HMAC validation based on integration.config.secret_key and provider`. O único "gate" é o `integration_id` na query string: se a integração não existe, está inativa, ou se a setting global `INBOUND_INGEST_ENABLED = 'false'` está marcada em `integration_settings`, o webhook responde `200 { "message": "Accepted" }` (ou `"Webhook paused"`) sem processar.

#### Payload (ActiveCampaign — `application/x-www-form-urlencoded` por padrão)

ActiveCampaign envia campos como form-urlencoded (não JSON). O parser detecta o `content-type` e usa `URLSearchParams` (linhas 121–130). Estrutura típica:

```
type=deal_add
deal[id]=12345
deal[title]=New Deal
deal[value]=5000
deal[contact]=789
contact[id]=789
contact[email]=joao@example.com
```

A função `parseACPayload` (linhas 12–53) classifica o payload:

| Heurística | `entity_type` |
|---|---|
| Tem `deal[id]` + `type=deal_task*` ou `deal_note*` | `dealActivity` |
| Tem `deal[id]` ou `deal_id` | `deal` |
| Tem `contact[id]` ou `contact_id` | `contact` |
| `type` contém `automation` | `contactAutomation` |
| `type === 'sent'` ou contém `campaign` | `campaign` |

#### O que faz

1. Lê `?id=<integration_id>` da URL — se ausente, responde `200 { "message": "Accepted" }` sem fazer nada.
2. Busca `integrations` por id. Se não existe ou `is_active = false`, responde `200` sem processar.
3. Lê `integration_settings.INBOUND_INGEST_ENABLED` — se for `'false'`, pausa (responde `200 { "message": "Webhook paused" }`).
4. Parseia payload (JSON ou form-urlencoded conforme content-type).
5. **Idempotency:** olha headers `idempotency-key`/`x-idempotency-key` ou `payload.id`/`payload.event_id`. Se já existe um `integration_events` com `(integration_id, idempotency_key)`, retorna `200 { "message": "Ignored duplicate" }`.
6. Classifica `entity_type`, `event_type`, `external_id` via `parseACPayload`.
7. Insere em `integration_events` (`status = 'pending'`, com logs iniciais).
8. **Auto-process não-bloqueante:** chama `integration-process` com retry exponencial (até 3 tentativas, 2s/5s de backoff, timeout 25s). Se falhar todas, o evento fica `pending` e é pego pelo cron.
9. Loga payload bruto + headers em `debug_requests` (fire-and-forget).
10. Responde `202 { "message": "Accepted" }`.

#### Resposta

**Sucesso `202`:**

```json
{ "message": "Accepted" }
```

**Variações `200` (sempre acceptado pra não quebrar o webhook do AC):**

```json
{ "message": "Accepted" }        // integration_id ausente, integração inativa, erro de insert
{ "message": "Ignored duplicate" } // idempotency hit
{ "message": "Webhook paused" }    // INBOUND_INGEST_ENABLED=false
```

#### Códigos HTTP

| Código | Cenário |
|---|---|
| `200` | Aceito mas não processado (ausente/inativo/pausado/duplicado/erro) |
| `202` | Aceito e enfileirado com sucesso |

**Princípio:** o endpoint **nunca retorna 4xx/5xx** ao AC. ActiveCampaign desabilita webhooks que retornam erro repetidamente — qualquer falha interna vira `200` para preservar o canal.

---

### 3.2 `active-campaign-webhook` — Legacy AC

Variante legada do `webhook-ingest`, com `integration_id` **hardcoded** (`a2141b92-561f-4514-92b4-9412a068d236`). Foi reconstruída em 2026-04-13 após perda do source original.

- **Source:** [supabase/functions/active-campaign-webhook/index.ts](../supabase/functions/active-campaign-webhook/index.ts) (189 linhas)
- **URL:** `POST https://szyrzxvlptqqheizyrxu.supabase.co/functions/v1/active-campaign-webhook`
- **JWT:** desativado

#### Autenticação

Idêntica à `webhook-ingest`: não há HMAC. O único filtro é o `INBOUND_INGEST_ENABLED` global em `integration_settings`. Como o `integration_id` é fixo no código, qualquer chamada cai sempre na integração AC oficial.

#### Payload

Igual ao `webhook-ingest` — ActiveCampaign manda `application/x-www-form-urlencoded` com `type`, `deal[*]`, `contact[*]`, etc. Usa a mesma função `parseACPayload` para classificar.

#### O que faz

1. Checa pausa global `INBOUND_INGEST_ENABLED`.
2. Parseia payload (JSON ou form-urlencoded).
3. Idempotency check em `integration_events` (filtrando pelo `AC_INTEGRATION_ID` hardcoded).
4. Insere em `integration_events` com `source = 'active_campaign'`.
5. Dispara `integration-process` em background com retry (3 tentativas, 2s/5s backoff). Usa `EdgeRuntime.waitUntil` quando disponível pra garantir que o background task não seja morto após o response.
6. Responde `202 { "message": "Accepted" }`.

#### Resposta

Mesmo padrão do `webhook-ingest`: `202` em caso de sucesso, `200` em todos os outros casos (pausa, duplicata, erro de insert).

#### Diferenças vs `webhook-ingest`

| Aspecto | `webhook-ingest` | `active-campaign-webhook` |
|---|---|---|
| `integration_id` | Query string `?id=<uuid>` | Hardcoded no código |
| `source` no `integration_events` | (não setado) | `'active_campaign'` |
| Auto-process | `setTimeout`/promise | `EdgeRuntime.waitUntil` quando disponível |
| `debug_requests` log | Sim | Não |

> **Status:** ambos coexistem. Novas integrações devem usar `webhook-ingest?id=<uuid>`. O `active-campaign-webhook` segue ativo pra manter a URL estável que o AC já tem configurada.

---

### 3.3 `whatsapp-webhook` — Canônico (ChatPro + Echo)

Receiver canônico para webhooks de WhatsApp. Suporta dois provedores: **ChatPro** (WhatsApp Web não-oficial) e **Echo** (Meta WhatsApp Cloud API + extensões). É a função usada hoje pelas integrações de produção.

- **Source:** [supabase/functions/whatsapp-webhook/index.ts](../supabase/functions/whatsapp-webhook/index.ts) (396 linhas)
- **URL:** `POST https://szyrzxvlptqqheizyrxu.supabase.co/functions/v1/whatsapp-webhook?provider=chatpro` ou `?provider=echo`
- **JWT:** desativado

#### Autenticação

Sem JWT, sem HMAC. O único gate é o param `?provider=` (obrigatório — só aceita `chatpro` ou `echo`) e o flag `is_active` na tabela `whatsapp_platforms`. Se o provider está inativo, responde `403`. Em produção, a "autenticação" depende de o atacante não conhecer a URL exata (não é seguro — TODO de longo prazo).

#### Payload

Aceita objeto único ou array (batches). Estrutura varia por provider:

**ChatPro** (mensagens WhatsApp Web):

```json
{
  "event": "message",
  "message_id": "wamid.xxx",
  "message_type": "text",
  "from": "5511999998888",
  "text": "Olá",
  "phone_number_id": "<linha-id>",
  "origem": null
}
```

**Echo** (Meta Cloud API wrapped):

```json
{
  "event": "message.created",
  "whatsapp_message_id": "wamid.xxx",
  "conversation_id": "echo-conv-id",
  "phone_number": "Welcome Trips SP",
  "phone_number_id": "<echo-phone-uuid>",
  "data": {
    "text": "Olá",
    "from": "5511999998888",
    "contact": { "name": "Maria", "phone": "5511999998888" },
    "type": "text",
    "media_url": null,
    "direction": "inbound"
  }
}
```

Campos chave:
- `event`/`type` — tipo do evento (`message`, `message.created`, `message.status`, `message_status`, etc).
- `whatsapp_message_id` / `message_id` / `data.id` — para idempotency.
- `phone_number_id` — UUID da linha WhatsApp (resolve pra `whatsapp_linha_config`).
- `phone_number` — label legível (ex: `Welcome Trips SP`).
- `data.direction` — `inbound` ou `outbound` (Echo).
- `data.text` / `data.body` — conteúdo da mensagem.

#### O que faz

1. Valida `?provider=chatpro|echo`. Sem provider → `400`.
2. Busca `whatsapp_platforms` por `provider`. Não existe → `404`. Inativa → `403`.
3. Parseia payload (sempre JSON nesse endpoint).
4. Para cada mensagem do batch:
   - Extrai `event_type`, `idempotency_key` e `origem` conforme o provider.
   - Checa duplicata em `whatsapp_raw_events` por `(platform_id, idempotency_key)`. Duplicata → pula.
   - Insere em `whatsapp_raw_events` com `status = 'pending'`.
5. Atualiza `whatsapp_platforms.last_event_at` (em horário de São Paulo).
6. **Forward para n8n Julia agent** (apenas Echo): se `N8N_JULIA_WEBHOOK_URL` setada e o `phone_number` label está em `integration_settings.JULIA_PHONE_LABELS`, dispara fetch pro n8n com o payload (timestamp convertido pra timezone SP).
7. **Forward para n8n Wedding agent** (mesma lógica, com `N8N_WEDDING_WEBHOOK_URL` e `WEDDING_PHONE_LABELS`).
8. **Forward para AI Agent Router modular** (apenas Echo, se `AI_AGENT_ROUTER_ENABLED = 'true'`):
   - Filtra status events (`event.startsWith('message.status')` ou `sender === null + status_name`) para evitar loop infinito (bug fix 2026-04-23).
   - Defense-in-depth contra eco: descarta se o `messageText` bate exatamente com `whatsapp_messages.body` outbound enviada nos últimos 90s pro mesmo destinatário (bug fix 2026-04-25).
   - Pré-filtro: só processa se a linha tem agente IA ativo em `ai_agent_phone_line_config` E o contato passa em `routing_filter.allowed_phones` E `test_mode_phone_whitelist`.
   - Insere no `ai_message_buffer` (debounce) antes de chamar o router.
   - Chama `ai-agent-router` ou `ai-agent-router-v2` (conforme `ai_agents.engine`).
9. Responde `202` com summary do batch.

#### Resposta `202`

```json
{
  "message": "Accepted",
  "events_received": 1,
  "events_inserted": 1,
  "events_duplicated": 0,
  "event_ids": ["raw-event-uuid"]
}
```

#### Códigos HTTP

| Código | Cenário |
|---|---|
| `202` | Aceito e enfileirado |
| `400` | `?provider=` ausente ou inválido |
| `403` | Provider inativo em `whatsapp_platforms` |
| `404` | Provider não cadastrado em `whatsapp_platforms` |
| `500` | Todos os inserts falharam |

#### Tabelas envolvidas

| Tabela | Uso |
|---|---|
| `whatsapp_platforms` | Lookup do provider, atualiza `last_event_at` |
| `whatsapp_raw_events` | Fila de eventos brutos (`status = 'pending'`) |
| `whatsapp_messages` | Leitura (defense-in-depth contra eco) |
| `whatsapp_linha_config` | Lookup da linha por `phone_number_id` |
| `ai_agent_phone_line_config` | Verifica agente IA ativo |
| `ai_agents` | Lê `engine`, `ativa`, `test_mode_phone_whitelist` |
| `ai_message_buffer` | Insert pra debounce do roteador |
| `integration_settings` | Lê `JULIA_PHONE_LABELS`, `WEDDING_PHONE_LABELS` |

#### Funções invocadas (fetch externo)

| Function | Quando | Endpoint |
|---|---|---|
| n8n Julia | Echo + label em `JULIA_PHONE_LABELS` | `N8N_JULIA_WEBHOOK_URL` |
| n8n Wedding | Echo + label em `WEDDING_PHONE_LABELS` | `N8N_WEDDING_WEBHOOK_URL` |
| AI Router v1 | `engine = multi_agent_pipeline` | `/functions/v1/ai-agent-router` |
| AI Router v2 | `engine = single_agent_v2` | `/functions/v1/ai-agent-router-v2` |

---

### 3.4 `webhook-whatsapp` — Alternativa/legacy (ChatPro + Echo)

Variante mais antiga do `whatsapp-webhook` com **auto-detecção de provider** se `?provider=` não for passado. Inclui logging em `debug_requests` (que a canônica não tem) e idempotency key composta (`<event_type>:<message_id>`) para diferenciar fases de uma mesma mensagem (criação, entrega, leitura).

- **Source:** [supabase/functions/webhook-whatsapp/index.ts](../supabase/functions/webhook-whatsapp/index.ts) (269 linhas)
- **URL:** `POST https://szyrzxvlptqqheizyrxu.supabase.co/functions/v1/webhook-whatsapp[?provider=chatpro|echo]`
- **JWT:** desativado

#### Autenticação

Igual à `whatsapp-webhook` — sem JWT, sem HMAC. Filtros: provider válido + `is_active` em `whatsapp_platforms`.

#### Auto-detecção de provider

Se `?provider=` está ausente, inspeciona o payload (linhas 51–80):

| Sinais Echo | Sinais ChatPro |
|---|---|
| `whatsapp_message_id`, `conversation_id`, `data.whatsapp_message_id`, `message.conversation` | `message_data`, `body.message_data`, `event === 'message_status'` |

Se nenhum bate → default `chatpro` (compat com a function legada).

#### Payload

Igual à `whatsapp-webhook`. Aceita objeto único ou array. Para ChatPro lida com envelope `{ body: { message_data: ... } }`. Para Echo trata `data` opcional.

#### O que faz

1. Loga payload completo em `debug_requests` (fire-and-forget — diferencial vs `whatsapp-webhook`).
2. Auto-detecta provider se ausente.
3. Valida provider + platform ativo.
4. Para cada mensagem:
   - Extrai `event_type`, `idempotency_key`, `origem`.
   - **Idempotency composta (Echo):** `${eventType}:${rawId}` — permite que `message.created`, `message.delivered` e `message.read` da mesma `wamid` sejam tratados como eventos distintos (linhas 146–151). Sem isso, a entrega e leitura seriam descartadas como duplicatas.
   - Checa duplicata e insere em `whatsapp_raw_events`.
5. Atualiza `whatsapp_platforms.last_event_at`.
6. **Forward para n8n Julia** (apenas Echo): mesma lógica que `whatsapp-webhook`, mas **não converte timezone** (envia `ts_iso` original).
7. Responde `202` com summary + `provider_detected`.

#### Resposta `202`

```json
{
  "message": "Accepted",
  "provider_detected": "echo",
  "events_received": 2,
  "events_inserted": 2,
  "events_duplicated": 0,
  "event_ids": ["uuid-a", "uuid-b"]
}
```

#### Códigos HTTP

| Código | Cenário |
|---|---|
| `202` | Aceito e enfileirado |
| `400` | Provider inválido (depois da auto-detecção) |
| `403` | Provider inativo |
| `404` | Provider não cadastrado |
| `500` | Todos os inserts falharam |

#### Diferenças vs `whatsapp-webhook`

| Aspecto | `whatsapp-webhook` (canônica) | `webhook-whatsapp` (legacy) |
|---|---|---|
| `?provider=` | Obrigatório | Opcional (auto-detect) |
| `debug_requests` log | Não | Sim |
| Idempotency key Echo | `id` puro | `${event_type}:${id}` |
| Forward Julia/Wedding | Sim (Julia + Wedding) | Só Julia |
| Forward AI Agent Router | Sim, com filtros anti-loop | Não |
| Defense-in-depth anti-eco | Sim | Não |

> **Status:** ambas coexistem. Convergir para `whatsapp-webhook` é o caminho (tem mais recursos: forwards múltiplos, AI router, anti-eco). `webhook-whatsapp` segue ativa por URLs já configuradas em providers externos e pela idempotency composta que ainda não foi portada.

#### Tabelas envolvidas

| Tabela | Uso |
|---|---|
| `whatsapp_platforms` | Lookup do provider, atualiza `last_event_at` |
| `whatsapp_raw_events` | Fila de eventos brutos |
| `integration_settings` | Lê `JULIA_PHONE_LABELS` |
| `debug_requests` | Log cru de payload + headers |


---

## 4. Functions invocadas pelo Frontend

As Edge Functions abaixo são acionadas via `supabase.functions.invoke()` direto da SPA (React + Vite). Salvo indicação contrária, exigem JWT de usuário autenticado (`verify_jwt = true`) e respeitam RLS via `org_id` derivado do token.

### 4.1 IA / Extração

#### `ai-agent-prompt-variations`

> **Propósito:** sugere 3 variações de um texto livre (missão, frase-âncora, red line, etc.) para o editor do Playbook do agente.
> **Caller:** Frontend (botão "Sugerir variações" ao lado de campos do editor).
> **Auth:** JWT do usuário (`verify_jwt = true`).
> **Tamanho:** 205 linhas.

**Invocação:**
```ts
supabase.functions.invoke('ai-agent-prompt-variations', {
  body: { text, field_type: 'anchor_text', context: { agent_nome, voice_tone_tags }, num_variations: 3 }
})
```

**Body esperado (top-level keys):**
- `text`: string, texto original que vai variar.
- `field_type`: enum (`mission_one_liner` | `anchor_text` | `typical_phrase` | `forbidden_phrase` | `example_lead_message` | `example_agent_response` | `red_line` | `signal_hint` | `moment_label` | `custom`).
- `context`: objeto opcional com `agent_nome`, `agent_role`, `company_name`, `voice_tone_tags[]`, `voice_formality`, `industry_hint`, etc.
- `num_variations`: number, default 3.

**Retorna:** `{ suggestions: [{ text, rationale }], model_used }`.

**Efeitos colaterais:** chama OpenAI. Não escreve no banco.

**Source:** [ai-agent-prompt-variations/index.ts](../supabase/functions/ai-agent-prompt-variations/index.ts)

---

#### `ai-agent-simulate`

> **Propósito:** simula a resposta do agente IA dentro do editor sem gravar conversa, enviar WhatsApp ou mexer no CRM.
> **Caller:** Frontend (painel "Prévia" da aba Playbook).
> **Auth:** JWT do usuário.
> **Tamanho:** 327 linhas.

**Invocação:**
```ts
supabase.functions.invoke('ai-agent-simulate', {
  body: { agent_id, messages: [{ role: 'user', content: '...' }], preview_playbook_config }
})
```

**Body esperado (top-level keys):**
- `agent_id`: UUID do agente em `ai_agents`.
- `messages`: array `{ role: 'user' | 'assistant', content: string }` — histórico da conversa simulada.
- `card_id`: UUID opcional para puxar contexto real.
- `preview_playbook_config`: objeto opcional com `identity_config`, `voice_config`, `boundaries_config`, `listening_config`, `moments[]`, `silent_signals[]`, `few_shot_examples[]`, `scoring_rules[]` — quando presente, ignora o que está no banco e roda com essa config em memória (para testar antes de salvar).

**Retorna:** `{ response_text, prompt_used, model_used, latency_ms }` — resposta seca do persona, sem efeitos.

**Efeitos colaterais:** nenhum. Apenas chama o builder de prompt v2 e o modelo.

**Source:** [ai-agent-simulate/index.ts](../supabase/functions/ai-agent-simulate/index.ts)

---

#### `ai-conversation-extraction`

> **Propósito:** lê todas as mensagens WhatsApp do card e devolve sugestões estruturadas em 3 seções (campos do card, contato principal, viajantes acompanhantes) para o operador revisar e aplicar.
> **Caller:** Frontend (botão "IA lê conversa" no detalhe do card).
> **Auth:** JWT do usuário.
> **Tamanho:** 459 linhas.

**Invocação:**
```ts
supabase.functions.invoke('ai-conversation-extraction', { body: { card_id } })
```

**Body esperado (top-level keys):**
- `card_id`: UUID do card cuja conversa será analisada.

**Retorna:** `{ status: 'preview' | 'no_messages' | 'error', card_id, message_count, campos_card, campos_card_atuais, contato_principal, contato_principal_atual, viajantes[], viajantes_existentes[], field_config[] }`. **Não aplica nada** — só preview.

**Efeitos colaterais:** leitura em `whatsapp_messages`, `contatos`, `cards`, `system_fields`. Chama OpenAI. Aplicação é feita depois pelo frontend via RPC `apply_ai_conversation_extraction`.

**Source:** [ai-conversation-extraction/index.ts](../supabase/functions/ai-conversation-extraction/index.ts)

---

#### `ai-extract-image`

> **Propósito:** extrai itens estruturados de orçamentos de viagem em imagem (voos, hotéis, transfers, experiências) via GPT Vision.
> **Caller:** Frontend (upload de imagem no Proposal Builder).
> **Auth:** JWT do usuário.
> **Tamanho:** 331 linhas.

**Invocação:**
```ts
supabase.functions.invoke('ai-extract-image', {
  body: { imageUrl, extractionMode: 'ida_volta', flightExtraction: true }
})
```

**Body esperado (top-level keys):**
- `imageUrl` ou `imageBase64`: URL pública ou base64 da imagem.
- `extractionMode`: opcional (`ida_volta` | `ida_only` | `volta_only` | `separate_legs`) — modo de extração para voos.
- `flightExtraction`: boolean opcional — força prompt especializado de voos.

**Retorna:** `{ success, items: [{ title, price, currency, category, dates, location, details: { segments[] } }], confidence, rawText }`.

**Efeitos colaterais:** chama OpenAI Vision (`gpt-5.4`). Não escreve no banco.

**Source:** [ai-extract-image/index.ts](../supabase/functions/ai-extract-image/index.ts)

---

#### `analytics-ai-interpret`

> **Propósito:** Explorer IA — recebe uma pergunta em texto do gestor e devolve JSON estruturado compatível com a RPC `analytics_explorer_query` (measure + group_by + filtros).
> **Caller:** Frontend (campo "Pergunte ao Analytics" na Fase 2 do Analytics v2).
> **Auth:** JWT do usuário (rate-limit 30/hora).
> **Tamanho:** 439 linhas.

**Invocação:**
```ts
supabase.functions.invoke('analytics-ai-interpret', { body: { question, period: { from, to } } })
```

**Body esperado (top-level keys):**
- `question`: string em PT-BR — a pergunta livre do gestor.
- `period`: `{ from: 'YYYY-MM-DD', to: 'YYYY-MM-DD' }` — janela default.

**Retorna:** `{ measure, group_by, cross_with, filters, period, viz, confidence, explanation }` — payload pronto para chamar `analytics_explorer_query`. `explanation` em PT-BR alimenta o card "Entendi assim".

**Efeitos colaterais:** chama OpenAI (`gpt-5.1`) com tool-use (LLM não gera SQL — só escolhe da whitelist). Registra uso para rate-limit.

**Source:** [analytics-ai-interpret/index.ts](../supabase/functions/analytics-ai-interpret/index.ts)

---

### 4.2 Integrações externas

#### `monde-people-search`

> **Propósito:** busca leve no Monde V2 People API — retorna resultados SEM importar para o CRM.
> **Caller:** Frontend ("Buscar no Monde" quando contato não é achado localmente).
> **Auth:** JWT do usuário.
> **Tamanho:** 162 linhas.

**Invocação:**
```ts
supabase.functions.invoke('monde-people-search', { body: { search: 'Luiza Mara', limit: 10 } })
```

**Body esperado (top-level keys):**
- `search`: string com mínimo 2 caracteres.
- `limit`: number opcional, default 10, máximo 50.

**Retorna:** `MondePersonResult[]` com `{ monde_person_id, name, email, phone, cpf, code, registered_at }`.

**Efeitos colaterais:** leitura em `integration_settings` (credenciais Monde). Chama Monde V2 `/people`. Não escreve.

**Source:** [monde-people-search/index.ts](../supabase/functions/monde-people-search/index.ts)

---

#### `monde-people-import`

> **Propósito:** importa pessoas do Monde V2 para `contatos` do CRM. Modos: `auto`, `bulk` (com cursor persistente), `maintenance` (scan recentes), `reset`, importar 1 por `monde_person_id`, busca por nome.
> **Caller:** Frontend (botão "Importar do Monde"), cron de bulk e maintenance.
> **Auth:** JWT do usuário OU service_role (cron sem JWT cai em fallback `Welcome Group`).
> **Tamanho:** 722 linhas.

**Invocação:**
```ts
supabase.functions.invoke('monde-people-import', { body: { mode: 'bulk', page_limit: 5 } })
// ou: { monde_person_id: 'uuid' } | { search: 'nome' } | { mode: 'reset' } | { debug: true }
```

**Body esperado (top-level keys):**
- `mode`: `'auto' | 'bulk' | 'maintenance' | 'reset'` (default `auto`).
- `monde_person_id`: importa 1 pessoa pelo UUID Monde.
- `search`: filtra por nome.
- `page_limit`: número de páginas por execução de bulk.
- `force_update`: boolean — sobrescreve campos no merge.
- `debug`: boolean — retorna metadata sem importar.

**Retorna:** `{ status, mode, imported, updated, skipped, errors, cursor, results: ImportResult[] }`.

**Efeitos colaterais:** escreve em `contatos` (insert/update via match por `monde_person_id` → cpf → email → telefone → nome). Atualiza cursor em `integration_settings`. Audit log.

**Source:** [monde-people-import/index.ts](../supabase/functions/monde-people-import/index.ts)

---

#### `iterpec-search`

> **Propósito:** busca unificada na API Iterpec/Cangooroo — hotéis, transfers, passeios e aluguel de carros com preços de operadora.
> **Caller:** Frontend (Proposal Builder, busca por produto).
> **Auth:** JWT do usuário.
> **Tamanho:** 285 linhas.

**Invocação:**
```ts
supabase.functions.invoke('iterpec-search', {
  body: { mode: 'hotel', criteria: { destination, checkIn, checkOut, rooms } }
})
```

**Body esperado (top-level keys):**
- `mode`: `'hotel' | 'transfer' | 'tour' | 'car'`.
- `criteria`: objeto específico por modo (`HotelSearchCriteria`, `TransferSearchCriteria`, etc.).

**Retorna:** `{ results: [...], token, fromCache: boolean }` — shape depende do modo.

**Efeitos colaterais:** chama Iterpec/Cangooroo. Lê/grava cache em `provider_cache` (TTL 15 min).

**Source:** [iterpec-search/index.ts](../supabase/functions/iterpec-search/index.ts)

---

#### `iterpec-booking-status`

> **Propósito:** consulta status de reservas na Iterpec/Cangooroo, em modo `detail` (1 booking) ou `list` (filtrada).
> **Caller:** Frontend (admin de propostas) — preparação para fluxo de booking real.
> **Auth:** JWT do usuário.
> **Tamanho:** 115 linhas.

**Invocação:**
```ts
supabase.functions.invoke('iterpec-booking-status', { body: { mode: 'detail', bookingId: 'XYZ123' } })
```

**Body esperado (top-level keys):**
- `mode`: `'detail' | 'list'`.
- `bookingId`: obrigatório se `detail`.
- `bookingNumbers[]`, `bookingStatus[]`, `serviceTypes[]`, `startDate`, `endDate`, `passengerName`: filtros do modo `list`.

**Retorna (detail):** `{ bookingId, status, services: [{ serviceType, status, supplierName, checkIn, checkOut, passengers, price }] }`. **Retorna (list):** payload bruto da Iterpec.

**Efeitos colaterais:** chama Iterpec. Não escreve.

**Source:** [iterpec-booking-status/index.ts](../supabase/functions/iterpec-booking-status/index.ts)

---

#### `enrich-flight`

> **Propósito:** lookup de voos via AeroDataBox (RapidAPI) — companhia, aeroportos, horários, aeronave. NÃO faz reservas.
> **Caller:** Frontend (Proposal Builder ao adicionar voo manualmente).
> **Auth:** JWT do usuário.
> **Tamanho:** 227 linhas.

**Invocação:**
```ts
supabase.functions.invoke('enrich-flight', { body: { flight_number: 'LA8084', departure_date: '2026-05-15' } })
```

**Body esperado (top-level keys):**
- `flight_number`: string IATA + número (ex: `LA8084`).
- `departure_date`: string `YYYY-MM-DD`.

**Retorna:** `{ details: FlightDetails | null }` com `airline`, `departure`, `arrival`, `durationMinutes`, `aircraft`, `status`.

**Efeitos colaterais:** chama RapidAPI (`aerodatabox`). Lê/grava `provider_cache` (TTL 1 dia).

**Source:** [enrich-flight/index.ts](../supabase/functions/enrich-flight/index.ts)

---

#### `enrich-hotel`

> **Propósito:** busca conteúdo de hotéis via LiteAPI (Nuitée) — nome, descrição, fotos HD, amenidades, rating. NÃO cota nem reserva.
> **Caller:** Frontend (Proposal Builder ao adicionar hotel).
> **Auth:** JWT do usuário.
> **Tamanho:** 483 linhas.

**Invocação:**
```ts
supabase.functions.invoke('enrich-hotel', { body: { mode: 'search', query: 'Copacabana Palace', country: 'BR' } })
// ou: { mode: 'details', hotelId: 'lp1897' }
```

**Body esperado (top-level keys):**
- `mode`: `'search' | 'details'`.
- `query`, `country`, `city`, `limit`: campos do modo `search`.
- `hotelId`, `language`: campos do modo `details`.

**Retorna (search):** `{ results: HotelSummary[] }`. **Retorna (details):** `{ details: HotelDetails }` com `description`, `amenities`, `photos[]`, `phone`, `website`.

**Efeitos colaterais:** chama LiteAPI. Cache: search 7 dias, details 30 dias em `provider_cache`.

**Source:** [enrich-hotel/index.ts](../supabase/functions/enrich-hotel/index.ts)

---

### 4.3 Mensageria

#### `send-email`

> **Propósito:** envio de email transacional via Resend, em modo template (`template_key` + `variables`) ou raw (`subject` + `html`).
> **Caller:** Frontend (admin de org), triggers/RPC com service_role, `send-password-reset`.
> **Auth:** JWT do usuário OU service_role.
> **Tamanho:** 192 linhas.

**Invocação:**
```ts
supabase.functions.invoke('send-email', {
  body: { template_key: 'invite', to: 'user@x.com', variables: { invite_link, org_name } }
})
```

**Body esperado (top-level keys):**
- `template_key`: `'invite' | 'password_reset' | 'lead_assigned' | 'org_welcome'` (modo template).
- `variables`: objeto com placeholders do template.
- `subject`, `html`, `text`: modo raw (alternativo).
- `to`: string ou array de destinatários.
- `org_id`, `reply_to`: opcionais.

**Retorna:** `{ success: true, id }` (Resend message id) ou `{ success: true, dry_run: true }` se `RESEND_API_KEY` ausente.

**Efeitos colaterais:** chama Resend API. Loga em `email_logs` (best-effort).

**Source:** [send-email/index.ts](../supabase/functions/send-email/index.ts)

---

#### `send-password-reset`

> **Propósito:** gera link de recovery via Supabase Admin e envia email customizado via `send-email`. Substitui `auth.resetPasswordForEmail` quando se quer template próprio.
> **Caller:** Frontend (tela "Esqueci a senha").
> **Auth:** sem JWT (chamada pública, mas sem expor existência de email).
> **Tamanho:** 145 linhas.

**Invocação:**
```ts
supabase.functions.invoke('send-password-reset', { body: { email, redirect_to } })
```

**Body esperado (top-level keys):**
- `email`: string do usuário.
- `redirect_to`: URL opcional (default `${APP_URL}/reset-password`).

**Retorna:** `{ success: true, sent: boolean, fallback_native?: boolean }`. Não expõe se o email existe (security).

**Efeitos colaterais:** chama `auth.admin.generateLink({ type: 'recovery' })`. Invoca `send-email` com template `password_reset`. Fallback para `resetPasswordForEmail` nativo se `RESEND_API_KEY` ausente.

**Source:** [send-password-reset/index.ts](../supabase/functions/send-password-reset/index.ts)

---

#### `send-push-notification`

> **Propósito:** envia Web Push Notifications para `user_ids`, respeitando `push_notification_preferences`.
> **Caller:** triggers/cron via `pg_net` + service_role; potencialmente Frontend para teste.
> **Auth:** service_role ou JWT.
> **Tamanho:** 176 linhas.

**Invocação:**
```ts
supabase.functions.invoke('send-push-notification', { body: { user_ids, title, body, url, type } })
```

**Body esperado (top-level keys):**
- `user_ids`: array de UUIDs.
- `title`: string (obrigatório).
- `body`: string.
- `url`: link aberto no clique.
- `type`: chave de preferência (`task_assigned`, `card_assigned`, etc.) — default `general`.

**Retorna:** `{ sent, failed, skipped, results }`.

**Efeitos colaterais:** lê `push_subscriptions` e `push_notification_preferences`. Envia via Web Push (`webpush`) com chaves VAPID. Limpa subscriptions inválidas.

**Source:** [send-push-notification/index.ts](../supabase/functions/send-push-notification/index.ts)

---

#### `send-whatsapp-message`

> **Propósito:** API universal para envio de mensagem WhatsApp via Echo, com renderização de variáveis (`{{contact.nome}}`, `{{card.titulo}}`, etc.) e suporte a `template_id` ou `corpo` direto.
> **Caller:** Frontend (envio manual), `cadence-engine`, n8n, qualquer API client.
> **Auth:** service_role OU JWT autenticado.
> **Tamanho:** 504 linhas.

**Invocação:**
```ts
supabase.functions.invoke('send-whatsapp-message', {
  body: { contact_id, card_id, corpo: 'Oi {{contact.primeiro_nome}}!', source: 'manual' }
})
```

**Body esperado (top-level keys):**
- `contact_id`: UUID (obrigatório).
- `card_id`: UUID opcional para contexto.
- `corpo` OU `template_id`: conteúdo da mensagem.
- `platform_id`, `phone_number_id`: linha Echo (auto-resolve se ausente).
- `variables`: extras para interpolação.
- `source`: `'automacao' | 'manual' | 'n8n' | 'api'`.
- `automacao_execucao_id`: tracking opcional.

**Retorna:** `{ success, message_id, echo_message_id, rendered_body }`.

**Efeitos colaterais:** chama Echo API (`ECHO_API_URL`/`ECHO_API_KEY`). Insere em `mensagens`. Pode invocar `cadence-engine` para registrar outcome.

**Source:** [send-whatsapp-message/index.ts](../supabase/functions/send-whatsapp-message/index.ts)

---

### 4.4 Operacionais

#### `export-org-data`

> **Propósito:** LGPD Art. 18 — dump JSON completo dos dados da org do usuário autenticado. Apenas admins.
> **Caller:** Frontend (admin: "Exportar dados da organização").
> **Auth:** JWT do usuário com `profiles.is_admin = true`.
> **Tamanho:** 269 linhas.

**Invocação:**
```ts
const { data } = await supabase.functions.invoke('export-org-data')
download(data, 'welcomecrm-export.json')
```

**Body esperado:** nenhum (`POST` ou `GET`). O escopo é derivado do JWT.

**Retorna:** JSON com chaves = nomes das tabelas exportáveis. Inclui `organizations`, `profiles` (sem `raw_*_meta_data`), `cards`, `contatos`, `proposals`, `tarefas`, `activities`, `mensagens`, `audit_logs` (últimos 90 dias), etc. `integration_settings.value` é redactado.

**Efeitos colaterais:** apenas leitura. Loga em `audit_logs` o export realizado.

**Source:** [export-org-data/index.ts](../supabase/functions/export-org-data/index.ts)

---

#### `provision-org`

> **Propósito:** lista organizações (GET) e provisiona novas organizações com seed completo de pipeline, sections, system_fields, motivos_perda, etc. (POST). Apenas platform admins.
> **Caller:** Frontend (`/platform/orgs` — admin de plataforma).
> **Auth:** JWT com `profiles.is_platform_admin = true` (double-check banco + claim JWT).
> **Tamanho:** 280 linhas.

**Invocação:**
```ts
// listar
supabase.functions.invoke('provision-org', { method: 'GET' })
// criar
supabase.functions.invoke('provision-org', {
  body: { name, slug, parent_org_id?, shares_contacts_with_children?, product_slug }
})
```

**Body esperado (POST):**
- `name`, `slug`: identificação da org.
- `parent_org_id`: UUID opcional (workspace dentro de account).
- `shares_contacts_with_children`: boolean (account-level).
- `product_slug`: `'trips' | 'wedding' | ...` — determina seed do pipeline.

**Retorna (GET):** `{ orgs: [{ id, name, slug, active, users_count, cards_count, won, lost }] }`. **Retorna (POST):** `{ org_id, pipeline_id, seeded: { sections, fields, motivos } }`.

**Efeitos colaterais:** RPC `provision_workspace` (seed). Cria `organizations`, `org_members`, `products`, `pipelines`, `pipeline_phases`, `pipeline_stages`, `sections`, `system_fields`, `stage_section_config`, `motivos_perda`.

**Source:** [provision-org/index.ts](../supabase/functions/provision-org/index.ts)

---

### 4.5 Sync

#### `sync-field-mappings`

> **Propósito:** sincroniza mapeamentos de campos do Inbound para Outbound do ActiveCampaign — espelha campos inbound ativos como outbound.
> **Caller:** Frontend (admin de integração AC, botão "Sincronizar mapeamentos").
> **Auth:** service_role (chamada interna).
> **Tamanho:** 205 linhas.

**Invocação:**
```ts
supabase.functions.invoke('sync-field-mappings')
```

**Body esperado:** nenhum. Constante `AC_INTEGRATION_ID` resolve a integração ActiveCampaign.

**Retorna:** `{ success, inbound_count, catalog_count, new_outbound_count, mappings: [{ internal_field, ac_field_id, ac_field_name, section }] }`.

**Efeitos colaterais:** lê `integration_field_map` (inbound) e `integration_field_catalog`. Insere em `integration_outbound_field_map` campos que ainda não existem (idempotente).

**Source:** [sync-field-mappings/index.ts](../supabase/functions/sync-field-mappings/index.ts)

---

#### `sync-whatsapp-history`

> **Propósito:** importa histórico de mensagens WhatsApp do ChatPro para um contato específico, upsert em `whatsapp_messages`.
> **Caller:** Frontend (botão "Importar histórico" no detalhe do contato).
> **Auth:** service_role.
> **Tamanho:** 126 linhas.

**Invocação:**
```ts
supabase.functions.invoke('sync-whatsapp-history', { body: { contact_id } })
```

**Body esperado (top-level keys):**
- `contact_id`: UUID do contato.

**Retorna:** `{ success, fetched, upserted, contact_id }`.

**Efeitos colaterais:** lê `contatos`. Chama `normalize_phone` (RPC). Chama ChatPro API (`CHATPRO_API_URL`/`CHATPRO_API_TOKEN`). Upsert em `whatsapp_messages` (`onConflict: 'external_id'`).

**Source:** [sync-whatsapp-history/index.ts](../supabase/functions/sync-whatsapp-history/index.ts)

---

## 5. AI Agent suite

Conjunto de functions que compõem o pipeline de agentes IA do WhatsApp. O entrypoint é `ai-agent-router` (engine legacy/pipeline) ou `ai-agent-router-v2` (Patricia, single-agent). Ambos são chamados internamente por `whatsapp-webhook`.

#### `ai-agent-router`

> **Propósito:** orquestrador do pipeline de 6 etapas (buildContext → Backoffice → Data → Persona → Validator → Formatter) para agentes IA respondendo no WhatsApp. Roteia para n8n se `agent.n8n_webhook_url` setado.
> **Caller:** `whatsapp-webhook` via `fetch` interno (passa service_role no Authorization).
> **Auth:** sem JWT (`verify_jwt = false`) — valida internamente `agent_active`, `routing_filter`, whitelist.
> **Tamanho:** 4574 linhas (entrypoint apenas).

**Invocação:**
```bash
curl -X POST .../functions/v1/ai-agent-router \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -d '{ "contact_phone": "5511...", "message_text": "...", "phone_number_id": "...", "phone_number_label": "...", "media_url": null }'
```

**Body esperado (`IncomingMessage`):**
- `contact_phone`: string E.164 sem `+`.
- `message_text`: string.
- `message_type`: `'text' | 'image' | 'audio' | 'document'` (default `text`).
- `phone_number_id`, `phone_number_label`: identifica a linha Echo.
- `contact_name`, `whatsapp_message_id`, `echo_conversation_id`, `media_url`: opcionais.
- `_drain`: boolean interno (self-call após debounce).

**Retorna:** `{ ok: true, agent_id, response_messages: [...], moment_key, validator_verdict }` ou `{ skipped: true, reason }`.

**Efeitos colaterais:** debounce em `ai_message_buffer`. Lock em `ai_pipeline_locks`. Insert em `mensagens`, `ai_turn_logs`. Atualização de `ai_resumo`, `ai_contexto`, `cards.pipeline_stage_id`. Chama OpenAI 4-5 vezes por turno. Envia resposta via Echo (`ECHO_API_URL`).

**Source:** [ai-agent-router/index.ts](../supabase/functions/ai-agent-router/index.ts)

---

#### `ai-agent-router-v2`

> **Propósito:** engine `single_agent_v2` (Patricia) — pipeline mais enxuto: build context → single agent → tools → brand validator → send. MVP só processa `text`.
> **Caller:** `whatsapp-webhook` quando `ai_agents.engine = 'single_agent_v2'`.
> **Auth:** sem JWT (`verify_jwt = false`).
> **Tamanho:** 941 linhas.

**Invocação:**
```bash
curl -X POST .../functions/v1/ai-agent-router-v2 \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -d '{ "contact_phone": "...", "message_text": "...", "phone_number_id": "...", "phone_number_label": "..." }'
```

**Body esperado (`IncomingMessageInput`):**
- `contact_phone`: obrigatório.
- `message_text`: obrigatório (exceto em `_drain`).
- `phone_number_id`: obrigatório.
- `message_type`: ignorado se ≠ `text` (skipped).
- `_drain`: boolean interno.

**Retorna:** `{ ok: true, response_messages, validator_verdict, latency_ms }` ou `{ skipped: true, reason }`.

**Efeitos colaterais:** debounce próprio em `ai_message_buffer`. Lock em `ai_pipeline_locks`. Insert em `mensagens` e `ai_turn_logs`. Pode invocar tools (registradas em `_utils.ts`) que mexem em `cards`/`contatos`. Brand validator pode re-pedir resposta. Envia via Echo.

**Source:** [ai-agent-router-v2/index.ts](../supabase/functions/ai-agent-router-v2/index.ts)

---

#### `ai-agent-from-wizard`

> **Propósito:** cria um agente IA completo a partir dos 7 passos do wizard de criação (perfil, template, qualificação, KB, regras de negócio, escalation, deploy).
> **Caller:** Frontend (Wizard "Criar agente IA").
> **Auth:** service_role (chamada interna autenticada).
> **Tamanho:** 424 linhas.

**Invocação:**
```ts
supabase.functions.invoke('ai-agent-from-wizard', { body: { template_id, wizard_data, draft_id } })
```

**Body esperado (top-level keys):**
- `template_id`: UUID do template base.
- `wizard_data`: objeto com `step1` (identidade), `step2` (template), `step3` (stages de qualificação), `step4` (KB), `step5` (pricing, processo, scenarios), `step6` (escalation), `step7` (`phone_line_id`, `go_live`).
- `draft_id`: UUID opcional para retomar rascunho.

**Retorna:** `{ agent_id, agent_name, status: 'active' | 'draft' }`.

**Efeitos colaterais:** insert em `ai_agents`, `ai_agent_qualification_stages`, `ai_agent_kb_items`, `ai_agent_kb_links`, `ai_agent_special_scenarios`, `ai_agent_escalation_rules`. Se `go_live`, vincula `phone_line_id` ao agente. Aplica `JULIA_DEFAULTS`.

**Source:** [ai-agent-from-wizard/index.ts](../supabase/functions/ai-agent-from-wizard/index.ts)

---

#### `ai-agent-deploy-prompt`

> **Propósito:** sincroniza o prompt do agente do Supabase para o nó correspondente no workflow n8n da Julia.
> **Caller:** Frontend (admin "Salvar prompt" no editor antigo de prompts n8n).
> **Auth:** service_role.
> **Tamanho:** 197 linhas.

**Invocação:**
```ts
supabase.functions.invoke('ai-agent-deploy-prompt', { body: { agent_id, prompt_version: 1 } })
```

**Body esperado (top-level keys):**
- `agent_id`: UUID.
- `prompt_version`: `1` (Context & Summary) | `2` (Data & Stage) | `3` (Persona).

**Retorna:** `{ success, node_updated, workflow_id, version }`.

**Efeitos colaterais:** lê `ai_agents` e `ai_agent_prompts`. Chama n8n API (`N8N_URL`/`N8N_API_KEY`) para atualizar o nó (`PROMPT_NODE_MAP[prompt_version]`) do workflow `tvh1SN7VDgy8V3VI`.

**Source:** [ai-agent-deploy-prompt/index.ts](../supabase/functions/ai-agent-deploy-prompt/index.ts)

---

#### `ai-agent-outbound-trigger`

> **Propósito:** processa a fila `ai_agent_outbound_queue` e envia a primeira mensagem do agente, respeitando horário comercial e config de `first_message_config` (fixo ou IA-generated).
> **Caller:** cron (`pg_cron` ou n8n a cada 30-60s).
> **Auth:** service_role.
> **Tamanho:** 571 linhas.

**Invocação:**
```bash
curl -X POST .../functions/v1/ai-agent-outbound-trigger \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -d '{}'
```

**Body esperado:** nenhum (drena a fila). Opcionalmente `{ queue_id }` para forçar 1 item específico.

**Retorna:** `{ processed, sent, skipped, errors, items: [...] }`.

**Efeitos colaterais:** lê `ai_agent_outbound_queue`, `ai_agents`, `ai_agent_presentations`. Valida `business_hours_config` e whitelist BR. Renderiza template ou chama OpenAI (`buildConceptSystemPrompt`). Envia via Echo (`send-whatsapp-message` internamente). Atualiza status da fila.

**Source:** [ai-agent-outbound-trigger/index.ts](../supabase/functions/ai-agent-outbound-trigger/index.ts)

---

## 6. Consumidores n8n / workflows

Functions invocadas por workflows n8n (HTTP Request direto), `pg_cron`, ou triggers de banco via `pg_net`. As públicas têm `verify_jwt = false` no `config.toml`.

#### `process-whatsapp-media`

> **Propósito:** recebe `message_id` de uma mensagem WhatsApp com mídia (imagem, áudio, PDF, documento), baixa a mídia, transcreve (Whisper) ou descreve (GPT Vision) e grava o conteúdo em `whatsapp_messages.media_content`.
> **Caller:** n8n (HTTP Request direto após webhook do WhatsApp).
> **Auth:** sem JWT (`verify_jwt = false`).
> **Tamanho:** 309 linhas.

**Invocação:**
```bash
curl -X POST .../functions/v1/process-whatsapp-media \
  -H "Content-Type: application/json" \
  -d '{ "message_id": "uuid" }'
```

**Body esperado (top-level keys):**
- `message_id`: UUID da linha em `whatsapp_messages` a processar.

**Retorna:** `{ message_id, message_type, media_content: string | null, error? }`.

**Efeitos colaterais:** baixa mídia da URL gravada na mensagem. Chama OpenAI Whisper (áudio), GPT Vision (imagem) ou Files API + chat (PDF/documento). Update em `whatsapp_messages.media_content` e `processed_at`.

**Source:** [process-whatsapp-media/index.ts](../supabase/functions/process-whatsapp-media/index.ts)

---

#### `cadence-engine`

> **Propósito:** motor de cadências de vendas — processa a fila (`cadence_queue` e `cadence_entry_queue`), cria tarefas com intervalos configuráveis, avança/cancela cadências, respeita horário comercial e pré-requisitos.
> **Caller:** `pg_cron` (a cada 5 min, action default) e n8n (actions específicas como `start_cadence`, `cancel_cadence`).
> **Auth:** service_role (`verify_jwt = true`, mas chamada interna usa service key).
> **Tamanho:** 4036 linhas (entrypoint apenas).

**Invocação:**
```bash
# tick padrão (processa fila)
curl -X POST .../functions/v1/cadence-engine -H "Authorization: Bearer $SERVICE_ROLE_KEY" -d '{}'
# iniciar cadência
curl -X POST .../functions/v1/cadence-engine -d '{ "action": "start_cadence", "card_id": "uuid", "template_id": "uuid" }'
# simular (dry-run)
curl -X POST .../functions/v1/cadence-engine -d '{ "action": "simulate_automation", "card_id": "uuid", "trigger": {...} }'
```

**Body esperado (top-level keys):**
- `action`: opcional — `'start_cadence' | 'cancel_cadence' | 'advance_cadence' | 'process_task_outcome' | 'process_entry_queue' | 'simulate_automation'`. Sem `action` = processa fila normal.
- `card_id`, `template_id`, `instance_id`, `trigger`: conforme a action.

**Retorna:** `{ processed, created, completed, dead_lettered, instances: [...] }` (varia por action).

**Efeitos colaterais:** insert em `tarefas`. Update em `cadence_instances`, `cadence_queue`. Move falhas para `cadence_dead_letter`. Pode chamar `send-whatsapp-message` ou invocar automation flows. Respeita timezone `America/Sao_Paulo` e business hours (09:00-18:00, dias úteis).

**Source:** [cadence-engine/index.ts](../supabase/functions/cadence-engine/index.ts)

---

#### `integration-dispatch`

> **Propósito:** drena `integration_outbound_queue` e despacha eventos para integrações externas (atualmente ActiveCampaign). Eventos: `stage_change`, `field_update`, `won`, `lost`, `card_created`, `task_created/completed/updated`.
> **Caller:** `pg_cron` (tick periódico).
> **Auth:** service_role.
> **Tamanho:** 831 linhas.

**Invocação:**
```bash
curl -X POST .../functions/v1/integration-dispatch -H "Authorization: Bearer $SERVICE_ROLE_KEY"
```

**Body esperado:** nenhum (drena fila).

**Retorna:** `{ processed, succeeded, failed, shadow_mode?, sync_enabled? }`.

**Efeitos colaterais:** lê `integration_settings` (`OUTBOUND_SYNC_ENABLED`, `OUTBOUND_SHADOW_MODE`, `OUTBOUND_NOTES_SECTIONS`). Lê até 50 eventos `pending` por execução respeitando `next_retry_at`. Por evento, chama AC API (atualiza deal, contact, notes). Update do status + `attempts` na fila. Backoff exponencial em falhas.

**Source:** [integration-dispatch/index.ts](../supabase/functions/integration-dispatch/index.ts)

---

#### `integration-process`

> **Propósito:** processa eventos inbound enfileirados em `integration_inbound_queue` (vindos de webhooks do AC) — cria/atualiza `cards` e `contatos` no CRM com base no payload.
> **Caller:** `webhook-ingest` (fire-and-forget via header `x-internal-secret`), admins via frontend, `pg_cron`.
> **Auth:** múltipla — service_role (JWT decode ou exact match), JWT de admin/gestor/superadmin, ou `x-internal-secret == CRON_SECRET`.
> **Tamanho:** 1832 linhas.

**Invocação:**
```bash
# interno
curl -X POST .../functions/v1/integration-process -H "x-internal-secret: $CRON_SECRET"
# admin
curl -X POST .../functions/v1/integration-process -H "Authorization: Bearer $USER_JWT"
```

**Body esperado:** nenhum padrão (drena fila). Opcionalmente `{ event_id }` para reprocessar específico.

**Retorna:** `{ processed, succeeded, failed, dead_lettered, events: [...] }`.

**Efeitos colaterais:** lê `integration_inbound_queue`, `integration_field_map`, `integration_stage_map`. Upsert em `contatos` e `cards`. Update de `pipeline_stage_id`, `valor_estimado`, `briefing_inicial`. Move falhas para DLQ. Audit log.

**Source:** [integration-process/index.ts](../supabase/functions/integration-process/index.ts)

---

#### `integration-sync-catalog`

> **Propósito:** importa o catálogo de campos do ActiveCampaign (deal custom fields + contact fields) para `integration_field_catalog`, com paginação automática.
> **Caller:** Frontend (admin "Atualizar catálogo AC"), eventualmente cron.
> **Auth:** service_role.
> **Tamanho:** 147 linhas.

**Invocação:**
```ts
supabase.functions.invoke('integration-sync-catalog')
```

**Body esperado:** nenhum.

**Retorna:** `{ success, deal_fields_count, contact_fields_count, upserted }`.

**Efeitos colaterais:** lê `integration_settings` (`ACTIVECAMPAIGN_API_URL`, `ACTIVECAMPAIGN_API_KEY`). Chama `/api/3/dealCustomFieldMeta` e `/api/3/fields` (todas as páginas). Upsert em `integration_field_catalog` keyed por `(integration_id, entity_type, field_key)`.

**Source:** [integration-sync-catalog/index.ts](../supabase/functions/integration-sync-catalog/index.ts)

---

#### `integration-sync-deals`

> **Propósito:** importa deals do ActiveCampaign por pipeline (6 = Wedding, 8 = Trips) — com filtros opcionais por `dealId`, `ownerId`, intervalo de datas (`cdate` ou `mdate`). Inclui side-loaded contact + custom fields.
> **Caller:** Frontend (admin "Re-importar deals AC"), `pg_cron` em horários definidos.
> **Auth:** service_role (deploy com `--no-verify-jwt`).
> **Tamanho:** 499 linhas.

**Invocação:**
```ts
supabase.functions.invoke('integration-sync-deals', {
  body: { pipelineId: '8', dateFrom: '2026-01-01', dateField: 'mdate' }
})
```

**Body esperado (top-level keys):**
- `pipelineId`: `'6'` (Wedding) ou `'8'` (Trips).
- `dealId`: importa 1 deal específico.
- `ownerId`: filtra por dono no AC.
- `dateFrom`, `dateTo`: `YYYY-MM-DD`.
- `dateField`: `'cdate' | 'mdate'` (default `mdate`).
- `limit`: tamanho de página, default 100.

**Retorna:** `{ success, fetched, upserted_cards, upserted_contacts, errors }`.

**Efeitos colaterais:** chama AC `/api/3/deals` com `include=dealCustomFieldData,contact,contact.fieldValues` e paginação. Para cada deal, enfileira evento em `integration_inbound_queue` (que `integration-process` consome) ou faz upsert direto em `cards`/`contatos`.

**Source:** [integration-sync-deals/index.ts](../supabase/functions/integration-sync-deals/index.ts)

---

## 7. Orquestradores / scheduled / internos

Tier INDEX — functions que rodam sem intervenção humana (cron, triggers SQL, ou chamadas internas entre functions). Não são expostas ao frontend nem a integradores externos.

- **ai-agent-router** (4574 linhas, `verify_jwt`) — Orquestrador do pipeline de 5 etapas (buildContext → Backoffice → Data → Persona → Validator → Formatter) que produz respostas WhatsApp dos agentes IA. Trigger: chamada interna de `whatsapp-webhook` quando o agente está ativo no card. [source](../supabase/functions/ai-agent-router/index.ts)
- **cadence-engine** (4036 linhas, `verify_jwt`) — Motor de cadências de vendas: processa fila (`cadence_queue`), aplica regras de entrada, cria tarefas com intervalos configuráveis e avança instâncias baseado em outcomes. Trigger: pg_cron a cada minuto + invocação síncrona em mudanças de stage. [source](../supabase/functions/cadence-engine/index.ts)
- **event-processor** (114 linhas, `verify_jwt`) — Consome `integration_events` (DB webhook), busca config da integração e transforma payload para o schema interno (`cards`, `contatos`). Trigger: Supabase DB Webhook em INSERT na tabela `integration_events`. [source](../supabase/functions/event-processor/index.ts)
- **outbound-dispatcher** (266 linhas, `verify_jwt`) — Dispara eventos CRM (`deal.created`, `deal.moved`, `deal.won`, `contact.*`) para integrações configuradas. Trigger: Supabase DB Webhook em UPDATE/INSERT de `cards` e `contatos`. [source](../supabase/functions/outbound-dispatcher/index.ts)
- **check-outbound-status** (101 linhas, `verify_jwt`) — Diagnóstico operacional: inspeciona settings, contagens da `integration_outbound_queue` e regras ativas. Trigger: invocação manual via dashboard de plataforma. [source](../supabase/functions/check-outbound-status/index.ts)
- **future-opportunity-processor** (239 linhas, `verify_jwt`) — Materializa oportunidades futuras (`lost_future`/`won_future`) em cards quando `scheduled_date <= hoje`, via RPCs `criar_card_oportunidade_futura` e `criar_sub_card_futuro`. Trigger: pg_cron diário `0 11 * * *` (8h BRT). [source](../supabase/functions/future-opportunity-processor/index.ts)
- **reactivation-calculator** (85 linhas, `verify_jwt`) — Wrapper fino sobre a RPC `calculate_reactivation_patterns()` que analisa padrões de viagem históricos e calcula score de reativação por contato. Trigger: pg_cron diário `0 3 * * *` (00:00 BRT). [source](../supabase/functions/reactivation-calculator/index.ts)
- **classify-corp-category** (248 linhas, `verify_jwt`) — Lê as primeiras mensagens de um card CORP, chama OpenAI (gpt-5.1) e grava `produto_data.categoria_produto` (aéreo nacional/intl, hotel, carro, ônibus, seguro, outros). Idempotente; respeita `corp_ai_classifier_enabled`. Trigger: trigger SQL via pg_net no INSERT de card CORP. [source](../supabase/functions/classify-corp-category/index.ts)
- **apply-outbound-rules-migration** (265 linhas, `verify_jwt`) — One-shot que cria/atualiza a tabela `integration_outbound_triggers` e seeds via `postgres.js`. Trigger: invocação manual durante setup inicial de outbound. [source](../supabase/functions/apply-outbound-rules-migration/index.ts)
- **setup-outbound-rules** (120 linhas, `verify_jwt`) — Limpa fila pendente e cria a regra default de bloqueio para o ActiveCampaign. Trigger: invocação manual de operação. [source](../supabase/functions/setup-outbound-rules/index.ts)
- **seed-agent-kb** (131 linhas, `verify_jwt`) — Popula a knowledge base de um agente IA: divide o conteúdo (default: `integration_settings.JULIA_FAQ`) por `## `, gera embeddings OpenAI e vincula ao agente via `ai_agent_kb_links`. Trigger: invocação manual durante onboarding de novo agente. [source](../supabase/functions/seed-agent-kb/index.ts)

---


## 8. Tabela-resumo geral

Todas as 44 functions ordenadas alfabeticamente. Colunas: tier (FULL = doc completo, COMPACT = resumo, INDEX = 1 linha), auth, trigger principal, linhas de código.

| # | Function | Tier | Auth | Trigger | Linhas |
|---|---|---|---|---|---|
| 1 | active-campaign-webhook | FULL | sem auth | Webhook AC externo | 189 |
| 2 | ai-agent-deploy-prompt | COMPACT | JWT | Frontend invoke | 197 |
| 3 | ai-agent-from-wizard | COMPACT | JWT | Frontend invoke | 424 |
| 4 | ai-agent-outbound-trigger | COMPACT | service_role | pg_cron + DB trigger | 571 |
| 5 | ai-agent-prompt-variations | COMPACT | JWT | Frontend invoke | 205 |
| 6 | ai-agent-router | INDEX | JWT | Interna (whatsapp-webhook) | 4574 |
| 7 | ai-agent-router-v2 | INDEX | JWT | Interna (whatsapp-webhook) | 941 |
| 8 | ai-agent-simulate | COMPACT | JWT | Frontend invoke | 327 |
| 9 | ai-conversation-extraction | COMPACT | JWT | n8n + Frontend | 459 |
| 10 | ai-extract-image | COMPACT | JWT | Frontend invoke | 331 |
| 11 | analytics-ai-interpret | COMPACT | JWT | Frontend invoke | 439 |
| 12 | apply-outbound-rules-migration | INDEX | JWT | Manual (one-shot) | 265 |
| 13 | cadence-engine | INDEX | JWT | pg_cron (1min) + sync | 4036 |
| 14 | check-outbound-status | INDEX | JWT | Manual (dashboard) | 101 |
| 15 | classify-corp-category | INDEX | JWT | DB trigger (pg_net) | 248 |
| 16 | enrich-flight | COMPACT | JWT | Frontend invoke | 227 |
| 17 | enrich-hotel | COMPACT | JWT | Frontend invoke | 483 |
| 18 | event-processor | INDEX | JWT | DB Webhook (integration_events) | 114 |
| 19 | export-org-data | COMPACT | JWT | Frontend invoke | 269 |
| 20 | future-opportunity-processor | INDEX | JWT | pg_cron (0 11 * * *) | 239 |
| 21 | integration-dispatch | COMPACT | service_role | Interna (event-processor) | 831 |
| 22 | integration-process | COMPACT | service_role | Interna + n8n | 1832 |
| 23 | integration-sync-catalog | COMPACT | JWT | Frontend + cron | 147 |
| 24 | integration-sync-deals | COMPACT | sem auth | Webhook AC + manual | 499 |
| 25 | iterpec-booking-status | COMPACT | JWT | Frontend invoke | 115 |
| 26 | iterpec-search | COMPACT | JWT | Frontend invoke | 285 |
| 27 | monde-people-import | COMPACT | JWT | Frontend + cron | 722 |
| 28 | monde-people-search | COMPACT | JWT | Frontend invoke | 162 |
| 29 | outbound-dispatcher | INDEX | JWT | DB Webhook (cards/contatos) | 266 |
| 30 | process-whatsapp-media | COMPACT | sem auth | Interna (whatsapp-webhook) | 309 |
| 31 | provision-org | COMPACT | service_role | Interna (onboarding) | 280 |
| 32 | public-api | FULL | X-API-Key | Integradores externos | 613 |
| 33 | reactivation-calculator | INDEX | JWT | pg_cron (0 3 * * *) | 85 |
| 34 | seed-agent-kb | INDEX | JWT | Manual (onboarding agente) | 131 |
| 35 | send-email | COMPACT | service_role | Interna + Frontend | 192 |
| 36 | send-password-reset | COMPACT | sem auth | Frontend (login) | 145 |
| 37 | send-push-notification | COMPACT | service_role | Interna (pg_cron + triggers) | 176 |
| 38 | send-whatsapp-message | COMPACT | JWT | Frontend + n8n | 504 |
| 39 | setup-outbound-rules | INDEX | JWT | Manual (one-shot) | 120 |
| 40 | sync-field-mappings | COMPACT | JWT | Frontend invoke | 205 |
| 41 | sync-whatsapp-history | COMPACT | JWT | Frontend invoke | 126 |
| 42 | webhook-ingest | FULL | sem auth | Webhook AC externo | 256 |
| 43 | webhook-whatsapp | FULL | sem auth | Webhook Meta WhatsApp | 269 |
| 44 | whatsapp-webhook | FULL | sem auth | Webhook Echo (interno) | 396 |

**Tiers ajustáveis:** o tier indicado é o padrão deste doc; veja seções §2-§7 para a documentação completa por function.

---

## 9. Apêndices

### 9.1 Variáveis de ambiente compartilhadas

Variáveis lidas via `Deno.env.get(...)` por uma ou mais functions. Definidas como Supabase Secrets (`supabase secrets set`) e replicadas em staging/produção.

| Variável | Quem usa | Descrição |
|---|---|---|
| `SUPABASE_URL` | Todas | URL do projeto Supabase (injetada pelo runtime) |
| `SUPABASE_SERVICE_ROLE_KEY` | Quase todas | Chave service_role para bypass de RLS (injetada pelo runtime) |
| `SUPABASE_ANON_KEY` | public-api, monde-people-import | Chave pública (injetada pelo runtime) |
| `SUPABASE_DB_URL` | apply-outbound-rules-migration | Conexão direta ao Postgres (postgres.js) |
| `SUPABASE_FUNCTION_BUILD_COMMIT` | Várias | SHA do commit deployado (injetada pelo CI) |
| `OPENAI_API_KEY` | ai-agent-router, classify-corp-category, ai-extract-image, ai-conversation-extraction, analytics-ai-interpret, seed-agent-kb | Chave OpenAI (GPT-5.1, embeddings) |
| `RESEND_API_KEY` / `RESEND_FROM` | send-email, send-password-reset | Provider de email transacional |
| `ECHO_API_KEY` / `ECHO_API_URL` / `ECHO_PHONE_NUMBER_ID` | send-whatsapp-message, whatsapp-webhook, process-whatsapp-media | Integração Echo WhatsApp (`sueokszzizsxalfwyuav`) |
| `CHATPRO_API_TOKEN` / `CHATPRO_API_URL` | send-whatsapp-message (legacy) | Provider WhatsApp anterior ao Echo |
| `MONDE_V2_LOGIN` / `MONDE_V2_PASSWORD` | monde-people-import, monde-people-search | Credenciais Monde V2 API (JWT 1h) |
| `MONDE_USERNAME` / `MONDE_PASSWORD` | Fallback Monde | Credenciais V3 legacy |
| `ITERPEC_USERNAME` / `ITERPEC_PASSWORD` | iterpec-search, iterpec-booking-status, enrich-hotel | Credenciais Cangooroo/Iterpec |
| `LITEAPI_KEY` | enrich-hotel | Provider de enriquecimento de hotéis |
| `RAPIDAPI_KEY` | enrich-flight | Provider AeroDataBox para voos |
| `GOOGLE_PLACES_KEY` | enrich-hotel | Google Places para geocoding |
| `N8N_URL` / `N8N_API_KEY` | integration-process, ai-conversation-extraction | Workflows n8n |
| `N8N_JULIA_WEBHOOK_URL` / `N8N_WEDDING_WEBHOOK_URL` | ai-agent-router (modo legacy) | Webhooks de agentes Julia/Wedding |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | send-push-notification | Web Push (browser notifications) |
| `CRON_SECRET` | Functions cron | Secret compartilhado para autenticar invocações de pg_cron |
| `AI_AGENT_ROUTER_ENABLED` | ai-agent-router | Kill-switch global |
| `APP_URL` / `BRAND_NAME` / `BRAND_LOGO_URL` | send-email, send-password-reset | Branding em emails transacionais |

### 9.2 Módulos do `_shared/`

Helpers reutilizados entre múltiplas functions. Sempre importar com path relativo (`../_shared/xxx.ts`).

- **iterpec-client.ts** — Wrapper para a API REST Iterpec/Cangooroo (`ws-iterpec.cangooroo.net`): hotéis, transfers, tours e rent-a-car. Gerencia auth (username/password no body), rate limit 10 req/s e cache de token de 30 min.
- **julia_defaults.ts** — Conteúdo literal extraído do workflow n8n "Welcome Trips AI Agent — Julia" (prompts das 5 fases, identity, voice, boundaries, listening configs). Fonte para wizard de criação de agente e botão "Usar padrão Julia".
- **monde-people-mapper.ts** — Mapeamento bidirecional entre `contatos` (snake_case, PT-BR) e Monde V2 `people` (JSON:API, kebab-case). Usado por `monde-people-import` e `monde-people-search`.
- **monde-v2-auth.ts** — Autenticação JWT Monde V2 com cache em memória (refresh 5 min antes de expirar) e fallback para credenciais V3 (`MONDE_USERNAME`/`MONDE_PASSWORD`).
- **provider-cache.ts** — Helpers `getCached`/`setCached` sobre a tabela `provider_cache` para evitar hammering de SerpAPI, AeroDataBox e similares. Usado por `enrich-hotel` e `enrich-flight`.

### 9.3 Como adicionar uma nova edge function ao doc

1. **Classifique o tier:** FULL (API pública / webhook externo / endpoint crítico do frontend), COMPACT (RPC do frontend ou n8n consumer comum), INDEX (worker interno, scheduled, one-shot).
2. **Use um template existente como referência:** FULL → `public-api` em §2; COMPACT → `send-email` em §4; INDEX → `reactivation-calculator` em §7.
3. **Acrescente a linha na tabela §8** (mantenha ordem alfabética, atualize a contagem total no §1.1).
4. **Liste env vars novas em §9.1** se a function ler segredos não listados ainda.
5. **Se a function tem `verify_jwt = false`**, adicione um lembrete no comando de deploy em §1.2 e garanta que `.claude/hooks/check-edge-deploy.sh` reconheça o nome.
