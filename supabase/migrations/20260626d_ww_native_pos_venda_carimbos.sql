-- 20260626d_ww_native_pos_venda_carimbos.sql
-- ============================================================================
-- ww_funil_casal_native: passa a CARIMBAR a entrada em Planejamento e Produção.
--
-- Contexto: as colunas entrou_planejamento_at / entrou_producao_at eram NULL
-- fixo (placeholder honesto). Isso deixava a aba Diretoria/Operação sem tempo
-- nessas 2 fases E zerava os contadores de fluxo do ww_diretoria_overview
-- (planej_now/prod_now/...). Investigação 26/06 confirmou que NÃO existe fonte
-- única confiável de "quando o card entrou na fase pós-venda" no grão do card:
--   - activities (stage_changed): só captura desde 24/06 (gatilho recente);
--   - ww_funil_casal: carimba a entrada, mas é por contact_id do Active (numérico)
--     e NÃO casa com o grão por-card desta view.
-- Solução (forward + backfill parcial, sem inventar número):
--   entrou_planejamento_at = COALESCE(
--       activities → 1ª entrada numa etapa de pos_venda que NÃO é Produção,
--       ww_deal_event → 1ª esteira Planejamento (to_id='4') do deal do Active)
--   entrou_producao_at = COALESCE(
--       activities → 1ª entrada na etapa "Produção …",
--       ww_deal_event → 1ª esteira Produção (to_id='22'))
-- Daqui pra frente o gatilho de stage_changed alimenta as activities → a coluna
-- se preenche sozinha conforme os casais avançam. Hoje preenche 103 (planej) /
-- 22 (prod) de 3159 linhas; contagem de linhas da view NÃO muda.
--
-- Blast radius: as 2 colunas só são lidas por ww_diretoria_overview e
-- ww_diretoria_tempos (grep em supabase/migrations confirma). Nenhuma outra aba
-- referencia. Demais colunas IDÊNTICAS à def viva (pg_get_viewdef 26/06, SOP).
-- ============================================================================

CREATE OR REPLACE VIEW public.ww_funil_casal_native AS
 WITH stage_entry AS (
         SELECT a.card_id,
            min(a.created_at) FILTER (WHERE (a.metadata ->> 'new_stage_name'::text) = 'Reunião Agendada'::text) AS sdr_agendada_at,
            min(a.created_at) FILTER (WHERE (a.metadata ->> 'new_stage_name'::text) = 'Reunião Realizada'::text) AS sdr_realizada_at,
            min(a.created_at) FILTER (WHERE (a.metadata ->> 'new_stage_name'::text) = '1ª Reunião'::text) AS closer_1a_at,
            min(a.created_at) FILTER (WHERE (a.metadata ->> 'new_stage_name'::text) = 'Em contato'::text) AS closer_contato_at,
            min(a.created_at) FILTER (WHERE (a.metadata ->> 'new_stage_name'::text) = 'Contrato enviado'::text) AS closer_contrato_at,
            min(a.created_at) FILTER (WHERE (a.metadata ->> 'new_stage_name'::text) = 'Em negociação'::text) AS closer_negociacao_at
           FROM activities a
          WHERE a.tipo = 'stage_changed'::text AND a.org_id = 'b0000000-0000-0000-0000-000000000002'::uuid
          GROUP BY a.card_id
        ),
      -- 20260626d: entrada em pós-venda derivada das activities (classifica a
      -- etapa-destino pela FASE, não por nome — robusto a renome dentro da fase).
      -- s.id::text = metadata->>'new_stage_id' evita erro de cast quando o
      -- metadata não tiver um uuid válido.
      pos_venda_entry AS (
         SELECT a.card_id,
            min(a.created_at) FILTER (WHERE ph.slug = 'pos_venda'::text AND s.nome !~~* 'produ%'::text) AS planej_act_at,
            min(a.created_at) FILTER (WHERE ph.slug = 'pos_venda'::text AND s.nome  ~~* 'produ%'::text) AS prod_act_at
           FROM activities a
             JOIN pipeline_stages s ON s.id::text = (a.metadata ->> 'new_stage_id'::text)
             JOIN pipeline_phases ph ON ph.id = s.phase_id
          WHERE a.tipo = 'stage_changed'::text AND a.org_id = 'b0000000-0000-0000-0000-000000000002'::uuid
          GROUP BY a.card_id
        ),
      -- 20260626d: backfill parcial pela timeline do Active (event_ts = cdate real).
      ac_esteira AS (
         SELECT e.ac_deal_id,
            min(e.event_ts) FILTER (WHERE e.to_id = '4'::text)  AS planej_ac_at,
            min(e.event_ts) FILTER (WHERE e.to_id = '22'::text) AS prod_ac_at
           FROM ww_deal_event e
          WHERE e.org_id = 'b0000000-0000-0000-0000-000000000002'::uuid
            AND e.kind = 'esteira'::text AND e.to_id IN ('4'::text, '22'::text)
          GROUP BY e.ac_deal_id
        ), base AS (
         SELECT c.id,
            c.titulo,
            c.produto,
            c.pessoa_principal_id,
            c.sdr_owner_id,
            c.vendas_owner_id,
            c.pos_owner_id,
            c.concierge_owner_id,
            c.dono_atual_id,
            c.pipeline_stage_id,
            c.status_comercial,
            c.motivo_perda_id,
            c.estado_operacional,
            c.valor_estimado,
            c.valor_final,
            c.moeda,
            c.created_at,
            c.updated_at,
            c.created_by,
            c.updated_by,
            c.codigo_cliente_erp,
            c.codigo_projeto_erp,
            c.forma_pagamento,
            c.condicoes_pagamento,
            c.pronto_para_contrato,
            c.pronto_para_erp,
            c.data_pronto_erp,
            c.taxa_ativa,
            c.taxa_valor,
            c.taxa_status,
            c.taxa_data_status,
            c.taxa_meio_pagamento,
            c.taxa_codigo_transacao,
            c.taxa_alterado_por,
            c.prioridade,
            c.data_viagem_inicio,
            c.pipeline_id,
            c.produto_data,
            c.cliente_recorrente,
            c.origem,
            c.external_id,
            c.external_source,
            c.campaign_id,
            c.briefing_inicial,
            c.data_viagem_fim,
            c.stage_entered_at,
            c.parent_card_id,
            c.is_group_parent,
            c.group_capacity,
            c.group_total_revenue,
            c.group_total_pax,
            c.marketing_data,
            c.deleted_at,
            c.deleted_by,
            c.motivo_perda_comentario,
            c.data_fechamento,
            c.origem_lead,
            c.utm_source,
            c.utm_medium,
            c.utm_campaign,
            c.utm_content,
            c.utm_term,
            c.mkt_buscando_para_viagem,
            c.epoca_mes_inicio,
            c.epoca_mes_fim,
            c.epoca_ano,
            c.epoca_tipo,
            c.duracao_dias_min,
            c.duracao_dias_max,
            c.ganho_sdr,
            c.ganho_sdr_at,
            c.ganho_planner,
            c.ganho_planner_at,
            c.ganho_pos,
            c.ganho_pos_at,
            c.card_type,
            c.sub_card_mode,
            c.sub_card_status,
            c.merged_at,
            c.merged_by,
            c.merge_metadata,
            c.locked_fields,
            c.archived_at,
            c.archived_by,
            c.receita,
            c.receita_source,
            c.ai_resumo,
            c.ai_contexto,
            c.ai_responsavel,
            c.indicado_por_id,
            c.merge_config,
            c.valor_proprio,
            c.sub_card_agregado_em,
            c.sub_card_category,
            c.org_id,
            c.stage_changed_at,
            c.quality_score_pct,
            c.lead_entry_path,
            c.first_response_at,
            c.ai_pause_config,
            c.is_critical,
            c.skip_pos_venda,
            c.titulo_locked_at,
            c.sdr_qualification_score_latest,
            c.test_agent_id,
            se.sdr_agendada_at,
            se.sdr_realizada_at,
            se.closer_1a_at,
            se.closer_contato_at,
            se.closer_contrato_at,
            se.closer_negociacao_at,
            COALESCE(pve.planej_act_at, ace.planej_ac_at) AS entrou_planejamento_at,
            COALESCE(pve.prod_act_at,   ace.prod_ac_at)   AS entrou_producao_at,
            ps.is_lost AS stage_is_lost,
            COALESCE(c.vendas_owner_id, c.sdr_owner_id, c.dono_atual_id) AS v_consultor_id,
                CASE
                    WHEN COALESCE(c.produto_data ->> 'ww_tipo_casamento'::text, ''::text) ~~* '%elopement%'::text OR COALESCE(c.produto_data ->> 'ww_tipo_casamento'::text, ''::text) ~~* '%elopment%'::text THEN 'Elopement'::text
                    WHEN COALESCE(c.produto_data ->> 'ww_tipo_casamento'::text, ''::text) = ''::text AND c.titulo ~~* 'elopement%'::text THEN 'Elopement'::text
                    ELSE 'DW'::text
                END AS v_tipo,
            _ww_native_ts(c.produto_data ->> 'ww_sdr_data_reuniao'::text) AS f_sdr_data,
            NULLIF(TRIM(BOTH FROM c.produto_data ->> 'ww_sdr_como_reuniao'::text), ''::text) AS f_sdr_como,
            _ww_native_ts(c.produto_data ->> 'ww_closer_data_reuniao'::text) AS f_closer_data,
            NULLIF(TRIM(BOTH FROM c.produto_data ->> 'ww_closer_como_reuniao'::text), ''::text) AS f_closer_como,
            _ww_native_ts(c.produto_data ->> 'ww_closer_data_ganho'::text) AS f_ganho_data
           FROM cards c
             LEFT JOIN stage_entry se ON se.card_id = c.id
             LEFT JOIN pos_venda_entry pve ON pve.card_id = c.id
             LEFT JOIN ac_esteira ace ON ace.ac_deal_id = c.external_id
             LEFT JOIN pipeline_stages ps ON ps.id = c.pipeline_stage_id
          WHERE c.org_id = 'b0000000-0000-0000-0000-000000000002'::uuid AND c.produto = 'WEDDING'::app_product AND c.deleted_at IS NULL AND c.test_agent_id IS NULL AND c.titulo !~~* '%teste%'::text AND NOT (c.external_id IS NULL AND (c.titulo ~~* '%(via sofia)%'::text OR lower(btrim(c.titulo)) = 'mcqueen'::text))
        )
 SELECT b.org_id,
    b.id::text AS contact_id,
    b.titulo AS deal_title,
    b.v_tipo AS tipo,
    b.v_tipo = 'Elopement'::text AS is_elopement,
    b.created_at AS lead_created_at,
    b.closer_1a_at AS entrou_closer_at,
    b.closer_1a_at AS entrou_1a_reuniao_at,
    b.closer_contrato_at AS entrou_contrato_enviado_at,
    b.closer_negociacao_at AS entrou_negociacao_at,
    NULL::timestamp with time zone AS entrou_op_futura_at,
    b.entrou_planejamento_at,
    b.entrou_producao_at,
    NULL::timestamp with time zone AS entrou_controle_at,
    NULL::timestamp with time zone AS elopement_assinatura_at,
    COALESCE(b.f_sdr_data, b.sdr_agendada_at) AS sdr_agendou_at,
    _ww_norm_canal_strict(b.produto_data ->> 'ww_sdr_como_reuniao'::text) AS sdr_canal,
    COALESCE(b.f_closer_data, b.ganho_sdr_at, b.closer_1a_at) AS closer_agendou_at,
    _ww_norm_canal_strict(b.produto_data ->> 'ww_closer_como_reuniao'::text) AS closer_canal,
    COALESCE(b.f_sdr_data, b.sdr_agendada_at) IS NOT NULL AS agendou_sdr,
    COALESCE(b.f_sdr_data, b.sdr_agendada_at) AS agendou_sdr_at,
    b.f_sdr_como IS NOT NULL OR b.sdr_realizada_at IS NOT NULL AS fez_sdr,
    COALESCE(
        CASE
            WHEN b.f_sdr_como IS NOT NULL THEN b.f_sdr_data
            ELSE NULL::timestamp with time zone
        END, b.sdr_realizada_at, b.f_sdr_data) AS fez_sdr_at,
        CASE
            WHEN b.f_sdr_como IS NOT NULL THEN 'campo_analytics'::text
            ELSE 'ttars_stage_log'::text
        END AS fez_sdr_fonte,
    COALESCE(b.f_closer_data, b.ganho_sdr_at, b.closer_1a_at) IS NOT NULL AS agendou_closer,
    COALESCE(b.f_closer_data, b.ganho_sdr_at, b.closer_1a_at) AS agendou_closer_at,
        CASE
            WHEN b.f_closer_data IS NOT NULL THEN 'campo_analytics'::text
            ELSE 'ttars'::text
        END AS agendou_closer_fonte,
    b.f_closer_como IS NOT NULL OR b.closer_contato_at IS NOT NULL AS fez_closer,
    COALESCE(
        CASE
            WHEN b.f_closer_como IS NOT NULL THEN b.f_closer_data
            ELSE NULL::timestamp with time zone
        END, b.closer_contato_at) AS fez_closer_at,
        CASE
            WHEN b.f_closer_como IS NOT NULL THEN 'campo_analytics'::text
            ELSE 'ttars'::text
        END AS fez_closer_fonte,
    (b.f_ganho_data IS NOT NULL OR b.status_comercial = 'ganho'::text) AND NOT COALESCE(b.stage_is_lost, false) AND b.status_comercial IS DISTINCT FROM 'perdido'::text AS ganho,
    COALESCE(b.f_ganho_data,
        CASE
            WHEN b.status_comercial = 'ganho'::text THEN COALESCE(b.data_fechamento, b.ganho_planner_at, b.updated_at)
            ELSE NULL::timestamp with time zone
        END) AS ganho_at,
        CASE
            WHEN b.f_ganho_data IS NOT NULL THEN 'campo_analytics'::text
            ELSE 'ttars_status'::text
        END AS ganho_fonte,
    b.status_comercial = 'perdido'::text AS is_perdido,
    now() AS refreshed_at,
    _ww2_norm_faixa_strict(COALESCE(b.produto_data ->> 'ww_orcamento_faixa'::text, b.produto_data ->> 'ww_mkt_orcamento_form'::text)) AS faixa,
    _ww2_norm_conv_strict(COALESCE(b.produto_data ->> 'ww_num_convidados'::text, b.produto_data ->> 'ww_mkt_convidados_form'::text, b.produto_data ->> 'ww_convidados_refinado'::text)) AS convidados,
    _ww2_norm_dest_strict(COALESCE(b.produto_data ->> 'ww_destino'::text, b.produto_data ->> 'ww_mkt_destino_form'::text, b.produto_data ->> 'ww_onde_casar_refinado'::text)) AS destino,
    _ww_native_norm_origem(COALESCE(NULLIF(b.produto_data ->> 'ww_sdr_como_conheceu'::text, ''::text), NULLIF(b.utm_source, ''::text))) AS origem,
    b.v_consultor_id AS consultor_id,
    p.nome AS consultor_nome,
    b.v_tipo <> 'Elopement'::text AS entrou_sdr,
    b.v_tipo = 'Elopement'::text AS entrou_elopement,
    b.v_tipo AS tipo_entrada,
    true AS entrou_valido,
    b.valor_final
   FROM base b
     LEFT JOIN profiles p ON p.id = b.v_consultor_id;
