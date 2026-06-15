-- ============================================================================
-- MIGRATION: Fase Closer (Welcome Weddings) — espelhar as 8 colunas do quadro do AC
-- Date: 2026-06-15
--
-- Objetivo: deixar a fase Closer do pipeline WEDDING com as 8 etapas que o time
-- de Closer usa hoje no ActiveCampaign, MESCLANDO com as etapas atuais:
--   - renomeia/reordena as 4 que casam (preservando flags/milestones)
--   - cria as 4 que faltam (etapas "de espera", sem milestone)
--   - copia a visibilidade de seções (stage_section_config) das etapas novas
--   - remove "Contrato Assinado" como COLUNA (ganho vira marcação via botão
--     "Venda Fechada" — ver migration 20260615b que habilita marcar_ganho no
--     slug 'closer'). A linha é só desativada (ativo=false), preservando
--     is_won/milestone para histórico.
--   - realoca os cards que estavam em "Contrato Assinado".
--
-- IDs (produção):
--   Org Weddings  b0000000-0000-0000-0000-000000000002
--   Pipeline WED  f4611f84-ce9c-48ad-814b-dcd6081f15db
--   Fase Closer   c314b65d-4271-4ac2-8b4d-0694630deb3a
--   Fase Pós-vnd  775a7a1c-3959-4e0d-8454-1063c4fba144  (entrada: ada5a419…)
--
-- NOTE: pipeline_stages NÃO tem coluna updated_at (não referenciar).
-- ============================================================================

BEGIN;

-- A realocação de cards (passo 4) dispara o trigger enforce_stage_requirements.
-- Como esta migration roda como superuser (sem JWT service_role), usamos o
-- bypass transaction-local previsto para operações em massa.
SET LOCAL app.bypass_stage_requirements = 'true';

-- ----------------------------------------------------------------------------
-- 1. Renomear/reordenar as 4 etapas que casam (preserva flags + milestones)
-- ----------------------------------------------------------------------------
UPDATE pipeline_stages SET nome = '1ª Reunião', ordem = 1
 WHERE id = 'ade09bc3-fa3d-49b8-97f0-2f780d0ebbb1'
   AND pipeline_id = 'f4611f84-ce9c-48ad-814b-dcd6081f15db'
   AND org_id = 'b0000000-0000-0000-0000-000000000002';

UPDATE pipeline_stages SET nome = 'Em contato', ordem = 2
 WHERE id = 'ef9233fa-9c72-4c54-8995-c02061c4be9f'
   AND pipeline_id = 'f4611f84-ce9c-48ad-814b-dcd6081f15db'
   AND org_id = 'b0000000-0000-0000-0000-000000000002';

UPDATE pipeline_stages SET nome = 'Contrato enviado', ordem = 3
 WHERE id = '016713b1-c7bd-4ad1-bff8-14eff019de5d'
   AND pipeline_id = 'f4611f84-ce9c-48ad-814b-dcd6081f15db'
   AND org_id = 'b0000000-0000-0000-0000-000000000002';

UPDATE pipeline_stages SET nome = 'Em negociação', ordem = 4
 WHERE id = '0adf51b3-1d33-45bd-9bc9-484d2568b5f2'
   AND pipeline_id = 'f4611f84-ce9c-48ad-814b-dcd6081f15db'
   AND org_id = 'b0000000-0000-0000-0000-000000000002';

-- ----------------------------------------------------------------------------
-- 2. Inserir as 4 etapas novas (ordem 5–8). target_phase_id = própria fase
--    Closer para NÃO disparar handoff cross-fase. Sem milestone/win.
-- ----------------------------------------------------------------------------
INSERT INTO pipeline_stages (
    id, nome, ordem, ativo, pipeline_id, phase_id, fase, target_phase_id, org_id,
    auto_advance, is_won, is_lost, is_sdr_won, is_planner_won, is_pos_won,
    is_frozen, is_terminal, handoff_compartilhado, milestone_key
) VALUES
 ('c1000000-0000-4000-8000-000000000001', 'Reagendamento Closer', 5, true,
  'f4611f84-ce9c-48ad-814b-dcd6081f15db', 'c314b65d-4271-4ac2-8b4d-0694630deb3a', 'Closer',
  'c314b65d-4271-4ac2-8b4d-0694630deb3a', 'b0000000-0000-0000-0000-000000000002',
  false, false, false, false, false, false, false, false, false, NULL),
 ('c1000000-0000-4000-8000-000000000002', 'Oportunidade futura', 6, true,
  'f4611f84-ce9c-48ad-814b-dcd6081f15db', 'c314b65d-4271-4ac2-8b4d-0694630deb3a', 'Closer',
  'c314b65d-4271-4ac2-8b4d-0694630deb3a', 'b0000000-0000-0000-0000-000000000002',
  false, false, false, false, false, false, false, false, false, NULL),
 ('c1000000-0000-4000-8000-000000000003', 'Aguardando dados', 7, true,
  'f4611f84-ce9c-48ad-814b-dcd6081f15db', 'c314b65d-4271-4ac2-8b4d-0694630deb3a', 'Closer',
  'c314b65d-4271-4ac2-8b4d-0694630deb3a', 'b0000000-0000-0000-0000-000000000002',
  false, false, false, false, false, false, false, false, false, NULL),
 ('c1000000-0000-4000-8000-000000000004', 'Standby - Closer', 8, true,
  'f4611f84-ce9c-48ad-814b-dcd6081f15db', 'c314b65d-4271-4ac2-8b4d-0694630deb3a', 'Closer',
  'c314b65d-4271-4ac2-8b4d-0694630deb3a', 'b0000000-0000-0000-0000-000000000002',
  false, false, false, false, false, false, false, false, false, NULL);

-- ----------------------------------------------------------------------------
-- 3. Copiar visibilidade de seções da etapa "Em negociação" (0adf51b3…) para as
--    4 novas, para o card detail renderizar igual ao resto do Closer
--    (ex.: esconde seções de marketing). Campos (stage_field_config) NÃO são
--    copiados de propósito — etapas novas usam visibilidade padrão e não herdam
--    requisitos bloqueantes, que prenderiam cards nas etapas "de espera".
-- ----------------------------------------------------------------------------
INSERT INTO stage_section_config (id, stage_id, section_key, is_visible, default_collapsed, org_id)
SELECT gen_random_uuid(), nv.new_id, ssc.section_key, ssc.is_visible, ssc.default_collapsed, ssc.org_id
FROM stage_section_config ssc
CROSS JOIN (VALUES
    ('c1000000-0000-4000-8000-000000000001'::uuid),
    ('c1000000-0000-4000-8000-000000000002'::uuid),
    ('c1000000-0000-4000-8000-000000000003'::uuid),
    ('c1000000-0000-4000-8000-000000000004'::uuid)
) AS nv(new_id)
WHERE ssc.stage_id = '0adf51b3-1d33-45bd-9bc9-484d2568b5f2';

-- ----------------------------------------------------------------------------
-- 4. Realocar os cards que estavam em "Contrato Assinado" (f7d81a35…)
--    4a. negócios já ganhos (status='ganho') → entrada do Pós-venda
-- ----------------------------------------------------------------------------
UPDATE cards SET
    pipeline_stage_id = 'ada5a419-1a98-4deb-9098-808507a3415e',
    stage_entered_at = NOW(),
    updated_at = NOW()
 WHERE pipeline_stage_id = 'f7d81a35-b953-4b3c-8d56-69cc8f937d6a'
   AND status_comercial = 'ganho'
   AND deleted_at IS NULL;

--    4b. demais cards (não ganhos / teste) → "Contrato enviado"
UPDATE cards SET
    pipeline_stage_id = '016713b1-c7bd-4ad1-bff8-14eff019de5d',
    stage_entered_at = NOW(),
    updated_at = NOW()
 WHERE pipeline_stage_id = 'f7d81a35-b953-4b3c-8d56-69cc8f937d6a'
   AND deleted_at IS NULL;

-- ----------------------------------------------------------------------------
-- 5. Desativar "Contrato Assinado" como coluna (preserva a linha p/ histórico)
-- ----------------------------------------------------------------------------
UPDATE pipeline_stages SET ativo = false
 WHERE id = 'f7d81a35-b953-4b3c-8d56-69cc8f937d6a'
   AND pipeline_id = 'f4611f84-ce9c-48ad-814b-dcd6081f15db';

-- ----------------------------------------------------------------------------
-- Sanidade: a fase Closer deve ter exatamente 8 etapas ativas após a migration
-- ----------------------------------------------------------------------------
DO $$
DECLARE v_count INT;
BEGIN
    SELECT COUNT(*) INTO v_count
    FROM pipeline_stages
    WHERE phase_id = 'c314b65d-4271-4ac2-8b4d-0694630deb3a'
      AND pipeline_id = 'f4611f84-ce9c-48ad-814b-dcd6081f15db'
      AND ativo = true;
    IF v_count <> 8 THEN
        RAISE EXCEPTION 'Esperado 8 etapas ativas no Closer, encontrado %', v_count;
    END IF;
END $$;

COMMIT;
