-- ============================================================================
-- MIGRATION: Welcome Corporativo — visibilidade dos campos no CardDetail
-- Date: 2026-04-30
--
-- Problema: campos populados (categoria_produto, prioridade, etc) não
-- aparecem dentro do card detalhe porque section_field_config está vazio
-- pra Corp, e stage_field_config só tem categoria_produto.
--
-- Fix: popular ambas as tabelas pra que os campos relevantes apareçam
-- dentro do card aberto.
-- ============================================================================

BEGIN;

DO $vis$
DECLARE
    v_org UUID := 'b0000000-0000-0000-0000-000000000003';
    v_stage_aberto UUID := 'e0000000-0000-0000-0000-000000000031';
    v_stage_fechado UUID := 'e0000000-0000-0000-0000-000000000032';
BEGIN

    -- ========================================================================
    -- 1. section_field_config: liga campos às seções dentro do CardDetail
    -- ========================================================================
    DELETE FROM section_field_config
     WHERE org_id = v_org
       AND section_key IN ('info', 'notes')
       AND field_key IN ('categoria_produto', 'forma_pagamento', 'prioridade', 'motivo_perda_comentario');

    INSERT INTO section_field_config (org_id, section_key, field_key, is_visible, is_required)
    VALUES
        -- Seção "Informações" (info) — fica do lado esquerdo
        (v_org, 'info', 'categoria_produto',       true, false),
        (v_org, 'info', 'prioridade',              true, false),
        (v_org, 'info', 'forma_pagamento',         true, false);

    -- ========================================================================
    -- 2. stage_field_config: adiciona prioridade e forma_pagamento (já tinha
    --    categoria_produto). Aplicado nas duas etapas (Aberto + Fechado).
    -- ========================================================================
    DELETE FROM stage_field_config
     WHERE org_id = v_org
       AND field_key IN ('prioridade', 'forma_pagamento');

    INSERT INTO stage_field_config (org_id, stage_id, field_key, is_visible, is_required)
    VALUES
        (v_org, v_stage_aberto,  'prioridade',       true, false),
        (v_org, v_stage_aberto,  'forma_pagamento',  true, false),
        (v_org, v_stage_fechado, 'prioridade',       true, false),
        (v_org, v_stage_fechado, 'forma_pagamento',  true, false);

    RAISE NOTICE '✅ Visibilidade dos campos do CardDetail Corporativo configurada';
END $vis$;

COMMIT;
