-- ============================================================================
-- CORREÇÃO: Logging de Atualizações de Cards (Movimentação, Dono, Status, Valor)
-- ============================================================================

create or replace function log_card_update_activity()
returns trigger as $$
declare
    v_old_stage_name text;
    v_new_stage_name text;
    v_old_owner_name text;
    v_new_owner_name text;
begin
    -- 1. Mudança de Etapa (Movimentação)
    if OLD.pipeline_stage_id is distinct from NEW.pipeline_stage_id then
        -- Buscar nomes das etapas
        select name into v_old_stage_name from pipeline_stages where id = OLD.pipeline_stage_id;
        select name into v_new_stage_name from pipeline_stages where id = NEW.pipeline_stage_id;
        
        insert into activities (card_id, tipo, descricao, metadata, created_by)
        values (
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
    end if;

    -- 2. Mudança de Dono
    if OLD.dono_atual_id is distinct from NEW.dono_atual_id then
        -- Buscar nomes dos usuários (opcional, mas bom para log)
        -- Nota: O frontend geralmente resolve os nomes, mas logar aqui ajuda na auditoria crua
        
        insert into activities (card_id, tipo, descricao, metadata, created_by)
        values (
            NEW.id,
            'owner_changed',
            'Responsável alterado',
            jsonb_build_object(
                'old_owner_id', OLD.dono_atual_id,
                'new_owner_id', NEW.dono_atual_id
            ),
            auth.uid()
        );
    end if;

    -- 3. Mudança de Status (Ganho/Perdido/Aberto)
    if OLD.status_comercial is distinct from NEW.status_comercial then
        insert into activities (card_id, tipo, descricao, metadata, created_by)
        values (
            NEW.id,
            'status_changed',
            'Status alterado para ' || NEW.status_comercial,
            jsonb_build_object(
                'old_status', OLD.status_comercial,
                'new_status', NEW.status_comercial
            ),
            auth.uid()
        );
    end if;

    -- 4. Mudança de Valor
    if OLD.valor_final is distinct from NEW.valor_final then
        insert into activities (card_id, tipo, descricao, metadata, created_by)
        values (
            NEW.id,
            'value_changed',
            'Valor alterado',
            jsonb_build_object(
                'old_value', OLD.valor_final,
                'new_value', NEW.valor_final
            ),
            auth.uid()
        );
    end if;

    return NEW;
end;
$$ language plpgsql security definer;

-- Recriar o trigger para garantir que está aplicado
drop trigger if exists card_update_activity_trigger on cards;
create trigger card_update_activity_trigger
after update on cards
for each row execute function log_card_update_activity();

-- Verificação
select 'Trigger de atualização de cards criado com sucesso.' as resultado;
