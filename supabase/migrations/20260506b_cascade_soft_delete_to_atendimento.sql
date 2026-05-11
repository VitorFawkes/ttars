-- =====================================================================
-- 20260506b: limpa atendimento_concierge quando a tarefa é soft-deleted.
--
-- Motivo: CardTasks.handleDelete soft-deleta a tarefa via
-- tarefas.deleted_at = now(). A FK atendimentos_concierge.tarefa_id é
-- ON DELETE CASCADE, mas como é soft delete (UPDATE, não DELETE), a
-- cascata não dispara. O atendimento fica órfão no banco.
--
-- A view v_meu_dia_concierge filtra t.deleted_at IS NULL, então o órfão
-- não aparece em /concierge — mas a linha continua na tabela base, o que
-- vaza pra queries diretas e suja a base.
--
-- Solução: trigger AFTER UPDATE OF deleted_at em tarefas que, quando
-- a tarefa vai de "viva" pra "deletada", apaga (hard delete) o
-- atendimento associado. Como o frontend de /concierge tem realtime
-- na tabela atendimentos_concierge, o operador vê o atendimento sumir
-- na hora.
--
-- Backfill defensivo no fim — limpa quaisquer órfãos que já existem.
-- =====================================================================

BEGIN;

CREATE OR REPLACE FUNCTION trg_tarefas_cascade_soft_delete_atendimento()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Só dispara quando a tarefa vai de "viva" pra "soft-deletada"
  IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
    -- Defensivo: pula se a tabela ainda não existe (env sem módulo Concierge)
    IF to_regclass('public.atendimentos_concierge') IS NOT NULL THEN
      DELETE FROM atendimentos_concierge WHERE tarefa_id = NEW.id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION trg_tarefas_cascade_soft_delete_atendimento() FROM PUBLIC;

DROP TRIGGER IF EXISTS tarefas_cascade_soft_delete_atendimento ON tarefas;
CREATE TRIGGER tarefas_cascade_soft_delete_atendimento
  AFTER UPDATE OF deleted_at ON tarefas
  FOR EACH ROW
  EXECUTE FUNCTION trg_tarefas_cascade_soft_delete_atendimento();

-- Backfill: limpa órfãos existentes (atendimentos cujo tarefa já está
-- soft-deletada). Idempotente — pode rodar quantas vezes quiser.
DELETE FROM atendimentos_concierge a
USING tarefas t
WHERE t.id = a.tarefa_id
  AND t.deleted_at IS NOT NULL;

COMMENT ON FUNCTION trg_tarefas_cascade_soft_delete_atendimento() IS
  'Apaga atendimento_concierge quando a tarefa é soft-deletada (deleted_at IS NULL → NOT NULL). Mantém base limpa porque a FK CASCADE só dispara em hard delete.';

COMMIT;
