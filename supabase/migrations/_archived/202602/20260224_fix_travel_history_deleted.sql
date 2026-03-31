-- =============================================================================
-- Fix: get_travel_history deve excluir cards com deleted_at (soft-deleted)
-- Ambas sobrecargas (UUID e UUID[]) estavam sem filtro.
-- =============================================================================

-- Versão 1: UUID (single contact)
CREATE OR REPLACE FUNCTION public.get_travel_history(contact_id_param UUID)
RETURNS TABLE (
    card_id UUID,
    titulo TEXT,
    data_viagem DATE,
    status TEXT,
    role TEXT,
    valor NUMERIC,
    moeda TEXT,
    companions TEXT[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT DISTINCT
        c.id as card_id,
        c.titulo,
        c.data_viagem_inicio::DATE,
        c.status_comercial as status,
        CASE WHEN c.pessoa_principal_id = contact_id_param THEN 'titular' ELSE 'acompanhante' END as role,
        COALESCE(c.valor_final, c.valor_estimado) as valor,
        c.moeda,
        ARRAY(
            SELECT p.nome
            FROM public.cards_contatos cc2
            JOIN public.contatos p ON cc2.contato_id = p.id
            WHERE cc2.card_id = c.id AND cc2.contato_id != contact_id_param
        ) as companions
    FROM public.cards c
    LEFT JOIN public.cards_contatos cc ON c.id = cc.card_id
    WHERE (c.pessoa_principal_id = contact_id_param OR cc.contato_id = contact_id_param)
      AND c.deleted_at IS NULL
    ORDER BY data_viagem_inicio DESC;
END;
$$;

-- Versão 2: UUID[] (multiple contacts)
CREATE OR REPLACE FUNCTION public.get_travel_history(contact_ids UUID[])
RETURNS TABLE (
    card_id UUID,
    titulo TEXT,
    data_viagem DATE,
    status TEXT,
    role TEXT,
    valor NUMERIC,
    moeda TEXT,
    companions TEXT[],
    relevant_contacts TEXT[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT DISTINCT
        c.id as card_id,
        c.titulo,
        c.data_viagem_inicio::DATE,
        c.status_comercial as status,
        'participante' as role,
        COALESCE(c.valor_final, c.valor_estimado) as valor,
        c.moeda,
        ARRAY(
            SELECT p.nome
            FROM public.cards_contatos cc2
            JOIN public.contatos p ON cc2.contato_id = p.id
            WHERE cc2.card_id = c.id AND NOT (cc2.contato_id = ANY(contact_ids))
        ) as companions,
        ARRAY(
            SELECT DISTINCT p.nome
            FROM (
                SELECT contato_id as id FROM public.cards_contatos WHERE public.cards_contatos.card_id = c.id
                UNION
                SELECT c.pessoa_principal_id as id WHERE c.pessoa_principal_id IS NOT NULL
            ) all_participants
            JOIN public.contatos p ON all_participants.id = p.id
            WHERE all_participants.id = ANY(contact_ids)
        ) as relevant_contacts
    FROM public.cards c
    LEFT JOIN public.cards_contatos cc ON c.id = cc.card_id
    WHERE (c.pessoa_principal_id = ANY(contact_ids) OR cc.contato_id = ANY(contact_ids))
      AND c.deleted_at IS NULL
    ORDER BY data_viagem_inicio DESC;
END;
$$;
