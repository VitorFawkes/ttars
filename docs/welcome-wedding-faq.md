# Welcome Weddings - Guia do Funil e da Operação

## Sobre a Welcome Weddings

A Welcome Weddings é a divisão de destination wedding do grupo Welcome. Planeja e executa casamentos em destinos nacionais e internacionais desde 2012, com mais de 650 casamentos em 20+ países.

**Nosso perfil:**
- Destination wedding premium — Caribe, Maldivas, Nordeste BR, Mendoza, Europa
- Não há pacotes fechados: cada casamento é desenhado do zero
- Atendemos casais classe AB, ticket alto, ciclo de planejamento 6-18 meses
- Integração com Welcome Trips para lua de mel (quando o casal demonstra interesse)

---

## O funil de Weddings (2026-04-22)

O funil tem **16 etapas** divididas em 3 macro-áreas + resolução, com 3 donos diferentes por fase.

### Princípio fundamental

**Etapa é marco verificável, não estado contínuo.** Follow-up, "em conversa", "tentativa de contato" são ações do vendedor — não viram etapa. Cada etapa representa um fato detectável que muda o status do cliente.

### Área 1 — Descoberta & Qualificação (SDR)

Dono: **SDR** (humano ou Estela IA)

| # | Etapa | O que significa |
|---|-------|-----------------|
| 1.1 | Novo Lead | Lead chegou (site, Instagram, indicação, form) — ninguém conversou ainda |
| 1.2 | Conectado | Casal respondeu pelo menos uma vez, conversa de qualificação rodando |

O card sai de "Conectado" direto pra "Reunião Agendada" (fase Closer) quando o SDR qualifica e agenda a videoconferência com o Closer. Se não qualifica, vai pra Perdido.

### Área 2 — Closer

Dono: **Closer** (vendedor sênior)

| # | Etapa | Marco |
|---|-------|-------|
| 2.1 | Reunião Agendada ⭐ | Videoconferência marcada no calendário (ganho SDR — `ww_sdr_qualificada`) |
| 2.2 | Apresentação Feita | Reunião de diagnóstico aconteceu |
| 2.3 | Proposta | Proposta construída e enviada (`ww_proposta`) |
| 2.4 | Negociação | Casal pediu ajustes ou está em objeção |
| 2.5 | Contrato Assinado ⭐ | Contrato + sinal pagos (ganho Closer — `ww_contrato_assinado`) |

### Área 3 — Planejamento & Realização

Dono: **Wedding Planner** (pessoa diferente do Closer)

| # | Etapa | O que significa |
|---|-------|-----------------|
| 3.1 | Boas-vindas & Questionário | Kit de onboarding + questionário profundo |
| 3.2 | Concepção | Conceito, paleta, mood, estilo definidos |
| 3.3 | Fornecedores em Contratação | Venue, buffet, foto, vídeo, DJ, decor, flores, bolo, cerimonialista |
| 3.4 | Convidados & Logística | Lista fechando, RSVP abrindo, hospedagem e transfer |
| 3.5 | Pré-evento (últimos 60 dias) | Cronograma, ensaio, logística dia D |
| 3.6 | Casamento Realizado ⭐ | Cerimônia aconteceu (`ww_casamento_realizado`) |
| 3.7 | Pós-casamento | Fotos/vídeos entregues, NPS coletado, lua de mel cross-Trips se aplicável |

### Área 4 — Resolução

| # | Etapa | Quando |
|---|-------|--------|
| 4.1 | Perdido | Saiu antes de assinar contrato (com motivo de perda) |
| 4.2 | Cancelado | Contrato assinado mas casamento não vai acontecer (noivado desfeito, força maior) |

**Não existe "Pausado".** Se casal suspende, fica com o Wedding Planner e o dono avalia caso a caso.

---

## Regras da operação

### Taxa — não existe
A Welcome Weddings **não cobra taxa de qualificação ou consultoria SDR**. O primeiro pagamento do casal já é o sinal do contrato (ao fechar com o Closer). Isso difere da Welcome Trips (que cobra taxa SDR).

### Reunião SDR — não existe como etapa
O SDR qualifica **na própria conversa** (WhatsApp, Instagram, DM). Não há reunião formal com SDR. A primeira reunião formal do casal já é com o **Closer** (etapa 2.1).

### Handoff entre donos — troca automática
Cada fase tem dono diferente. Quando o card muda de fase, o dono muda:
- SDR entrega pra Closer ao mover pra "Reunião Agendada"
- Closer entrega pra Wedding Planner ao mover pra "Boas-vindas & Questionário" (depois do Contrato Assinado)

### Campos obrigatórios para avançar

Campos que bloqueiam transição quando vazios:

| Etapa | Campos obrigatórios pra próxima |
|-------|----------------------------------|
| Conectado → Reunião Agendada | Destino + Qualificado + Data da reunião |
| Apresentação Feita → Proposta | Como foi a reunião |
| Proposta → Negociação | Link da proposta |
| Negociação → Contrato Assinado | Valor do contrato |
| Concepção → Fornecedores | Conceito + Estilo |
| Convidados & Logística → Pré-evento | Nº convidados final |

Admin pode alterar obrigatórios via Pipeline Studio (`/admin/pipeline/structure`).

---

## Ficha do cliente (campos)

Os campos aparecem por etapa — não poluem tela. Todos com prefixo `ww_`.

### Qualificação (SDR)
- Identificação: nome do(a) noivo(a) 2, canal de origem
- Sonho: data do casamento / previsão, destino, tipo de casamento, convidados, visão do casamento
- Dinheiro: orçamento, teto de orçamento, quem financia, faixa de orçamento
- Sinais: viagem internacional recente, referência a casamento premium, motivação, flexibilidade
- Qualificação: qualificado sim/não, motivo

### Fechamento (Closer)
- Reunião: como foi, link da reunião, segunda reunião?
- Proposta: link da proposta, valor do contrato, link do Asaas
- Fechamento: data do ganho, Monde venda

### Planejamento (Wedding Planner)
- Concepção: conceito, paleta de cores, estilo, link do moodboard
- Fornecedores (9 categorias com status pendente/negociando/contratado): venue, buffet, fotografia, vídeo, DJ, decoração, flores, bolo, cerimonialista
- Convidados: nº final, abertura e fechamento do RSVP, confirmados, link da hospedagem, transfer contratado?
- Pré-evento: link do cronograma, data do ensaio, ensaio realizado, checklist final
- Pós-casamento: data realizada, fotos e vídeo entregues, NPS, nota NPS, interesse em lua de mel

### Flag cross-produto
- `ww_plan_lua_de_mel_interesse` → sinaliza interesse em lua de mel com Welcome Trips. Não abre card automático — o time Trips é notificado e decide o engajamento.

---

## Papéis e IAs

### Estela — SDR IA
- Atende o primeiro contato no WhatsApp, qualifica e agenda a reunião com o Closer
- Inativa até admin ligar (`ai_agents.ativa = false`)
- Mais detalhes: `memory/estela-sdr-weddings-implementation.md`

### Amélia — Convidados
- Cuida de RSVP e hospedagem de convidados (não é SDR)
- Ativa há 70+ dias em produção

### Wedding Planner (humana)
- Profissional sênior que recebe o handoff do Closer depois do Contrato Assinado
- Acompanha da etapa 3.1 (Boas-vindas) até 3.7 (Pós-casamento)

---

## Referências técnicas

- **Pipeline ID:** `f4611f84-ce9c-48ad-814b-dcd6081f15db`
- **Org Welcome Weddings:** `b0000000-0000-0000-0000-000000000002`
- **Seção da ficha:** `wedding_info` (única seção, contém todos os campos `ww_*`)
- **Widget da ficha:** `WeddingInformation.tsx`
- **Migrations do rebuild:**
  - `20260422c_wedding_funnel_rebuild.sql` — etapas, fases, remapeamento dos 829 cards
  - `20260422d_wedding_planning_fields.sql` — 29 campos novos de planejamento
  - `20260422e_wedding_stage_configs.sql` — visibilidade e obrigatórios por etapa
