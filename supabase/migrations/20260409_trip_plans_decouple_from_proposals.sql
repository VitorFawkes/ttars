-- ============================================================================
-- MIGRATION: Desacoplar trip plans de proposals
-- Date: 2026-04-09
--
-- ANTES: proposal_trip_plans depende obrigatoriamente de proposals
--   → impossível criar portal sem proposta aceita
--
-- DEPOIS: proposal_trip_plans tem card_id (NOT NULL) + proposal_id (NULLABLE)
--   → portal pode ser criado direto do card OU via proposta aceita
--   → token público próprio (não depende de proposals.public_token)
--
-- Dois caminhos de criação:
-- 1. COM proposta: proposta aceita → trigger cria trip_plan → importa items
-- 2. SEM proposta: operador clica "Criar Portal" no card → trip_plan vazio
-- ============================================================================

-- ─── 1. Adicionar colunas ───────────────────────────────────────────────────

-- card_id: entidade central (toda viagem pertence a um card)
ALTER TABLE public.proposal_trip_plans
    ADD COLUMN IF NOT EXISTS card_id UUID REFERENCES cards(id) ON DELETE CASCADE;

-- public_token: token próprio do portal (independente da proposta)
ALTER TABLE public.proposal_trip_plans
    ADD COLUMN IF NOT EXISTS public_token TEXT UNIQUE;

-- Tornar proposal_id nullable (portal pode existir sem proposta)
ALTER TABLE public.proposal_trip_plans
    ALTER COLUMN proposal_id DROP NOT NULL;

-- ─── 2. Popular card_id para dados existentes ──────────────────────────────

-- Para trip_plans que já existem (vieram de propostas), inferir card_id
UPDATE public.proposal_trip_plans tp
SET card_id = p.card_id
FROM public.proposals p
WHERE tp.proposal_id = p.id
  AND tp.card_id IS NULL
  AND p.card_id IS NOT NULL;

-- Gerar token para trip_plans existentes que não têm
UPDATE public.proposal_trip_plans
SET public_token = substr(md5(random()::text || id::text), 1, 12)
WHERE public_token IS NULL;

-- ─── 3. Constraint: card_id obrigatório para novos registros ────────────────

-- Nota: não podemos fazer NOT NULL diretamente se houver dados sem card_id
-- (trip_plans de propostas sem card). Aplicamos via CHECK constraint.
DO $$
BEGIN
    -- Se todos os trip_plans já têm card_id, tornar NOT NULL
    IF NOT EXISTS (
        SELECT 1 FROM public.proposal_trip_plans WHERE card_id IS NULL
    ) THEN
        ALTER TABLE public.proposal_trip_plans
            ALTER COLUMN card_id SET NOT NULL;
        RAISE NOTICE 'card_id definido como NOT NULL';
    ELSE
        RAISE NOTICE 'Existem trip_plans sem card_id — mantendo nullable por hora';
    END IF;
END $$;

-- Índices
CREATE INDEX IF NOT EXISTS idx_trip_plans_card_id
    ON public.proposal_trip_plans(card_id);
CREATE INDEX IF NOT EXISTS idx_trip_plans_public_token
    ON public.proposal_trip_plans(public_token)
    WHERE public_token IS NOT NULL;

-- ─── 4. Trigger: auto-gerar token antes de INSERT ──────────────────────────

CREATE OR REPLACE FUNCTION public.auto_generate_trip_plan_token()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.public_token IS NULL THEN
        NEW.public_token := substr(md5(random()::text || NEW.id::text || now()::text), 1, 12);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_auto_trip_plan_token ON public.proposal_trip_plans;
CREATE TRIGGER trg_auto_trip_plan_token
    BEFORE INSERT ON public.proposal_trip_plans
    FOR EACH ROW
    EXECUTE FUNCTION public.auto_generate_trip_plan_token();

-- ─── 5. Atualizar trigger auto_create_trip_plan ─────────────────────────────
-- Agora preenche card_id também

CREATE OR REPLACE FUNCTION public.auto_create_trip_plan()
RETURNS TRIGGER AS $$
DECLARE
    v_card_id UUID;
    v_org_id UUID;
    v_timeline JSONB := '[]'::jsonb;
BEGIN
    IF NEW.status <> 'accepted' THEN RETURN NEW; END IF;
    IF OLD.status = 'accepted' THEN RETURN NEW; END IF;

    SELECT card_id, org_id INTO v_card_id, v_org_id
    FROM proposals WHERE id = NEW.id;

    IF v_card_id IS NULL THEN RETURN NEW; END IF;

    -- Montar timeline esqueleto
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'title', pi.title, 'type', pi.item_type,
        'description', pi.description, 'notes', ''
    )), '[]'::jsonb)
    INTO v_timeline
    FROM proposal_sections ps
    JOIN proposal_items pi ON pi.section_id = ps.id
    WHERE ps.version_id = NEW.active_version_id AND ps.visible = true;

    INSERT INTO proposal_trip_plans (
        org_id, proposal_id, card_id, timeline
    ) VALUES (
        COALESCE(v_org_id, requesting_org_id()),
        NEW.id,
        v_card_id,
        v_timeline
    ) ON CONFLICT (proposal_id) DO NOTHING;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ─── 6. Nova RPC: get_trip_portal_by_token ──────────────────────────────────
-- Busca portal pelo token PRÓPRIO do trip_plan (não da proposta)

CREATE OR REPLACE FUNCTION public.get_trip_portal_by_token(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_trip_plan_id UUID;
    v_info JSONB;
    v_blocks JSONB;
    v_approvals JSONB;
    v_pending_count INT;
BEGIN
    -- Buscar trip plan pelo token próprio
    SELECT tp.id,
           jsonb_build_object(
               'trip_plan_id', tp.id,
               'trip_plan_status', tp.status,
               'card_id', tp.card_id,
               'proposal_id', tp.proposal_id,
               'title', COALESCE(pv.title, c.titulo),
               'accepted_at', p.accepted_at
           )
    INTO v_trip_plan_id, v_info
    FROM proposal_trip_plans tp
    LEFT JOIN proposals p ON p.id = tp.proposal_id
    LEFT JOIN proposal_versions pv ON pv.id = p.active_version_id
    LEFT JOIN cards c ON c.id = tp.card_id
    WHERE tp.public_token = p_token
    LIMIT 1;

    IF v_trip_plan_id IS NULL THEN
        RETURN jsonb_build_object('error', 'Portal não encontrado');
    END IF;

    -- Blocos publicados
    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'id', b.id, 'block_type', b.block_type,
            'parent_day_id', b.parent_day_id, 'ordem', b.ordem,
            'data', b.data, 'published_at', b.published_at
        ) ORDER BY b.ordem
    ), '[]'::jsonb)
    INTO v_blocks
    FROM trip_plan_blocks b
    WHERE b.trip_plan_id = v_trip_plan_id AND b.is_published = true;

    -- Aprovações pendentes
    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'id', a.id, 'title', a.title, 'description', a.description,
            'approval_data', a.approval_data, 'status', a.status,
            'created_at', a.created_at
        ) ORDER BY a.created_at DESC
    ), '[]'::jsonb)
    INTO v_approvals
    FROM trip_plan_approvals a
    WHERE a.trip_plan_id = v_trip_plan_id AND a.status = 'pending';

    SELECT COUNT(*) INTO v_pending_count
    FROM trip_plan_approvals
    WHERE trip_plan_id = v_trip_plan_id AND status = 'pending';

    RETURN jsonb_build_object(
        'proposal', v_info,
        'blocks', v_blocks,
        'approvals', v_approvals,
        'pending_count', v_pending_count
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_trip_portal_by_token(TEXT) TO anon, authenticated;

-- ─── 7. RLS: acesso público via trip_plan.public_token ──────────────────────

-- Anon pode ler trip_plans pelo token público
DROP POLICY IF EXISTS "Public read trip plan by token" ON public.proposal_trip_plans;
CREATE POLICY "Public read trip plan by token"
    ON public.proposal_trip_plans FOR SELECT
    USING (
        public_token IS NOT NULL
        OR org_id = requesting_org_id()
    );

-- ─── 8. Rota pública separada para portal ──────────────────────────────────
-- Frontend vai usar /v/:token para portal da viagem
-- Mantém /p/:token para propostas (backward compatible)
-- A RPC get_trip_portal_by_token busca por trip_plans.public_token
