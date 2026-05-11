# Travel Planner — Redesign Greenfield (Welcome Trips)

> Escopo deste documento: redesign do Travel Planner especificamente para a **Welcome Trips** (uma das orgs do WelcomeCRM, isolada da Welcome Weddings após o Org Split).
>
> Termos usados:
> - **Travel Planner (TP)** — quem desenha a viagem. No banco, é quem está na fase `planner` do pipeline.
> - **Pós-Venda (PV)** — quem cria e mantém a página da viagem, vouchers e operação. No banco, é a fase `pos_venda`.
>
> Assume que **nada do código atual de propostas/portal está em uso real** e desenha a arquitetura correta, reaproveitando apenas o que é genuinamente inteligente (fases do pipeline, roteamento automático, RLS, briefing IA) e descartando o resto.
>
> _Última atualização: 2026-04-14_

---

## 1. Princípios

1. **Uma viagem é uma entidade viva, não uma sequência de documentos.** Proposta e página da viagem são a mesma coisa em estados diferentes do ciclo.
2. **O card é o lugar único para os dois papéis.** TP trabalha na aba "Proposta"; PV trabalha na aba "Página da Viagem". Cada um tem sua superfície de edição, mas ambos veem o que o outro faz.
3. **O cliente tem um link só que evolui.** A mesma URL muda de cara conforme o estado da viagem.
4. **Não há "publicar".** Visibilidade é consequência do estado do item, não de um botão.
5. **Inteligência é padrão, não feature.** IA propõe rascunho, sugere reuso, transcreve voucher.
6. **Mobile-first para o cliente, desktop-first para TP e PV.**
7. **Cliente não paga pela página.** Pagamento é conversa humana, fora da página.
8. **Toda edição registra autor e papel.** Quando dois papéis editam a mesma viagem, histórico é obrigatório.

---

## 2. Modelo mental

O objeto central é a **Viagem**. Uma viagem pertence a um card e tem itens. Cada item (hotel, voo, transfer, dia, passeio, dica, voucher) tem:

- um **tipo**
- um **status** no ciclo de vida
- uma **camada comercial** (o que o cliente vê quando está decidindo)
- uma **camada operacional** (o que o cliente vê depois de aprovar — voucher, reserva, contato)
- uma **camada de alternativas** (quando há opções para o cliente escolher entre A ou B — exceção, não regra; a Welcome Trips faz curadoria, não catálogo)
- **comentários** (thread aberta entre cliente e quem está conduzindo)
- **autoria** (quem criou, quem editou por último, em que papel)

Ciclo de vida do item:

```
rascunho ─► proposto ─► aprovado ─► operacional ─► vivido ─► arquivado
              │                                        │
              └──► recusado (volta pro TP)             └──► (pós-viagem)
```

### Handoff TP → PV

A passagem de bastão é **automática e disparada pelo aceite do cliente**:

- Antes do aceite (`viagens.estado` em `desenho`/`em_recomendacao`/`em_aprovacao`): **só TP edita.** PV não vê a viagem ainda na sua fila.
- No aceite (`em_aprovacao → confirmada`): card transita para a fase `pos_venda` (mecanismo do `pipeline_stages.target_phase_id` já existente). PV passa a ser dono da operação.
- Após o aceite: **PV edita tudo** (inclusive a camada comercial, se precisar trocar hotel, ajustar passeio etc), com histórico de autoria. **TP continua tendo acesso de leitura** à página da viagem — sabe o que está sendo entregue ao cliente, pode comentar internamente, mas não edita.

---

## 3. Modelo de dados

### 3.1 `viagens`

Substitui `proposals` + `proposal_trip_plans`. Uma viagem por card.

```
viagens
───────
id                 uuid PK
card_id            uuid FK → cards(id)  (única — 1 card ↔ 1 viagem)
org_id             uuid NOT NULL DEFAULT requesting_org_id()
public_token       text unique
estado             enum (desenho, em_recomendacao, em_aprovacao,
                          confirmada, em_montagem, aguardando_embarque,
                          em_andamento, pos_viagem, concluida)
tp_owner_id        uuid     -- espelha cards.vendas_owner_id
pos_owner_id       uuid     -- espelha cards.pos_owner_id
titulo, subtitulo
capa_url
total_estimado     decimal   (computado por trigger a partir dos itens)
total_aprovado     decimal
enviada_em         timestamptz
confirmada_em      timestamptz
created_at, updated_at
```

`viagens.estado` para os estados pós-aceite é **derivado** de `cards.stage_id` (quando o card está em fase `pos_venda`), não fonte primária. O cron `fn_roteamento_pos_venda_trips` continua sendo o motor que move o card entre etapas operacionais; o `estado` da viagem reflete isso.

### 3.2 `trip_items`

Tabela única, substitui `proposal_items`, `proposal_sections`, `proposal_options`, `trip_plan_blocks`.

```
trip_items
──────────
id                  uuid PK
viagem_id           uuid FK → viagens(id)
org_id              uuid NOT NULL DEFAULT requesting_org_id()
parent_id           uuid FK → trip_items(id) nullable  (árvore)
tipo                enum (dia, hotel, voo, transfer, passeio, refeicao,
                          seguro, dica, voucher, contato, texto, checklist)
status              enum (rascunho, proposto, aprovado, recusado,
                          operacional, vivido, arquivado)
ordem               int
comercial           jsonb   (titulo, descricao, fotos[], preco, destaque, ...)
operacional         jsonb   (voucher_url, numero_reserva, checkin_em,
                             checkout_em, endereco, telefone, ...)
alternativas        jsonb   (array de {id, titulo, preco, comercial, escolhido_em})
aprovado_em         timestamptz
aprovado_por        text    (client|tp|pv)
criado_por          uuid
criado_por_papel    text    (tp|pv)
editado_por         uuid
editado_por_papel   text    (tp|pv)
created_at, updated_at, deleted_at
```

**Por que JSONB nas camadas?** Cada tipo tem campos diferentes; estruturar em colunas força tabelas por tipo. JSONB mantém 1 tabela, com schemas validados no app. Permite evoluir sem migration.

### 3.3 `trip_item_history`

Snapshot a cada edição. Substitui `proposal_versions`, sem o overhead.

```
trip_item_history
─────────────────
id                uuid PK
item_id           uuid FK → trip_items(id)
viagem_id         uuid
org_id            uuid NOT NULL DEFAULT requesting_org_id()
autor             uuid
papel             text    (tp|pv|sistema)
campo             text    (comercial|operacional|status|alternativas|...)
valor_anterior    jsonb
valor_novo        jsonb
created_at        timestamptz
```

Resposta a "audit completo por campo vs snapshot por edição" fica como decisão aberta — o schema acomoda os dois.

### 3.4 `trip_comments` e `trip_events`

```
trip_comments
─────────────
id, item_id (nullable — comentário de viagem inteira),
viagem_id, org_id, autor (client|tp|pv),
autor_id, texto, interno bool, created_at
```

Comentário **interno** (`interno=true`) só TP/PV veem entre si. Cliente não vê.

```
trip_events
───────────
id, viagem_id, org_id, tipo, payload jsonb, created_at
   tipos: aberta, item_visto, item_escolhido, item_aprovado,
          comentario_cliente, voucher_adicionado,
          handoff_tp_pv, viagem_iniciada, ...
```

`trip_events` é a fonte única de tracking. Substitui `proposal_events`. Alimenta timeline e notificações.

### 3.5 Biblioteca

`trip_library_items` (renomeação de `proposal_library`). Vive no workspace Welcome Trips. Item vendido N vezes vira bloco reutilizável.

### 3.6 O que some do schema atual

| Tabela atual | Destino |
|---|---|
| `proposals` | Fundida em `viagens` |
| `proposal_versions` | **Deletar.** `trip_item_history` substitui com mais granularidade. |
| `proposal_sections` | **Deletar.** Agrupamento é `tipo=dia` em `trip_items`. |
| `proposal_items` | Migrado pra `trip_items` |
| `proposal_options` | Fundida em `trip_items.alternativas` (JSONB) |
| `proposal_client_selections` | **Deletar.** Escolha é `trip_items.status=aprovado` + `alternativas[].escolhido_em` |
| `proposal_trip_plans` | Fundida em `viagens` |
| `trip_plan_blocks` | Migrado pra `trip_items` |
| `trip_plan_approvals` | **Deletar.** Aprovação é transição de status no item. |
| `proposal_events` | Migrado pra `trip_events` |
| `proposal_templates` | Simplificado: templates viram viagens com `estado=template` |

---

## 4. Máquina de estados

### 4.1 Estado da viagem

```
desenho ────────► em_recomendacao ────────► em_aprovacao
   (TP)             (TP envia)               (cliente abriu)
                                                    │
                                                    ▼
                                            ╔═══════════════╗
                                            ║  CONFIRMADA   ║  ◄── handoff TP → PV
                                            ╚═══════════════╝       (card vai pra fase pos_venda)
                                                    │
                                                    ▼
                                              em_montagem
                                       (PV monta página, vouchers)
                                                    │
                                                    ▼
                                            aguardando_embarque
                                          (>30 dias / ≤30 dias)
                                                    │
                                                    ▼
                                              em_andamento
                                          (viajante na rua)
                                                    │
                                                    ▼
                                              pos_viagem
                                                    │
                                                    ▼
                                              concluida
```

### 4.2 Quem dispara cada transição

| De → Para | Quem | Como |
|-----------|------|------|
| `desenho → em_recomendacao` | TP | Botão "Enviar ao cliente" no builder |
| `em_recomendacao → em_aprovacao` | Sistema | Cliente abre o link pela primeira vez |
| `em_aprovacao → confirmada` | Cliente | Tap em "Confirmar minha viagem" |
| `confirmada → em_montagem` | Sistema | Trigger ao mudar `cards.stage_id` para etapa "App & Conteúdo" (handoff acionado pelo `target_phase_id` do stage) |
| `em_montagem → aguardando_embarque` | Sistema | Cron `fn_roteamento_pos_venda_trips` (já existe): condições de readiness atendidas |
| Subdivisão >30d / ≤30d | Sistema | Mesmo cron, baseado em `data_exata_da_viagem` |
| `aguardando_embarque → em_andamento` | Sistema | Mesmo cron, ao chegar a data |
| `em_andamento → pos_viagem` | Sistema | Mesmo cron, após a data de retorno |
| `pos_viagem → concluida` | Sistema | Cron, X dias após o retorno |

**Reaproveitamento crítico:** `fn_roteamento_pos_venda_trips` já existe, é diário, funciona. Não duplicar — só consumir. O `viagens.estado` é uma view computada a partir do `cards.stage_id` quando o card está em fase Pós-Venda.

### 4.3 Regra de visibilidade

- Cliente **nunca** vê item em `rascunho`
- Camada comercial aparece em `proposto+`
- Camada operacional aparece em `operacional+`
- **Elimina o botão "publicar"** — visibilidade é consequência do status

---

## 5A. Experiência do Travel Planner

### 5A.1 Onde vive

Aba **"Proposta"** dentro do card. Sem tela separada, sem builder em outra rota.

### 5A.2 Layout (desktop)

```
┌─────────────────────────────────────────────────────────────────┐
│ [Header: Paris Romântico · 7 dias · R$ 24k · em_aprovacao]     │
├──────────────┬────────────────────────────────┬─────────────────┤
│              │                                │                 │
│  ÁRVORE      │    EDITOR DO ITEM SELECIONADO  │   PREVIEW       │
│              │                                │   (iframe do    │
│  ▾ Dia 1     │    [aba] Comercial             │   /v/:token     │
│    Hotel ✅  │    [aba] Comentários (2)       │   mobile mock)  │
│    Jantar 🕐 │    [aba] Operacional (👁 só ler)│                 │
│  ▾ Dia 2     │                                │   Reflete o     │
│    Passeio   │    Foto, título, descrição,    │   estado atual  │
│  + add dia   │    preço, alternativas...      │   do cliente    │
│              │                                │                 │
│  [Biblioteca]│                                │                 │
│  [Timeline]  │                                │                 │
└──────────────┴────────────────────────────────┴─────────────────┘
```

Três painéis sempre visíveis. Operacional fica em modo leitura quando a viagem ainda não foi aceita (porque ainda não existe operação; PV nem entrou).

### 5A.3 Funcionalidades-chave

**Árvore (esquerda):**
- Drag-and-drop (dnd-kit) para reordenar dias e itens
- Ícones de status (rascunho cinza / proposto azul / aprovado verde / operacional roxo)
- "+ adicionar" sempre visível
- Biblioteca como gaveta lateral: busca + arrastar item pronto
- Timeline cronológica de eventos (cliente abriu, aprovou X, comentou Y)

**Editor (centro):**
- **Comercial** — foto, descrição curta, preço, alternativas. É a superfície principal do TP.
- **Comentários** — thread por item entre cliente e TP (e PV depois do aceite, se for o caso)
- **Operacional** — só leitura para o TP; aparece preenchido pelo PV pós-aceite
- Preço atualiza total no header em tempo real
- Botão "salvar na biblioteca" promove item reutilizável

**Preview (direita):**
- Iframe real de `/v/:token?as=client` em mobile mock
- Reflete o estado exato que o cliente veria agora
- Botão "abrir em nova aba", "copiar link"
- Botão "enviar ao cliente" → dispara WhatsApp pré-formatado

### 5A.4 IA no TP

- **Primeiro rascunho:** clica "gerar" → Claude usa o briefing do card (extração IA já existe via n8n) + biblioteca da Trips → monta árvore inicial
- **Sugestão inline:** ao adicionar "Hotel em Paris 15-17 jul" → biblioteca + SerpAPI ranqueado por orçamento/perfil
- **Resposta a comentário:** cliente comenta "tem vista pro mar?" → IA sugere ao TP resposta + ação (criar alternativa, reservar com vista, etc.)

### 5A.5 Ações principais do TP

- Construir e iterar a viagem
- Enviar ao cliente
- Acompanhar abertura, escolhas, comentários
- Ajustar baseado em feedback
- Marcar como aceito (gatilho do handoff — embora normalmente o aceite seja do próprio cliente)

---

## 5B. Experiência do Pós-Venda

### 5B.1 Onde vive

Aba **"Página da Viagem"** dentro do card. **Aparece habilitada apenas quando `viagens.estado >= confirmada`.** Antes disso, fica oculta ou cinza com texto "aguardando aceite".

### 5B.2 Layout (desktop)

Mesmo layout 3 painéis, com semântica diferente:

```
┌─────────────────────────────────────────────────────────────────┐
│ [Header: Paris Romântico · em_montagem · embarca em 47d]       │
├──────────────┬────────────────────────────────┬─────────────────┤
│              │                                │                 │
│  ÁRVORE      │    EDITOR DO ITEM SELECIONADO  │   PREVIEW       │
│              │                                │   da página     │
│  ▾ Dia 1     │    [aba] Operacional ⬅ default │   da viagem     │
│    Hotel ✅  │    [aba] Comentários           │                 │
│    Voucher❗ │    [aba] Comercial (✏️ editável)│   Mostra exato │
│  ▾ Dia 2     │                                │   o que cliente │
│    Passeio   │    Voucher PDF: [upload]       │   vê AGORA      │
│  + add bloco │    Nº reserva, check-in,       │                 │
│              │    endereço, telefone...       │                 │
│  [Inbox]     │                                │                 │
│  [Timeline]  │                                │                 │
└──────────────┴────────────────────────────────┴─────────────────┘
```

### 5B.3 Funcionalidades-chave

**Árvore (esquerda):**
- Mesma estrutura, mas ícones de prioridade aparecem (voucher pendente, bloco operacional incompleto, alteração solicitada)
- Pode adicionar blocos novos pós-venda (dica de restaurante, contato local, checklist pré-embarque)

**Editor (centro):**
- **Operacional** é a aba padrão. Voucher (upload PDF), número de reserva, check-in, endereço, telefone, observações
- **Comentários** — thread com cliente e internos com TP
- **Comercial** — totalmente editável pelo PV (com histórico). Útil quando precisa trocar hotel, ajustar passeio etc.

**Inbox (gaveta):**
- Vouchers pendentes (itens aprovados sem voucher)
- Alterações solicitadas pelo cliente
- Próximos embarques (alerta <48h sem operacional completo)
- Comentários do cliente sem resposta

**Preview (direita):**
- Mesmo iframe da página do cliente, refletindo o estado atual

### 5B.4 IA no PV

- **Extração de voucher:** upload PDF → Claude extrai nº reserva, datas, endereço, telefone → preenche operacional automático (`voucher_extractions` já existe, expandir)
- **Sugestão de comunicação pré-embarque:** template inteligente "faltam 7 dias" / "faltam 24h" baseado nos itens da viagem
- **Alerta de pendência:** voucher faltando + embarque próximo → notificação pré-formatada

### 5B.5 Audit visível

Cada item tem um "rodapé" mostrando última edição: "Editado por Mariana (PV) há 2h • histórico". Clica em histórico → drawer com timeline de mudanças do `trip_item_history`.

---

## 6. Experiência do cliente

### 6.1 Um único link

`/v/:token` — uma só URL pra toda a vida da viagem. Sem `/p/:token`, sem `/review`, sem `/confirmed`. A página muda conforme o estado.

### 6.2 PWA instalável

Primeiro acesso mobile propõe "adicionar à tela de início" (iOS/Android). Vouchers ficam em cache offline para consulta durante a viagem.

### 6.3 Camadas visuais por estado

**`em_recomendacao` / `em_aprovacao` — "modo decisão":**

```
┌──────────────────────────┐
│  PARIS ROMÂNTICO         │
│  7 dias · Julho 2026     │
│  [foto de capa]          │
│                          │
│  "Uma semana que desenhei│
│   pensando em vocês..."  │
│   — Luisa, sua Travel    │
│     Planner              │
├──────────────────────────┤
│  Dia 1 · 15/jul          │
│   ┌────────────────────┐ │
│   │ 🏨 Hotel Le Bristol│ │
│   │ [foto]             │ │
│   │ R$ 4.200           │ │
│   │ [ Detalhes ]       │ │
│   └────────────────────┘ │
│   ┌────────────────────┐ │
│   │ OU                 │ │
│   │ 🏨 Hotel Plaza     │ │
│   │ R$ 3.100           │ │
│   └────────────────────┘ │
│   [✓ Escolher esta]      │
├──────────────────────────┤
│  Dia 2 · 16/jul          │
│   🍽 Jantar no Le Jules │
│   [Aprovar] [Comentar]  │
├──────────────────────────┤
│  [💬 Falar com Luisa]    │
│  Total parcial: R$ 18.4k│
│  [Confirmar minha viagem]│
└──────────────────────────┘
```

- Timeline cronológica
- Itens com alternativas mostram cards comparáveis; 1 toque escolhe
- Itens únicos: aprovar com ✓
- Comentário em qualquer item (thread)
- "Falar com [TP]" sempre visível
- Total dinâmico no rodapé
- "Confirmar viagem" final dispara `confirmada` e o handoff TP → PV

**`confirmada` / `em_montagem` — "modo preparação":**

- Mesma URL, header muda: "Sua viagem está confirmada 🎉"
- Mensagem: "A partir de agora, **Mariana (Pós-Venda)** vai cuidar dos detalhes operacionais"
- Vouchers aparecem conforme PV adiciona
- Seção "Antes de embarcar" (checklist documentos, moeda, vistos)
- "Falar com" passa a apontar pra Mariana (PV)
- TP fica disponível como contato secundário ("Falar com Luisa que desenhou sua viagem")

**`aguardando_embarque` — contagem regressiva:**

- Banner "embarca em X dias"
- Lista do que ainda falta confirmar (do lado cliente: documento, app, etc)

**`em_andamento` — "modo viagem":**

- Banner "HOJE" fixo no topo
- Próximo evento em destaque ("Check-in no Le Bristol em 3h")
- Contatos de emergência (PV, plantão) a 1 toque
- Vouchers 100% cacheados offline
- "Compartilhar fotos com a Welcome" opcional

**`pos_viagem` / `concluida` — "memória":**

- Página vira álbum leve
- "Como foi sua viagem?" (NPS simples)
- Permanece acessível indefinidamente

### 6.4 O que o cliente NÃO vê

- Botão de pagamento (fica fora da página)
- Formulários longos
- Termos escondendo CTA (aceite simples no botão Confirmar)
- Login, cadastro
- Status internos (rascunho, operacional — semântica do back-office)
- Comentários internos entre TP e PV (`interno=true`)
- A distinção entre TP e PV se a viagem está antes do aceite (vê só "Luisa, sua Travel Planner")

---

## 7. Inteligência aplicada

### 7.1 IA por papel

| Papel | Onde | O que faz |
|-------|------|-----------|
| TP | Gerar rascunho | Claude recebe briefing do card + biblioteca → árvore inicial |
| TP | Busca inline | "Hotel em Paris" → biblioteca + SerpAPI ranqueado |
| TP | Resposta a comentário | Cliente comentou X → sugestão de resposta + ação |
| PV | Voucher PDF → operacional | Extrai nº reserva, datas, endereço, telefone |
| PV | Comunicação pré-embarque | Template de mensagem (-7d, -24h) baseado nos itens |
| PV | Alerta de pendência | Voucher faltando + embarque próximo → notificação pronta |

### 7.2 Automação (n8n)

- WhatsApp ao cliente em transições-chave:
  - TP envia viagem → mensagem com link
  - PV adiciona voucher importante → "novo voucher disponível"
  - Faltam <48h e tem pendência → alerta interno ao PV
- Briefing IA continua sendo extraído de conversas (pipeline atual já funciona)

### 7.3 Comentário como feature central

Comentários por item, com notificação cruzada. Cliente comenta → quem está conduzindo (TP antes do aceite, PV depois) recebe no card. Substitui o fluxo frágil de "aprovações" do sistema atual.

---

## 8. Infraestrutura

### 8.1 Reutilizar (é inteligente)

- **`pipeline_phases` + `pipeline_stages.target_phase_id`** — handoff TP → PV sai de graça
- **`OwnerSelector`** filtrando por `phaseSlug` — reusar
- **`fn_roteamento_pos_venda_trips`** (cron diário) — motor de transições pós-aceite
- **`usePosVendaAlert`** — alertas ao PV
- **RLS por token** no cliente anônimo
- **`requesting_org_id()` + multi-tenant** — não mexer
- **Smart types** (`flexible_date`, `smart_budget`) no card
- **Briefing IA via n8n + Claude** — pipeline testado
- **`provider_cache`** (SerpAPI hotel) — aumentar TTL pra 7d
- **dnd-kit** pra drag-and-drop
- **Supabase Storage** pra vouchers/fotos
- **Abas dinâmicas via `stage_field_config`**
- **Tabela `activities`** (insert-only) para audit não-granular

### 8.2 Reescrever do zero

- Schema completo de proposta/portal → `viagens` + `trip_items` + `trip_comments` + `trip_events` + `trip_item_history`
- Toda UI de builder (V4, V5, PortalEditor, ProposalBuilderElite) → abas Proposta + Página da Viagem no card
- Todas páginas públicas (`ProposalView`, `ProposalReview`, `ProposalConfirmed`, `TripPortalPublic`) → uma página `/v/:token`
- Modal de aceite (`AcceptProposalModal`) → inline no botão Confirmar
- Sistema de aprovações (`trip_plan_approvals`) → transição de status + comentários
- Página `/proposals` (listagem) → não precisa, viagens vivem no card

### 8.3 Adicionar

- Tabela `trip_item_history` + colunas de autoria (`criado_por`, `editado_por`, papel)
- Motor de estado da viagem (DB functions + triggers)
- PWA manifest + service worker para o cliente
- Web push para PV (inicial: WhatsApp via n8n; depois: push real)
- Extrator de voucher IA (expandir `voucher_extractions`)
- Thread de comentários com Realtime do Supabase
- Drawer de histórico no editor de item

### 8.4 Multi-tenant e isolamento

Welcome Trips é uma org isolada (Org Split). **Tudo vive no workspace Trips.** Welcome Weddings é outra org e nesse desenho não é tocada.

Padrão obrigatório em todas as tabelas novas:
```sql
org_id UUID NOT NULL DEFAULT requesting_org_id() REFERENCES organizations(id)
```

RLS padrão em toda tabela nova:
```sql
CREATE POLICY tabela_org_all ON tabela TO authenticated
  USING (org_id = requesting_org_id())
  WITH CHECK (org_id = requesting_org_id());
CREATE POLICY tabela_service_all ON tabela TO service_role
  USING (true) WITH CHECK (true);
```

**Cuidados específicos:**
- `viagens.card_id` → `cards`: trigger garante mesmo `org_id` (FK cross-org é bomba conhecida — ver CLAUDE.md "FK cross-org = bomba")
- `trip_items.viagem_id` → `viagens`: idem trigger
- `trip_item_history.item_id` → `trip_items`: idem
- `trip_comments`, `trip_events`: idem para `viagem_id`

**Acesso público do cliente** (`/v/:token`):
- Cliente é anônimo (sem `requesting_org_id()` no JWT)
- RPCs `SECURITY DEFINER` validam `public_token` e fazem bypass de RLS controlado
- Padrão: `get_viagem_by_token`, `aprovar_item`, `escolher_alternativa`, `comentar_item` — todos validam o token e operam com `org_id` derivado da viagem

**Biblioteca e templates:**
- `trip_library_items.org_id` = workspace Welcome Trips
- Compartilhada entre todos os Travel Planners da Trips
- Decisão "pessoal vs empresa vs híbrido" (ver §11) ainda aberta — schema acomoda os três via campo `is_shared`

---

## 9. Roadmap

5 marcos, ~16 semanas. Os 3 primeiros são sequenciais; 4 e 5 podem rodar em paralelo.

### Marco 1 — Fundação (3 semanas)
**Objetivo:** modelo de dados novo + motor de estado + audit, sem UI ainda.

- Migrations: `viagens`, `trip_items`, `trip_comments`, `trip_events`, `trip_item_history`
- Triggers: transição de estado da viagem, transição de item, totalização, FK cross-org guard
- Integração com `fn_roteamento_pos_venda_trips` (estado pós-aceite derivado de `cards.stage_id`)
- RPCs públicas: `get_viagem_by_token`, `aprovar_item`, `escolher_alternativa`, `comentar_item`
- RLS policies (regra de ouro: nunca `USING (true)` para `authenticated`)
- Testes: state machine + audit coverage

### Marco 2 — Cliente (3 semanas)
**Objetivo:** página `/v/:token` funcional em todos os estados.

- Rota única
- Componentes por estado (decisão, preparação, contagem regressiva, viagem, memória)
- PWA manifest + service worker
- Cache offline de vouchers e contatos
- Thread de comentários com Realtime
- Mobile-first; desktop responsivo
- Seed para QA em cada estado

### Marco 3A — Travel Planner (3 semanas)
**Objetivo:** aba "Proposta" no card.

- Nova aba no `CardDetail`
- Layout 3 painéis (árvore + editor + preview)
- Sub-abas Comercial / Comentários / Operacional (read-only)
- Biblioteca integrada (gaveta)
- Timeline de eventos
- "Enviar ao cliente" com WhatsApp pré-formatado

### Marco 3B — Pós-Venda (3 semanas)
**Objetivo:** aba "Página da Viagem" no card + inbox.

- Nova aba no `CardDetail`, habilitada por `viagens.estado >= confirmada`
- Layout 3 painéis com ênfase em operacional
- Sub-abas Operacional / Comentários / Comercial (editável com histórico)
- Inbox do PV (vouchers pendentes, alterações, próximos embarques)
- Drawer de histórico no editor de item
- Integração com etapas operacionais já existentes (não duplicar)

### Marco 4 — Inteligência (2 semanas)
**Objetivo:** IA embarcada nos pontos-chave.

- TP: gerar rascunho, busca inline, sugestão de resposta
- PV: extrator de voucher, comunicação pré-embarque, alerta de pendência

### Marco 5 — Automação e polimento (2 semanas)
- WhatsApp em transições-chave (n8n)
- NPS pós-viagem
- Performance / Lighthouse cliente
- Remover código velho (rotas, componentes, tabelas substituídas)

---

## 10. O que será descartado (explicitamente)

- `src/pages/ProposalsPage.tsx`, `ProposalBuilderV4.tsx`, `ProposalBuilderElite.tsx`, `PortalEditor.tsx`, `ProposalView.tsx`, `ProposalReview.tsx`, `ProposalConfirmed.tsx`, `TripPortalPublic.tsx`
- `src/components/proposals/v5/` inteiro
- `src/components/proposals/AcceptProposalModal.tsx`
- Hooks exclusivos: `useProposalBuilder`, `useTripPlanEditor`, `useTripPlanBlocks`
- Tabelas: `proposal_versions`, `proposal_sections`, `proposal_options`, `proposal_client_selections`, `trip_plan_approvals`
- RPCs: `save_client_selection`, `resolve_portal_approval`
- Rotas públicas: `/p/:token`, `/p/:token/review`, `/p/:token/confirmed`

---

## 11. Decisões abertas (dependem do Vitor)

1. **Biblioteca** — pessoal do TP, da Welcome Trips toda, ou híbrido (acervo da empresa + favoritos do TP)?
2. **Comentários multi-passageiros** — quando a viagem é de casal/família, todos veem todos os comentários (anônimos)? Ou identificamos o autor (cookie + nome)?
3. **Templates por destino** — vamos curar templates ("Europa 10d romântico", "Maldivas 7d") ou IA sempre gera do zero a partir do briefing?
4. **TP pós-aceite** — depois do handoff, TP pode propor mudança no comercial (com aceite do PV) ou só PV mexe?
5. **Granularidade de audit** — `trip_item_history` registra cada campo individualmente ou snapshot do JSONB inteiro a cada edição?
6. **Data de corte do legado** — apagar tabelas/rotas antigas no fim do Marco 5 ou manter arquivadas por 1 ciclo?
7. **Histórico de viagens concluídas** — viram álbum permanente para o cliente, ou arquivam em X dias?
8. **Welcome Weddings** — depois que Trips estabilizar, replicamos o modelo lá ou tratamos cada produto com seu próprio desenho?

---

## 12. Resumo executivo em 8 linhas

- Escopo: Welcome Trips. Welcome Weddings fica fora.
- Dois papéis com handoff automático no aceite: **Travel Planner** desenha; **Pós-Venda** opera.
- **Uma viagem, uma entidade, uma árvore de itens com estado** — proposta e portal são o mesmo objeto em momentos diferentes.
- Cada papel tem sua aba no card; cliente tem um link só que evolui.
- **Reaproveita o que já é bom:** fases do pipeline, roteamento automático Pós-Venda, briefing IA, RLS, OwnerSelector.
- **Reconstrói o que é cruft:** schema de proposta/portal, builders V4/V5, PortalEditor, páginas públicas múltiplas.
- **Adiciona o que falta:** audit por autoria, PWA offline, IA embarcada, thread de comentários.
- ~16 semanas em 5 marcos, com Marco 3 dividido em TP e PV (independentes entre si após Marcos 1 e 2).
