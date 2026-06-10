-- ============================================================================
-- 20260610a — Hardening: fecha o acesso da chave PÚBLICA (anon) às funções
-- SECURITY DEFINER de NEGÓCIO do schema public.
--
-- PROBLEMA (P0 verificado em 2026-06-10): a chave anon (pública, embutida no
-- bundle do front) tinha EXECUTE em ~643 funções SECURITY DEFINER (default do
-- Postgres concede a PUBLIC). SECURITY DEFINER ignora RLS → qualquer um na
-- internet lia/mexia em dados (config da Sofia, cards, contatos, etc.).
--
-- ESTRATÉGIA (não-disruptiva — garante que NADA quebra):
--   • authenticated (app logado) e service_role (backend: n8n via credencial
--     WelcomeSupabase=service_role, edges via SERVICE_ROLE_KEY) → MANTIDOS em
--     TODAS as funções. Logo o frontend logado e a Sofia/edges NÃO quebram.
--   • anon → REVOGADO das funções de negócio; PRESERVADO apenas nas funções de
--     telas PÚBLICAS sem login (proposta por link, convite) — lista exata +
--     padrão de segurança (*_by_token, portal, invite) p/ cobrir não-mapeadas.
--   • Portal público de casamento (wedding-lista-publica/wedme-*) usa edges com
--     service_role → suas RPCs podem perder anon sem quebrar.
--
-- Mapa de chamadores: docs/sofia-auditoria-2026-06-10.md (auditoria 2026-06-10).
-- Idempotente. Funções de extensions (não-owner) são puladas silenciosamente.
-- ROLLBACK no fim do arquivo (comentado).
-- ============================================================================

DO $$
DECLARE
  r RECORD;
  v_keep_anon BOOLEAN;
  v_closed INT := 0;
  v_kept   INT := 0;
  v_skip   INT := 0;
  -- Funções de telas públicas (sem login) confirmadas no mapa de chamadores.
  anon_allow TEXT[] := ARRAY[
    'get_invite_details','accept_invite_for_existing_user',
    'get_proposal_comments_by_token','add_proposal_comment_by_token',
    'log_link_opened','log_proposal_event','resolve_proposal_token',
    'save_client_selection','get_viagem_by_token','get_trip_portal_by_token',
    'get_portal_by_token'
  ];
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef = true
  LOOP
    -- mantém anon se está na lista OU casa um padrão de acesso público por token
    v_keep_anon := (r.proname = ANY(anon_allow))
      OR r.proname ~ '(_by_token|_by_codigo|_by_link|^get_portal|^get_trip_portal|^get_viagem_by|^resolve_proposal|^log_link_opened|^log_proposal_event|^get_invite|^accept_invite|^save_client_selection|proposal_comment)';
    BEGIN
      IF v_keep_anon THEN
        EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO anon, authenticated, service_role', r.proname, r.args);
        v_kept := v_kept + 1;
      ELSE
        EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM PUBLIC', r.proname, r.args);
        EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM anon', r.proname, r.args);
        EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO authenticated, service_role', r.proname, r.args);
        v_closed := v_closed + 1;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      -- funções de extensions (graphql/vault/etc.) ou sem permissão de owner
      v_skip := v_skip + 1;
      RAISE NOTICE 'pulou %(%): %', r.proname, r.args, SQLERRM;
    END;
  END LOOP;
  RAISE NOTICE 'Hardening anon concluido: % fechadas (anon revogado) | % mantidas publicas | % puladas', v_closed, v_kept, v_skip;
END $$;

-- ============================================================================
-- ROLLBACK (reverter tudo — re-concede anon a TODAS as SECURITY DEFINER):
-- DO $$
-- DECLARE r RECORD;
-- BEGIN
--   FOR r IN SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
--            FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--            WHERE n.nspname='public' AND p.prosecdef=true
--   LOOP
--     BEGIN EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO anon, authenticated, service_role', r.proname, r.args);
--     EXCEPTION WHEN OTHERS THEN NULL; END;
--   END LOOP;
-- END $$;
-- ============================================================================
