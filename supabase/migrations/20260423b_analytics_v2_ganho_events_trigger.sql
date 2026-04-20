-- Analytics v2 — Fase 1 (Eventos de ganho em activities)
-- Plano: Bloco 4 (activities.tipo ganha 3 valores novos: ganho_sdr_event,
-- ganho_planner_event, ganho_pos_event, inseridos em marcar_ganho).
--
-- Implementacao sem tocar em marcar_ganho: trigger AFTER INSERT/UPDATE em cards
-- que detecta transicao de ganho_* para true e registra a activity. Cobre:
--   - marcar_ganho (RPC) que seta ganho_sdr=true/ganho_planner=true
--   - handle_card_status_automation (trigger BEFORE) que seta ganho_pos=true
--     quando o card entra numa etapa is_pos_won=true
--   - UPDATEs manuais via admin/SQL
--
-- Idempotente pelo check de transicao false→true: repetidas UPDATEs com
-- ganho_*=true nao geram eventos duplicados. Junto com o backfill 20260422k
-- (NOT EXISTS), historico fica completo sem duplicatas.
--
-- Os eventos criados em marcar_ganho pela activity 'section_won' permanecem
-- (sao complementares — section_won e o "acao do humano", ganho_*_event e o
-- "milestone atingido"). Dashboards podem usar qualquer um dos dois.

BEGIN;

CREATE OR REPLACE FUNCTION public.log_ganho_events()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF (TG_OP = 'INSERT' AND COALESCE(NEW.ganho_sdr, false) = true)
     OR (TG_OP = 'UPDATE' AND COALESCE(OLD.ganho_sdr, false) = false
                         AND COALESCE(NEW.ganho_sdr, false) = true) THEN
    INSERT INTO public.activities (card_id, tipo, descricao, metadata, org_id, created_at)
    VALUES (
      NEW.id,
      'ganho_sdr_event',
      'Ganho SDR',
      jsonb_build_object(
        'source', 'trg_log_ganho_events',
        'sdr_owner_id', NEW.sdr_owner_id,
        'vendas_owner_id', NEW.vendas_owner_id
      ),
      NEW.org_id,
      COALESCE(NEW.ganho_sdr_at, NOW())
    );
  END IF;

  IF (TG_OP = 'INSERT' AND COALESCE(NEW.ganho_planner, false) = true)
     OR (TG_OP = 'UPDATE' AND COALESCE(OLD.ganho_planner, false) = false
                         AND COALESCE(NEW.ganho_planner, false) = true) THEN
    INSERT INTO public.activities (card_id, tipo, descricao, metadata, org_id, created_at)
    VALUES (
      NEW.id,
      'ganho_planner_event',
      'Ganho Planner',
      jsonb_build_object(
        'source', 'trg_log_ganho_events',
        'vendas_owner_id', NEW.vendas_owner_id,
        'pos_owner_id', NEW.pos_owner_id,
        'valor_final', NEW.valor_final,
        'valor_estimado', NEW.valor_estimado
      ),
      NEW.org_id,
      COALESCE(NEW.ganho_planner_at, NOW())
    );
  END IF;

  IF (TG_OP = 'INSERT' AND COALESCE(NEW.ganho_pos, false) = true)
     OR (TG_OP = 'UPDATE' AND COALESCE(OLD.ganho_pos, false) = false
                         AND COALESCE(NEW.ganho_pos, false) = true) THEN
    INSERT INTO public.activities (card_id, tipo, descricao, metadata, org_id, created_at)
    VALUES (
      NEW.id,
      'ganho_pos_event',
      'Entrega concluida',
      jsonb_build_object(
        'source', 'trg_log_ganho_events',
        'pos_owner_id', NEW.pos_owner_id
      ),
      NEW.org_id,
      COALESCE(NEW.ganho_pos_at, NOW())
    );
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  PERFORM public.safe_log_trigger_error(
    'log_ganho_events',
    SQLERRM,
    jsonb_build_object('card_id', NEW.id, 'op', TG_OP)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_ganho_events ON public.cards;
CREATE TRIGGER trg_log_ganho_events
  AFTER INSERT OR UPDATE OF ganho_sdr, ganho_planner, ganho_pos ON public.cards
  FOR EACH ROW
  EXECUTE FUNCTION public.log_ganho_events();

COMMIT;
