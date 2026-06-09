-- Weddings: remove (desativa) os campos "(Formulário)" duplicados do card.
--
-- Destino/Convidados/Orçamento (Formulário) repetem o que já aparece em
-- ww_destino, ww_num_convidados e ww_orcamento_faixa (agora texto livre na
-- Qualificação). Desativar = some da UI, mantém os dados em produto_data e é
-- reversível. O trigger de qualificação lê ww_mkt_convidados_form com fallback
-- para ww_num_convidados, então continua funcionando. Escopo no workspace Weddings.

UPDATE public.system_fields
SET active = false
WHERE org_id = 'b0000000-0000-0000-0000-000000000002'
  AND produto_exclusivo = 'WEDDING'
  AND key IN ('ww_mkt_destino_form', 'ww_mkt_convidados_form', 'ww_mkt_orcamento_form');
