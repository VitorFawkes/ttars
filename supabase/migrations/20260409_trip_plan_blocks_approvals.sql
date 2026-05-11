-- ============================================================================
-- MIGRATION: Portal da Viagem v2 — Blocos, Aprovações, Extração de Vouchers
-- Date: 2026-04-09
--
-- Cria a infraestrutura normalizada para o portal pós-venda:
--
-- 1. trip_plan_blocks: Blocos do editor (dia, voucher, dica, foto, vídeo,
--    contato, checklist, seção pré-viagem, item da viagem)
--
-- 2. trip_plan_approvals: Itens pendentes de aprovação do cliente
--    (planner envia mudança → cliente aprova/recusa no portal)
--
-- 3. voucher_extractions: Log de extração IA de vouchers (auditoria)
--
-- 4. RPCs para acesso público (cliente via token)
-- ============================================================================

-- ─── 1. trip_plan_blocks ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.trip_plan_blocks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_plan_id UUID NOT NULL REFERENCES proposal_trip_plans(id) ON DELETE CASCADE,
    org_id UUID NOT NULL DEFAULT requesting_org_id() REFERENCES organizations(id),

    block_type TEXT NOT NULL CHECK (block_type IN (
        'day_header',       -- Cabeçalho de dia: "Dia 1 — 15/Jul — Roma"
        'travel_item',      -- Item da proposta aceita (hotel, voo, transfer, etc)
        'voucher',          -- Upload PDF/imagem de voucher
        'tip',              -- Dica de viagem (texto com formatação)
        'photo',            -- Upload de foto
        'video',            -- URL YouTube/Vimeo
        'contact',          -- Contato (nome, role, telefone, email, WhatsApp)
        'checklist',        -- Itens para o cliente marcar
        'pre_trip_section'  -- Template pré-viagem (docs, vistos, moeda)
    )),

    -- Hierarquia: blocos day_header são pais; outros blocos são filhos de um dia
    parent_day_id UUID REFERENCES trip_plan_blocks(id) ON DELETE CASCADE,

    ordem INT NOT NULL DEFAULT 0,

    -- Dados do bloco (schema varia por block_type)
    data JSONB NOT NULL DEFAULT '{}'::jsonb,

    -- Publicação: operador edita em draft, publica quando pronto
    is_published BOOLEAN NOT NULL DEFAULT false,
    published_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.trip_plan_blocks IS
'Blocos do portal da viagem. Cada bloco pertence a um trip_plan e opcionalmente '
'a um dia (parent_day_id). O operador monta via editor, publica para o cliente ver.';

-- Índices
CREATE INDEX IF NOT EXISTS idx_trip_plan_blocks_trip_plan
    ON public.trip_plan_blocks(trip_plan_id, ordem);
CREATE INDEX IF NOT EXISTS idx_trip_plan_blocks_parent_day
    ON public.trip_plan_blocks(parent_day_id)
    WHERE parent_day_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_trip_plan_blocks_published
    ON public.trip_plan_blocks(trip_plan_id, is_published)
    WHERE is_published = true;

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.trip_plan_blocks_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_trip_plan_blocks_updated_at ON public.trip_plan_blocks;
CREATE TRIGGER trg_trip_plan_blocks_updated_at
    BEFORE UPDATE ON public.trip_plan_blocks
    FOR EACH ROW EXECUTE FUNCTION public.trip_plan_blocks_set_updated_at();

-- RLS
ALTER TABLE public.trip_plan_blocks ENABLE ROW LEVEL SECURITY;

-- Operador: CRUD na própria org
DROP POLICY IF EXISTS "Members manage trip plan blocks" ON public.trip_plan_blocks;
CREATE POLICY "Members manage trip plan blocks"
    ON public.trip_plan_blocks FOR ALL
    USING (org_id = requesting_org_id())
    WITH CHECK (org_id = requesting_org_id());

-- Cliente anon: SELECT apenas blocos publicados (via join com proposals.public_token)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'proposals' AND column_name = 'public_token'
    ) THEN
        DROP POLICY IF EXISTS "Public read published blocks" ON public.trip_plan_blocks;
        CREATE POLICY "Public read published blocks"
            ON public.trip_plan_blocks FOR SELECT
            USING (
                is_published = true
                AND EXISTS (
                    SELECT 1
                    FROM proposal_trip_plans tp
                    JOIN proposals p ON p.id = tp.proposal_id
                    WHERE tp.id = trip_plan_blocks.trip_plan_id
                      AND p.status = 'accepted'
                      AND p.public_token IS NOT NULL
                )
            );
    END IF;
END $$;


-- ─── 2. trip_plan_approvals ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.trip_plan_approvals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_plan_id UUID NOT NULL REFERENCES proposal_trip_plans(id) ON DELETE CASCADE,
    org_id UUID NOT NULL DEFAULT requesting_org_id() REFERENCES organizations(id),

    -- Referência ao bloco (pode ser NULL se o bloco foi deletado)
    block_id UUID REFERENCES trip_plan_blocks(id) ON DELETE SET NULL,

    -- O que está sendo proposto
    title TEXT NOT NULL,
    description TEXT,
    approval_data JSONB NOT NULL DEFAULT '{}'::jsonb,

    -- Estado
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    client_notes TEXT,
    resolved_at TIMESTAMPTZ,

    created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.trip_plan_approvals IS
'Itens pendentes de aprovação do cliente. O planner cria, o cliente aprova/recusa '
'via /p/:token na aba Pendente.';

CREATE INDEX IF NOT EXISTS idx_trip_plan_approvals_pending
    ON public.trip_plan_approvals(trip_plan_id, status)
    WHERE status = 'pending';

-- RLS
ALTER TABLE public.trip_plan_approvals ENABLE ROW LEVEL SECURITY;

-- Operador: CRUD na própria org
DROP POLICY IF EXISTS "Members manage approvals" ON public.trip_plan_approvals;
CREATE POLICY "Members manage approvals"
    ON public.trip_plan_approvals FOR ALL
    USING (org_id = requesting_org_id())
    WITH CHECK (org_id = requesting_org_id());

-- Cliente anon: SELECT pendentes + UPDATE (aprovar/recusar) via RPC
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'proposals' AND column_name = 'public_token'
    ) THEN
        DROP POLICY IF EXISTS "Public read pending approvals" ON public.trip_plan_approvals;
        CREATE POLICY "Public read pending approvals"
            ON public.trip_plan_approvals FOR SELECT
            USING (
                EXISTS (
                    SELECT 1
                    FROM proposal_trip_plans tp
                    JOIN proposals p ON p.id = tp.proposal_id
                    WHERE tp.id = trip_plan_approvals.trip_plan_id
                      AND p.status = 'accepted'
                      AND p.public_token IS NOT NULL
                )
            );
    END IF;
END $$;


-- ─── 3. voucher_extractions ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.voucher_extractions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_plan_id UUID NOT NULL REFERENCES proposal_trip_plans(id) ON DELETE CASCADE,
    org_id UUID NOT NULL DEFAULT requesting_org_id() REFERENCES organizations(id),

    file_url TEXT NOT NULL,
    file_name TEXT NOT NULL,
    voucher_type TEXT CHECK (voucher_type IN ('hotel', 'flight', 'transfer', 'experience', 'generic')),

    -- Resultado da IA
    extracted_data JSONB,
    confidence FLOAT,
    extraction_error TEXT,

    -- Confirmação do operador
    operator_confirmed BOOLEAN NOT NULL DEFAULT false,
    confirmed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.voucher_extractions IS
'Log de extração IA de vouchers. Cada upload gera um registro para auditoria '
'e retry. O operador confirma os dados extraídos antes de publicar.';

CREATE INDEX IF NOT EXISTS idx_voucher_extractions_trip_plan
    ON public.voucher_extractions(trip_plan_id);

-- RLS: apenas operador (service_role para edge functions)
ALTER TABLE public.voucher_extractions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members manage voucher extractions" ON public.voucher_extractions;
CREATE POLICY "Members manage voucher extractions"
    ON public.voucher_extractions FOR ALL
    USING (org_id = requesting_org_id())
    WITH CHECK (org_id = requesting_org_id());


-- ─── 4. RPCs para acesso público ────────────────────────────────────────────

-- RPC: Buscar portal completo por token (blocos publicados + approvals pendentes)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'proposals' AND column_name = 'public_token'
    ) THEN
        EXECUTE $func$
            CREATE OR REPLACE FUNCTION public.get_portal_by_token(p_token TEXT)
            RETURNS JSONB
            LANGUAGE plpgsql
            SECURITY DEFINER
            SET search_path = public
            AS $inner$
            DECLARE
                v_trip_plan_id UUID;
                v_proposal JSONB;
                v_blocks JSONB;
                v_approvals JSONB;
                v_pending_count INT;
            BEGIN
                -- Buscar trip plan via token
                SELECT tp.id,
                       jsonb_build_object(
                           'id', p.id,
                           'status', p.status,
                           'accepted_at', p.accepted_at,
                           'title', pv.title,
                           'metadata', pv.metadata,
                           'trip_plan_id', tp.id,
                           'trip_plan_status', tp.status
                       )
                INTO v_trip_plan_id, v_proposal
                FROM proposal_trip_plans tp
                JOIN proposals p ON p.id = tp.proposal_id
                LEFT JOIN proposal_versions pv ON pv.id = p.active_version_id
                WHERE p.public_token = p_token
                  AND p.status = 'accepted'
                LIMIT 1;

                IF v_trip_plan_id IS NULL THEN
                    RETURN jsonb_build_object('error', 'Portal não encontrado');
                END IF;

                -- Blocos publicados (ordenados por parent → ordem)
                SELECT COALESCE(jsonb_agg(
                    jsonb_build_object(
                        'id', b.id,
                        'block_type', b.block_type,
                        'parent_day_id', b.parent_day_id,
                        'ordem', b.ordem,
                        'data', b.data,
                        'published_at', b.published_at
                    ) ORDER BY b.ordem
                ), '[]'::jsonb)
                INTO v_blocks
                FROM trip_plan_blocks b
                WHERE b.trip_plan_id = v_trip_plan_id
                  AND b.is_published = true;

                -- Aprovações pendentes
                SELECT COALESCE(jsonb_agg(
                    jsonb_build_object(
                        'id', a.id,
                        'title', a.title,
                        'description', a.description,
                        'approval_data', a.approval_data,
                        'status', a.status,
                        'created_at', a.created_at
                    ) ORDER BY a.created_at DESC
                ), '[]'::jsonb)
                INTO v_approvals
                FROM trip_plan_approvals a
                WHERE a.trip_plan_id = v_trip_plan_id
                  AND a.status = 'pending';

                SELECT COUNT(*) INTO v_pending_count
                FROM trip_plan_approvals
                WHERE trip_plan_id = v_trip_plan_id AND status = 'pending';

                RETURN jsonb_build_object(
                    'proposal', v_proposal,
                    'blocks', v_blocks,
                    'approvals', v_approvals,
                    'pending_count', v_pending_count
                );
            END;
            $inner$;
        $func$;
        GRANT EXECUTE ON FUNCTION public.get_portal_by_token(TEXT) TO anon, authenticated;
    ELSE
        RAISE NOTICE 'proposals.public_token não existe — pulando RPC get_portal_by_token';
    END IF;
END $$;

-- RPC: Cliente aprova/recusa item pendente (via token)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'proposals' AND column_name = 'public_token'
    ) THEN
        EXECUTE $func$
            CREATE OR REPLACE FUNCTION public.resolve_portal_approval(
                p_token TEXT,
                p_approval_id UUID,
                p_action TEXT,  -- 'approve' ou 'reject'
                p_notes TEXT DEFAULT NULL
            )
            RETURNS JSONB
            LANGUAGE plpgsql
            SECURITY DEFINER
            SET search_path = public
            AS $inner$
            DECLARE
                v_trip_plan_id UUID;
                v_approval_status TEXT;
                v_block_id UUID;
            BEGIN
                -- Validar token
                SELECT tp.id INTO v_trip_plan_id
                FROM proposal_trip_plans tp
                JOIN proposals p ON p.id = tp.proposal_id
                WHERE p.public_token = p_token AND p.status = 'accepted'
                LIMIT 1;

                IF v_trip_plan_id IS NULL THEN
                    RETURN jsonb_build_object('error', 'Portal não encontrado');
                END IF;

                -- Validar approval pertence ao trip plan
                SELECT status, block_id INTO v_approval_status, v_block_id
                FROM trip_plan_approvals
                WHERE id = p_approval_id AND trip_plan_id = v_trip_plan_id;

                IF v_approval_status IS NULL THEN
                    RETURN jsonb_build_object('error', 'Item não encontrado');
                END IF;

                IF v_approval_status <> 'pending' THEN
                    RETURN jsonb_build_object('error', 'Item já foi resolvido');
                END IF;

                IF p_action NOT IN ('approve', 'reject') THEN
                    RETURN jsonb_build_object('error', 'Ação inválida');
                END IF;

                -- Resolver
                UPDATE trip_plan_approvals
                SET status = CASE WHEN p_action = 'approve' THEN 'approved' ELSE 'rejected' END,
                    client_notes = p_notes,
                    resolved_at = now()
                WHERE id = p_approval_id;

                -- Se aprovado e tem block_id, publicar o bloco
                IF p_action = 'approve' AND v_block_id IS NOT NULL THEN
                    UPDATE trip_plan_blocks
                    SET is_published = true,
                        published_at = now()
                    WHERE id = v_block_id;
                END IF;

                RETURN jsonb_build_object('ok', true, 'action', p_action);
            END;
            $inner$;
        $func$;
        GRANT EXECUTE ON FUNCTION public.resolve_portal_approval(TEXT, UUID, TEXT, TEXT) TO anon, authenticated;
    ELSE
        RAISE NOTICE 'proposals.public_token não existe — pulando RPC resolve_portal_approval';
    END IF;
END $$;


-- ─── 5. Supabase Storage bucket para vouchers ──────────────────────────────

-- Nota: buckets são criados via Dashboard ou API, não via SQL.
-- Bucket necessário: "trip-plan-assets" (público, para vouchers, fotos, etc)
-- O operador deve criar manualmente se não existir:
--   INSERT INTO storage.buckets (id, name, public) VALUES ('trip-plan-assets', 'trip-plan-assets', true);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'trip-plan-assets') THEN
        INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
        VALUES (
            'trip-plan-assets',
            'trip-plan-assets',
            true,
            52428800, -- 50MB
            ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf', 'video/mp4']
        );
        RAISE NOTICE 'Bucket trip-plan-assets criado';
    ELSE
        RAISE NOTICE 'Bucket trip-plan-assets já existe';
    END IF;
END $$;

-- Storage RLS: operador pode upload, público pode ler
DROP POLICY IF EXISTS "Authenticated users upload trip plan assets" ON storage.objects;
CREATE POLICY "Authenticated users upload trip plan assets"
    ON storage.objects FOR INSERT
    WITH CHECK (bucket_id = 'trip-plan-assets' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Public read trip plan assets" ON storage.objects;
CREATE POLICY "Public read trip plan assets"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'trip-plan-assets');

DROP POLICY IF EXISTS "Authenticated users delete trip plan assets" ON storage.objects;
CREATE POLICY "Authenticated users delete trip plan assets"
    ON storage.objects FOR DELETE
    USING (bucket_id = 'trip-plan-assets' AND auth.role() = 'authenticated');
