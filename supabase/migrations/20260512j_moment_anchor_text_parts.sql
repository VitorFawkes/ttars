-- ============================================================================
-- ai_agent_moments.anchor_text_parts — blocos sequenciais de mensagem
--
-- Substitui o uso de "---" como separador textual no anchor_text. Cada
-- elemento do array é uma "rodada de envio" do mesmo momento: quando
-- delivery_mode = 'wait_for_reply', o agente envia parts[step], espera o
-- lead responder, avança step++ e envia parts[step] na próxima rodada.
-- Quando esgota os blocos, avança para o próximo momento do funil.
--
-- Engine: Patricia (single_agent_v2). NÃO altera comportamento da Estela
-- (multi_agent_pipeline); a coluna fica disponível mas o router v1 não a lê.
--
-- Retrocompat: anchor_text continua existindo. O backend novo prefere
-- anchor_text_parts; quando NULL, faz split em runtime do anchor_text.
-- ============================================================================

ALTER TABLE ai_agent_moments
  ADD COLUMN IF NOT EXISTS anchor_text_parts text[] NULL;

COMMENT ON COLUMN ai_agent_moments.anchor_text_parts IS
'Array de blocos sequenciais da mensagem. Cada elemento = 1 rodada de envio. Se delivery_mode = wait_for_reply e parts tem 2+ elementos, agente envia parts[0] no turno 1, parts[1] no turno 2 etc. NULL = fallback runtime que divide anchor_text por linhas contendo "---".';

-- Backfill: para cada moment com anchor_text contendo linha "---" (ou *** ou
-- ___) como separador, popula anchor_text_parts. Usa LATERAL unnest WITH
-- ORDINALITY pra preservar a ordem original dos blocos.
UPDATE ai_agent_moments AS m
SET anchor_text_parts = sub.parts
FROM (
  SELECT
    m2.id,
    array_agg(
      regexp_replace(p.part, E'^[\\s]+|[\\s]+$', '', 'g')
      ORDER BY p.ord
    ) FILTER (
      WHERE regexp_replace(p.part, E'^[\\s]+|[\\s]+$', '', 'g') <> ''
    ) AS parts
  FROM ai_agent_moments m2,
       LATERAL unnest(
         regexp_split_to_array(
           m2.anchor_text,
           E'\\n[ \\t]*[-*_]{3,}[ \\t]*\\n'
         )
       ) WITH ORDINALITY AS p(part, ord)
  WHERE m2.anchor_text IS NOT NULL
    AND m2.anchor_text ~ E'\\n[ \\t]*[-*_]{3,}[ \\t]*\\n'
    AND m2.anchor_text_parts IS NULL
  GROUP BY m2.id
) AS sub
WHERE m.id = sub.id;

-- Index parcial: o prompt_assembler filtra moments com parts não-nulo quando
-- delivery_mode = wait_for_reply. Mostra a intenção da nova coluna.
CREATE INDEX IF NOT EXISTS idx_ai_agent_moments_parts_wait
  ON ai_agent_moments(agent_id, moment_key)
  WHERE delivery_mode = 'wait_for_reply' AND anchor_text_parts IS NOT NULL;
