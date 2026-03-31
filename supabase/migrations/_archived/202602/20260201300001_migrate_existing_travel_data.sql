-- Migration: Migrate Existing Travel Data to New Flexible Format
-- Description: Converts existing epoca_viagem and orcamento data to new flexible schema

-- ============================================================================
-- 1. MIGRATE EXISTING EPOCA_VIAGEM DATA
-- ============================================================================

-- Update cards that have legacy epoca_viagem format (with inicio/fim but no tipo)
UPDATE cards
SET produto_data = jsonb_set(
    COALESCE(produto_data, '{}'::jsonb),
    '{epoca_viagem}',
    jsonb_build_object(
        'tipo', 'data_exata',
        'data_inicio', produto_data -> 'epoca_viagem' ->> 'inicio',
        'data_fim', produto_data -> 'epoca_viagem' ->> 'fim',
        'mes_inicio', EXTRACT(MONTH FROM (produto_data -> 'epoca_viagem' ->> 'inicio')::date),
        'mes_fim', COALESCE(
            EXTRACT(MONTH FROM (produto_data -> 'epoca_viagem' ->> 'fim')::date),
            EXTRACT(MONTH FROM (produto_data -> 'epoca_viagem' ->> 'inicio')::date)
        ),
        'ano', EXTRACT(YEAR FROM (produto_data -> 'epoca_viagem' ->> 'inicio')::date),
        'display', TO_CHAR((produto_data -> 'epoca_viagem' ->> 'inicio')::date, 'DD/MM/YYYY') ||
            CASE
                WHEN produto_data -> 'epoca_viagem' ->> 'fim' IS NOT NULL
                THEN ' a ' || TO_CHAR((produto_data -> 'epoca_viagem' ->> 'fim')::date, 'DD/MM/YYYY')
                ELSE ''
            END,
        'flexivel', COALESCE((produto_data -> 'epoca_viagem' ->> 'flexivel')::boolean, false)
    )
),
-- Sync normalized columns
epoca_tipo = 'data_exata',
epoca_mes_inicio = EXTRACT(MONTH FROM (produto_data -> 'epoca_viagem' ->> 'inicio')::date)::smallint,
epoca_mes_fim = COALESCE(
    EXTRACT(MONTH FROM (produto_data -> 'epoca_viagem' ->> 'fim')::date),
    EXTRACT(MONTH FROM (produto_data -> 'epoca_viagem' ->> 'inicio')::date)
)::smallint,
epoca_ano = EXTRACT(YEAR FROM (produto_data -> 'epoca_viagem' ->> 'inicio')::date)::smallint
WHERE produto_data -> 'epoca_viagem' ->> 'inicio' IS NOT NULL
  AND produto_data -> 'epoca_viagem' ->> 'tipo' IS NULL;

-- ============================================================================
-- 2. MIGRATE EXISTING ORCAMENTO DATA
-- ============================================================================

-- Update cards that have legacy orcamento format (with total/por_pessoa but no tipo)
UPDATE cards
SET produto_data = jsonb_set(
    COALESCE(produto_data, '{}'::jsonb),
    '{orcamento}',
    jsonb_build_object(
        'tipo', CASE
            WHEN (produto_data -> 'orcamento' ->> 'total')::numeric > 0 THEN 'total'
            WHEN (produto_data -> 'orcamento' ->> 'por_pessoa')::numeric > 0 THEN 'por_pessoa'
            ELSE 'total'
        END,
        'valor', CASE
            WHEN (produto_data -> 'orcamento' ->> 'total')::numeric > 0
            THEN (produto_data -> 'orcamento' ->> 'total')::numeric
            WHEN (produto_data -> 'orcamento' ->> 'por_pessoa')::numeric > 0
            THEN (produto_data -> 'orcamento' ->> 'por_pessoa')::numeric
            ELSE NULL
        END,
        'quantidade_viajantes', (produto_data ->> 'quantidade_viajantes')::integer,
        'total_calculado', CASE
            WHEN (produto_data -> 'orcamento' ->> 'total')::numeric > 0
            THEN (produto_data -> 'orcamento' ->> 'total')::numeric
            WHEN (produto_data -> 'orcamento' ->> 'por_pessoa')::numeric > 0
                AND (produto_data ->> 'quantidade_viajantes')::integer > 0
            THEN (produto_data -> 'orcamento' ->> 'por_pessoa')::numeric * (produto_data ->> 'quantidade_viajantes')::integer
            ELSE NULL
        END,
        'por_pessoa_calculado', CASE
            WHEN (produto_data -> 'orcamento' ->> 'por_pessoa')::numeric > 0
            THEN (produto_data -> 'orcamento' ->> 'por_pessoa')::numeric
            WHEN (produto_data -> 'orcamento' ->> 'total')::numeric > 0
                AND (produto_data ->> 'quantidade_viajantes')::integer > 0
            THEN ROUND((produto_data -> 'orcamento' ->> 'total')::numeric / (produto_data ->> 'quantidade_viajantes')::integer)
            ELSE NULL
        END,
        'display', CASE
            WHEN (produto_data -> 'orcamento' ->> 'total')::numeric > 0
            THEN 'R$ ' || TO_CHAR((produto_data -> 'orcamento' ->> 'total')::numeric, 'FM999G999G999')
            WHEN (produto_data -> 'orcamento' ->> 'por_pessoa')::numeric > 0
            THEN 'R$ ' || TO_CHAR((produto_data -> 'orcamento' ->> 'por_pessoa')::numeric, 'FM999G999G999') || '/pessoa'
            ELSE ''
        END
    )
)
WHERE (produto_data -> 'orcamento' ->> 'total' IS NOT NULL OR produto_data -> 'orcamento' ->> 'por_pessoa' IS NOT NULL)
  AND produto_data -> 'orcamento' ->> 'tipo' IS NULL;

-- ============================================================================
-- 3. SYNC VALOR_ESTIMADO FROM LEGACY DATA
-- ============================================================================

-- Ensure valor_estimado is populated from legacy orcamento.total
UPDATE cards
SET valor_estimado = (produto_data -> 'orcamento' ->> 'total_calculado')::numeric
WHERE (produto_data -> 'orcamento' ->> 'total_calculado')::numeric > 0
  AND (valor_estimado IS NULL OR valor_estimado = 0);

-- ============================================================================
-- 4. SYNC LEGACY COLUMNS FROM DATA_VIAGEM_INICIO/FIM
-- ============================================================================

-- For cards that have data_viagem_inicio but no epoca_viagem in produto_data
UPDATE cards
SET
    produto_data = jsonb_set(
        COALESCE(produto_data, '{}'::jsonb),
        '{epoca_viagem}',
        jsonb_build_object(
            'tipo', 'data_exata',
            'data_inicio', data_viagem_inicio::text,
            'data_fim', data_viagem_fim::text,
            'mes_inicio', EXTRACT(MONTH FROM data_viagem_inicio),
            'mes_fim', COALESCE(EXTRACT(MONTH FROM data_viagem_fim), EXTRACT(MONTH FROM data_viagem_inicio)),
            'ano', EXTRACT(YEAR FROM data_viagem_inicio),
            'display', TO_CHAR(data_viagem_inicio, 'DD/MM/YYYY') ||
                CASE WHEN data_viagem_fim IS NOT NULL THEN ' a ' || TO_CHAR(data_viagem_fim, 'DD/MM/YYYY') ELSE '' END,
            'flexivel', false
        )
    ),
    epoca_tipo = 'data_exata',
    epoca_mes_inicio = EXTRACT(MONTH FROM data_viagem_inicio)::smallint,
    epoca_mes_fim = COALESCE(EXTRACT(MONTH FROM data_viagem_fim), EXTRACT(MONTH FROM data_viagem_inicio))::smallint,
    epoca_ano = EXTRACT(YEAR FROM data_viagem_inicio)::smallint
WHERE data_viagem_inicio IS NOT NULL
  AND (produto_data -> 'epoca_viagem') IS NULL;

-- ============================================================================
-- 5. LOG MIGRATION STATS
-- ============================================================================

DO $$
DECLARE
    epoca_migrated integer;
    orcamento_migrated integer;
BEGIN
    SELECT COUNT(*) INTO epoca_migrated
    FROM cards
    WHERE produto_data -> 'epoca_viagem' ->> 'tipo' IS NOT NULL;

    SELECT COUNT(*) INTO orcamento_migrated
    FROM cards
    WHERE produto_data -> 'orcamento' ->> 'tipo' IS NOT NULL;

    RAISE NOTICE 'Migration complete: % cards with epoca_viagem, % cards with orcamento migrated to new format',
        epoca_migrated, orcamento_migrated;
END
$$;
