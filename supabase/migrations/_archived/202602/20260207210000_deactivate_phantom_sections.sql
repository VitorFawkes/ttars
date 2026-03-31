-- =================================================================
-- Sincronizar SectionManager com CardDetail
-- 1. Desativar seções fantasma (payment, system)
-- 2. Adicionar widget_component às seções que viram widgets
-- 3. Criar entries para componentes hardcoded sem entry no DB
-- =================================================================

-- 1. Desativar seções fantasma
UPDATE sections
SET active = false, updated_at = now()
WHERE key IN ('payment', 'system');

-- 2. Marcar seções existentes como widgets
UPDATE sections SET widget_component = 'observacoes_criticas', updated_at = now() WHERE key = 'observacoes_criticas';
UPDATE sections SET widget_component = 'trip_info', updated_at = now() WHERE key = 'trip_info';

-- 3. Criar novas seções para componentes que antes eram hardcoded sem entry
INSERT INTO sections (key, label, icon, position, order_index, is_system, is_governable, active, widget_component, color)
VALUES
  ('monde', 'Vendas Monde', 'building-2', 'right_column', 5, true, false, true, 'monde',
   'bg-green-50 text-green-700 border-green-100'),
  ('financeiro', 'Financeiro', 'dollar-sign', 'right_column', 6, true, false, true, 'financeiro',
   'bg-yellow-50 text-yellow-700 border-yellow-100'),
  ('agenda_tarefas', 'Agenda & Tarefas', 'calendar', 'left_column', 5, true, false, true, NULL,
   'bg-blue-50 text-blue-700 border-blue-100'),
  ('historico_conversas', 'Histórico de Conversas', 'message-square', 'left_column', 90, true, false, true, NULL,
   'bg-gray-50 text-gray-700 border-gray-100')
ON CONFLICT (key) DO NOTHING;
