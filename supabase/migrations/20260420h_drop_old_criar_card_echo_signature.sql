-- ============================================================================
-- Hotfix — remover versão antiga (6 args) de criar_card_de_conversa_echo
-- Date: 2026-04-20
--
-- A migration 20260420f introduziu uma versão nova com p_force_create (7 args)
-- mas deixou a antiga (6 args) coexistindo. Isso é risco: chamadas sem o
-- parâmetro force_create podem cair na versão antiga que NÃO tem a lógica
-- de lock de nome do Marco A.
--
-- O frontend sempre passa p_force_create, mas integrações externas podem
-- não passar. Padronizar removendo a antiga — a nova tem DEFAULT FALSE, então
-- qualquer chamada sem esse parâmetro funciona igual.
-- ============================================================================

DROP FUNCTION IF EXISTS public.criar_card_de_conversa_echo(
    text, text, text, text, text, text
);

-- Sanity: só a assinatura de 7 args deve sobrar
DO $$
DECLARE
    v_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_count
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname = 'criar_card_de_conversa_echo';

    IF v_count <> 1 THEN
        RAISE EXCEPTION 'Esperava 1 versão de criar_card_de_conversa_echo, achei %', v_count;
    END IF;
END $$;
