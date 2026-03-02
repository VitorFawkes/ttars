-- ============================================================
-- Sistema de Tags para Cards
-- Tabelas: card_tags, card_tag_assignments
-- View: view_cards_acoes (adiciona tag_ids uuid[])
-- ============================================================
-- Nota: FKs para cards/profiles são condicionais para compatibilidade
-- com staging (bootstrap mínimo). Em produção todas as FKs são criadas.
-- ============================================================

-- 1. Tabela de definições de tags (gerenciada por admins)
CREATE TABLE IF NOT EXISTS card_tags (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name        text NOT NULL,
    color       text NOT NULL DEFAULT '#6366f1',
    description text,
    produto     text,   -- NULL = shared, 'TRIPS', 'WEDDING', 'CORP'
    is_active   boolean NOT NULL DEFAULT true,
    created_by  uuid,   -- FK adicionada condicionalmente abaixo
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT card_tags_name_produto_unique UNIQUE(name, produto)
);

CREATE OR REPLACE FUNCTION set_card_tags_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_card_tags_updated_at ON card_tags;
CREATE TRIGGER trg_card_tags_updated_at
    BEFORE UPDATE ON card_tags
    FOR EACH ROW EXECUTE FUNCTION set_card_tags_updated_at();

ALTER TABLE card_tags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "card_tags_select" ON card_tags;
CREATE POLICY "card_tags_select" ON card_tags
    FOR SELECT TO authenticated USING (true);

-- RLS de escrita: condicional (profiles pode não existir no staging)
DO $$
BEGIN
    DROP POLICY IF EXISTS "card_tags_admin_write" ON card_tags;
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'profiles') THEN
        EXECUTE $pol$
            CREATE POLICY "card_tags_admin_write" ON card_tags
                FOR ALL TO authenticated
                USING (
                    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
                )
                WITH CHECK (
                    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
                );
        $pol$;
    ELSE
        -- Staging: permite escrita para qualquer autenticado (sem profiles)
        EXECUTE $pol$
            CREATE POLICY "card_tags_admin_write" ON card_tags
                FOR ALL TO authenticated USING (true) WITH CHECK (true);
        $pol$;
    END IF;
END $$;

-- 2. Tabela M:N de assignments
CREATE TABLE IF NOT EXISTS card_tag_assignments (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    card_id     uuid NOT NULL,  -- FK adicionada condicionalmente abaixo
    tag_id      uuid NOT NULL REFERENCES card_tags(id) ON DELETE CASCADE,
    assigned_by uuid,           -- FK adicionada condicionalmente abaixo
    assigned_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT card_tag_assignments_unique UNIQUE(card_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_cta_card_id ON card_tag_assignments(card_id);
CREATE INDEX IF NOT EXISTS idx_cta_tag_id  ON card_tag_assignments(tag_id);

ALTER TABLE card_tag_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "card_tag_assignments_select" ON card_tag_assignments;
CREATE POLICY "card_tag_assignments_select" ON card_tag_assignments
    FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "card_tag_assignments_write" ON card_tag_assignments;
CREATE POLICY "card_tag_assignments_write" ON card_tag_assignments
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 3. Adicionar FKs condicionalmente (produção tem cards + profiles, staging não)
DO $$
BEGIN
    -- FK: card_tag_assignments.card_id → cards
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'cards') THEN
        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint WHERE conname = 'fk_cta_card_id'
        ) THEN
            ALTER TABLE card_tag_assignments
                ADD CONSTRAINT fk_cta_card_id
                FOREIGN KEY (card_id) REFERENCES public.cards(id) ON DELETE CASCADE;
        END IF;
    END IF;

    -- FK: card_tags.created_by → profiles
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'profiles') THEN
        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint WHERE conname = 'fk_ct_created_by'
        ) THEN
            ALTER TABLE card_tags
                ADD CONSTRAINT fk_ct_created_by
                FOREIGN KEY (created_by) REFERENCES public.profiles(id);
        END IF;

        -- FK: card_tag_assignments.assigned_by → profiles
        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint WHERE conname = 'fk_cta_assigned_by'
        ) THEN
            ALTER TABLE card_tag_assignments
                ADD CONSTRAINT fk_cta_assigned_by
                FOREIGN KEY (assigned_by) REFERENCES public.profiles(id);
        END IF;
    END IF;
END $$;

-- 4. Atualizar view_cards_acoes adicionando tag_ids uuid[]
-- DIFF: única mudança em relação à definição live (2026-03-03) é
--       adicionar a coluna tag_ids como última coluna do SELECT.
-- Só executa se a tabela cards existir (produção).
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'cards') THEN
        EXECUTE $view$
            CREATE OR REPLACE VIEW public.view_cards_acoes AS
             SELECT c.id,
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
                c.data_fechamento,
                c.briefing_inicial,
                c.marketing_data,
                c.parent_card_id,
                c.is_group_parent,
                c.ganho_sdr,
                c.ganho_sdr_at,
                c.ganho_planner,
                c.ganho_planner_at,
                c.ganho_pos,
                c.ganho_pos_at,
                s.fase,
                s.nome AS etapa_nome,
                s.ordem AS etapa_ordem,
                p.nome AS pipeline_nome,
                TRIM(BOTH FROM ((COALESCE(pe.nome, ''::text) || ' '::text) || COALESCE(pe.sobrenome, ''::text))) AS pessoa_nome,
                pe.telefone AS pessoa_telefone,
                pe.email AS pessoa_email,
                pr.nome AS dono_atual_nome,
                pr.email AS dono_atual_email,
                sdr.nome AS sdr_owner_nome,
                sdr.email AS sdr_owner_email,
                ( SELECT row_to_json(t.*) AS row_to_json
                       FROM ( SELECT tarefas.id,
                                tarefas.titulo,
                                tarefas.data_vencimento,
                                tarefas.prioridade,
                                tarefas.tipo
                               FROM tarefas
                              WHERE ((tarefas.card_id = c.id) AND (COALESCE(tarefas.concluida, false) = false) AND ((tarefas.status IS NULL) OR (tarefas.status <> 'reagendada'::text)))
                              ORDER BY tarefas.data_vencimento, tarefas.created_at DESC, tarefas.id DESC
                             LIMIT 1) t) AS proxima_tarefa,
                ( SELECT count(*) AS count
                       FROM tarefas
                      WHERE ((tarefas.card_id = c.id) AND (COALESCE(tarefas.concluida, false) = false) AND ((tarefas.status IS NULL) OR (tarefas.status <> 'reagendada'::text)))) AS tarefas_pendentes,
                ( SELECT count(*) AS count
                       FROM tarefas
                      WHERE ((tarefas.card_id = c.id) AND (COALESCE(tarefas.concluida, false) = false) AND (tarefas.data_vencimento < CURRENT_DATE) AND ((tarefas.status IS NULL) OR (tarefas.status <> 'reagendada'::text)))) AS tarefas_atrasadas,
                ( SELECT row_to_json(t.*) AS row_to_json
                       FROM ( SELECT tarefas.id,
                                tarefas.titulo,
                                tarefas.concluida_em AS data,
                                tarefas.tipo
                               FROM tarefas
                              WHERE ((tarefas.card_id = c.id) AND (tarefas.concluida = true))
                              ORDER BY tarefas.concluida_em DESC
                             LIMIT 1) t) AS ultima_interacao,
                EXTRACT(day FROM (now() - c.updated_at)) AS tempo_sem_contato,
                (c.produto_data ->> 'taxa_planejamento'::text) AS status_taxa,
                    CASE
                        WHEN (c.data_viagem_inicio IS NOT NULL) THEN EXTRACT(day FROM (c.data_viagem_inicio - now()))
                        ELSE NULL::numeric
                    END AS dias_ate_viagem,
                    CASE
                        WHEN ((c.data_viagem_inicio IS NOT NULL) AND (EXTRACT(day FROM (c.data_viagem_inicio - now())) < (30)::numeric)) THEN 100
                        ELSE 0
                    END AS urgencia_viagem,
                EXTRACT(day FROM (now() - COALESCE(c.stage_entered_at, c.updated_at))) AS tempo_etapa_dias,
                    CASE
                        WHEN ((s.sla_hours IS NOT NULL) AND ((EXTRACT(epoch FROM (now() - COALESCE(c.stage_entered_at, c.updated_at))) / (3600)::numeric) > (s.sla_hours)::numeric)) THEN 1
                        ELSE 0
                    END AS urgencia_tempo_etapa,
                (c.produto_data -> 'destinos'::text) AS destinos,
                (c.produto_data -> 'orcamento'::text) AS orcamento,
                c.valor_final,
                c.origem,
                c.external_id,
                c.campaign_id,
                c.moeda,
                c.condicoes_pagamento,
                c.forma_pagamento,
                c.estado_operacional,
                sdr.nome AS sdr_nome,
                vendas.nome AS vendas_nome,
                c.archived_at,
                COALESCE(dc.docs_total, (0)::bigint) AS docs_total,
                COALESCE(dc.docs_completed, (0)::bigint) AS docs_completed,
                pe.telefone_normalizado AS pessoa_telefone_normalizado,
                ARRAY(
                    SELECT cta.tag_id
                    FROM card_tag_assignments cta
                    WHERE cta.card_id = c.id
                ) AS tag_ids
               FROM (((((((cards c
                 LEFT JOIN pipeline_stages s ON ((c.pipeline_stage_id = s.id)))
                 LEFT JOIN pipelines p ON ((c.pipeline_id = p.id)))
                 LEFT JOIN contatos pe ON ((c.pessoa_principal_id = pe.id)))
                 LEFT JOIN profiles pr ON ((c.dono_atual_id = pr.id)))
                 LEFT JOIN profiles sdr ON ((c.sdr_owner_id = sdr.id)))
                 LEFT JOIN profiles vendas ON ((c.vendas_owner_id = vendas.id)))
                 LEFT JOIN ( SELECT card_document_requirements.card_id,
                        count(*) AS docs_total,
                        count(*) FILTER (WHERE (card_document_requirements.status = 'recebido'::text)) AS docs_completed
                       FROM card_document_requirements
                      GROUP BY card_document_requirements.card_id) dc ON ((dc.card_id = c.id)))
              WHERE (c.deleted_at IS NULL);
        $view$;
    END IF;
END $$;
