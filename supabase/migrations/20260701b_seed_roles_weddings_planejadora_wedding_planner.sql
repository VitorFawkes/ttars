-- ============================================================================
-- Fix: "Planejadora" (role) e "Wedding Planner" (time) não aparecem ao criar
-- pessoas no time do workspace Welcome Weddings.
--
-- Causa raiz #1: Welcome Trips e Welcome Weddings foram criadas antes de
-- `provision_workspace` existir e NUNCA receberam backfill de `roles`
-- (diferente de `system_fields`, que já tem backfill em 20260426d). RLS
-- (`roles_org_select`, USING org_id = requesting_org_id()) já isola
-- corretamente por workspace — então hoje esses dois workspaces enxergam
-- a lista de Roles 100% VAZIA (não só falta "Planejadora": falta tudo).
-- Corp e Welcome Courses já nasceram depois de provision_workspace e têm
-- catálogo próprio — não precisam de backfill.
--
-- Causa raiz #2: o time responsável pelo fechamento em Welcome Weddings já
-- existe, mas com o nome genérico herdado do template de Trips ("Planner"),
-- e não com o nome que a operação usa de fato ("Wedding Planner" — é assim
-- que a Sofia/SDR e toda a documentação do negócio chamam esse papel).
--
-- Nota de segurança (por que "planejadora" é uma role NOVA, não um rename
-- de "planner"): `handle_new_user()` resolve o role_id do convite com
-- `WHERE r.name = v_invite_role LIMIT 1`, SEM filtrar por org — e
-- `roles.name` se repete entre orgs por design (ex: 'admin' já existe hoje
-- em 6+ orgs diferentes). Reaproveitar o name='planner' pra Weddings
-- colidiria com o 'planner' da Welcome Group e o LIMIT 1 (sem ORDER BY)
-- poderia resolver pro id errado num convite novo. Esse lookup é uma função
-- crítica (handle_new_user/generate_invite) com 9+ e 3+ migrations
-- anteriores respectivamente — mexer nela está fora do escopo deste fix.
-- Solução adotada: dar à nova role um "name" GLOBALMENTE único
-- ('planejadora', que não existe em nenhuma outra org), eliminando a colisão
-- por completo sem tocar nas funções de convite/signup.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Backfill de roles: copia o catálogo da Welcome Group (fonte de verdade)
--    para qualquer workspace filho que ainda esteja com 0 linhas em roles.
--    Idempotente — se rodar de novo, workspaces já preenchidos são pulados.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
    v_source_account UUID := 'a0000000-0000-0000-0000-000000000001'; -- Welcome Group
    v_target RECORD;
    v_roles_copied INT;
BEGIN
    FOR v_target IN
        SELECT o.id AS workspace_id, o.name AS workspace_name
        FROM organizations o
        WHERE o.parent_org_id = v_source_account
          AND o.active = true
        ORDER BY o.name
    LOOP
        IF EXISTS (SELECT 1 FROM roles WHERE org_id = v_target.workspace_id) THEN
            RAISE NOTICE 'Workspace % já tem roles, pulando', v_target.workspace_name;
            CONTINUE;
        END IF;

        INSERT INTO roles (name, display_name, description, permissions, is_system, color, org_id)
        SELECT r.name, r.display_name, r.description, r.permissions, r.is_system, r.color, v_target.workspace_id
        FROM roles r
        WHERE r.org_id = v_source_account
        ON CONFLICT (org_id, name) DO NOTHING;

        GET DIAGNOSTICS v_roles_copied = ROW_COUNT;
        RAISE NOTICE 'Workspace % — % roles copiadas', v_target.workspace_name, v_roles_copied;
    END LOOP;
END
$$;

-- ----------------------------------------------------------------------------
-- 2. Welcome Weddings usa o rótulo do negócio ("Planejadora") em vez do
--    genérico herdado de Trips ("Planner") pro mesmo nível de acesso.
--    Troca a linha 'planner' copiada no passo 1 por uma role própria com
--    name globalmente único (ver nota de segurança acima) — evita o rótulo
--    genérico "Planner" duplicado ao lado de "Planejadora" no dropdown.
-- ----------------------------------------------------------------------------
INSERT INTO roles (name, display_name, description, permissions, is_system, color, org_id)
SELECT 'planejadora', 'Planejadora', r.description, r.permissions, r.is_system, r.color,
       'b0000000-0000-0000-0000-000000000002' -- Welcome Weddings
FROM roles r
WHERE r.org_id = 'a0000000-0000-0000-0000-000000000001' -- Welcome Group
  AND r.name = 'planner'
ON CONFLICT (org_id, name) DO NOTHING;

DELETE FROM roles
WHERE org_id = 'b0000000-0000-0000-0000-000000000002' -- Welcome Weddings
  AND name = 'planner';

-- ----------------------------------------------------------------------------
-- 3. Renomeia o time de fechamento em Welcome Weddings de "Planner" (nome
--    herdado do template de Trips) para "Wedding Planner" (nome real usado
--    pela operação e por toda a Sofia/SDR). É só o rótulo — o time continua
--    ligado à mesma fase (Closer) e ao mesmo id.
-- ----------------------------------------------------------------------------
UPDATE teams
SET name = 'Wedding Planner'
WHERE org_id = 'b0000000-0000-0000-0000-000000000002' -- Welcome Weddings
  AND name = 'Planner';

COMMIT;
