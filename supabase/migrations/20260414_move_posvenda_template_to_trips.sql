-- Move o template "Pós-venda: App & Conteúdo" (e seus steps) para Welcome Trips.
--
-- Problema: template está em Welcome Group (a0000000...) mas o trigger que o
-- dispara e todas as 26 cadence_instances estão em Welcome Trips (b0000000...).
-- Ao abrir editar a partir de um user logado em Trips, RLS bloqueia a leitura
-- do template (cross-org) e o editor dá erro.
--
-- Correção: alinhar org_id do template + steps com a org do trigger/instâncias.
-- Reversível (UPDATE inverso).

UPDATE cadence_templates
SET org_id = 'b0000000-0000-0000-0000-000000000001',
    updated_at = now()
WHERE id = 'e14f4a48-0531-41e9-a6e2-8c17dc9539a6'
  AND org_id = 'a0000000-0000-0000-0000-000000000001';

UPDATE cadence_steps
SET org_id = 'b0000000-0000-0000-0000-000000000001'
WHERE template_id = 'e14f4a48-0531-41e9-a6e2-8c17dc9539a6'
  AND org_id = 'a0000000-0000-0000-0000-000000000001';
