-- 1. Drop the redundant trigger on cards_contatos
DROP TRIGGER IF EXISTS log_traveler_activity ON cards_contatos;

-- 2. Update log_card_update_activity to track pessoa_principal_id
CREATE OR REPLACE FUNCTION public.log_card_update_activity()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_old_stage_name text;
    v_new_stage_name text;
    v_old_contact_name text;
    v_new_contact_name text;
    r_diff jsonb_diff_record;
BEGIN
    -- 1. Mudança de Etapa (Movimentação)
    IF OLD.pipeline_stage_id IS DISTINCT FROM NEW.pipeline_stage_id THEN
        BEGIN
            SELECT nome INTO v_old_stage_name FROM pipeline_stages WHERE id = OLD.pipeline_stage_id;
            SELECT nome INTO v_new_stage_name FROM pipeline_stages WHERE id = NEW.pipeline_stage_id;
            
            INSERT INTO activities (card_id, tipo, descricao, metadata, created_by)
            VALUES (
                NEW.id,
                'stage_changed',
                'Card movido de ' || coalesce(v_old_stage_name, 'Etapa anterior') || ' para ' || coalesce(v_new_stage_name, 'Nova etapa'),
                jsonb_build_object(
                    'old_stage_id', OLD.pipeline_stage_id,
                    'new_stage_id', NEW.pipeline_stage_id,
                    'old_stage_name', v_old_stage_name,
                    'new_stage_name', v_new_stage_name
                ),
                auth.uid()
            );
        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'Erro ao logar mudança de etapa: %', SQLERRM;
        END;
    END IF;

    -- 2. Mudança de Dono
    IF OLD.dono_atual_id IS DISTINCT FROM NEW.dono_atual_id THEN
        INSERT INTO activities (card_id, tipo, descricao, metadata, created_by)
        VALUES (
            NEW.id,
            'owner_changed',
            'Dono alterado',
            jsonb_build_object(
                'old_owner_id', OLD.dono_atual_id,
                'new_owner_id', NEW.dono_atual_id
            ),
            auth.uid()
        );
    END IF;

    -- 3. Mudança de SDR
    IF OLD.sdr_owner_id IS DISTINCT FROM NEW.sdr_owner_id THEN
        INSERT INTO activities (card_id, tipo, descricao, metadata, created_by)
        VALUES (
            NEW.id,
            'owner_changed',
            'SDR alterado',
            jsonb_build_object(
                'old_sdr_id', OLD.sdr_owner_id,
                'new_sdr_id', NEW.sdr_owner_id
            ),
            auth.uid()
        );
    END IF;

    -- 4. Mudança de Contato Principal (NEW)
    IF OLD.pessoa_principal_id IS DISTINCT FROM NEW.pessoa_principal_id THEN
        SELECT nome INTO v_old_contact_name FROM contatos WHERE id = OLD.pessoa_principal_id;
        SELECT nome INTO v_new_contact_name FROM contatos WHERE id = NEW.pessoa_principal_id;

        INSERT INTO activities (card_id, tipo, descricao, metadata, created_by)
        VALUES (
            NEW.id,
            'updated',
            'Contato Principal alterado para: ' || coalesce(v_new_contact_name, 'Desconhecido'),
            jsonb_build_object(
                'field', 'pessoa_principal_id',
                'old_value', v_old_contact_name,
                'new_value', v_new_contact_name,
                'old_id', OLD.pessoa_principal_id,
                'new_id', NEW.pessoa_principal_id
            ),
            auth.uid()
        );
    END IF;

    -- 5. Mudança de Título
    IF OLD.titulo IS DISTINCT FROM NEW.titulo THEN
        INSERT INTO activities (card_id, tipo, descricao, metadata, created_by)
        VALUES (
            NEW.id,
            'updated',
            'Título alterado para: ' || NEW.titulo,
            jsonb_build_object(
                'old_title', OLD.titulo,
                'new_title', NEW.titulo
            ),
            auth.uid()
        );
    END IF;

    -- 6. Mudança de Período de Viagem (Data Início)
    IF OLD.data_viagem_inicio IS DISTINCT FROM NEW.data_viagem_inicio THEN
        INSERT INTO activities (card_id, tipo, descricao, metadata, created_by)
        VALUES (
            NEW.id,
            'period_changed',
            'Data de viagem alterada',
            jsonb_build_object(
                'old_date', OLD.data_viagem_inicio,
                'new_date', NEW.data_viagem_inicio
            ),
            auth.uid()
        );
    END IF;

    -- 7. RECURSIVE DYNAMIC JSONB DIFF for produto_data
    IF OLD.produto_data IS DISTINCT FROM NEW.produto_data THEN
        FOR r_diff IN SELECT * FROM find_jsonb_diffs('', OLD.produto_data, NEW.produto_data)
        LOOP
            -- Insert log for each leaf change
            INSERT INTO activities (card_id, tipo, descricao, metadata, created_by)
            VALUES (
                NEW.id,
                'updated',
                'Alterou ' || r_diff.path || ' de ' || r_diff.old_value || ' para ' || r_diff.new_value,
                jsonb_build_object(
                    'field', r_diff.path,
                    'old_value', r_diff.old_value,
                    'new_value', r_diff.new_value
                ),
                auth.uid()
            );
        END LOOP;
    END IF;

    RETURN NEW;
END;
$function$;
