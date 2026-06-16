# Disparos — Ritmo configurável + envio manual de levas · Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (inline). Steps use `- [ ]`.

**Goal:** Dar ao usuário controle do ritmo do disparo ("X pessoas a cada Y") e a ação de enviar uma leva manual agora (próximos N ou seleção), com visibilidade de quantos faltam — reaproveitando o motor existente (`disparo_fila`/dispatcher/opt-outs).

**Architecture:** Uma migration estende `disparo_campanhas` (colunas `tamanho_leva`, `intervalo_leva_min`), reescreve o espaçamento de `disparo_calcular_agenda` (leva + intervalo, no lugar do gap contínuo 20–60s) e adiciona 2 RPCs (`disparo_enviar_agora`, `disparo_ajustar_ritmo`). O frontend troca o controle de ritmo no modal de criação e transforma o relatório num painel de controle (contadores grandes, próxima leva, checkboxes + enviar agora, mudar ritmo).

**Tech Stack:** PostgreSQL/PLpgSQL (Supabase), React + TS, TanStack Query, `sbAny` (tabelas fora de database.types.ts).

**Baseline confirmado (lido do código):**
- `disparo_calcular_agenda` processa só `status='pending'` → re-rodar reescala só os pendentes (preserva enviados). Render (versões + spintax + variáveis) fica intacto.
- `disparo_claim_batch` exige `c.status IN ('agendado','disparando')` → "enviar agora" precisa garantir campanha ativa (pausada → agendado).
- Dispatcher manda 4/min (BATCH=4) o que está vencido; **não** reforça janela/cap no envio → override manual funciona, e 4/min já é um teto natural seguro.
- Contadores (total/enviados/faltam) recalculam via trigger statement-level em `disparo_fila` — não preciso mexer.
- `estimado_dias` é NUMERIC; `cap_diario` default 500 no schema (UI usa 50).

---

## Task 1 — Migration: schema + reescrita da agenda + RPCs novas

**Files:**
- Create: `supabase/migrations/20260615a_disparo_ritmo_controle.sql`

Regra do projeto: `disparo_calcular_agenda` é `CREATE OR REPLACE` existente — a migration recria o corpo COMPLETO (lido de `20260602b`), mudando só o bloco de espaçamento (passo 1) e lendo as colunas novas. Nada mais do corpo muda.

- [ ] **Step 1: Escrever a migration completa**

```sql
-- ============================================================================
-- Disparos — ritmo configurável (leva + intervalo) + envio manual de levas
-- ============================================================================
-- 1. Colunas de ritmo em disparo_campanhas
-- 2. disparo_calcular_agenda: espaçamento por LEVA (X a cada Y) no lugar do gap
--    contínuo 20–60s. Resto do corpo (render) inalterado. Só mexe em 'pending'.
-- 3. disparo_enviar_agora: antecipa execute_at de itens (seleção ou próximos N),
--    escalonado ~45s, e garante campanha ativa (pausada → agendado).
-- 4. disparo_ajustar_ritmo: atualiza colunas e reescala pendentes (reusa agenda).
-- ============================================================================

BEGIN;

-- 1. Colunas de ritmo ---------------------------------------------------------
ALTER TABLE public.disparo_campanhas
  ADD COLUMN IF NOT EXISTS tamanho_leva       INT NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS intervalo_leva_min INT NOT NULL DEFAULT 30;

COMMENT ON COLUMN public.disparo_campanhas.tamanho_leva IS 'Quantas mensagens por leva (ritmo). Espaçadas ~30s entre si dentro da leva.';
COMMENT ON COLUMN public.disparo_campanhas.intervalo_leva_min IS 'Minutos de pausa entre uma leva e a próxima.';

-- 2. Agenda por leva ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.disparo_calcular_agenda(p_campaign_id UUID)
RETURNS TABLE(out_total INT, out_termino TIMESTAMPTZ, out_dias INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org      UUID;
  v_corpo    TEXT;
  v_cap      INT;
  v_ramp     BOOLEAN;
  v_jini     TIME;
  v_jfim     TIME;
  v_tam_leva INT;
  v_int_leva INT;
  v_clock    TIMESTAMPTZ;
  v_current_day DATE := NULL;
  v_day_number  INT := 0;
  v_count_day   INT := 0;
  v_count_leva  INT := 0;
  v_day_cap     INT;
  v_idx      INT := 0;
  v_gap      INT;
  v_last     TIMESTAMPTZ;
  v_total    INT := 0;
  rec        RECORD;
  v_eff      JSONB;
  v_body     TEXT;
  v_k        TEXT;
  v_v        TEXT;
  v_repl     TEXT;
  v_spin     TEXT;
  v_opts     TEXT[];
  v_choice   TEXT;
  v_corpos_alt JSONB;
  v_versions TEXT[];
BEGIN
  SELECT org_id, corpo_mensagem, corpos_alternativos, cap_diario, usar_ramp,
         janela_inicio, janela_fim, tamanho_leva, intervalo_leva_min
    INTO v_org, v_corpo, v_corpos_alt, v_cap, v_ramp, v_jini, v_jfim,
         v_tam_leva, v_int_leva
    FROM public.disparo_campanhas WHERE id = p_campaign_id;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Campanha % não encontrada', p_campaign_id USING ERRCODE = 'no_data_found';
  END IF;
  IF v_org <> requesting_org_id() THEN
    RAISE EXCEPTION 'Sem permissão para esta campanha' USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_cap      := GREATEST(COALESCE(v_cap, 500), 1);
  v_tam_leva := GREATEST(COALESCE(v_tam_leva, 10), 1);
  v_int_leva := GREATEST(COALESCE(v_int_leva, 30), 0);

  v_versions := ARRAY[v_corpo];
  IF v_corpos_alt IS NOT NULL AND jsonb_typeof(v_corpos_alt) = 'array' THEN
    SELECT v_versions || COALESCE(array_agg(value), ARRAY[]::text[])
      INTO v_versions
      FROM jsonb_array_elements_text(v_corpos_alt) AS value
     WHERE NULLIF(btrim(value), '') IS NOT NULL;
  END IF;

  SET LOCAL TimeZone = 'America/Sao_Paulo';
  v_clock := now();

  FOR rec IN
    SELECT f.id, f.variaveis,
           c.nome, c.sobrenome, c.email, c.telefone,
           EXISTS (SELECT 1 FROM public.whatsapp_messages m
                    WHERE m.contact_id = f.contact_id AND m.direction = 'inbound') AS interagiu
      FROM public.disparo_fila f
      JOIN public.contatos c ON c.id = f.contact_id
     WHERE f.campaign_id = p_campaign_id
       AND f.status = 'pending'
     ORDER BY (EXISTS (SELECT 1 FROM public.whatsapp_messages m
                        WHERE m.contact_id = f.contact_id AND m.direction = 'inbound')) DESC,
              f.created_at ASC
  LOOP
    -- 1. Espaçamento por LEVA: micro-gap dentro da leva; pausa de intervalo entre levas
    IF v_idx > 0 THEN
      IF v_count_leva >= v_tam_leva THEN
        v_clock := v_clock + make_interval(mins => v_int_leva);
        v_count_leva := 0;
      ELSE
        v_gap := 20 + floor(random() * 21)::int;        -- 20..40s dentro da leva
        v_clock := v_clock + make_interval(secs => v_gap);
      END IF;
    END IF;

    -- 2. Slot válido (janela 08–20h + cap diário de segurança com ramp) — inalterado
    LOOP
      IF v_clock::time < v_jini THEN
        v_clock := date_trunc('day', v_clock) + v_jini::interval;
      ELSIF v_clock::time >= v_jfim THEN
        v_clock := date_trunc('day', v_clock) + interval '1 day' + v_jini::interval;
      END IF;

      IF v_current_day IS NULL OR v_clock::date <> v_current_day THEN
        v_current_day := v_clock::date;
        v_day_number  := v_day_number + 1;
        v_count_day   := 0;
        v_count_leva  := 0;   -- novo dia começa leva nova
        v_day_cap := CASE
                       WHEN NOT v_ramp        THEN v_cap
                       WHEN v_day_number = 1  THEN LEAST(v_cap, 100)
                       WHEN v_day_number = 2  THEN LEAST(v_cap, 200)
                       ELSE v_cap
                     END;
        v_day_cap := GREATEST(v_day_cap, 1);
      END IF;

      IF v_count_day >= v_day_cap THEN
        v_clock := date_trunc('day', v_clock) + interval '1 day' + v_jini::interval;
        CONTINUE;
      END IF;

      EXIT;
    END LOOP;

    -- 3. Render "lista preenche, CRM completa" — INALTERADO
    v_eff := jsonb_build_object(
      'nome',          COALESCE(NULLIF(btrim(rec.nome), ''), ''),
      'primeiro_nome', split_part(COALESCE(rec.nome, ''), ' ', 1),
      'sobrenome',     COALESCE(rec.sobrenome, ''),
      'email',         COALESCE(rec.email, ''),
      'telefone',      COALESCE(rec.telefone, '')
    );
    FOR v_k, v_v IN SELECT key, value FROM jsonb_each_text(COALESCE(rec.variaveis, '{}'::jsonb)) LOOP
      IF v_v IS NOT NULL AND btrim(v_v) <> '' THEN
        v_eff := jsonb_set(v_eff, ARRAY[v_k], to_jsonb(v_v), true);
      ELSIF NOT (v_eff ? v_k) THEN
        v_eff := jsonb_set(v_eff, ARRAY[v_k], to_jsonb(''::text), true);
      END IF;
    END LOOP;
    v_eff := jsonb_set(v_eff, ARRAY['primeiro_nome'],
                       to_jsonb(split_part(COALESCE(v_eff->>'nome', ''), ' ', 1)), true);

    v_body := v_versions[1 + floor(random() * array_length(v_versions, 1))::int];

    LOOP
      v_spin := substring(v_body FROM '\{[^{}]*\|[^{}]*\}');
      EXIT WHEN v_spin IS NULL;
      v_opts := string_to_array(substring(v_spin FROM 2 FOR length(v_spin) - 2), '|');
      v_choice := v_opts[1 + floor(random() * array_length(v_opts, 1))::int];
      v_body := overlay(v_body PLACING COALESCE(v_choice, '')
                        FROM position(v_spin IN v_body) FOR length(v_spin));
    END LOOP;

    FOR v_k, v_v IN SELECT key, value FROM jsonb_each_text(v_eff) LOOP
      v_repl := replace(COALESCE(v_v, ''), '\', '\\');
      v_body := regexp_replace(v_body, '\{\{\s*' || v_k || '\s*\}\}', v_repl, 'gi');
      v_body := regexp_replace(v_body, '\[\s*' || v_k || '\s*\]', v_repl, 'gi');
    END LOOP;
    v_body := regexp_replace(v_body, '\{\{\s*[^}]+\s*\}\}', '', 'g');

    -- 4. Grava agenda + corpo
    UPDATE public.disparo_fila
       SET execute_at = v_clock,
           priority = CASE WHEN rec.interagiu THEN 1 ELSE 0 END,
           corpo_renderizado = v_body,
           status = 'pending',
           claimed_at = NULL,
           attempts = 0
     WHERE id = rec.id;

    v_count_day  := v_count_day + 1;
    v_count_leva := v_count_leva + 1;
    v_idx := v_idx + 1;
    v_last := v_clock;
    v_total := v_total + 1;
  END LOOP;

  out_total   := v_total;
  out_termino := v_last;
  out_dias    := CASE WHEN v_last IS NULL THEN 0
                      ELSE GREATEST(1, (v_last::date - now()::date) + 1) END;

  UPDATE public.disparo_campanhas
     SET status = CASE WHEN v_total > 0 THEN 'agendado' ELSE status END,
         total = v_total,
         estimado_termino_at = v_last,
         estimado_dias = out_dias
   WHERE id = p_campaign_id;

  RETURN NEXT;
END;
$$;

-- 3. Enviar agora -------------------------------------------------------------
-- Antecipa execute_at de itens pending (seleção explícita p_fila_ids OU os
-- próximos p_proximos_n por prioridade). Escalona ~45s entre eles (o dispatcher
-- já manda 4/min). Garante campanha ativa (pausada → agendado) senão o
-- claim_batch não drena. Valida org. Retorna quantos foram antecipados.
CREATE OR REPLACE FUNCTION public.disparo_enviar_agora(
  p_campaign_id UUID,
  p_fila_ids    UUID[] DEFAULT NULL,
  p_proximos_n  INT    DEFAULT NULL
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org    UUID;
  v_status TEXT;
  v_n      INT := 0;
  v_i      INT := 0;
  rec      RECORD;
BEGIN
  SELECT org_id, status INTO v_org, v_status
    FROM public.disparo_campanhas WHERE id = p_campaign_id;
  IF v_org IS NULL OR v_org <> requesting_org_id() THEN
    RAISE EXCEPTION 'Sem permissão para esta campanha' USING ERRCODE = 'insufficient_privilege';
  END IF;

  FOR rec IN
    SELECT id FROM public.disparo_fila
     WHERE campaign_id = p_campaign_id
       AND status = 'pending'
       AND (p_fila_ids IS NULL OR id = ANY(p_fila_ids))
     ORDER BY priority DESC, execute_at ASC
     LIMIT CASE WHEN p_fila_ids IS NOT NULL THEN NULL
                ELSE GREATEST(COALESCE(p_proximos_n, 0), 0) END
  LOOP
    UPDATE public.disparo_fila
       SET execute_at = now() + make_interval(secs => v_i * 45),
           priority   = 2,
           claimed_at = NULL
     WHERE id = rec.id;
    v_i := v_i + 1;
    v_n := v_n + 1;
  END LOOP;

  IF v_n > 0 AND v_status = 'pausado' THEN
    UPDATE public.disparo_campanhas
       SET status = 'agendado', paused_at = NULL
     WHERE id = p_campaign_id;
  END IF;

  RETURN v_n;
END;
$$;

-- 4. Ajustar ritmo ------------------------------------------------------------
-- Atualiza colunas de ritmo + cap_diario (teto derivado) e reescala os
-- pendentes reusando disparo_calcular_agenda (que só toca 'pending').
CREATE OR REPLACE FUNCTION public.disparo_ajustar_ritmo(
  p_campaign_id       UUID,
  p_tamanho_leva      INT,
  p_intervalo_leva_min INT,
  p_cap_diario        INT,
  p_usar_ramp         BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org UUID;
BEGIN
  SELECT org_id INTO v_org FROM public.disparo_campanhas WHERE id = p_campaign_id;
  IF v_org IS NULL OR v_org <> requesting_org_id() THEN
    RAISE EXCEPTION 'Sem permissão para esta campanha' USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE public.disparo_campanhas
     SET tamanho_leva       = GREATEST(COALESCE(p_tamanho_leva, 10), 1),
         intervalo_leva_min = GREATEST(COALESCE(p_intervalo_leva_min, 30), 0),
         cap_diario         = GREATEST(COALESCE(p_cap_diario, cap_diario), 1),
         usar_ramp          = COALESCE(p_usar_ramp, usar_ramp)
   WHERE id = p_campaign_id;

  PERFORM public.disparo_calcular_agenda(p_campaign_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.disparo_enviar_agora(UUID, UUID[], INT)        TO authenticated;
GRANT EXECUTE ON FUNCTION public.disparo_ajustar_ritmo(UUID, INT, INT, INT, BOOLEAN) TO authenticated;

COMMIT;
```

- [ ] **Step 2: Aplicar no staging** — `bash .claude/hooks/apply-to-staging.sh supabase/migrations/20260615a_disparo_ritmo_controle.sql` (staging defasado pode falhar em objetos que dependem de `contatos`; se falhar por isso, validar no prod read-only no Step 3).

- [ ] **Step 3: Validar no banco real (read-only, BEGIN…ROLLBACK via Management API)** — criar campanha fake, ingest 5 nº fake, `disparo_calcular_agenda` com tamanho_leva=2/intervalo=5 → conferir que execute_at forma levas de 2 espaçadas ~5min; `disparo_enviar_agora(cid, NULL, 3)` → 3 itens com execute_at ~now escalonado 45s; `disparo_enviar_agora(cid, ARRAY[id1,id2])` → só esses; org-guard: chamar com campanha de outra org → exception. Tudo em `BEGIN; … ROLLBACK;`.

- [ ] **Step 4: Commit** — `git add supabase/migrations/20260615a_disparo_ritmo_controle.sql && git commit`.

---

## Task 2 — Tipos + hooks de ação

**Files:**
- Modify: `src/hooks/disparo/types.ts` (DisparoCampanha)
- Modify: `src/hooks/disparo/useDisparoActions.ts`

- [ ] **Step 1: `types.ts`** — em `DisparoCampanha` adicionar:
```ts
  tamanho_leva: number
  intervalo_leva_min: number
```

- [ ] **Step 2: `useDisparoActions.ts`** — `CriarCampanhaInput` ganha `tamanho_leva: number; intervalo_leva_min: number;`. No insert de `criarCampanha`, incluir `tamanho_leva: input.tamanho_leva, intervalo_leva_min: input.intervalo_leva_min`. Adicionar duas ações:
```ts
const enviarAgora = useCallback(
  async (campaignId: string, opts: { filaIds?: string[]; proximosN?: number }): Promise<number> => {
    const { data, error } = await sbAny.rpc('disparo_enviar_agora', {
      p_campaign_id: campaignId,
      p_fila_ids: opts.filaIds && opts.filaIds.length > 0 ? opts.filaIds : null,
      p_proximos_n: opts.proximosN ?? null,
    })
    if (error) throw error
    invalidate()
    return (data ?? 0) as number
  },
  [invalidate],
)

const ajustarRitmo = useCallback(
  async (campaignId: string, r: { tamanhoLeva: number; intervaloMin: number; capDiario: number; usarRamp: boolean }) => {
    const { error } = await sbAny.rpc('disparo_ajustar_ritmo', {
      p_campaign_id: campaignId,
      p_tamanho_leva: r.tamanhoLeva,
      p_intervalo_leva_min: r.intervaloMin,
      p_cap_diario: r.capDiario,
      p_usar_ramp: r.usarRamp,
    })
    if (error) throw error
    invalidate()
  },
  [invalidate],
)
```
Adicionar `enviarAgora, ajustarRitmo` ao return.

- [ ] **Step 3: Commit.**

---

## Task 3 — Modal de criação: controle de ritmo (leva + intervalo)

**Files:**
- Modify: `src/components/disparo/ComporDisparoModal.tsx`

- [ ] **Step 1: Estado + helper de estimativa.** Trocar `const [capDiario,setCapDiario]=useState(50)` por estado de ritmo:
```ts
const [tamanhoLeva, setTamanhoLeva] = useState(10)
const [intervaloValor, setIntervaloValor] = useState(30)
const [intervaloUnidade, setIntervaloUnidade] = useState<'min' | 'h'>('min')
const intervaloMin = intervaloUnidade === 'h' ? intervaloValor * 60 : intervaloValor
```
Helper de derivação (substitui o uso de cap como controle):
```ts
// ~30s por msg dentro da leva; janela 08–20h = 720 min
function derivarPorDia(tamanhoLeva: number, intervaloMin: number): number {
  const cycle = Math.max(intervaloMin + tamanhoLeva * 0.5, 1)
  const levasDia = Math.max(1, Math.floor(720 / cycle))
  return Math.max(levasDia * tamanhoLeva, tamanhoLeva)
}
```
`estimarDias(n, cap, ramp)` continua igual, mas `cap = derivarPorDia(...)`.

- [ ] **Step 2: UI do bloco "Ritmo de envio".** Substituir o input "Máximo por dia" por:
```
Manda [tamanhoLeva] pessoas a cada [intervaloValor] [min|horas ▾]   (só das 08h às 20h)
☑ Começar devagar nos primeiros dias (recomendado)
≈ {derivarPorDia} por dia
```
Reusar os avisos de risco atuais com base em `derivarPorDia(...)`: `> 80` atenção (olive), `> 200` alto (rosewood), mesmo texto.

- [ ] **Step 3: Propagar no `criarCampanha`** — em `handleReview`, passar `tamanho_leva: tamanhoLeva, intervalo_leva_min: intervaloMin` e `cap_diario: derivarPorDia(tamanhoLeva, intervaloMin)`. `reset()` zera os novos estados (10 / 30 / 'min'). Texto da revisão troca "até X/dia" por "≈ X/dia · em levas de N · só das 08h às 20h".

- [ ] **Step 4: `npm run build` + commit.**

---

## Task 4 — Painel de controle do disparo (upgrade do relatório)

**Files:**
- Modify: `src/components/disparo/DisparoRelatorioModal.tsx`

- [ ] **Step 1: Cabeçalho com números grandes + próxima leva.** Derivar de `itens`:
```ts
const enviados = counts['sent'] ?? 0
const faltam   = (counts['pending'] ?? 0) + (counts['processing'] ?? 0)
const proxima  = itens.filter(i => i.status === 'pending').sort((a,b)=>a.execute_at<b.execute_at?-1:1)[0]?.execute_at ?? null
```
Mostrar bloco no topo: `{enviados} enviados · {faltam} faltam` (+ falhas/saíram menores) e "próxima leva: {fmtDateTime(proxima)}" quando houver pendente.

- [ ] **Step 2: Seleção + "Enviar agora".** Adicionar `const [sel, setSel] = useState<Set<string>>(new Set())`. Checkbox por item `pending` na lista (à esquerda). Barra de ação fixa acima da lista quando há pendentes:
  - "Enviar os próximos [N] agora" (input number pequeno, default 10) → `enviarAgora(campaignId, { proximosN })`.
  - Quando `sel.size > 0`: "Enviar {sel.size} selecionados agora" → `enviarAgora(campaignId, { filaIds: [...sel] })`, depois `setSel(new Set())`.
  - Aviso (texto olive) se `proximosN`/`sel.size` > 30, ou se hora local fora de 08–20h ("fora do horário recomendado — enviar mesmo assim?" via `window.confirm`).
  Usar `useDisparoActions().enviarAgora`.

- [ ] **Step 3: Mudar ritmo + pausar/retomar no painel.** Cabeçalho ganha botão "Mudar ritmo" → mini-form inline (tamanho_leva, intervalo+unidade, ramp) → `ajustarRitmo(campaignId, {...})`. (Pausar/retomar já existem no board; opcional repetir aqui.) Buscar a campanha via `useDisparoCampanhas` (já carregada no board) — passar `campanha` como prop nova OU buscar `cap_diario`/ritmo atuais; passar a `DisparoCampanha` inteira como prop do modal a partir do board.

- [ ] **Step 4: Props.** `DisparoRelatorioModal` passa a receber `campanha: DisparoCampanha` (em vez de só `titulo`). Ajustar `DisparosBoard` para passar o objeto.

- [ ] **Step 5: `npm run build` + commit.**

---

## Task 5 — Board: mostrar "faltam" + próxima leva

**Files:**
- Modify: `src/components/disparo/DisparosBoard.tsx`

- [ ] **Step 1: Linha da campanha.** No resumo (hoje `enviados de total`), somar `· {faltam} faltam` onde `faltam = total - (enviados+falhados+opt_outs)`. Manter barra de progresso. (Próxima leva exata depende da fila; manter no painel, não na linha, pra não puxar fila por campanha no board.)

- [ ] **Step 2: Passar `campanha` ao abrir o painel** (em vez de `{id,titulo}`), casando com Task 4 Step 4.

- [ ] **Step 3: `npm run build` + commit.**

---

## Task 6 — Verificação final

- [ ] `npm run build` limpo (typecheck incluso).
- [ ] Teste seguro ponta-a-ponta: linha **"Teste Vitor"** + só nº do Vitor (11964293533) — criar disparo com ritmo, ver levas; "enviar agora" 1 pessoa; conferir chegada. **Nunca** lista real antes do ok do Vitor.
- [ ] `npm run sync:fix` se algum arquivo novo de hook/componente (não há novos arquivos — só edições; rodar mesmo assim p/ garantir inventário).
- [ ] Atualizar `memory/project_disparo_livre.md` com o novo recurso.

---

## Self-review (cobertura do spec)

- Definir ritmo (X a cada Y, min/horas) → Task 1 (agenda) + Task 3 (UI). ✔
- Enviar leva agora (próximos N **e** seleção) → Task 1 (`disparo_enviar_agora`) + Task 4. ✔
- Saber quais faltam → Task 4 (contadores grandes + próxima leva) + Task 5 (board). ✔
- Ritmo editável rodando → Task 1 (`disparo_ajustar_ritmo`) + Task 4 Step 3. ✔
- Segurança (escalonado, avisos, org-guard) → Task 1 RPCs + Task 3/4 avisos. ✔
- Backward-compat (colunas com default) → Task 1 Step 1. ✔
- Sem placeholders; assinaturas casam entre tasks (`enviarAgora`, `ajustarRitmo`, props `campanha`). ✔
