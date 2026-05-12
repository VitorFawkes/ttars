-- ============================================================================
-- MIGRATION: Editar sobrescrevendo (volta para rascunho) + excluir finalizada
-- Date: 2026-05-12
--
-- Decisões de produto (Vitor):
-- - Edição sobrescreve, não cria v2. Mais simples na cabeça da SDR.
-- - Excluir = soft delete (status='descartado'). Aparece na seção "Descartadas"
--   colapsada pra histórico. Sem hard delete (preserva activity log).
-- ============================================================================

BEGIN;

-- 1) sdr_voltar_para_rascunho — move finalizado -> rascunho, mesma id
CREATE OR REPLACE FUNCTION sdr_voltar_para_rascunho(p_qualification_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_org_id UUID;
  v_qual RECORD;
BEGIN
  v_org_id := requesting_org_id();
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'sdr_voltar_para_rascunho: requesting_org_id NULL';
  END IF;

  SELECT * INTO v_qual FROM sdr_qualifications WHERE id = p_qualification_id;
  IF v_qual.id IS NULL THEN
    RAISE EXCEPTION 'sdr_voltar_para_rascunho: pontuacao nao existe';
  END IF;
  IF v_qual.org_id != v_org_id THEN
    RAISE EXCEPTION 'sdr_voltar_para_rascunho: cross-org violation';
  END IF;
  IF v_qual.status NOT IN ('finalizado', 'descartado') THEN
    -- Já está rascunho ou estado inválido
    RETURN jsonb_build_object('id', p_qualification_id, 'status', v_qual.status, 'changed', false);
  END IF;

  UPDATE sdr_qualifications
  SET status = 'rascunho',
      finalized_at = NULL,
      updated_at = NOW()
  WHERE id = p_qualification_id;

  -- Trigger trg_sdr_qual_denormalize recalcula cards.sdr_qualification_score_latest
  -- (se essa era a snapshot do card, vai pegar a próxima finalizada mais recente
  -- ou ficar NULL se não houver outra).

  RETURN jsonb_build_object('id', p_qualification_id, 'status', 'rascunho', 'changed', true);
END;
$func$;

GRANT EXECUTE ON FUNCTION sdr_voltar_para_rascunho(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION sdr_voltar_para_rascunho(UUID) TO service_role;

COMMENT ON FUNCTION sdr_voltar_para_rascunho IS
  'Volta uma pontuacao finalizada ou descartada para rascunho. Permite edicao sobrescrevendo.';

-- 2) sdr_descartar_pontuacao — relaxa pra aceitar qualquer status (incluindo finalizado)
--    Preserva mapping ww_* nao se aplica (descartar so muda status).
CREATE OR REPLACE FUNCTION sdr_descartar_pontuacao(p_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_org_id UUID;
  v_qual RECORD;
BEGIN
  v_org_id := requesting_org_id();
  SELECT * INTO v_qual FROM sdr_qualifications WHERE id = p_id;
  IF v_qual.id IS NULL THEN
    RAISE EXCEPTION 'sdr_descartar_pontuacao: % nao existe', p_id;
  END IF;
  IF v_qual.org_id != v_org_id THEN
    RAISE EXCEPTION 'sdr_descartar_pontuacao: cross-org violation';
  END IF;
  IF v_qual.status = 'descartado' THEN
    RETURN jsonb_build_object('id', p_id, 'status', 'descartado', 'changed', false);
  END IF;

  UPDATE sdr_qualifications SET status = 'descartado', updated_at = NOW()
  WHERE id = p_id;

  -- Trigger denormalize recalcula snapshot do card se aplicável.

  RETURN jsonb_build_object('id', p_id, 'status', 'descartado', 'changed', true);
END;
$func$;

COMMIT;
