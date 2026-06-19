# Problema: reconciliar o Analytics 2 (ttars-nativo) com o dashboard do Active (Weddings)

> Doc de hand-off pra resolver num chat novo. Reúne o contexto, os números levantados na
> investigação e os caminhos já testados/descartados. Org **WEDDING** `b0000000-0000-0000-0000-000000000002`,
> pipeline `f4611f84-ce9c-48ad-814b-dcd6081f15db`, integração AC `a2141b92-561f-4514-92b4-9412a068d236`.

---

## ✅ DESFECHO (19/06/2026) — investigado e aplicado

**Migration `20260619g_ww_funil_casal_native_probes_tipo.sql` aplicada em produção.** Mudou só a
view `ww_funil_casal_native` (zero mutação de dados; RPCs `*_native` herdam). Resultado: leads DW
junho **132 → 99**, Elopement junho **8 → 24**, Elopement histórico corrigido (**+310** cards que
estavam contados como DW). Invariantes de analytics OK, smoke test 78/78, guarda confirmou que
**0** cards excluídos como probe estão no set de 120 do Active.

### A cadeia do e-mail/contato foi testada (ponto levantado: cache.contact_id → contatos.email)
Funciona e resolve contatos (3.203/7.596 contatos AC do cache resolvem para `contatos` do ttars via
`contatos.external_id`, 3.196 com e-mail; cards ligam por `pessoa_principal_id`, não `cards_contatos`).
**Mas linka no máximo ~3 cards** (146 soltos → 9 com contato AC → 5 com deal WW → 3 com deal livre)
e **linkar não muda a contagem** (a view nativa já conta cards soltos). O valor da cadeia é
**diagnóstico**: dos 30 leads que só o Active tem em junho, **7 não resolvem a contato** = lixo que o
Active super-conta (`- `, `DW | TESTE`, `Fernando - `, `Luiz - `, `Rui - `, `Thiago - `, `Ana Carolina - `);
os outros **~21 resolvem com e-mail mas não têm card** = leads reais que entraram só pelo Active e
nunca viraram card no ttars (`DW | Luiza`, `DW | Kallye`, `DW | Marcelo`, `DW | Natielly`, etc.).

### Por que os dois dashboards não batem (e não dá pra forçar bater sem importar/somar)
- **Active super-conta ~7 lixos** (sem contato, sem e-mail, criados na mão direto no Active).
- **ttars não tem ~21 leads reais** que entraram só pelo Active (causa upstream: criação de card via
  AC está em `UPDATE_ONLY_NO_CARD`; Leadster/site só cobre chatbot/formulário).
- Unidade diferente: Active = contato deduplicado; nativo = card.
- Fechar o número exato exigiria **importar** esses ~21 deals como cards OU o dashboard nativo
  **somar do cache** — decisão deferida (usuário pediu "só o dashboard" por ora).

### Pendências/decisões em aberto
- (opcional, data-quality) linkar os ~3 cards resolvíveis via cadeia do contato (seta `external_id`;
  não muda contagem, mas faz puxar os campos de funil do AC).
- (negócio) decidir se importa os ~21 leads-sem-card ou aceita a diferença documentada.
- (upstream) investigar por que deals criados direto no Active não geram card no ttars.

---

## O que já existe (contexto)
- **Analytics 1** (`/analytics-weddings`): dashboard de Weddings que lê o **cache do Active**
  (`ww_ac_deal_funnel_cache` + snapshot `ww_funil_casal`, por **contato AC**, deduplicado; tipo por
  "tocou o pipeline SDR"). Tido como a fonte "correta".
- **Analytics 2** (`/analytics-weddings-2`, WIP): clone que lê **só dados do ttars**. Mecanismo:
  - `AnalyticsVariantContext` ('ac' | 'native') + `rpcName()` em `src/hooks/analyticsWeddings/useWw2.ts`
    fazem os hooks chamarem RPCs `*_native` quando a página é a Analytics 2.
  - View **`ww_funil_casal_native`** (1 linha/**card** WEDDING) com a mesma interface de `ww_funil_casal`,
    montada de `cards` + `activities` (log de etapa) + campos de `produto_data`.
  - RPCs `*_native`: `ww2_overview_native`, `ww_funil_conversao_v1_native`, `ww_serie_temporal_native`,
    `ww_agenda_reunioes_native`, `ww_agendamentos_por_dia_native`, `ww_drill_casais_native`,
    `ww_funil_ranking_combo_native` (migrations `20260619a` e `20260619f`).
  - Reuniões/ganho do nativo vêm de campos do card (`ww_sdr_data_reuniao`=AC6, `ww_sdr_como_reuniao`=AC17,
    `ww_closer_data_reuniao`=AC18, `ww_closer_como_reuniao`=AC299, `ww_closer_data_ganho`=AC87),
    **backfillados** do cache (`20260619c`) + **cron de sync contínuo** `ww-sync-analytics-fields` (`20260619e`).
  - Tudo numa branch só: `feat/ww-funil-sdr-closer` (PR #147, **ainda não publicado**).

Reuniões/closer/ganho do nativo **já batem** com o Active (junho: 15/10/1 vs 17/9/1). O problema é só **LEADS**.

## O problema (números, junho, filtro DW, "este mês")
| | Active (correto) | Analytics 2 (nativo) |
|---|---|---|
| Leads criados | **120** | **132** |

### Decomposição do nativo (132 leads, junho DW)
- 93 cards titulados "DW | …" (DW de verdade)
- **18 probes** (sem deal E sem contato): "Casal (via Sofia)" ×8, "Casal Probe" ×3, "Bianca e Vitor" ×3,
  "Ana e João" ×3, "mcqueen", "Sem Título" — health-checks/demos da Sofia, **não são leads**
- **16 titulados "Elopement | …" contados como DW** — o nativo assume `tipo=DW` quando
  `produto_data->>'ww_tipo_casamento'` está vazio, **ignorando o prefixo do título**
- 5 sem prefixo ("José", "Thayna"…)
- Dos 132: **112 têm deal no Active** (`external_id` setado); **20 não têm**

### Cenários testados (alvo = 120)
| ação | leads |
|---|---|
| atual | 132 |
| tirar só os 18 probes | **114** |
| corrigir só o tipo (16 Elopement→Elopement) | 116 |
| os dois | 98 (overcorreção) |

→ **nenhum dá 120 exato.**

## Causa raiz: vínculo deal↔card quebrado + contato mora no Active
- Reconciliação por deal: dos 120 deals do Active, **91 estão linkados a um card nativo**, **29 são
  "só do Active"** (quase todos **sem card linkado** no ttars: DW | Luiza/Natielly/Marcelo/Kallye/vitória…).
- Casais como "DW | vitória" existem como **deal no Active** (Active conta) **E** como **card no ttars sem
  `external_id`** (nativo conta), **sem link** → cada dashboard conta o seu, nunca batem (double-count).
- **Não dá pra linkar automaticamente**: dos **145 cards soltos** (sem `external_id`), **144 não têm e-mail
  NEM telefone**. Pior: `cards_contatos` tem só **56 linhas em TODO o Weddings** (de 3.323 cards) — ou seja,
  a maioria dos cards do ttars **nem guarda o contato**; o contato vive no Active.
- 91% dos cards WEDDING (3.015/3.323) têm `external_id` (vieram/linkaram do Active). O `link_by_email`
  (handler em `integration-dispatch`, flag `WW_AC_LINK_BY_EMAIL_ENABLED`) só casa quem **tem e-mail** — esses não têm.
- Diferenças adicionais que impedem match exato: **unidade de contagem** (Active = contato deduplicado;
  nativo = card) e **definição de tipo** (Active = "tocou SDR"; nativo = título/campo). O próprio Active
  **não é 100% limpo** (tem "DW | TESTE" entre os 120).

## Caminhos já descartados
- **Excluir probes + corrigir tipo** → 98 (afunda demais; o alvo é ~120).
- **Linkar deal↔card por e-mail/telefone** → inviável (sem chave: 144/145 sem e-mail/telefone).
- **Opção nuclear** (apagar leads de Weddings com backup + re-importar do Active a partir de junho) →
  **descartada**. Risco: apagar card também derruba o colateral preso a ele — **Planejamento**
  (`wedding_planejamento_state`), **Convidados** (`wedding_guests`), **reuniões** (`reunioes`), **tarefas**
  (`tarefas`), **histórico** (`activities`), contatos, financeiro — e o re-import do Active traz só os campos
  do deal, não as enriquecidos nativos.

## A pergunta em aberto
Como fazer o funil nativo do ttars **reconciliar com / substituir** o dashboard do Active, dado que:
(1) o contato/chave de match mora no Active, não no ttars; (2) deal e card não estão linkados; (3) apagar e
re-importar destrói o trabalho nativo (Planejamento/Convidados/etc.).

Hipóteses a avaliar no chat novo:
- **Trazer as chaves do Active** (e-mail/telefone do contato do deal, via `ww_ac_deal_funnel_cache` ou API
  do AC) pros cards do ttars, e **então** linkar deal↔card por essas chaves (sem apagar nada).
- Definir o "lead" do nativo de forma que **não dependa** do link (ex.: contar por contato AC quando houver
  deal; manter cards nativos sem deal como leads próprios) e aceitar/explicar a diferença residual.
- Limpar os probes da Sofia (criar uma flag de teste de verdade, já que "(via Sofia)" também é produção) +
  corrigir a classificação de tipo pelo título — pra pelo menos parar de inflar com lixo e elopement.

## Artefatos relevantes (pra investigar)
- View/RPC nativos: `ww_funil_casal_native`, `ww2_overview_native` etc. (migrations `20260619a`–`20260619f`).
- Cache do Active: `ww_ac_deal_funnel_cache` (por `ac_deal_id`, tem `contact_id`, `sdr_*`, `closer_*`,
  `ganho_at`, `tipo_casamento`); snapshot `ww_funil_casal` (por `contact_id` = contato AC).
- Link: migration `20260616_ww_ac_link_by_email.sql`, handler `link_by_email` em
  `supabase/functions/integration-dispatch/index.ts`, núcleo `supabase/functions/_shared/wedding-lead.ts`
  (dedup contato por e-mail→telefone via `find_contact_by_whatsapp`).
- Frontend: `src/pages/AnalyticsWeddings/` (+ `AnalyticsWeddings2/Analytics2Page.tsx`),
  `src/hooks/analyticsWeddings/useWw2.ts`, `AnalyticsVariantContext.tsx`.
- Acesso ao banco (read-only): token CLI em `~/.supabase/access-token` → Management API
  `POST https://api.supabase.com/v1/projects/szyrzxvlptqqheizyrxu/database/query`.

---

## Prompt pronto pro chat novo

```
Contexto: WelcomeCRM (React+Vite+Supabase). Produto Weddings, org WEDDING
b0000000-0000-0000-0000-000000000002, pipeline f4611f84-ce9c-48ad-814b-dcd6081f15db.
Leia docs/plans/ww-analytics-2-reconciliacao-active.md (tem todo o diagnóstico).

Problema: o dashboard "Analytics 2" (/analytics-weddings-2) lê só dados do ttars e NÃO
bate com o dashboard do Active (/analytics-weddings) no nº de LEADS (nativo 132 × Active
120, junho, filtro DW). Reuniões/closer/ganho já batem. A causa raiz é que deal (Active)
e card (ttars) não estão linkados (cards.external_id quase sempre null) e o contato/chave
de match mora no Active, não no ttars (cards_contatos só 56 linhas p/ 3323 cards; 144 de
145 cards soltos sem email/telefone). Além de 18 "probes" da Sofia (sem deal+sem contato)
e 16 cards "Elopement | …" contados como DW (tipo assume DW quando o campo está vazio).

Já descartado: linkar por email/telefone (sem chave); apagar+reimportar do Active (destrói
Planejamento/Convidados/reuniões/tarefas presos aos cards).

Objetivo: fazer o funil nativo reconciliar com o Active SEM apagar dados, idealmente trazendo
as chaves do contato do Active (cache ww_ac_deal_funnel_cache tem contact_id por deal; AC API
disponível) pros cards do ttars e linkando deal↔card por elas; e limpar probes + corrigir a
classificação de tipo (DW × Elopement) pelo título. Investigue a viabilidade (quantos cards
dá pra linkar trazendo email/telefone do Active), proponha um plano com backup/segurança e
sem tocar no Active (só vincular a deals existentes), e estime o quanto fecha o gap de leads.

Banco read-only via token CLI em ~/.supabase/access-token (Management API). NÃO aplique nada
sem plano aprovado; migrations via promote-to-prod / token CLI; tudo isolado na org WEDDING.
```
