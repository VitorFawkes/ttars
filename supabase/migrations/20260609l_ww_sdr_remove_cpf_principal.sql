-- Weddings: remove (desativa) o "CPF do contato principal" da seção SDR.
--
-- O CPF do contato principal é dado do contato (Noivo 1), não um campo manual
-- da SDR. Desativar = some da UI, mantém os dados em produto_data e é reversível.
-- Escopo: workspace Weddings, WEDDING.

UPDATE public.system_fields
SET active = false
WHERE org_id = 'b0000000-0000-0000-0000-000000000002'
  AND produto_exclusivo = 'WEDDING'
  AND key = 'ww_sdr_cpf_principal';
