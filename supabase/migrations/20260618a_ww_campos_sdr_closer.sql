-- ============================================================================
-- WEDDINGS — Campos do funil SDR + Closer (Handoff Mateus/Vitor 17/06)
-- ============================================================================
-- Objetivo: deixar no card do Weddings "só os campos que importam".
--   1) CRIA campos novos pedidos pela spec (Closer: previsões; SDR: pesquisou).
--   2) REATIVA campos de qualificação/decisão que a spec quer de volta.
--   3) DESATIVA os 25 resíduos do Trips (seções trip_info / marketing) que
--      vazaram no card do Weddings.
--
-- ISOLAMENTO: mexe SOMENTE em system_fields da org WEDDING
--   (b0000000-0000-0000-0000-000000000002). NÃO toca em nenhum dado do Trips.
--   As seções trip_info/marketing pertencem à org TRIPS (…0001) e NÃO são
--   alteradas — escondê-las no Weddings é consequência de desativar os campos
--   (DynamicSectionWidget retorna null quando a seção fica sem campos visíveis).
--
-- REVERSÍVEL: tudo é toggle de `active`. Sem DROP, sem perda de dado.
--
-- NOTA sobre o Score: a "Pontuação SDR" hoje é 100% ai_subjective (a IA calcula
--   a partir da conversa — ai_agent_scoring_rules, todas condition_type=ai_subjective).
--   Os campos reativados/criados abaixo são para a SDR REGISTRAR/VER as respostas;
--   eles NÃO alimentam o score sob a config atual ("usar a config atual"). Marcar
--   o checkbox não muda a nota — quem dá a nota é a IA.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1) CRIAR campos novos (idempotente via WHERE NOT EXISTS)
-- ----------------------------------------------------------------------------
INSERT INTO public.system_fields (key, org_id, label, type, section, active, is_system, options, order_index, produto_exclusivo)
SELECT v.key, 'b0000000-0000-0000-0000-000000000002'::uuid, v.label, v.type, v.section, true, true, NULL, v.order_index, 'WEDDING'
FROM (VALUES
    ('ww_closer_previsao_fechamento',   'Previsão de fechamento',            'date',     'wedding_closer', 120),
    ('ww_closer_previsao_investimento', 'Previsão de investimento',          'currency', 'wedding_closer', 130),
    ('ww_closer_previsao_destino',      'Previsão de destino',               'text',     'wedding_closer', 140),
    ('ww_sdr_pesquisou_concorrencia',   'Pesquisou outras produtoras/hotéis','boolean',  'wedding_sdr',    215)
) AS v(key, label, type, section, order_index)
WHERE NOT EXISTS (
    SELECT 1 FROM public.system_fields sf
    WHERE sf.key = v.key AND sf.org_id = 'b0000000-0000-0000-0000-000000000002'::uuid
);

-- ----------------------------------------------------------------------------
-- 2) REATIVAR campos que a spec quer de volta (inputs registrados pela SDR +
--    nº venda Monde do Closer + data do casamento)
-- ----------------------------------------------------------------------------
UPDATE public.system_fields
SET active = true
WHERE org_id = 'b0000000-0000-0000-0000-000000000002'::uuid
  AND key IN (
    'ww_sdr_perfil_viagem_internacional',
    'ww_sdr_ajuda_familia',
    'ww_sdr_referencia_casamento_premium',
    'ww_sdr_flexibilidade',
    'ww_data_casamento',
    'ww_closer_monde_venda'
  );

-- ----------------------------------------------------------------------------
-- 3) DESATIVAR resíduos do Trips no card do Weddings (25 campos).
--    Filtro por seção: todas as linhas ATIVAS dessas 2 seções na org WEDDING
--    são herança do Trips (auditado 18/06). Reversível.
-- ----------------------------------------------------------------------------
UPDATE public.system_fields
SET active = false
WHERE org_id = 'b0000000-0000-0000-0000-000000000002'::uuid
  AND section IN ('trip_info', 'marketing_informacoes_preenchidas')
  AND active = true;

COMMIT;

-- ============================================================================
-- VERIFICAÇÃO (rodar via REST após aplicar):
--   -- novos campos criados (esperado: 4 linhas, active=true):
--   system_fields?org_id=eq.b0000000-0000-0000-0000-000000000002
--     &key=in.(ww_closer_previsao_fechamento,ww_closer_previsao_investimento,ww_closer_previsao_destino,ww_sdr_pesquisou_concorrencia)
--     &select=key,active,section
--   -- residuais Trips desativados (esperado: 0 linhas):
--   system_fields?org_id=eq.b0000000-0000-0000-0000-000000000002
--     &section=in.(trip_info,marketing_informacoes_preenchidas)&active=eq.true&select=key
-- ============================================================================
