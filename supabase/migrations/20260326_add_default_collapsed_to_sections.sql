-- Adiciona default_collapsed à tabela sections
-- Quando true, a seção inicia colapsada (retraída) no card detail
-- Configurável pelo admin no Gerenciador de Seções

ALTER TABLE sections
ADD COLUMN IF NOT EXISTS default_collapsed BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN sections.default_collapsed IS 'Quando true, seção inicia colapsada no card detail';
