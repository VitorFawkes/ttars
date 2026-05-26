-- ============================================================================
-- MIGRATION: Proposal Recipients — destinatários identificáveis por proposta
-- Date: 2026-05-26
--
-- Hoje proposals.public_token é 1 link genérico que qualquer um abre. Pra
-- conseguir (a) personalizar a tela do cliente, (b) registrar pra quem o
-- consultor enviou, (c) rastrear quem abriu e (d) ter segurança via link
-- único por pessoa, criamos a tabela proposal_recipients (N por proposta).
--
-- Cada recipient tem seu próprio recipient_token. Quando o cliente abre o
-- link, o frontend resolve via RPC e identifica o contato vinculado.
--
-- Backward compat: propostas existentes continuam acessíveis via
-- proposals.public_token (caminho legado). Só novos envios criam recipients.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1) TABELA
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.proposal_recipients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    proposal_id UUID NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
    contato_id UUID NOT NULL REFERENCES public.contatos(id) ON DELETE CASCADE,
    recipient_token TEXT NOT NULL UNIQUE,
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    sent_at TIMESTAMPTZ,
    sent_via TEXT CHECK (sent_via IN ('whatsapp','email','manual') OR sent_via IS NULL),
    first_opened_at TIMESTAMPTZ,
    last_opened_at TIMESTAMPTZ,
    open_count INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by UUID REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_proposal_recipients_proposal
    ON public.proposal_recipients(proposal_id);

CREATE INDEX IF NOT EXISTS idx_proposal_recipients_token
    ON public.proposal_recipients(recipient_token);

CREATE INDEX IF NOT EXISTS idx_proposal_recipients_contato
    ON public.proposal_recipients(contato_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_proposal_recipients_unique
    ON public.proposal_recipients(proposal_id, contato_id);

COMMENT ON TABLE public.proposal_recipients IS
'Destinatários identificáveis de uma proposta. Cada linha = 1 contato com seu próprio recipient_token. Permite personalização, rastreio e registro de envio.';

COMMENT ON COLUMN public.proposal_recipients.recipient_token IS
'Token único usado em /p/{token} pra rastrear quem abriu sem fricção.';

COMMENT ON COLUMN public.proposal_recipients.is_primary IS
'Quando TRUE, esse é o destinatário principal (ex: titular do card). UI destaca ele.';

COMMENT ON COLUMN public.proposal_recipients.sent_at IS
'Quando o consultor marcou que enviou a proposta pra esse destinatário.';

COMMENT ON COLUMN public.proposal_recipients.sent_via IS
'Canal usado pelo consultor pra enviar (whatsapp/email/manual). NULL = não enviado.';

-- ----------------------------------------------------------------------------
-- 2) TRIGGER: gerar recipient_token automaticamente (reusa função existente)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.auto_generate_recipient_token()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.recipient_token IS NULL OR NEW.recipient_token = '' THEN
        -- Reusa função já existente de geração de token aleatório.
        NEW.recipient_token := public.generate_proposal_public_token();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_auto_generate_recipient_token ON public.proposal_recipients;
CREATE TRIGGER trg_auto_generate_recipient_token
    BEFORE INSERT ON public.proposal_recipients
    FOR EACH ROW
    EXECUTE FUNCTION public.auto_generate_recipient_token();

-- ----------------------------------------------------------------------------
-- 3) TRIGGER: forçar org_id consistente com a proposta pai
-- (regra CLAUDE.md: FK cross-org é bomba — evitar via trigger BEFORE)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_proposal_recipient_org_consistency()
RETURNS TRIGGER AS $$
DECLARE
    v_proposal_org_id UUID;
BEGIN
    SELECT org_id INTO v_proposal_org_id
    FROM public.proposals
    WHERE id = NEW.proposal_id;

    IF v_proposal_org_id IS NULL THEN
        RAISE EXCEPTION 'Proposta % não encontrada', NEW.proposal_id;
    END IF;

    -- Força o org_id do recipient = org_id da proposta pai.
    NEW.org_id := v_proposal_org_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enforce_proposal_recipient_org ON public.proposal_recipients;
CREATE TRIGGER trg_enforce_proposal_recipient_org
    BEFORE INSERT OR UPDATE ON public.proposal_recipients
    FOR EACH ROW
    EXECUTE FUNCTION public.enforce_proposal_recipient_org_consistency();

-- ----------------------------------------------------------------------------
-- 4) RLS
-- ----------------------------------------------------------------------------
ALTER TABLE public.proposal_recipients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS proposal_recipients_org_all ON public.proposal_recipients;
CREATE POLICY proposal_recipients_org_all ON public.proposal_recipients
    FOR ALL TO authenticated
    USING (org_id = public.requesting_org_id())
    WITH CHECK (org_id = public.requesting_org_id());

DROP POLICY IF EXISTS proposal_recipients_service_all ON public.proposal_recipients;
CREATE POLICY proposal_recipients_service_all ON public.proposal_recipients
    FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);

-- ----------------------------------------------------------------------------
-- 5) RPC: register_recipient_open
-- Frontend público chama quando o cliente abre o link /p/{recipient_token}.
-- Atualiza first_opened_at, last_opened_at, open_count.
-- Retorna o contato vinculado pra personalizar a tela.
-- SECURITY DEFINER porque o cliente público (anon) não tem RLS pra escrever.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.register_recipient_open(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_recipient public.proposal_recipients%ROWTYPE;
    v_contato public.contatos%ROWTYPE;
BEGIN
    SELECT * INTO v_recipient
    FROM public.proposal_recipients
    WHERE recipient_token = p_token;

    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    UPDATE public.proposal_recipients
    SET first_opened_at = COALESCE(first_opened_at, now()),
        last_opened_at = now(),
        open_count = open_count + 1
    WHERE id = v_recipient.id;

    SELECT * INTO v_contato
    FROM public.contatos
    WHERE id = v_recipient.contato_id;

    RETURN jsonb_build_object(
        'recipient_id', v_recipient.id,
        'proposal_id', v_recipient.proposal_id,
        'contato_id', v_recipient.contato_id,
        'nome', v_contato.nome,
        'sobrenome', v_contato.sobrenome,
        'email', v_contato.email
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.register_recipient_open(TEXT) TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- 6) RPC: resolve_proposal_token
-- Aceita tanto recipient_token (novo) quanto proposals.public_token (legacy).
-- Retorna jsonb com proposal_id + (opcional) info do recipient.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resolve_proposal_token(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_recipient_id UUID;
    v_proposal_id UUID;
    v_contato_id UUID;
    v_nome TEXT;
    v_sobrenome TEXT;
BEGIN
    -- 1) Tenta resolver como recipient_token (novo)
    SELECT pr.id, pr.proposal_id, pr.contato_id, c.nome, c.sobrenome
    INTO v_recipient_id, v_proposal_id, v_contato_id, v_nome, v_sobrenome
    FROM public.proposal_recipients pr
    JOIN public.contatos c ON c.id = pr.contato_id
    WHERE pr.recipient_token = p_token;

    IF FOUND THEN
        RETURN jsonb_build_object(
            'proposal_id', v_proposal_id,
            'recipient_id', v_recipient_id,
            'contato_id', v_contato_id,
            'nome', v_nome,
            'sobrenome', v_sobrenome,
            'via', 'recipient_token'
        );
    END IF;

    -- 2) Fallback: proposals.public_token (legacy)
    SELECT id INTO v_proposal_id
    FROM public.proposals
    WHERE public_token = p_token;

    IF FOUND THEN
        RETURN jsonb_build_object(
            'proposal_id', v_proposal_id,
            'via', 'public_token'
        );
    END IF;

    RETURN NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_proposal_token(TEXT) TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- 7) Coluna recipient_id em proposal_events (FK opcional)
-- Permite log granular de eventos por destinatário.
-- ----------------------------------------------------------------------------
ALTER TABLE public.proposal_events
    ADD COLUMN IF NOT EXISTS recipient_id UUID REFERENCES public.proposal_recipients(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_proposal_events_recipient
    ON public.proposal_events(recipient_id) WHERE recipient_id IS NOT NULL;

COMMENT ON COLUMN public.proposal_events.recipient_id IS
'Quando o evento veio de um link com recipient_token, identifica qual destinatário disparou. NULL pra eventos via public_token legacy.';

COMMIT;
