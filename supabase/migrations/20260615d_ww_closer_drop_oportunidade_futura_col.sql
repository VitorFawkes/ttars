-- ============================================================================
-- MIGRATION: Remover a coluna "Oportunidade futura" do Closer (Weddings)
-- Date: 2026-06-15
--
-- A coluna foi criada em 20260615a (etapa c1000000-0000-4000-8000-000000000002,
-- ordem 6). Como "Oportunidade futura" agora é a função de agendamento de retorno
-- (ver 20260615c) e NÃO uma coluna, removemos a etapa. Ela é recém-criada, sem
-- cards e sem histórico, então DELETE é seguro.
--
-- Closer final (7 etapas): 1ª Reunião · Em contato · Contrato enviado ·
-- Em negociação · Reagendamento Closer · Aguardando dados · Standby - Closer.
-- ============================================================================

BEGIN;

-- Guarda: só apaga se a etapa não tiver cards vivos (proteção; deveria ser 0)
DO $$
DECLARE v_cards INT;
BEGIN
    SELECT COUNT(*) INTO v_cards
    FROM cards
    WHERE pipeline_stage_id = 'c1000000-0000-4000-8000-000000000002'
      AND deleted_at IS NULL;
    IF v_cards > 0 THEN
        RAISE EXCEPTION 'Etapa "Oportunidade futura" tem % card(s) — abortando remoção', v_cards;
    END IF;
END $$;

-- 1. Remover config de seções da etapa
DELETE FROM stage_section_config
 WHERE stage_id = 'c1000000-0000-4000-8000-000000000002';

-- 2. Remover a etapa
DELETE FROM pipeline_stages
 WHERE id = 'c1000000-0000-4000-8000-000000000002'
   AND pipeline_id = 'f4611f84-ce9c-48ad-814b-dcd6081f15db';

-- 3. Renumerar as etapas seguintes (fecha o buraco do ordem 6)
UPDATE pipeline_stages SET ordem = 6
 WHERE id = 'c1000000-0000-4000-8000-000000000003'  -- Aguardando dados (era 7)
   AND pipeline_id = 'f4611f84-ce9c-48ad-814b-dcd6081f15db';

UPDATE pipeline_stages SET ordem = 7
 WHERE id = 'c1000000-0000-4000-8000-000000000004'  -- Standby - Closer (era 8)
   AND pipeline_id = 'f4611f84-ce9c-48ad-814b-dcd6081f15db';

-- 4. Sanidade: Closer com 7 etapas ativas e nenhuma "Oportunidade futura"
DO $$
DECLARE v_count INT; v_orphan INT;
BEGIN
    SELECT COUNT(*) INTO v_count
    FROM pipeline_stages
    WHERE phase_id = 'c314b65d-4271-4ac2-8b4d-0694630deb3a'
      AND pipeline_id = 'f4611f84-ce9c-48ad-814b-dcd6081f15db'
      AND ativo = true;
    IF v_count <> 7 THEN
        RAISE EXCEPTION 'Esperado 7 etapas ativas no Closer, encontrado %', v_count;
    END IF;

    SELECT COUNT(*) INTO v_orphan
    FROM pipeline_stages
    WHERE phase_id = 'c314b65d-4271-4ac2-8b4d-0694630deb3a'
      AND pipeline_id = 'f4611f84-ce9c-48ad-814b-dcd6081f15db'
      AND nome = 'Oportunidade futura';
    IF v_orphan <> 0 THEN
        RAISE EXCEPTION 'Ainda existe etapa "Oportunidade futura" (%)', v_orphan;
    END IF;
END $$;

COMMIT;
