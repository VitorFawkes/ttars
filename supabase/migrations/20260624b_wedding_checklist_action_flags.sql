-- Fase 4 (Planejamento Weddings) — passo 1 de 3: a linha do checklist passa a
-- SABER se trava/cobra/abre-doc e a qual ETAPA pertence.
--
-- Hoje as flags trava/gera_cobranca/abre_doc vivem SÓ em wedding_stage_default_tasks
-- (o catálogo editável no Studio). O seed (20260623g) e o backfill (20260624a)
-- copiam só titulo/tipo/marco/ordem/prazo pra wedding_checklist — NÃO as flags.
-- Resultado: por LINHA do casamento não dá pra saber o que trava nem o que cobra,
-- então a trava 🔒 e a cobrança 🔁 não têm como agir.
--
-- Esta migration:
--   1. Adiciona stage_id + trava + gera_cobranca + abre_doc em wedding_checklist.
--   2. Backfilla as 2552 linhas existentes a partir das defaults, casando por
--      (org_id, marco, titulo) — chave única do seed (verificado no banco real).
--   3. Instala um trigger BEFORE INSERT que HERDA stage_id + flags do default
--      sempre que stage_id vier NULL. Isso cobre o seed (que insere sem as flags),
--      adições manuais que casem com um default, e qualquer insert futuro —
--      SEM recriar a função seed_wedding_checklist_on_pos_venda (que tem histórico
--      de rebase, TOP-5 #5; preferimos um gatilho novo a tocá-la de novo).
--
-- Nada paralelo: continua a LENTE do funil nativo; stage_id é o stage REAL do
-- pos_venda WEDDING (ponte pra migração nativa da Fase 5).

BEGIN;

-- ─── 1. Colunas novas ───────────────────────────────────────────────────────
ALTER TABLE public.wedding_checklist
  ADD COLUMN IF NOT EXISTS stage_id      UUID REFERENCES public.pipeline_stages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS trava         BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS gera_cobranca BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS abre_doc      BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.wedding_checklist.stage_id IS
  'Etapa (pipeline_stages) do pos_venda WEDDING a que esta tarefa pertence — herdada do default. Base da trava 🔒 (a tarefa-trava da etapa segura o avanço dessa etapa). NULL = avulsa sem default correspondente.';
COMMENT ON COLUMN public.wedding_checklist.trava IS
  'A tarefa segura o avanço da etapa enquanto não estiver feita (Fase 4). Herdada de wedding_stage_default_tasks.trava.';
COMMENT ON COLUMN public.wedding_checklist.gera_cobranca IS
  'Quando o prazo vence e não está feita, nasce sozinha uma tarefa de recobrança (cron ww-cobranca-tarefas-vencidas). Herdada de wedding_stage_default_tasks.gera_cobranca.';
COMMENT ON COLUMN public.wedding_checklist.abre_doc IS
  'A tarefa abre um documento/anexo (ex.: "ler o contrato"). Herdada de wedding_stage_default_tasks.abre_doc.';

-- índice pro gate da trava (tarefas-trava pendentes da etapa de um card)
CREATE INDEX IF NOT EXISTS idx_wedding_checklist_card_stage
  ON public.wedding_checklist(card_id, stage_id);

-- ─── 2. Backfill das linhas existentes a partir das defaults ─────────────────
-- Casa por (org_id, marco, titulo): chave única no seed (cada etapa tem títulos
-- únicos e o marco carrega o prefixo da etapa). Tarefas avulsas/renomeadas à mão
-- não casam → ficam com flags false e stage_id NULL (não travam nem cobram), o
-- que é o comportamento correto (só as padrão agem).
UPDATE public.wedding_checklist wc
   SET stage_id      = d.stage_id,
       trava         = d.trava,
       gera_cobranca = d.gera_cobranca,
       abre_doc      = d.abre_doc
  FROM public.wedding_stage_default_tasks d
 WHERE d.org_id = wc.org_id
   AND d.marco  IS NOT DISTINCT FROM wc.marco
   AND d.titulo = wc.titulo
   AND wc.stage_id IS NULL;

-- ─── 3. Herança automática das flags em todo INSERT novo ─────────────────────
-- O seed (seed_wedding_checklist_on_pos_venda) insere SÓ titulo/tipo/marco/ordem/
-- prazo. Em vez de recriar a função-seed (rebase-prone), este gatilho preenche
-- stage_id + flags a partir do default casando por (org_id, marco, titulo) quando
-- stage_id ainda não veio. Roda DEPOIS do strict-org (alfabético: "strict_org" <
-- "z_inherit") → NEW.org_id já está carimbado de cards.org_id.
CREATE OR REPLACE FUNCTION public.wedding_checklist_inherit_default_flags()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  d RECORD;
BEGIN
  -- Já tem etapa definida (insert explícito) → respeita, não sobrescreve.
  IF NEW.stage_id IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.org_id IS NULL OR NEW.marco IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT dt.stage_id, dt.trava, dt.gera_cobranca, dt.abre_doc
    INTO d
    FROM public.wedding_stage_default_tasks dt
   WHERE dt.org_id = NEW.org_id
     AND dt.marco  = NEW.marco
     AND dt.titulo = NEW.titulo
   LIMIT 1;

  IF FOUND THEN
    NEW.stage_id      := d.stage_id;
    NEW.trava         := d.trava;
    NEW.gera_cobranca := d.gera_cobranca;
    NEW.abre_doc      := d.abre_doc;
  END IF;

  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS trg_wedding_checklist_z_inherit_flags ON public.wedding_checklist;
CREATE TRIGGER trg_wedding_checklist_z_inherit_flags
  BEFORE INSERT ON public.wedding_checklist
  FOR EACH ROW
  EXECUTE FUNCTION public.wedding_checklist_inherit_default_flags();

COMMIT;

-- ─── Validação ──────────────────────────────────────────────────────────────
DO $$
DECLARE v_cols INT; v_trava INT; v_trig INT;
BEGIN
  SELECT count(*) INTO v_cols
    FROM information_schema.columns
   WHERE table_schema='public' AND table_name='wedding_checklist'
     AND column_name IN ('stage_id','trava','gera_cobranca','abre_doc');
  IF v_cols <> 4 THEN
    RAISE EXCEPTION 'wedding_checklist: esperava 4 colunas novas, achei %', v_cols;
  END IF;

  SELECT count(*) INTO v_trig FROM pg_trigger
   WHERE tgname='trg_wedding_checklist_z_inherit_flags'
     AND tgrelid='public.wedding_checklist'::regclass;
  IF v_trig = 0 THEN
    RAISE EXCEPTION 'gatilho de herança de flags não criado';
  END IF;

  SELECT count(*) INTO v_trava FROM public.wedding_checklist WHERE trava = true;
  RAISE NOTICE 'wedding_checklist flags: OK (% linhas trava=true após backfill)', v_trava;
END $$;
