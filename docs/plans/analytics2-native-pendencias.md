# Analytics 2 (native) — pendências após PR #154

> **Status:** PR #154 corrigiu os achados críticos/altos e parte dos médios da auditoria das 7 abas
> do **Analytics 2** (variante `native`: menu "Analytics 2" → `/analytics-weddings-2` →
> `Analytics2Page` → `AnalyticsWeddingsPage` com `AnalyticsVariantContext="native"`).
> Este doc lista **o que ficou de fora** e como atacar cada item.
>
> **Data:** 22/06/2026 · **Org WEDDING:** `b0000000-0000-0000-0000-000000000002`

---

## Já feito (referência — NÃO refazer)

| Item | Migration / arquivo | O que resolveu |
|---|---|---|
| Contaminação da view (41 testes, 312 Elopement→DW, 56 probes) | `20260622d` | restaurou filtros de teste/probe + Elopement-por-título perdidos pela `20260622c` |
| Analytics 2 não era 100% nativo (Perfil dos leads via AC) | `20260622e` + `useWwPerfilTemporal` variant-aware | criou `ww_perfil_temporal_native` |
| "Vendeu pra onde disse" inflado | `20260622f` | `vw_ww_funnel_base_native.destino_final` = só refinado (sem COALESCE pro declarado) |
| Dropdown de Origem poluído (funil-4) | `20260622g` | wrapper `_ww_native_norm_origem` (base AC intocado) |
| "Em reagendamento" sempre 0 (visao-6) | `20260622h` | `ww_agenda_reunioes_native` usa field_changed da data da reunião |
| Rodapé "vem do ActiveCampaign" no nativo (perfil-3) | `Perfil.tsx` | texto condicional por variante |

Rollback completo: `supabase/migrations/rollback/20260622_rollback.sql` (DDL puro, zero mutação de dados).

### Como aplicar migrations (gotcha de credencial)
O token do `.env` (`SUPABASE_ACCESS_TOKEN`) **expirou** → `promote-to-prod.sh` e os test-scripts dão
`Unauthorized`. Aplicar SQL via Management API usando o token do CLI:
```bash
TOKEN=$(cat ~/.supabase/access-token)
curl -sS -X POST "https://api.supabase.com/v1/projects/szyrzxvlptqqheizyrxu/database/query" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "$(python3 -c 'import json,sys;print(json.dumps({"query":open(sys.argv[1]).read()}))' ARQUIVO.sql)"
```
Smoke test (usa service key do `.env`, funciona): `bash .claude/hooks/schema-smoke-test.sh`.

### ⚠️ Guarda-corpo de processo (regra #5 do CLAUDE.md)
O hook `.claude/hooks/warn-function-rebase.sh` **BLOQUEIA** `Write` de migration que recria função com
**≥2 migrations anteriores**. Antes de recriar, `grep -rn "CREATE.*FUNCTION nome" supabase/migrations/`,
**leia a def viva** (`pg_get_functiondef`) e confirme que preserva todas as correções. Foi a violação
disso (rebase na baseline velha) que causou a regressão da `20260622c` consertada aqui.

---

## PENDÊNCIA 1 — Drill por etapa quebrado no native (visao-5) · MÉDIO

### Sintoma
Na **Visão geral**, clicar numa etapa do funil ("Onde estão agora") abre o drill (lista de casais),
mas no native ele **ignora o recorte da etapa** e devolve um universo mais amplo do que o número clicado.
(O drill por **marco** — fez_sdr, ganho, etc. — funciona; só o por-**etapa** está quebrado.)

### Causa-raiz (2 pontos)
1. **`ww2_overview_native`** (def em `20260619a`, ~linha 523) emite o campo do funil como
   `stage_slug = st.stage_id::TEXT` — ou seja, **um UUID**, não o slug real de `pipeline_stages`.
   O front usa isso como `phaseSlug` no drill (`VisaoGeral.tsx:193` → `openDrill({ ...phaseSlug: s.slug })`).
2. **`ww_drill_casais_native`** (def viva `20260619j`, supersede `20260619f`) casa `p_phase_slug` contra
   slugs NOMEADOS via `CASE p_phase_slug WHEN 'sdr_triagem' ... ELSE NULL` (~linha 124). Um UUID não bate
   em nenhum ramo → nenhum corte de etapa. Pior: os ramos nomeados comparam
   `cards.pipeline_stage_id` (UUID) contra ids numéricos de stage do AC ('1','3','201'...) — então mesmo
   com slug correto, deletaria todas as linhas.

### Por que é arriscado / não foi feito
- `ww_drill_casais_native` tem **3 migrations anteriores** → hook BLOQUEIA recriação; exige reler 619f/h/j
  e confirmar preservação (drill tem muita lógica de filtro: marco, faixa, destino, convidados, origem,
  canal, motivo, status, paginação).
- Consertar só o ponto 1 (slug) **não resolve** — sem o ponto 2 o drill continua sem casar etapa.

### Como atacar (proposta)
Padronizar a identidade de etapa por **`pipeline_stage_id` (UUID)** ponta a ponta:
1. Em `ww2_overview_native`: emitir o **slug real** (`JOIN pipeline_stages s ON s.id = st.stage_id`,
   filtrando pelo `pipeline_id` do WEDDING) **OU** manter o UUID mas garantir que o drill case por UUID.
   Recomendo emitir o slug real (`s.slug`) — é o contrato que o front e o drill esperam.
2. Em `ww_drill_casais_native`: adicionar/ajustar o casamento de etapa para resolver
   `p_phase_slug` → `pipeline_stages.id` (do pipeline WEDDING) e filtrar `cards.pipeline_stage_id = <id>`.
   Recriar a partir da def viva `20260619j` (reler 619f/h/j antes — hook).
3. Verificar: clicar cada etapa do funil e conferir que `total` do drill == número da etapa.

### Verificação read-only (antes/depois)
```sql
-- o que o overview emite hoje como stage_slug (deve virar slug legível, não UUID):
select (ww2_overview_native('2026-01-01'::timestamptz, now(), 'cohort',
        'b0000000-0000-0000-0000-000000000002'::uuid)->'funnel') as funnel;
-- drill por etapa: total tem que bater com o leads_count da etapa
select (ww_drill_casais_native(/* ...p_phase_slug => '<slug>' */)->>'total');
```

---

## PENDÊNCIA 2 — "Qualificados" definido diferente nas 2 RPCs de Marketing (marketing-2) · BAIXO

### Sintoma
Na aba **Marketing**, a tabela `por_origem` pode mostrar contagem de "qualificados" divergente da aba
Qualidade para a mesma origem (ex.: Google 117 × 132; Instagram 60 × 56).

### Causa-raiz
- `ww_marketing_qualidade_native` (`20260619o`, ~linha 105): `qualif = COUNT(*) FILTER (WHERE fez_sdr OR fechou)`.
- `ww2_marketing_native` (`20260622b`, ~linha 94): `qualif = COUNT(*) FILTER (WHERE qualif_at IS NOT NULL)`
  (onde `qualif_at = v.fez_sdr_at`). Diverge quando `fechou` mas sem `fez_sdr_at`.

### Por que é baixa prioridade / não foi feito
- A `por_origem` de `ww2_marketing_native` é renderizada **só como fallback** quando a aba Qualidade
  falha/ausente (`Marketing.tsx:66` → `(!qualidade || qualidade.error)`). O usuário quase nunca vê as duas
  ao mesmo tempo na mesma aba.
- `ww2_marketing_native` tem **2 migrations anteriores** → hook BLOQUEIA recriação (reler `20260619n` + `20260622b`).

### Como atacar
Alinhar a definição de `qualif` no `por_origem` de `ww2_marketing_native` à de `ww_marketing_qualidade_native`
(usar `fez_sdr OR fechou`). Recriar a função a partir da def viva (snapshot/`pg_get_functiondef`),
mudando só essa linha. Verificar que `por_origem.qualificados` bate com a aba Qualidade por origem.

---

## Itens verificados que NÃO são bug (não mexer)

- **entrada-3** (combos/heatmaps "ignoram Data da venda"): é **intencional** — conversão (fechou/entrou)
  é sempre por safra. O gêmeo AC `ww_drift_combos` se comporta igual (echo 'cohort' + filtra por entrada).
  Se incomodar, é só **rótulo de UI** ("esta seção é sempre por safra"), não cálculo.
- **visao-3** (KPIs × funil): batem (régua cumulativa). Só o texto "Reuniões SDR feitas" é levemente impreciso.
- **perfil-2** (tipo × tipo_entrada): 100% das linhas iguais → sem impacto.
- **marketing-5** ("dois universos de data" no Marketing): o hook `useWwMarketingQualidade` nunca manda
  `p_date_mode` → sempre cohort; o cenário não acontece.

---

## Polish de UI deixado de fora (Fase 4, baixo valor — opcional)

Tudo frontend, sem risco de banco. Fazer só se quiser lapidar:
- **Ticket/receita morto:** no native, valor não existe nos cards (~1–2 ganhos têm valor) → a coluna/hint
  de ticket aparece "—". Esconder no native com nota "valor não rastreado no ttars".
  (Sincronizar valor → cards é um trabalho de dados à parte, fora deste escopo.)
- **"Desconhecida/Desconhecido" domina o ranking "top por volume"** (Marketing): mostrar o balde "sem UTM"
  separado e ranquear só os conhecidos (totais continuam fechando).
- **Perdas:** nota de que SDR e Closer contam os ~43 "ambos" nas duas listas; legenda de top-N nos heatmaps;
  remover faixas mortas de `FAIXA_ORDER` ('R$50-80 mil','R$80-100 mil') em `Perdas.tsx`.
- **Formatação:** util `formatPct()` (arredondar % em `Qualidade.tsx`/`Marketing.tsx`); contraste do heatmap
  em `Perdas.tsx` (texto branco em vermelho claro → subir limiar de intensidade); rótulo "mostrando X de Y"
  nas tabelas top-N; hex hardcoded → tokens em `Marketing.tsx`.

---

## Decisão de negócio em aberto (visao-6, já no ar)

Hoje, no desfecho da agenda, uma reunião **remarcada que depois aconteceu** conta como **"Feita"**
(precedência: feita > nao_aconteceu > reagendando). Se o Mateus quiser que **qualquer** reunião que já
foi remarcada apareça em "Em reagendamento" (mesmo tendo acontecido), inverter a precedência no `CASE` de
`_ww_desf` em `ww_agenda_reunioes_native` (pôr o ramo `WHEN x.reagendou` antes de `feita`/`nao_aconteceu`).

---

## Referências
- **PR:** #154 (`fix/analytics2-native-correcoes`).
- **Migrations:** `20260622d/e/f/g/h` · rollback em `supabase/migrations/rollback/20260622_rollback.sql`.
- **View base do funil native:** `ww_funil_casal_native` (alimenta as RPCs `*_native`); recriar SEMPRE a
  partir da def viva mais recente (hoje `20260622g`), nunca de baseline antiga.
- **Memória:** `memory/project_ww_native_view_baseline.md`, `memory/project_ww_analytics2_reconciliacao.md`.
