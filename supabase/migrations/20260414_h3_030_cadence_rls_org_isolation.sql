-- H3-030: Fix RLS cross-org leaks on cadence_templates + cadence_steps
-- Gap: admin_all policies used is_admin() without org_id filter,
--       and select_active/select policies had no org_id filter at all.
-- Result: admin from Org A could see/edit templates+steps from Org B.
-- Fix: add org_id = requesting_org_id() to all permissive policies.

BEGIN;

-- ============================================================
-- cadence_templates
-- ============================================================

-- 1) admin_all: is_admin() alone → add org_id guard
DROP POLICY IF EXISTS cadence_templates_admin_all ON cadence_templates;
CREATE POLICY cadence_templates_admin_all ON cadence_templates
  FOR ALL TO public
  USING (is_admin() AND org_id = requesting_org_id())
  WITH CHECK (is_admin() AND org_id = requesting_org_id());

-- 2) select_active: was (is_active = true) for public → add org_id guard
DROP POLICY IF EXISTS cadence_templates_select_active ON cadence_templates;
CREATE POLICY cadence_templates_select_active ON cadence_templates
  FOR SELECT TO public
  USING (is_active = true AND org_id = requesting_org_id());

-- org_all and org_select already have org_id = requesting_org_id() — no change needed
-- service_all is USING true for service_role — correct, no change needed

-- ============================================================
-- cadence_steps
-- ============================================================

-- 3) admin_all: is_admin() alone → add org_id guard
DROP POLICY IF EXISTS cadence_steps_admin_all ON cadence_steps;
CREATE POLICY cadence_steps_admin_all ON cadence_steps
  FOR ALL TO public
  USING (is_admin() AND org_id = requesting_org_id())
  WITH CHECK (is_admin() AND org_id = requesting_org_id());

-- 4) select: EXISTS on template without org_id → add org_id guard
DROP POLICY IF EXISTS cadence_steps_select ON cadence_steps;
CREATE POLICY cadence_steps_select ON cadence_steps
  FOR SELECT TO public
  USING (
    org_id = requesting_org_id()
    AND EXISTS (
      SELECT 1 FROM cadence_templates t
      WHERE t.id = cadence_steps.template_id
        AND (t.is_active = true OR is_admin())
    )
  );

-- org_all and org_select already have org_id = requesting_org_id() — no change needed
-- service_all is USING true for service_role — correct, no change needed

COMMIT;
