-- =============================================================================
-- FIX: Orcamento stored in centavos instead of reais
-- Root cause: integration-process parsed AC deal[value_raw] (centavos) as reais
-- Affected: 13 cards from ActiveCampaign (6 already identified + 7 new)
-- Fix: Divide valor_estimado and orcamento values by 100
-- =============================================================================

-- Prevent outbound trigger from firing (avoid loop)
SELECT set_config('app.update_source', 'integration', true);

-- Fix cards WITH orcamento object (divide valor, total_calculado, display)
UPDATE cards c SET
    valor_estimado = ROUND(c.valor_estimado / 100.0, 2),
    produto_data = jsonb_set(
        jsonb_set(
            jsonb_set(
                c.produto_data,
                '{orcamento,total_calculado}',
                to_jsonb(ROUND((c.produto_data->'orcamento'->>'total_calculado')::numeric / 100.0, 2))
            ),
            '{orcamento,valor}',
            to_jsonb(ROUND((c.produto_data->'orcamento'->>'valor')::numeric / 100.0, 2))
        ),
        '{orcamento,display}',
        to_jsonb('R$ ' || to_char(ROUND((c.produto_data->'orcamento'->>'total_calculado')::numeric / 100.0, 2), 'FM999G999D00'))
    )
WHERE c.external_id IN ('24296','24501','24334','23606','20553','24323','24904','24903','25815')
  AND c.produto_data->'orcamento'->>'total_calculado' IS NOT NULL
  AND c.valor_estimado > 100000;

-- Fix cards WITHOUT orcamento (only valor_estimado)
UPDATE cards c SET
    valor_estimado = ROUND(c.valor_estimado / 100.0, 2)
WHERE c.external_id IN ('24333','24275','22367','24276')
  AND c.valor_estimado > 100000
  AND (c.produto_data->'orcamento'->>'total_calculado') IS NULL;

-- Verify
SELECT external_id, titulo, valor_estimado,
       produto_data->'orcamento'->>'total_calculado' as orc_tc,
       produto_data->'orcamento'->>'display' as orc_display
FROM cards
WHERE external_id IN ('24296','24501','24334','23606','20553','24323','24904','24903','25815','24333','24275','22367','24276')
ORDER BY valor_estimado DESC;
