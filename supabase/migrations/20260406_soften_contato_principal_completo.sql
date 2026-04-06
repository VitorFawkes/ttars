-- ============================================================================
-- MIGRATION: Suaviza regra contato_principal_completo (is_blocking → false)
-- Date: 2026-04-06
--
-- CONTEXTO
-- Após promover 20260406_enforce_stage_requirements_trigger.sql, descobrimos
-- que existem 330 cards em produção atualmente em stages que exigem
-- contato_principal_completo mas que NÃO cumprem essa regra. Esses cards
-- chegaram nesses stages porque o quality gate frontend estava quebrado
-- (PGRST200 silencioso) por meses — então a regra existia mas nunca foi
-- enforced.
--
-- Agora que o trigger no banco enforce de verdade, esses 330 cards ficariam
-- "travados" — não poderiam ser movidos para nenhum outro stage que também
-- exige a regra (que é a maioria dos stages do planner).
--
-- DECISÃO
-- - Mantém a regra contato_principal_completo VISÍVEL e marcada como
--   `is_required=true` (UI continua mostrando o pendente).
-- - Tira o `is_blocking` (UI não bloqueia, trigger não bloqueia).
-- - O caso REAL reportado pelo user (numero_venda_monde) continua blocante.
--
-- REVERTER
-- Quando os 330 cards forem corrigidos (preencher contatos), rodar:
--   UPDATE stage_field_config SET is_blocking = true
--   WHERE field_key = 'contato_principal_completo' AND is_required = true;
-- ============================================================================

UPDATE public.stage_field_config
SET is_blocking = false,
    updated_at = NOW()
WHERE field_key = 'contato_principal_completo'
  AND is_required = true
  AND COALESCE(is_blocking, true) = true;
