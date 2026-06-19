-- ═══════════════════════════════════════════════════════════════════════════
-- Site (formulário welcomeweddings.com.br): isenta leads da obrigatoriedade
-- de nome+sobrenome+telefone no check de criação de contato.
-- ═══════════════════════════════════════════════════════════════════════════
-- A nova edge function wedding-site-webhook cria contatos com origem='site'
-- (2ª fonte de leads de WEDDING, ao lado do Leadster). O formulário do site
-- pode mandar um nome de uma palavra só (sem sobrenome) ou sem telefone — e
-- check_contato_required_fields() exige os três para origens não automáticas,
-- o que quebraria a criação do contato/card. 'site' é fonte automática como
-- 'leadster'/'calendly'; entra na lista de isenção.
--
-- REBASE da definição VIVA em produção (verificada via pg_get_functiondef em
-- 2026-06-17, idêntica a 20260617e_calendly_contato_no_phone — regra CLAUDE.md
-- TOP-5 #5). Único delta: 'site' na lista de isenção. Todo o resto (empresa sem
-- sobrenome/telefone, nome obrigatório, demais origens) preservado. Histórico
-- de origens já isentas (sempre unir TODAS):
--   echo, integracao, trigger, whatsapp, importacao, monde, ai_extraction,
--   manual_corp, leadster, calendly, calendly_sdr, calendly_closer  (+ site).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.check_contato_required_fields()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    -- Empresas não têm sobrenome/telefone — só nome (20260430b)
    IF NEW.tipo_contato = 'empresa' THEN
        IF NULLIF(TRIM(NEW.nome), '') IS NULL THEN
            RAISE EXCEPTION 'Nome é obrigatório para criação de contato';
        END IF;
        RETURN NEW;
    END IF;

    -- Origens automáticas/bulk são isentas (união de todas as migrations anteriores
    -- + calendly* em 20260617e + site em 20260617h)
    IF NEW.origem IN ('echo', 'integracao', 'trigger', 'whatsapp', 'importacao',
                      'monde', 'ai_extraction', 'manual_corp', 'leadster',
                      'calendly', 'calendly_sdr', 'calendly_closer', 'site') THEN
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
$function$;
