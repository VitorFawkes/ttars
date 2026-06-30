-- ════════════════════════════════════════════════════════════════════════════
-- 20260630a — Histórico de etapas de um card: quantos dias ficou em cada etapa
-- ────────────────────────────────────────────────────────────────────────────
-- Para o modal de "histórico" ao clicar num card na visão de Operação (Weddings).
-- Fonte: activities tipo 'stage_changed' (registro automático desde 02/03/2026;
-- 100% dos eventos têm new_stage_id). Reconstrói a linha do tempo:
--   • etapa inicial = old_stage do 1º evento (entrou = created_at do card);
--   • cada evento = entrada na new_stage no created_at do evento;
--   • dias na etapa = tempo até a PRÓXIMA entrada (ou now() na etapa atual);
--   • card sem nenhum evento → está na etapa de criação desde created_at.
-- Ressalva honesta (exposta no front): o histórico começa quando o registro
-- automático passou a existir (mar/2026) — transições anteriores não aparecem.
-- SECURITY DEFINER: valida que o card pertence à org do solicitante (read-only).
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION ww_card_stage_history(
  p_card_id uuid,
  p_org_id  uuid DEFAULT NULL
) RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org     uuid := COALESCE(p_org_id, requesting_org_id());
  v_created timestamptz;
  v_titulo  text;
  v_result  json;
BEGIN
  SELECT c.created_at, c.titulo INTO v_created, v_titulo
    FROM cards c
   WHERE c.id = p_card_id AND c.org_id = v_org;
  IF v_created IS NULL THEN
    RETURN json_build_object('error', 'card não encontrado');
  END IF;

  WITH ev AS (
    SELECT a.created_at,
           a.metadata ->> 'old_stage_name' AS old_name,
           a.metadata ->> 'new_stage_name' AS new_name,
           a.metadata ->> 'old_stage_id'   AS old_id,
           a.metadata ->> 'new_stage_id'   AS new_id,
           row_number() OVER (ORDER BY a.created_at, a.id) AS rn
      FROM activities a
     WHERE a.card_id = p_card_id AND a.tipo = 'stage_changed'
  ),
  cur AS (
    SELECT s.nome AS cur_name, s.id::text AS cur_id, ph.slug AS cur_phase
      FROM cards c
      JOIN pipeline_stages s  ON s.id = c.pipeline_stage_id
      JOIN pipeline_phases ph ON ph.id = s.phase_id
     WHERE c.id = p_card_id
  ),
  -- pontos de entrada: etapa inicial (created_at do card) + cada new_stage dos eventos.
  -- Sem eventos: único ponto = etapa atual desde a criação.
  points AS (
    SELECT 0 AS ord,
           COALESCE((SELECT old_name FROM ev ORDER BY rn LIMIT 1), (SELECT cur_name FROM cur)) AS stage_name,
           COALESCE((SELECT old_id   FROM ev ORDER BY rn LIMIT 1), (SELECT cur_id   FROM cur)) AS stage_id,
           v_created AS entered_at
    UNION ALL
    SELECT rn::int, new_name, new_id, created_at FROM ev
  ),
  seq AS (
    SELECT ord, stage_name, stage_id, entered_at,
           LEAD(entered_at) OVER (ORDER BY ord) AS next_at
      FROM points
  ),
  segs AS (
    SELECT stage_name, stage_id, entered_at,
           COALESCE(next_at, now()) AS left_at,
           GREATEST(0, EXTRACT(EPOCH FROM (COALESCE(next_at, now()) - entered_at)) / 86400.0) AS dias,
           (next_at IS NULL) AS atual
      FROM seq
  )
  SELECT json_build_object(
    'card_id',     p_card_id,
    'titulo',      v_titulo,
    'created_at',  v_created,
    'etapa_atual', (SELECT cur_name FROM cur),
    'etapas', COALESCE(json_agg(json_build_object(
                'etapa',      stage_name,
                'stage_id',   stage_id,
                'entrou_em',  entered_at,
                'saiu_em',    CASE WHEN atual THEN NULL ELSE left_at END,
                'dias',       ROUND(dias::numeric, 1),
                'atual',      atual
              ) ORDER BY entered_at), '[]'::json),
    'total_dias', ROUND(SUM(dias)::numeric, 1)
  ) INTO v_result
  FROM segs;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION ww_card_stage_history(uuid, uuid) TO authenticated;
