# Echo API — Referência de Integração

Documentação consolidada da Echo API (Supabase Edge Function `echo-api`) para integrações externas. Cobre os 31 endpoints REST públicos e o formato dos webhooks outbound.

- **Base URL:** `https://sueokszzizsxalfwyuav.supabase.co/functions/v1/echo-api`
- **Project Ref:** `sueokszzizsxalfwyuav`
- **Código fonte:** [supabase/functions/echo-api/index.ts](../supabase/functions/echo-api/index.ts)

---

## Sumário

1. [Visão geral](#1-visão-geral)
2. [Conceitos importantes](#2-conceitos-importantes)
3. [Endpoints](#3-endpoints)
   - [Health](#31-health)
   - [Conversations](#32-conversations)
   - [Messages](#33-messages)
   - [Send](#34-send)
   - [Templates](#35-templates)
   - [Phone Numbers](#36-phone-numbers)
   - [Tags](#37-tags)
   - [Close Reasons](#38-close-reasons)
4. [Webhooks outbound](#4-webhooks-outbound)
5. [Tabela-resumo](#5-tabela-resumo)

---

## 1. Visão geral

### Autenticação

Todas as rotas (exceto `GET /health`) exigem o header `x-api-key`:

```
x-api-key: <sua-chave-aqui>
```

- A chave é gerada na UI do Echo em **Settings → API Keys**.
- Apenas o hash SHA-256 é salvo no banco — **a chave NÃO pode ser recuperada depois**. Guarde-a no momento da criação.
- Cada chave fica vinculada a uma `organization_id`. Todas as operações ficam scopadas a essa organização automaticamente.
- Erros: `401` (chave inválida/inativa/ausente), `403` (chave sem organização associada).

### Headers padrão

| Header | Quando usar |
|---|---|
| `x-api-key: <chave>` | Sempre (exceto `/health`) |
| `Content-Type: application/json` | POST/PATCH com body JSON |
| `Content-Type: multipart/form-data` | Apenas em `/send-image` no modo upload |

### CORS

A API aceita chamadas cross-origin:

```
Access-Control-Allow-Origin: *
Access-Control-Allow-Headers: authorization, x-client-info, apikey, content-type, x-api-key
Access-Control-Allow-Methods: GET, POST, PUT, DELETE, PATCH, OPTIONS
```

### Formato de erro

Toda resposta de erro segue o formato:

```json
{
  "error": "mensagem amigável em português",
  "message": "descrição adicional (opcional)"
}
```

### Códigos HTTP

| Código | Significado |
|---|---|
| `200` | Sucesso |
| `201` | Criado |
| `400` | Body/parâmetro inválido |
| `401` | API key inválida, inativa ou ausente |
| `403` | API key sem organização associada |
| `404` | Recurso não existe ou não pertence à organização |
| `405` | Método HTTP não suportado para a rota |
| `409` | Conflito (ex: usuário já é assignado principal ao virar co-owner) |
| `500` | Erro interno (BD, integração com Meta) |
| `503` | Serviço de QR (Baileys) indisponível |

### Mensagens de erro amigáveis

A API converte erros técnicos em mensagens em PT-BR (fonte: [echo-api/index.ts:10](../supabase/functions/echo-api/index.ts#L10)):

| Origem técnica | Mensagem retornada no campo `error` |
|---|---|
| `session not connected` | `Sessão desconectada. Tente novamente ou reconecte o WhatsApp.` |
| `not connected` | `WhatsApp desconectado. Tente novamente.` |
| `qr service unreachable` | `Serviço temporariamente indisponível.` |
| `failed to send` | `Falha ao enviar. Tente novamente.` |
| `whatsapp credentials not found` | `WhatsApp não configurado.` |
| `phone number not found` | `Número de WhatsApp não encontrado.` |
| `conversation not found` | `Conversa não encontrada.` |
| `failed to create conversation` | `Erro ao criar conversa. Tente novamente.` |
| `api key` (qualquer mensagem contendo) | `Chave de API inválida ou não fornecida.` |
| `organization not found` | `Organização não encontrada.` |

---

## 2. Conceitos importantes

### `phone_number_id`: UUID interno vs Meta ID

Em **todos** os endpoints que aceitam `phone_number_id`, você pode passar:

- O **UUID interno do Echo** (campo `id` da tabela `phone_numbers`), ou
- O **Phone Number ID da Meta** (campo `phone_number_id`, ex: `1234567890123456`).

A API resolve automaticamente para o UUID interno antes de operar. Lógica em [echo-api/index.ts:652](../supabase/functions/echo-api/index.ts#L652).

### Roteamento QR vs Business API

Cada `phone_number` tem um campo `connection_type`:

- `business` (ou ausente) → mensagens saem pela **Meta WhatsApp Cloud API** (`graph.facebook.com/v18.0`).
- `qr` → mensagens saem por um serviço local Baileys (WhatsApp Web não-oficial), via `QR_SERVICE_URL`.

Você não precisa se preocupar com o roteamento — basta enviar para o `phone_number_id` correto e a API faz o resto.

### Normalização de números (variações brasileiras)

Ao buscar conversa existente para um número, o Echo gera variações com/sem o nono dígito e com/sem código do país. Exemplo: para `5511999999999`, ele tenta também `5511999999`, `11999999999` e `1199999999`. Lógica em [echo-api/index.ts:680](../supabase/functions/echo-api/index.ts#L680).

Use sempre o formato E.164 sem `+` (ex: `5511999999999`) que a API garante o match correto.

### Status de mensagem (campo `status` em payloads de webhook)

| Valor | Significado |
|---|---|
| `0` | pending / received |
| `2` | sent (entregue ao servidor WhatsApp) |
| `3` | delivered (chegou no aparelho do contato) |
| `4` | read (contato leu) |
| `-1` | failed |

---

## 3. Endpoints

### 3.1 Health

#### `GET /health`

Health check público. Não exige autenticação.

```bash
curl https://sueokszzizsxalfwyuav.supabase.co/functions/v1/echo-api/health
```

**Resposta `200`:**

```json
{ "status": "ok", "timestamp": "2026-05-07T10:30:45.123Z" }
```

**Código:** [index.ts:59](../supabase/functions/echo-api/index.ts#L59)

---

### 3.2 Conversations

#### `GET /conversations`

Lista conversas da organização.

**Query params:** `status` (`active` | `waiting` | `closed`), `phone_number_id`, `assigned_to` (UUID ou `"null"` para sem assignação), `co_owner` (UUID), `limit` (default 50), `offset` (default 0).

```bash
curl -H "x-api-key: $KEY" \
  "https://sueokszzizsxalfwyuav.supabase.co/functions/v1/echo-api/conversations?status=active&limit=10"
```

**Resposta `200`:**

```json
{
  "conversations": [
    {
      "id": "uuid",
      "contact_phone": "5511999999999",
      "contact_name": "João Silva",
      "status": "active",
      "assigned_to": "user-uuid",
      "phone_number_id": "phone-uuid",
      "created_at": "2026-05-07T10:00:00Z",
      "last_message_at": "2026-05-07T10:30:00Z",
      "phone_number": { "...": "..." },
      "assigned_user": { "...": "..." },
      "tags": [{ "id": "tag-uuid", "name": "urgente", "color": "#ff0000" }]
    }
  ],
  "count": 1,
  "offset": 0,
  "limit": 50
}
```

**Código:** [index.ts:474](../supabase/functions/echo-api/index.ts#L474)

---

#### `GET /conversations/{id}`

Detalhes de uma conversa.

```bash
curl -H "x-api-key: $KEY" \
  https://sueokszzizsxalfwyuav.supabase.co/functions/v1/echo-api/conversations/$CONV_ID
```

**Resposta `200`:** `{ "conversation": { ... } }` (mesmo shape do item da listagem).

**Erros:** `404` (conversa não existe ou não pertence à organização da chave).

**Código:** [index.ts:409](../supabase/functions/echo-api/index.ts#L409)

---

#### `POST /conversations`

Cria uma nova conversa. Status inicial: `waiting`. O `whatsapp_id` é gerado como `<contact_phone>_<phone_number_id>`.

**Body:**

```json
{
  "contact_phone": "5511999999999",
  "contact_name": "João Silva (opcional, default = phone)",
  "phone_number_id": "phone-uuid-or-meta-id",
  "assigned_to": "user-uuid (opcional)"
}
```

```bash
curl -X POST -H "x-api-key: $KEY" -H "Content-Type: application/json" \
  -d '{"contact_phone":"5511999999999","contact_name":"João","phone_number_id":"'$PHONE_ID'"}' \
  https://sueokszzizsxalfwyuav.supabase.co/functions/v1/echo-api/conversations
```

**Resposta `201`:** `{ "conversation": { ... } }`

**Erros:** `400` (campo obrigatório ausente), `404` (phone_number_id não pertence à org).

**Código:** [index.ts:546](../supabase/functions/echo-api/index.ts#L546)

---

#### `PATCH /conversations/{id}`

Atualiza campos da conversa. Apenas: `contact_name`, `assigned_to`, `status`, `close_reason`.

**Body (todos opcionais):**

```json
{
  "contact_name": "Novo nome",
  "assigned_to": "user-uuid ou null",
  "status": "active | waiting | closed",
  "close_reason": "string"
}
```

```bash
curl -X PATCH -H "x-api-key: $KEY" -H "Content-Type: application/json" \
  -d '{"status":"active"}' \
  https://sueokszzizsxalfwyuav.supabase.co/functions/v1/echo-api/conversations/$CONV_ID
```

**Código:** [index.ts:431](../supabase/functions/echo-api/index.ts#L431)

---

#### `POST /conversations/{id}/assign`

Atribui a conversa a um usuário (define `assigned_to` e muda status para `active`).

**Body:** `{ "user_id": "user-uuid" }`

```bash
curl -X POST -H "x-api-key: $KEY" -H "Content-Type: application/json" \
  -d '{"user_id":"'$USER_ID'"}' \
  https://sueokszzizsxalfwyuav.supabase.co/functions/v1/echo-api/conversations/$CONV_ID/assign
```

**Erros:** `400` (`user_id` ausente), `404` (usuário não pertence à organização).

**Código:** [index.ts:204](../supabase/functions/echo-api/index.ts#L204)

---

#### `POST /conversations/{id}/release`

Libera a conversa (zera `assigned_to`, status → `waiting`). Sem body.

```bash
curl -X POST -H "x-api-key: $KEY" \
  https://sueokszzizsxalfwyuav.supabase.co/functions/v1/echo-api/conversations/$CONV_ID/release
```

**Código:** [index.ts:231](../supabase/functions/echo-api/index.ts#L231)

---

#### `POST /conversations/{id}/close`

Fecha a conversa.

**Body:** `{ "reason": "motivo (opcional)" }`

```bash
curl -X POST -H "x-api-key: $KEY" -H "Content-Type: application/json" \
  -d '{"reason":"Problema resolvido"}' \
  https://sueokszzizsxalfwyuav.supabase.co/functions/v1/echo-api/conversations/$CONV_ID/close
```

**Código:** [index.ts:243](../supabase/functions/echo-api/index.ts#L243)

---

#### `GET /conversations/{id}/messages`

Lista todas as mensagens de uma conversa específica (atalho — para paginar use `GET /messages`).

```bash
curl -H "x-api-key: $KEY" \
  https://sueokszzizsxalfwyuav.supabase.co/functions/v1/echo-api/conversations/$CONV_ID/messages
```

**Código:** [index.ts:260](../supabase/functions/echo-api/index.ts#L260)

---

#### `GET /conversations/{id}/co-owners`

Lista co-proprietários (custódia compartilhada — vários agentes podem gerenciar a mesma conversa, além do `assigned_to` principal).

**Resposta `200`:**

```json
{
  "co_owners": [
    {
      "user_id": "user-uuid",
      "added_by": "admin-uuid",
      "added_at": "2026-05-07T10:00:00Z",
      "role": "co_owner",
      "user": { "id": "user-uuid", "first_name": "João", "last_name": "Silva", "email": "joao@example.com" }
    }
  ],
  "count": 1
}
```

**Código:** [index.ts:338](../supabase/functions/echo-api/index.ts#L338)

---

#### `POST /conversations/{id}/co-owners`

Adiciona um co-proprietário.

**Body:** `{ "user_id": "user-uuid" }`

```bash
curl -X POST -H "x-api-key: $KEY" -H "Content-Type: application/json" \
  -d '{"user_id":"'$USER_ID'"}' \
  https://sueokszzizsxalfwyuav.supabase.co/functions/v1/echo-api/conversations/$CONV_ID/co-owners
```

**Erros:** `400` (`user_id` ausente), `404` (usuário fora da org), `409` (usuário já é o `assigned_to` principal).

**Código:** [index.ts:349](../supabase/functions/echo-api/index.ts#L349)

---

#### `DELETE /conversations/{id}/co-owners?user_id=<uuid>`

Remove um co-proprietário. `user_id` vai como **query param**, não no body.

```bash
curl -X DELETE -H "x-api-key: $KEY" \
  "https://sueokszzizsxalfwyuav.supabase.co/functions/v1/echo-api/conversations/$CONV_ID/co-owners?user_id=$USER_ID"
```

**Código:** [index.ts:386](../supabase/functions/echo-api/index.ts#L386)

---

#### `GET /conversations/{id}/tags`

Lista tags aplicadas à conversa.

```bash
curl -H "x-api-key: $KEY" \
  https://sueokszzizsxalfwyuav.supabase.co/functions/v1/echo-api/conversations/$CONV_ID/tags
```

**Código:** [index.ts:272](../supabase/functions/echo-api/index.ts#L272)

---

#### `POST /conversations/{id}/tags`

Aplica uma tag à conversa.

**Body:** `{ "tag_id": "tag-uuid" }`

```bash
curl -X POST -H "x-api-key: $KEY" -H "Content-Type: application/json" \
  -d '{"tag_id":"'$TAG_ID'"}' \
  https://sueokszzizsxalfwyuav.supabase.co/functions/v1/echo-api/conversations/$CONV_ID/tags
```

**Erros:** `400` (`tag_id` ausente), `404` (tag fora da org).

**Código:** [index.ts:282](../supabase/functions/echo-api/index.ts#L282)

---

#### `DELETE /conversations/{id}/tags?tag_id=<uuid>`

Remove uma tag da conversa. `tag_id` como query param.

```bash
curl -X DELETE -H "x-api-key: $KEY" \
  "https://sueokszzizsxalfwyuav.supabase.co/functions/v1/echo-api/conversations/$CONV_ID/tags?tag_id=$TAG_ID"
```

**Código:** [index.ts:308](../supabase/functions/echo-api/index.ts#L308)

---

### 3.3 Messages

#### `GET /messages`

Lista mensagens de uma conversa com paginação.

**Query params:**

- `conversation_id` (obrigatório)
- `limit` (default 100)
- `offset` (default 0)

```bash
curl -H "x-api-key: $KEY" \
  "https://sueokszzizsxalfwyuav.supabase.co/functions/v1/echo-api/messages?conversation_id=$CONV_ID&limit=50"
```

**Resposta `200`:**

```json
{
  "messages": [
    {
      "id": "msg-uuid",
      "conversation_id": "conv-uuid",
      "content": "Olá!",
      "direction": "incoming",
      "message_type": "text",
      "whatsapp_message_id": "wamid.xxx",
      "created_at": "2026-05-07T10:15:00Z",
      "sent_by": null
    }
  ],
  "count": 1
}
```

**Código:** [index.ts:613](../supabase/functions/echo-api/index.ts#L613)

---

### 3.4 Send

#### `POST /send-message`

Envia uma mensagem de texto. Se `conversation_id` não for passado, o Echo tenta encontrar uma conversa existente para o número/phone_number_id (com normalização de variantes BR) ou cria uma nova.

**Body:**

```json
{
  "to": "5511999999999",
  "message": "Olá, como está?",
  "phone_number_id": "phone-uuid-or-meta-id",
  "conversation_id": "uuid (opcional)",
  "user_id": "uuid (opcional, fica salvo em sent_by)"
}
```

```bash
curl -X POST -H "x-api-key: $KEY" -H "Content-Type: application/json" \
  -d '{"to":"5511999999999","message":"Olá!","phone_number_id":"'$PHONE_ID'"}' \
  https://sueokszzizsxalfwyuav.supabase.co/functions/v1/echo-api/send-message
```

**Resposta `200`:**

```json
{
  "success": true,
  "whatsapp_message_id": "wamid.xxx",
  "conversation_id": "conv-uuid",
  "conversation_created": false,
  "message": {
    "id": "msg-uuid",
    "conversation_id": "conv-uuid",
    "content": "Olá!",
    "direction": "outbound",
    "whatsapp_message_id": "wamid.xxx",
    "sent_by": null,
    "created_at": "2026-05-07T10:30:45.000Z"
  }
}
```

**Erros:** `400` / `404` (phone_number_id não encontrado) / `500` / `503` (serviço QR offline).

**Código:** [index.ts:798](../supabase/functions/echo-api/index.ts#L798)

---

#### `POST /send-template`

Envia um template aprovado pela Meta.

**Body:**

```json
{
  "to": "5511999999999",
  "template_name": "appointment_reminder",
  "phone_number_id": "phone-uuid-or-meta-id",
  "language_code": "pt_BR (opcional, default pt_BR)",
  "body_parameters": ["João", "10:00"],
  "button_parameters": ["https://example.com (opcional)"],
  "components": "array completo (opcional, sobrescreve os dois acima)",
  "conversation_id": "uuid (opcional)",
  "user_id": "uuid (opcional)"
}
```

> **Atalho:** `body_parameters` aceita array (`["João","10:00"]`) **ou** string com `;` (`"João;10:00"`).
> Use `components` apenas se quiser controle total (header de mídia, múltiplos botões, etc.).

```bash
curl -X POST -H "x-api-key: $KEY" -H "Content-Type: application/json" \
  -d '{
    "to":"5511999999999",
    "template_name":"appointment_reminder",
    "phone_number_id":"'$PHONE_ID'",
    "language_code":"pt_BR",
    "body_parameters":["João","10:00"]
  }' \
  https://sueokszzizsxalfwyuav.supabase.co/functions/v1/echo-api/send-template
```

**Resposta `200`:** mesmo shape de `/send-message`, com `message.message_type = "template"` e `message.metadata` contendo `template_name`, `language_code` e `components`.

**Código:** [index.ts:1003](../supabase/functions/echo-api/index.ts#L1003)

---

#### `POST /send-image`

Envia mídia (imagem, vídeo, áudio, documento). Aceita **dois modos**.

**Modo 1 — JSON com URL de mídia já hospedada:**

`Content-Type: application/json`

```json
{
  "to": "5511999999999",
  "phone_number_id": "phone-uuid-or-meta-id",
  "media_url": "https://example.com/image.jpg",
  "mime_type": "image/jpeg",
  "filename": "image.jpg",
  "caption": "Legenda (opcional)",
  "conversation_id": "uuid (opcional)",
  "user_id": "uuid (opcional)"
}
```

```bash
curl -X POST -H "x-api-key: $KEY" -H "Content-Type: application/json" \
  -d '{
    "to":"5511999999999",
    "phone_number_id":"'$PHONE_ID'",
    "media_url":"https://cdn.example.com/foto.jpg",
    "mime_type":"image/jpeg",
    "filename":"foto.jpg",
    "caption":"Olha que legal!"
  }' \
  https://sueokszzizsxalfwyuav.supabase.co/functions/v1/echo-api/send-image
```

**Modo 2 — multipart/form-data com upload do arquivo:**

`Content-Type: multipart/form-data`

| Campo | Obrigatório | Descrição |
|---|---|---|
| `file` | sim | Arquivo binário |
| `to` | sim | Número destino |
| `phone_number_id` | sim | UUID interno ou Meta ID |
| `caption` | não | Legenda |
| `conversation_id` | não | UUID |
| `user_id` | não | UUID |

```bash
curl -X POST -H "x-api-key: $KEY" \
  -F "file=@/caminho/foto.jpg" \
  -F "to=5511999999999" \
  -F "phone_number_id=$PHONE_ID" \
  -F "caption=Foto do evento" \
  https://sueokszzizsxalfwyuav.supabase.co/functions/v1/echo-api/send-image
```

**Resposta `200`:**

```json
{
  "success": true,
  "whatsapp_message_id": "wamid.xxx",
  "media_url": "https://sueokszzizsxalfwyuav.supabase.co/storage/v1/object/public/attachments/outbound/...",
  "conversation_id": "conv-uuid",
  "conversation_created": false,
  "message": {
    "id": "msg-uuid",
    "message_type": "image",
    "media_url": "https://...",
    "media_mime_type": "image/jpeg",
    "media_filename": "foto.jpg",
    "media_size_bytes": 102400
  }
}
```

> No modo 2 o arquivo é salvo no Storage do Supabase em `attachments/outbound/{user_id|api}/{timestamp}_{filename}` e o `media_url` retornado é a URL pública.

**Código:** [index.ts:1557](../supabase/functions/echo-api/index.ts#L1557)

---

### 3.5 Templates

#### `GET /templates`

Lista templates da Meta para um número.

**Query params:**

- `phone_number_id` (obrigatório)
- `status` (opcional, default `APPROVED`; valores: `APPROVED`, `PENDING`, `REJECTED`)

```bash
curl -H "x-api-key: $KEY" \
  "https://sueokszzizsxalfwyuav.supabase.co/functions/v1/echo-api/templates?phone_number_id=$PHONE_ID"
```

**Resposta `200`:**

```json
{
  "templates": [
    {
      "name": "hello_world",
      "status": "APPROVED",
      "language": "pt_BR",
      "category": "MARKETING",
      "components": [
        { "type": "BODY", "text": "Hello {{1}}, welcome to {{2}}" },
        { "type": "BUTTONS", "buttons": [{ "type": "URL", "text": "Visit", "url": "https://example.com" }] }
      ]
    }
  ],
  "count": 1
}
```

**Código:** [index.ts:1230](../supabase/functions/echo-api/index.ts#L1230)

---

### 3.6 Phone Numbers

#### `GET /phone-numbers`

Lista os números conectados na organização.

```bash
curl -H "x-api-key: $KEY" \
  https://sueokszzizsxalfwyuav.supabase.co/functions/v1/echo-api/phone-numbers
```

**Resposta `200`:**

```json
{
  "phone_numbers": [
    {
      "id": "phone-uuid",
      "phone_number": "5511999999999",
      "phone_number_id": "meta-phone-id",
      "display_name": "Atendimento",
      "connection_type": "business",
      "is_active": true,
      "theme_hue": 15,
      "organization_id": "org-uuid",
      "created_at": "2026-05-07T10:00:00Z"
    }
  ]
}
```

**Código:** [index.ts:1318](../supabase/functions/echo-api/index.ts#L1318)

---

#### `GET /phone-numbers/{id}`

Detalhe de um número.

**Código:** [index.ts:1330](../supabase/functions/echo-api/index.ts#L1330)

---

#### `POST /phone-numbers`

Cria um número. `organization_id` é sempre extraído da API key — não passe no body.

**Body:**

```json
{
  "phone_number": "5511999999999",
  "phone_number_id": "meta-phone-id",
  "display_name": "Atendimento",
  "theme_hue": 15,
  "is_active": true
}
```

**Código:** [index.ts:1343](../supabase/functions/echo-api/index.ts#L1343)

---

#### `PATCH /phone-numbers/{id}`

Atualiza apenas: `display_name`, `theme_hue`, `is_active`.

```bash
curl -X PATCH -H "x-api-key: $KEY" -H "Content-Type: application/json" \
  -d '{"is_active":false}' \
  https://sueokszzizsxalfwyuav.supabase.co/functions/v1/echo-api/phone-numbers/$PHONE_ID
```

**Código:** [index.ts:1373](../supabase/functions/echo-api/index.ts#L1373)

---

#### `DELETE /phone-numbers/{id}`

Remove o número.

**Código:** [index.ts:1397](../supabase/functions/echo-api/index.ts#L1397)

---

### 3.7 Tags

#### `GET /tags`

Lista todas as tags da organização.

**Código:** [index.ts:1416](../supabase/functions/echo-api/index.ts#L1416)

---

#### `GET /tags/{id}`

Detalhe de uma tag.

**Código:** [index.ts:1428](../supabase/functions/echo-api/index.ts#L1428)

---

#### `POST /tags`

Cria uma tag.

**Body:**

```json
{
  "name": "urgente",
  "color": "#ff0000 (opcional, default #3b82f6)",
  "user_id": "user-uuid"
}
```

**Código:** [index.ts:1441](../supabase/functions/echo-api/index.ts#L1441)

---

#### `PATCH /tags/{id}`

Atualiza `name` e/ou `color`.

**Código:** [index.ts:1464](../supabase/functions/echo-api/index.ts#L1464)

---

#### `DELETE /tags/{id}`

Remove a tag.

**Código:** [index.ts:1488](../supabase/functions/echo-api/index.ts#L1488)

---

### 3.8 Close Reasons

#### `GET /close-reasons`

Lista motivos de encerramento da organização.

**Código:** [index.ts:1507](../supabase/functions/echo-api/index.ts#L1507)

---

#### `POST /close-reasons`

Cria um motivo.

**Body:** `{ "name": "Problema resolvido", "user_id": "user-uuid" }`

**Código:** [index.ts:1519](../supabase/functions/echo-api/index.ts#L1519)

---

#### `DELETE /close-reasons/{id}`

Remove o motivo.

**Código:** [index.ts:1541](../supabase/functions/echo-api/index.ts#L1541)

---

## 4. Webhooks outbound

O Echo envia eventos para uma URL externa cada vez que uma mensagem é recebida, enviada ou tem status atualizado.

### Como configurar

A URL fica em `organization_webhooks` (uma URL por organização). Hoje a configuração é feita pela UI do Echo — não há endpoint REST exposto para criar/editar.

```
organization_id → url, is_active
```

Fonte: [whatsapp-webhook/index.ts:87](../supabase/functions/whatsapp-webhook/index.ts#L87)

### Entrega

- Método: `POST`
- `Content-Type: application/json`
- Sem assinatura HMAC. Use HTTPS e, se quiser validar origem, configure um path/secret na própria URL.
- Sem retry automático.

### Eventos

- `message.received` — mensagem do contato chegou
- `message.sent` — mensagem saída pelo Echo (inclui as enviadas via API)
- `message.status` — atualização de status (delivered, read, failed)

### Payload base (todos os eventos)

```json
{
  "event": "message.received | message.sent | message.status",
  "ts": 1714324245123,
  "ts_iso": "2026-05-07T10:30:45.123Z",
  "organization": "nome-org",
  "organization_id": "org-uuid",
  "phone_number_id": "meta-phone-id",
  "phone_number": "Atendimento",
  "conversation_id": "conv-uuid",
  "message_id": "msg-uuid",
  "whatsapp_message_id": "wamid.xxx",
  "contact_phone": "5511999999999",
  "error": false,
  "error_message": "",
  "is_quoted": false,
  "quoted": null,
  "is_group": false,
  "group": null,
  "sender": null,
  "contact": {
    "name": "João Silva",
    "phone": "5511999999999",
    "tags": ["urgente", "vip"]
  },
  "conversation": {
    "id": "conv-uuid",
    "assigned_to": "user-uuid ou null",
    "status": "active",
    "agent": {
      "id": "agent-uuid",
      "name": "Maria da Silva",
      "email": "maria@example.com",
      "sector": "Vendas"
    },
    "is_group": false
  }
}
```

### Campos específicos por evento

#### `message.received`

```json
{
  "status": 0,
  "direction": "incoming",
  "from_me": false,
  "actor_type": "customer",
  "text": "Olá, como posso ajudar?",
  "message_type": "text",
  "media": null,
  "read": false
}
```

#### `message.sent`

```json
{
  "status": 2,
  "direction": "outgoing",
  "from_me": true,
  "actor_type": "agent",
  "sent_by": "user-uuid",
  "text": "Olá! Como posso ajudá-lo?",
  "message_type": "text",
  "media": null,
  "template_name": null
}
```

> Quando a mensagem foi um template, `template_name` virá preenchido e `text` traz uma representação textual do template renderizado.

#### `message.status`

```json
{
  "status": 3,
  "status_name": "delivered",
  "text": "conteúdo original da mensagem",
  "message_type": "text",
  "media": null
}
```

`status_name` espelha `status` em string: `pending` (0), `sent` (2), `delivered` (3), `read` (4), `failed` (-1).

---

## 5. Tabela-resumo

| # | Método | Path | Descrição |
|---|---|---|---|
| 1 | GET | `/health` | Health check (sem auth) |
| 2 | GET | `/conversations` | Listar conversas |
| 3 | GET | `/conversations/{id}` | Obter conversa |
| 4 | POST | `/conversations` | Criar conversa |
| 5 | PATCH | `/conversations/{id}` | Atualizar conversa |
| 6 | POST | `/conversations/{id}/assign` | Atribuir conversa |
| 7 | POST | `/conversations/{id}/release` | Liberar conversa |
| 8 | POST | `/conversations/{id}/close` | Fechar conversa |
| 9 | GET | `/conversations/{id}/messages` | Mensagens da conversa |
| 10 | GET | `/conversations/{id}/co-owners` | Listar co-owners |
| 11 | POST | `/conversations/{id}/co-owners` | Adicionar co-owner |
| 12 | DELETE | `/conversations/{id}/co-owners` | Remover co-owner |
| 13 | GET | `/conversations/{id}/tags` | Listar tags da conversa |
| 14 | POST | `/conversations/{id}/tags` | Adicionar tag à conversa |
| 15 | DELETE | `/conversations/{id}/tags` | Remover tag da conversa |
| 16 | GET | `/messages` | Listar mensagens (paginado) |
| 17 | POST | `/send-message` | Enviar texto |
| 18 | POST | `/send-template` | Enviar template |
| 19 | POST | `/send-image` | Enviar mídia (URL ou upload) |
| 20 | GET | `/templates` | Listar templates Meta |
| 21 | GET | `/phone-numbers` | Listar números |
| 22 | GET | `/phone-numbers/{id}` | Obter número |
| 23 | POST | `/phone-numbers` | Criar número |
| 24 | PATCH | `/phone-numbers/{id}` | Atualizar número |
| 25 | DELETE | `/phone-numbers/{id}` | Deletar número |
| 26 | GET | `/tags` | Listar tags |
| 27 | GET | `/tags/{id}` | Obter tag |
| 28 | POST | `/tags` | Criar tag |
| 29 | PATCH | `/tags/{id}` | Atualizar tag |
| 30 | DELETE | `/tags/{id}` | Deletar tag |
| 31 | GET | `/close-reasons` | Listar motivos de encerramento |
| 32 | POST | `/close-reasons` | Criar motivo |
| 33 | DELETE | `/close-reasons/{id}` | Deletar motivo |
