-- Fix: Cards em fase Planner com dono_atual_id apontando para SDR
-- Causa raiz: target_phase_id nao existia, StageChangeModal nao abria no handoff
-- Corrige os 2 cards afetados setando dono_atual_id = vendas_owner_id

UPDATE cards
SET dono_atual_id = vendas_owner_id
WHERE id IN (
    '9c8592c2-caff-46c8-b2bb-0611d901131e',  -- Jessica
    '81c37475-cac9-4aec-bc74-e9e3ae042184'   -- Claudia
)
AND vendas_owner_id IS NOT NULL;
