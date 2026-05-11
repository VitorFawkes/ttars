-- Fix: trocar contato principal por viajante dava erro
-- Root cause: trigger cleanup_single_role_cards tinha search_path vazio (RESET)
-- Melhoria: RPC agora faz swap atômico (antigo primary vira viajante)
-- Melhoria: unique constraint em cards_contatos(card_id, contato_id)

-- =============================================================
-- 1. Corrigir search_path das trigger functions (se existirem)
-- =============================================================
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'cleanup_single_role_cards' AND pronamespace = 'public'::regnamespace) THEN
        ALTER FUNCTION public.cleanup_single_role_cards() SET search_path = public;
    END IF;
END $$;

DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'check_single_role_cards_contatos' AND pronamespace = 'public'::regnamespace) THEN
        ALTER FUNCTION public.check_single_role_cards_contatos() SET search_path = public;
    END IF;
END $$;

-- =============================================================
-- 2. RPC atômica — swap completo de contato principal
-- =============================================================
CREATE OR REPLACE FUNCTION public.set_card_primary_contact(p_card_id uuid, p_contact_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_old_primary_id uuid;
BEGIN
    -- 1. Buscar o contato principal atual
    SELECT pessoa_principal_id INTO v_old_primary_id
    FROM public.cards
    WHERE id = p_card_id;

    -- 2. Desabilitar triggers de single-role (a RPC gerencia tudo explicitamente)
    --    Sem isso, o BEFORE UPDATE trigger tenta DELETE em cards_contatos e causa
    --    triggered_data_change_violation (27000)
    ALTER TABLE public.cards DISABLE TRIGGER enforce_single_role_cards;
    ALTER TABLE public.cards_contatos DISABLE TRIGGER enforce_single_role_cards_contatos;

    -- 3. Remover o novo primary de cards_contatos (se era viajante)
    DELETE FROM public.cards_contatos
    WHERE card_id = p_card_id
      AND contato_id = p_contact_id;

    -- 4. Atualizar o contato principal
    UPDATE public.cards
    SET pessoa_principal_id = p_contact_id
    WHERE id = p_card_id;

    -- 5. Rebaixar o antigo primary para viajante (se existia e é diferente)
    IF v_old_primary_id IS NOT NULL
       AND v_old_primary_id IS DISTINCT FROM p_contact_id THEN
        INSERT INTO public.cards_contatos (card_id, contato_id, tipo_viajante, ordem)
        VALUES (p_card_id, v_old_primary_id, 'acompanhante', 0)
        ON CONFLICT (card_id, contato_id) DO NOTHING;
    END IF;

    -- 6. Reabilitar triggers
    ALTER TABLE public.cards ENABLE TRIGGER enforce_single_role_cards;
    ALTER TABLE public.cards_contatos ENABLE TRIGGER enforce_single_role_cards_contatos;
END;
$$;

-- =============================================================
-- 3. Unique constraint em cards_contatos (se a tabela existir)
-- =============================================================
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'cards_contatos') THEN
        -- Limpar duplicatas existentes (manter o registro com menor id)
        DELETE FROM public.cards_contatos a
        USING public.cards_contatos b
        WHERE a.card_id = b.card_id
          AND a.contato_id = b.contato_id
          AND a.id > b.id;

        -- Adicionar constraint se não existir
        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint
            WHERE conname = 'uq_cards_contatos_card_contact'
        ) THEN
            ALTER TABLE public.cards_contatos
            ADD CONSTRAINT uq_cards_contatos_card_contact UNIQUE (card_id, contato_id);
        END IF;
    END IF;
END $$;
