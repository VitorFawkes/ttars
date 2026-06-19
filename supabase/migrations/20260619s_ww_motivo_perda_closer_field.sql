-- ============================================================================
-- WEDDINGS — Campo "Motivo da perda (Closer)" na tela do Closer
-- ============================================================================
-- Handoff §FRENTE C: "Motivo da perda (Closer) / ww_motivo_perda_closer /
--   Lista do Active (deal 47), editável no admin."
--
-- Estado hoje: o mapa do ActiveCampaign JÁ traz deal 47 → ww_motivo_perda_closer
--   (inbound, gravado em produto_data), mas NÃO existe system_field com essa chave
--   na org WEDDING → o valor chega do Active e fica invisível (nada renderiza).
--
-- Fix: registrar o system_field ww_motivo_perda_closer (type text) na seção do Closer,
--   pra o motivo que veio do Active aparecer no card. O motivo de perda ESTRUTURADO e
--   admin-editável continua sendo motivo_perda_id (loss_reason_selector, lista
--   motivos_perda por-org, já compartilhada SDR/Closer — o analytics nativo 20260619l
--   separa SDR×Closer por progressão do card). Este campo apenas EXIBE o texto do Active.
--
-- ISOLAMENTO: INSERT só na org WEDDING (…002), produto_exclusivo=WEDDING. Idempotente.
-- REVERSÍVEL: é um system_field; basta active=false ou DELETE da linha.
-- ============================================================================

BEGIN;

INSERT INTO public.system_fields (key, org_id, label, type, section, active, is_system, options, order_index, produto_exclusivo)
SELECT 'ww_motivo_perda_closer', 'b0000000-0000-0000-0000-000000000002'::uuid,
       'Motivo da perda (Closer)', 'text', 'wedding_closer', true, true, NULL, 200, 'WEDDING'
WHERE NOT EXISTS (
    SELECT 1 FROM public.system_fields sf
    WHERE sf.key = 'ww_motivo_perda_closer'
      AND sf.org_id = 'b0000000-0000-0000-0000-000000000002'::uuid
);

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- VERIFICAÇÃO (REST):
--   system_fields?org_id=eq.b0000000-0000-0000-0000-000000000002
--     &key=eq.ww_motivo_perda_closer&select=key,label,type,section,active
--   Esperado: 1 linha, type=text, section=wedding_closer, active=true.
-- ============================================================================
