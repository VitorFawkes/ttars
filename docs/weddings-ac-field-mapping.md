# Wedding — Mapeamento ActiveCampaign ↔ CRM

Atualizado: 2026-05-25

## Pipelines AC envolvidos

| AC ID | Nome no AC | Corresponde a |
|---|---|---|
| 1 | SDR Weddings | Fase SDR do CRM (qualificação inicial) |
| 3 | Closer Weddings | Fase Closer do CRM (fechamento de venda) |
| 4 | Planejamento Weddings | Fase Planner do CRM |
| 12 | Elopment Wedding | Variante "elopment" — entra no mesmo pipeline CRM |
| 17 | WW - Internacional | Variante internacional — entra no mesmo pipeline CRM |
| 31 | Outros Desqualificados | Cards perdidos (update apenas) |

**No CRM**, todos esses caem no pipeline único `f4611f84-ce9c-48ad-814b-dcd6081f15db` (Welcome Wedding), distribuídos entre fases SDR/Closer/Planner/Pós.

## Stages dos pipelines principais

### Pipeline 1 (SDR Weddings)
| AC stage | Nome |
|---|---|
| 1 | Triagem - MQL |
| 3 | Follow Up |
| 7 | Primeiro Contato - Qualificação |
| 8 | Qualificado pela SDR |
| 60 | StandBy |
| 61 | Aguardando pagamento TAXA |
| 201 | Reagendamento SDR |

### Pipeline 3 (Closer Weddings)
| AC stage | Nome |
|---|---|
| 222 | Reagendamento Closer |
| 13 | 1ª Reunião |
| 14 | Em contato |
| 15 | Contrato enviado |
| 16 | Em negociação |
| 221 | Oportunidade futura |
| 193 | Aguardando dados |
| 163 | Standby - Closer |
| 37 | Ganho |

## Mapeamento Custom Fields AC → CRM

Para cada custom field do AC, abaixo está pra onde ele vai no CRM. Coluna `sync_always`:
- `true` = sempre sobrescreve (apropriado pra dados do formulário do site, que não devem ser editados manualmente)
- `false` = preserva valor existente no CRM se já foi preenchido manualmente

| AC field | Label AC | Tipo AC | Storage CRM | Campo CRM | sync_always |
|---|---|---|---|---|---|
| **Formulário do site (capturados do lead)** |
| 21 | Qual é o nome do(a) seu(sua) noivo(a)? | text | produto_data | ww_nome_parceiro | true |
| 26 | Quantas pessoas vão no seu casamento? | radio | produto_data | ww_mkt_convidados_form | true |
| 27 | Quanto você pensa em investir? | radio | produto_data | ww_mkt_orcamento_form | true |
| 28 | Onde você quer casar? | radio | produto_data | ww_mkt_destino_form | true |
| 29 | Se "Outro", qual? | textarea | produto_data | ww_mkt_destino_outro | true |
| **Qualificação inicial** |
| 30 | DW ou Elopment? | dropdown | produto_data | ww_tipo_casamento | false |
| 117 | Previsão data de casamento | dropdown | produto_data | ww_sdr_previsao_data | false |
| 16 | Cidade | text | produto_data | ww_sdr_cidade | false |
| 67 | Tempo de relacionamento | text | produto_data | ww_tempo_relacionamento | false |
| 120 | Já tem destino definido? | dropdown | produto_data | ww_sdr_ja_tem_destino | false |
| 123 | Como conheceu a WW? | dropdown | produto_data | ww_sdr_como_conheceu | false |
| 124 | Motivo da escolha de um DW? | dropdown | produto_data | ww_sdr_motivo_dw | false |
| 125 | Já foi em algum DW? | dropdown | produto_data | ww_sdr_ja_foi_dw | false |
| **Reuniões SDR** |
| 6 | Data e horário do agendamento da 1ª reunião | datetime | produto_data | ww_sdr_data_reuniao | false |
| 17 | Como foi feita a 1ª reunião? | multiselect | produto_data | ww_sdr_como_reuniao | false |
| 20 | Pagamento de Taxa? | radio | produto_data | ww_sdr_taxa_paga | false |
| 83 | Motivos de qualificação SDR | radio | produto_data | ww_sdr_qualificado | false |
| 98 | Automático - WW - Data Qualificação SDR | datetime | produto_data | ww_sdr_data_qualificacao | false |
| 2 | Motivo de perda (SDR) | radio | produto_data | ww_motivo_perda_sdr | false |
| **Closer / Negociação** |
| 18 | Data e horário do agendamento com a Closer | datetime | produto_data | ww_closer_data_reuniao | false |
| 19 | Tipo da reunião com a Closer | dropdown | produto_data | ww_closer_como_reuniao | false |
| 64 | Valor fechado em contrato | currency | **column** | valor_final | false |
| 87 | [WW] [Closer] Data-Hora Ganho | datetime | produto_data | ww_closer_data_ganho | false |
| 47 | [WW] [Closer] Motivo de Perda | dropdown | produto_data | ww_motivo_perda_closer | false |
| **Pós-fechamento / Planejamento** |
| 121 | Destino (confirmado) | dropdown | produto_data | ww_destino | false |
| 131 | Local do Casamento | text | produto_data | ww_local | false |
| 128 | Data e horário definidos para o casamento | datetime | produto_data | ww_data_casamento | false |
| 132 | Data Confirmada do Casamento | text | produto_data | ww_plan_data_casamento_final | false |

**Total: 28 campos × 2 pipelines (1 e 3) = 56 mapeamentos cadastrados.**

Migration: `supabase/migrations/20260525a_wedding_ac_field_mappings.sql`

## Bugs encontrados na investigação

### Bug 1 — Mapeamentos antigos apontavam pra pipeline AC 6 (inexistente)
Os 12 mapeamentos pré-existentes para Wedding usavam `external_pipeline_id='6'`. O pipeline AC 6 é "Consultoras TRIPS", não Weddings. Isso explica por que **0 cards** tinham faixa de investimento preenchida.

### Bug 2 — Webhook AC envia customFieldDataId em vez de customFieldId
O webhook do AC, no campo `deal[fields][N][id]`, manda o ID da **linha de dados** (`dealCustomFieldData.id`, instável, único por deal+campo), não o ID estável do campo (`customFieldId`). O parser do CRM (`integration-process/index.ts:267`) espera o ID estável, então quando recebe via webhook, joga tudo em `marketing_data.unmapped_fields`.

**Mitigação:** sincronizar via `integration-sync-deals` (REST API) em vez de confiar no webhook. O sync usa side-load `?include=dealCustomFieldData` que retorna `custom_field_id` (estável), e o código do sync já faz a conversão certa em [integration-sync-deals/index.ts:107](../supabase/functions/integration-sync-deals/index.ts#L107).

**Próximo passo (tech debt):** sync periódico via cron (ex: a cada 15 min) garante que os webhooks que vêm "errados" sejam corrigidos rapidamente.

### Bug 3 — Edge function `integration-sync-deals` aceita só snake_case
A função lê `body.pipeline_id`, não `body.pipelineId`. Chamar com camelCase faz a função usar default (`8` = TRIPS) silenciosamente. Documentado aqui pra evitar repetir o erro.

## Triggers de entrada (já existentes)

A tabela `integration_inbound_triggers` controla quais combinações (pipeline + stage + event) podem CRIAR card no CRM. Existem 12 triggers ativos cobrindo os 5 pipelines Wedding. Resumo:

- **Pipeline 1 (SDR)**: cria card apenas quando deal entra em stage 1 (Triagem MQL); update funciona em qualquer stage.
- **Pipeline 3 (Closer)**: cria card em stages 13, 14, 15, 16, 37, 163, 193; update qualquer.
- **Pipeline 4 (Planejamento)**: cria em stages 20, 21, 22, 23, 25, 146, 147; update qualquer.
- **Pipeline 12 (Elopment)**: cria em stages 62, 182, 184, 185, 186, 198, 199; update qualquer.
- **Pipeline 17 (Internacional)**: cria em stage 81; update qualquer.
- **Pipeline 31 (Desqualificados)**: apenas update.

## Cobertura — estado inicial vs pós-sync

| Campo | Pré-sync | Meta |
|---|---|---|
| ww_orcamento_faixa (faixa de investimento) | 10 cards | ~600 cards (tem dado no AC pra ~50%) |
| ww_num_convidados (nº convidados) | 15 cards | ~700 cards |
| ww_mkt_destino_form (destino do formulário) | 0 cards | ~1.000 cards |
| ww_nome_parceiro (nome do noivo(a)) | 0 cards | ~900 cards |
| ww_local (local confirmado) | 121 cards | mais conforme preenchido |
| ww_data_casamento | 74 cards | mais conforme preenchido |

(Atualizar após sync completo.)
