-- ============================================================================
-- MIGRATION: card_opens + record_card_open RPC (trigger_mode on_card_open)
-- Date: 2026-04-07
--
-- Rastreia a primeira vez que cada usuário abre cada card. Usado pelo modo
-- 'on_card_open' das regras de alerta: quando o dono abre o card pela
-- primeira vez, o engine chama generate_card_alerts para gerar alertas
-- relacionados.
--
-- UNIQUE (card_id, user_id) garante que só a PRIMEIRA abertura aciona o
-- engine. Aberturas subsequentes atualizam last_opened_at mas não re-disparam.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.card_opens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    card_id UUID NOT NULL REFERENCES public.cards(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    first_opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    open_count INTEGER NOT NULL DEFAULT 1,
    org_id UUID REFERENCES public.organizations(id),
    UNIQUE (card_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_card_opens_card_id ON public.card_opens(card_id);
CREATE INDEX IF NOT EXISTS idx_card_opens_user_id ON public.card_opens(user_id);

ALTER TABLE public.card_opens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own card_opens" ON public.card_opens;
CREATE POLICY "Users read own card_opens"
    ON public.card_opens FOR SELECT
    USING (user_id = auth.uid());

-- Escrita feita via RPC SECURITY DEFINER, não via PostgREST direto
DROP POLICY IF EXISTS "No direct insert" ON public.card_opens;
CREATE POLICY "No direct insert"
    ON public.card_opens FOR INSERT
    WITH CHECK (false);

-- ─── record_card_open RPC ──────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.record_card_open(
    p_card_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
    v_user_id UUID := auth.uid();
    v_is_first_open BOOLEAN := false;
    v_card_org UUID;
    v_rule RECORD;
    v_alerts_created INT := 0;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('error', 'not_authenticated');
    END IF;

    -- Verifica se card existe e pega org
    SELECT org_id INTO v_card_org
    FROM cards
    WHERE id = p_card_id AND deleted_at IS NULL;

    IF v_card_org IS NULL THEN
        RETURN jsonb_build_object('error', 'card_not_found');
    END IF;

    -- INSERT ... ON CONFLICT: sabemos se é primeira abertura pelo resultado
    INSERT INTO card_opens (card_id, user_id, first_opened_at, last_opened_at, open_count, org_id)
    VALUES (p_card_id, v_user_id, now(), now(), 1, v_card_org)
    ON CONFLICT (card_id, user_id) DO UPDATE SET
        last_opened_at = now(),
        open_count = card_opens.open_count + 1
    RETURNING (xmax = 0) INTO v_is_first_open;
    -- xmax=0 → row foi inserida; xmax!=0 → row já existia (update)

    -- Se é primeira abertura, aciona regras on_card_open
    IF v_is_first_open THEN
        FOR v_rule IN
            SELECT r.id
            FROM card_alert_rules r
            LEFT JOIN cards c ON c.id = p_card_id
            LEFT JOIN pipeline_stages s ON s.id = c.pipeline_stage_id
            WHERE r.is_active = true
              AND r.trigger_mode = 'on_card_open'
              AND r.org_id = v_card_org
              AND (r.pipeline_id IS NULL OR r.pipeline_id = c.pipeline_id)
              AND (r.stage_id IS NULL OR r.stage_id = c.pipeline_stage_id)
              AND (r.phase_id IS NULL OR r.phase_id = s.phase_id)
              AND (r.product IS NULL OR r.product = c.produto::TEXT)
        LOOP
            BEGIN
                PERFORM public.generate_card_alerts(v_rule.id, p_card_id);
                v_alerts_created := v_alerts_created + 1;
            EXCEPTION WHEN OTHERS THEN
                RAISE NOTICE 'record_card_open rule % falhou: %', v_rule.id, SQLERRM;
            END;
        END LOOP;
    END IF;

    RETURN jsonb_build_object(
        'is_first_open', v_is_first_open,
        'alerts_triggered', v_alerts_created
    );
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.record_card_open(uuid) TO authenticated;

COMMENT ON FUNCTION public.record_card_open(uuid) IS
'Registra que o usuário autenticado abriu um card. Se é a primeira vez, '
'aciona regras de alerta com trigger_mode=on_card_open. Idempotente: '
'chamar múltiplas vezes só atualiza open_count, só a 1ª cria alertas.';
