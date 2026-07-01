-- 20260701b_ww_secoes_nascem_fechadas.sql
--
-- Card Weddings: seções nascem RECOLHIDAS por padrão, exceto "Qualificação"
-- (wedding_qualificacao), que nasce aberta. Feedback: as accordions estavam
-- nascendo abertas.
--
-- Mecanismo: stage_section_config.default_collapsed = true por etapa (só WEDDING,
-- não afeta Trips). Lido por useStageSectionConfig.isSectionCollapsed.
--   - ON CONFLICT preserva is_visible (só liga o collapse) — seções já escondidas
--     (marketing em algumas etapas, e as 4 escondidas em 20260701a) continuam
--     escondidas; onde visíveis, passam a nascer recolhidas.
--   - wedding_qualificacao NÃO é tocada → segue aberta (sem linha de collapse).
--   - agenda_tarefas / people / historico_conversas renderizam fora da
--     DynamicSectionsList → não são controladas por esta config.
--
-- Isolamento: org WEDDING (b0000000-...-002). Idempotente.

INSERT INTO public.stage_section_config (stage_id, section_key, is_visible, default_collapsed, org_id)
SELECT s.id, sk.section_key, TRUE, TRUE, s.org_id
FROM public.pipeline_stages s
CROSS JOIN (VALUES
    ('observacoes_criticas'),
    ('wedding_sdr'),
    ('wedding_closer'),
    ('wedding_planejamento'),
    ('wedding_info'),
    ('anexos'),
    ('marketing'),
    ('financeiro'),
    ('wedding_reuniao_dados')
) AS sk(section_key)
WHERE s.org_id = 'b0000000-0000-0000-0000-000000000002'
ON CONFLICT (stage_id, section_key) DO UPDATE SET default_collapsed = TRUE;

-- Garante que "Qualificação" fique aberta mesmo se tiver herdado collapse antes.
UPDATE public.stage_section_config
SET default_collapsed = FALSE
WHERE org_id = 'b0000000-0000-0000-0000-000000000002'
  AND section_key = 'wedding_qualificacao'
  AND default_collapsed = TRUE;
