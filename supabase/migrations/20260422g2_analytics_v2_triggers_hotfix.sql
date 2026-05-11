-- Analytics v2 — Fase 0 HOTFIX do 20260422g
-- Bug: `trim(briefing_inicial)` falha porque briefing_inicial e JSONB (nao TEXT).
-- Resultado do bug original: trigger update_quality_score quebrava qualquer UPDATE/INSERT em cards.
-- Fix: trocar verificacao por "jsonb nao vazio".

BEGIN;

CREATE OR REPLACE FUNCTION public.update_quality_score()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_score INT := 0;
BEGIN
  v_score :=
    CASE WHEN NEW.pessoa_principal_id IS NOT NULL THEN 20 ELSE 0 END +
    CASE WHEN NEW.origem IS NOT NULL AND NEW.origem <> '' THEN 10 ELSE 0 END +
    CASE WHEN (NEW.valor_final    IS NOT NULL AND NEW.valor_final    > 0)
           OR (NEW.valor_estimado IS NOT NULL AND NEW.valor_estimado > 0) THEN 20 ELSE 0 END +
    CASE WHEN NEW.data_viagem_inicio IS NOT NULL
           OR NEW.epoca_ano          IS NOT NULL
           OR NEW.epoca_tipo         IS NOT NULL THEN 15 ELSE 0 END +
    CASE WHEN jsonb_typeof(NEW.produto_data->'destinos') = 'array'
          AND jsonb_array_length(NEW.produto_data->'destinos') > 0 THEN 15 ELSE 0 END +
    CASE WHEN (NEW.briefing_inicial IS NOT NULL
                AND NEW.briefing_inicial <> '{}'::jsonb
                AND NEW.briefing_inicial <> 'null'::jsonb)
           OR (NEW.produto_data->>'observacoes_criticas' IS NOT NULL
                AND length(trim(NEW.produto_data->>'observacoes_criticas')) > 50) THEN 10 ELSE 0 END +
    CASE WHEN NEW.dono_atual_id IS NOT NULL THEN 10 ELSE 0 END;

  NEW.quality_score_pct := v_score;
  RETURN NEW;
END;
$$;

COMMIT;
