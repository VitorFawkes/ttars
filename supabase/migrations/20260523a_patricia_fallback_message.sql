-- Patricia: trocar fallback_message que viola as próprias regras dela.
--
-- ANTES: "Deixa eu confirmar um detalhe com a equipe aqui e te chamo de volta em pouco."
-- Viola simultaneamente 2 regras configuradas pra Patricia:
--   1. zero_meta_linguagem — menciona "a equipe" (bastidor explícito)
--   2. nao_prometer_voltar_sem_handoff — promete "te chamo de volta" sem
--      garantia de handoff oficial no mesmo turno
--
-- Resultado observado em testes (23/05 00:17): validator bloqueou a própria
-- fallback do banco quando Patricia entrou em handoff_humano_invisivel.
--
-- DEPOIS: texto neutro que não viola nenhuma regra — não menciona bastidor,
-- não promete prazo específico, não cita Ana Carolina sem contexto.

UPDATE ai_agents
SET fallback_message = 'Deixa eu olhar isso com calma antes de responder.'
WHERE id = '4d96d9b4-e909-4441-bd85-d3f807cccfa7';
