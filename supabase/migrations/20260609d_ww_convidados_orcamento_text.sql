-- Card de Weddings: Número de Convidados e Orçamento como TEXTO LIVRE (SDR).
--
-- Os leads do Leadster trazem convidados/orçamento como faixa em texto
-- ("Entre 80 a 100 convidados", "Entre R$200 e R$500 mil"), que não cabem num
-- campo numérico nem nas opções fixas de um select. Decisão do produto: deixar
-- livre agora; fixar (number/select) fica pra depois. Mantemos `options` do
-- orçamento guardadas, então re-fixar é só trocar o type de volta pra 'select'.
--
-- Escopo no workspace Weddings (b0…0002) — é o que o app renderiza. Sem cast
-- numérico desses campos em nenhum lugar (valores vivem como texto em
-- cards.produto_data), então a mudança é segura.

UPDATE public.system_fields
SET type = 'text'
WHERE org_id = 'b0000000-0000-0000-0000-000000000002'
  AND produto_exclusivo = 'WEDDING'
  AND key IN ('ww_num_convidados', 'ww_orcamento_faixa');
