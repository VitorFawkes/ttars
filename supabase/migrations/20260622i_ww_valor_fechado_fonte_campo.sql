-- ============================================================================
-- WEDDINGS — Valor fechado: ww_closer_valor_contrato vira a FONTE de verdade
-- (decisão do Mateus, 22/06 — handoff SDR+Vendas, reconciliação AC #4)
-- ============================================================================
-- Estado anterior (20260526b/20260618d):
--   • Active deal 64 ("Valor fechado") gravava DIRETO na coluna cards.valor_final.
--   • Campo manual ww_closer_valor_contrato → valor_final via trigger
--     (trg_ww_valor_contrato_to_final), mas o Active nunca preenchia o campo.
--   • Resultado: dois escritores independentes de valor_final; o campo manual
--     ficava vazio e desacoplado do que o Active sincronizava.
--
-- Decisão nova: o campo manual ww_closer_valor_contrato é a ÚNICA fonte.
--   • Active deal 64 passa a gravar NO CAMPO (produto_data), não na coluna.
--   • O trigger existente espelha o campo → valor_final (coluna canônica que o
--     analytics nativo lê via COALESCE(valor_final, valor_estimado)). Mantido.
--   • Trigger endurecido pra normalizar formatos do Active (vírgula de milhar,
--     R$, espaços) antes do cast — input type=number da UI continua funcionando.
--
-- ISOLAMENTO: mexe SÓ no mapa inbound dos pipelines WEDDING (1=SDR, 3=Closer,
-- 4=Pós-venda) e no trigger já restrito à org WEDDING (…002). NÃO toca pipeline 8
-- (Trips) nem nenhuma coluna/trigger de Trips. REVERSÍVEL.
-- ============================================================================

BEGIN;

-- ── 1) Remapear Active deal 64: coluna valor_final → campo ww_closer_valor_contrato
UPDATE public.integration_field_map
SET local_field_key  = 'ww_closer_valor_contrato',
    storage_location = 'produto_data',
    db_column_name   = NULL,
    updated_at       = now()
WHERE source = 'active_campaign'
  AND entity_type = 'deal'
  AND direction = 'inbound'
  AND integration_id = 'a2141b92-561f-4514-92b4-9412a068d236'
  AND external_field_id = '64'
  AND external_pipeline_id IN ('1', '3', '4');

-- ── 2) Endurecer o trigger campo → coluna pra aceitar formatos do Active
-- (única definição: 20260618d — verificado via grep antes de recriar). Normaliza
-- removendo tudo que não é dígito ou ponto decimal; só grava se sobrar um número
-- válido (formato BR ambíguo "30.000,00" vira inválido e é ignorado, sem clobber).
CREATE OR REPLACE FUNCTION public.ww_sync_valor_contrato_to_valor_final()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $fn$
DECLARE
    v_raw   text := NULLIF(btrim(NEW.produto_data->>'ww_closer_valor_contrato'), '');
    v_old   text;
    v_clean text;
BEGIN
    IF TG_OP = 'UPDATE' THEN
        v_old := NULLIF(btrim(OLD.produto_data->>'ww_closer_valor_contrato'), '');
    END IF;

    -- só age quando o valor do contrato foi setado/alterado
    IF v_raw IS NOT NULL
       AND (TG_OP = 'INSERT' OR v_raw IS DISTINCT FROM v_old) THEN
        -- normaliza: tira R$, espaços e separador de milhar (vírgula), mantém dígitos e ponto
        v_clean := regexp_replace(v_raw, '[^0-9.]', '', 'g');
        IF v_clean ~ '^[0-9]+(\.[0-9]+)?$' THEN
            NEW.valor_final := v_clean::numeric;
        END IF;
    END IF;

    RETURN NEW;
END;
$fn$;

-- Trigger já existe (BEFORE INSERT OR UPDATE, WHEN org = WEDDING). Reafirma idempotente.
DROP TRIGGER IF EXISTS trg_ww_valor_contrato_to_final ON public.cards;
CREATE TRIGGER trg_ww_valor_contrato_to_final
    BEFORE INSERT OR UPDATE ON public.cards
    FOR EACH ROW
    WHEN (NEW.org_id = 'b0000000-0000-0000-0000-000000000002'::uuid)
    EXECUTE FUNCTION public.ww_sync_valor_contrato_to_valor_final();

-- ── 3) Backfill: preencher o campo a partir do valor_final que o Active já trouxe
-- (fill-empty-only). Sem isso, ~283 cards ganhos mostram "Valor fechado" vazio na
-- tela do Closer mesmo tendo valor_final. Suprime push/cadência (update_source).
SELECT set_config('app.update_source', 'integration', true);

UPDATE public.cards
SET produto_data = jsonb_set(
      COALESCE(produto_data, '{}'::jsonb),
      '{ww_closer_valor_contrato}',
      to_jsonb(valor_final::text),
      true),
    updated_at = now()
WHERE org_id = 'b0000000-0000-0000-0000-000000000002'
  AND valor_final IS NOT NULL
  AND valor_final > 0
  AND COALESCE(produto_data->>'ww_closer_valor_contrato', '') = '';

COMMIT;

-- ============================================================================
-- VERIFICAÇÃO (REST):
--   -- mapa: deal 64 deve estar em produto_data/ww_closer_valor_contrato (3 linhas):
--   integration_field_map?external_field_id=eq.64&select=local_field_key,storage_location,external_pipeline_id
--   -- backfill: candidatos restantes (valor_final>0 & campo vazio) deve ser 0:
--   cards?org_id=eq.b0000000-…-002&valor_final=gt.0&produto_data->>ww_closer_valor_contrato=is.null&select=id
--   -- trigger: editar ww_closer_valor_contrato='35000' num card teste → valor_final=35000;
--             simular AC deal 64='40,000.00' → campo='40,000.00' e valor_final=40000.
-- ============================================================================
