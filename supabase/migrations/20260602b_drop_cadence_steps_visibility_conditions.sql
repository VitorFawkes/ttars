-- Remove cadence_steps.visibility_conditions — feature morta.
--
-- A coluna foi definida para mostrar/ocultar passos condicionalmente, mas o motor
-- cadence-engine NUNCA a avalia (nenhuma referência em executeStep/handlers) e o
-- builder v2 não a expõe. Em produção todos os steps têm valor vazio ('[]').
-- Nenhuma RPC viva (replace_cadence_steps 20260507e) nem view a referencia.
--
-- Removida para não iludir: campo "configurável" que não tem efeito é pior que
-- ausência de campo.

BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='cadence_steps'
      AND column_name='visibility_conditions'
  ) THEN
    ALTER TABLE public.cadence_steps DROP COLUMN visibility_conditions;
    RAISE NOTICE 'cadence_steps.visibility_conditions removida.';
  ELSE
    RAISE NOTICE 'cadence_steps.visibility_conditions já ausente — skip.';
  END IF;
END $$;

COMMIT;
