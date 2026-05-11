-- ============================================================================
-- APLICAR MANUALMENTE NO SUPABASE DASHBOARD -> SQL EDITOR
--
-- PROBLEMA: A etapa "Viagem Confirmada (Ganho)" está com is_won = true,
-- o que marca cards como status_comercial = 'ganho' (fechado) cedo demais.
--
-- REGRA DE NEGÓCIO:
--   - GANHO TOTAL (status_comercial = 'ganho') = SOMENTE "Viagem Concluída"
--   - "Viagem Confirmada" = apenas marco do Planner (is_planner_won = true)
--   - Ganho SDR, Planner, Pós = marcos internos para dashboard
--   - ABERTO = tudo que não é ganho nem perdido
--   - FECHADO = ganho OU perdido
-- ============================================================================

-- ===== PASSO 1: DIAGNÓSTICO (rodar primeiro, não altera nada) =====

-- 1a. Ver estado atual das flags em TODAS as etapas
SELECT nome, fase, is_won, is_lost, is_sdr_won, is_planner_won, is_pos_won
FROM pipeline_stages
ORDER BY fase, ordem;

-- 1b. Quantos cards estão marcados como ganho INDEVIDAMENTE?
-- (estão em etapas que NÃO deveriam ser ganho total)
SELECT
    c.id,
    c.titulo,
    c.status_comercial,
    s.nome as etapa,
    s.fase,
    s.is_won
FROM cards c
JOIN pipeline_stages s ON c.pipeline_stage_id = s.id
WHERE c.status_comercial = 'ganho'
  AND c.deleted_at IS NULL
  AND s.nome != 'Viagem Concluída'
ORDER BY s.fase, s.nome;

-- ===== PASSO 2: CORRIGIR FLAGS DAS ETAPAS =====

-- 2a. Remover is_won de "Viagem Confirmada (Ganho)" - é apenas marco do Planner
UPDATE pipeline_stages
SET is_won = false
WHERE nome = 'Viagem Confirmada (Ganho)'
  AND is_won = true;

-- 2b. Garantir que SOMENTE "Viagem Concluída" tem is_won = true
-- (safety check: resetar qualquer outra etapa que tenha is_won por engano)
UPDATE pipeline_stages
SET is_won = false
WHERE is_won = true
  AND nome != 'Viagem Concluída';

-- 2c. Confirmar que "Viagem Concluída" mantém is_won = true E is_pos_won = true
UPDATE pipeline_stages
SET is_won = true, is_pos_won = true
WHERE nome = 'Viagem Concluída';

-- 2d. Confirmar que "Viagem Confirmada (Ganho)" mantém is_planner_won = true
UPDATE pipeline_stages
SET is_planner_won = true
WHERE nome = 'Viagem Confirmada (Ganho)';

-- ===== PASSO 3: CORRIGIR CARDS COM STATUS ERRADO =====

-- 3a. Cards em "Viagem Confirmada (Ganho)" que estão como 'ganho' → resetar para 'aberto'
UPDATE cards c
SET
    status_comercial = 'aberto',
    updated_at = now()
FROM pipeline_stages s
WHERE c.pipeline_stage_id = s.id
  AND s.nome = 'Viagem Confirmada (Ganho)'
  AND c.status_comercial = 'ganho'
  AND c.deleted_at IS NULL;

-- 3b. Cards em QUALQUER etapa de Pós-venda sem is_won que estão como 'ganho'
UPDATE cards c
SET
    status_comercial = 'aberto',
    updated_at = now()
FROM pipeline_stages s
WHERE c.pipeline_stage_id = s.id
  AND c.status_comercial = 'ganho'
  AND COALESCE(s.is_won, false) = false
  AND c.deleted_at IS NULL;

-- ===== PASSO 4: VERIFICAÇÃO FINAL =====

-- 4a. Confirmar flags corretas
SELECT nome, fase, is_won, is_lost, is_sdr_won, is_planner_won, is_pos_won
FROM pipeline_stages
WHERE is_won = true OR is_lost = true OR is_sdr_won = true OR is_planner_won = true OR is_pos_won = true
ORDER BY fase, ordem;

-- 4b. Verificar que nenhum card tem ganho indevido
SELECT count(*) as cards_ganho_indevido
FROM cards c
JOIN pipeline_stages s ON c.pipeline_stage_id = s.id
WHERE c.status_comercial = 'ganho'
  AND COALESCE(s.is_won, false) = false
  AND c.deleted_at IS NULL;
-- Esperado: 0

-- 4c. Verificar cards que estão corretamente como ganho
SELECT c.id, c.titulo, s.nome, s.fase
FROM cards c
JOIN pipeline_stages s ON c.pipeline_stage_id = s.id
WHERE c.status_comercial = 'ganho'
  AND c.deleted_at IS NULL;
-- Esperado: SOMENTE cards em "Viagem Concluída"

-- ============================================================================
-- RESULTADO ESPERADO DAS FLAGS:
--
-- | Etapa                           | is_won | is_planner_won | status_comercial |
-- |--------------------------------|--------|----------------|------------------|
-- | Taxa Paga (SDR)                | false  | false          | aberto           |
-- | Viagem Confirmada (Planner)    | false  | true           | aberto           |
-- | Viagem Concluída (Pós-venda)   | TRUE   | false          | ganho            |
-- | Fechado - Perdido              | false  | false          | perdido          |
--
-- MARCOS (para dashboard, NÃO alteram status_comercial):
-- - ganho_sdr = true → Lead qualificado pelo SDR (opcional)
-- - ganho_planner = true → Venda fechou, viagem confirmada
-- - ganho_pos = true → Viagem concluída com sucesso
-- ============================================================================
