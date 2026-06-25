-- F4 (Parte A) — De-duplicar linhas vermelhas da Sofia (config-driven).
-- Remove 4 regras de boundaries.regras que DUPLICAM, com outras palavras, regras ja
-- FIXAS no esqueleto do cerebro (no_price, JAMAIS INVENTE, handoff invisivel, nao-negociar).
-- Zero perda de regra de negocio: cada uma vive textualmente em outro bloco fixo do prompt.
-- A limpeza e no DADO (nao em codigo) pra que o editor (BoundariesEditor) e o prompt
-- fiquem em sincronia, sem "controle falso". Idempotente: so age se as linhas existirem.
-- Mantemos a familia "repeticao" ([0]/[11]/[15]) por ser orientacao conversacional, nao
-- duplicata de bloco fixo.
UPDATE wsdr_agent_config
SET config = jsonb_set(
  config, '{boundaries,regras}',
  (
    SELECT COALESCE(jsonb_agg(r), '[]'::jsonb)
    FROM jsonb_array_elements(config->'boundaries'->'regras') r
    WHERE r->>'texto' NOT IN (
      'Nunca prometer data, valor fechado ou condição que é da Wedding Planner (isso é decidido na reunião)',
      'Nunca inventar informação sobre destino, documentação ou preço; se não souber, diz que confirma e remete à Planner',
      'Nunca dizer "vou te transferir" ou "outra pessoa vai te atender"; o encontro com a Planner é conduzido com naturalidade',
      'Nunca negociar valor nem dar desconto por mensagem; você é SDR, isso é com a Planner'
    )
  )
)
WHERE slug = 'sofia-weddings'
  AND org_id = 'b0000000-0000-0000-0000-000000000002'
  AND config->'boundaries'->'regras' IS NOT NULL;
