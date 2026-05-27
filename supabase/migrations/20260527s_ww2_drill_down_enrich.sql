-- ============================================================================
-- Analytics-Weddings — Onda 1: enriquecer ww2_drill_down
--
-- Adiciona ao row JSON: contato (nome/tel/email/external_id AC), data_venda,
-- monde_venda, tipo_casamento, campaign/medium/content (UTM) e consultor_nome.
--
-- Sem breaking change: apenas colunas novas no JSON; o frontend antigo continua
-- consumindo o que sempre consumiu, mas agora pode mostrar nome do casal,
-- telefone e botão "Abrir no ActiveCampaign" em cada linha do drill.
-- ============================================================================

DROP FUNCTION IF EXISTS public.ww2_drill_down(TIMESTAMPTZ, TIMESTAMPTZ, UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, INT, INT);

CREATE OR REPLACE FUNCTION public.ww2_drill_down(
    p_date_start TIMESTAMPTZ DEFAULT (NOW() - INTERVAL '30 days'),
    p_date_end   TIMESTAMPTZ DEFAULT NOW(),
    p_org_id     UUID DEFAULT NULL,
    p_stage_id   UUID DEFAULT NULL,
    p_phase_slug TEXT DEFAULT NULL,
    p_status     TEXT DEFAULT NULL,   -- 'aberto' | 'ganho' | 'perdido' | 'fechado_efetivo'
    p_faixa      TEXT DEFAULT NULL,
    p_destino    TEXT DEFAULT NULL,
    p_origem     TEXT DEFAULT NULL,
    p_consultor_id UUID DEFAULT NULL,
    p_motivo_perda TEXT DEFAULT NULL,
    p_limit      INT DEFAULT 50,
    p_offset     INT DEFAULT 0
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $func$
DECLARE
    v_org_id UUID := COALESCE(p_org_id, requesting_org_id());
    v_total INT;
    v_rows JSON;
BEGIN
    CREATE TEMP TABLE _ww2_d ON COMMIT DROP AS
    SELECT c.id, c.titulo, c.created_at, c.updated_at, c.valor_estimado, c.valor_final,
           c.status_comercial, c.dono_atual_id, c.pessoa_principal_id,
           s.nome AS stage_name, COALESCE(ph.label, ph.name) AS phase_label, ph.slug AS phase_slug,
           pr.nome AS dono_nome,
           co.nome AS contato_nome,
           co.email AS contato_email,
           co.telefone AS contato_telefone,
           CASE WHEN co.external_source = 'active_campaign' THEN co.external_id ELSE NULL END AS contato_external_id,
           _ww2_norm_faixa(c.produto_data->>'ww_mkt_orcamento_form') AS faixa,
           _ww2_norm_destino(c.produto_data->>'ww_mkt_destino_form') AS destino,
           _ww2_norm_origem(c.marketing_data) AS origem,
           _ww_norm_tipo(c.produto_data->>'ww_tipo_casamento') AS tipo_casamento,
           c.produto_data->>'ww_motivo_perda_sdr' AS motivo_sdr,
           c.produto_data->>'ww_motivo_perda_closer' AS motivo_closer,
           NULLIF(c.produto_data->>'ww_closer_data_ganho','')::TIMESTAMPTZ AS data_venda,
           NULLIF(c.produto_data->>'ww_closer_monde_venda','') AS monde_venda,
           COALESCE(
             NULLIF(c.marketing_data->>'utm_campaign',''),
             NULLIF(c.marketing_data->'card'->>'utm_campaign','')
           ) AS campaign,
           COALESCE(
             NULLIF(c.marketing_data->>'utm_medium',''),
             NULLIF(c.marketing_data->'card'->>'utm_medium','')
           ) AS medium,
           COALESCE(
             NULLIF(c.marketing_data->>'utm_content',''),
             NULLIF(c.marketing_data->'card'->>'utm_content','')
           ) AS content,
           EXTRACT(DAY FROM NOW() - GREATEST(c.updated_at, c.created_at))::INT AS dias_parado
      FROM cards c
      LEFT JOIN pipeline_stages s ON s.id = c.pipeline_stage_id
      LEFT JOIN pipeline_phases ph ON ph.id = s.phase_id
      LEFT JOIN profiles pr ON pr.id = c.dono_atual_id
      LEFT JOIN contatos co ON co.id = c.pessoa_principal_id
     WHERE c.deleted_at IS NULL AND c.archived_at IS NULL
       AND c.produto::TEXT='WEDDING' AND c.org_id=v_org_id
       AND c.created_at >= p_date_start AND c.created_at <= p_date_end;

    IF p_stage_id IS NOT NULL THEN
        DELETE FROM _ww2_d WHERE id NOT IN (
            SELECT t.id FROM _ww2_d t JOIN cards c2 ON c2.id=t.id WHERE c2.pipeline_stage_id = p_stage_id
        );
    END IF;
    IF p_phase_slug IS NOT NULL THEN DELETE FROM _ww2_d WHERE phase_slug != p_phase_slug; END IF;
    IF p_status IS NOT NULL THEN
        IF p_status = 'fechado_efetivo' THEN
            DELETE FROM _ww2_d WHERE NOT (status_comercial='ganho' OR phase_slug='pos_venda');
        ELSE
            DELETE FROM _ww2_d WHERE status_comercial != p_status OR status_comercial IS NULL;
        END IF;
    END IF;
    IF p_faixa IS NOT NULL THEN DELETE FROM _ww2_d WHERE faixa IS NULL OR faixa != p_faixa; END IF;
    IF p_destino IS NOT NULL THEN DELETE FROM _ww2_d WHERE destino IS NULL OR destino != p_destino; END IF;
    IF p_origem IS NOT NULL THEN DELETE FROM _ww2_d WHERE origem != p_origem; END IF;
    IF p_consultor_id IS NOT NULL THEN DELETE FROM _ww2_d WHERE dono_atual_id != p_consultor_id; END IF;
    IF p_motivo_perda IS NOT NULL THEN DELETE FROM _ww2_d WHERE motivo_sdr != p_motivo_perda AND motivo_closer != p_motivo_perda; END IF;

    SELECT COUNT(*) INTO v_total FROM _ww2_d;

    SELECT json_agg(row_to_json(t)) INTO v_rows FROM (
        SELECT id, titulo, created_at, updated_at, valor_estimado, valor_final,
               status_comercial, stage_name, phase_label, dono_nome,
               faixa, destino, origem, dias_parado,
               COALESCE(motivo_sdr, motivo_closer) AS motivo_perda,
               -- NOVOS
               pessoa_principal_id AS contato_id,
               contato_nome, contato_email, contato_telefone, contato_external_id,
               data_venda, monde_venda, tipo_casamento,
               campaign, medium, content
          FROM _ww2_d
         ORDER BY created_at DESC
         LIMIT p_limit OFFSET p_offset
    ) t;

    DROP TABLE _ww2_d;
    RETURN json_build_object(
        'total', v_total,
        'limit', p_limit,
        'offset', p_offset,
        'rows', COALESCE(v_rows, '[]'::JSON)
    );
END $func$;

GRANT EXECUTE ON FUNCTION public.ww2_drill_down(TIMESTAMPTZ, TIMESTAMPTZ, UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, INT, INT) TO authenticated;
