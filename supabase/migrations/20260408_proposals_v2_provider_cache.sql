-- ============================================================================
-- MIGRATION: Provider cache + colunas de enriquecimento em proposal_items
-- Date: 2026-04-08
--
-- Suporta a camada de Providers (SerpAPI Google Hotels, AeroDataBox)
-- usada pelo builder de propostas v2.
--
-- 1. provider_cache: cache key/payload por provider, com TTL
--    Reduz custo das APIs externas (cache 30 dias hotel, 24h voo)
--
-- 2. proposal_items: colunas para rastrear origem do enriquecimento
--    Permite resync sob demanda e debugging
-- ============================================================================

-- ─── 1. provider_cache ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.provider_cache (
    provider TEXT NOT NULL,
    cache_key TEXT NOT NULL,
    payload JSONB NOT NULL,
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (provider, cache_key)
);

COMMENT ON TABLE public.provider_cache IS
'Cache key/payload das APIs de enriquecimento (SerpAPI Google Hotels, AeroDataBox, etc). '
'Reduz custos e latência. Edge functions consultam aqui antes de bater na API externa.';

CREATE INDEX IF NOT EXISTS idx_provider_cache_expires
    ON public.provider_cache(expires_at);

-- RLS: apenas service_role lê/escreve. Frontend nunca toca diretamente —
-- sempre via Edge Function que usa service role.
ALTER TABLE public.provider_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role manages provider cache" ON public.provider_cache;
CREATE POLICY "Service role manages provider cache"
    ON public.provider_cache FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

-- ─── 2. proposal_items: rastreio de enriquecimento ──────────────────────────
-- Guard com DO block: a tabela proposal_items pode não existir no staging
-- (esquema de propostas só está em produção). Em staging, a migration passa
-- silenciosamente; em produção adiciona as colunas.

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'proposal_items'
    ) THEN
        ALTER TABLE public.proposal_items
            ADD COLUMN IF NOT EXISTS external_provider TEXT,
            ADD COLUMN IF NOT EXISTS external_id TEXT,
            ADD COLUMN IF NOT EXISTS enrichment_last_sync TIMESTAMPTZ;

        COMMENT ON COLUMN public.proposal_items.external_provider IS
        'Provider que originou os dados deste item (ex: serpapi_google_hotels, aerodatabox, manual). NULL = manual.';

        COMMENT ON COLUMN public.proposal_items.external_id IS
        'ID opaco do item no provider externo. Usado para resync sob demanda.';

        COMMENT ON COLUMN public.proposal_items.enrichment_last_sync IS
        'Timestamp do último sync com o provider. NULL = nunca sincronizado.';

        CREATE INDEX IF NOT EXISTS idx_proposal_items_external_provider
            ON public.proposal_items(external_provider)
            WHERE external_provider IS NOT NULL;
    ELSE
        RAISE NOTICE 'proposal_items não existe neste ambiente (provavelmente staging) — pulando ALTER TABLE';
    END IF;
END $$;
