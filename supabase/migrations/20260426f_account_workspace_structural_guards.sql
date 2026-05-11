-- ============================================================================
-- Triggers FK cross-org: blindar pipeline_stages, stage_field_config,
-- stage_section_config, stage_field_confirmations contra org_id inconsistente
-- com o registro-pai.
--
-- Motivação: RLS impede um usuário em org A de ler/escrever em org B, mas NÃO
-- impede que uma linha aponte para outra linha em org diferente (ex:
-- pipeline_stages.pipeline_id aponta pra pipeline em outra org). Isso pode
-- gerar 406 na UI quando o usuário tenta carregar o recurso referenciado.
--
-- Modelo canônico do projeto:
-- `cadence_steps → cadence_templates` em 20260414_h3_029_cadence_steps_strict_template_org.sql
-- `cadence_event_triggers → cadence_templates` em 20260414l_cadence_event_triggers_strict_template_org.sql
--
-- Idempotência: cada trigger só é criado se as colunas envolvidas existem no
-- ambiente atual (staging defasado não recebe a coluna org_id em algumas
-- tabelas — nesses casos a migration é no-op até a próxima promoção).
-- ============================================================================

BEGIN;

-- =============================================================================
-- 1. pipeline_stages.org_id = pipelines.org_id
-- =============================================================================

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'pipelines' AND column_name = 'org_id'
    ) AND EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'pipeline_stages' AND column_name = 'org_id'
    ) THEN
        EXECUTE $func$
            CREATE OR REPLACE FUNCTION enforce_pipeline_stage_org_consistency()
            RETURNS TRIGGER
            LANGUAGE plpgsql
            SECURITY DEFINER
            SET search_path = public
            AS $body$
            DECLARE
                v_parent_org UUID;
            BEGIN
                IF NEW.pipeline_id IS NULL THEN
                    RETURN NEW;
                END IF;

                SELECT org_id INTO v_parent_org
                FROM pipelines
                WHERE id = NEW.pipeline_id;

                IF v_parent_org IS NULL THEN
                    RAISE EXCEPTION 'pipeline_stages: pipeline_id % não encontrado', NEW.pipeline_id
                        USING ERRCODE = 'foreign_key_violation';
                END IF;

                IF NEW.org_id IS NULL THEN
                    NEW.org_id := v_parent_org;
                ELSIF NEW.org_id <> v_parent_org THEN
                    RAISE EXCEPTION 'pipeline_stages: org_id (%) difere do pipeline pai (%)',
                        NEW.org_id, v_parent_org
                        USING ERRCODE = 'check_violation';
                END IF;

                RETURN NEW;
            END;
            $body$;
        $func$;

        EXECUTE 'DROP TRIGGER IF EXISTS trg_pipeline_stage_org_consistency ON pipeline_stages';
        EXECUTE 'CREATE TRIGGER trg_pipeline_stage_org_consistency
                 BEFORE INSERT OR UPDATE OF pipeline_id, org_id ON pipeline_stages
                 FOR EACH ROW
                 EXECUTE FUNCTION enforce_pipeline_stage_org_consistency()';
        RAISE NOTICE 'Trigger trg_pipeline_stage_org_consistency criado';
    ELSE
        RAISE NOTICE 'Pulando pipeline_stages guard — colunas org_id ausentes (staging defasado)';
    END IF;
END
$$;

-- =============================================================================
-- 2. stage_field_config.org_id = pipeline_stages.org_id
-- =============================================================================

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'pipeline_stages' AND column_name = 'org_id'
    ) AND EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'stage_field_config' AND column_name = 'org_id'
    ) THEN
        EXECUTE $func$
            CREATE OR REPLACE FUNCTION enforce_stage_field_config_org_consistency()
            RETURNS TRIGGER
            LANGUAGE plpgsql
            SECURITY DEFINER
            SET search_path = public
            AS $body$
            DECLARE
                v_parent_org UUID;
            BEGIN
                IF NEW.stage_id IS NULL THEN
                    RETURN NEW;
                END IF;

                SELECT org_id INTO v_parent_org
                FROM pipeline_stages
                WHERE id = NEW.stage_id;

                IF v_parent_org IS NULL THEN
                    RAISE EXCEPTION 'stage_field_config: stage_id % não encontrado', NEW.stage_id
                        USING ERRCODE = 'foreign_key_violation';
                END IF;

                IF NEW.org_id IS NULL THEN
                    NEW.org_id := v_parent_org;
                ELSIF NEW.org_id <> v_parent_org THEN
                    RAISE EXCEPTION 'stage_field_config: org_id (%) difere do stage pai (%)',
                        NEW.org_id, v_parent_org
                        USING ERRCODE = 'check_violation';
                END IF;

                RETURN NEW;
            END;
            $body$;
        $func$;

        EXECUTE 'DROP TRIGGER IF EXISTS trg_stage_field_config_org_consistency ON stage_field_config';
        EXECUTE 'CREATE TRIGGER trg_stage_field_config_org_consistency
                 BEFORE INSERT OR UPDATE OF stage_id, org_id ON stage_field_config
                 FOR EACH ROW
                 EXECUTE FUNCTION enforce_stage_field_config_org_consistency()';
        RAISE NOTICE 'Trigger trg_stage_field_config_org_consistency criado';
    ELSE
        RAISE NOTICE 'Pulando stage_field_config guard — colunas org_id ausentes';
    END IF;
END
$$;

-- =============================================================================
-- 3. stage_section_config.org_id = pipeline_stages.org_id
-- =============================================================================

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'pipeline_stages' AND column_name = 'org_id'
    ) AND EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'stage_section_config' AND column_name = 'org_id'
    ) THEN
        EXECUTE $func$
            CREATE OR REPLACE FUNCTION enforce_stage_section_config_org_consistency()
            RETURNS TRIGGER
            LANGUAGE plpgsql
            SECURITY DEFINER
            SET search_path = public
            AS $body$
            DECLARE
                v_parent_org UUID;
            BEGIN
                IF NEW.stage_id IS NULL THEN
                    RETURN NEW;
                END IF;

                SELECT org_id INTO v_parent_org
                FROM pipeline_stages
                WHERE id = NEW.stage_id;

                IF v_parent_org IS NULL THEN
                    RAISE EXCEPTION 'stage_section_config: stage_id % não encontrado', NEW.stage_id
                        USING ERRCODE = 'foreign_key_violation';
                END IF;

                IF NEW.org_id IS NULL THEN
                    NEW.org_id := v_parent_org;
                ELSIF NEW.org_id <> v_parent_org THEN
                    RAISE EXCEPTION 'stage_section_config: org_id (%) difere do stage pai (%)',
                        NEW.org_id, v_parent_org
                        USING ERRCODE = 'check_violation';
                END IF;

                RETURN NEW;
            END;
            $body$;
        $func$;

        EXECUTE 'DROP TRIGGER IF EXISTS trg_stage_section_config_org_consistency ON stage_section_config';
        EXECUTE 'CREATE TRIGGER trg_stage_section_config_org_consistency
                 BEFORE INSERT OR UPDATE OF stage_id, org_id ON stage_section_config
                 FOR EACH ROW
                 EXECUTE FUNCTION enforce_stage_section_config_org_consistency()';
        RAISE NOTICE 'Trigger trg_stage_section_config_org_consistency criado';
    ELSE
        RAISE NOTICE 'Pulando stage_section_config guard — colunas org_id ausentes';
    END IF;
END
$$;

-- =============================================================================
-- 4. stage_field_confirmations.org_id = pipeline_stages.org_id
-- =============================================================================

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'pipeline_stages' AND column_name = 'org_id'
    ) AND EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'stage_field_confirmations' AND column_name = 'org_id'
    ) THEN
        EXECUTE $func$
            CREATE OR REPLACE FUNCTION enforce_stage_field_confirmation_org_consistency()
            RETURNS TRIGGER
            LANGUAGE plpgsql
            SECURITY DEFINER
            SET search_path = public
            AS $body$
            DECLARE
                v_parent_org UUID;
            BEGIN
                IF NEW.stage_id IS NULL THEN
                    RETURN NEW;
                END IF;

                SELECT org_id INTO v_parent_org
                FROM pipeline_stages
                WHERE id = NEW.stage_id;

                IF v_parent_org IS NULL THEN
                    RAISE EXCEPTION 'stage_field_confirmations: stage_id % não encontrado', NEW.stage_id
                        USING ERRCODE = 'foreign_key_violation';
                END IF;

                IF NEW.org_id IS NULL THEN
                    NEW.org_id := v_parent_org;
                ELSIF NEW.org_id <> v_parent_org THEN
                    RAISE EXCEPTION 'stage_field_confirmations: org_id (%) difere do stage pai (%)',
                        NEW.org_id, v_parent_org
                        USING ERRCODE = 'check_violation';
                END IF;

                RETURN NEW;
            END;
            $body$;
        $func$;

        EXECUTE 'DROP TRIGGER IF EXISTS trg_stage_field_confirmation_org_consistency ON stage_field_confirmations';
        EXECUTE 'CREATE TRIGGER trg_stage_field_confirmation_org_consistency
                 BEFORE INSERT OR UPDATE OF stage_id, org_id ON stage_field_confirmations
                 FOR EACH ROW
                 EXECUTE FUNCTION enforce_stage_field_confirmation_org_consistency()';
        RAISE NOTICE 'Trigger trg_stage_field_confirmation_org_consistency criado';
    ELSE
        RAISE NOTICE 'Pulando stage_field_confirmation guard — colunas org_id ausentes';
    END IF;
END
$$;

COMMIT;
