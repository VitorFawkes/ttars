-- ============================================================================
-- MIGRATION: proposal_trip_plans — portal pós-venda "Minha Viagem"
-- Date: 2026-04-08
--
-- Quando uma proposta é aceita, o mesmo link /p/:token evolui de proposta
-- para o portal da viagem do cliente. Esta tabela armazena os dados do
-- portal: timeline dia-a-dia, vouchers, contatos de emergência e checklist.
--
-- O trigger auto_create_trip_plan cria uma linha esqueleto baseada nos
-- itens aceitos pelo cliente.
-- ============================================================================

-- ─── 1. Tabela ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.proposal_trip_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL DEFAULT requesting_org_id() REFERENCES organizations(id),
    proposal_id UUID NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'completed', 'cancelled')),

    -- Dados do portal (operador preenche via editor interno)
    timeline JSONB NOT NULL DEFAULT '[]'::jsonb,
    vouchers JSONB NOT NULL DEFAULT '[]'::jsonb,
    contacts JSONB NOT NULL DEFAULT '[]'::jsonb,
    checklist JSONB NOT NULL DEFAULT '[]'::jsonb,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE (proposal_id) -- 1 proposta → 1 trip plan
);

COMMENT ON TABLE public.proposal_trip_plans IS
'Portal pós-venda "Minha Viagem". Criado automaticamente quando proposta é aceita. '
'Cliente acessa via mesmo /p/:token (renderiza TripPlanView em vez de ProposalView).';

-- ─── 2. updated_at trigger ──────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.trip_plan_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_trip_plan_updated_at ON public.proposal_trip_plans;
CREATE TRIGGER trg_trip_plan_updated_at
    BEFORE UPDATE ON public.proposal_trip_plans
    FOR EACH ROW
    EXECUTE FUNCTION public.trip_plan_set_updated_at();

-- ─── 3. Auto-create trip plan when proposal accepted ────────────────────────

CREATE OR REPLACE FUNCTION public.auto_create_trip_plan()
RETURNS TRIGGER AS $$
DECLARE
    v_org_id UUID;
    v_timeline JSONB := '[]'::jsonb;
BEGIN
    -- Só dispara na transição para 'accepted'
    IF NEW.status <> 'accepted' THEN
        RETURN NEW;
    END IF;
    IF OLD.status = 'accepted' THEN
        RETURN NEW; -- já era accepted, não recriar
    END IF;

    -- Obter org_id da proposta
    SELECT org_id INTO v_org_id FROM proposals WHERE id = NEW.id;

    -- Montar timeline esqueleto a partir dos itens da versão ativa
    -- Cada item aceito vira uma entrada na timeline
    SELECT jsonb_agg(jsonb_build_object(
        'title', pi.title,
        'type', pi.item_type,
        'description', pi.description,
        'notes', ''
    ))
    INTO v_timeline
    FROM proposal_sections ps
    JOIN proposal_items pi ON pi.section_id = ps.id
    WHERE ps.version_id = NEW.active_version_id
      AND ps.visible = true;

    IF v_timeline IS NULL THEN
        v_timeline := '[]'::jsonb;
    END IF;

    -- Criar trip plan (ignore conflict caso já exista)
    INSERT INTO proposal_trip_plans (org_id, proposal_id, timeline)
    VALUES (COALESCE(v_org_id, requesting_org_id()), NEW.id, v_timeline)
    ON CONFLICT (proposal_id) DO NOTHING;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Guard: só criar trigger se tabela proposals existe neste ambiente
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'proposals'
    ) THEN
        DROP TRIGGER IF EXISTS trg_auto_create_trip_plan ON public.proposals;
        CREATE TRIGGER trg_auto_create_trip_plan
            AFTER UPDATE ON public.proposals
            FOR EACH ROW
            WHEN (OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'accepted')
            EXECUTE FUNCTION public.auto_create_trip_plan();
    ELSE
        RAISE NOTICE 'proposals não existe neste ambiente — pulando trigger';
    END IF;
END $$;

-- ─── 4. RLS ─────────────────────────────────────────────────────────────────

ALTER TABLE public.proposal_trip_plans ENABLE ROW LEVEL SECURITY;

-- Autenticados: CRUD na própria org
DROP POLICY IF EXISTS "Members manage trip plans" ON public.proposal_trip_plans;
CREATE POLICY "Members manage trip plans"
    ON public.proposal_trip_plans FOR ALL
    USING (org_id = requesting_org_id())
    WITH CHECK (org_id = requesting_org_id());

-- Anon: leitura via token público (mesmo mecanismo das propostas)
-- Guard: proposals.public_token pode não existir no staging
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'proposals' AND column_name = 'public_token'
    ) THEN
        EXECUTE 'DROP POLICY IF EXISTS "Public read trip plan via token" ON public.proposal_trip_plans';
        EXECUTE '
            CREATE POLICY "Public read trip plan via token"
                ON public.proposal_trip_plans FOR SELECT
                USING (
                    EXISTS (
                        SELECT 1 FROM proposals p
                        WHERE p.id = proposal_trip_plans.proposal_id
                          AND p.public_token IS NOT NULL
                          AND p.status = ''accepted''
                    )
                )';
    ELSE
        RAISE NOTICE 'proposals.public_token não existe — pulando policy anon';
    END IF;
END $$;

-- ─── 5. RPC para leitura pública ───────────────────────────────────────────
-- Guard: depende de proposals.public_token

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'proposals' AND column_name = 'public_token'
    ) THEN
        EXECUTE $func$
            CREATE OR REPLACE FUNCTION public.get_trip_plan_by_token(p_token TEXT)
            RETURNS JSONB
            LANGUAGE plpgsql
            SECURITY DEFINER
            SET search_path = public
            AS $inner$
            DECLARE
                v_result JSONB;
            BEGIN
                SELECT jsonb_build_object(
                    'id', tp.id,
                    'proposal_id', tp.proposal_id,
                    'status', tp.status,
                    'timeline', tp.timeline,
                    'vouchers', tp.vouchers,
                    'contacts', tp.contacts,
                    'checklist', tp.checklist,
                    'updated_at', tp.updated_at,
                    'proposal', jsonb_build_object(
                        'id', p.id,
                        'status', p.status,
                        'accepted_at', p.accepted_at,
                        'title', pv.title,
                        'metadata', pv.metadata
                    )
                )
                INTO v_result
                FROM proposal_trip_plans tp
                JOIN proposals p ON p.id = tp.proposal_id
                LEFT JOIN proposal_versions pv ON pv.id = p.active_version_id
                WHERE p.public_token = p_token
                  AND p.status = 'accepted'
                LIMIT 1;

                IF v_result IS NULL THEN
                    RETURN jsonb_build_object('error', 'Plano não encontrado');
                END IF;

                RETURN v_result;
            END;
            $inner$;
        $func$;
        GRANT EXECUTE ON FUNCTION public.get_trip_plan_by_token(TEXT) TO anon, authenticated;
    ELSE
        RAISE NOTICE 'proposals.public_token não existe — pulando RPC get_trip_plan_by_token';
    END IF;
END $$;
