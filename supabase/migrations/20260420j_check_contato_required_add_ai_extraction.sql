-- ============================================================================
-- Adiciona 'ai_extraction' à lista de origens automáticas isentas do check
-- de campos obrigatórios (nome/sobrenome/telefone).
--
-- Viajantes extraídos da conversa frequentemente não têm telefone (só nome
-- e tipo de vínculo), mas são criados pela IA automaticamente sem
-- intervenção humana. Alinha com o padrão das outras origens automáticas.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.check_contato_required_fields()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    -- Origens automáticas são isentas
    IF NEW.origem IN ('echo', 'integracao', 'trigger', 'whatsapp', 'monde', 'ai_extraction') THEN
        RETURN NEW;
    END IF;

    IF NULLIF(TRIM(NEW.nome), '') IS NULL THEN
        RAISE EXCEPTION 'Nome é obrigatório para criação de contato';
    END IF;

    IF NULLIF(TRIM(COALESCE(NEW.sobrenome, '')), '') IS NULL THEN
        RAISE EXCEPTION 'Sobrenome é obrigatório para criação de contato';
    END IF;

    IF NULLIF(TRIM(COALESCE(NEW.telefone, '')), '') IS NULL THEN
        RAISE EXCEPTION 'Telefone é obrigatório para criação de contato';
    END IF;

    RETURN NEW;
END;
$$;
