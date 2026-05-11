-- Corrige admins: Tiago e Cyntya devem ser admin sem produto (veem tudo)

BEGIN;

-- Tiago de Mello Abdul Hak → admin, sem produto
UPDATE profiles
SET is_admin = true, produtos = NULL
WHERE id = '59e9cce7-c429-45ac-b4c8-ce28237748c3';

-- Cyntya Joici Nishino de Almeida → limpar produto (já é admin)
UPDATE profiles
SET produtos = NULL
WHERE id = 'a9c2d054-3c37-445d-b372-e2adb56d4f11';

COMMIT;
