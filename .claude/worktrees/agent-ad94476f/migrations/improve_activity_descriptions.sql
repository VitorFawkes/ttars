-- ============================================================================
-- CORREÇÃO: Melhorar Detalhes nas Atividades
-- ============================================================================
-- Atualiza triggers para mostrar valores antigos/novos de forma clara
-- ============================================================================

-- Atualizar log_card_changes para ter descrições mais detalhadas
create or replace function log_card_changes()
returns trigger as $$
declare
    old_produto_data jsonb;
    new_produto_data jsonb;
    old_destinos text;
    new_destinos text;
    old_orcamento numeric;
    new_orcamento numeric;
    old_periodo_inicio text;
    new_periodo_inicio text;
    old_periodo_fim text;
    new_periodo_fim text;
begin
    -- Convert produto_data to jsonb for comparison
    old_produto_data := coalesce(OLD.produto_data::jsonb, '{}'::jsonb);
    new_produto_data := coalesce(NEW.produto_data::jsonb, '{}'::jsonb);
    
    -- ========== CAMPOS EXISTENTES ==========
    
    -- Status change
    if OLD.status_comercial is distinct from NEW.status_comercial then
        insert into activities (card_id, tipo, descricao, metadata, created_by)
        values (NEW.id, 'status_changed', 
            'Status alterado: ' || coalesce(OLD.status_comercial, 'vazio') || ' → ' || coalesce(NEW.status_comercial, 'vazio'),
            jsonb_build_object('old_status', OLD.status_comercial, 'new_status', NEW.status_comercial),
            coalesce(NEW.updated_by, auth.uid()));
    end if;
    
    -- Stage change
    if OLD.pipeline_stage_id is distinct from NEW.pipeline_stage_id then
        insert into activities (card_id, tipo, descricao, metadata, created_by)
        values (NEW.id, 'stage_changed', 'Etapa alterada',
            jsonb_build_object('old_stage', OLD.pipeline_stage_id, 'new_stage', NEW.pipeline_stage_id),
            coalesce(NEW.updated_by, auth.uid()));
    end if;

    -- Owner change - dono_atual_id
    if OLD.dono_atual_id is distinct from NEW.dono_atual_id then
        insert into activities (card_id, tipo, descricao, metadata, created_by)
        values (NEW.id, 'owner_changed', 'Responsável alterado',
            jsonb_build_object('old_owner', OLD.dono_atual_id, 'new_owner', NEW.dono_atual_id),
            coalesce(NEW.updated_by, auth.uid()));
    end if;

    -- ========== VALORES ==========

    -- Valor estimado
    if OLD.valor_estimado is distinct from NEW.valor_estimado then
        insert into activities (card_id, tipo, descricao, metadata, created_by)
        values (NEW.id, 'value_changed', 
            'Valor estimado: R$ ' || coalesce(OLD.valor_estimado::text, '0') || ' → R$ ' || coalesce(NEW.valor_estimado::text, '0'),
            jsonb_build_object('old_value', OLD.valor_estimado, 'new_value', NEW.valor_estimado, 'field', 'valor_estimado'),
            coalesce(NEW.updated_by, auth.uid()));
    end if;

    -- Valor final
    if OLD.valor_final is distinct from NEW.valor_final then
        insert into activities (card_id, tipo, descricao, metadata, created_by)
        values (NEW.id, 'value_changed', 
            'Valor final: R$ ' || coalesce(OLD.valor_final::text, '0') || ' → R$ ' || coalesce(NEW.valor_final::text, '0'),
            jsonb_build_object('old_value', OLD.valor_final, 'new_value', NEW.valor_final, 'field', 'valor_final'),
            coalesce(NEW.updated_by, auth.uid()));
    end if;

    -- Título
    if OLD.titulo is distinct from NEW.titulo then
        insert into activities (card_id, tipo, descricao, metadata, created_by)
        values (NEW.id, 'updated', 
            'Título: "' || coalesce(OLD.titulo, '') || '" → "' || coalesce(NEW.titulo, '') || '"',
            jsonb_build_object('old_titulo', OLD.titulo, 'new_titulo', NEW.titulo),
            coalesce(NEW.updated_by, auth.uid()));
    end if;

    -- SDR Owner
    if OLD.sdr_owner_id is distinct from NEW.sdr_owner_id then
        insert into activities (card_id, tipo, descricao, metadata, created_by)
        values (NEW.id, 'owner_changed', 'SDR responsável alterado',
            jsonb_build_object('role', 'sdr', 'old_owner', OLD.sdr_owner_id, 'new_owner', NEW.sdr_owner_id),
            coalesce(NEW.updated_by, auth.uid()));
    end if;

    -- Vendas Owner
    if OLD.vendas_owner_id is distinct from NEW.vendas_owner_id then
        insert into activities (card_id, tipo, descricao, metadata, created_by)
        values (NEW.id, 'owner_changed', 'Planner responsável alterado',
            jsonb_build_object('role', 'vendas', 'old_owner', OLD.vendas_owner_id, 'new_owner', NEW.vendas_owner_id),
            coalesce(NEW.updated_by, auth.uid()));
    end if;

    -- Concierge Owner  
    if OLD.concierge_owner_id is distinct from NEW.concierge_owner_id then
        insert into activities (card_id, tipo, descricao, metadata, created_by)
        values (NEW.id, 'owner_changed', 'Concierge responsável alterado',
            jsonb_build_object('role', 'concierge', 'old_owner', OLD.concierge_owner_id, 'new_owner', NEW.concierge_owner_id),
            coalesce(NEW.updated_by, auth.uid()));
    end if;

    -- Pós-venda Owner
    if OLD.pos_owner_id is distinct from NEW.pos_owner_id then
        insert into activities (card_id, tipo, descricao, metadata, created_by)
        values (NEW.id, 'owner_changed', 'Responsável pós-venda alterado',
            jsonb_build_object('role', 'pos', 'old_owner', OLD.pos_owner_id, 'new_owner', NEW.pos_owner_id),
            coalesce(NEW.updated_by, auth.uid()));
    end if;

    -- Pessoa principal (viajante principal)
    if OLD.pessoa_principal_id is distinct from NEW.pessoa_principal_id then
        insert into activities (card_id, tipo, descricao, metadata, created_by)
        values (NEW.id, 'traveler_changed', 'Viajante principal alterado',
            jsonb_build_object('old_traveler', OLD.pessoa_principal_id, 'new_traveler', NEW.pessoa_principal_id),
            coalesce(NEW.updated_by, auth.uid()));
    end if;

    -- Data de início da viagem
    if OLD.data_viagem_inicio is distinct from NEW.data_viagem_inicio then
        insert into activities (card_id, tipo, descricao, metadata, created_by)
        values (NEW.id, 'updated', 
            'Data de início: ' || coalesce(to_char(OLD.data_viagem_inicio, 'DD/MM/YYYY'), 'não definida') || ' → ' || coalesce(to_char(NEW.data_viagem_inicio, 'DD/MM/YYYY'), 'não definida'),
            jsonb_build_object('old_date', OLD.data_viagem_inicio, 'new_date', NEW.data_viagem_inicio, 'field', 'data_viagem_inicio'),
            coalesce(NEW.updated_by, auth.uid()));
    end if;

    -- Prioridade
    if OLD.prioridade is distinct from NEW.prioridade then
        insert into activities (card_id, tipo, descricao, metadata, created_by)
        values (NEW.id, 'updated', 
            'Prioridade: ' || coalesce(OLD.prioridade, 'normal') || ' → ' || coalesce(NEW.prioridade, 'normal'),
            jsonb_build_object('old_priority', OLD.prioridade, 'new_priority', NEW.prioridade),
            coalesce(NEW.updated_by, auth.uid()));
    end if;

    -- Moeda
    if OLD.moeda is distinct from NEW.moeda then
        insert into activities (card_id, tipo, descricao, metadata, created_by)
        values (NEW.id, 'updated', 
            'Moeda: ' || coalesce(OLD.moeda, 'BRL') || ' → ' || coalesce(NEW.moeda, 'BRL'),
            jsonb_build_object('old_currency', OLD.moeda, 'new_currency', NEW.moeda),
            coalesce(NEW.updated_by, auth.uid()));
    end if;

    -- ========== PRODUTO_DATA (JSON FIELDS) ==========
    
    -- Destinos (dentro de produto_data) - Com valores
    old_destinos := coalesce(old_produto_data->>'destinos', '');
    new_destinos := coalesce(new_produto_data->>'destinos', '');
    if old_destinos is distinct from new_destinos then
        insert into activities (card_id, tipo, descricao, metadata, created_by)
        values (NEW.id, 'destination_changed', 
            'Destino(s): "' || coalesce(array_to_string(ARRAY(SELECT jsonb_array_elements_text(old_produto_data->'destinos')), ', '), 'vazio') || '" → "' || coalesce(array_to_string(ARRAY(SELECT jsonb_array_elements_text(new_produto_data->'destinos')), ', '), 'vazio') || '"',
            jsonb_build_object('old_destinos', old_produto_data->'destinos', 'new_destinos', new_produto_data->'destinos'),
            coalesce(NEW.updated_by, auth.uid()));
    end if;

    -- Orçamento (dentro de produto_data) - Com valores
    old_orcamento := coalesce((old_produto_data->'orcamento'->>'total')::numeric, 0);
    new_orcamento := coalesce((new_produto_data->'orcamento'->>'total')::numeric, 0);
    if old_orcamento is distinct from new_orcamento then
        insert into activities (card_id, tipo, descricao, metadata, created_by)
        values (NEW.id, 'budget_changed', 
            'Orçamento: R$ ' || old_orcamento::text || ' → R$ ' || new_orcamento::text,
            jsonb_build_object('old_budget', old_produto_data->'orcamento', 'new_budget', new_produto_data->'orcamento'),
            coalesce(NEW.updated_by, auth.uid()));
    end if;

    -- Período/Época da viagem (dentro de produto_data) - COM DETALHES
    old_periodo_inicio := coalesce(old_produto_data->'epoca_viagem'->>'inicio', '');
    new_periodo_inicio := coalesce(new_produto_data->'epoca_viagem'->>'inicio', '');
    old_periodo_fim := coalesce(old_produto_data->'epoca_viagem'->>'fim', '');
    new_periodo_fim := coalesce(new_produto_data->'epoca_viagem'->>'fim', '');
    
    if (old_periodo_inicio is distinct from new_periodo_inicio) or (old_periodo_fim is distinct from new_periodo_fim) then
        insert into activities (card_id, tipo, descricao, metadata, created_by)
        values (NEW.id, 'period_changed', 
            'Período: ' || 
            case when old_periodo_inicio != '' then to_char(old_periodo_inicio::date, 'DD/MM/YYYY') else 'não definido' end ||
            case when old_periodo_fim != '' then ' até ' || to_char(old_periodo_fim::date, 'DD/MM/YYYY') else '' end ||
            ' → ' ||
            case when new_periodo_inicio != '' then to_char(new_periodo_inicio::date, 'DD/MM/YYYY') else 'não definido' end ||
            case when new_periodo_fim != '' then ' até ' || to_char(new_periodo_fim::date, 'DD/MM/YYYY') else '' end,
            jsonb_build_object('old_period', old_produto_data->'epoca_viagem', 'new_period', new_produto_data->'epoca_viagem'),
            coalesce(NEW.updated_by, auth.uid()));
    end if;

    -- Motivo da viagem (dentro de produto_data) - Com valores
    if (old_produto_data->>'motivo') is distinct from (new_produto_data->>'motivo') then
        insert into activities (card_id, tipo, descricao, metadata, created_by)
        values (NEW.id, 'updated', 
            'Motivo da viagem: "' || coalesce(old_produto_data->>'motivo', 'não definido') || '" → "' || coalesce(new_produto_data->>'motivo', 'não definido') || '"',
            jsonb_build_object('old_motivo', old_produto_data->>'motivo', 'new_motivo', new_produto_data->>'motivo', 'field', 'motivo'),
            coalesce(NEW.updated_by, auth.uid()));
    end if;

    -- Origem do lead (dentro de produto_data) - COM DETALHES
    if (old_produto_data->>'origem_lead') is distinct from (new_produto_data->>'origem_lead') then
        insert into activities (card_id, tipo, descricao, metadata, created_by)
        values (NEW.id, 'updated', 
            'Origem do lead: "' || coalesce(old_produto_data->>'origem_lead', 'não definida') || '" → "' || coalesce(new_produto_data->>'origem_lead', 'não definida') || '"',
            jsonb_build_object('old_origem', old_produto_data->>'origem_lead', 'new_origem', new_produto_data->>'origem_lead', 'field', 'origem_lead'),
            coalesce(NEW.updated_by, auth.uid()));
    end if;

    return NEW;
end;
$$ language plpgsql security definer;

-- Verificação
select 'Trigger log_card_changes atualizado com descrições detalhadas!' as resultado;
