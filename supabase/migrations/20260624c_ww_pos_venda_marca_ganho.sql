-- 20260624c_ww_pos_venda_marca_ganho.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Weddings: card na fase "Pós-venda" = venda fechada → status_comercial='ganho'.
--
-- CAUSA: no Active, o closer "ganha" um casamento movendo o negócio pra uma
-- pipeline de pós-venda (grupos 4/10/5) e preenchendo a "Data de Ganho" — NÃO
-- marca o status do negócio como won (156 de 159 seguem status "aberto" no AC).
-- A sincronização de entrada move o card pra uma etapa da fase 'pos_venda' do
-- ttars, mas nunca atualiza status_comercial (não passa por marcar_ganho).
-- Resultado: ~110 cards na fase Pós-venda com status "aberto", e o kanban / o
-- Analytics 2 (nativo) subcontam vendas.
--
-- O sistema já trata "phase=pos_venda = ganho" (relatórios usam
-- status_comercial='ganho' OR phase_slug='pos_venda'); esta migration só alinha
-- o status_comercial.
--
-- ESCOPO (decisão do produto): corrige só o ttars; NÃO toca no Active.
-- Cancelados (fase 'resolucao', is_lost) continuam perdido — não entram aqui.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Parte 1 — Regra automática pros próximos (trigger) ───────────────────────
-- Dispara só durante a sincronização do Active (app.update_source='integration'),
-- que é o mesmo guard que suprime push outbound + cadência → não volta pro Active
-- e não afeta movimentações manuais. Gated em produto='WEDDING'.
CREATE OR REPLACE FUNCTION ww_pos_venda_marca_ganho()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.produto <> 'WEDDING' THEN RETURN NEW; END IF;
  IF COALESCE(current_setting('app.update_source', true), '') <> 'integration' THEN
    RETURN NEW;
  END IF;
  IF NEW.status_comercial IN ('ganho', 'perdido') THEN RETURN NEW; END IF;
  IF NEW.pipeline_stage_id IS NULL THEN RETURN NEW; END IF;

  -- A etapa-alvo pertence à fase 'pos_venda' do próprio pipeline do card
  -- (join pelo stage → sem colisão de slug entre account/workspaces) e não é is_lost?
  IF EXISTS (
    SELECT 1
      FROM pipeline_stages s
      JOIN pipeline_phases ph ON ph.id = s.phase_id
     WHERE s.id = NEW.pipeline_stage_id
       AND ph.slug = 'pos_venda'
       AND COALESCE(s.is_lost, FALSE) = FALSE
  ) THEN
    NEW.status_comercial := 'ganho';
    NEW.data_fechamento  := COALESCE(
      NEW.data_fechamento,
      NULLIF(NEW.produto_data ->> 'ww_closer_data_ganho', '')::date,
      CURRENT_DATE
    );
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION ww_pos_venda_marca_ganho() IS
  'Weddings: ao entrar (via sync AC, update_source=integration) numa etapa da fase pos_venda (não is_lost), marca status_comercial=ganho + data_fechamento. Causa: closer fecha movendo o deal pra pipeline pós-venda do Active sem marcar status=won, então a sync nunca marcava ganho no card. Gated em update_source=integration → não empurra de volta pro Active nem dispara em ação manual. Migration 20260624c.';

DROP TRIGGER IF EXISTS trg_ww_pos_venda_marca_ganho ON public.cards;
CREATE TRIGGER trg_ww_pos_venda_marca_ganho
  BEFORE INSERT OR UPDATE OF pipeline_stage_id ON public.cards
  FOR EACH ROW
  EXECUTE FUNCTION ww_pos_venda_marca_ganho();

-- ── Parte 2 — Backfill dos cards já parados em Pós-venda como "aberto" ────────
-- Roda sob update_source='integration' (suprime outbound/cadência). Mexe só em
-- status_comercial/data_fechamento (não em pipeline_stage_id) → o trigger da
-- Parte 1 não dispara aqui; status é setado direto. Não chama marcar_ganho → sem
-- efeitos colaterais de sub-card / oportunidade futura (não fazem sentido em
-- backfill histórico).
DO $backfill$
DECLARE
  v_pipeline_id CONSTANT uuid := 'f4611f84-ce9c-48ad-814b-dcd6081f15db';  -- Weddings
  v_count integer;
BEGIN
  PERFORM set_config('app.update_source', 'integration', true);

  UPDATE cards SET
    status_comercial = 'ganho',
    data_fechamento  = COALESCE(
                         data_fechamento,
                         NULLIF(produto_data ->> 'ww_closer_data_ganho', '')::date,
                         updated_at::date)
  WHERE produto = 'WEDDING'
    AND deleted_at IS NULL
    AND status_comercial = 'aberto'
    AND pipeline_stage_id IN (
      SELECT s.id
        FROM pipeline_stages s
        JOIN pipeline_phases ph ON ph.id = s.phase_id
       WHERE ph.slug = 'pos_venda'
         AND s.pipeline_id = v_pipeline_id
         AND COALESCE(s.is_lost, FALSE) = FALSE
    );

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'ww_pos_venda backfill: % cards Weddings marcados como ganho', v_count;
END
$backfill$;
