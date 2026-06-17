-- ═══════════════════════════════════════════════════════════════════════════
-- Calendly: isenta leads vindos do Calendly da obrigatoriedade de telefone
-- ═══════════════════════════════════════════════════════════════════════════
-- check_contato_required_fields() exige nome+sobrenome+telefone para criar
-- contato, EXCETO origens automáticas/bulk (echo, integracao, trigger, whatsapp,
-- importacao, monde, ai_extraction, manual_corp, leadster). Um agendamento de
-- Calendly cria contato com origem 'calendly' / 'calendly_sdr' / 'calendly_closer'
-- — que NÃO estavam isentas → uma reserva sem telefone (formulário sem campo de
-- telefone/WhatsApp) quebrava a criação do card. Calendly é fonte automática como
-- a Leadster; adicionamos as origens calendly* à lista de isenção.
--
-- REBASE da definição VIVA em produção (pg_get_functiondef — regra CLAUDE.md
-- TOP-5 #5). Único delta: 3 origens calendly* na lista de isenção. Todo o resto
-- (empresa sem sobrenome/telefone, nome obrigatório, etc.) preservado.
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
    -- + calendly* adicionado em 20260617e)
    IF NEW.origem IN ('echo', 'integracao', 'trigger', 'whatsapp', 'importacao',
                      'monde', 'ai_extraction', 'manual_corp', 'leadster',
                      'calendly', 'calendly_sdr', 'calendly_closer') THEN
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
