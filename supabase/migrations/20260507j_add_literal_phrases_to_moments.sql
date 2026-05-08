-- Adiciona literal_phrases em ai_agent_moments — frases que devem sair
-- palavra-por-palavra dentro de uma resposta livre/fiel. Padrão Salesforce
-- Prompt Builder + HubSpot: lista separada do anchor, validador pós-geração
-- com fuzzy match (similaridade ≥ 0.9) e 1 regeração se trecho faltar.
-- Espelha mecanismo provado em <lead_already_mentioned>.

ALTER TABLE public.ai_agent_moments
  ADD COLUMN IF NOT EXISTS literal_phrases JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.ai_agent_moments.literal_phrases IS
  'Lista (JSONB array of strings) de frases que devem sair palavra-por-palavra na resposta. Renderizada pelo prompt_builder_v2 como bloco <must_include>. Validada pós-geração via fuzzy match — se faltar, runPersonaAgent regera 1 vez com instrução reforçada. Funciona em qualquer modo (literal/faithful/free), diferente de must_cover (que é cobertura conceitual em modo livre).';
