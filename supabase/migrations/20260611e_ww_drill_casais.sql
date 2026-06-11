-- 20260611e — ww_drill_casais: drill-down do Analytics Weddings 100% alinhado à fonte Active
--
-- Objetivo (goal 2026-06-11): clicar em QUALQUER dado das abas (KPI, etapa do funil, barra de
-- série temporal, campanha, motivo, célula de heatmap) e abrir a lista exata dos casais por
-- trás daquele número, com link pro Active em toda linha.
--
-- Por que uma RPC nova (e não estender ww2_drill_down):
--   • ww2_drill_down lê de CARDS (CRM). Os agregados leem do universo ACTIVE (ww_funil_casal /
--     vw_ww_funnel_base) — casal sem card fica de fora da lista e o ac_deal_id nem sempre existe.
--     Regra de ouro (memory feedback_ww_drill_down_mismatch): o drill DEVE selecionar casais com
--     a MESMA lógica que o agregado contou.
--   • Os cliques novos precisam de MARCO do funil (marcou/fez 1ª reunião, marcou/fez closer,
--     ganho, perdido) — isso só existe no universo Active.
--   ww2_drill_down fica no banco (nenhum consumidor após esta onda; remoção em limpeza futura).
--
-- Alinhamento de régua (mesmas contas dos agregados):
--   • Período cohort: lead_created_at BETWEEN (= ww_funil_conversao_v1 / ww_funil_ranking_combo).
--   • Período throughput sem marco: lead_created OU agendou_sdr OU agendou_closer OU ganho no
--     período (= pool do ww_funil_conversao_v1).
--   • Marco em cohort: cumulativo (entrou ≥ marcou_sdr ≥ fez_sdr ≥ marcou_closer ≥ fez_closer
--     ≥ ganho), igual ww_funil_conversao_v1/ww2_overview 'conversoes'.
--   • Marco em throughput: o próprio marco com a SUA data no período (= ww_serie_temporal).
--   • Fase atual (phase_slug): mesma régua do funil do ww2_overview (sdr = não chegou em closer
--     e não ganhou; closer = marcou/fez closer e não ganhou; pos_venda = ganhou).
--   • perdido: ww_funil_casal.is_perdido (ligada em 20260604b — primeiro consumidor).
--   • Dimensões: colunas já-normalizadas (strict) de ww_funil_casal; canal via
--     _ww_norm_canal_strict; 'Não informado' clicável (vira IS NULL).
--   • Campanha/medium/motivo de perda: EXISTS no cache (qualquer deal do casal) — server-side
--     (antes campaign/medium eram filtrados no cliente sobre a página de 50, perdendo linhas).
--
-- REBASE conferido (TOP-5 #5): função NOVA, nenhuma definição anterior de ww_drill_casais em
-- nenhuma migration (grep 2026-06-11). Não recria nada existente.
-- Grants: authenticated + service_role; REVOKE PUBLIC/anon (memory feedback_rpc_grants_anon).
--
-- v2 (mesmo dia): TODA condição de DELETE com data envolvida ganha COALESCE(..., FALSE) —
-- lógica de 3 valores deixava linha com *_at NULL escapar do filtro (fez_sdr mai/2026 dava 76
-- no drill vs 63 na série; consertado, bate 63). Mesma classe do feedback_record_is_not_null.

DROP FUNCTION IF EXISTS public.ww_drill_casais(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, TEXT[], TEXT[], TEXT[], TEXT[], TEXT[], UUID[], TEXT[], TEXT[], INT, INT);

CREATE FUNCTION public.ww_drill_casais(
    p_date_start TIMESTAMPTZ DEFAULT (NOW() - INTERVAL '30 days'),
    p_date_end   TIMESTAMPTZ DEFAULT NOW(),
    p_date_mode  TEXT DEFAULT 'cohort',
    p_org_id     UUID DEFAULT NULL,
    -- marco do funil / fase atual / status
    p_marco      TEXT DEFAULT NULL,  -- entrou|marcou_sdr|fez_sdr|marcou_closer|fez_closer|ganho|perdido|aberto
    p_phase_slug TEXT DEFAULT NULL,  -- sdr|closer|pos_venda (posição atual)
    -- célula (valores únicos — clique num dado específico)
    p_faixa        TEXT DEFAULT NULL,
    p_destino      TEXT DEFAULT NULL,
    p_convidados   TEXT DEFAULT NULL,
    p_origem       TEXT DEFAULT NULL,
    p_tipo         TEXT DEFAULT NULL,
    p_campaign     TEXT DEFAULT NULL,
    p_medium       TEXT DEFAULT NULL,
    p_motivo_perda TEXT DEFAULT NULL,
    p_motivo_role  TEXT DEFAULT NULL, -- 'sdr' | 'closer' | NULL (qualquer)
    p_consultor_id UUID DEFAULT NULL,
    -- barra (arrays — filtros ativos da aba; convivem com os singulares via AND)
    p_origins         TEXT[] DEFAULT NULL,
    p_faixas          TEXT[] DEFAULT NULL,
    p_destinos        TEXT[] DEFAULT NULL,
    p_convidados_list TEXT[] DEFAULT NULL,
    p_tipos           TEXT[] DEFAULT NULL,
    p_consultor_ids   UUID[] DEFAULT NULL,
    p_sdr_canal       TEXT[] DEFAULT NULL,
    p_closer_canal    TEXT[] DEFAULT NULL,
    p_limit  INT DEFAULT 50,
    p_offset INT DEFAULT 0
) RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
    v_org_id UUID := COALESCE(p_org_id, requesting_org_id());
    v_total INT;
    v_rows JSON;
BEGIN
    CREATE TEMP TABLE _ww_dc ON COMMIT DROP AS
    SELECT c.contact_id, c.deal_title, c.tipo, c.lead_created_at,
           c.faixa, c.convidados, c.destino, c.origem, c.consultor_id, c.consultor_nome,
           _ww_norm_canal_strict(c.sdr_canal)    AS canal_sdr,
           _ww_norm_canal_strict(c.closer_canal) AS canal_closer,
           c.agendou_sdr, c.agendou_sdr_at, c.fez_sdr, c.fez_sdr_at,
           c.agendou_closer, c.agendou_closer_at, c.fez_closer, c.fez_closer_at,
           c.ganho, c.ganho_at, c.is_perdido
      FROM ww_funil_casal c
     WHERE c.org_id = v_org_id
       AND (CASE
              -- throughput COM marco: a janela é do próprio marco (abaixo) — não corta aqui
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
                WHEN 'entrou'        THEN DELETE FROM _ww_dc WHERE NOT COALESCE(lead_created_at BETWEEN p_date_start AND p_date_end, FALSE);
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
                WHEN 'entrou'        THEN NULL; -- pool já é a safra
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

    -- ── Fase atual (régua do funil do ww2_overview) ──
    IF p_phase_slug IS NOT NULL THEN
        CASE p_phase_slug
            WHEN 'sdr'       THEN DELETE FROM _ww_dc WHERE COALESCE(ganho OR agendou_closer OR fez_closer, FALSE);
            WHEN 'closer'    THEN DELETE FROM _ww_dc WHERE COALESCE(ganho, FALSE) OR NOT COALESCE(agendou_closer OR fez_closer, FALSE);
            WHEN 'pos_venda' THEN DELETE FROM _ww_dc WHERE NOT COALESCE(ganho, FALSE);
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
    IF p_tipo IS NOT NULL THEN DELETE FROM _ww_dc WHERE tipo IS DISTINCT FROM p_tipo; END IF;
    IF p_consultor_id IS NOT NULL THEN DELETE FROM _ww_dc WHERE consultor_id IS DISTINCT FROM p_consultor_id; END IF;

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
    IF p_tipos IS NOT NULL THEN DELETE FROM _ww_dc WHERE tipo IS NULL OR tipo != ALL(p_tipos); END IF;
    IF p_consultor_ids IS NOT NULL THEN DELETE FROM _ww_dc WHERE consultor_id IS NULL OR consultor_id != ALL(p_consultor_ids); END IF;
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

REVOKE EXECUTE ON FUNCTION public.ww_drill_casais(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, TEXT[], TEXT[], TEXT[], TEXT[], TEXT[], UUID[], TEXT[], TEXT[], INT, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ww_drill_casais(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, TEXT[], TEXT[], TEXT[], TEXT[], TEXT[], UUID[], TEXT[], TEXT[], INT, INT) TO authenticated, service_role;

COMMENT ON FUNCTION public.ww_drill_casais IS
  'Drill-down Weddings sobre o universo ACTIVE (ww_funil_casal): lista os casais por trás de qualquer agregado, com marcos cumulativos (régua do ww_funil_conversao_v1), throughput por data do marco (régua da ww_serie_temporal), filtros de célula + barra, campanha/medium/motivo server-side e ac_deal_id em toda linha. v2 (20260611e — NULL-safe).';
