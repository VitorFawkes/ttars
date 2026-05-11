-- ============================================================================
-- Trigger: padronizar titulo de cards criados via WhatsApp/Echo
-- Date: 2026-05-11
--
-- Problema: cards criados via Echo (botao "Criar Card" no Echo CRM) ou via
-- ai-agent-router (inbound automatico) nasciam com titulo = primeiro nome do
-- contato ("Mariana", "Gabriele") ou "Lead WhatsApp". Consultor depois
-- precisa renomear manualmente pro padrao da casa.
--
-- Solucao: trigger BEFORE INSERT em cards reformata o titulo pro padrao usado
-- pelos consultores quando origem='whatsapp' e o titulo ainda nao esta no
-- padrao (sem " / "). Depois a Luna/Estela trocam SEM DESTINO/SEM DATA pelos
-- valores reais conforme descobrem na conversa.
--
-- Padroes:
--   TRIPS   -> "Nome Completo / SEM DESTINO / SEM DATA"
--   WEDDING -> "Casamento Nome Completo / SEM DESTINO / SEM DATA"
--   outros  -> mesmo padrao TRIPS
--
-- Nao toca cards que ja vem com titulo formatado (contem " / "), nem cards
-- criados por outras origens (manual, mkt, monde, etc).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.format_titulo_card_whatsapp(
    p_produto TEXT,
    p_nome    TEXT
) RETURNS TEXT
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
    v_nome_limpo TEXT;
BEGIN
    v_nome_limpo := NULLIF(trim(COALESCE(p_nome, '')), '');
    IF v_nome_limpo IS NULL THEN
        v_nome_limpo := 'Lead WhatsApp';
    END IF;

    IF UPPER(COALESCE(p_produto, 'TRIPS')) = 'WEDDING' THEN
        RETURN 'Casamento ' || v_nome_limpo || ' / SEM DESTINO / SEM DATA';
    ELSE
        RETURN v_nome_limpo || ' / SEM DESTINO / SEM DATA';
    END IF;
END;
$$;

COMMENT ON FUNCTION public.format_titulo_card_whatsapp(TEXT, TEXT) IS
'Monta titulo padrao para cards criados via WhatsApp/Echo. TRIPS: "Nome / SEM DESTINO / SEM DATA". WEDDING: "Casamento Nome / SEM DESTINO / SEM DATA".';

-- ----------------------------------------------------------------------------
-- Helper: usa nome completo do contato (nome + sobrenome) se titulo recebido
-- for so o primeiro nome ou um placeholder fraco/curto.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_format_card_titulo_whatsapp()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    v_nome_completo TEXT;
    v_base_nome     TEXT;
BEGIN
    -- So mexe em cards de origem whatsapp
    IF NEW.origem IS DISTINCT FROM 'whatsapp' THEN
        RETURN NEW;
    END IF;

    -- Se titulo ja contem " / " (padrao da casa) ou " - " (variantes humanas),
    -- assume que ja esta formatado e nao altera. Idempotente em re-inserts.
    IF NEW.titulo IS NOT NULL AND (NEW.titulo LIKE '% / %' OR NEW.titulo LIKE '% - %') THEN
        RETURN NEW;
    END IF;

    -- Resolve nome completo a partir do contato/empresa
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

    -- Se mesmo assim nao tem nome utilizavel, deixa o titulo original
    IF v_base_nome IS NULL OR v_base_nome = '' THEN
        RETURN NEW;
    END IF;

    NEW.titulo := public.format_titulo_card_whatsapp(NEW.produto::TEXT, v_base_nome);
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.tg_format_card_titulo_whatsapp() IS
'BEFORE INSERT trigger: padroniza titulo de cards origem=whatsapp pro formato da casa. Pula se titulo ja contem " / " ou " - " (ja formatado).';

DROP TRIGGER IF EXISTS trg_format_card_titulo_whatsapp ON cards;
CREATE TRIGGER trg_format_card_titulo_whatsapp
    BEFORE INSERT ON cards
    FOR EACH ROW
    EXECUTE FUNCTION public.tg_format_card_titulo_whatsapp();

COMMENT ON TRIGGER trg_format_card_titulo_whatsapp ON cards IS
'Padroniza titulo de cards criados via WhatsApp/Echo no padrao "Nome / SEM DESTINO / SEM DATA" (TRIPS) ou "Casamento Nome / SEM DESTINO / SEM DATA" (WEDDING). Acionado em INSERTs de cards origem=whatsapp.';
