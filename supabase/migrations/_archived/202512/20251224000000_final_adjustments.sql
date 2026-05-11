-- ============================================================================
-- MIGRATION: Final Adjustments (TRIPS CRM)
-- Description: Schema updates for Meetings, Change Requests, and Admin Categories
-- Date: 2025-12-24
-- Priority: P0
-- ============================================================================

BEGIN;

-- 1. Add columns to 'tarefas' table (Idempotent)
DO $$
BEGIN
    -- feedback
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tarefas' AND column_name = 'feedback') THEN
        ALTER TABLE tarefas ADD COLUMN feedback text;
    END IF;

    -- motivo_cancelamento
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tarefas' AND column_name = 'motivo_cancelamento') THEN
        ALTER TABLE tarefas ADD COLUMN motivo_cancelamento text;
    END IF;

    -- rescheduled_to_id
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tarefas' AND column_name = 'rescheduled_to_id') THEN
        ALTER TABLE tarefas ADD COLUMN rescheduled_to_id uuid REFERENCES tarefas(id);
    END IF;

    -- rescheduled_from_id
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tarefas' AND column_name = 'rescheduled_from_id') THEN
        ALTER TABLE tarefas ADD COLUMN rescheduled_from_id uuid REFERENCES tarefas(id);
    END IF;

    -- categoria_outro
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tarefas' AND column_name = 'categoria_outro') THEN
        ALTER TABLE tarefas ADD COLUMN categoria_outro text;
    END IF;
END $$;

-- 2. Create 'activity_categories' table (Idempotent)
CREATE TABLE IF NOT EXISTS activity_categories (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    scope text NOT NULL, -- e.g., 'change_request'
    key text NOT NULL,
    label text NOT NULL,
    visible boolean DEFAULT true,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    UNIQUE(scope, key)
);

-- 3. RLS Policies for 'activity_categories'
ALTER TABLE activity_categories ENABLE ROW LEVEL SECURITY;

-- Policy: Authenticated users can read visible categories
DROP POLICY IF EXISTS "Authenticated users can read visible categories" ON activity_categories;
CREATE POLICY "Authenticated users can read visible categories"
    ON activity_categories FOR SELECT
    TO authenticated
    USING (visible = true OR (SELECT is_admin() FROM profiles WHERE id = auth.uid()));

-- Policy: Admins can do everything
DROP POLICY IF EXISTS "Admins can manage categories" ON activity_categories;
CREATE POLICY "Admins can manage categories"
    ON activity_categories FOR ALL
    TO authenticated
    USING ((SELECT is_admin() FROM profiles WHERE id = auth.uid()))
    WITH CHECK ((SELECT is_admin() FROM profiles WHERE id = auth.uid()));

-- 4. Seed initial categories (Idempotent)
INSERT INTO activity_categories (scope, key, label, visible)
VALUES 
    ('change_request', 'voo', 'Voo', true),
    ('change_request', 'hotel', 'Hotel', true),
    ('change_request', 'datas', 'Datas', true),
    ('change_request', 'financeiro', 'Financeiro', true),
    ('change_request', 'outro', 'Outro', true)
ON CONFLICT (scope, key) DO NOTHING;

-- 5. Update view_cards_acoes to exclude 'reagendada' from proxima_tarefa
-- We need to drop dependent views first if any (view_dashboard_funil depends on it)
DROP VIEW IF EXISTS view_dashboard_funil CASCADE;
DROP VIEW IF EXISTS view_cards_acoes CASCADE;

CREATE OR REPLACE VIEW view_cards_acoes AS
SELECT 
    c.id,
    c.titulo,
    c.produto,
    c.pipeline_id,
    c.pipeline_stage_id,
    c.pessoa_principal_id,
    c.valor_estimado,
    c.dono_atual_id,
    c.sdr_owner_id,
    c.vendas_owner_id,
    c.pos_owner_id,
    c.concierge_owner_id,
    c.status_comercial,
    c.produto_data,
    c.cliente_recorrente,
    c.prioridade,
    c.data_viagem_inicio,
    c.created_at,
    c.updated_at,
    s.fase,
    s.nome AS etapa_nome,
    s.ordem AS etapa_ordem,
    p.nome AS pipeline_nome,
    pe.nome AS pessoa_nome,
    pr.nome AS dono_atual_nome,
    pr.email AS dono_atual_email,
    sdr.nome AS sdr_owner_nome,
    sdr.email AS sdr_owner_email,
    
    -- PROXIMA_TAREFA: Exclude 'reagendada' status
    (SELECT row_to_json(t.*) FROM (
        SELECT 
            id, 
            titulo, 
            data_vencimento, 
            prioridade, 
            tipo 
        FROM tarefas 
        WHERE 
            card_id = c.id 
            AND COALESCE(tarefas.concluida, false) = false
            AND (tarefas.status IS NULL OR tarefas.status != 'reagendada') -- NEW FILTER
        ORDER BY 
            data_vencimento ASC NULLS LAST,
            created_at DESC,
            id DESC
        LIMIT 1
    ) t) AS proxima_tarefa,
    
    -- TAREFAS_PENDENTES: Exclude 'reagendada'
    (SELECT count(*) 
     FROM tarefas 
     WHERE card_id = c.id 
       AND COALESCE(tarefas.concluida, false) = false
       AND (tarefas.status IS NULL OR tarefas.status != 'reagendada') -- NEW FILTER
    ) AS tarefas_pendentes,
    
    -- TAREFAS_ATRASADAS: Exclude 'reagendada'
    (SELECT count(*) 
     FROM tarefas 
     WHERE card_id = c.id 
       AND COALESCE(tarefas.concluida, false) = false 
       AND data_vencimento < CURRENT_DATE
       AND (tarefas.status IS NULL OR tarefas.status != 'reagendada') -- NEW FILTER
    ) AS tarefas_atrasadas,
    
    -- ULTIMA_INTERACAO
    (SELECT row_to_json(t.*) FROM (
        SELECT 
            id, 
            titulo, 
            concluida_em AS data, 
            tipo 
        FROM tarefas 
        WHERE card_id = c.id 
          AND tarefas.concluida = true 
        ORDER BY concluida_em DESC 
        LIMIT 1
    ) t) AS ultima_interacao,
    
    -- Additional calculated fields
    EXTRACT(day FROM now() - c.updated_at) AS tempo_sem_contato,
    c.produto_data ->> 'taxa_planejamento' AS status_taxa,
    CASE
        WHEN c.data_viagem_inicio IS NOT NULL 
        THEN EXTRACT(day FROM c.data_viagem_inicio - now())
        ELSE NULL
    END AS dias_ate_viagem,
    CASE
        WHEN c.data_viagem_inicio IS NOT NULL 
         AND EXTRACT(day FROM c.data_viagem_inicio - now()) < 30 
        THEN 100
        ELSE 0
    END AS urgencia_viagem,
    EXTRACT(day FROM now() - COALESCE(c.stage_entered_at, c.updated_at)) AS tempo_etapa_dias,
    CASE
        WHEN s.sla_hours IS NOT NULL 
         AND (EXTRACT(epoch FROM now() - COALESCE(c.stage_entered_at, c.updated_at)) / 3600) > s.sla_hours 
        THEN 1
        ELSE 0
    END AS urgencia_tempo_etapa,
    c.produto_data -> 'destinos' AS destinos,
    c.produto_data -> 'orcamento' AS orcamento,
    c.valor_final,
    c.origem,
    c.external_id,
    c.campaign_id,
    c.moeda,
    c.condicoes_pagamento,
    c.forma_pagamento,
    c.estado_operacional,
    sdr.nome AS sdr_nome,
    vendas.nome AS vendas_nome
FROM cards c
LEFT JOIN pipeline_stages s ON c.pipeline_stage_id = s.id
LEFT JOIN pipelines p ON c.pipeline_id = p.id
LEFT JOIN contatos pe ON c.pessoa_principal_id = pe.id
LEFT JOIN profiles pr ON c.dono_atual_id = pr.id
LEFT JOIN profiles sdr ON c.sdr_owner_id = sdr.id
LEFT JOIN profiles vendas ON c.vendas_owner_id = vendas.id;

-- Recreate view_dashboard_funil
CREATE OR REPLACE VIEW view_dashboard_funil AS
SELECT
    etapa_nome,
    etapa_ordem,
    produto,
    count(*) as total_cards,
    sum(valor_estimado) as total_valor_estimado,
    sum(valor_final) as total_valor_final
FROM view_cards_acoes
GROUP BY etapa_nome, etapa_ordem, produto;

-- Grant permissions
GRANT SELECT ON view_cards_acoes TO authenticated;
GRANT SELECT ON view_dashboard_funil TO authenticated;

COMMIT;
