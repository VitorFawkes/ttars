-- Configura a etapa inicial de sub-cards no pipeline WEDDING.
-- "Concepção" é o estágio de planejamento inicial da Pós-venda Wedding,
-- semanticamente correto para mudanças/adições solicitadas pelo cliente.
--
-- Para TRIPS não é necessário — a cascata já encontra "Proposta em Construção"
-- na fase Planner via slug.

BEGIN;

UPDATE pipelines
SET sub_card_default_stage_id = 'cf4dc8a2-d9f5-4c8e-8ec1-8b650502026c' -- Concepção
WHERE id = 'f4611f84-ce9c-48ad-814b-dcd6081f15db';                       -- Pipeline Welcome Wedding

COMMIT;
