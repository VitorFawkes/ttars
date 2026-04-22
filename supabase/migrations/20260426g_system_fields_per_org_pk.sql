-- ============================================================================
-- system_fields: trocar PK de (key) para (org_id, key) — destravar semântica per-org
--
-- Motivação: a tabela ganhou coluna `org_id` em `20260402_h3_007_rls_org_scoped.sql`
-- mas a primary key continua sendo só `key`. Isso impede:
--   1. Workspaces distintos terem fields com a mesma chave (ex: briefing em WT
--      E em Jair Viagens) — hoje o segundo INSERT falha com `system_fields_pkey`.
--   2. `provision_workspace` (20260426c) semear fields pra nova account — a
--      clausula ON CONFLICT DO NOTHING silenciosamente ignora as inserções.
--   3. Backfill pra Welcome Trips/Weddings/Courses (20260426d) rodar de fato.
--
-- Correção:
--   1. Dropar FK `section_field_config_field_key_fkey` (que depende da PK atual).
--   2. Dropar PK `system_fields_pkey`.
--   3. Criar PK composta em (org_id, key). Isso consome o UNIQUE index existente
--      `idx_system_fields_org_key` (criado em 20260402_h3_003_tier2_org_id).
--   4. Re-criar FK como composite (field_key, org_id) → system_fields(key, org_id).
--      section_field_config já tem coluna org_id (verificado em audit 2026-04-22).
--   5. Rodar o backfill que 20260426d tentou rodar mas travou por conflito de PK.
--
-- Staging-safe: o bloco inteiro só roda se system_fields.org_id existe (staging
-- defasado é no-op).
-- ============================================================================

BEGIN;

DO $$
DECLARE
    v_source_account UUID := 'a0000000-0000-0000-0000-000000000001'; -- Welcome Group
    v_target RECORD;
    v_fields_copied INT;
    v_product_slug TEXT;
    v_has_fk BOOLEAN;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'system_fields' AND column_name = 'org_id'
    ) THEN
        RAISE NOTICE 'system_fields.org_id ausente, pulando (staging defasado)';
        RETURN;
    END IF;

    -- 1. Dropar FK dependente (section_field_config → system_fields)
    SELECT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_schema = 'public'
          AND table_name = 'section_field_config'
          AND constraint_name = 'section_field_config_field_key_fkey'
    ) INTO v_has_fk;

    IF v_has_fk THEN
        ALTER TABLE section_field_config
            DROP CONSTRAINT section_field_config_field_key_fkey;
        RAISE NOTICE 'FK section_field_config_field_key_fkey dropada';
    ELSE
        RAISE NOTICE 'FK section_field_config_field_key_fkey já não existe';
    END IF;

    -- 2. Dropar PK atual (se ainda for só em key)
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints tc
        WHERE tc.constraint_schema = 'public'
          AND tc.table_name = 'system_fields'
          AND tc.constraint_name = 'system_fields_pkey'
          AND tc.constraint_type = 'PRIMARY KEY'
          AND 1 = (
              SELECT COUNT(*) FROM information_schema.key_column_usage kcu
              WHERE kcu.constraint_schema = tc.constraint_schema
                AND kcu.constraint_name = tc.constraint_name
          )
    ) THEN
        ALTER TABLE system_fields DROP CONSTRAINT system_fields_pkey;
        RAISE NOTICE 'PK antiga system_fields_pkey (só key) dropada';
    ELSE
        RAISE NOTICE 'PK já é composta ou não existe no formato antigo';
    END IF;

    -- 3. Adicionar PK composta (se ainda não for)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints tc
        WHERE tc.constraint_schema = 'public'
          AND tc.table_name = 'system_fields'
          AND tc.constraint_type = 'PRIMARY KEY'
    ) THEN
        -- Drop unique index se existir (vai virar PK)
        DROP INDEX IF EXISTS idx_system_fields_org_key;
        ALTER TABLE system_fields ADD CONSTRAINT system_fields_pkey PRIMARY KEY (org_id, key);
        RAISE NOTICE 'PK composta (org_id, key) criada';
    END IF;

    -- 4. Re-adicionar FK composite, se a coluna org_id existir em section_field_config
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'section_field_config' AND column_name = 'org_id'
    ) THEN
        -- Só adicionar se todas as linhas têm match em system_fields
        IF NOT EXISTS (
            SELECT 1 FROM section_field_config sfc
            WHERE NOT EXISTS (
                SELECT 1 FROM system_fields sf
                WHERE sf.key = sfc.field_key AND sf.org_id = sfc.org_id
            )
        ) THEN
            ALTER TABLE section_field_config
                ADD CONSTRAINT section_field_config_field_key_fkey
                FOREIGN KEY (field_key, org_id) REFERENCES system_fields(key, org_id)
                ON UPDATE CASCADE ON DELETE CASCADE;
            RAISE NOTICE 'FK section_field_config_field_key_fkey recriada como composite';
        ELSE
            RAISE NOTICE 'FK composite pulada — há section_field_config sem match em system_fields; investigar antes de re-adicionar';
        END IF;
    END IF;

    -- 5. Backfill workspaces filhos da Welcome Group
    FOR v_target IN
        SELECT o.id AS workspace_id, o.name AS workspace_name, p.slug AS product_slug
        FROM organizations o
        LEFT JOIN products p ON p.org_id = o.id AND p.active = true
        WHERE o.parent_org_id = v_source_account
          AND o.active = true
        ORDER BY o.name
    LOOP
        v_product_slug := v_target.product_slug;

        IF v_product_slug IS NULL THEN
            RAISE NOTICE 'Pulando % (sem produto ativo)', v_target.workspace_name;
            CONTINUE;
        END IF;

        -- Guard: só copiar se o workspace ainda não tem fields próprios
        IF EXISTS (SELECT 1 FROM system_fields WHERE org_id = v_target.workspace_id) THEN
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
            NULL,
            sf.order_index,
            sf.produto_exclusivo,
            v_target.workspace_id
        FROM system_fields sf
        WHERE sf.org_id = v_source_account
          AND (sf.produto_exclusivo IS NULL OR sf.produto_exclusivo = v_product_slug)
        ON CONFLICT (org_id, key) DO NOTHING;

        GET DIAGNOSTICS v_fields_copied = ROW_COUNT;
        RAISE NOTICE 'Workspace % (%): % system_fields copiados', v_target.workspace_name, v_product_slug, v_fields_copied;
    END LOOP;
END
$$;

COMMIT;
