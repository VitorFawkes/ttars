-- ============================================================================
-- MIGRATION: Welcome Corporativo - features onda 1
-- Date: 2026-04-29
--
-- 1. Linha de WhatsApp Echo dedicada (554195657795) → cria card auto em CORP
-- 2. Campo "Categoria do produto" (aéreo nac/intl, hotel, carro, ônibus, seguro)
-- 3. Pipeline card settings: kanban mostra empresa + tempo de abertura
--
-- IDEMPOTENTE: pode ser reaplicada.
-- ============================================================================

BEGIN;

DO $migration$
DECLARE
    v_workspace_id UUID := 'b0000000-0000-0000-0000-000000000003'; -- Welcome Corporativo
    v_pipeline_id UUID := 'c0000000-0000-0000-0000-000000000003';
    v_phase_id UUID := 'd0000000-0000-0000-0000-000000000003';
    v_stage_aberto_id UUID := 'e0000000-0000-0000-0000-000000000031';
    v_echo_platform_id UUID := '0ce942d3-244f-41a7-a9dd-9d69d3830be6'; -- Echo platform
    v_phone_number_id TEXT := 'a17a0b53-31b8-43d3-89b4-2e2690ffb74a';
BEGIN

-- ============================================================================
-- 1. Linha de WhatsApp do Corporativo
--    Mensagens nesse número → cria card automático no produto CORP
-- ============================================================================

-- Limpeza idempotente (apaga linha pré-existente com mesmo phone_number_id)
DELETE FROM whatsapp_linha_config
  WHERE phone_number_id = v_phone_number_id
    AND org_id = v_workspace_id;

INSERT INTO whatsapp_linha_config (
    phone_number_id, phone_number_label, produto,
    pipeline_id, phase_id, stage_id,
    criar_card, criar_contato,
    platform_id, org_id, ativo
)
VALUES (
    v_phone_number_id,
    'Welcome Corporativo',
    'CORP',
    v_pipeline_id,
    v_phase_id,
    v_stage_aberto_id,
    true,
    true,
    v_echo_platform_id,
    v_workspace_id,
    true
);

-- ============================================================================
-- 2. Campo "Categoria do produto" no catálogo de campos do Corp
--    Dropdown com 7 valores. Salvo em cards.produto_data.categoria_produto
-- ============================================================================

DELETE FROM system_fields
  WHERE org_id = v_workspace_id AND key = 'categoria_produto';

INSERT INTO system_fields (
    org_id, key, label, type, section, active,
    options, order_index, produto_exclusivo
)
VALUES (
    v_workspace_id,
    'categoria_produto',
    'Categoria do produto',
    'select',
    'info',
    true,
    '[
        {"value": "aereo_nacional",      "label": "Aéreo nacional"},
        {"value": "aereo_internacional", "label": "Aéreo internacional"},
        {"value": "hotel",               "label": "Hotel"},
        {"value": "carro",               "label": "Carro"},
        {"value": "onibus",              "label": "Ônibus"},
        {"value": "seguro_viagem",       "label": "Seguro viagem"},
        {"value": "outros",              "label": "Outros"}
    ]'::jsonb,
    1,
    'CORP'
);

-- Visível na etapa "Aberto" e "Fechado"
INSERT INTO stage_field_config (org_id, stage_id, field_key, is_visible, is_required)
VALUES
    (v_workspace_id, v_stage_aberto_id,                                    'categoria_produto', true, false),
    (v_workspace_id, 'e0000000-0000-0000-0000-000000000032'::uuid,         'categoria_produto', true, false)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 3. Pipeline card settings (Kanban mostra empresa + data de abertura)
--    O card vai exibir empresa (pessoa_nome) + tempo de abertura relativo
--    (renderizado pelo frontend baseado em created_at).
--    categoria_produto NÃO entra no kanban (pedido da gestora: só empresa+tempo)
-- ============================================================================

UPDATE pipeline_card_settings
SET
    campos_kanban = '["pessoa_nome", "created_at", "categoria_produto"]'::jsonb,
    ordem_kanban  = '["pessoa_nome", "categoria_produto", "created_at"]'::jsonb
WHERE phase_id = v_phase_id;

-- ============================================================================
-- 4. Smoke check
-- ============================================================================
DECLARE
    v_count INT;
BEGIN
    SELECT COUNT(*) INTO v_count FROM whatsapp_linha_config
        WHERE phone_number_id = v_phone_number_id AND ativo = true;
    IF v_count <> 1 THEN RAISE EXCEPTION 'Linha WhatsApp Corp não foi criada'; END IF;

    SELECT COUNT(*) INTO v_count FROM system_fields
        WHERE org_id = v_workspace_id AND key = 'categoria_produto' AND active = true;
    IF v_count <> 1 THEN RAISE EXCEPTION 'Campo categoria_produto não foi criado'; END IF;

    RAISE NOTICE '✅ Welcome Corporativo onda 1: linha WhatsApp + campo categoria + kanban settings';
END;

END $migration$;

COMMIT;
