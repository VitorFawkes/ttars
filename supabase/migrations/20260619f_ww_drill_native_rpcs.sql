-- Migration 20260619f — Drill/ranking nativos (Analytics 2)
--
-- Clones "_native" de ww_drill_casais e ww_funil_ranking_combo. Os KPIs nativos
-- já leem a VIEW ww_funil_casal_native (montada dos campos de card do ttars), mas
-- estes dois SUB-RPCs de drill/ranking ainda liam a tabela do AC (ww_funil_casal),
-- fazendo o card de KPI (nativo, ex.: 132 leads) divergir do modal de drill (AC, 120).
--
-- Cada clone é cópia VERBATIM do corpo em produção, com UMA única mudança mecânica:
-- a tabela ww_funil_casal -> ww_funil_casal_native (1 ocorrência por função, no FROM
-- principal). Tudo o mais é idêntico: mesma assinatura, mesmo tipo de retorno, mesmo
-- shape JSON/linha e os mesmos joins a ww_ac_deal_funnel_cache/cards (que resolvem
-- para cards vindos do AC; para cards só-nativos retornam NULL — ok para exibição).
-- GRANTs replicados dos originais: authenticated + service_role (anon: nenhum).

BEGIN;

-- ── 1) ww_drill_casais_native ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.ww_drill_casais_native(p_date_start timestamp with time zone DEFAULT (now() - '30 days'::interval), p_date_end timestamp with time zone DEFAULT now(), p_date_mode text DEFAULT 'cohort'::text, p_org_id uuid DEFAULT NULL::uuid, p_marco text DEFAULT NULL::text, p_phase_slug text DEFAULT NULL::text, p_faixa text DEFAULT NULL::text, p_destino text DEFAULT NULL::text, p_convidados text DEFAULT NULL::text, p_origem text DEFAULT NULL::text, p_tipo text DEFAULT NULL::text, p_campaign text DEFAULT NULL::text, p_medium text DEFAULT NULL::text, p_motivo_perda text DEFAULT NULL::text, p_motivo_role text DEFAULT NULL::text, p_consultor_id uuid DEFAULT NULL::uuid, p_status_lead text DEFAULT NULL::text, p_origins text[] DEFAULT NULL::text[], p_faixas text[] DEFAULT NULL::text[], p_destinos text[] DEFAULT NULL::text[], p_convidados_list text[] DEFAULT NULL::text[], p_tipos text[] DEFAULT NULL::text[], p_consultor_ids uuid[] DEFAULT NULL::uuid[], p_sdr_canal text[] DEFAULT NULL::text[], p_closer_canal text[] DEFAULT NULL::text[], p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_org_id UUID := COALESCE(p_org_id, requesting_org_id());
    v_total INT;
    v_rows JSON;
    -- etapas reais "Onde estão agora" (snapshot, sem corte de período) — espelha ww2_overview v10
    v_etapas_reais TEXT[] := ARRAY['sdr_triagem','sdr_follow_up','sdr_reagendamento','sdr_qualificacao','sdr_taxa','sdr_qualificado','sdr_standby','closer_reagendamento','closer_primeira_reuniao','closer_em_contato','closer_contrato','closer_negociacao','closer_oportunidade','closer_dados','closer_standby'];
BEGIN
    CREATE TEMP TABLE _ww_dc ON COMMIT DROP AS
    SELECT c.contact_id, c.deal_title, c.tipo, c.tipo_entrada, c.entrou_valido, c.lead_created_at,
           c.faixa, c.convidados, c.destino, c.origem, c.consultor_id, c.consultor_nome,
           _ww_norm_canal_strict(c.sdr_canal)    AS canal_sdr,
           _ww_norm_canal_strict(c.closer_canal) AS canal_closer,
           c.agendou_sdr, c.agendou_sdr_at, c.fez_sdr, c.fez_sdr_at,
           c.agendou_closer, c.agendou_closer_at, c.fez_closer, c.fez_closer_at,
           c.ganho, c.ganho_at, c.is_perdido,
           -- v6 (20260618a): etapa ATUAL do Active (cache) — mesma régua do "Onde estão agora" v10
           cs.cur_stage AS cur
      FROM ww_funil_casal_native c
      LEFT JOIN (
          -- etapa atual do casal vinda da cache (deal.stage do Active); prioriza esteira SDR (grupo 1)
          SELECT DISTINCT ON (contact_id) contact_id, ac_current_stage_id AS cur_stage
            FROM ww_ac_deal_funnel_cache
           WHERE is_ww AND ac_current_stage_id IS NOT NULL
           ORDER BY contact_id, (pipeline_group_id = 1) DESC, synced_at DESC
      ) cs ON cs.contact_id = c.contact_id
     WHERE c.org_id = v_org_id
       AND (CASE
              -- etapas reais ("Onde estão agora"): SNAPSHOT — sem corte de período (espelha v10)
              WHEN p_phase_slug = ANY(v_etapas_reais) THEN TRUE
              WHEN p_date_mode = 'throughput' AND p_marco IS NOT NULL THEN TRUE
              WHEN p_date_mode = 'throughput' THEN
                   (c.lead_created_at   BETWEEN p_date_start AND p_date_end)
                OR (c.agendou_sdr_at    BETWEEN p_date_start AND p_date_end)
                OR (c.agendou_closer_at BETWEEN p_date_start AND p_date_end)
                OR (c.ganho_at          BETWEEN p_date_start AND p_date_end)
              ELSE (c.lead_created_at BETWEEN p_date_start AND p_date_end)
            END);

    -- ── Marco do funil ──
    IF p_marco IS NOT NULL THEN
        IF p_date_mode = 'throughput' THEN
            -- o que ACONTECEU no período: marco pela própria data (régua da ww_serie_temporal).
            -- COALESCE(..., FALSE): *_at NULL não pode escapar do corte (3-valued logic).
            CASE p_marco
                WHEN 'entrou'        THEN DELETE FROM _ww_dc WHERE NOT COALESCE(lead_created_at BETWEEN p_date_start AND p_date_end AND entrou_valido, FALSE);
                WHEN 'marcou_sdr'    THEN DELETE FROM _ww_dc WHERE NOT COALESCE(agendou_sdr    AND agendou_sdr_at    BETWEEN p_date_start AND p_date_end, FALSE);
                WHEN 'fez_sdr'       THEN DELETE FROM _ww_dc WHERE NOT COALESCE(fez_sdr        AND fez_sdr_at        BETWEEN p_date_start AND p_date_end, FALSE);
                WHEN 'marcou_closer' THEN DELETE FROM _ww_dc WHERE NOT COALESCE(agendou_closer AND agendou_closer_at BETWEEN p_date_start AND p_date_end, FALSE);
                WHEN 'fez_closer'    THEN DELETE FROM _ww_dc WHERE NOT COALESCE(fez_closer     AND fez_closer_at     BETWEEN p_date_start AND p_date_end, FALSE);
                WHEN 'ganho'         THEN DELETE FROM _ww_dc WHERE NOT COALESCE(ganho          AND ganho_at          BETWEEN p_date_start AND p_date_end, FALSE);
                WHEN 'perdido'       THEN DELETE FROM _ww_dc WHERE NOT (COALESCE(is_perdido, FALSE) AND COALESCE(
                                             (lead_created_at BETWEEN p_date_start AND p_date_end)
                                          OR (agendou_sdr_at BETWEEN p_date_start AND p_date_end)
                                          OR (agendou_closer_at BETWEEN p_date_start AND p_date_end), FALSE));
                WHEN 'aberto'        THEN DELETE FROM _ww_dc WHERE COALESCE(ganho, FALSE) OR COALESCE(is_perdido, FALSE) OR NOT COALESCE(
                                             (lead_created_at BETWEEN p_date_start AND p_date_end)
                                          OR (agendou_sdr_at BETWEEN p_date_start AND p_date_end)
                                          OR (agendou_closer_at BETWEEN p_date_start AND p_date_end), FALSE);
                ELSE RAISE EXCEPTION 'p_marco inválido: %', p_marco;
            END CASE;
        ELSE
            -- safra: marcos CUMULATIVOS (mesma régua do ww_funil_conversao_v1)
            CASE p_marco
                WHEN 'entrou'        THEN DELETE FROM _ww_dc WHERE NOT COALESCE(entrou_valido, FALSE); -- 20260617: gateia por nascimento (= ww2_overview)
                WHEN 'marcou_sdr'    THEN DELETE FROM _ww_dc WHERE NOT COALESCE(agendou_sdr OR fez_sdr OR agendou_closer OR fez_closer OR ganho, FALSE);
                WHEN 'fez_sdr'       THEN DELETE FROM _ww_dc WHERE NOT COALESCE(fez_sdr OR agendou_closer OR fez_closer OR ganho, FALSE);
                WHEN 'marcou_closer' THEN DELETE FROM _ww_dc WHERE NOT COALESCE(agendou_closer OR fez_closer OR ganho, FALSE);
                WHEN 'fez_closer'    THEN DELETE FROM _ww_dc WHERE NOT COALESCE(fez_closer OR ganho, FALSE);
                WHEN 'ganho'         THEN DELETE FROM _ww_dc WHERE NOT COALESCE(ganho, FALSE);
                WHEN 'perdido'       THEN DELETE FROM _ww_dc WHERE NOT COALESCE(is_perdido, FALSE);
                WHEN 'aberto'        THEN DELETE FROM _ww_dc WHERE COALESCE(ganho, FALSE) OR COALESCE(is_perdido, FALSE);
                ELSE RAISE EXCEPTION 'p_marco inválido: %', p_marco;
            END CASE;
        END IF;
    END IF;

    -- ── Status do lead (filtro da barra) ──
    IF p_status_lead = 'perdido' THEN DELETE FROM _ww_dc WHERE NOT COALESCE(is_perdido, FALSE);
    ELSIF p_status_lead = 'aberto' THEN DELETE FROM _ww_dc WHERE COALESCE(ganho, FALSE) OR COALESCE(is_perdido, FALSE);
    END IF;

    -- ── Fase atual / etapa real (régua do "Onde estão agora" do ww2_overview v10) ──
    -- v6: as etapas reais filtram pela ETAPA ATUAL do Active (cur = ac_current_stage_id da cache),
    -- não mais pelo last_stage da timeline (incompleta). Won/perdido fora (salvo status='perdido').
    IF p_phase_slug IS NOT NULL THEN
        CASE p_phase_slug
            WHEN 'sdr'       THEN DELETE FROM _ww_dc WHERE COALESCE(ganho OR agendou_closer OR fez_closer, FALSE)
                                      OR (COALESCE(is_perdido, FALSE) AND COALESCE(p_status_lead, '') IS DISTINCT FROM 'perdido');
            WHEN 'closer'    THEN DELETE FROM _ww_dc WHERE COALESCE(ganho, FALSE) OR NOT COALESCE(agendou_closer OR fez_closer, FALSE)
                                      OR (COALESCE(is_perdido, FALSE) AND COALESCE(p_status_lead, '') IS DISTINCT FROM 'perdido');
            WHEN 'pos_venda' THEN DELETE FROM _ww_dc WHERE NOT COALESCE(ganho, FALSE);
            -- etapas reais SDR (grupo 1) — cur = ac_current_stage_id
            WHEN 'sdr_triagem'              THEN DELETE FROM _ww_dc WHERE cur IS DISTINCT FROM '1'    OR COALESCE(ganho, FALSE) OR (COALESCE(is_perdido, FALSE) AND COALESCE(p_status_lead, '') IS DISTINCT FROM 'perdido');
            WHEN 'sdr_follow_up'            THEN DELETE FROM _ww_dc WHERE cur IS DISTINCT FROM '3'    OR COALESCE(ganho, FALSE) OR (COALESCE(is_perdido, FALSE) AND COALESCE(p_status_lead, '') IS DISTINCT FROM 'perdido');
            WHEN 'sdr_reagendamento'        THEN DELETE FROM _ww_dc WHERE cur IS DISTINCT FROM '201'  OR COALESCE(ganho, FALSE) OR (COALESCE(is_perdido, FALSE) AND COALESCE(p_status_lead, '') IS DISTINCT FROM 'perdido');
            WHEN 'sdr_qualificacao'         THEN DELETE FROM _ww_dc WHERE cur IS DISTINCT FROM '7'    OR COALESCE(ganho, FALSE) OR (COALESCE(is_perdido, FALSE) AND COALESCE(p_status_lead, '') IS DISTINCT FROM 'perdido');
            WHEN 'sdr_taxa'                 THEN DELETE FROM _ww_dc WHERE cur IS DISTINCT FROM '61'   OR COALESCE(ganho, FALSE) OR (COALESCE(is_perdido, FALSE) AND COALESCE(p_status_lead, '') IS DISTINCT FROM 'perdido');
            WHEN 'sdr_qualificado'          THEN DELETE FROM _ww_dc WHERE cur IS DISTINCT FROM '8'    OR COALESCE(ganho, FALSE) OR (COALESCE(is_perdido, FALSE) AND COALESCE(p_status_lead, '') IS DISTINCT FROM 'perdido');
            WHEN 'sdr_standby'              THEN DELETE FROM _ww_dc WHERE cur IS DISTINCT FROM '60'   OR COALESCE(ganho, FALSE) OR (COALESCE(is_perdido, FALSE) AND COALESCE(p_status_lead, '') IS DISTINCT FROM 'perdido');
            -- etapas reais Closer (grupo 3) — cur = ac_current_stage_id
            WHEN 'closer_reagendamento'     THEN DELETE FROM _ww_dc WHERE cur IS DISTINCT FROM '222'  OR COALESCE(ganho, FALSE) OR (COALESCE(is_perdido, FALSE) AND COALESCE(p_status_lead, '') IS DISTINCT FROM 'perdido');
            WHEN 'closer_primeira_reuniao'  THEN DELETE FROM _ww_dc WHERE cur IS DISTINCT FROM '13'   OR COALESCE(ganho, FALSE) OR (COALESCE(is_perdido, FALSE) AND COALESCE(p_status_lead, '') IS DISTINCT FROM 'perdido');
            WHEN 'closer_em_contato'        THEN DELETE FROM _ww_dc WHERE cur IS DISTINCT FROM '14'   OR COALESCE(ganho, FALSE) OR (COALESCE(is_perdido, FALSE) AND COALESCE(p_status_lead, '') IS DISTINCT FROM 'perdido');
            WHEN 'closer_contrato'          THEN DELETE FROM _ww_dc WHERE cur IS DISTINCT FROM '15'   OR COALESCE(ganho, FALSE) OR (COALESCE(is_perdido, FALSE) AND COALESCE(p_status_lead, '') IS DISTINCT FROM 'perdido');
            WHEN 'closer_negociacao'        THEN DELETE FROM _ww_dc WHERE cur IS DISTINCT FROM '16'   OR COALESCE(ganho, FALSE) OR (COALESCE(is_perdido, FALSE) AND COALESCE(p_status_lead, '') IS DISTINCT FROM 'perdido');
            WHEN 'closer_oportunidade'      THEN DELETE FROM _ww_dc WHERE cur IS DISTINCT FROM '221'  OR COALESCE(ganho, FALSE) OR (COALESCE(is_perdido, FALSE) AND COALESCE(p_status_lead, '') IS DISTINCT FROM 'perdido');
            WHEN 'closer_dados'             THEN DELETE FROM _ww_dc WHERE cur IS DISTINCT FROM '193'  OR COALESCE(ganho, FALSE) OR (COALESCE(is_perdido, FALSE) AND COALESCE(p_status_lead, '') IS DISTINCT FROM 'perdido');
            WHEN 'closer_standby'           THEN DELETE FROM _ww_dc WHERE cur IS DISTINCT FROM '163'  OR COALESCE(ganho, FALSE) OR (COALESCE(is_perdido, FALSE) AND COALESCE(p_status_lead, '') IS DISTINCT FROM 'perdido');
            ELSE NULL; -- slug desconhecido: não corta (fase de card CRM não existe no universo Active)
        END CASE;
    END IF;

    -- ── Célula (singulares). 'Não informado' = sem valor declarado (heatmaps usam COALESCE) ──
    IF p_faixa IS NOT NULL THEN
        IF p_faixa = 'Não informado' THEN DELETE FROM _ww_dc WHERE faixa IS NOT NULL;
        ELSE DELETE FROM _ww_dc WHERE faixa IS DISTINCT FROM p_faixa; END IF;
    END IF;
    IF p_destino IS NOT NULL THEN
        IF p_destino = 'Não informado' THEN DELETE FROM _ww_dc WHERE destino IS NOT NULL;
        ELSE DELETE FROM _ww_dc WHERE destino IS DISTINCT FROM p_destino; END IF;
    END IF;
    IF p_convidados IS NOT NULL THEN
        IF p_convidados = 'Não informado' THEN DELETE FROM _ww_dc WHERE convidados IS NOT NULL;
        ELSE DELETE FROM _ww_dc WHERE convidados IS DISTINCT FROM p_convidados; END IF;
    END IF;
    IF p_origem IS NOT NULL THEN DELETE FROM _ww_dc WHERE origem IS DISTINCT FROM p_origem; END IF;
    IF p_tipo IS NOT NULL THEN DELETE FROM _ww_dc WHERE tipo_entrada IS DISTINCT FROM p_tipo; END IF;
    -- consultor: dono no Active OU dono do card (Equipe conta por dono de card)
    IF p_consultor_id IS NOT NULL THEN
        DELETE FROM _ww_dc t WHERE NOT COALESCE(
            t.consultor_id = p_consultor_id
            OR EXISTS (
                SELECT 1 FROM cards c2
                 WHERE c2.external_source = 'active_campaign' AND c2.org_id = v_org_id AND c2.deleted_at IS NULL
                   AND c2.external_id IN (SELECT fc5.ac_deal_id FROM ww_ac_deal_funnel_cache fc5
                                           WHERE fc5.contact_id = t.contact_id AND fc5.is_ww)
                   AND (c2.dono_atual_id = p_consultor_id OR c2.sdr_owner_id = p_consultor_id
                        OR c2.vendas_owner_id = p_consultor_id OR c2.pos_owner_id = p_consultor_id)
            ), FALSE);
    END IF;

    -- campanha / medium: qualquer deal do casal no cache (server-side; antes era client-side)
    IF p_campaign IS NOT NULL THEN
        DELETE FROM _ww_dc t WHERE NOT EXISTS (
            SELECT 1 FROM ww_ac_deal_funnel_cache fc
             WHERE fc.contact_id = t.contact_id AND fc.is_ww AND NULLIF(fc.utm_campaign, '') = p_campaign);
    END IF;
    IF p_medium IS NOT NULL THEN
        DELETE FROM _ww_dc t WHERE NOT EXISTS (
            SELECT 1 FROM ww_ac_deal_funnel_cache fc
             WHERE fc.contact_id = t.contact_id AND fc.is_ww AND NULLIF(fc.utm_medium, '') = p_medium);
    END IF;

    -- motivo de perda (raw do Active, mesma fonte do ww2_loss_reasons); role recorta SDR/Closer
    IF p_motivo_perda IS NOT NULL OR p_motivo_role IS NOT NULL THEN
        DELETE FROM _ww_dc t WHERE NOT EXISTS (
            SELECT 1 FROM ww_ac_deal_funnel_cache fc
             WHERE fc.contact_id = t.contact_id AND fc.is_ww
               AND (
                    (COALESCE(p_motivo_role, 'sdr') = 'sdr'
                     AND fc.motivo_perda_sdr_raw IS NOT NULL
                     AND (p_motivo_perda IS NULL OR fc.motivo_perda_sdr_raw = p_motivo_perda))
                 OR (COALESCE(p_motivo_role, 'closer') = 'closer'
                     AND fc.motivo_perda_closer_raw IS NOT NULL
                     AND (p_motivo_perda IS NULL OR fc.motivo_perda_closer_raw = p_motivo_perda))
               ));
    END IF;

    -- ── Barra (arrays) ──
    IF p_origins IS NOT NULL THEN DELETE FROM _ww_dc WHERE origem IS NULL OR origem != ALL(p_origins); END IF;
    IF p_faixas IS NOT NULL THEN DELETE FROM _ww_dc WHERE faixa IS NULL OR faixa != ALL(p_faixas); END IF;
    IF p_destinos IS NOT NULL THEN DELETE FROM _ww_dc WHERE destino IS NULL OR destino != ALL(p_destinos); END IF;
    IF p_convidados_list IS NOT NULL THEN DELETE FROM _ww_dc WHERE convidados IS NULL OR convidados != ALL(p_convidados_list); END IF;
    IF p_tipos IS NOT NULL THEN DELETE FROM _ww_dc WHERE tipo_entrada IS NULL OR tipo_entrada != ALL(p_tipos); END IF;
    IF p_consultor_ids IS NOT NULL THEN
        DELETE FROM _ww_dc t WHERE NOT COALESCE(
            t.consultor_id = ANY(p_consultor_ids)
            OR EXISTS (
                SELECT 1 FROM cards c2
                 WHERE c2.external_source = 'active_campaign' AND c2.org_id = v_org_id AND c2.deleted_at IS NULL
                   AND c2.external_id IN (SELECT fc6.ac_deal_id FROM ww_ac_deal_funnel_cache fc6
                                           WHERE fc6.contact_id = t.contact_id AND fc6.is_ww)
                   AND (c2.dono_atual_id = ANY(p_consultor_ids) OR c2.sdr_owner_id = ANY(p_consultor_ids)
                        OR c2.vendas_owner_id = ANY(p_consultor_ids) OR c2.pos_owner_id = ANY(p_consultor_ids))
            ), FALSE);
    END IF;
    IF p_sdr_canal IS NOT NULL THEN DELETE FROM _ww_dc WHERE canal_sdr IS NULL OR canal_sdr != ALL(p_sdr_canal); END IF;
    IF p_closer_canal IS NOT NULL THEN DELETE FROM _ww_dc WHERE canal_closer IS NULL OR canal_closer != ALL(p_closer_canal); END IF;

    SELECT COUNT(*) INTO v_total FROM _ww_dc;

    SELECT json_agg(row_to_json(t)) INTO v_rows FROM (
        SELECT d.contact_id, d.deal_title, d.tipo, d.lead_created_at,
               d.faixa, d.convidados, d.destino, d.origem, d.consultor_nome,
               d.canal_sdr, d.canal_closer,
               d.agendou_sdr_at, d.fez_sdr_at, d.agendou_closer_at, d.fez_closer_at, d.ganho_at,
               d.ganho, d.is_perdido,
               fc.ac_deal_id,
               NULLIF(fc.utm_campaign, '') AS campaign,
               NULLIF(fc.utm_medium, '')   AS medium,
               mot.motivo AS motivo_perda,
               cd.card_id, cd.valor_final, cd.contato_nome, cd.contato_telefone
          FROM _ww_dc d
          -- deal mais recente do casal: link "abrir no Active" + utm de exibição
          LEFT JOIN LATERAL (
              SELECT fc2.ac_deal_id, fc2.utm_campaign, fc2.utm_medium
                FROM ww_ac_deal_funnel_cache fc2
               WHERE fc2.contact_id = d.contact_id AND fc2.is_ww
               ORDER BY fc2.deal_created_at DESC NULLS LAST
               LIMIT 1
          ) fc ON TRUE
          -- motivo de perda mais recente registrado (exibição)
          LEFT JOIN LATERAL (
              SELECT COALESCE(fc3.motivo_perda_closer_raw, fc3.motivo_perda_sdr_raw) AS motivo
                FROM ww_ac_deal_funnel_cache fc3
               WHERE fc3.contact_id = d.contact_id AND fc3.is_ww
                 AND (fc3.motivo_perda_closer_raw IS NOT NULL OR fc3.motivo_perda_sdr_raw IS NOT NULL)
               ORDER BY fc3.deal_created_at DESC NULLS LAST
               LIMIT 1
          ) mot ON TRUE
          -- card do CRM (navegação /cards) + valor + contato — quando existir
          LEFT JOIN LATERAL (
              SELECT c2.id AS card_id, c2.valor_final, co.nome AS contato_nome, co.telefone AS contato_telefone
                FROM cards c2
                LEFT JOIN contatos co ON co.id = c2.pessoa_principal_id
               WHERE c2.external_source = 'active_campaign'
                 AND c2.org_id = v_org_id AND c2.deleted_at IS NULL
                 AND c2.external_id IN (SELECT fc4.ac_deal_id FROM ww_ac_deal_funnel_cache fc4
                                         WHERE fc4.contact_id = d.contact_id AND fc4.is_ww)
               ORDER BY c2.created_at DESC
               LIMIT 1
          ) cd ON TRUE
         ORDER BY CASE p_marco
                    WHEN 'ganho'         THEN d.ganho_at
                    WHEN 'fez_closer'    THEN d.fez_closer_at
                    WHEN 'marcou_closer' THEN d.agendou_closer_at
                    WHEN 'fez_sdr'       THEN d.fez_sdr_at
                    WHEN 'marcou_sdr'    THEN d.agendou_sdr_at
                    ELSE d.lead_created_at
                  END DESC NULLS LAST
         LIMIT p_limit OFFSET p_offset
    ) t;

    DROP TABLE _ww_dc;
    RETURN json_build_object('total', v_total, 'limit', p_limit, 'offset', p_offset, 'rows', COALESCE(v_rows, '[]'::JSON));
END $function$;

-- ── 2) ww_funil_ranking_combo_native ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.ww_funil_ranking_combo_native(p_date_start timestamp with time zone DEFAULT (now() - '90 days'::interval), p_date_end timestamp with time zone DEFAULT now(), p_date_mode text DEFAULT 'cohort'::text, p_org_id uuid DEFAULT NULL::uuid, p_dimensoes text[] DEFAULT ARRAY['faixa'::text], p_origins text[] DEFAULT NULL::text[], p_tipos text[] DEFAULT NULL::text[], p_consultor_ids uuid[] DEFAULT NULL::uuid[], p_sdr_canal text[] DEFAULT NULL::text[], p_closer_canal text[] DEFAULT NULL::text[], p_faixas text[] DEFAULT NULL::text[], p_convidados text[] DEFAULT NULL::text[], p_destinos text[] DEFAULT NULL::text[], p_status_lead text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_org UUID := COALESCE(p_org_id, requesting_org_id());
    v_rows JSON; v_total INT:=0; v_dims TEXT[]; v_p0 NUMERIC:=0; v_bt INT:=0; v_bg INT:=0;
BEGIN
    SELECT ARRAY(SELECT DISTINCT d FROM unnest(COALESCE(p_dimensoes, ARRAY['faixa'])) d WHERE d IN ('faixa','convidados','destino','canal_sdr','canal_closer')) INTO v_dims;
    IF v_dims IS NULL OR array_length(v_dims,1) IS NULL THEN v_dims := ARRAY['faixa']; END IF;

    CREATE TEMP TABLE _pool ON COMMIT DROP AS
    SELECT faixa, convidados, destino,
           _ww_norm_canal_strict(c.sdr_canal)    AS canal_sdr,
           _ww_norm_canal_strict(c.closer_canal) AS canal_closer,
           COALESCE(c.lead_created_at BETWEEN p_date_start AND p_date_end AND c.entrou_valido, FALSE) AS k_entrou,
           CASE WHEN p_date_mode='throughput'
                THEN COALESCE(c.agendou_sdr    AND c.agendou_sdr_at    BETWEEN p_date_start AND p_date_end, FALSE)
                ELSE COALESCE(c.agendou_sdr OR c.fez_sdr OR c.agendou_closer OR c.fez_closer OR c.ganho, FALSE) END AS k_msdr,
           CASE WHEN p_date_mode='throughput'
                THEN COALESCE(c.fez_sdr        AND c.fez_sdr_at        BETWEEN p_date_start AND p_date_end, FALSE)
                ELSE COALESCE(c.fez_sdr OR c.agendou_closer OR c.fez_closer OR c.ganho, FALSE) END AS k_fsdr,
           CASE WHEN p_date_mode='throughput'
                THEN COALESCE(c.agendou_closer AND c.agendou_closer_at BETWEEN p_date_start AND p_date_end, FALSE)
                ELSE COALESCE(c.agendou_closer OR c.fez_closer OR c.ganho, FALSE) END AS k_mclo,
           CASE WHEN p_date_mode='throughput'
                THEN COALESCE(c.fez_closer     AND c.fez_closer_at     BETWEEN p_date_start AND p_date_end, FALSE)
                ELSE COALESCE(c.fez_closer OR c.ganho, FALSE) END AS k_fclo,
           CASE WHEN p_date_mode='throughput'
                THEN COALESCE(c.ganho          AND c.ganho_at          BETWEEN p_date_start AND p_date_end, FALSE)
                ELSE COALESCE(c.ganho, FALSE) END AS k_g
      FROM ww_funil_casal_native c
     WHERE c.org_id = v_org
       AND (CASE WHEN p_date_mode='throughput' THEN
                  (c.lead_created_at    BETWEEN p_date_start AND p_date_end)
               OR (c.agendou_sdr_at     BETWEEN p_date_start AND p_date_end)
               OR (c.fez_sdr_at         BETWEEN p_date_start AND p_date_end)
               OR (c.agendou_closer_at  BETWEEN p_date_start AND p_date_end)
               OR (c.fez_closer_at      BETWEEN p_date_start AND p_date_end)
               OR (c.ganho_at           BETWEEN p_date_start AND p_date_end)
            ELSE (c.lead_created_at BETWEEN p_date_start AND p_date_end) END)
       AND (p_origins IS NULL       OR c.origem = ANY(p_origins))
       AND (p_tipos IS NULL         OR c.tipo_entrada = ANY(p_tipos))
       AND (p_consultor_ids IS NULL OR c.consultor_id = ANY(p_consultor_ids))
       AND (p_sdr_canal IS NULL     OR _ww_norm_canal_strict(c.sdr_canal) = ANY(p_sdr_canal))
       AND (p_closer_canal IS NULL  OR _ww_norm_canal_strict(c.closer_canal) = ANY(p_closer_canal))
       AND (p_faixas IS NULL        OR c.faixa = ANY(p_faixas))
       AND (p_convidados IS NULL    OR c.convidados = ANY(p_convidados))
       AND (p_destinos IS NULL      OR c.destino = ANY(p_destinos))
       AND (p_status_lead IS NULL
            OR (p_status_lead = 'perdido' AND COALESCE(c.is_perdido, FALSE))
            OR (p_status_lead = 'aberto'  AND NOT COALESCE(c.ganho, FALSE) AND NOT COALESCE(c.is_perdido, FALSE)));

    SELECT COUNT(*) FILTER (WHERE k_entrou) INTO v_total FROM _pool;
    SELECT COUNT(*) FILTER (WHERE k_entrou), COUNT(*) FILTER (WHERE k_g) INTO v_bt, v_bg FROM _pool;
    v_p0 := CASE WHEN v_bt>0 THEN v_bg::NUMERIC/v_bt ELSE 0 END;

    SELECT json_agg(json_build_object('faixa',faixa,'convidados',convidados,'destino',destino,
             'canal_sdr',canal_sdr,'canal_closer',canal_closer,'label',label,
             'entrou',entrou,'marcou_sdr',m_sdr,'fez_sdr',f_sdr,'marcou_closer',m_cl,'fez_closer',f_cl,'ganho',ganho,'taxa_pct',taxa_pct)
           ORDER BY score DESC, entrou DESC) INTO v_rows
    FROM (
        SELECT g_faixa AS faixa, g_conv AS convidados, g_dest AS destino, g_csdr AS canal_sdr, g_cclo AS canal_closer,
               concat_ws(' · ', g_faixa, g_conv, g_dest, g_csdr, g_cclo) AS label, entrou, m_sdr, f_sdr, m_cl, f_cl, ganho,
               ROUND(100.0*ganho/NULLIF(entrou,0),1) AS taxa_pct, (ganho + 15*v_p0)/(entrou+15) AS score
        FROM (
            SELECT g_faixa, g_conv, g_dest, g_csdr, g_cclo,
                   COUNT(*) FILTER (WHERE k_entrou) AS entrou,
                   COUNT(*) FILTER (WHERE k_msdr) AS m_sdr,
                   COUNT(*) FILTER (WHERE k_fsdr) AS f_sdr,
                   COUNT(*) FILTER (WHERE k_mclo) AS m_cl,
                   COUNT(*) FILTER (WHERE k_fclo) AS f_cl,
                   COUNT(*) FILTER (WHERE k_g) AS ganho
            FROM (
                SELECT CASE WHEN 'faixa'=ANY(v_dims) THEN COALESCE(faixa, 'Não informado') END AS g_faixa,
                       CASE WHEN 'convidados'=ANY(v_dims) THEN COALESCE(convidados, 'Não informado') END AS g_conv,
                       CASE WHEN 'destino'=ANY(v_dims) THEN COALESCE(destino, 'Não informado') END AS g_dest,
                       CASE WHEN 'canal_sdr'=ANY(v_dims) THEN COALESCE(canal_sdr, 'Não informado') END AS g_csdr,
                       CASE WHEN 'canal_closer'=ANY(v_dims) THEN COALESCE(canal_closer, 'Não informado') END AS g_cclo,
                       k_entrou, k_msdr, k_fsdr, k_mclo, k_fclo, k_g
                FROM _pool
            ) sel GROUP BY g_faixa, g_conv, g_dest, g_csdr, g_cclo
        ) grp ORDER BY score DESC, entrou DESC LIMIT 500
    ) r;

    DROP TABLE _pool;
    RETURN json_build_object('dimensoes',v_dims,
        'periodo',json_build_object('date_start',p_date_start,'date_end',p_date_end,'date_mode',p_date_mode),
        'total_no_periodo',v_total,'rows',COALESCE(v_rows,'[]'::JSON));
END $function$;

-- GRANTs (espelham os originais: authenticated + service_role; anon não recebe)
GRANT EXECUTE ON FUNCTION public.ww_drill_casais_native(
  timestamp with time zone, timestamp with time zone, text, uuid, text, text, text, text,
  text, text, text, text, text, text, text, uuid, text, text[], text[], text[], text[],
  text[], uuid[], text[], text[], integer, integer
) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.ww_funil_ranking_combo_native(
  timestamp with time zone, timestamp with time zone, text, uuid, text[], text[], text[],
  uuid[], text[], text[], text[], text[], text[], text
) TO authenticated, service_role;

COMMIT;
