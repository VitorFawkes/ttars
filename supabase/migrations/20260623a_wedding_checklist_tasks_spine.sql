-- Tarefas como espinha do Planejamento (Welcome Weddings)
-- Hierarquia Etapa → Marco → Tarefa: uma tarefa rola pra cima e ajuda a atingir
-- um marco. Reunião é uma tarefa com tipo 'reuniao'. As 7 tarefas-padrão são
-- semeadas SÓ pra casamentos NOVOS, quando o card entra na fase pos_venda.
--
-- Decisões: docs/weddings + plano expressive-honking-puzzle (v3).
-- Tabela base: 20260615k_wedding_checklist.sql (org_id carimbado por
-- trg_wedding_checklist_strict_org BEFORE INSERT → insert pode omitir org_id).

BEGIN;

-- ── 1. Colunas novas ────────────────────────────────────────────────────────
ALTER TABLE public.wedding_checklist
  ADD COLUMN IF NOT EXISTS tipo  TEXT    NOT NULL DEFAULT 'tarefa',
  ADD COLUMN IF NOT EXISTS marco TEXT,                       -- 'etapa:key' | NULL (avulsa)
  ADD COLUMN IF NOT EXISTS ordem INTEGER NOT NULL DEFAULT 0;

-- tipo: lista fechada (enxuta, espelha taskTypeConfig do CRM)
ALTER TABLE public.wedding_checklist
  DROP CONSTRAINT IF EXISTS chk_wedding_checklist_tipo;
ALTER TABLE public.wedding_checklist
  ADD CONSTRAINT chk_wedding_checklist_tipo
  CHECK (tipo IN ('reuniao','tarefa','pagamento','documento','reserva','bloqueio','lista'));

COMMENT ON COLUMN public.wedding_checklist.tipo  IS 'Tipo da tarefa (reuniao, tarefa, pagamento, documento, reserva, bloqueio, lista). Reunião = tarefa com tipo reuniao.';
COMMENT ON COLUMN public.wedding_checklist.marco IS 'Marco ao qual a tarefa rola pra cima — chave "etapa:key" (ex: definicao:reserva). NULL = tarefa avulsa.';
COMMENT ON COLUMN public.wedding_checklist.ordem IS 'Ordem manual dentro do marco/etapa (asc). Tarefas-padrão nascem 0..6.';

CREATE INDEX IF NOT EXISTS idx_wedding_checklist_card_marco_ordem
  ON public.wedding_checklist(card_id, marco, ordem);

-- ── 2. Semeadura das 7 tarefas-padrão SÓ pra casamentos NOVOS ───────────────
-- Dispara na transição de pipeline_stage_id que ENTRA na fase pos_venda
-- (marcar_ganho e mover_card fazem esse UPDATE). Guarda de idempotência: só
-- semeia se o card é WEDDING e ainda não tem nenhuma linha em wedding_checklist.
-- Casamentos já em pos_venda nunca cruzam a fronteira → nunca são semeados.
CREATE OR REPLACE FUNCTION public.seed_wedding_checklist_on_pos_venda()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_old_phase_slug TEXT;
  v_new_phase_slug TEXT;
  v_produto        TEXT;
BEGIN
  -- Só age em mudança real de etapa
  IF NEW.pipeline_stage_id IS NOT DISTINCT FROM OLD.pipeline_stage_id THEN
    RETURN NEW;
  END IF;
  IF NEW.pipeline_stage_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Produto do card (via pipeline). Só WEDDING.
  SELECT p.produto::TEXT INTO v_produto
    FROM public.pipelines p
   WHERE p.id = NEW.pipeline_id;
  IF v_produto IS DISTINCT FROM 'WEDDING' THEN
    RETURN NEW;
  END IF;

  -- Slugs das fases OLD e NEW
  SELECT pp.slug INTO v_new_phase_slug
    FROM public.pipeline_stages s
    JOIN public.pipeline_phases pp ON pp.id = s.phase_id
   WHERE s.id = NEW.pipeline_stage_id;

  IF v_new_phase_slug IS DISTINCT FROM 'pos_venda' THEN
    RETURN NEW;
  END IF;

  IF OLD.pipeline_stage_id IS NOT NULL THEN
    SELECT pp.slug INTO v_old_phase_slug
      FROM public.pipeline_stages s
      JOIN public.pipeline_phases pp ON pp.id = s.phase_id
     WHERE s.id = OLD.pipeline_stage_id;
  END IF;

  -- Só na ENTRADA em pos_venda (origem != pos_venda)
  IF v_old_phase_slug IS NOT DISTINCT FROM 'pos_venda' THEN
    RETURN NEW;
  END IF;

  -- Idempotência: não re-semeia se já existe checklist pro card
  IF EXISTS (SELECT 1 FROM public.wedding_checklist WHERE card_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  -- Insere as 7 tarefas-padrão (prazo NULL — planejadora preenche).
  -- org_id é OMITIDO de propósito: trg_wedding_checklist_strict_org carimba a
  -- partir de cards.org_id.
  INSERT INTO public.wedding_checklist (card_id, titulo, tipo, marco, ordem, feito, prazo)
  VALUES
    (NEW.id, 'Primeira Reunião',
       'reuniao',   'onboarding:reuniao1',    0, false, NULL),
    (NEW.id, 'Definição do Destino, Local da Cerimônia e Data do Casamento',
       'reserva',   'propostas:definicao',    1, false, NULL),
    (NEW.id, 'Reserva da Cerimônia',
       'reserva',   'definicao:reserva',      2, false, NULL),
    (NEW.id, 'Documentação',
       'documento', 'definicao:documentacao', 3, false, NULL),
    (NEW.id, 'Pagamento',
       'pagamento', 'definicao:pagamento',    4, false, NULL),
    (NEW.id, 'Bloqueio de Apartamentos',
       'bloqueio',  'passagem:bloqueio',      5, false, NULL),
    (NEW.id, 'Elaboração da Lista de Convidados',
       'lista',     'aditivo:lista',          6, false, NULL);

  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS trg_seed_wedding_checklist_on_pos_venda ON public.cards;
CREATE TRIGGER trg_seed_wedding_checklist_on_pos_venda
  AFTER UPDATE OF pipeline_stage_id ON public.cards
  FOR EACH ROW
  WHEN (NEW.pipeline_stage_id IS DISTINCT FROM OLD.pipeline_stage_id)
  EXECUTE FUNCTION public.seed_wedding_checklist_on_pos_venda();

COMMIT;

-- ── Validação ───────────────────────────────────────────────────────────────
DO $$
DECLARE
  col_count INT;
  trig_count INT;
BEGIN
  SELECT COUNT(*) INTO col_count FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'wedding_checklist'
     AND column_name IN ('tipo','marco','ordem');
  IF col_count <> 3 THEN
    RAISE EXCEPTION 'wedding_checklist: colunas tipo/marco/ordem faltando (achei %)', col_count;
  END IF;

  SELECT COUNT(*) INTO trig_count FROM pg_trigger
   WHERE tgname = 'trg_seed_wedding_checklist_on_pos_venda'
     AND tgrelid = 'public.cards'::regclass;
  IF trig_count = 0 THEN
    RAISE EXCEPTION 'gatilho trg_seed_wedding_checklist_on_pos_venda não criado';
  END IF;

  RAISE NOTICE 'wedding_checklist tasks-spine: validação OK';
END $$;
