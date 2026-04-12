-- Fix: 2 cards de Trips apontando para stage "Proposta em Construção" de Weddings
-- Cards: 341a9107-ac65-4323-aba8-a0714635c8d5, eaa961d2-b360-48d0-b8d8-3511650156ff
-- Stage errado: 016713b1-c7bd-4ad1-bff8-14eff019de5d (Weddings)
-- Stage correto: 4d1a732a-44cf-423c-b0bd-94b253949d63 (Trips)

UPDATE cards
SET pipeline_stage_id = '4d1a732a-44cf-423c-b0bd-94b253949d63'
WHERE org_id = 'b0000000-0000-0000-0000-000000000001'
  AND pipeline_stage_id = '016713b1-c7bd-4ad1-bff8-14eff019de5d';
