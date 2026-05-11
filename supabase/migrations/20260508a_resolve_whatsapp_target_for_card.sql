-- 20260508a — RPC SECURITY DEFINER para resolver URL de WhatsApp/Echo a partir de um card
--
-- Contexto: o botão "WhatsApp" no header do card precisa abrir a conversa no Echo
-- (ou painel) quando ela existe. Hoje o lookup é feito direto pelo cliente, lendo
-- whatsapp_conversations / whatsapp_phase_instance_map / whatsapp_platforms.
-- Problema: essas tabelas vivem em org_id da CONTA-PAI (ex: Welcome Group),
-- mas o usuário acessa o card de dentro do WORKSPACE (ex: Welcome Trips).
-- Como as RLS dessas tabelas exigem org_id = requesting_org_id(), a query do
-- usuário-no-workspace devolve vazio e o frontend cai no fallback wa.me.
--
-- Esta função roda com SECURITY DEFINER, valida que o usuário tem acesso ao card
-- (via cards.RLS) e então resolve o URL cruzando os limites de org.

CREATE OR REPLACE FUNCTION public.resolve_whatsapp_target_for_card(p_card_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id           UUID;
    v_card_org_id       UUID;
    v_pessoa_id         UUID;
    v_stage_id          UUID;
    v_phase_id          UUID;
    v_expected_label    TEXT;
    v_conv              RECORD;
    v_platform          RECORD;
    v_mapping           RECORD;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Não autenticado' USING ERRCODE = '42501';
    END IF;

    -- 1) Lê o card direto (SECURITY DEFINER ignora RLS) — depois validamos acesso via org_members
    SELECT org_id, pessoa_principal_id, pipeline_stage_id
      INTO v_card_org_id, v_pessoa_id, v_stage_id
      FROM cards
     WHERE id = p_card_id;

    IF v_card_org_id IS NULL THEN
        RAISE EXCEPTION 'Card não encontrado' USING ERRCODE = '42704';
    END IF;

    -- 2) Validação de acesso: usuário precisa ser membro da org do card OU da conta-pai
    PERFORM 1
      FROM org_members om
      JOIN organizations card_org ON card_org.id = v_card_org_id
     WHERE om.user_id = v_user_id
       AND (
            om.org_id = v_card_org_id                       -- membro do workspace
         OR om.org_id = card_org.parent_org_id              -- ou da conta-pai
         OR card_org.id = (SELECT parent_org_id FROM organizations WHERE id = om.org_id)
       )
     LIMIT 1;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Sem acesso a este card' USING ERRCODE = '42501';
    END IF;

    -- 3) Resolve fase atual e linha esperada
    IF v_stage_id IS NOT NULL THEN
        SELECT phase_id INTO v_phase_id
          FROM pipeline_stages
         WHERE id = v_stage_id;
    END IF;

    IF v_phase_id IS NOT NULL THEN
        SELECT phone_number_label INTO v_expected_label
          FROM whatsapp_linha_config
         WHERE phase_id = v_phase_id AND ativo = TRUE
         LIMIT 1;
    END IF;

    -- 4) PRIORIDADE 1: conversa existente do contato (filtrando pela linha da fase quando definida)
    IF v_pessoa_id IS NOT NULL THEN
        SELECT external_conversation_id, external_conversation_url, platform_id, phone_number_label
          INTO v_conv
          FROM whatsapp_conversations
         WHERE contact_id = v_pessoa_id
           AND (v_expected_label IS NULL OR phone_number_label = v_expected_label)
         ORDER BY last_message_at DESC NULLS LAST
         LIMIT 1;

        IF v_conv.external_conversation_url IS NOT NULL THEN
            RETURN jsonb_build_object(
                'url',           v_conv.external_conversation_url,
                'platform',      'Echo',
                'fallback_used', 'deep_link'
            );
        END IF;

        IF v_conv.external_conversation_id IS NOT NULL AND v_conv.platform_id IS NOT NULL THEN
            SELECT name, dashboard_url_template INTO v_platform
              FROM whatsapp_platforms
             WHERE id = v_conv.platform_id;

            IF v_platform.dashboard_url_template IS NOT NULL THEN
                RETURN jsonb_build_object(
                    'url',           replace(v_platform.dashboard_url_template, '{conversation_id}', v_conv.external_conversation_id),
                    'platform',      COALESCE(v_platform.name, 'Echo'),
                    'fallback_used', 'deep_link'
                );
            END IF;
        END IF;
    END IF;

    -- 5) PRIORIDADE 2: mapping de fase → plataforma (abre dashboard genérico)
    IF v_phase_id IS NOT NULL THEN
        SELECT platform_id INTO v_mapping
          FROM whatsapp_phase_instance_map
         WHERE phase_id = v_phase_id AND is_active = TRUE
         ORDER BY priority
         LIMIT 1;

        IF v_mapping.platform_id IS NOT NULL THEN
            SELECT name, dashboard_url_template INTO v_platform
              FROM whatsapp_platforms
             WHERE id = v_mapping.platform_id AND is_active = TRUE;

            IF v_platform.dashboard_url_template IS NOT NULL
               AND v_platform.dashboard_url_template NOT LIKE '%{%' THEN
                RETURN jsonb_build_object(
                    'url',           v_platform.dashboard_url_template,
                    'platform',      COALESCE(v_platform.name, 'Echo'),
                    'fallback_used', 'dashboard'
                );
            END IF;
        END IF;
    END IF;

    -- 6) Sem deep link → caller usa wa.me
    RETURN NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_whatsapp_target_for_card(UUID) TO authenticated;

COMMENT ON FUNCTION public.resolve_whatsapp_target_for_card(UUID) IS
'Resolve URL de WhatsApp/Echo para um card. Bypassa RLS de whatsapp_conversations/platforms (que vivem na conta-pai) após validar acesso do usuário ao card via org_members. Retorna jsonb {url, platform, fallback_used} ou NULL se sem deep link (caller usa wa.me).';
