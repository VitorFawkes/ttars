-- ============================================================================
-- MIGRATION: Campo "Data Prevista de Fechamento" + trigger de validação
-- Date: 2026-05-12
--
-- CONTEXTO
-- Travel Planner precisa registrar quando espera fechar a venda do card.
-- O sistema usa esse campo pra (a) bloquear avanço de etapa sem preenchimento
-- a partir de "Proposta Enviada" e (b) alertar quando a data prevista virou
-- passado (cliente atrasou pra fechar).
--
-- ARMAZENAMENTO
-- O campo vive em cards.produto_data->>'data_prevista_fechamento' (JSONB),
-- não como coluna direta. Justificativa:
-- 1. validate_stage_requirements() (20260406) já lê produto_data->>field_key
--    — funciona out-of-the-box, sem ajuste no SQL backend.
-- 2. TripInformation.tsx já escreve em produto_data via mutation existente.
-- 3. Sem schema change. Dashboards V2 podem casts (produto_data->>'data_...')::date.
--
-- ESCOPO
-- - Seed em system_fields para todas as orgs com produto TRIPS + Welcome Group
--   account (fonte do provision_workspace para futuras orgs).
-- - Seed em section_field_config marcando o campo como visível dentro da
--   section trip_info (que renderiza via TripInformation.tsx).
-- - Trigger BEFORE INSERT/UPDATE em cards rejeitando valores no passado quando
--   a data está sendo PREENCHIDA ou ALTERADA. Respeita bypass via GUC
--   app.bypass_stage_requirements='true' e role service_role.
--
-- provision_workspace (20260426c, linha 222) já copia system_fields de
-- a0000000 (Welcome Group) filtrando por produto_exclusivo=p_product_slug.
-- Como inserimos aqui em a0000000, futuras orgs TRIPS herdam automaticamente.
-- Nada a alterar em provision_workspace.
-- ============================================================================

BEGIN;

-- ─── 1. system_fields: cadastrar o novo campo em cada org TRIPS ──────────────

INSERT INTO system_fields (
    key, label, type, options, active, section, is_system,
    section_id, order_index, produto_exclusivo, org_id
)
SELECT
    'data_prevista_fechamento'::text AS key,
    'Data Prevista de Fechamento'::text AS label,
    'date'::text AS type,
    NULL::jsonb AS options,
    true AS active,
    'trip_info'::text AS section,
    false AS is_system,
    NULL::uuid AS section_id,
    100 AS order_index,
    'TRIPS'::text AS produto_exclusivo,
    o.id AS org_id
FROM organizations o
WHERE
    -- Welcome Group account: fonte do seed pra futuras orgs via provision_workspace
    o.id = 'a0000000-0000-0000-0000-000000000001'::uuid
    -- Todas as orgs com pelo menos um pipeline TRIPS
    OR EXISTS (
        SELECT 1 FROM pipelines p
        WHERE p.org_id = o.id AND p.produto::TEXT = 'TRIPS'
    )
ON CONFLICT (org_id, key) DO NOTHING;

-- ─── 2. section_field_config: marcar campo visível dentro de trip_info ───────

INSERT INTO section_field_config (section_key, field_key, is_visible, is_required, org_id)
SELECT
    'trip_info'::text AS section_key,
    'data_prevista_fechamento'::text AS field_key,
    true AS is_visible,
    false AS is_required,  -- obrigatoriedade vem de stage_field_config (Bloco 3)
    sf.org_id
FROM system_fields sf
WHERE sf.key = 'data_prevista_fechamento'
ON CONFLICT DO NOTHING;

-- ─── 3. Trigger: rejeita data prevista no passado em INSERT/UPDATE ───────────

CREATE OR REPLACE FUNCTION public.validate_data_prevista_fechamento()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $fn$
DECLARE
    v_new_date DATE;
    v_old_date DATE;
BEGIN
    -- Bypass: rotinas legítimas (importação em massa, restore de backup, etc.)
    -- usam o mesmo GUC do quality gate
    IF current_setting('app.bypass_stage_requirements', true) = 'true' THEN
        RETURN NEW;
    END IF;

    -- Service role bypass (edge functions, integrações, scripts admin)
    IF current_setting('request.jwt.claims', true)::jsonb ->> 'role' = 'service_role' THEN
        RETURN NEW;
    END IF;

    -- Lê data atual do JSONB (NULLIF trata string vazia como NULL)
    v_new_date := NULLIF(NEW.produto_data->>'data_prevista_fechamento', '')::DATE;
    v_old_date := CASE WHEN TG_OP = 'UPDATE'
        THEN NULLIF(OLD.produto_data->>'data_prevista_fechamento', '')::DATE
        ELSE NULL END;

    -- Só valida se a data está sendo PREENCHIDA OU ALTERADA.
    -- Se ela já estava no passado e o update está mexendo em outro campo
    -- (descrição, owner, observações etc.), deixa passar — não trava o card.
    IF v_new_date IS NOT NULL
       AND v_new_date < CURRENT_DATE
       AND (TG_OP = 'INSERT' OR v_new_date IS DISTINCT FROM v_old_date)
    THEN
        RAISE EXCEPTION 'Data Prevista de Fechamento não pode ser no passado: %', v_new_date
            USING ERRCODE = 'check_violation',
                  HINT = 'Escolha uma data igual ou posterior a hoje.';
    END IF;

    RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_validate_data_prevista_fechamento ON cards;

CREATE TRIGGER trg_validate_data_prevista_fechamento
    BEFORE INSERT OR UPDATE OF produto_data ON cards
    FOR EACH ROW
    EXECUTE FUNCTION public.validate_data_prevista_fechamento();

COMMENT ON FUNCTION public.validate_data_prevista_fechamento() IS
    'Rejeita produto_data.data_prevista_fechamento no passado em INSERT ou quando o campo é alterado em UPDATE. Permite UPDATE de outros campos com data já passada (não trava o card). Respeita app.bypass_stage_requirements GUC e role service_role.';

COMMIT;
