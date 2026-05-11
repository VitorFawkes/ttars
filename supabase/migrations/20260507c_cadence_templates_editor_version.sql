-- =====================================================================
-- 20260507c: marcar quem nasceu no editor visual v2
--
-- Adiciona cadence_templates.editor_version pra que o hub Automações saiba
-- rotear o "Editar" pro builder certo:
--   - 'v1' (default) → builders antigos (AutomacaoBuilderPage / Cadence /
--                       AutomationBuilderPage) conforme as regras atuais
--   - 'v2'           → editor visual em /settings/automations/v2/:id
--
-- Templates já existentes ficam como 'v1' pelo DEFAULT — comportamento
-- atual preservado. saveWorkflow do v2 grava 'v2' explicitamente.
-- =====================================================================

BEGIN;

ALTER TABLE cadence_templates
    ADD COLUMN IF NOT EXISTS editor_version TEXT NOT NULL DEFAULT 'v1';

ALTER TABLE cadence_templates
    DROP CONSTRAINT IF EXISTS cadence_templates_editor_version_check;

ALTER TABLE cadence_templates
    ADD CONSTRAINT cadence_templates_editor_version_check
    CHECK (editor_version IN ('v1', 'v2'));

COMMENT ON COLUMN cadence_templates.editor_version IS
    'Qual builder criou/edita esse template. v1 = builders antigos
     (form-based: CadenceBuilderPage / AutomacaoBuilderPage /
     AutomationBuilderPage). v2 = WorkflowEditorPage (canvas n8n-style).
     Default v1 preserva o comportamento dos templates pré-existentes.';

COMMIT;
