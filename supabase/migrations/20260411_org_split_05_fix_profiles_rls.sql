-- Fix: profiles RLS bloqueava leitura do próprio profile após org switch
--
-- Problema: profiles.org_id = Welcome Group, mas JWT.org_id = Welcome Trips
-- após active_org_id ser setado. A policy profiles_org_select exige
-- org_id = requesting_org_id(), que agora retorna a org filha.
--
-- Solução: Permitir que o usuário SEMPRE leia seu próprio profile,
-- e manter o filtro por org para ver profiles de outros usuários.

-- Dropar policy restritiva
DROP POLICY IF EXISTS "profiles_org_select" ON profiles;

-- Recriar: pode ler o próprio OU colegas da mesma org
CREATE POLICY "profiles_org_select" ON profiles
    FOR SELECT TO authenticated
    USING (
        id = auth.uid()
        OR org_id = requesting_org_id()
    );

-- Também corrigir self_update — remover filtro org_id para editar próprio perfil
DROP POLICY IF EXISTS "profiles_self_update" ON profiles;

CREATE POLICY "profiles_self_update" ON profiles
    FOR UPDATE TO authenticated
    USING (id = auth.uid())
    WITH CHECK (id = auth.uid());
