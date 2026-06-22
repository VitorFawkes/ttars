-- ============================================================================
-- 20260622f_ww_native_destino_realidade.sql
-- ----------------------------------------------------------------------------
-- FIX (audit Analytics 2, entrada-2): a aba "Entrada × Realidade" inflava o
-- "manteve" do destino ("Vendeu para onde disse"). Causa: vw_ww_funnel_base_native
-- derivava destino_final = COALESCE(destino_refinado, destino_declarado). Para um
-- card GANHO sem destino refinado, destino_final caía no declarado → dest_e = dest_v
-- → contava como "manteve" (~90% manteve, artificial).
--
-- destino_final é a "realidade" (o que foi VENDIDO). Sem destino refinado, não há
-- realidade conhecida → deve ser NULL (entra em "sem dado", não em "manteve").
-- Consumidor único do destino_final NATIVO: ww_v2_drift_venda_native (verificado via
-- pg_proc). Os gêmeos AC (ww_v2_drift_venda, ww2_journey) leem vw_ww_funnel_base (AC),
-- não esta view → sem efeito colateral.
--
-- Recria a view a partir da def viva, mudando SÓ a linha de destino_final. Mesma
-- ordem de colunas → CREATE OR REPLACE passa. Zero mutação de dados.
-- ============================================================================

BEGIN;

CREATE OR REPLACE VIEW public.vw_ww_funnel_base_native AS
 SELECT n.contact_id AS ac_deal_id,
    n.contact_id,
    NULL::uuid AS pipeline_group_id,
    n.deal_title,
    true AS is_ww,
    n.sdr_agendou_at IS NOT NULL AS marcou_sdr,
    n.fez_sdr,
    n.closer_agendou_at IS NOT NULL AS marcou_closer,
    n.fez_closer,
    n.ganho,
    n.sdr_agendou_at,
    n.closer_agendou_at,
    n.ganho_at,
    n.sdr_canal,
    n.closer_canal,
    c.produto_data ->> 'ww_closer_valor_pacote'::text AS real_orcamento_raw,
        CASE
            WHEN (c.produto_data ->> 'ww_closer_valor_pacote'::text) ~ '[0-9]'::text THEN NULLIF(regexp_replace(replace(replace(c.produto_data ->> 'ww_closer_valor_pacote'::text, '.'::text, ''::text), ','::text, '.'::text), '[^0-9.]'::text, ''::text, 'g'::text), ''::text)::numeric
            ELSE NULL::numeric
        END AS real_orcamento_parsed,
    c.produto_data ->> 'ww_convidados_refinado'::text AS real_convidados_raw,
        CASE _ww2_norm_conv_strict(c.produto_data ->> 'ww_convidados_refinado'::text)
            WHEN 'Apenas o casal'::text THEN 2
            WHEN 'Até 20'::text THEN 15
            WHEN '20-50'::text THEN 35
            WHEN '50-100'::text THEN 75
            WHEN '+100'::text THEN 130
            ELSE NULL::integer
        END AS real_convidados_parsed,
        CASE
            WHEN (c.produto_data ->> 'ww_convidados_refinado'::text) IS NOT NULL THEN 'ttars_convidados_refinado'::text
            ELSE NULL::text
        END AS real_convidados_fonte,
    c.id AS card_id,
    c.org_id,
    c.created_at AS card_created_at,
    c.status_comercial,
    c.valor_final,
    c.titulo AS card_titulo,
    c.sdr_owner_id,
    c.vendas_owner_id,
    c.pos_owner_id,
    c.dono_atual_id,
    n.faixa,
    n.convidados,
    n.destino,
    -- FIX entrada-2: "realidade" = só o destino REFINADO. Sem refino → NULL (sem dado),
    -- não cai no declarado (que fabricava "manteve"). Antes: COALESCE(refinado, n.destino).
    _ww2_norm_dest_strict(c.produto_data ->> 'ww_onde_casar_refinado'::text) AS destino_final,
    n.origem,
    n.tipo,
    COALESCE(n.lead_created_at, n.sdr_agendou_at, n.closer_agendou_at, n.ganho_at) AS data_entrada
   FROM ww_funil_casal_native n
     JOIN cards c ON c.id = n.contact_id::uuid;

COMMIT;

NOTIFY pgrst, 'reload schema';
