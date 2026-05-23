-- Patricia: expandir voice_config.forbidden_phrases com as 11 frases que
-- estavam hardcoded nos princípios 14 + 16 (removidos do código nesta mesma
-- sessão de fix).
--
-- Por quê migrar pra voice_config em vez de manter em princípio:
--   - voice_config.forbidden_phrases é editável pela UI v3 (chips)
--   - é filtro determinístico aplicado pelo validator (não interpretação
--     semântica do LLM-judge)
--   - admin não-técnico consegue adicionar/remover frase sem mexer em código
--
-- Frases novas (preserva as 5 originais):
--   Meta-linguagem (do princípio 14 removido):
--     - "pra eu te entender melhor"
--     - "pra eu não te responder no chute"
--     - "pra eu te dizer se faz sentido"
--     - "pra começar direito por aqui"
--     - "pra eu não perder tempo de vocês"
--     - "pra eu poder te ajudar"
--   Bastidores próprios (do princípio 16 removido):
--     - "a equipe"
--     - "o time"
--     - "meu time"
--     - "meus colegas"
--     - "a gente aqui"

UPDATE ai_agents
SET voice_config = jsonb_set(
  voice_config,
  '{forbidden_phrases}',
  '[
    "Prezado cliente",
    "Casamento dos sonhos",
    "Experiência premium",
    "Deixe conosco",
    "Transformamos sonhos em realidade",
    "pra eu te entender melhor",
    "pra eu não te responder no chute",
    "pra eu te dizer se faz sentido",
    "pra começar direito por aqui",
    "pra eu não perder tempo de vocês",
    "pra eu poder te ajudar",
    "a equipe",
    "o time",
    "meu time",
    "meus colegas",
    "a gente aqui"
  ]'::jsonb,
  true
)
WHERE id = '4d96d9b4-e909-4441-bd85-d3f807cccfa7';
