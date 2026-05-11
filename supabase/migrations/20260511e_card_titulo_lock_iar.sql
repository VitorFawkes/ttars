-- ============================================================================
-- Card titulo lock — IA pode editar enquanto humano nao mexeu
-- Date: 2026-05-11
--
-- Base: complementa 20260511d (trigger que formata titulo no INSERT).
--
-- Comportamento desejado (decidido com o Vitor 2026-05-11):
--   - Card nasce via Echo/Whatsapp: titulo padronizado, sem lock. IA pode
--     trocar SEM DESTINO/SEM DATA conforme descobre na conversa.
--   - Card nasce por qualquer outra fonte (manual, monde, mkt, csv): titulo
--     marcado como locked desde o nascimento. Humano definiu, IA nao mexe.
--   - Humano edita titulo na UI (qualquer auth.uid IS NOT NULL): vira locked
--     automaticamente. IA para de refazer.
--   - IA (service_role, auth.uid IS NULL) tentando mudar titulo locked:
--     update e silenciosamente revertido. Nao quebra fluxo, so ignora.
--
-- Tudo construido com triggers (sem mexer em agent_update_card_data, que ja
-- tem 2 migrations anteriores e nao queremos rebase).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Coluna de lock
-- ----------------------------------------------------------------------------
ALTER TABLE public.cards
    ADD COLUMN IF NOT EXISTS titulo_locked_at TIMESTAMPTZ DEFAULT NULL;

COMMENT ON COLUMN public.cards.titulo_locked_at IS
'Quando NOT NULL, indica que o titulo foi definido/editado por humano (UI) ou por fonte de importacao confiavel. IAs (service_role) nao podem mais alterar o titulo apos esse marcador. NULL = card recem-criado via Echo, IA pode refinar (substituir SEM DESTINO/SEM DATA).';

-- ----------------------------------------------------------------------------
-- 2. Backfill: todos os cards existentes ficam locked
--    (IA nao deve chegar reescrevendo titulos historicos)
-- ----------------------------------------------------------------------------
UPDATE public.cards
   SET titulo_locked_at = COALESCE(updated_at, created_at, NOW())
 WHERE titulo_locked_at IS NULL;

-- ----------------------------------------------------------------------------
-- 3. INSERT trigger atualizado: cards nao-whatsapp nascem ja locked.
--    Cards whatsapp recebem o padrao e ficam unlocked (IA pode refinar).
--    Substitui o tg_format_card_titulo_whatsapp da 20260511d.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_format_card_titulo_whatsapp()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    v_nome_completo TEXT;
    v_base_nome     TEXT;
BEGIN
    -- So formata cards de origem whatsapp.
    -- Outras origens: lock imediato (humano/importacao ja definiu).
    IF NEW.origem IS DISTINCT FROM 'whatsapp' THEN
        IF NEW.titulo_locked_at IS NULL THEN
            NEW.titulo_locked_at := NOW();
        END IF;
        RETURN NEW;
    END IF;

    -- Whatsapp: se titulo ja vier formatado (contem " / " ou " - "),
    -- considera como ja-definido e lockeia. (Pouco provavel, mas seguro.)
    IF NEW.titulo IS NOT NULL AND (NEW.titulo LIKE '% / %' OR NEW.titulo LIKE '% - %') THEN
        IF NEW.titulo_locked_at IS NULL THEN
            NEW.titulo_locked_at := NOW();
        END IF;
        RETURN NEW;
    END IF;

    -- Resolve nome completo do contato/empresa
    IF NEW.pessoa_principal_id IS NOT NULL THEN
        SELECT trim(COALESCE(c.nome, '') || ' ' || COALESCE(c.sobrenome, ''))
          INTO v_nome_completo
          FROM contatos c
         WHERE c.id = NEW.pessoa_principal_id;
    END IF;

    v_base_nome := NULLIF(trim(COALESCE(v_nome_completo, '')), '');
    IF v_base_nome IS NULL THEN
        v_base_nome := NULLIF(trim(COALESCE(NEW.titulo, '')), '');
    END IF;

    IF v_base_nome IS NULL OR v_base_nome = '' THEN
        -- Sem nome utilizavel: deixa titulo como veio + lock pra IA nao bagunçar
        IF NEW.titulo_locked_at IS NULL THEN
            NEW.titulo_locked_at := NOW();
        END IF;
        RETURN NEW;
    END IF;

    NEW.titulo := public.format_titulo_card_whatsapp(NEW.produto::TEXT, v_base_nome);
    -- titulo_locked_at fica NULL → IA pode trocar SEM DESTINO/SEM DATA
    RETURN NEW;
END;
$$;

-- ----------------------------------------------------------------------------
-- 4. UPDATE trigger: detecta edicao humana e bloqueia overwrite da IA.
--    Regra:
--      - Humano edita (auth.uid IS NOT NULL): lock imediato.
--      - IA edita (auth.uid IS NULL) e OLD ja locked: revert.
--      - IA edita e OLD ja nao tem placeholders SEM DESTINO/SEM DATA:
--        consideramos titulo finalizado, revert + lock retroativo.
--      - IA edita e OLD tem placeholder: permitido. Se NEW nao tem mais
--        placeholder, lockeia automaticamente (IA terminou de refinar).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_card_titulo_lock_logic()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    v_old_has_placeholder BOOLEAN;
    v_new_has_placeholder BOOLEAN;
BEGIN
    IF NEW.titulo IS NOT DISTINCT FROM OLD.titulo THEN
        RETURN NEW;
    END IF;

    -- Humano editando: lock.
    IF auth.uid() IS NOT NULL THEN
        NEW.titulo_locked_at := NOW();
        RETURN NEW;
    END IF;

    -- Service role (IA) tentando editar.
    IF OLD.titulo_locked_at IS NOT NULL THEN
        NEW.titulo := OLD.titulo;
        NEW.titulo_locked_at := OLD.titulo_locked_at;
        RETURN NEW;
    END IF;

    v_old_has_placeholder := COALESCE(OLD.titulo, '') LIKE '%SEM DESTINO%'
                          OR COALESCE(OLD.titulo, '') LIKE '%SEM DATA%';

    IF NOT v_old_has_placeholder THEN
        -- IA tentando reescrever titulo ja sem placeholder = ja finalizado.
        -- Revert + lock retroativo pra evitar loop.
        NEW.titulo := OLD.titulo;
        NEW.titulo_locked_at := COALESCE(OLD.updated_at, NOW());
        RETURN NEW;
    END IF;

    -- OLD tinha placeholder → IA pode refinar.
    -- Se NEW nao tem mais placeholder, IA terminou: lock automatico.
    v_new_has_placeholder := COALESCE(NEW.titulo, '') LIKE '%SEM DESTINO%'
                          OR COALESCE(NEW.titulo, '') LIKE '%SEM DATA%';

    IF NOT v_new_has_placeholder THEN
        NEW.titulo_locked_at := NOW();
    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.tg_card_titulo_lock_logic() IS
'BEFORE UPDATE trigger em cards: humano editando titulo vira locked; service_role (IA) editando card locked tem update revertido.';

DROP TRIGGER IF EXISTS trg_card_titulo_lock_logic ON public.cards;
CREATE TRIGGER trg_card_titulo_lock_logic
    BEFORE UPDATE OF titulo ON public.cards
    FOR EACH ROW
    EXECUTE FUNCTION public.tg_card_titulo_lock_logic();

COMMENT ON TRIGGER trg_card_titulo_lock_logic ON public.cards IS
'Lock automatico: humano editando titulo seta titulo_locked_at; IA tentando reescrever card locked tem mudanca silenciosamente revertida.';

-- ----------------------------------------------------------------------------
-- 5. Libera "titulo" em auto_update_fields dos agentes existentes (Patricia,
--    Estela e qualquer clone). So adiciona se ainda nao estiver na lista.
-- ----------------------------------------------------------------------------
UPDATE public.ai_agent_business_config
   SET auto_update_fields = auto_update_fields || '"titulo"'::jsonb,
       updated_at = NOW()
 WHERE NOT (auto_update_fields ? 'titulo');
