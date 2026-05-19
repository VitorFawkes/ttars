-- Seed do fluxo "Padrão Wedme" pra Welcome Weddings + assignments dos 65 cards
-- importados da ferramenta antiga (calendarioconvidados).
--
-- Intervalos confirmados por reverse-engineering das 49k scheduled_messages:
--   * promom (Promocional): 5 dias
--   * pade1m (Etapa 1):     15 dias
--   * pade2m (Etapa 2):     20 dias
--
-- Cada card importado já tem em produto_data:
--   * ww_flow_start_position (1-35) — em qual mensagem o casamento estava
--   * ww_flow_start_date (40 dos 65 têm) — quando essa mensagem foi disparada
--
-- Os 25 cards sem ww_flow_start_date ficam pendentes (sem assignment).
-- O usuário configura via UI.

BEGIN;

-- 1) Variação "Padrão Wedme" pra org Welcome Weddings
INSERT INTO public.fluxo_templates (org_id, name, intervals, is_default)
VALUES (
  'b0000000-0000-0000-0000-000000000002',
  'Padrão Wedme',
  '{"promom":5,"pade1m":15,"pade2m":20}'::jsonb,
  TRUE
)
ON CONFLICT DO NOTHING;

-- 2) Popula wedding_fluxo a partir do produto_data dos cards do import
WITH template AS (
  SELECT id
  FROM public.fluxo_templates
  WHERE org_id = 'b0000000-0000-0000-0000-000000000002'
    AND name = 'Padrão Wedme'
    AND deleted_at IS NULL
  LIMIT 1
)
INSERT INTO public.wedding_fluxo (card_id, fluxo_template_id, start_index, start_date)
SELECT
  c.id,
  template.id,
  (c.produto_data->>'ww_flow_start_position')::int,
  (c.produto_data->>'ww_flow_start_date')::date
FROM public.cards c, template
WHERE c.produto = 'WEDDING'
  AND c.org_id = 'b0000000-0000-0000-0000-000000000002'
  AND c.produto_data ? 'codigo_casamento'
  AND c.produto_data ? 'ww_flow_start_position'
  AND c.produto_data ? 'ww_flow_start_date'
  AND c.produto_data->>'ww_flow_start_date' IS NOT NULL
  AND c.produto_data->>'ww_flow_start_date' <> 'null'
  AND c.deleted_at IS NULL
ON CONFLICT (card_id) DO NOTHING;

COMMIT;
