-- Backfill (one-off): renomeia os cards WEDDING importados do Leadster para o
-- padrão do funil — "Elopement | Nome" quando o form respondeu "Apenas o
-- casal", senão "DW | Nome" (mesma regra da criação no webhook desde 11/06).
--
-- Por que desligar o trigger: trg_card_titulo_lock_logic reverte mudança de
-- título feita por service_role quando o título atual não tem placeholder
-- (proteção contra IA reescrever título finalizado). Este ajuste é deliberado,
-- então desliga o trigger só durante o UPDATE e deixa o título TRAVADO
-- (titulo_locked_at = now()) para a IA não mexer depois.
--
-- Escopo: cards abertos de origem leadster, sem "|" no título, exceto o card
-- de teste "TESTE IRRAAA".

BEGIN;

ALTER TABLE public.cards DISABLE TRIGGER trg_card_titulo_lock_logic;

UPDATE public.cards
SET titulo = CASE
        WHEN LOWER(TRIM(COALESCE(produto_data->>'ww_num_convidados', ''))) = 'apenas o casal'
        THEN 'Elopement | ' || titulo
        ELSE 'DW | ' || titulo
    END,
    titulo_locked_at = NOW()
WHERE origem = 'leadster'
  AND produto = 'WEDDING'
  AND deleted_at IS NULL
  AND titulo NOT LIKE '%|%'
  AND titulo <> 'TESTE IRRAAA';

ALTER TABLE public.cards ENABLE TRIGGER trg_card_titulo_lock_logic;

COMMIT;
