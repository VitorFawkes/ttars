-- Weddings: unifica as duas seções de marketing numa só.
--
-- O card WEDDING mostrava "Marketing & Origem" (seção global 'marketing',
-- produto=null, com utm_*/mkt_*) E "Marketing e Origem" (seção 'wedding_marketing',
-- WEDDING, com os 4 ww_mkt_*). Mantemos a global e movemos os ww_mkt_* pra ela;
-- como são produto_exclusivo='WEDDING', só aparecem em cards WEDDING (não poluem
-- Trips). Desativa a seção duplicada. Escopo no workspace Weddings.

-- 1. Move os 4 campos de formulário/origem para a seção 'marketing'
DO $$
DECLARE
  v_org uuid := 'b0000000-0000-0000-0000-000000000002';
  r record;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('ww_mkt_como_conheceu',   100),
      ('ww_mkt_destino_form',    110),
      ('ww_mkt_convidados_form', 120),
      ('ww_mkt_orcamento_form',  130)
    ) AS t(field_key, ord)
  LOOP
    UPDATE public.system_fields
    SET section = 'marketing', order_index = r.ord
    WHERE org_id = v_org AND produto_exclusivo = 'WEDDING' AND key = r.field_key;
  END LOOP;
END $$;

-- 2. Desativa a seção duplicada
UPDATE public.sections
SET active = false
WHERE org_id = 'b0000000-0000-0000-0000-000000000002'
  AND key = 'wedding_marketing';
