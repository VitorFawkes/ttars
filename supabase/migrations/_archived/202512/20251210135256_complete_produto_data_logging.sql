-- ============================================================================
-- MIGRAÇÃO COMPLETA: Logging de TODAS as Mudanças em produto_data
-- ============================================================================
-- Esta migração atualiza o trigger para rastrear QUALQUER mudança em produto_data
-- incluindo observações, informações estruturadas, taxa de planejamento, etc.
-- ============================================================================

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
    old_obs_estruturadas jsonb;
    new_obs_estruturadas jsonb;
    old_taxa jsonb;
    new_taxa jsonb;
begin
    -- Convert produto_data to jsonb for comparison
    old_produto_data := coalesce(OLD.produto_data::jsonb, '{}'::jsonb);
    new_produto_data := coalesce(NEW.produto_data::jsonb, '{}'::jsonb);
    
    -- ========== CAMPOS DIRETOS DA TABELA CARDS ==========
    
    -- Status change
    if OLD.status_comercial is distinct from NEW.status_comercial then
        insert into activities (card_id, tipo, descricao, metadata, created_by)
        values (NEW.id, 'status_changed', 
            'Status: "' || coalesce(OLD.status_comercial, 'vazio') || '" → "' || coalesce(NEW.status_comercial, 'vazio') || '"',
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

    -- Owner changes
    if OLD.dono_atual_id is distinct from NEW.dono_atual_id then
        insert into activities (card_id, tipo, descricao, metadata, created_by)
        values (NEW.id, 'owner_changed', 'Responsável alterado',
            jsonb_build_object('old_owner', OLD.dono_atual_id, 'new_owner', NEW.dono_atual_id),
            coalesce(NEW.updated_by, auth.uid()));
    end if;

    if OLD.sdr_owner_id is distinct from NEW.sdr_owner_id then
        insert into activities (card_id, tipo, descricao, metadata, created_by)
        values (NEW.id, 'owner_changed', 'SDR responsável alterado',
            jsonb_build_object('role', 'sdr', 'old_owner', OLD.sdr_owner_id, 'new_owner', NEW.sdr_owner_id),
            coalesce(NEW.updated_by, auth.uid()));
    end if;

    if OLD.vendas_owner_id is distinct from NEW.vendas_owner_id then
        insert into activities (card_id, tipo, descricao, metadata, created_by)
        values (NEW.id, 'owner_changed', 'Planner responsável alterado',
            jsonb_build_object('role', 'vendas', 'old_owner', OLD.vendas_owner_id, 'new_owner', NEW.vendas_owner_id),
            coalesce(NEW.updated_by, auth.uid()));
    end if;

    if OLD.concierge_owner_id is distinct from NEW.concierge_owner_id then
        insert into activities (card_id, tipo, descricao, metadata, created_by)
        values (NEW.id, 'owner_changed', 'Concierge responsável alterado',
            jsonb_build_object('role', 'concierge', 'old_owner', OLD.concierge_owner_id, 'new_owner', NEW.concierge_owner_id),
            coalesce(NEW.updated_by, auth.uid()));
    end if;

    if OLD.pos_owner_id is distinct from NEW.pos_owner_id then
        insert into activities (card_id, tipo, descricao, metadata, created_by)
        values (NEW.id, 'owner_changed', 'Responsável pós-venda alterado',
            jsonb_build_object('role', 'pos', 'old_owner', OLD.pos_owner_id, 'new_owner', NEW.pos_owner_id),
            coalesce(NEW.updated_by, auth.uid()));
    end if;

    -- Valores
    if OLD.valor_estimado is distinct from NEW.valor_estimado then
        insert into activities (card_id, tipo, descricao, metadata, created_by)
        values (NEW.id, 'value_changed', 
            'Valor estimado: R$ ' || coalesce(OLD.valor_estimado::text, '0') || ' → R$ ' || coalesce(NEW.valor_estimado::text, '0'),
            jsonb_build_object('old_value', OLD.valor_estimado, 'new_value', NEW.valor_estimado, 'field', 'valor_estimado'),
            coalesce(NEW.updated_by, auth.uid()));
    end if;

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

    -- Viajante Principal
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
            jsonb_build_object('old_date', OLD.data_viagem_inicio, 'new_date', NEW.data_viagem_inicio),
            coalesce(NEW.updated_by, auth.uid()));
    end if;

    -- Prioridade e Moeda
    if OLD.prioridade is distinct from NEW.prioridade then
        insert into activities (card_id, tipo, descricao, metadata, created_by)
        values (NEW.id, 'updated', 
            'Prioridade: "' || coalesce(OLD.prioridade, 'normal') || '" → "' || coalesce(NEW.prioridade, 'normal') || '"',
            jsonb_build_object('old_priority', OLD.prioridade, 'new_priority', NEW.prioridade),
            coalesce(NEW.updated_by, auth.uid()));
    end if;

    if OLD.moeda is distinct from NEW.moeda then
        insert into activities (card_id, tipo, descricao, metadata, created_by)
        values (NEW.id, 'updated', 
            'Moeda: "' || coalesce(OLD.moeda, 'BRL') || '" → "' || coalesce(NEW.moeda, 'BRL') || '"',
            jsonb_build_object('old_currency', OLD.moeda, 'new_currency', NEW.moeda),
            coalesce(NEW.updated_by, auth.uid()));
    end if;

    -- ========== PRODUTO_DATA: INFORMAÇÕES DA VIAGEM ==========
    
    -- Destinos
    old_destinos := coalesce(old_produto_data->>'destinos', '');
    new_destinos := coalesce(new_produto_data->>'destinos', '');
    if old_destinos is distinct from new_destinos then
        insert into activities (card_id, tipo, descricao, metadata, created_by)
        values (NEW.id, 'destination_changed', 
            'Destino(s): "' || coalesce(array_to_string(ARRAY(SELECT jsonb_array_elements_text(old_produto_data->'destinos')), ', '), 'vazio') || '" → "' || coalesce(array_to_string(ARRAY(SELECT jsonb_array_elements_text(new_produto_data->'destinos')), ', '), 'vazio') || '"',
            jsonb_build_object('old_destinos', old_produto_data->'destinos', 'new_destinos', new_produto_data->'destinos'),
            coalesce(NEW.updated_by, auth.uid()));
    end if;

    -- Orçamento
    old_orcamento := coalesce((old_produto_data->'orcamento'->>'total')::numeric, 0);
    new_orcamento := coalesce((new_produto_data->'orcamento'->>'total')::numeric, 0);
    if old_orcamento is distinct from new_orcamento then
        insert into activities (card_id, tipo, descricao, metadata, created_by)
        values (NEW.id, 'budget_changed', 
            'Orçamento: R$ ' || old_orcamento::text || ' → R$ ' || new_orcamento::text,
            jsonb_build_object('old_budget', old_produto_data->'orcamento', 'new_budget', new_produto_data->'orcamento'),
            coalesce(NEW.updated_by, auth.uid()));
    end if;

    -- Período da Viagem
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

    -- Motivo da Viagem
    if (old_produto_data->>'motivo') is distinct from (new_produto_data->>'motivo') then
        insert into activities (card_id, tipo, descricao, metadata, created_by)
        values (NEW.id, 'updated', 
            'Motivo da viagem: "' || coalesce(old_produto_data->>'motivo', 'não definido') || '" → "' || coalesce(new_produto_data->>'motivo', 'não definido') || '"',
            jsonb_build_object('old_motivo', old_produto_data->>'motivo', 'new_motivo', new_produto_data->>'motivo', 'field', 'motivo'),
            coalesce(NEW.updated_by, auth.uid()));
    end if;

    -- Origem do Lead
    if (old_produto_data->>'origem_lead') is distinct from (new_produto_data->>'origem_lead') then
        insert into activities (card_id, tipo, descricao, metadata, created_by)
        values (NEW.id, 'updated', 
            'Origem do lead: "' || coalesce(old_produto_data->>'origem_lead', 'não definida') || '" → "' || coalesce(new_produto_data->>'origem_lead', 'não definida') || '"',
            jsonb_build_object('old_origem', old_produto_data->>'origem_lead', 'new_origem', new_produto_data->>'origem_lead', 'field', 'origem_lead'),
            coalesce(NEW.updated_by, auth.uid()));
    end if;

    -- ========== PRODUTO_DATA: OBSERVAÇÕES ==========
    
    -- Observações Gerais (Livres)
    if (old_produto_data->>'observacoes') is distinct from (new_produto_data->>'observacoes') then
        insert into activities (card_id, tipo, descricao, metadata, created_by)
        values (NEW.id, 'note_updated', 
            'Observações gerais alteradas',
            jsonb_build_object(
                'field', 'observacoes',
                'old_preview', left(coalesce(old_produto_data->>'observacoes', ''), 100),
                'new_preview', left(coalesce(new_produto_data->>'observacoes', ''), 100)
            ),
            coalesce(NEW.updated_by, auth.uid()));
    end if;

    -- Observações Estruturadas (Alergias, Restrições, Preferências)
    old_obs_estruturadas := coalesce(old_produto_data->'observacoes_estruturadas', '{}'::jsonb);
    new_obs_estruturadas := coalesce(new_produto_data->'observacoes_estruturadas', '{}'::jsonb);
    
    if (old_obs_estruturadas->>'alergias') is distinct from (new_obs_estruturadas->>'alergias') then
        insert into activities (card_id, tipo, descricao, metadata, created_by)
        values (NEW.id, 'updated', 
            'Alergias: "' || coalesce(old_obs_estruturadas->>'alergias', 'não informado') || '" → "' || coalesce(new_obs_estruturadas->>'alergias', 'não informado') || '"',
            jsonb_build_object('field', 'alergias', 'old', old_obs_estruturadas->>'alergias', 'new', new_obs_estruturadas->>'alergias'),
            coalesce(NEW.updated_by, auth.uid()));
    end if;

    if (old_obs_estruturadas->>'restricoes') is distinct from (new_obs_estruturadas->>'restricoes') then
        insert into activities (card_id, tipo, descricao, metadata, created_by)
        values (NEW.id, 'updated', 
            'Restrições: "' || coalesce(old_obs_estruturadas->>'restricoes', 'não informado') || '" → "' || coalesce(new_obs_estruturadas->>'restricoes', 'não informado') || '"',
            jsonb_build_object('field', 'restricoes', 'old', old_obs_estruturadas->>'restricoes', 'new', new_obs_estruturadas->>'restricoes'),
            coalesce(NEW.updated_by, auth.uid()));
    end if;

    if (old_obs_estruturadas->>'preferencias') is distinct from (new_obs_estruturadas->>'preferencias') then
        insert into activities (card_id, tipo, descricao, metadata, created_by)
        values (NEW.id, 'updated', 
            'Preferências: "' || coalesce(old_obs_estruturadas->>'preferencias', 'não informado') || '" → "' || coalesce(new_obs_estruturadas->>'preferencias', 'não informado') || '"',
            jsonb_build_object('field', 'preferencias', 'old', old_obs_estruturadas->>'preferencias', 'new', new_obs_estruturadas->>'preferencias'),
            coalesce(NEW.updated_by, auth.uid()));
    end if;

    -- ========== PRODUTO_DATA: TAXA DE PLANEJAMENTO ==========
    
    old_taxa := coalesce(old_produto_data->'taxa_planejamento', '{}'::jsonb);
    new_taxa := coalesce(new_produto_data->'taxa_planejamento', '{}'::jsonb);
    
    -- Status da Taxa
    if (old_taxa->>'status') is distinct from (new_taxa->>'status') then
        insert into activities (card_id, tipo, descricao, metadata, created_by)
        values (NEW.id, 'updated', 
            'Taxa de Planejamento - Status: "' || coalesce(old_taxa->>'status', 'não definido') || '" → "' || coalesce(new_taxa->>'status', 'não definido') || '"',
            jsonb_build_object('field', 'taxa_status', 'old', old_taxa->>'status', 'new', new_taxa->>'status'),
            coalesce(NEW.updated_by, auth.uid()));
    end if;

    -- Valor da Taxa
    if (old_taxa->>'valor')::numeric is distinct from (new_taxa->>'valor')::numeric then
        insert into activities (card_id, tipo, descricao, metadata, created_by)
        values (NEW.id, 'value_changed', 
            'Taxa de Planejamento - Valor: R$ ' || coalesce(old_taxa->>'valor', '0') || ' → R$ ' || coalesce(new_taxa->>'valor', '0'),
            jsonb_build_object('field', 'taxa_valor', 'old_value', old_taxa->>'valor', 'new_value', new_taxa->>'valor'),
            coalesce(NEW.updated_by, auth.uid()));
    end if;

    -- ========== OUTROS CAMPOS DE PRODUTO_DATA ==========
    
    -- Número de viajantes
    if (old_produto_data->>'numero_viajantes')::int is distinct from (new_produto_data->>'numero_viajantes')::int then
        insert into activities (card_id, tipo, descricao, metadata, created_by)
        values (NEW.id, 'updated', 
            'Número de viajantes: ' || coalesce(old_produto_data->>'numero_viajantes', '0') || ' → ' || coalesce(new_produto_data->>'numero_viajantes', '0'),
            jsonb_build_object('field', 'numero_viajantes', 'old', old_produto_data->>'numero_viajantes', 'new', new_produto_data->>'numero_viajantes'),
            coalesce(NEW.updated_by, auth.uid()));
    end if;

    -- Número de adultos
    if (old_produto_data->>'numero_adultos')::int is distinct from (new_produto_data->>'numero_adultos')::int then
        insert into activities (card_id, tipo, descricao, metadata, created_by)
        values (NEW.id, 'updated', 
            'Número de adultos: ' || coalesce(old_produto_data->>'numero_adultos', '0') || ' → ' || coalesce(new_produto_data->>'numero_adultos', '0'),
            jsonb_build_object('field', 'numero_adultos', 'old', old_produto_data->>'numero_adultos', 'new', new_produto_data->>'numero_adultos'),
            coalesce(NEW.updated_by, auth.uid()));
    end if;

    -- Número de crianças
    if (old_produto_data->>'numero_criancas')::int is distinct from (new_produto_data->>'numero_criancas')::int then
        insert into activities (card_id, tipo, descricao, metadata, created_by)
        values (NEW.id, 'updated', 
            'Número de crianças: ' || coalesce(old_produto_data->>'numero_criancas', '0') || ' → ' || coalesce(new_produto_data->>'numero_criancas', '0'),
            jsonb_build_object('field', 'numero_criancas', 'old', old_produto_data->>'numero_criancas', 'new', new_produto_data->>'numero_criancas'),
            coalesce(NEW.updated_by, auth.uid()));
    end if;

    return NEW;
end;
$$ language plpgsql security definer;

-- Verificação
select 'Trigger log_card_changes atualizado para rastrear TODOS os campos de produto_data!' as resultado;
