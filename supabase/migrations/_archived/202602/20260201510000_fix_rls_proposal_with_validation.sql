-- ============================================================
-- Migration: Fix RLS Proposal Tables with Token Validation (FASE 2A)
-- Data: 2026-02-01
-- Autor: Vitor (via Claude)
--
-- PROBLEMA: Policies com WITH CHECK (true) permitem INSERT irrestrito
-- em proposal_events e proposal_client_selections.
--
-- SOLUCAO: MANTER acesso anonimo (necessario para /p/{token}) mas
-- adicionar validacao de que a proposal existe e esta em status valido.
--
-- RISCO: MEDIO - Se quebrar, clientes nao conseguem aceitar propostas
-- ROLLBACK: Restaurar policies originais (documentado abaixo)
--
-- TESTE OBRIGATORIO APOS APLICAR:
-- 1. Abrir URL /p/{token} em aba anonima (sem login)
-- 2. Navegar pelas secoes da proposta
-- 3. Selecionar itens
-- 4. Clicar "Aceitar Proposta"
-- 5. Verificar que selecoes foram salvas
-- 6. Verificar que evento foi registrado
-- ============================================================

-- ============================================================
-- PARTE 1: proposal_events - Adicionar validacao de proposal existente
-- ============================================================

-- Remover policy antiga
DROP POLICY IF EXISTS "Anyone can insert proposal events" ON proposal_events;

-- Criar nova policy com validacao
-- MANTEM: anon + authenticated podem INSERT
-- ADICIONA: Verifica que proposal_id existe e nao esta cancelada/deletada
CREATE POLICY "proposal_events_insert_validated"
ON proposal_events
FOR INSERT
TO anon, authenticated
WITH CHECK (
    -- Proposal deve existir e nao estar cancelada/deletada
    EXISTS (
        SELECT 1 FROM proposals p
        WHERE p.id = proposal_id
        AND (p.status IS NULL OR p.status NOT IN ('cancelled', 'deleted'))
    )
);

COMMENT ON POLICY "proposal_events_insert_validated" ON proposal_events IS
    'Permite INSERT anon/auth apenas se proposal existe e nao esta cancelada. Criado em 2026-02-01.';

-- ============================================================
-- PARTE 2: proposal_client_selections - Validar proposal em status ativo
-- ============================================================

-- Remover policies antigas
DROP POLICY IF EXISTS "Anyone can insert selections" ON proposal_client_selections;
DROP POLICY IF EXISTS "Allow public insert" ON proposal_client_selections;

-- Criar nova policy de INSERT com validacao
-- MANTEM: anon + authenticated podem INSERT
-- ADICIONA: Verifica que proposal esta em status que permite selecoes
CREATE POLICY "proposal_client_selections_insert_validated"
ON proposal_client_selections
FOR INSERT
TO anon, authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM proposals p
        WHERE p.id = proposal_id
        AND p.status IN ('draft', 'sent', 'viewed', 'in_review', 'pending')
    )
);

COMMENT ON POLICY "proposal_client_selections_insert_validated" ON proposal_client_selections IS
    'Permite INSERT anon/auth apenas se proposal esta em status ativo. Criado em 2026-02-01.';

-- Remover policy antiga de UPDATE
DROP POLICY IF EXISTS "Anyone can update selections" ON proposal_client_selections;

-- Criar nova policy de UPDATE com validacao
CREATE POLICY "proposal_client_selections_update_validated"
ON proposal_client_selections
FOR UPDATE
TO anon, authenticated
USING (
    EXISTS (
        SELECT 1 FROM proposals p
        WHERE p.id = proposal_id
        AND p.status IN ('sent', 'viewed', 'in_review', 'pending')
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM proposals p
        WHERE p.id = proposal_id
        AND p.status IN ('sent', 'viewed', 'in_review', 'pending')
    )
);

COMMENT ON POLICY "proposal_client_selections_update_validated" ON proposal_client_selections IS
    'Permite UPDATE anon/auth apenas se proposal esta em status ativo. Criado em 2026-02-01.';

-- ============================================================
-- PARTE 3: proposal_comments - Validar proposal existe
-- ============================================================

-- Verificar se policy existe antes de tentar dropar
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow inserting comments' AND tablename = 'proposal_comments') THEN
        DROP POLICY "Allow inserting comments" ON proposal_comments;
    END IF;
END $$;

-- Criar policy com validacao (se tabela existir)
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'proposal_comments' AND table_schema = 'public') THEN
        EXECUTE '
            CREATE POLICY "proposal_comments_insert_validated"
            ON proposal_comments
            FOR INSERT
            TO anon, authenticated
            WITH CHECK (
                EXISTS (
                    SELECT 1 FROM proposals p
                    WHERE p.id = proposal_id
                    AND p.status NOT IN (''cancelled'', ''deleted'')
                )
            )
        ';
    END IF;
END $$;

-- ============================================================
-- VERIFICACAO POS-APLICACAO
-- ============================================================
-- Execute para verificar policies atualizadas:
--
-- SELECT tablename, policyname, cmd, qual, with_check
-- FROM pg_policies
-- WHERE tablename IN ('proposal_events', 'proposal_client_selections', 'proposal_comments')
-- ORDER BY tablename, policyname;
--
-- Esperado: Todas devem ter WITH CHECK com EXISTS (... proposals ...)
-- ============================================================

-- ============================================================
-- ROLLBACK SCRIPT (se precisar reverter):
-- ============================================================
/*
-- proposal_events: Restaurar policy original
DROP POLICY IF EXISTS "proposal_events_insert_validated" ON proposal_events;
CREATE POLICY "Anyone can insert proposal events" ON proposal_events
    FOR INSERT TO anon, authenticated WITH CHECK (true);

-- proposal_client_selections: Restaurar policies originais
DROP POLICY IF EXISTS "proposal_client_selections_insert_validated" ON proposal_client_selections;
DROP POLICY IF EXISTS "proposal_client_selections_update_validated" ON proposal_client_selections;
CREATE POLICY "Anyone can insert selections" ON proposal_client_selections
    FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Anyone can update selections" ON proposal_client_selections
    FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

-- proposal_comments: Restaurar policy original (se existir)
DROP POLICY IF EXISTS "proposal_comments_insert_validated" ON proposal_comments;
CREATE POLICY "Allow inserting comments" ON proposal_comments
    FOR INSERT WITH CHECK (true);
*/
