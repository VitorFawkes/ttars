-- Weddings: remove (desativa) os campos de Noivo(a) 2 da seção SDR.
--
-- O 2º contato do casamento agora é um contato de verdade no card
-- (cards_contatos, via PessoasWidget), então e-mail/telefone/CPF do Noivo 2
-- viram dado do contato — não mais campos manuais na SDR. Desativar = some da
-- UI, mantém os dados em produto_data e é reversível. ww_nome_parceiro fica
-- (vive na Qualificação, vem do webhook). Escopo: workspace Weddings, WEDDING.

UPDATE public.system_fields
SET active = false
WHERE org_id = 'b0000000-0000-0000-0000-000000000002'
  AND produto_exclusivo = 'WEDDING'
  AND key IN ('ww_sdr_email_noivo2', 'ww_sdr_telefone_noivo2', 'ww_sdr_cpf_noivo2');
