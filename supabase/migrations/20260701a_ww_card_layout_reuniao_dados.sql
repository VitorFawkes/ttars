-- 20260701a_ww_card_layout_reuniao_dados.sql
--
-- Reorganização do card Weddings (feedback do handoff SDR+Vendas):
--   1) Desativa os 3 campos de reunião restantes (viram DADO, não campo editável):
--      links de reunião SDR/Closer + "tipo da reunião com a Closer". A info passa a
--      ser exibida read-only na nova seção "Reunião & Qualificação".
--   2) Esconde 4 seções no card Weddings (só WEDDING — via stage_section_config;
--      Trips não é afetado): Oportunidades Futuras, Presentes, Alertas, Propostas.
--   3) Cria a seção "Reunião & Qualificação" (widget read-only) no rodapé da coluna
--      direita — mostra os dados que saíram de campo (datas/como/qualificação/links),
--      lidos de cards.produto_data.
--
-- Isolamento: org WEDDING (b0000000-...-002). Idempotente.

-- ── 1) desativa os 3 campos restantes (só UI; produto_data/integrações intactos) ──
UPDATE public.system_fields
SET active = false
WHERE org_id = 'b0000000-0000-0000-0000-000000000002'
  AND key IN ('ww_sdr_link_reuniao', 'ww_closer_link_reuniao', 'ww_sdr_tipo_reuniao_closer')
  AND active = true;

-- ── 2) esconde 4 seções em TODAS as etapas do pipeline WEDDING ──
INSERT INTO public.stage_section_config (stage_id, section_key, is_visible, org_id)
SELECT s.id, sk.section_key, false, s.org_id
FROM public.pipeline_stages s
CROSS JOIN (VALUES
    ('future_opportunities'),
    ('gifts'),
    ('alertas'),
    ('proposta')
) AS sk(section_key)
WHERE s.org_id = 'b0000000-0000-0000-0000-000000000002'
ON CONFLICT (stage_id, section_key) DO UPDATE SET is_visible = false;

-- ── 3) cria/atualiza a seção read-only "Reunião & Qualificação" ──
DO $$
DECLARE
  v_org UUID := 'b0000000-0000-0000-0000-000000000002';
BEGIN
  IF EXISTS (SELECT 1 FROM public.sections WHERE key = 'wedding_reuniao_dados' AND org_id = v_org) THEN
    UPDATE public.sections
    SET label = 'Reunião & Qualificação',
        color = 'bg-violet-50 text-violet-700 border-violet-100',
        icon = 'calendar-clock',
        position = 'right_column',
        order_index = 100,
        is_governable = false,
        is_system = true,
        active = true,
        default_collapsed = false,
        produto = 'WEDDING',
        widget_component = 'wedding_reuniao_dados'
    WHERE key = 'wedding_reuniao_dados' AND org_id = v_org;
  ELSE
    INSERT INTO public.sections (
      key, label, color, icon, position, order_index,
      is_governable, is_system, active, default_collapsed,
      produto, pipeline_id, widget_component, org_id
    ) VALUES (
      'wedding_reuniao_dados', 'Reunião & Qualificação',
      'bg-violet-50 text-violet-700 border-violet-100', 'calendar-clock',
      'right_column', 100,
      false, true, true, false,
      'WEDDING', NULL, 'wedding_reuniao_dados', v_org
    );
  END IF;
END $$;
