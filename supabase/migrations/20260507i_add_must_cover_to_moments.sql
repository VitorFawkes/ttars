-- Adiciona must_cover em ai_agent_moments — pontos de cobertura mínima
-- que toda resposta nessa fase precisa contemplar. Oposto prescritivo
-- de red_lines: dá liberdade de forma à IA mas garante cobertura nas
-- variantes Diretriz fiel / Estilo livre.

ALTER TABLE public.ai_agent_moments
  ADD COLUMN IF NOT EXISTS must_cover JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.ai_agent_moments.must_cover IS
  'Lista (JSONB array of strings) de pontos que SEMPRE precisam estar contemplados em qualquer resposta gerada nesta fase. Renderizada em <moment_overrides> pelo prompt_builder_v2 como "Esta resposta DEVE garantir cobertura de:". Oposto prescritivo de red_lines.';
