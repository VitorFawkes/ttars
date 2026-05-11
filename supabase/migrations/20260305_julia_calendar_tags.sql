-- ============================================================
-- Migration: Julia Calendar + Tags + Meeting Fixes
-- 1A. get_client_by_phone: adicionar produto e sdr_owner_id
-- 1B. julia_check_calendar: verificar disponibilidade de agenda
-- 1C. julia_assign_tag: find-or-create tag + assign ao card
-- ============================================================

-- ============================================================
-- PARTE 1A: Atualizar get_client_by_phone
-- Adiciona produto e sdr_owner_id ao retorno JSONB
-- ============================================================

CREATE OR REPLACE FUNCTION get_client_by_phone(
    p_phone_with_9 TEXT,
    p_phone_without_9 TEXT,
    p_conversation_id TEXT DEFAULT ''
) RETURNS JSONB AS $$
DECLARE
    v_contato_id UUID;
    v_contato RECORD;
    v_card RECORD;
BEGIN
    -- Usar matching robusto (tenta conversation_id primeiro, depois phone)
    v_contato_id := find_contact_by_whatsapp(p_phone_with_9, COALESCE(p_conversation_id, ''));
    IF v_contato_id IS NULL AND p_phone_without_9 IS NOT NULL AND p_phone_without_9 <> p_phone_with_9 THEN
        v_contato_id := find_contact_by_whatsapp(p_phone_without_9, COALESCE(p_conversation_id, ''));
    END IF;

    IF v_contato_id IS NULL THEN
        RETURN jsonb_build_object('found', false);
    END IF;

    SELECT * INTO v_contato FROM contatos WHERE id = v_contato_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('found', false);
    END IF;

    -- Busca card ativo mais recente
    SELECT * INTO v_card FROM cards
    WHERE pessoa_principal_id = v_contato.id
      AND status_comercial NOT IN ('ganho', 'perdido')
      AND deleted_at IS NULL
    ORDER BY created_at DESC
    LIMIT 1;

    RETURN jsonb_build_object(
        'found', true,
        'id', v_contato.id,
        'nome', COALESCE(v_contato.nome, ''),
        'sobrenome', COALESCE(v_contato.sobrenome, ''),
        'telefone', COALESCE(normalize_phone(v_contato.telefone), ''),
        'email', COALESCE(v_contato.email, ''),
        'cpf', COALESCE(v_contato.cpf, ''),
        'passaporte', COALESCE(v_contato.passaporte, ''),
        'data_nascimento', COALESCE(v_contato.data_nascimento::text, ''),
        'endereco', COALESCE(v_contato.endereco, '{}'::jsonb),
        'observacoes', COALESCE(v_contato.observacoes, ''),
        'card_id', v_card.id,
        'titulo', COALESCE(v_card.titulo, ''),
        'pipeline_stage_id', COALESCE(v_card.pipeline_stage_id::text, ''),
        'ai_resumo', COALESCE(v_card.ai_resumo, ''),
        'ai_contexto', COALESCE(v_card.ai_contexto, ''),
        'ai_responsavel', COALESCE(v_card.ai_responsavel, 'ia'),
        'produto_data', COALESCE(v_card.produto_data, '{}'::jsonb),
        'valor_estimado', v_card.valor_estimado,
        -- Dados ActiveCampaign / Marketing
        'marketing_data', COALESCE(v_card.marketing_data, '{}'::jsonb),
        'briefing_inicial', COALESCE(v_card.briefing_inicial, '{}'::jsonb),
        'origem', COALESCE(v_card.origem, ''),
        'origem_lead', COALESCE(v_card.origem_lead, ''),
        'mkt_buscando_para_viagem', COALESCE(v_card.mkt_buscando_para_viagem, ''),
        -- NOVO: produto e sdr_owner_id para Julia
        'produto', COALESCE(v_card.produto, 'TRIPS'),
        'sdr_owner_id', COALESCE(v_card.sdr_owner_id::text, v_card.dono_atual_id::text, '')
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;


-- ============================================================
-- PARTE 1B: julia_check_calendar
-- Retorna slots ocupados e disponíveis para um profile
-- ============================================================

CREATE OR REPLACE FUNCTION julia_check_calendar(
    p_owner_id UUID,
    p_date_from DATE DEFAULT CURRENT_DATE,
    p_date_to DATE DEFAULT (CURRENT_DATE + 5)
) RETURNS JSONB AS $$
DECLARE
    v_busy_slots JSONB;
    v_available_slots JSONB;
    v_profile_nome TEXT;
BEGIN
    -- Se owner_id é NULL, retornar sem dados
    IF p_owner_id IS NULL THEN
        RETURN jsonb_build_object(
            'error', 'Nenhum responsavel atribuido ao card',
            'busy_slots', '[]'::jsonb,
            'available_slots', '[]'::jsonb
        );
    END IF;

    -- Nome do profile para contexto
    SELECT nome INTO v_profile_nome FROM profiles WHERE id = p_owner_id;

    -- Slots ocupados (reuniões existentes)
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'date', to_char(t.data_vencimento AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD'),
        'time', to_char(t.data_vencimento AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI'),
        'duration_minutes', COALESCE((t.metadata->>'duration_minutes')::int, 30),
        'titulo', t.titulo
    ) ORDER BY t.data_vencimento), '[]'::jsonb)
    INTO v_busy_slots
    FROM tarefas t
    WHERE t.responsavel_id = p_owner_id
      AND t.tipo IN ('reuniao', 'meeting')
      AND COALESCE(t.status, '') IN ('agendada', 'pendente')
      AND t.data_vencimento::date BETWEEN p_date_from AND p_date_to
      AND COALESCE(t.concluida, false) = false
      AND t.deleted_at IS NULL;

    -- Slots disponíveis (30min, seg-sex, 9:00-17:30, excluindo ocupados)
    WITH days AS (
        SELECT d::date AS day
        FROM generate_series(p_date_from::timestamp, p_date_to::timestamp, '1 day') d
        WHERE EXTRACT(DOW FROM d) BETWEEN 1 AND 5  -- Seg-Sex
    ),
    slots AS (
        SELECT day, s AS slot_time
        FROM days, generate_series('09:00'::time, '17:30'::time, '30 minutes') s
    ),
    busy AS (
        SELECT
            (t.data_vencimento AT TIME ZONE 'America/Sao_Paulo')::date AS busy_day,
            (t.data_vencimento AT TIME ZONE 'America/Sao_Paulo')::time AS busy_start,
            ((t.data_vencimento AT TIME ZONE 'America/Sao_Paulo') +
             (COALESCE((t.metadata->>'duration_minutes')::int, 30) || ' minutes')::interval)::time AS busy_end
        FROM tarefas t
        WHERE t.responsavel_id = p_owner_id
          AND t.tipo IN ('reuniao', 'meeting')
          AND COALESCE(t.status, '') IN ('agendada', 'pendente')
          AND t.data_vencimento::date BETWEEN p_date_from AND p_date_to
          AND COALESCE(t.concluida, false) = false
          AND t.deleted_at IS NULL
    )
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'date', to_char(s.day, 'YYYY-MM-DD'),
        'weekday', to_char(s.day, 'TMDy'),
        'time', to_char(s.slot_time, 'HH24:MI')
    ) ORDER BY s.day, s.slot_time), '[]'::jsonb)
    INTO v_available_slots
    FROM slots s
    WHERE NOT EXISTS (
        SELECT 1 FROM busy b
        WHERE b.busy_day = s.day
          AND s.slot_time >= b.busy_start
          AND s.slot_time < b.busy_end
    )
    -- Apenas slots futuros
    AND (s.day > CURRENT_DATE
         OR (s.day = CURRENT_DATE AND s.slot_time > (NOW() AT TIME ZONE 'America/Sao_Paulo')::time))
    LIMIT 10;

    RETURN jsonb_build_object(
        'profile_nome', COALESCE(v_profile_nome, ''),
        'owner_id', p_owner_id,
        'range', jsonb_build_object('from', p_date_from, 'to', p_date_to),
        'busy_slots', v_busy_slots,
        'available_slots', v_available_slots
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

GRANT EXECUTE ON FUNCTION julia_check_calendar(UUID, DATE, DATE) TO service_role;


-- ============================================================
-- PARTE 1C: julia_assign_tag
-- Find-or-create tag + assign ao card (idempotente)
-- ============================================================

CREATE OR REPLACE FUNCTION julia_assign_tag(
    p_card_id UUID,
    p_tag_name TEXT,
    p_tag_color TEXT DEFAULT '#ef4444'
) RETURNS JSONB AS $$
DECLARE
    v_tag_id UUID;
    v_produto TEXT;
BEGIN
    -- Buscar produto do card para contexto
    SELECT produto INTO v_produto FROM cards WHERE id = p_card_id;

    -- Buscar tag existente (case-insensitive, mesmo produto ou shared)
    SELECT id INTO v_tag_id
    FROM card_tags
    WHERE LOWER(name) = LOWER(p_tag_name)
      AND (produto IS NULL OR produto = v_produto)
      AND is_active = true
    ORDER BY produto NULLS LAST  -- Preferir tag específica do produto
    LIMIT 1;

    -- Criar tag se não existe (shared, produto = NULL)
    IF v_tag_id IS NULL THEN
        INSERT INTO card_tags (name, color, produto, is_active)
        VALUES (p_tag_name, p_tag_color, NULL, true)
        RETURNING id INTO v_tag_id;
    END IF;

    -- Atribuir tag ao card (idempotente via ON CONFLICT)
    INSERT INTO card_tag_assignments (card_id, tag_id)
    VALUES (p_card_id, v_tag_id)
    ON CONFLICT (card_id, tag_id) DO NOTHING;

    RETURN jsonb_build_object(
        'success', true,
        'tag_id', v_tag_id,
        'tag_name', p_tag_name,
        'card_id', p_card_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

GRANT EXECUTE ON FUNCTION julia_assign_tag(UUID, TEXT, TEXT) TO service_role;
