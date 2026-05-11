-- ============================================================================
-- CORREÇÃO V3: Logging de Atualizações de Cards (JSONB Deep Watch)
-- ============================================================================

create or replace function log_card_update_activity()
returns trigger as $$
declare
    v_old_stage_name text;
    v_new_stage_name text;
    v_old_owner_name text;
    v_new_owner_name text;
    
    -- JSON Helpers
    v_old_data jsonb;
    v_new_data jsonb;
    v_old_briefing jsonb;
    v_new_briefing jsonb;
    
    -- Temp vars for comparisons
    v_old_val text;
    v_new_val text;
    v_old_json jsonb;
    v_new_json jsonb;
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

    -- 3. Mudança de Status (Ganho/Perdido/Aberto)
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

    -- 4. Mudança de Valor (Coluna Fixa)
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

    -- 5. Mudanças em Campos Dinâmicos (produto_data)
    v_old_data := coalesce(OLD.produto_data, '{}'::jsonb);
    v_new_data := coalesce(NEW.produto_data, '{}'::jsonb);

    if v_old_data is distinct from v_new_data then
        -- 5.1 Época da Viagem (Date Range)
        if (v_old_data->>'epoca_viagem') is distinct from (v_new_data->>'epoca_viagem') then
            -- Tentar extrair datas para texto legível
            declare
                v_old_start text := coalesce(v_old_data->'epoca_viagem'->>'start', v_old_data->'epoca_viagem'->>'inicio', 'N/A');
                v_old_end text := coalesce(v_old_data->'epoca_viagem'->>'end', v_old_data->'epoca_viagem'->>'fim', 'N/A');
                v_new_start text := coalesce(v_new_data->'epoca_viagem'->>'start', v_new_data->'epoca_viagem'->>'inicio', 'N/A');
                v_new_end text := coalesce(v_new_data->'epoca_viagem'->>'end', v_new_data->'epoca_viagem'->>'fim', 'N/A');
                v_desc text;
            begin
                v_desc := 'Época da viagem alterada de ' || v_old_start || ' até ' || v_old_end || ' para ' || v_new_start || ' até ' || v_new_end;
                
                insert into activities (card_id, tipo, descricao, metadata, created_by)
                values (
                    NEW.id,
                    'period_changed',
                    v_desc,
                    jsonb_build_object(
                        'old_period', v_old_data->'epoca_viagem',
                        'new_period', v_new_data->'epoca_viagem'
                    ),
                    auth.uid()
                );
            end;
        end if;

        -- 5.2 Orçamento (Budget)
        if (v_old_data->>'orcamento') is distinct from (v_new_data->>'orcamento') then
            declare
                v_old_total text := coalesce(v_old_data->'orcamento'->>'total', '0');
                v_new_total text := coalesce(v_new_data->'orcamento'->>'total', '0');
            begin
                insert into activities (card_id, tipo, descricao, metadata, created_by)
                values (
                    NEW.id,
                    'budget_changed',
                    'Orçamento alterado de R$ ' || v_old_total || ' para R$ ' || v_new_total,
                    jsonb_build_object(
                        'old_budget', v_old_data->'orcamento',
                        'new_budget', v_new_data->'orcamento'
                    ),
                    auth.uid()
                );
            end;
        end if;

        -- 5.3 Destinos
        if (v_old_data->>'destinos') is distinct from (v_new_data->>'destinos') then
            declare
                v_old_dest text := coalesce((select string_agg(value::text, ', ') from jsonb_array_elements_text(v_old_data->'destinos')), 'Nenhum');
                v_new_dest text := coalesce((select string_agg(value::text, ', ') from jsonb_array_elements_text(v_new_data->'destinos')), 'Nenhum');
            begin
                insert into activities (card_id, tipo, descricao, metadata, created_by)
                values (
                    NEW.id,
                    'destination_changed',
                    'Destinos alterados de [' || v_old_dest || '] para [' || v_new_dest || ']',
                    jsonb_build_object(
                        'old_destinations', v_old_data->'destinos',
                        'new_destinations', v_new_data->'destinos'
                    ),
                    auth.uid()
                );
            end;
        end if;

        -- 5.4 Pessoas (Travelers Count)
        if (v_old_data->>'pessoas') is distinct from (v_new_data->>'pessoas') then
             declare
                v_old_adultos text := coalesce(v_old_data->'pessoas'->>'adultos', '0');
                v_new_adultos text := coalesce(v_new_data->'pessoas'->>'adultos', '0');
             begin
                 insert into activities (card_id, tipo, descricao, metadata, created_by)
                values (
                    NEW.id,
                    'traveler_changed',
                    'Viajantes alterados de ' || v_old_adultos || ' adultos para ' || v_new_adultos || ' adultos',
                    jsonb_build_object(
                        'old_people', v_old_data->'pessoas',
                        'new_people', v_new_data->'pessoas'
                    ),
                    auth.uid()
                );
             end;
        end if;

        -- 5.5 Informações Importantes (observacoes_criticas)
        if (v_old_data->>'observacoes_criticas') is distinct from (v_new_data->>'observacoes_criticas') then
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
        end if;
    end if;

    -- 6. Mudanças em Briefing Inicial (SDR Data)
    v_old_briefing := coalesce(OLD.briefing_inicial, '{}'::jsonb);
    v_new_briefing := coalesce(NEW.briefing_inicial, '{}'::jsonb);

    if v_old_briefing is distinct from v_new_briefing then
         -- Check for same fields in briefing (SDR updates)
         if (v_old_briefing->>'epoca_viagem') is distinct from (v_new_briefing->>'epoca_viagem') then
            declare
                v_old_start text := coalesce(v_old_briefing->'epoca_viagem'->>'start', v_old_briefing->'epoca_viagem'->>'inicio', 'N/A');
                v_new_start text := coalesce(v_new_briefing->'epoca_viagem'->>'start', v_new_briefing->'epoca_viagem'->>'inicio', 'N/A');
            begin
                insert into activities (card_id, tipo, descricao, metadata, created_by)
                values (
                    NEW.id,
                    'period_changed',
                    'Época da viagem (SDR) alterada de ' || v_old_start || ' para ' || v_new_start,
                    jsonb_build_object(
                        'old_period', v_old_briefing->'epoca_viagem',
                        'new_period', v_new_briefing->'epoca_viagem'
                    ),
                    auth.uid()
                );
            end;
        end if;
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
select 'Função log_card_update_activity atualizada com sucesso (V3 - JSON Deep Watch).' as resultado;
