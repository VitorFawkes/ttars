-- Planejamento: campo de observação no item do cronograma & checklist.
-- Texto livre opcional por item (detalhes, contexto, links).

ALTER TABLE public.wedding_checklist ADD COLUMN IF NOT EXISTS observacoes TEXT;

-- Validação
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='wedding_checklist' AND column_name='observacoes'
  ) THEN
    RAISE EXCEPTION 'wedding_checklist.observacoes não foi criada';
  END IF;
  RAISE NOTICE 'wedding_checklist.observacoes: OK';
END $$;
