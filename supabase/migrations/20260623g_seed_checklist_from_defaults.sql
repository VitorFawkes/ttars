-- Seed do checklist do casamento: carimba a ENTRADA (F1/D-P5) + LÊ a tabela de
-- defaults editável (F2). UMA recriação só da função (estampa + origem das tarefas).
--
-- Antes (20260623a): INSERT de 7 tarefas hardcoded, sem carimbo de entrada.
-- Agora: (1) carimba cards.produto_data.ww_planej_pos_venda_em UMA vez na entrada
-- em pos_venda (base do relógio de prazo — NÃO usa stage_entered_at, que é resetado
-- a cada troca de sub-etapa); (2) semeia o checklist a partir de
-- wedding_stage_default_tasks (ativo), pra editar as tarefas-padrão no Studio mudar
-- o que casamentos NOVOS recebem, sem dev.
--
-- TOP-5 #5 — fonte relida: 20260623a. PRESERVA todas as guardas (WEDDING, slug
-- pos_venda, OLD != pos_venda, idempotência por card). Só muda o corpo do INSERT
-- e adiciona o carimbo. marco/tipo/ordem vêm do default → a espinha agrupa igual.

BEGIN;

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

  -- (F1/D-P5) Carimba a ENTRADA no planejamento (uma vez) — base do relógio.
  -- UPDATE só de produto_data: não mexe em pipeline_stage_id, então este mesmo
  -- trigger (AFTER UPDATE OF pipeline_stage_id) não re-dispara.
  UPDATE public.cards
     SET produto_data = jsonb_set(
           COALESCE(produto_data, '{}'::jsonb),
           '{ww_planej_pos_venda_em}',
           to_jsonb(now()::date::text),
           true)
   WHERE id = NEW.id
     AND NOT (COALESCE(produto_data, '{}'::jsonb) ? 'ww_planej_pos_venda_em');

  -- Idempotência: não re-semeia se já existe checklist pro card
  IF EXISTS (SELECT 1 FROM public.wedding_checklist WHERE card_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  -- (F2) Semeia a partir das tarefas-padrão EDITÁVEIS (wedding_stage_default_tasks).
  -- org_id é OMITIDO: trg_wedding_checklist_strict_org carimba de cards.org_id.
  -- prazo = entrada + dias_prazo (NULL => sem prazo, planejadora preenche).
  INSERT INTO public.wedding_checklist (card_id, titulo, tipo, marco, ordem, feito, prazo)
  SELECT NEW.id,
         d.titulo,
         d.tipo,
         d.marco,
         d.ordem,
         false,
         CASE WHEN d.dias_prazo IS NULL THEN NULL ELSE (now()::date + d.dias_prazo) END
    FROM public.wedding_stage_default_tasks d
    JOIN public.pipeline_stages s ON s.id = d.stage_id
   WHERE d.org_id = NEW.org_id
     AND d.ativo = true
     AND s.pipeline_id = NEW.pipeline_id
   ORDER BY s.ordem, d.ordem;

  RETURN NEW;
END
$fn$;

COMMIT;

-- ─── Validação ──────────────────────────────────────────────────────────────
DO $$
DECLARE v_def TEXT;
BEGIN
  v_def := pg_get_functiondef('public.seed_wedding_checklist_on_pos_venda()'::regprocedure);
  IF v_def NOT LIKE '%wedding_stage_default_tasks%' THEN
    RAISE EXCEPTION 'seed: ainda não lê wedding_stage_default_tasks';
  END IF;
  IF v_def NOT LIKE '%ww_planej_pos_venda_em%' THEN
    RAISE EXCEPTION 'seed: carimbo de entrada (F1) ausente';
  END IF;
  -- guardas preservadas
  IF v_def NOT LIKE '%pos_venda%' OR v_def NOT LIKE '%WEDDING%' THEN
    RAISE EXCEPTION 'seed: guardas WEDDING/pos_venda ausentes';
  END IF;
  RAISE NOTICE 'seed lê defaults + carimba entrada + guardas preservadas: OK';
END $$;
