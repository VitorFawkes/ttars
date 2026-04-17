-- ============================================================================
-- CORREÇÃO: Remover log duplicado da função mover_card
-- ============================================================================

-- Redefinir a função mover_card para APENAS atualizar o card.
-- O log será gerado automaticamente pelo trigger card_changes_trigger.

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
  
  -- REMOVIDO: insert into activities ... (Isso causava duplicidade e formato incorreto)
end;
$$ language plpgsql security definer;

-- Verificação
select 'Função mover_card atualizada para não gerar logs manuais.' as resultado;
