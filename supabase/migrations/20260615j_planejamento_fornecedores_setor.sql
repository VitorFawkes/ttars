-- Higiene do Planejamento:
-- 1) Padroniza o nome do conceito "categoria de fornecedor" em `setor`
--    (vocabulário canônico já usado em fornecedor_bank e no lib do frontend).
--    Renomeia wedding_fornecedores.categoria -> setor.
-- 2) Remove o resíduo produto_data.ww_fornecedores (migrado para tabela em
--    20260615h) dos cards WEDDING — fonte fantasma após o corte.

BEGIN;

ALTER TABLE public.wedding_fornecedores RENAME COLUMN categoria TO setor;

UPDATE public.cards
SET produto_data = produto_data - 'ww_fornecedores'
WHERE produto = 'WEDDING'
  AND produto_data ? 'ww_fornecedores';

COMMIT;

-- Validação pós-migration
DO $$
DECLARE
  has_setor BOOLEAN;
  has_categoria BOOLEAN;
  residuo INTEGER;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='wedding_fornecedores' AND column_name='setor'
  ) INTO has_setor;
  IF NOT has_setor THEN
    RAISE EXCEPTION 'wedding_fornecedores.setor não existe após o rename';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='wedding_fornecedores' AND column_name='categoria'
  ) INTO has_categoria;
  IF has_categoria THEN
    RAISE EXCEPTION 'wedding_fornecedores.categoria ainda existe — rename não aplicou';
  END IF;

  SELECT COUNT(*) INTO residuo FROM public.cards
    WHERE produto='WEDDING' AND produto_data ? 'ww_fornecedores';
  IF residuo > 0 THEN
    RAISE EXCEPTION 'ainda há % cards WEDDING com produto_data.ww_fornecedores', residuo;
  END IF;

  RAISE NOTICE 'planejamento fornecedores setor: validação OK';
END $$;
