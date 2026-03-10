-- Adiciona "Contato Principal" como campo configurável nos cards do Kanban
INSERT INTO system_fields (key, label, type, active, section)
VALUES ('pessoa_nome', 'Contato Principal', 'text', true, 'geral')
ON CONFLICT (key) DO NOTHING;
