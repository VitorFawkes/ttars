-- ============================================================================
-- CORREÇÃO V2: Forçar atualização da lógica de viajantes e limpeza
-- ============================================================================

-- 1. Trigger para atualizar contagem de viajantes (CORRIGIDO: Join com contatos)
create or replace function update_travelers_count() returns trigger as $$
declare
    v_adultos int;
    v_criancas int;
    v_bebes int;
    v_card_id uuid;
begin
    v_card_id := coalesce(NEW.card_id, OLD.card_id);
    
    -- Contar baseado no tipo_pessoa da tabela contatos
    select count(*) into v_adultos 
    from cards_contatos cc
    join contatos c on c.id = cc.contato_id
    where cc.card_id = v_card_id 
    and (c.tipo_pessoa = 'adulto' or c.tipo_pessoa is null); -- Assume adulto se null

    select count(*) into v_criancas 
    from cards_contatos cc
    join contatos c on c.id = cc.contato_id
    where cc.card_id = v_card_id 
    and c.tipo_pessoa = 'crianca';
    
    v_bebes := 0; 
    
    -- Atualizar JSONB no card
    update cards
    set produto_data = jsonb_set(
        jsonb_set(
            jsonb_set(
                coalesce(produto_data, '{}'::jsonb),
                '{viajantes, adultos}',
                to_jsonb(v_adultos)
            ),
            '{viajantes, criancas}',
            to_jsonb(v_criancas)
        ),
        '{viajantes, bebes}',
        to_jsonb(v_bebes)
    )
    where id = v_card_id;
    
    return null;
end;
$$ language plpgsql security definer;

drop trigger if exists update_travelers_count_trigger on cards_contatos;
create trigger update_travelers_count_trigger
after insert or update or delete on cards_contatos
for each row execute function update_travelers_count();

-- 2. Redefinir log_cards_contatos_activity (Garantia)
create or replace function log_cards_contatos_activity()
returns trigger as $$
declare
    contato_nome text;
begin
    if TG_OP = 'INSERT' then
        select nome into contato_nome from contatos where id = NEW.contato_id;
        insert into activities (card_id, tipo, descricao, metadata, created_by)
        values (
            NEW.card_id,
            'traveler_added',
            'Viajante adicionado: ' || coalesce(contato_nome, 'Desconhecido'),
            jsonb_build_object(
                'contato_id', NEW.contato_id,
                'contato_nome', contato_nome,
                'tipo_viajante', NEW.tipo_viajante,
                'tipo_vinculo', NEW.tipo_vinculo
            ),
            auth.uid()
        );
    elsif TG_OP = 'DELETE' then
        select nome into contato_nome from contatos where id = OLD.contato_id;
        insert into activities (card_id, tipo, descricao, metadata, created_by)
        values (
            OLD.card_id,
            'traveler_removed',
            'Viajante removido: ' || coalesce(contato_nome, 'Desconhecido'),
            jsonb_build_object(
                'contato_id', OLD.contato_id,
                'contato_nome', contato_nome
            ),
            auth.uid()
        );
        return OLD;
    elsif TG_OP = 'UPDATE' then
        if OLD.tipo_viajante is distinct from NEW.tipo_viajante then
            select nome into contato_nome from contatos where id = NEW.contato_id;
            insert into activities (card_id, tipo, descricao, metadata, created_by)
            values (
                NEW.card_id,
                'traveler_updated',
                'Tipo de viajante alterado: ' || coalesce(contato_nome, 'Desconhecido'),
                jsonb_build_object(
                    'contato_id', NEW.contato_id,
                    'old_tipo', OLD.tipo_viajante,
                    'new_tipo', NEW.tipo_viajante
                ),
                auth.uid()
            );
        end if;
    end if;
    return NEW;
end;
$$ language plpgsql security definer;

-- 3. Limpeza Nuclear de Triggers em REUNIOES e TAREFAS (Novamente para garantir)
do $$
declare
    r record;
begin
    -- Limpar REUNIOES
    for r in 
        select trigger_name 
        from information_schema.triggers 
        where event_object_table = 'reunioes' 
        and trigger_schema = 'public'
        and trigger_name != 'reuniao_activity_trigger'
    loop
        execute 'drop trigger if exists "' || r.trigger_name || '" on reunioes';
        raise notice 'Trigger removido de reunioes: %', r.trigger_name;
    end loop;

    -- Limpar TAREFAS
    for r in 
        select trigger_name 
        from information_schema.triggers 
        where event_object_table = 'tarefas' 
        and trigger_schema = 'public'
        and trigger_name != 'tarefa_activity_trigger'
    loop
        execute 'drop trigger if exists "' || r.trigger_name || '" on tarefas';
        raise notice 'Trigger removido de tarefas: %', r.trigger_name;
    end loop;
end;
$$;
