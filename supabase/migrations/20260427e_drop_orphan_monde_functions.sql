-- Remove funcoes orfas que referenciavam tabelas monde_sales/monde_sale_items
-- (ja dropadas pela migration 20260427d_purge_monde_outbound).
-- Essas funcoes ficaram no catalogo apos os DROPs porque eram standalone
-- (nao sao trigger functions amarradas a uma tabela morta com CASCADE).

BEGIN;

-- get_monde_sales_by_card: RPC que listava vendas por card (tabela ja nao existe)
DROP FUNCTION IF EXISTS public.get_monde_sales_by_card(uuid);

-- update_monde_sale_total: trigger function que mantinha total em monde_sales
DROP FUNCTION IF EXISTS public.update_monde_sale_total();

-- update_monde_sales_updated_at: trigger function de updated_at em monde_sales
DROP FUNCTION IF EXISTS public.update_monde_sales_updated_at();

COMMIT;
