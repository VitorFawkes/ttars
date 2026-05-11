-- ============================================================================
-- MIGRATION: Alertas de conferência de campos por etapa
-- Date: 2026-04-08
--
-- Cria tabela stage_field_confirmations que generaliza o TripDateConfirmModal.
-- Admin configura por etapa quais campos do card precisam ser confirmados
-- visualmente antes da movimentação (ex: data da viagem ao entrar em Pós-venda).
--
-- Seed: para cada pipeline com produto='TRIPS', insere a regra default de
-- confirmação de data_exata_da_viagem na primeira etapa de Pós-venda,
-- preservando 1:1 o comportamento atual do TripDateConfirmModal legado.
-- ============================================================================

-- ─── 1. Tabela ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.stage_field_confirmations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL DEFAULT public.requesting_org_id() REFERENCES public.organizations(id) ON DELETE CASCADE,
    stage_id UUID NOT NULL REFERENCES public.pipeline_stages(id) ON DELETE CASCADE,
    field_key TEXT NOT NULL,
    field_label TEXT,
    ordem INT NOT NULL DEFAULT 0,
    ativo BOOLEAN NOT NULL DEFAULT true,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (stage_id, field_key)
);

COMMENT ON TABLE public.stage_field_confirmations IS
'Regras de confirmação visual de campos ao mover card para uma etapa. '
'Ao entrar na etapa, a UI abre um modal pedindo para o usuário verificar os valores antes de concluir a movimentação.';

COMMENT ON COLUMN public.stage_field_confirmations.field_key IS
'Chave do campo (ex: data_exata_da_viagem, valor_final, destinos). Resolvido no frontend via getCardFieldValue.';

COMMENT ON COLUMN public.stage_field_confirmations.field_label IS
'Override opcional do label exibido no modal. Se null, usa o label do fieldRegistry/system_fields.';

CREATE INDEX IF NOT EXISTS idx_stage_field_conf_stage
    ON public.stage_field_confirmations(stage_id)
    WHERE ativo = true;

-- ─── 2. updated_at trigger ──────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.stage_field_confirmations_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.atualizado_em := now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_stage_field_confirmations_updated_at ON public.stage_field_confirmations;
CREATE TRIGGER trg_stage_field_confirmations_updated_at
    BEFORE UPDATE ON public.stage_field_confirmations
    FOR EACH ROW
    EXECUTE FUNCTION public.stage_field_confirmations_set_updated_at();

-- ─── 3. RLS ─────────────────────────────────────────────────────────────────

ALTER TABLE public.stage_field_confirmations ENABLE ROW LEVEL SECURITY;

-- Leitura: qualquer membro da org (modal aparece pra usuários comuns movendo cards)
DROP POLICY IF EXISTS "Members read org stage field confirmations" ON public.stage_field_confirmations;
CREATE POLICY "Members read org stage field confirmations"
    ON public.stage_field_confirmations FOR SELECT
    USING (org_id = public.requesting_org_id());

-- Escrita: só admin da org
DROP POLICY IF EXISTS "Admins insert stage field confirmations" ON public.stage_field_confirmations;
CREATE POLICY "Admins insert stage field confirmations"
    ON public.stage_field_confirmations FOR INSERT
    WITH CHECK (
        org_id = public.requesting_org_id()
        AND EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND is_admin = true
        )
    );

DROP POLICY IF EXISTS "Admins update stage field confirmations" ON public.stage_field_confirmations;
CREATE POLICY "Admins update stage field confirmations"
    ON public.stage_field_confirmations FOR UPDATE
    USING (
        org_id = public.requesting_org_id()
        AND EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND is_admin = true
        )
    );

DROP POLICY IF EXISTS "Admins delete stage field confirmations" ON public.stage_field_confirmations;
CREATE POLICY "Admins delete stage field confirmations"
    ON public.stage_field_confirmations FOR DELETE
    USING (
        org_id = public.requesting_org_id()
        AND EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND is_admin = true
        )
    );

-- ─── 4. Seed — preservar comportamento do TripDateConfirmModal legado ──────

-- Para cada pipeline TRIPS, encontra a primeira etapa da primeira fase de Pós-venda
-- e insere a regra de confirmação da data da viagem.
-- org_id é resolvido via lookup (staging não tem pipelines.org_id ainda; produção tem).
DO $$
DECLARE
    default_org UUID;
BEGIN
    -- Welcome Group é a org default em ambos os ambientes (staging e produção).
    SELECT id INTO default_org
    FROM public.organizations
    WHERE name = 'Welcome Group'
    LIMIT 1;

    IF default_org IS NULL THEN
        SELECT id INTO default_org FROM public.organizations ORDER BY created_at ASC LIMIT 1;
    END IF;

    IF default_org IS NULL THEN
        RAISE NOTICE 'Nenhuma organização encontrada; pulando seed.';
        RETURN;
    END IF;

    INSERT INTO public.stage_field_confirmations (org_id, stage_id, field_key, field_label, ordem)
    SELECT
        default_org,
        fpvs.id,
        'data_exata_da_viagem',
        'Data Viagem c/ Welcome',
        0
    FROM public.pipelines pip
    CROSS JOIN LATERAL (
        SELECT s.id
        FROM public.pipeline_stages s
        JOIN public.pipeline_phases ph ON ph.id = s.phase_id
        WHERE s.pipeline_id = pip.id
          AND ph.slug = 'pos_venda'
          AND s.ativo = true
        ORDER BY s.ordem ASC
        LIMIT 1
    ) AS fpvs
    WHERE pip.produto::TEXT = 'TRIPS'
    ON CONFLICT (stage_id, field_key) DO NOTHING;
END $$;
