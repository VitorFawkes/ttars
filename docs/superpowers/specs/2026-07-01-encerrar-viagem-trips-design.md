# Encerrar Viagem (TRIPS) — Design

**Data:** 2026-07-01
**Produto:** Welcome Trips (pipeline `c8022522-4a1d-411c-9387-efe03ca725ee`)
**Escopo:** Encerramento do ciclo de pós-venda na ÚLTIMA etapa de pós-venda ("Pós-viagem & Reativação", stage `2c07134a-cb83-4075-bc86-4750beec9393`).

---

## 1. Objetivo

Dar um fim explícito ao ciclo da viagem: quando a viagem acaba, o card deve poder ser **encerrado** e **sumir do funil** — por um botão manual agora, e por automação (NPS) numa fase futura. A ideia original do dono: "a última etapa de pós-venda envia o NPS; se o cliente responde, encerra; se não responde após alguns dias, encerra também; o card não fica mais visível no funil depois de encerrar."

Esta especificação cobre **a base**: o conceito de encerramento, o botão manual, a limpeza do acúmulo atual, e a correção de status travado. A camada de **envio automático do NPS + prazo + tratamento de nota baixa** fica para uma fase futura (via motor de automação já existente).

---

## 2. Descobertas verificadas (banco real, 2026-07-01)

Fonte: consultas diretas via REST (service_role) à produção e leitura de código/migrations.

### 2.1 A última etapa de pós-venda
- Fase `pos_venda` do TRIPS tem 6 etapas. A última do ciclo natural é **"Pós-viagem & Reativação"** (`2c07134a…`).
- Nessa etapa: **3.057 cards vivos** (não arquivados, não deletados). A tela mostra **138**.

### 2.2 Por que a tela mostra 138 (e não 3.057)
Não é teto de 1.000 (o funil TRIPS inteiro tem só **711** cards visíveis) nem arquivamento (só **22** arquivados na etapa). O motivo real:

O funil já esconde por padrão cards com pós-venda concluído. Filtro atual em `usePipelineCards.ts:358`:
```
status_comercial.eq.aberto OR (status_comercial.eq.ganho AND ganho_pos.eq.false)
```
- **2.919** cards na etapa têm `status='ganho' AND ganho_pos=true` → **já escondidos** (é o mecanismo de "encerrado" que existe hoje, sob o nome `ganho_pos`).
- **138** aparecem: **128 "aberto"** + **10 "ganho" com `ganho_pos=false`**.
- Reconciliação da divergência view×tabela: `view_cards_acoes` filtra `deleted_at IS NULL`; os ~939 "a mais" da tabela crua eram cards na lixeira.

### 2.3 Os 138 visíveis NÃO são reconquista — são viagens vendidas travadas em "aberto"
Das 128 "aberto" na etapa:
- **110 têm `ganho_planner=true`** (venda ganha no T. Planner).
- **121 têm produtos cadastrados** (`card_financial_items`) = os R$ 4 mi "Fechado" da coluna.
- Padrão confirmado: o consultor **fecha no T. Planner e arrasta pra Pós-Venda sem consolidar o status comercial** → o card fica fisicamente em Pós-Venda mas `status='aberto'`. Não é oportunidade em aberto; é viagem realizada com status travado.
- As 18 sem `ganho_planner`: 15 ainda têm venda real; só **2 são teste puro** ("CARD TESTE", "teste0005", sem produto).

### 2.4 Marcadores relevantes (modelo atual)
- `cards.status_comercial` ∈ {`aberto`, `ganho`, `perdido`}.
- `cards.ganho_sdr/ganho_planner/ganho_pos` (+ `_at`) = milestones de ganho por fase. `ganho_pos=true` = pós-venda concluído (hoje setado por `marcar_ganho` na fase pós e por import Monde).
- Guard `enforce_trips_ganho_pos_only_in_pos_viagem` (migration `20260429d`): `ganho_pos` só pode ser `true` quando o card está na etapa Pós-viagem — o que casa com o nosso escopo.
- `ganho`/`perdido` são STATUS, nunca etapas (regra arquitetural do projeto — ver `memory/feedback_perdido_ganho_sao_status.md`). **Não** criar etapa "Encerrada".

---

## 3. Decisões (confirmadas com o dono)

| Tema | Decisão |
|------|---------|
| Escopo | **Somente a última etapa de pós-venda** ("Pós-viagem & Reativação"). Nada fora dela. |
| Conceito "encerramento" | O marcador que tira do funil passa a se chamar **encerramento** em **tudo que é visível** (funil, botão, filtros, rótulos de relatório). **A coluna interna `ganho_pos`/`ganho_pos_at` NÃO é renomeada** (invisível ao usuário; renomeá-la obrigaria mexer em analytics de Weddings/Trips — risco desnecessário). Um conceito só, apelido técnico interno preservado. |
| Sumir do funil | **Hard-hide:** card encerrado some do funil **independente** de `aberto`/`ganho`. |
| Ao encerrar | Se a viagem **tem venda real** (produtos OU `ganho_planner=true`), **consolida como ganha** (corrige o status travado). Sem venda → encerra sem marcar ganho. |
| Encerramento imediato (backfill) | Encerrar **as viagens na etapa cuja viagem terminou há 15+ dias** = **101 cards** (97 com venda → consolidam ganho; 4 sem venda → encerram sem ganho). Lista auditável em `docs/encerrar-viagens-trips-101.csv` / `.html`. |
| Cards de teste | **2 cards** de teste puro sem venda ("CARD TESTE" `6211038e…`, "teste0005" `919f9bc0…`) → **lixeira** (`deleted_at`). Não estão nas 101. |
| NPS automático / prazo / nota baixa | **Fora do escopo agora.** Fase futura via motor de automação (cadence-engine + Echo/WhatsApp). |
| Entrega | Feature + rename visível + backfill, tudo junto (o rename profundo de coluna interna foi descartado). |

---

## 4. Fora de escopo (fase futura)

- Envio automático do NPS por WhatsApp ao entrar/permanecer na etapa (integração futura).
- Encerramento automático "após tal mensagem ou X dias sem resposta" (via `cadence-engine`: step `wait` + ação de encerrar).
- Tratamento de nota baixa (tarefa/alerta antes de encerrar) — via automação.
- Rename físico da coluna `ganho_pos` no banco/analytics.

Estas capacidades reaproveitam o que já existe (motor de cadência, `send-email`/Echo) e serão desenhadas depois, por cima da base entregue aqui.

---

## 5. Design detalhado

### 5.1 Conceito "encerramento" (camada visível)
Onde a UI/relatório hoje mostra "Ganho de Pós-venda" / "Ganho Pós", passar a exibir **"Encerramento" / "Viagem encerrada"**. A coluna e as chaves internas (`ganho_pos`, filtros por chave) permanecem; só os **rótulos** mudam. Superfícies visíveis a revisar:
- `src/lib/pipeline/phaseLabels.ts`
- `src/components/pipeline/filters/FilterSectionStatus.tsx`
- `src/hooks/usePipelineFilters.ts` (labels de milestone)
- `src/components/card/CardHeader.tsx` (indicador de pós concluído, se houver)
- `src/pages/admin/ImportacaoPosVendaPage.tsx`
- Telas de analytics que rotulam "ganho de pós" (apenas rótulo, sem tocar nas RPCs).

### 5.2 Hard-hide no funil
Ajustar o filtro padrão para esconder qualquer card encerrado (`ganho_pos=true`), independente do status:
- `src/hooks/usePipelineCards.ts` (~linha 358)
- `src/hooks/usePipelineListCards.ts` (filtro equivalente)

Regra nova (mostra no funil ativo):
```
status_comercial IN ('aberto','ganho') AND COALESCE(ganho_pos,false) = false
```
Efeito: cards consolidados como ganho (status='ganho', ganho_pos=true) somem; cards encerrados sem venda (status='aberto', ganho_pos=true) **também** somem. Cards perdidos continuam ocultos como hoje. O filtro explícito de Status Comercial (ver arquivados/ganhos/etc.) segue funcionando sob demanda.

### 5.3 RPC `encerrar_viagem(p_card_id uuid)`
`SECURITY DEFINER`, seguindo o padrão de guarda multi-tenant do projeto (validar que o card pertence a `requesting_org_id()` antes de mutar — regra CLAUDE.md §Backend #7).

Lógica:
1. Carrega card; valida `produto='TRIPS'` e que está na última etapa de pós-venda (por `pipeline_stage` da fase `pos_venda` = a etapa-alvo do pipeline do card; para o pipeline de produção é `2c07134a…`).
2. `v_tem_venda` = existe `card_financial_items` não-arquivado **OU** `ganho_planner=true`.
3. `UPDATE cards SET ganho_pos=true, ganho_pos_at=now(), updated_at=now()` — e, se `v_tem_venda`: também `status_comercial='ganho'`, `ganho_planner=COALESCE(ganho_planner,false) OR true` (+ `ganho_planner_at` se nulo).
4. Log em `cadence_event_log` (ou timeline do card) com `event_type='encerramento_pos'` (ou reuso do padrão de eventos existente), registrando ator.
5. Respeitar o guard `enforce_trips_ganho_pos_only_in_pos_viagem` (já satisfeito pelo escopo de etapa).

Observação: existe `marcar_ganho` que na fase pós seta `status='ganho'+ganho_pos=true`. A RPC dedicada é preferível por (a) semântica clara, (b) cobrir o caso "sem venda" (encerra sem ganho), (c) log próprio. Avaliar reuso interno de trechos de `marcar_ganho` sem duplicar regra.

### 5.4 Botão "Encerrar viagem"
- Local: `src/components/card/CardHeader.tsx` (ou seção de ações do CardDetail).
- Visível **somente** quando: `produto==='TRIPS'` E o card está na última etapa de pós-venda. (Reusar detecção de etapa terminal de pós — a etapa cujo `phase.slug='pos_venda'` e é a última ativa; robustez via `is_terminal_phase`/nome, alinhado ao precedente Weddings `useEntregarParaProducao`.)
- Ação: chama `encerrar_viagem(card_id)`; on-success invalida queries do funil/lista e mostra confirmação simples ("Viagem encerrada.").
- Não bloquear por quality gate (é encerramento, não avanço de venda).

### 5.5 Backfill imediato (migration)
Encerrar as **101** viagens que se qualificam **na data de aplicação**:
```
produto='TRIPS'
AND pipeline_stage_id = '2c07134a-...'
AND archived_at IS NULL AND deleted_at IS NULL
AND status_comercial IN ('aberto','ganho') AND COALESCE(ganho_pos,false)=false
AND (produto_data->'data_exata_da_viagem'->>'end')::date <= (CURRENT_DATE - INTERVAL '15 days')
```
Efeito por card:
- Com venda real (97): `status='ganho'`, `ganho_planner=true` (se nulo/false), `ganho_pos=true`, `ganho_pos_at=now()`.
- Sem venda (4): `ganho_pos=true`, `ganho_pos_at=now()`, status inalterado (encerrado sem consolidar ganho).
- Registrar contadores no retorno da migration (movidos / consolidados / sem-venda) para auditoria.
- Snapshot dos IDs afetados na migration (a lista atual está em `docs/encerrar-viagens-trips-101.csv`); o plano re-verifica a contagem antes de promover.

### 5.6 Lixeira dos cards de teste (migration)
`UPDATE cards SET deleted_at=now() WHERE id IN ('6211038e-2ceb-4d0d-b038-8cd1e6697035','919f9bc0-4da6-49bf-9426-5508046f5bdb')` (CARD TESTE, teste0005). Por ID explícito, sem heurística de nome. "Marina / Miami / Fevereiro 2026" **não** é teste — não incluída.

---

## 6. Riscos e mitigação
- **Consolidar como ganho infla métrica de vendas?** Só consolida quem tem venda real (produtos/ganho_planner) — reflete realidade, não infla. Cards sem venda não viram ganho.
- **Hard-hide esconder algo indevido?** O filtro por Status Comercial e a prop `showClosedCards` continuam permitindo ver encerrados sob demanda. Perdidos seguem como hoje.
- **Tocar analytics por engano no rename?** Mitigado por decisão: rename só de rótulos visíveis; coluna interna intacta; **zero** mudança em RPCs de analytics (Trips ou Weddings).
- **Backfill em massa (101):** aplicar em staging primeiro; re-verificar contagem; migration idempotente (só afeta quem ainda não está encerrado).
- **Guard `enforce_trips_ganho_pos_only_in_pos_viagem`:** backfill e RPC operam só na etapa correta — sem violar o guard.

## 7. Verificação / testes
- Migration em **staging** primeiro (`apply-to-staging.sh`), validar contagens (101 encerradas; 97 consolidadas; 2 na lixeira) via REST antes de promover.
- Smoke: funil TRIPS não mostra os encerrados; filtro "encerrados" mostra sob demanda; card individual carrega.
- Botão: encerrar 1 card de teste em staging → some do funil; status/ganho_pos corretos; log gravado; guard multi-tenant barra card de outra org.
- Build verde (`npm run build`).
- `npm run sync:fix` se criar hook/componente novo.

## 8. Inventário de arquivos (a confirmar no plano)
- **Banco:** nova migration RPC `encerrar_viagem`; migration backfill 101; migration lixeira 2 cards.
- **Frontend:** `usePipelineCards.ts`, `usePipelineListCards.ts` (hard-hide); `CardHeader.tsx` (botão); rótulos visíveis (§5.1); novo hook `useEncerrarViagem` (mutation).
- **Sem alteração:** RPCs/edge de analytics; coluna `ganho_pos`; `view_cards_acoes` (continua expondo `ganho_pos`).

## 9. Rollout
Staging → validação → produção via `promote-to-prod.sh` (que roda smoke + registra log). Commitar as migrations. Resumo final ao dono em linguagem simples (sem jargão), com link pra tela onde testar.
