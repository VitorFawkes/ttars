-- ============================================================================
-- LIMPEZA: Remover triggers duplicados e garantir apenas 1 trigger por evento
-- ============================================================================

-- Primeiro, listar e remover TODOS os triggers relacionados a cards
drop trigger if exists card_changes_trigger on cards;
drop trigger if exists card_created_trigger on cards;
drop trigger if exists log_card_changes_trigger on cards;
drop trigger if exists cards_update_trigger on cards;

-- Recriar apenas UM trigger para UPDATE
create trigger card_changes_trigger
after update on cards
for each row
execute function log_card_changes();

-- Verificar
select 'Triggers limpos! Apenas 1 trigger de update em cards.' as resultado;
