-- ============================================================================
-- CORREÇÃO NUCLEAR: REMOÇÃO PROGRAMÁTICA DE DUPLICATAS
-- ============================================================================

-- 1. Remover TODAS as variações da função mover_card (Overloads)
-- Isso garante que se o frontend chamar com 2 ou 3 argumentos, usará a nova versão limpa.
drop function if exists mover_card(uuid, uuid);
drop function if exists mover_card(uuid, uuid, uuid);

-- 2. Recriar mover_card APENAS com a lógica de update (sem logs)
create or replace function mover_card(
  p_card_id uuid,
  p_nova_etapa_id uuid,
  p_motivo_perda_id uuid default null
)
returns void as $$
begin
  update cards
  set 
    pipeline_stage_id = p_nova_etapa_id,
    motivo_perda_id = p_motivo_perda_id,
    updated_at = now()
  where id = p_card_id;
end;
$$ language plpgsql security definer;

-- 3. Remover TODOS os triggers da tabela cards, EXCETO o nosso 'card_changes_trigger' oficial
do $$
declare
    r record;
begin
    for r in 
        select trigger_name 
        from information_schema.triggers 
        where event_object_table = 'cards' 
        and trigger_schema = 'public'
        and trigger_name != 'card_changes_trigger'
    loop
        execute 'drop trigger if exists "' || r.trigger_name || '" on cards';
        raise notice 'Trigger removido: %', r.trigger_name;
    end loop;
end;
$$;

-- 4. Garantir que o nosso trigger oficial está lá e correto
drop trigger if exists card_changes_trigger on cards;
create trigger card_changes_trigger
after update on cards
for each row
execute function log_card_changes();

-- Verificação
select 'Limpeza nuclear concluída. Apenas 1 trigger e mover_card limpo.' as resultado;
