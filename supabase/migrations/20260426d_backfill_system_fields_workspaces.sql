-- ============================================================================
-- Backfill de system_fields para os workspaces da Welcome Group
--
-- Motivação: `provision_workspace` (em 20260426c) passa a semear system_fields
-- na criação de novas empresas-cliente. Porém, Welcome Trips, Welcome Weddings
-- e Welcome Courses foram criadas antes dessa migration e hoje têm 0 linhas
-- em system_fields — dependem do fallback RLS para a account pai.
--
-- Esta migration copia os 147 campos da account Welcome Group para cada
-- workspace filho, respeitando o filtro produto_exclusivo:
--   - Campos universais (produto_exclusivo IS NULL) → vão para todos
--   - Campos TRIPS → vão para Welcome Trips + Welcome Courses (slug=TRIPS)
--   - Campos WEDDING → vão para Welcome Weddings
--
-- Após isso, cada workspace tem seu catálogo próprio e não depende mais de
-- RLS fallback para a account. A account Welcome Group continua sendo a
-- FONTE DE VERDADE usada por provision_workspace para novas empresas.
-- ============================================================================

BEGIN;

DO $$
DECLARE
    v_source_account UUID := 'a0000000-0000-0000-0000-000000000001'; -- Welcome Group
    v_target RECORD;
    v_fields_copied INT;
    v_product_slug TEXT;
BEGIN
    -- Staging defasado pode não ter system_fields.org_id — no-op nesse caso.
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'system_fields' AND column_name = 'org_id'
    ) THEN
        RAISE NOTICE 'system_fields.org_id ausente, pulando backfill (staging defasado)';
        RETURN;
    END IF;

    FOR v_target IN
        SELECT o.id AS workspace_id, o.name AS workspace_name, p.slug AS product_slug
        FROM organizations o
        LEFT JOIN products p ON p.org_id = o.id AND p.active = true
        WHERE o.parent_org_id = v_source_account
          AND o.active = true
        ORDER BY o.name
    LOOP
        v_product_slug := v_target.product_slug;

        -- Pular workspaces sem produto configurado (evita backfill inconsistente)
        IF v_product_slug IS NULL THEN
            RAISE NOTICE 'Pulando % (sem produto ativo)', v_target.workspace_name;
            CONTINUE;
        END IF;

        -- Só copiar se o workspace ainda não tem fields próprios
        -- (evita duplicação em re-runs idempotentes)
        IF EXISTS (
            SELECT 1 FROM system_fields
            WHERE org_id = v_target.workspace_id
        ) THEN
            RAISE NOTICE 'Workspace % já tem system_fields, pulando', v_target.workspace_name;
            CONTINUE;
        END IF;

        INSERT INTO system_fields (
            key, label, type, options, active, section, is_system,
            section_id, order_index, produto_exclusivo, org_id
        )
        SELECT
            sf.key,
            sf.label,
            sf.type,
            sf.options,
            sf.active,
            sf.section,
            sf.is_system,
            NULL, -- section_id local será populado quando admin mapear seções
            sf.order_index,
            sf.produto_exclusivo,
            v_target.workspace_id
        FROM system_fields sf
        WHERE sf.org_id = v_source_account
          AND (sf.produto_exclusivo IS NULL OR sf.produto_exclusivo = v_product_slug)
        ON CONFLICT DO NOTHING;

        GET DIAGNOSTICS v_fields_copied = ROW_COUNT;
        RAISE NOTICE 'Workspace % (%) — % system_fields copiados', v_target.workspace_name, v_product_slug, v_fields_copied;
    END LOOP;
END
$$;

COMMIT;
