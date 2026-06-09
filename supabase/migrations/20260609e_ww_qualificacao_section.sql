-- Card de Weddings: separar "Qualificação" (dados que vêm do webhook Leadster)
-- do "SDR" (campos que o SDR preenche na mão).
--
-- Qualificação = SOMENTE os campos capturados pelo formulário/webhook:
--   nome dos noivos, destino, convidados, orçamento, cidade.
-- O resto (data do casamento, tipo, visão, motivação, reunião, taxa, etc.)
-- continua na seção SDR.
--
-- Escopo no workspace Weddings (b0…0002). Reversível: mover os campos de volta
-- pra wedding_sdr e dropar a seção.

-- 1. Nova seção "Qualificação" (coluna esquerda, logo acima do SDR)
INSERT INTO public.sections
  (key, label, color, icon, position, order_index, pipeline_id,
   is_governable, is_system, active, widget_component, produto, default_collapsed, org_id)
SELECT
  'wedding_qualificacao',
  'Qualificação',
  'bg-emerald-50 text-emerald-700 border-emerald-100',
  'Sparkles',
  'left_column',
  15,
  NULL,
  true,
  false,
  true,
  NULL,
  'WEDDING',
  false,
  'b0000000-0000-0000-0000-000000000002'
WHERE NOT EXISTS (
  SELECT 1 FROM public.sections
  WHERE org_id = 'b0000000-0000-0000-0000-000000000002' AND key = 'wedding_qualificacao'
);

-- 2. Mover os campos do webhook pra a seção Qualificação
DO $$
DECLARE
  v_org uuid := 'b0000000-0000-0000-0000-000000000002';
  r record;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('ww_nome_parceiro',  10),
      ('ww_destino',        20),
      ('ww_num_convidados', 30),
      ('ww_orcamento_faixa',40),
      ('ww_sdr_cidade',     50)
    ) AS t(field_key, ord)
  LOOP
    UPDATE public.system_fields
    SET section = 'wedding_qualificacao', order_index = r.ord
    WHERE org_id = v_org AND produto_exclusivo = 'WEDDING' AND key = r.field_key;
  END LOOP;
END $$;

-- 3. Renomear a seção SDR (qualificação saiu dela)
UPDATE public.sections
SET label = 'SDR'
WHERE org_id = 'b0000000-0000-0000-0000-000000000002'
  AND key = 'wedding_sdr';
