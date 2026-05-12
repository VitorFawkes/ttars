-- ============================================================================
-- MIGRATION: RPC sdr_desvincular_de_card
-- Date: 2026-05-12
--
-- Permite desvincular uma pontuação de um card (manda card_id de volta pra NULL).
-- Validações:
--   - Pontuação pertence à requesting_org_id
--   - Pode desvincular em qualquer status (rascunho, finalizado, descartado)
--   - Quando desvincula um finalizado, limpa cards.sdr_qualification_score_latest
--     se a pontuação removida era a que estava no snapshot
-- ============================================================================

CREATE OR REPLACE FUNCTION sdr_desvincular_de_card(p_qualification_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_org_id UUID;
  v_qual RECORD;
  v_old_card_id UUID;
BEGIN
  v_org_id := requesting_org_id();
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'sdr_desvincular_de_card: requesting_org_id NULL';
  END IF;

  SELECT * INTO v_qual FROM sdr_qualifications WHERE id = p_qualification_id;
  IF v_qual.id IS NULL THEN
    RAISE EXCEPTION 'sdr_desvincular_de_card: pontuacao nao existe';
  END IF;
  IF v_qual.org_id != v_org_id THEN
    RAISE EXCEPTION 'sdr_desvincular_de_card: cross-org violation';
  END IF;
  IF v_qual.card_id IS NULL THEN
    RETURN jsonb_build_object('id', p_qualification_id, 'card_id', NULL, 'changed', false);
  END IF;

  v_old_card_id := v_qual.card_id;

  UPDATE sdr_qualifications
  SET card_id = NULL, updated_at = NOW()
  WHERE id = p_qualification_id;

  -- Se essa pontuação era a que estava no snapshot do card, limpar/recalcular
  -- O trigger trg_sdr_qual_denormalize_to_card já faz isso ao detectar mudança em card_id,
  -- mas como o trigger só roda em UPDATE OF status, card_id, força um trigger pelo card_id.

  RETURN jsonb_build_object(
    'id', p_qualification_id,
    'card_id_anterior', v_old_card_id,
    'card_id', NULL,
    'changed', true
  );
END;
$func$;

GRANT EXECUTE ON FUNCTION sdr_desvincular_de_card(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION sdr_desvincular_de_card(UUID) TO service_role;

COMMENT ON FUNCTION sdr_desvincular_de_card IS
  'Remove o card_id de uma pontuacao SDR. Trigger denormalize recalcula cards.sdr_qualification_score_latest se necessario.';
