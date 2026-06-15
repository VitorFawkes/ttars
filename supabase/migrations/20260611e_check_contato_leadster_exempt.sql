-- Adiciona 'leadster' às origens isentas do check de campos obrigatórios de
-- contato (nome/sobrenome/telefone). Necessário para o webhook do Leadster
-- criar o 2º contato do casamento (Noivo(a) 2) só com o nome — a SDR completa
-- e-mail/telefone depois. De quebra, leads do Leadster sem telefone passam a
-- criar contato em vez de falhar.
--
-- ATENÇÃO (histórico de regressões desta função — sempre unir TODAS as listas):
--   20260326 base: echo, integracao, trigger, whatsapp
--   20260402 +importacao  (PERDIDA em 20260420j)
--   20260408 +monde
--   20260420j +ai_extraction  (PERDIDA em 20260430b)
--   20260430b +manual_corp +branch empresa
-- Esta versão RESTAURA importacao e ai_extraction e une tudo + leadster.

CREATE OR REPLACE FUNCTION public.check_contato_required_fields()
RETURNS TRIGGER AS $check$
BEGIN
    -- Empresas não têm sobrenome/telefone — só nome (20260430b)
    IF NEW.tipo_contato = 'empresa' THEN
        IF NULLIF(TRIM(NEW.nome), '') IS NULL THEN
            RAISE EXCEPTION 'Nome é obrigatório para criação de contato';
        END IF;
        RETURN NEW;
    END IF;

    -- Origens automáticas/bulk são isentas (união de todas as migrations anteriores)
    IF NEW.origem IN ('echo', 'integracao', 'trigger', 'whatsapp', 'importacao',
                      'monde', 'ai_extraction', 'manual_corp', 'leadster') THEN
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
$check$ LANGUAGE plpgsql;
