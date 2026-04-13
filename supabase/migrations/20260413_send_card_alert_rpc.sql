-- RPC: send_card_alert
-- Permite que um usuário envie um alerta manual para outra pessoa de um card,
-- contornando a ausência de policy de INSERT em notifications (que só permite service_role).
--
-- Valida:
--   - sender autenticado
--   - card existe e sender tem acesso à org dele
--   - recipient pertence à mesma org do card
--   - tipo card_alert habilitado em notification_type_config (se existir)
--
-- Insere:
--   - notificação para o destinatário (read = false)
--   - notificação espelho para o remetente (read = true)
--   - activity no card

CREATE OR REPLACE FUNCTION public.send_card_alert(
    p_recipient_id uuid,
    p_card_id uuid,
    p_message text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_sender_id uuid := auth.uid();
    v_card_org uuid;
    v_card_title text;
    v_sender_name text;
    v_recipient_name text;
    v_recipient_org uuid;
    v_alert_enabled boolean;
BEGIN
    IF v_sender_id IS NULL THEN
        RAISE EXCEPTION 'Não autenticado' USING ERRCODE = '42501';
    END IF;

    IF p_recipient_id IS NULL OR p_card_id IS NULL THEN
        RAISE EXCEPTION 'Destinatário e card são obrigatórios' USING ERRCODE = '22023';
    END IF;

    -- Tipo habilitado?
    SELECT enabled INTO v_alert_enabled
    FROM notification_type_config
    WHERE type_key = 'card_alert';

    IF v_alert_enabled IS NOT NULL AND v_alert_enabled = false THEN
        RAISE EXCEPTION 'Alertas no card estão desativados pelo admin' USING ERRCODE = '42501';
    END IF;

    -- Card + org
    SELECT c.org_id, c.titulo
      INTO v_card_org, v_card_title
      FROM cards c
     WHERE c.id = p_card_id;

    IF v_card_org IS NULL THEN
        RAISE EXCEPTION 'Card não encontrado' USING ERRCODE = 'P0002';
    END IF;

    -- Sender precisa estar na org do card (admin global cobre tudo; ou via team cross-org)
    IF NOT EXISTS (
        SELECT 1 FROM profiles p
         WHERE p.id = v_sender_id
           AND (p.is_admin = true OR p.org_id = v_card_org)
    ) AND NOT EXISTS (
        SELECT 1
          FROM team_members tm
          JOIN teams t ON t.id = tm.team_id
         WHERE tm.user_id = v_sender_id
           AND t.org_id = v_card_org
    ) THEN
        RAISE EXCEPTION 'Sem acesso a este card' USING ERRCODE = '42501';
    END IF;

    -- Recipient precisa estar na org do card (própria org ou via team cross-org)
    SELECT p.org_id, p.nome
      INTO v_recipient_org, v_recipient_name
      FROM profiles p
     WHERE p.id = p_recipient_id;

    IF v_recipient_org IS NULL THEN
        RAISE EXCEPTION 'Destinatário não encontrado' USING ERRCODE = 'P0002';
    END IF;

    IF v_recipient_org <> v_card_org AND NOT EXISTS (
        SELECT 1
          FROM team_members tm
          JOIN teams t ON t.id = tm.team_id
         WHERE tm.user_id = p_recipient_id
           AND t.org_id = v_card_org
    ) THEN
        RAISE EXCEPTION 'Destinatário não pertence à org deste card' USING ERRCODE = '42501';
    END IF;

    -- Sender name (pra montar título)
    SELECT COALESCE(nome, email, 'Alguém') INTO v_sender_name
      FROM profiles WHERE id = v_sender_id;

    v_recipient_name := COALESCE(v_recipient_name, 'alguém');

    -- Notificação para destinatário
    INSERT INTO notifications (user_id, type, title, body, url, card_id, org_id, read)
    VALUES (
        p_recipient_id,
        'card_alert',
        v_sender_name || ' em "' || COALESCE(v_card_title, 'Card') || '": "' || COALESCE(p_message, '(sem mensagem)') || '"',
        NULLIF(p_message, ''),
        '/cards/' || p_card_id::text,
        p_card_id,
        v_card_org,
        false
    );

    -- Espelho para remetente (auto-lido)
    IF v_sender_id <> p_recipient_id THEN
        INSERT INTO notifications (user_id, type, title, body, url, card_id, org_id, read)
        VALUES (
            v_sender_id,
            'card_alert',
            'Você alertou ' || v_recipient_name,
            NULLIF(p_message, ''),
            '/cards/' || p_card_id::text,
            p_card_id,
            v_card_org,
            true
        );
    END IF;

    -- Activity
    INSERT INTO activities (card_id, tipo, descricao, metadata, created_by, org_id)
    VALUES (
        p_card_id,
        'note_added',
        v_sender_name || ' enviou alerta para ' || v_recipient_name || ': "' || COALESCE(p_message, '(sem mensagem)') || '"',
        jsonb_build_object(
            'alert_type', 'card_alert',
            'recipient_id', p_recipient_id,
            'recipient_name', v_recipient_name
        ),
        v_sender_id,
        v_card_org
    );

    RETURN jsonb_build_object('ok', true, 'recipient_id', p_recipient_id, 'card_id', p_card_id);
END;
$$;

REVOKE ALL ON FUNCTION public.send_card_alert(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.send_card_alert(uuid, uuid, text) TO authenticated;

COMMENT ON FUNCTION public.send_card_alert IS
'Envia alerta manual de um usuário autenticado para outra pessoa de um card. SECURITY DEFINER porque notifications não tem INSERT policy para authenticated.';
