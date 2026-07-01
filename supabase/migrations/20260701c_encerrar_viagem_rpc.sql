-- ============================================================================
-- MIGRATION: encerrar_viagem — RPC de encerramento do ciclo de pós-venda (TRIPS)
-- Date: 2026-07-01
--
-- Contexto (spec docs/superpowers/specs/2026-07-01-encerrar-viagem-trips-design.md):
-- A última etapa de pós-venda do TRIPS ("Pós-viagem & Reativação", ordem 5 da
-- fase pos_venda) acumula viagens já realizadas. "Encerrar" = tirar do funil.
-- O mecanismo que esconde do funil é `cards.ganho_pos=true` (mantido como coluna
-- interna; na UI o conceito se chama "encerramento").
--
-- Regra:
--   - Só produto TRIPS, só na última etapa de pós-venda (pos_venda, não-terminal,
--     ordem >= 5) — alinhado ao guard enforce_trips_ganho_pos_only_in_pos_viagem.
--   - Se a viagem TEM venda real (card_financial_items ativo OU ganho_planner=true):
--     consolida como ganha (status_comercial='ganho', ganho_planner=true,
--     ganho_pos=true) — corrige o status travado em 'aberto'.
--   - Se NÃO tem venda: apenas encerra (ganho_pos=true), status inalterado.
--   - Idempotente: card já encerrado (ganho_pos=true) → noop.
--   - Guard multi-tenant: card deve pertencer a requesting_org_id() (CLAUDE.md §Backend #7).
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.encerrar_viagem(p_card_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
    v_card RECORD;
    v_tem_venda BOOLEAN;
    v_user_id UUID;
    v_result JSONB;
BEGIN
    v_user_id := auth.uid();

    SELECT
        c.id,
        c.org_id,
        c.produto,
        c.status_comercial,
        c.ganho_pos,
        c.ganho_planner,
        c.pipeline_stage_id,
        s.ordem       AS stage_ordem,
        s.is_terminal AS stage_is_terminal,
        ph.slug       AS phase_slug
    INTO v_card
    FROM cards c
    JOIN pipeline_stages s ON s.id = c.pipeline_stage_id
    JOIN pipeline_phases ph ON ph.id = s.phase_id
    WHERE c.id = p_card_id
      AND c.deleted_at IS NULL;

    IF v_card IS NULL THEN
        RAISE EXCEPTION 'Card não encontrado ou deletado: %', p_card_id;
    END IF;

    -- Guard multi-tenant (SECURITY DEFINER que muta tabela por-org).
    -- IS DISTINCT FROM: bloqueia também requesting_org_id()=NULL (sem JWT / anon),
    -- que com "<>" passaria batido (NULL não dispara o IF).
    IF v_card.org_id IS DISTINCT FROM requesting_org_id() THEN
        RAISE EXCEPTION 'Card % não pertence à sua organização', p_card_id
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF v_card.produto <> 'TRIPS' THEN
        RAISE EXCEPTION 'Encerrar viagem é exclusivo do produto TRIPS (card %)', p_card_id;
    END IF;

    -- Escopo: última etapa de pós-venda (fase pos_venda, não-terminal, ordem >= 5)
    IF v_card.phase_slug <> 'pos_venda'
       OR COALESCE(v_card.stage_is_terminal, false) IS TRUE
       OR COALESCE(v_card.stage_ordem, 0) < 5 THEN
        RAISE EXCEPTION 'Encerrar viagem só é permitido na última etapa de Pós-venda (card %)', p_card_id;
    END IF;

    -- Já encerrada → noop idempotente
    IF v_card.ganho_pos IS TRUE THEN
        RETURN jsonb_build_object('action', 'noop', 'reason', 'ja_encerrada');
    END IF;

    v_tem_venda :=
        EXISTS (
            SELECT 1 FROM card_financial_items fi
            WHERE fi.card_id = p_card_id AND fi.archived_at IS NULL
        )
        OR COALESCE(v_card.ganho_planner, false);

    IF v_tem_venda THEN
        UPDATE cards SET
            status_comercial = 'ganho',
            ganho_planner    = true,
            ganho_planner_at = COALESCE(ganho_planner_at, NOW()),
            ganho_pos        = true,
            ganho_pos_at     = COALESCE(ganho_pos_at, NOW()),
            data_fechamento  = COALESCE(data_fechamento, CURRENT_DATE),
            updated_at       = NOW()
        WHERE id = p_card_id;

        v_result := jsonb_build_object('action', 'encerrada', 'consolidado_ganho', true);
    ELSE
        UPDATE cards SET
            ganho_pos    = true,
            ganho_pos_at = COALESCE(ganho_pos_at, NOW()),
            updated_at   = NOW()
        WHERE id = p_card_id;

        v_result := jsonb_build_object('action', 'encerrada', 'consolidado_ganho', false);
    END IF;

    -- Timeline do card (org_id preenchido por trigger auto_set_activity_org_id_trigger)
    INSERT INTO activities (card_id, tipo, descricao, metadata, created_by)
    VALUES (
        p_card_id,
        'viagem_encerrada',
        CASE WHEN v_tem_venda
             THEN 'Viagem encerrada (consolidada como ganha)'
             ELSE 'Viagem encerrada'
        END,
        v_result,
        v_user_id
    );

    RETURN v_result;
END;
$fn$;

-- Segurança: revogar o EXECUTE default do PUBLIC (anon inclusive) e conceder só
-- a authenticated. (Regra feedback_rpc_grants_anon_systemic: SECURITY DEFINER em
-- public nasce aberta ao anon.) service_role é bloqueado pelo guard de org
-- (requesting_org_id()=NULL) — não precisa de grant.
REVOKE ALL ON FUNCTION public.encerrar_viagem(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.encerrar_viagem(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.encerrar_viagem(UUID) TO authenticated;

COMMENT ON FUNCTION public.encerrar_viagem(UUID) IS
  'Encerra o ciclo de pós-venda de um card TRIPS na última etapa (Pós-viagem & Reativação): seta ganho_pos=true (sai do funil) e, se há venda real, consolida como ganho. Guard multi-tenant + escopo de etapa. Spec 2026-07-01.';

COMMIT;
