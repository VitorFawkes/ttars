-- Weddings: remove (desativa) "Nome do(a) Noivo(a) 2" da seção Qualificação.
--
-- O nome que vem da pergunta "Nome dos noivos" do formulário Leadster agora
-- vira um contato de verdade no card (cards_contatos, acompanhante, criado
-- pelo webhook leadster-webhook-wedding) — a SDR completa os dados depois.
-- Mesmo padrão de 20260609k (e-mail/telefone/CPF do Noivo 2): desativar =
-- some da UI, mantém dados em produto_data, reversível com active = true.
-- Escopo: workspace Weddings.

UPDATE public.system_fields
SET active = false
WHERE org_id = 'b0000000-0000-0000-0000-000000000002'
  AND produto_exclusivo = 'WEDDING'
  AND key = 'ww_nome_parceiro';
