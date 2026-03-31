CREATE OR REPLACE FUNCTION get_travel_history(contact_id_param UUID)
RETURNS TABLE (
    card_id UUID,
    titulo TEXT,
    data_viagem DATE,
    status TEXT,
    role TEXT,
    valor NUMERIC,
    moeda TEXT,
    companions TEXT[]
) AS $$
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
    WHERE c.pessoa_principal_id = contact_id_param OR cc.contato_id = contact_id_param
    ORDER BY data_viagem_inicio DESC;
END;
$$ LANGUAGE plpgsql;
