-- ============================================================================
-- CORREÇÃO V3: Logging Específico para Observações e Informações Importantes
-- ============================================================================

create or replace function log_card_update_activity()
returns trigger as $$
declare
    v_old_stage_name text;
    v_new_stage_name text;
    v_old_obs text;
    v_new_obs text;
    v_old_criticas jsonb;
    v_new_criticas jsonb;
begin
    -- 1. Mudança de Etapa (Movimentação)
    if OLD.pipeline_stage_id is distinct from NEW.pipeline_stage_id then
        begin
            select nome into v_old_stage_name from pipeline_stages where id = OLD.pipeline_stage_id;
            select nome into v_new_stage_name from pipeline_stages where id = NEW.pipeline_stage_id;
            
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
        exception when others then
            raise warning 'Erro ao logar mudança de etapa: %', SQLERRM;
        end;
    end if;

    -- 2. Mudança de Dono
    if OLD.dono_atual_id is distinct from NEW.dono_atual_id then
        begin
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
        exception when others then
            raise warning 'Erro ao logar mudança de dono: %', SQLERRM;
        end;
    end if;

    -- 3. Mudança de Status
    if OLD.status_comercial is distinct from NEW.status_comercial then
        begin
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
        exception when others then
            raise warning 'Erro ao logar mudança de status: %', SQLERRM;
        end;
    end if;

    -- 4. Mudança de Valor
    if OLD.valor_final is distinct from NEW.valor_final then
        begin
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
        exception when others then
            raise warning 'Erro ao logar mudança de valor: %', SQLERRM;
        end;
    end if;

    -- 5. Mudança de Observações (dentro de produto_data)
    v_old_obs := (OLD.produto_data->>'observacoes');
    v_new_obs := (NEW.produto_data->>'observacoes');
    
    if v_old_obs is distinct from v_new_obs then
        begin
            insert into activities (card_id, tipo, descricao, metadata, created_by)
            values (
                NEW.id,
                'note_updated',
                'Observações atualizadas',
                jsonb_build_object(
                    'old_obs', left(v_old_obs, 100),
                    'new_obs', left(v_new_obs, 100)
                ),
                auth.uid()
            );
        exception when others then
            raise warning 'Erro ao logar mudança de observações: %', SQLERRM;
        end;
    end if;

    -- 6. Mudança de Informações Importantes (dentro de produto_data)
    v_old_criticas := (OLD.produto_data->'observacoes_criticas');
    v_new_criticas := (NEW.produto_data->'observacoes_criticas');
    
    if v_old_criticas is distinct from v_new_criticas then
        begin
            insert into activities (card_id, tipo, descricao, metadata, created_by)
            values (
                NEW.id,
                'note_updated',
                'Informações Importantes atualizadas',
                jsonb_build_object(
                    'changes', 'Informações críticas alteradas'
                ),
                auth.uid()
            );
        exception when others then
            raise warning 'Erro ao logar mudança de informações importantes: %', SQLERRM;
        end;
    end if;

    return NEW;
end;
$$ language plpgsql security definer;

-- Verificação
select 'Função log_card_update_activity atualizada com sucesso (V3).' as resultado;
