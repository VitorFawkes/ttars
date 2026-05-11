-- Analytics v2 — Fase 1 (Helpers de filtros universais + attribution)
-- Plano: Blocos 1 e 2.
--
-- Cria 5 funcoes helper utilizadas pelas RPCs _v2 para:
--   - _a_origem_ok        filtro universal "origem"
--   - _a_entry_path_ok    filtro universal "lead_entry_path"
--   - _a_destino_ok       filtro universal "destino" (cobre formatos legacy)
--   - _a_phase_ok         filtro universal "phase" (slug)
--   - _a_ctx_owner_ok     attribution fix: owner correto por contexto
--
-- Paralelizaveis e IMMUTABLE/STABLE conforme necessario.

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1) _a_origem_ok
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public._a_origem_ok(actual TEXT, arr_origens TEXT[])
RETURNS boolean
LANGUAGE sql
IMMUTABLE PARALLEL SAFE
AS $$
SELECT arr_origens IS NULL
       OR array_length(arr_origens, 1) IS NULL
       OR actual = ANY(arr_origens);
$$;

COMMENT ON FUNCTION public._a_origem_ok(TEXT, TEXT[]) IS
  'Analytics v2: retorna TRUE quando o array de filtros e vazio/NULL OU o valor esta no array. Companheiro de _a_owner_ok.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 2) _a_entry_path_ok
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public._a_entry_path_ok(actual TEXT, wanted TEXT)
RETURNS boolean
LANGUAGE sql
IMMUTABLE PARALLEL SAFE
AS $$
SELECT wanted IS NULL OR actual = wanted;
$$;

COMMENT ON FUNCTION public._a_entry_path_ok(TEXT, TEXT) IS
  'Analytics v2: filtra por lead_entry_path (full_funnel/direct_planner/returning/referred). NULL = passa tudo.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 3) _a_destino_ok
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public._a_destino_ok(produto_data JSONB, arr_destinos TEXT[])
RETURNS boolean
LANGUAGE sql
IMMUTABLE PARALLEL SAFE
AS $$
SELECT
  arr_destinos IS NULL
  OR array_length(arr_destinos, 1) IS NULL
  OR (
    -- Formato moderno: produto_data.destinos = array de strings
    jsonb_typeof(produto_data->'destinos') = 'array'
    AND produto_data->'destinos' ?| arr_destinos
  )
  OR (
    -- Legacy 1: produto_data.destino (string)
    (produto_data->>'destino') IS NOT NULL
    AND (produto_data->>'destino') = ANY(arr_destinos)
  )
  OR (
    -- Legacy 2: produto_data.destino_roteiro (string)
    (produto_data->>'destino_roteiro') IS NOT NULL
    AND (produto_data->>'destino_roteiro') = ANY(arr_destinos)
  );
$$;

COMMENT ON FUNCTION public._a_destino_ok(JSONB, TEXT[]) IS
  'Analytics v2: filtra cards por destino, cobrindo formato moderno (produto_data.destinos[]) e legacy (destino, destino_roteiro).';

-- ═══════════════════════════════════════════════════════════════════════════
-- 4) _a_phase_ok
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public._a_phase_ok(stage_id UUID, arr_phase_slugs TEXT[])
RETURNS boolean
LANGUAGE sql
STABLE PARALLEL SAFE
AS $$
SELECT
  arr_phase_slugs IS NULL
  OR array_length(arr_phase_slugs, 1) IS NULL
  OR EXISTS (
    SELECT 1
      FROM public.pipeline_stages s
      JOIN public.pipeline_phases pp ON pp.id = s.phase_id
     WHERE s.id = stage_id
       AND pp.slug = ANY(arr_phase_slugs)
  );
$$;

COMMENT ON FUNCTION public._a_phase_ok(UUID, TEXT[]) IS
  'Analytics v2: filtra por phase slug (sdr/planner/pos_venda/...). Resolve via JOIN interno em pipeline_stages+pipeline_phases.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 5) _a_ctx_owner_ok — attribution fix
--    Substitui _a_owner_ok quando o contexto do dashboard importa.
--    Context 'sdr'     -> compara com sdr_owner_id
--    Context 'vendas'  -> compara com vendas_owner_id
--    Context 'pos'     -> compara com pos_owner_id
--    Context 'dono' (default) -> compara com dono_atual_id (comportamento
--        operacional: quem esta com o card AGORA, util para sla/pipeline_current)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public._a_ctx_owner_ok(
  sdr_id     UUID,
  vendas_id  UUID,
  pos_id     UUID,
  dono_id    UUID,
  ctx        TEXT,
  single_id  UUID,
  arr_ids    UUID[]
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE PARALLEL SAFE
AS $$
SELECT public._a_owner_ok(
  CASE ctx
    WHEN 'sdr' THEN sdr_id
    WHEN 'vendas' THEN vendas_id
    WHEN 'planner' THEN vendas_id
    WHEN 'pos' THEN pos_id
    WHEN 'pos_venda' THEN pos_id
    ELSE dono_id
  END,
  single_id,
  arr_ids
);
$$;

COMMENT ON FUNCTION public._a_ctx_owner_ok(UUID,UUID,UUID,UUID,TEXT,UUID,UUID[]) IS
  'Analytics v2 (attribution fix): aplica _a_owner_ok sobre a coluna de owner correta segundo o contexto (sdr/vendas/pos/dono). Default "dono" preserva comportamento antigo.';

GRANT EXECUTE ON FUNCTION public._a_origem_ok(TEXT, TEXT[]) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public._a_entry_path_ok(TEXT, TEXT) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public._a_destino_ok(JSONB, TEXT[]) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public._a_phase_ok(UUID, TEXT[]) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public._a_ctx_owner_ok(UUID,UUID,UUID,UUID,TEXT,UUID,UUID[]) TO authenticated, anon, service_role;

COMMIT;
