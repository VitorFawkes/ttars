# Monde API V3 — Referência Completa

> **IMPORTANTE:** Esta documentação deve ser consultada ANTES de modificar qualquer código de integração Monde.
> Fonte: Documentação oficial Monde + testes reais POST /sales (vendas 69160/69161)
> Última atualização: 2026-02-12

## Informações Gerais

| Campo | Valor |
|-------|-------|
| **URL Base** | `https://web.monde.com.br/api/v3` |
| **Autenticação** | HTTP Basic Auth |
| **Formato** | JSON (RESTful) |
| **Datas** | ISO 8601 (`YYYY-MM-DD`) |
| **Floats** | Ponto como separador decimal, 2 casas (`99999.99`) |
| **Idempotência** | UUID v4 no header `Idempotency-Key` (válida 1 dia) |
| **Rate Limit** | 60 req / 3 segundos por IP |

## Autenticação

```
Authorization: Basic <base64(username:password)>
```

Credenciais fornecidas pela agência. Não expiram, podem ser revogadas.

## Idempotência

- Header: `Idempotency-Key: <UUID v4>`
- Mesma chave + mesmo body = resposta em cache (`X-Idempotent-Replay: true`)
- Mesma chave + body diferente = `422 Unprocessable Content`
- Requisição em andamento com mesma chave = `409 Conflict`

---

## POST /sales — Cadastrar Venda

> A venda deve conter **pelo menos um produto**.

### Campos do Request Body

| Campo | Tipo | Required | Descrição |
|-------|------|----------|-----------|
| `company_identifier` | string (14 chars) | **SIM** | CNPJ da agência (só dígitos). Ex: `"46598887000162"` |
| `sale_date` | string (date) | **SIM** | Data da venda. Ex: `"2026-02-12"` |
| `operation_id` | string | não | ID de operação própria cadastrada no Monde. **NÃO USAR** se não houver operação registrada — causa 422. |
| `travel_agent` | object | **SIM** | Agente de viagem responsável pela venda |
| `payer` | object | **SIM** | Contratante/pagante do produto |
| `intermediary` | object | não | Intermediário (operadora/consolidadora) |
| `insurances` | array | não | Seguro viagem |
| `cruises` | array | não | Cruzeiro |
| `hotels` | array | não | Diárias de hospedagem |
| `airline_tickets` | array | **IGNORADO** | **Silenciosamente ignorado pela API** — voos devem ir como `travel_packages` |
| `train_tickets` | array | não | Bilhete de trem |
| `ground_transportations` | array | não | Transporte terrestre |
| `car_rentals` | array | não | Locação de veículos |
| `travel_packages` | array | não | Pacotes turísticos |
| `payments` | array | não | Pagamentos realizados |

### travel_agent (REQUIRED)

```json
{
  "external_id": "a8a41bec-e2a2-4d6a-b2f9-8fbc29169e46",
  "name": "João da Silva",
  "cpf": "83115137168"
}
```

| Campo | Tipo | Required | Descrição |
|-------|------|----------|-----------|
| `external_id` | string (uuid) | **SIM** | ID externo do agente |
| `name` | string | **SIM** | Nome do agente |
| `cpf` | string (11 chars) | não | CPF do agente (só dígitos) |

### payer (REQUIRED) — individual_or_company

```json
{
  "person_kind": "individual",
  "external_id": "cce45f2c-30e3-43a6-bbf1-af340188a04c",
  "name": "Márcio da Veiga",
  "cpf_cnpj": "50957153848",
  "email": "contato@marcio.com",
  "mobile_number": "11999990002"
}
```

| Campo | Tipo | Required | Descrição |
|-------|------|----------|-----------|
| `person_kind` | string | **SIM** | `"individual"` ou `"company"` |
| `external_id` | string (uuid) | **SIM** | ID externo |
| `name` | string | **SIM** | Nome (PF) ou Razão Social (PJ) |
| `legal_name` | string | não | Nome fantasia (PJ) |
| `gender` | string | não | `"male"`, `"female"` |
| `birthdate` | string (date) | não | Data de nascimento |
| `cpf_cnpj` | string | não | CPF (11 dígitos) ou CNPJ (14 dígitos) — **auto-popula** dados do contato se existir no Monde |
| `rg_ie` | string | não | RG ou Inscrição Estadual |
| `passport_number` | string | não | Número do passaporte |
| `passport_expiration_date` | string (date) | não | Validade do passaporte |
| `foreigner` | boolean | não | Se é estrangeiro |
| `foreign_identity_document` | string | não | Documento de identidade estrangeiro |
| `email` | string | não | Email |
| `phone_number` | string | não | Telefone fixo |
| `mobile_number` | string | não | Celular |
| `address` | object | não | Endereço |

### intermediary (opcional) — mesma estrutura de individual_or_company

### Resposta 201 — Sucesso

```json
{
  "sale_id": "9f8e7d6c-5b4a-3210-9876-5432109876ab",
  "sale_number": 987,
  "company_identifier": "46598887000162",
  "sale_date": "2026-02-12",
  "period_start": "2024-03-15",
  "period_end": "2024-03-22",
  "operation_id": "WC-abc123de",
  "travel_agent": { ... },
  "payer": { ... },
  ...
}
```

---

## Campos Comuns a TODOS os Produtos (REQUIRED)

> **Validado via testes reais.** Cada produto DEVE ter estes campos além dos específicos.

| Campo | Tipo | Required | Descrição |
|-------|------|----------|-----------|
| `external_id` | string (uuid) | **SIM** | ID único do produto |
| `currency` | string | **SIM** | Moeda. Ex: `"BRL"` |
| `value` | float | **SIM** | Valor total do produto |
| `supplier` | **object** | **SIM** | Fornecedor — **NÃO é string!** |
| `supplier.external_id` | string (uuid) | **SIM** | ID do fornecedor |
| `supplier.name` | string | **SIM** | Nome do fornecedor |
| `passengers` | **array** | **SIM** | Lista de passageiros (mín. 1) |
| `passengers[].person.external_id` | string (uuid) | **SIM** | ID do passageiro |
| `passengers[].person.name` | string | **SIM** | Nome do passageiro |
| `passengers[].amount` | float | não | Valor pago pelo passageiro |
| `passengers[].agency_fee` | float | não | Taxa de agenciamento |
| `commission_amount` | float | não | Comissão/receita da agência |

---

## Tipos de Produto (no payload de venda)

### hotels — Diárias de hospedagem

| Campo | Tipo | Required | Descrição |
|-------|------|----------|-----------|
| *(campos comuns acima)* | | **SIM** | |
| `check_in` | string (date) | **SIM** | Data check-in |
| `check_out` | string (date) | **SIM** | Data check-out |
| `booking_number` | string | **SIM** | Número da reserva |
| `destination` | string | não | Cidade/destino |
| `accommodation_kind` | string | não | Tipo de acomodação |
| `room_category` | string | não | Categoria do quarto |
| `meal_plan` | string | não | Regime de alimentação |
| `exchange_rate` | float | não | Taxa de câmbio |

### airline_tickets — SILENCIOSAMENTE IGNORADO

> **AVISO:** O campo `airline_tickets` é aceito no POST mas **silenciosamente ignorado**.
> Passagens aéreas retornam como `airline_tickets: []` na resposta.
> **Use `travel_packages` como fallback para enviar voos ao Monde.**

### ground_transportations — Transporte terrestre

| Campo | Tipo | Required | Descrição |
|-------|------|----------|-----------|
| *(campos comuns acima)* | | **SIM** | |
| `locator` | string | **SIM** | Localizador |
| `segments` | array | não | Segmentos da viagem |
| `segments[].date` | string (date) | **SIM** | Data do segmento |
| `segments[].origin` | string | não | Local de origem |
| `segments[].destination` | string | não | Local de destino |

### insurances — Seguro viagem

| Campo | Tipo | Required | Descrição |
|-------|------|----------|-----------|
| *(campos comuns acima)* | | **SIM** | |
| `begin_date` | string (date) | **SIM** | Data início cobertura — **NÃO é `start_date`!** |
| `end_date` | string (date) | não | Data fim cobertura |
| `voucher_code` | string | não | Código do voucher |
| `destination` | string (enum) | não | Enum: `"national"`, `"international"`, `"cruise"` |

### destination — Valores válidos por tipo de produto

| Tipo | Valores aceitos | Required |
|------|----------------|----------|
| `travel_packages` | `"national"`, `"international"` | **SIM** |
| `hotels` | `"national"`, `"international"` | não |
| `insurances` | `"national"`, `"international"`, `"cruise"` | não |

> Testado em Feb 2026: valores freetext (cidades, países, ISO codes) causam 422 para travel_packages.

### cruises — Cruzeiro

| Campo | Tipo | Required | Descrição |
|-------|------|----------|-----------|
| *(campos comuns acima)* | | **SIM** | |
| `departure_date` | string (date) | **SIM** | Data de partida |
| `arrival_date` | string (date) | **SIM** | Data de chegada |
| `booking_number` | string | **SIM** | Número da reserva |
| `ship_name` | string | não | Nome do navio |

### train_tickets — Bilhete de trem

| Campo | Tipo | Required | Descrição |
|-------|------|----------|-----------|
| *(campos comuns acima)* | | **SIM** | |
| `locator` | string | **SIM** | Localizador |
| `segments` | array | não | Segmentos da viagem |
| `segments[].departure_date` | string (date) | **SIM** | Data de partida |
| `segments[].origin` | string | não | Estação/cidade origem |
| `segments[].destination` | string | não | Estação/cidade destino |

### car_rentals — Locação de veículos

| Campo | Tipo | Required | Descrição |
|-------|------|----------|-----------|
| *(campos comuns acima)* | | **SIM** | |
| `pickup_date` | string (date) | **SIM** | Data retirada |
| `dropoff_date` | string (date) | não | Data devolução — **NÃO é `return_date`!** |
| `booking_number` | string | **SIM** | Número da reserva |
| `pickup_location` | string | não | Local de retirada |
| `dropoff_location` | string | não | Local de devolução — **NÃO é `return_location`!** |

### travel_packages — Pacotes turísticos

| Campo | Tipo | Required | Descrição |
|-------|------|----------|-----------|
| *(campos comuns acima)* | | **SIM** | |
| `begin_date` | string (date) | **SIM** | Data início — **NÃO é `start_date`!** |
| `end_date` | string (date) | não | Data fim |
| `booking_number` | string | **SIM** | Número da reserva |
| `package_name` | string | não | Nome do pacote — **NÃO é `description`!** |
| `destination` | string (enum) | **SIM** | **OBRIGATÓRIO!** Enum: `"national"` ou `"international"`. Valores freetext causam 422. |

> **AVISO `destination`:** Testado em Feb 2026 — enviar `null`, cidades, países ou códigos ISO causa 422.
> Apenas `"national"` e `"international"` são aceitos para travel_packages.

### payments — Pagamentos

| Campo | Tipo | Required | Descrição |
|-------|------|----------|-----------|
| `external_id` | string | não | ID externo para correspondência com produtos |
| `method` | string | não | Método (cartão, boleto, etc.) |
| `value` | float | **SIM** | Valor do pagamento |

---

## GET /sales — Listar vendas

Query params: `period_start`, `period_end`, `page`, `size`

> **Nota:** Nossa conta API retorna 404 neste endpoint (write-only).

## GET /sales/{sale_id} — Obter venda por ID

> **Nota:** Nossa conta API retorna 404 neste endpoint (write-only).

## POST /attachments — Enviar anexo

- `target_type`: `"sale"`
- `target_id`: UUID da venda
- `file`: binário (max 12MB, extensões: pdf, doc, xlsx, jpg, png, etc.)
- `description`: texto opcional

## GET /products — Listar produtos

Query param `kind`: `insurance`, `cruise`, `hotel`, `airline_ticket`, `train_ticket`, `ground_transportation`, `car_rental`, `travel_package`, `operation`, `others`

> **Nota:** Nossa conta API retorna 403 neste endpoint (sem permissão de leitura).

---

## Exemplo Completo — Venda com hotel (validado)

```json
{
  "company_identifier": "07454238000136",
  "sale_date": "2026-02-11",
  "travel_agent": {
    "external_id": "a8a41bec-e2a2-4d6a-b2f9-8fbc29169e46",
    "name": "João da Silva"
  },
  "payer": {
    "person_kind": "individual",
    "external_id": "cce45f2c-30e3-43a6-bbf1-af340188a04c",
    "name": "Márcio da Veiga",
    "cpf_cnpj": "50957153848"
  },
  "hotels": [{
    "external_id": "d1e2f3a4-b5c6-7890-abcd-ef1234567890",
    "check_in": "2026-03-01",
    "check_out": "2026-03-05",
    "supplier": {
      "external_id": "f1e2d3c4-b5a6-7890-cdef-123456789abc",
      "name": "Hotel Copacabana Palace"
    },
    "currency": "BRL",
    "value": 5000.00,
    "commission_amount": 750.00,
    "passengers": [{
      "person": {
        "external_id": "cce45f2c-30e3-43a6-bbf1-af340188a04c",
        "name": "Márcio da Veiga"
      },
      "amount": 5000.00,
      "agency_fee": 50.00
    }],
    "booking_number": "WC-abc12345",
    "destination": "Rio de Janeiro"
  }]
}
```

---

## Campos Financeiros (Receita/Comissão)

| Campo | Nível | Descrição |
|-------|-------|-----------|
| `commission_amount` | Produto | Comissão/receita da agência naquele produto |
| `agency_fee` | Passageiro | Taxa de agenciamento cobrada do passageiro |
| `amount` | Passageiro | Valor pago pelo passageiro naquele produto |

> Monde **auto-popula** dados do contato a partir do CPF. Ao enviar um CPF existente no Monde, ele preenche nome, endereço, telefone e email automaticamente.

---

## Mapeamento WelcomeCRM → Monde

| Campo WelcomeCRM | Campo Monde | Fonte |
|------------------|-------------|-------|
| `MONDE_CNPJ` (integration_settings) | `company_identifier` | Config |
| `monde_sales.sale_date` | `sale_date` | Monde sale |
| `cards.vendas_owner_id` → profiles | `travel_agent.name` | Card owner |
| `cards.pessoa_principal_id` → contatos | `payer.name/cpf/email` | Card contato |
| ~~`WC-{card_id[0:8]}`~~ | ~~`operation_id`~~ | **REMOVIDO** — Monde rejeita IDs não cadastrados |
| `monde_sale_items.id` | `external_id` (produto) | UUID do item |
| `monde_sale_items.supplier` | `supplier.name` | Item supplier |
| `cards.receita` | `commission_amount` | Distribuído proporcional |
| `proposal_items.item_type` | Tipo do produto | Proposal |
| `card_financial_items.product_type` | Tipo do produto | Financial item |
| `flight` (item_type) | `travel_packages` | airline_tickets ignorado |

---

## API V2 — People (Pessoas)

> **Referência:** https://github.com/monde-sistemas/monde-api
> **Adicionado em:** 2026-04-02

### Informações Gerais

| Campo | Valor |
|-------|-------|
| **URL Base** | `https://web.monde.com.br/api/v2` |
| **Autenticação** | JWT Token (1h validade) |
| **Formato** | JSON:API (`application/vnd.api+json`) |
| **Paginação** | `page[number]`, `page[size]` (padrão 50) |

### Autenticação V2

```
POST /api/v2/tokens
Content-Type: application/vnd.api+json
Accept: application/vnd.api+json

{
  "data": {
    "type": "tokens",
    "attributes": {
      "login": "admin@agencia.monde.com.br",
      "password": "senha"
    }
  }
}

→ Response: { "data": { "attributes": { "token": "JWT_TOKEN" } } }
```

Usar em todas as requests: `Authorization: Bearer JWT_TOKEN`

### Endpoints

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| GET | `/api/v2/people` | Listar pessoas (paginado) |
| GET | `/api/v2/people/:id` | Detalhar pessoa |
| POST | `/api/v2/people` | Criar pessoa |
| PATCH | `/api/v2/people/:id` | Atualizar pessoa |
| DELETE | `/api/v2/people/:id` | Deletar pessoa |

### Atributos de People

| Campo API | Tipo | Descrição |
|-----------|------|-----------|
| `name` | string | Nome completo (obrigatório) |
| `cpf` | string | CPF (11 dígitos) |
| `cnpj` | string | CNPJ (14 dígitos) |
| `rg` | string | RG |
| `email` | string | Email |
| `phone` | string | Telefone fixo |
| `mobile-phone` | string | Celular |
| `business-phone` | string | Telefone comercial |
| `birth-date` | date | Data nascimento (YYYY-MM-DD) |
| `gender` | string | `"male"` ou `"female"` |
| `passport-number` | string | Passaporte |
| `passport-expiration` | date | Validade passaporte |
| `kind` | string | `"individual"` ou `"company"` |
| `company-name` | string | Razão social |
| `observations` | string | Observações |
| `address` | string | Logradouro |
| `number` | string | Número |
| `complement` | string | Complemento |
| `district` | string | Bairro |
| `zip` | string | CEP |
| `website` | string | Website |
| `code` | number | Código numérico interno Monde |

### Mapeamento WelcomeCRM ↔ Monde V2

| contatos (CRM) | people (Monde) | Notas |
|-----------------|----------------|-------|
| `nome + sobrenome` | `name` | Concatenar (outbound) / Split (inbound) |
| `cpf_normalizado` | `cpf` | Só dígitos |
| `rg` | `rg` | Direto |
| `email` | `email` | Direto |
| `telefone` | `phone` / `mobile-phone` | Classificar por formato |
| `data_nascimento` | `birth-date` | ISO YYYY-MM-DD |
| `sexo` | `gender` | masculino↔male, feminino↔female |
| `passaporte` | `passport-number` | Direto |
| `passaporte_validade` | `passport-expiration` | ISO YYYY-MM-DD |
| `tipo_cliente` | `kind` | PF↔individual, PJ↔company |
| `observacoes` | `observations` | Direto |
| `endereco` (JSONB) | `address`, `number`, `complement`, `district`, `zip` | Flatten/nest |
| `monde_person_id` | `id` | UUID retornado pela API |

### Edge Functions

| Function | Direção | Descrição |
|----------|---------|-----------|
| `monde-people-sync` | CRM → Monde | POST com `contato_id` ou `contato_ids`. Cria/atualiza pessoa no Monde. |
| `monde-people-import` | Monde → CRM | Busca pessoas paginado, upsert em contatos com dedup (monde_id → CPF → email). |

### Credenciais V2

| Tipo | Chave | Onde |
|------|-------|------|
| Secret | `MONDE_V2_LOGIN` | Supabase env (fallback: `MONDE_USERNAME`) |
| Secret | `MONDE_V2_PASSWORD` | Supabase env (fallback: `MONDE_PASSWORD`) |
| Setting | `MONDE_V2_API_URL` | `integration_settings` |
| Setting | `MONDE_V2_SYNC_ENABLED` | `integration_settings` (`true`/`false`) |
| Setting | `MONDE_V2_SYNC_DIRECTION` | `integration_settings` (`bidirectional`/`outbound_only`/`inbound_only`) |
