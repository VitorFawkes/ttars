-- Adiciona valor 'a_enviar' ao CHECK do status de card_gift_assignments.
-- Mantém 'pendente' (rotulado como "Solicitado" na UI) para evitar refactor amplo.
-- Idempotente: pode ser reaplicada sem erro.

DO $$
DECLARE
  constraint_name TEXT;
BEGIN
  -- Localiza qualquer CHECK existente sobre a coluna status e dropa
  FOR constraint_name IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    WHERE rel.relname = 'card_gift_assignments'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE card_gift_assignments DROP CONSTRAINT %I', constraint_name);
  END LOOP;
END $$;

ALTER TABLE card_gift_assignments
  ADD CONSTRAINT card_gift_assignments_status_check
  CHECK (status IN ('pendente', 'preparando', 'a_enviar', 'enviado', 'entregue', 'cancelado'));

COMMENT ON COLUMN card_gift_assignments.status IS
  'Estágio do pacote no fluxo de envio. UI mapeia: pendente=Solicitado, preparando=Preparando, a_enviar=A enviar, enviado=Enviado, entregue=Entregue, cancelado=Cancelado.';
