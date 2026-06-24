-- Fase 4 (Planejamento Weddings) — passo 2 de 3: a trava 🔒 SEGURA o avanço.
--
-- Decisão da Diana (D-P1/D39): a etapa só avança quando as tarefas obrigatórias
-- (trava) dela estão feitas. Hoje nada trava (a migration 20260623b zerou
-- is_blocking dos configs pos_venda pra o arraste do board funcionar; o gate de
-- frontend é só visual). Pior: o board de Planejamento chama mover_card DIRETO
-- (useUpdatePlanejamentoEtapa) sem passar pelo useQualityGate — então uma trava
-- só de frontend seria pulada justamente na tela onde a planejadora mais arrasta.
--
-- POR QUE UM TRIGGER (e não estender validate_stage_requirements nem mexer no
-- mover_card): mover_card e validate_stage_requirements têm histórico de rebase
-- (TOP-5 #5) e são genéricos da plataforma — injetar leitura de wedding_checklist
-- neles é acoplamento errado. Um trigger BEFORE UPDATE em cards, escopado a
-- WEDDING, fecha TODOS os caminhos de avanço de uma vez (board, Kanban,
-- CardDetail, RPC direto), porque todos terminam num UPDATE de
-- cards.pipeline_stage_id. É o mesmo lugar onde já vivem o seed e o
-- aa_skip_stage_requirements_on_compartilhado.
--
-- REGRAS:
--   • Só age em card WEDDING.
--   • Só trava AVANÇO (ordem maior) DENTRO da fase pos_venda. Voltar é livre;
--     sair do pos_venda (cancelar/perder/resolução) NUNCA é travado.
--   • Bloqueia se ALGUMA etapa entre a origem (inclusive) e o destino (exclusive)
--     tem tarefa-trava pendente (trava=true, feito=false). Checar a faixa de
--     ordem — não só a origem — fecha o "leapfrog": pular etapas no arraste do
--     board não burla os cadeados das etapas intermediárias puladas.
--   • Escape hatch: GUC DEDICADO app.bypass_wedding_trava (que NADA seta por
--     padrão). NÃO reusa app.bypass_stage_requirements de propósito — esse é
--     setado pelo handoff compartilhado / auto_advance e furaria a trava sem
--     querer se uma etapa pos_venda virasse compartilhada no futuro.

BEGIN;

CREATE OR REPLACE FUNCTION public.wedding_block_advance_on_pending_trava()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_produto        TEXT;
  v_old_slug       TEXT;
  v_new_slug       TEXT;
  v_old_ordem      INT;
  v_new_ordem      INT;
  v_count          INT;
  v_titulos        TEXT;
BEGIN
  -- Só mudança real de etapa
  IF NEW.pipeline_stage_id IS NOT DISTINCT FROM OLD.pipeline_stage_id THEN
    RETURN NEW;
  END IF;
  IF NEW.pipeline_stage_id IS NULL OR OLD.pipeline_stage_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Escape hatch DEDICADO (nada seta por padrão; não reusa o GUC genérico de
  -- requisitos pra não ser furada pelo bypass de team_member/auto_advance).
  IF current_setting('app.bypass_wedding_trava', true) = 'true' THEN
    RETURN NEW;
  END IF;

  -- Só WEDDING
  SELECT p.produto::TEXT INTO v_produto
    FROM public.pipelines p WHERE p.id = NEW.pipeline_id;
  IF v_produto IS DISTINCT FROM 'WEDDING' THEN
    RETURN NEW;
  END IF;

  -- Fases + ordem das etapas de origem e destino
  SELECT pp.slug, s.ordem INTO v_old_slug, v_old_ordem
    FROM public.pipeline_stages s
    JOIN public.pipeline_phases pp ON pp.id = s.phase_id
   WHERE s.id = OLD.pipeline_stage_id;

  SELECT pp.slug, s.ordem INTO v_new_slug, v_new_ordem
    FROM public.pipeline_stages s
    JOIN public.pipeline_phases pp ON pp.id = s.phase_id
   WHERE s.id = NEW.pipeline_stage_id;

  -- Só trava avanço DENTRO do pos_venda. Sair do pos_venda (perder/cancelar/
  -- resolução) ou voltar de etapa nunca trava.
  IF v_old_slug IS DISTINCT FROM 'pos_venda' OR v_new_slug IS DISTINCT FROM 'pos_venda' THEN
    RETURN NEW;
  END IF;
  IF COALESCE(v_new_ordem, 0) <= COALESCE(v_old_ordem, 0) THEN
    RETURN NEW;
  END IF;

  -- Tarefas-trava pendentes de TODA etapa sendo deixada/pulada: ordem da origem
  -- (inclusive) até a do destino (exclusive). Fecha o leapfrog do board.
  SELECT count(*) INTO v_count
    FROM public.wedding_checklist wc
    JOIN public.pipeline_stages s ON s.id = wc.stage_id
   WHERE wc.card_id = NEW.id
     AND wc.trava = true
     AND wc.feito = false
     AND s.pipeline_id = NEW.pipeline_id
     AND s.ordem >= v_old_ordem
     AND s.ordem <  v_new_ordem;

  IF v_count > 0 THEN
    SELECT string_agg('“' || x.titulo || '”', ', ' ORDER BY x.etapa_ordem, x.ordem)
      INTO v_titulos
      FROM (
        SELECT wc.titulo, s.ordem AS etapa_ordem, wc.ordem
          FROM public.wedding_checklist wc
          JOIN public.pipeline_stages s ON s.id = wc.stage_id
         WHERE wc.card_id = NEW.id
           AND wc.trava = true
           AND wc.feito = false
           AND s.pipeline_id = NEW.pipeline_id
           AND s.ordem >= v_old_ordem
           AND s.ordem <  v_new_ordem
         ORDER BY s.ordem, wc.ordem
         LIMIT 3
      ) x;

    RAISE EXCEPTION 'Esta etapa está travada: conclua % antes de avançar%.',
      v_titulos,
      CASE WHEN v_count > 3 THEN ' (e mais ' || (v_count - 3) || ')' ELSE '' END
      USING ERRCODE = 'check_violation',
            HINT = 'As tarefas com cadeado 🔒 da etapa precisam estar concluídas para avançar.';
  END IF;

  RETURN NEW;
END
$fn$;

-- BEFORE UPDATE: roda em qualquer caminho que mude a etapa (board/Kanban/CardDetail/RPC).
DROP TRIGGER IF EXISTS trg_wedding_trava_avanco ON public.cards;
CREATE TRIGGER trg_wedding_trava_avanco
  BEFORE UPDATE OF pipeline_stage_id ON public.cards
  FOR EACH ROW
  WHEN (NEW.pipeline_stage_id IS DISTINCT FROM OLD.pipeline_stage_id)
  EXECUTE FUNCTION public.wedding_block_advance_on_pending_trava();

COMMENT ON FUNCTION public.wedding_block_advance_on_pending_trava() IS
  'Fase 4 Weddings: bloqueia o AVANÇO (ordem maior) dentro do pos_venda WEDDING enquanto ALGUMA etapa entre origem (inclusive) e destino (exclusive) tiver tarefa-trava (wedding_checklist.trava) não concluída — fecha o leapfrog do arraste. Voltar/sair do pos_venda nunca trava. Escape hatch dedicado: GUC app.bypass_wedding_trava (nada seta por padrão).';

COMMIT;

-- ─── Validação ──────────────────────────────────────────────────────────────
DO $$
DECLARE v_trig INT;
BEGIN
  SELECT count(*) INTO v_trig FROM pg_trigger
   WHERE tgname='trg_wedding_trava_avanco'
     AND tgrelid='public.cards'::regclass;
  IF v_trig = 0 THEN
    RAISE EXCEPTION 'trava: trigger trg_wedding_trava_avanco não criado';
  END IF;
  RAISE NOTICE 'trava de avanço Weddings: OK';
END $$;
