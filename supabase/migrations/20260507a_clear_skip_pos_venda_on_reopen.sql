-- ============================================================================
-- MIGRATION: trigger limpa skip_pos_venda quando card é reaberto + backfill
-- Date: 2026-05-07
--
-- Contexto: cards podem ser marcados como "Ganho sem Pós-Venda" (status='ganho'
-- + skip_pos_venda=true) e depois reabertos via RPC reabrir_card. A versão
-- atual da RPC (20260504r) limpa status_comercial e data_fechamento, mas NÃO
-- limpa skip_pos_venda. Resultado: o card volta pra status='aberto' carregando
-- skip_pos_venda=true, e a UI esconde o botão "Sem Pós-Venda" porque a
-- condição é !skip_pos_venda. Usuário perde a opção de alternar entre os modos.
--
-- Fix defensivo via trigger: garante que qualquer transição de status
-- ganho|perdido → aberto reseta skip_pos_venda=false. Cobre não só reabrir_card
-- como qualquer outro caminho (frontend, automation, manual edit). Optei por
-- trigger em vez de recriar reabrir_card pra não introduzir regressão (a RPC
-- foi modificada várias vezes e tem decisões cruzadas com analytics).
--
-- Backfill: 9 cards detectados em produção em estado inconsistente, todos em
-- fase pos_venda. Limpa skip_pos_venda + data_fechamento (incoerente com
-- status='aberto').
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. Backfill — corrigir os cards já em estado inconsistente
-- ============================================================================
UPDATE cards c
SET
    skip_pos_venda = false,
    data_fechamento = NULL,
    updated_at = NOW()
FROM pipeline_stages s
JOIN pipeline_phases pp ON pp.id = s.phase_id
WHERE c.pipeline_stage_id = s.id
  AND c.status_comercial = 'aberto'
  AND c.skip_pos_venda = true
  AND pp.slug = 'pos_venda'
  AND c.deleted_at IS NULL;

-- ============================================================================
-- 2. Trigger — auto-limpar skip_pos_venda em qualquer caminho de reabertura
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_clear_skip_pos_venda_on_reopen()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $fn$
BEGIN
    IF NEW.status_comercial = 'aberto'
       AND OLD.status_comercial IN ('ganho', 'perdido')
       AND COALESCE(NEW.skip_pos_venda, false) = true THEN
        NEW.skip_pos_venda := false;
    END IF;
    RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_clear_skip_pos_venda_on_reopen ON cards;

CREATE TRIGGER trg_clear_skip_pos_venda_on_reopen
BEFORE UPDATE ON cards
FOR EACH ROW
WHEN (
    OLD.status_comercial IS DISTINCT FROM NEW.status_comercial
)
EXECUTE FUNCTION public.fn_clear_skip_pos_venda_on_reopen();

COMMENT ON FUNCTION public.fn_clear_skip_pos_venda_on_reopen() IS
  'Garante que reabertura (ganho|perdido → aberto) sempre reseta skip_pos_venda. Defesa em profundidade contra reabrir_card e outros caminhos que esquecem de limpar o flag.';

COMMIT;
