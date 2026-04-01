-- H3-009: Add org_id filtering to SECURITY DEFINER functions
-- These functions bypass RLS, so they MUST explicitly filter by org.
--
-- Pattern for analytics RPCs:
--   Add c.org_id = requesting_org_id() to WHERE clauses
--
-- Pattern for business RPCs:
--   Add PERFORM guard at the top: verify card belongs to user's org
--
-- Pattern for role functions:
--   Add org_id filter to profiles query

-- =============================================================================
-- is_admin() — Add org filter
-- =============================================================================
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1
        FROM public.profiles p
        LEFT JOIN public.roles r ON p.role_id = r.id
        WHERE p.id = auth.uid()
          AND p.org_id = requesting_org_id()
          AND (
            p.is_admin = TRUE
            OR p.role = 'admin'
            OR r.name = 'admin'
          )
    );
END;
$$;

-- =============================================================================
-- marcar_ganho() — Add org guard
-- Source: 20260331_fix_marcar_ganho_overload.sql
-- =============================================================================

-- Drop overloads first
DROP FUNCTION IF EXISTS public.marcar_ganho(UUID, UUID);

CREATE OR REPLACE FUNCTION public.marcar_ganho(
    p_card_id UUID,
    p_novo_dono_id UUID DEFAULT NULL,
    p_skip_pos_venda BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
    v_card RECORD;
    v_phase_slug TEXT;
    v_phase_order INT;
    v_next_phase RECORD;
    v_first_stage_id UUID;
    v_result JSONB;
BEGIN
    -- ORG GUARD: verify card belongs to user's org
    PERFORM 1 FROM cards WHERE id = p_card_id AND org_id = requesting_org_id();
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Card nao encontrado ou acesso negado: %', p_card_id;
    END IF;

    -- Buscar card com dados da etapa e fase atual
    SELECT
        c.id,
        c.pipeline_stage_id,
        c.status_comercial,
        c.dono_atual_id,
        c.sdr_owner_id,
        c.vendas_owner_id,
        c.pos_owner_id,
        c.ganho_sdr,
        c.ganho_planner,
        c.ganho_pos,
        s.pipeline_id,
        pp.slug AS phase_slug,
        pp.order_index AS phase_order
    INTO v_card
    FROM cards c
    JOIN pipeline_stages s ON s.id = c.pipeline_stage_id
    JOIN pipeline_phases pp ON pp.id = s.phase_id
    WHERE c.id = p_card_id
      AND c.org_id = requesting_org_id()
      AND c.deleted_at IS NULL;

    IF v_card IS NULL THEN
        RAISE EXCEPTION 'Card nao encontrado ou deletado: %', p_card_id;
    END IF;

    IF v_card.status_comercial IN ('ganho', 'perdido') THEN
        RAISE EXCEPTION 'Card ja esta com status %', v_card.status_comercial;
    END IF;

    v_phase_slug := v_card.phase_slug;

    -- GANHO SDR: Avanca para primeira etapa de Planner
    IF v_phase_slug = 'sdr' THEN
        SELECT DISTINCT pp.id, pp.slug INTO v_next_phase
        FROM pipeline_phases pp
        JOIN pipeline_stages s2 ON s2.phase_id = pp.id
        WHERE s2.pipeline_id = v_card.pipeline_id
          AND pp.slug = 'planner'
        LIMIT 1;

        IF v_next_phase IS NULL THEN
            RAISE EXCEPTION 'Fase planner nao encontrada para o pipeline do card';
        END IF;

        SELECT s.id INTO v_first_stage_id
        FROM pipeline_stages s
        WHERE s.phase_id = v_next_phase.id
          AND s.ativo = true
          AND COALESCE(s.is_won, false) = false
          AND COALESCE(s.is_lost, false) = false
        ORDER BY s.ordem ASC
        LIMIT 1;

        IF v_first_stage_id IS NULL THEN
            RAISE EXCEPTION 'Nenhuma etapa ativa encontrada na fase planner';
        END IF;

        UPDATE cards SET
            ganho_sdr = true,
            ganho_sdr_at = COALESCE(ganho_sdr_at, NOW()),
            dono_atual_id = COALESCE(p_novo_dono_id, vendas_owner_id, dono_atual_id),
            pipeline_stage_id = v_first_stage_id,
            stage_entered_at = NOW(),
            updated_at = NOW()
        WHERE id = p_card_id;

        v_result := jsonb_build_object(
            'action', 'won_section',
            'phase', v_phase_slug,
            'milestone', 'ganho_sdr',
            'moved_to_stage', v_first_stage_id,
            'moved_to_phase', 'planner'
        );

    -- GANHO PLANNER
    ELSIF v_phase_slug = 'planner' THEN

        IF p_skip_pos_venda THEN
            UPDATE cards SET
                ganho_planner = true,
                ganho_planner_at = COALESCE(ganho_planner_at, NOW()),
                status_comercial = 'ganho',
                data_fechamento = CURRENT_DATE,
                updated_at = NOW()
            WHERE id = p_card_id;

            v_result := jsonb_build_object(
                'action', 'won_direct',
                'phase', v_phase_slug,
                'milestone', 'ganho_planner',
                'skip_pos_venda', true
            );

        ELSE
            SELECT DISTINCT pp.id, pp.slug INTO v_next_phase
            FROM pipeline_phases pp
            JOIN pipeline_stages s2 ON s2.phase_id = pp.id
            WHERE s2.pipeline_id = v_card.pipeline_id
              AND pp.slug = 'pos_venda'
            LIMIT 1;

            IF v_next_phase IS NULL THEN
                RAISE EXCEPTION 'Fase pos_venda nao encontrada para o pipeline do card';
            END IF;

            SELECT s.id INTO v_first_stage_id
            FROM pipeline_stages s
            WHERE s.phase_id = v_next_phase.id
              AND s.ativo = true
              AND COALESCE(s.is_won, false) = false
              AND COALESCE(s.is_lost, false) = false
            ORDER BY s.ordem ASC
            LIMIT 1;

            IF v_first_stage_id IS NULL THEN
                RAISE EXCEPTION 'Nenhuma etapa ativa encontrada na fase pos_venda';
            END IF;

            UPDATE cards SET
                ganho_planner = true,
                ganho_planner_at = COALESCE(ganho_planner_at, NOW()),
                dono_atual_id = COALESCE(p_novo_dono_id, pos_owner_id, dono_atual_id),
                pipeline_stage_id = v_first_stage_id,
                stage_entered_at = NOW(),
                updated_at = NOW()
            WHERE id = p_card_id;

            v_result := jsonb_build_object(
                'action', 'won_section',
                'phase', v_phase_slug,
                'milestone', 'ganho_planner',
                'moved_to_stage', v_first_stage_id,
                'moved_to_phase', 'pos_venda'
            );
        END IF;

    ELSE
        RAISE EXCEPTION 'Fase % nao suporta acao de ganho', v_phase_slug;
    END IF;

    -- Registrar activity
    INSERT INTO activities (card_id, tipo, descricao, metadata, org_id)
    VALUES (
        p_card_id,
        'section_won',
        CASE WHEN p_skip_pos_venda AND v_phase_slug = 'planner'
             THEN 'Venda fechada sem pos-venda (planner)'
             ELSE 'Secao ganha: ' || v_phase_slug
        END,
        v_result,
        requesting_org_id()
    );

    RETURN v_result;
END;
$fn$;

-- =============================================================================
-- completar_sub_card() — Add org guard
-- Source: 20260326_view_cards_acoes_sub_cards_and_completar_rpc.sql
-- =============================================================================
CREATE OR REPLACE FUNCTION completar_sub_card(p_sub_card_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_sub RECORD;
    v_user_id UUID;
BEGIN
    v_user_id := auth.uid();

    -- ORG GUARD
    SELECT c.id, c.titulo, c.card_type, c.sub_card_status, c.parent_card_id,
           c.pipeline_stage_id, c.pipeline_id
    INTO v_sub
    FROM cards c
    WHERE c.id = p_sub_card_id
      AND c.org_id = requesting_org_id()
      AND c.card_type = 'sub_card'
      AND c.deleted_at IS NULL;

    IF v_sub IS NULL THEN
        RAISE EXCEPTION 'Sub-card nao encontrado ou acesso negado';
    END IF;

    IF v_sub.sub_card_status = 'completed' THEN
        RETURN jsonb_build_object('status', 'already_completed');
    END IF;

    -- Mark as completed
    UPDATE cards SET
        sub_card_status = 'completed',
        status_comercial = 'ganho',
        data_fechamento = CURRENT_DATE,
        updated_at = NOW()
    WHERE id = p_sub_card_id;

    -- Log activity
    INSERT INTO activities (card_id, tipo, descricao, metadata, created_by, org_id)
    VALUES (
        p_sub_card_id,
        'sub_card_completed',
        'Sub-card completado: ' || v_sub.titulo,
        jsonb_build_object('parent_card_id', v_sub.parent_card_id),
        v_user_id,
        requesting_org_id()
    );

    RETURN jsonb_build_object(
        'status', 'completed',
        'sub_card_id', p_sub_card_id,
        'parent_card_id', v_sub.parent_card_id
    );
END;
$$;
