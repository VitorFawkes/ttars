-- H3-034: Adicionar org_id a cadence_event_triggers para isolamento multi-tenant
-- Problema: triggers são visíveis para todas as orgs, causando 406 ao editar
-- cadências vinculadas a outra org.

BEGIN;

-- 1. Adicionar coluna org_id (nullable primeiro para popular)
ALTER TABLE cadence_event_triggers
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id);

-- 2. Popular org_id a partir do pipeline vinculado (applicable_pipeline_ids[1])
UPDATE cadence_event_triggers t
SET org_id = p.org_id
FROM pipelines p
WHERE t.applicable_pipeline_ids IS NOT NULL
  AND array_length(t.applicable_pipeline_ids, 1) > 0
  AND p.id = t.applicable_pipeline_ids[1]
  AND t.org_id IS NULL;

-- 3. Para triggers start_cadence sem pipeline mas com template, usar org do template
UPDATE cadence_event_triggers t
SET org_id = ct.org_id
FROM cadence_templates ct
WHERE t.target_template_id = ct.id
  AND t.org_id IS NULL;

-- 4. Triggers internos (complete_task) sem pipeline/template → Welcome Group (parent)
UPDATE cadence_event_triggers
SET org_id = 'a0000000-0000-0000-0000-000000000001'
WHERE org_id IS NULL;

-- 5. Tornar NOT NULL com default
ALTER TABLE cadence_event_triggers
  ALTER COLUMN org_id SET NOT NULL,
  ALTER COLUMN org_id SET DEFAULT requesting_org_id();

-- 6. Corrigir target_template_id de triggers que apontam para template de outra org
-- Para cada trigger start_cadence, buscar template com mesmo nome na mesma org
UPDATE cadence_event_triggers t
SET target_template_id = correct_tpl.id
FROM cadence_templates wrong_tpl,
     cadence_templates correct_tpl
WHERE t.action_type = 'start_cadence'
  AND t.target_template_id = wrong_tpl.id
  AND wrong_tpl.org_id != t.org_id          -- template está em outra org
  AND correct_tpl.name = wrong_tpl.name      -- mesmo nome
  AND correct_tpl.org_id = t.org_id          -- na org correta
  AND correct_tpl.id != wrong_tpl.id;

-- 7. Habilitar RLS
ALTER TABLE cadence_event_triggers ENABLE ROW LEVEL SECURITY;

-- 8. Policy de leitura/escrita por org
CREATE POLICY cadence_event_triggers_org_isolation
  ON cadence_event_triggers
  FOR ALL
  USING (org_id = requesting_org_id())
  WITH CHECK (org_id = requesting_org_id());

-- 9. Service role bypass
CREATE POLICY cadence_event_triggers_service_bypass
  ON cadence_event_triggers
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMIT;
