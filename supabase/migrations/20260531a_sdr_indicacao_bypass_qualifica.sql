-- ============================================================================
-- MIGRATION: indicação é bypass de qualificação (Pontuações SDR / Weddings)
-- Date: 2026-05-31
--
-- CONTEXTO:
-- Lead que chega por indicação é alta confiança e deve ser tratado como
-- qualificado independente do score numérico ("indicação é um bypass"). A flag
-- vive em dados_lead.is_indicacao, marcada pela SDR na tela /pontuacoes.
--
-- ABORDAGEM (sem recriar sdr_atualizar_pontuacao — scoring intacto):
-- Trigger BEFORE INSERT OR UPDATE em sdr_qualifications que, quando
-- dados_lead.is_indicacao = true E já existe um score_result computado
-- (contém a chave 'enabled'), aplica o bypass sobre o score_result:
--   - qualificado = true (mesmo abaixo do threshold)
--   - disqualified = false e disqualifiers_hit = [] (bypass total)
--   - qualified_by_indicacao = true (para a UI mostrar a razão)
-- O score numérico NÃO é inflado (continua refletindo os pontos reais).
--
-- Cobre todos os caminhos de escrita (sdr_atualizar/finalizar/reabrir) e
-- propaga para o card via o trigger de denormalização existente, que lê
-- score_result já corrigido.
--
-- Ao desmarcar indicação, a própria RPC sdr_atualizar_pontuacao recomputa o
-- score_result real; o trigger então remove o marcador qualified_by_indicacao.
-- ============================================================================

CREATE OR REPLACE FUNCTION trg_fn_sdr_qual_indicacao_bypass()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_is_indicacao BOOLEAN;
BEGIN
  v_is_indicacao := COALESCE((NEW.dados_lead->>'is_indicacao')::BOOLEAN, false);

  -- Só age quando há um score_result já computado (chave 'enabled' presente).
  -- Em rascunho recém-criado o score_result é '{}' e não deve ser fabricado.
  IF NEW.score_result ? 'enabled' THEN
    IF v_is_indicacao THEN
      NEW.score_result := NEW.score_result || jsonb_build_object(
        'qualificado', true,
        'qualified_by_indicacao', true,
        'disqualified', false,
        'disqualifiers_hit', '[]'::JSONB
      );
    ELSIF COALESCE((NEW.score_result->>'qualified_by_indicacao')::BOOLEAN, false) THEN
      -- Indicação foi desmarcada: limpa o marcador. A RPC já recomputou o
      -- score_result real (qualificado/disqualified conforme o threshold).
      NEW.score_result := NEW.score_result - 'qualified_by_indicacao';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION trg_fn_sdr_qual_indicacao_bypass IS
  'Bypass de indicação: quando dados_lead.is_indicacao=true, marca a pontuação como qualificada (qualificado=true, disqualified=false, qualified_by_indicacao=true) sem alterar o score numérico. Não recria sdr_atualizar_pontuacao.';

DROP TRIGGER IF EXISTS trg_sdr_qual_indicacao_bypass ON sdr_qualifications;
CREATE TRIGGER trg_sdr_qual_indicacao_bypass
  BEFORE INSERT OR UPDATE ON sdr_qualifications
  FOR EACH ROW EXECUTE FUNCTION trg_fn_sdr_qual_indicacao_bypass();

-- Backfill: pontuações já existentes marcadas como indicação que ainda não
-- carregam o bypass no score_result.
UPDATE sdr_qualifications
SET score_result = score_result || jsonb_build_object(
      'qualificado', true,
      'qualified_by_indicacao', true,
      'disqualified', false,
      'disqualifiers_hit', '[]'::JSONB
    ),
    updated_at = NOW()
WHERE COALESCE((dados_lead->>'is_indicacao')::BOOLEAN, false) = true
  AND score_result ? 'enabled'
  AND COALESCE((score_result->>'qualified_by_indicacao')::BOOLEAN, false) = false;
