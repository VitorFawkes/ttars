-- Religa o trigger "Pós-venda: App & Conteúdo" (órfão) à sua receita de blocos.
--
-- Contexto: existem duas linhas com o mesmo nome — um cadence_template (blocks)
-- e um cadence_event_trigger (start_cadence) com target_template_id=NULL.
-- Resultado no app: 2 itens na lista, editar o trigger abre o builder simples
-- (sem chaining) em vez do builder de blocos.
--
-- Correção: amarrar o trigger ao template pelo id. Reversível por UPDATE inverso.

UPDATE cadence_event_triggers
SET target_template_id = 'e14f4a48-0531-41e9-a6e2-8c17dc9539a6',
    updated_at = now()
WHERE id = '6f3ec4fe-747f-4124-b542-17085052a027'
  AND target_template_id IS NULL;
