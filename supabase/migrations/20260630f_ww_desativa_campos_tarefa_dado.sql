-- 20260630f_ww_desativa_campos_tarefa_dado.sql
--
-- Contexto (feedback do handoff "SDR + Vendas — Weddings"):
-- Vários itens listados como CAMPO no handoff, na verdade, são TAREFA ou DADO
-- automático — não devem ser campos editáveis no card. A realização da reunião
-- ("Fez a reunião") é uma TAREFA (tarefas.tipo='reuniao', concluida_em = data do
-- "Feito"); as datas de reunião vêm da tarefa/Calendly; a data de qualificação é
-- carimbada automaticamente por trigger (log de etapa). Decisão do Mateus:
-- DESATIVAR esses campos (somem do card; a informação passa a vir da tarefa
-- concluída / log de etapa).
--
-- Efeito: apenas UI. system_fields.active=false faz o useFieldConfig deixar de
-- carregar o campo, removendo-o do card em todas as etapas/seções. NÃO apaga
-- dados em cards.produto_data; triggers, integração Calendly/AC e views de
-- analytics continuam lendo produto_data normalmente.
--
-- Segurança verificada antes de aplicar:
--   - nenhum dos 8 campos é is_required, show_in_header nem confirmação de etapa
--     (não quebra quality gate / movimentação de etapa);
--   - ww_sdr_data_qualificacao continua sendo carimbado pelo trigger
--     stamp_ww_sdr_data_qualificacao (continua existindo como dado, só não é campo);
--   - ww_sdr_qualificado (toggle "Qualificado") NÃO é tocado (segue ativo).
--
-- Isolamento: org WEDDING (b0000000-...-002). Não toca no Trips.
-- Idempotente: pode rodar mais de uma vez.

UPDATE public.system_fields
SET active = false
WHERE org_id = 'b0000000-0000-0000-0000-000000000002'
  AND key IN (
    -- realização da reunião = tarefa concluída, não campo
    'ww_sdr_como_reuniao',          -- "Como foi feita a 1ª reunião?"
    'ww_closer_como_reuniao',       -- "Como foi feita a Reunião Closer"
    'ww_closer_segunda_reuniao',    -- "Fez segunda reunião?"
    'ww_plan_qtd_reunioes',         -- "Reuniões Realizadas" (deriva de tarefas concluídas)
    -- datas automáticas: vêm da tarefa/Calendly ou de log de etapa
    'ww_sdr_data_reuniao',          -- data 1ª reunião SDR (tarefa/Calendly)
    'ww_closer_data_reuniao',       -- data Reunião Closer (tarefa/Calendly)
    'ww_sdr_agendamento_closer',    -- data agendamento com a Closer (tarefa/Calendly)
    'ww_sdr_data_qualificacao'      -- data qualificação SDR (auto-stamp / log de etapa)
  )
  AND active = true;

-- Verificação (deve retornar 0 linhas active=true após o UPDATE)
DO $$
DECLARE
  v_ativos INT;
BEGIN
  SELECT count(*) INTO v_ativos
  FROM public.system_fields
  WHERE org_id = 'b0000000-0000-0000-0000-000000000002'
    AND key IN (
      'ww_sdr_como_reuniao','ww_closer_como_reuniao','ww_closer_segunda_reuniao',
      'ww_plan_qtd_reunioes','ww_sdr_data_reuniao','ww_closer_data_reuniao',
      'ww_sdr_agendamento_closer','ww_sdr_data_qualificacao'
    )
    AND active = true;
  IF v_ativos > 0 THEN
    RAISE EXCEPTION 'Ainda existem % campos tarefa/dado ativos no WEDDING', v_ativos;
  END IF;
END $$;
