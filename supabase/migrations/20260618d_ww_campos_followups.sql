-- ============================================================================
-- WEDDINGS — Follow-ups de campo (a pedido do Mateus, 18/06)
-- ============================================================================
-- 1) BACKFILL investimento: traz o valor que já existe em ww_mkt_orcamento_form
--    (campo antigo de marketing) pro campo canônico ww_orcamento_faixa, SÓ onde
--    a faixa está vazia (fill-empty-only — nunca sobrescreve). Formato idêntico
--    ("Entre R$50 e R$80 mil"). ~2280 cards. Sem isto, cards antigos só mostram o
--    investimento no campo novo quando o deal re-sincroniza no Active.
--
-- 2) VALOR FECHADO: campo manual do Closer (ww_closer_valor_contrato, currency,
--    guarda número limpo via input type=number) passa a gravar na coluna canônica
--    valor_final (que o analytics usa e o Active deal 64 também alimenta). Trigger
--    só age quando o campo manual MUDA → nunca clobbera um valor_final vindo do
--    Active. Hoje 0 cards usam o campo manual (é future-proofing).
--
-- ISOLAMENTO: org WEDDING (…002). suprime push/cadência no backfill. REVERSÍVEL.
-- ============================================================================

BEGIN;

-- ── 1) Backfill investimento (fill-empty-only) ──────────────────────────────
SELECT set_config('app.update_source', 'integration', true);

UPDATE public.cards
SET produto_data = jsonb_set(
      COALESCE(produto_data, '{}'::jsonb),
      '{ww_orcamento_faixa}',
      produto_data->'ww_mkt_orcamento_form',
      true)
WHERE org_id = 'b0000000-0000-0000-0000-000000000002'
  AND COALESCE(produto_data->>'ww_mkt_orcamento_form', '') <> ''
  AND COALESCE(produto_data->>'ww_orcamento_faixa', '') = '';

-- ── 2) Trigger: ww_closer_valor_contrato → valor_final ──────────────────────
CREATE OR REPLACE FUNCTION public.ww_sync_valor_contrato_to_valor_final()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
DECLARE
    v_new text := NULLIF(trim(NEW.produto_data->>'ww_closer_valor_contrato'), '');
    v_old text;
BEGIN
    IF TG_OP = 'UPDATE' THEN
        v_old := NULLIF(trim(OLD.produto_data->>'ww_closer_valor_contrato'), '');
    END IF;
    -- só age quando o campo manual foi setado/alterado e é numérico (input type=number)
    IF v_new IS NOT NULL
       AND (TG_OP = 'INSERT' OR v_new IS DISTINCT FROM v_old)
       AND v_new ~ '^[0-9]+(\.[0-9]+)?$' THEN
        NEW.valor_final := v_new::numeric;
    END IF;
    RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_ww_valor_contrato_to_final ON public.cards;
CREATE TRIGGER trg_ww_valor_contrato_to_final
    BEFORE INSERT OR UPDATE ON public.cards
    FOR EACH ROW
    WHEN (NEW.org_id = 'b0000000-0000-0000-0000-000000000002'::uuid)
    EXECUTE FUNCTION public.ww_sync_valor_contrato_to_valor_final();

COMMIT;

-- ============================================================================
-- VERIFICAÇÃO (REST):
--   -- backfill: faixa preenchida deve subir p/ ~2364 (84 + 2280):
--   cards?org_id=eq.b0000000-…-002&produto_data->>ww_orcamento_faixa=not.is.null&select=id (count)
--   -- candidatos restantes (form set + faixa vazia) deve ser 0.
--   -- trigger: editar ww_closer_valor_contrato='30000' num card teste → valor_final=30000.
-- ============================================================================
