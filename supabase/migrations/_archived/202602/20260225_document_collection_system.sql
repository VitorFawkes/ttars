-- ============================================================
-- Sistema de Coleta de Documentos
-- Tabelas: document_types, card_document_requirements
-- View: view_cards_acoes (adiciona docs_total, docs_completed)
-- Section: documentos (widget no CardDetail)
-- ============================================================

-- 1. Tabela de tipos de documentos (master list reutilizável)
CREATE TABLE IF NOT EXISTS document_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  descricao TEXT,
  requires_file BOOLEAN NOT NULL DEFAULT true,
  has_data_field BOOLEAN NOT NULL DEFAULT false,
  data_field_label TEXT,
  campo_contato TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  ordem INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES profiles(id)
);

ALTER TABLE document_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read document types"
  ON document_types FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can manage document types"
  ON document_types FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update document types"
  ON document_types FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- 2. Seed de tipos padrão
INSERT INTO document_types (nome, slug, requires_file, has_data_field, data_field_label, campo_contato, ordem) VALUES
  ('Passaporte', 'passaporte', true, true, 'Número do passaporte', 'passaporte', 1),
  ('RG', 'rg', true, true, 'Número do RG', 'rg', 2),
  ('CPF', 'cpf', false, true, 'Número do CPF', 'cpf', 3),
  ('Certidão de Nascimento', 'certidao_nascimento', true, false, NULL, NULL, 4),
  ('Visto', 'visto', true, true, 'Número do visto', NULL, 5),
  ('Carteira de Vacinação', 'carteira_vacinacao', true, false, NULL, NULL, 6),
  ('Seguro Viagem', 'seguro_viagem', true, true, 'Número da apólice', NULL, 7)
ON CONFLICT (slug) DO NOTHING;

-- 3. Tabela de checklist de documentos por card/viajante
CREATE TABLE IF NOT EXISTS card_document_requirements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  document_type_id UUID NOT NULL REFERENCES document_types(id),
  contato_id UUID NOT NULL REFERENCES contatos(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pendente',
  modo TEXT NOT NULL DEFAULT 'ambos' CHECK (modo IN ('dados', 'arquivo', 'ambos')),
  arquivo_id UUID REFERENCES arquivos(id) ON DELETE SET NULL,
  data_value TEXT,
  notas TEXT,
  recebido_em TIMESTAMPTZ,
  recebido_por UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (card_id, document_type_id, contato_id)
);

CREATE INDEX idx_card_doc_req_card ON card_document_requirements(card_id);
CREATE INDEX idx_card_doc_req_status ON card_document_requirements(card_id, status);

ALTER TABLE card_document_requirements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage document requirements"
  ON card_document_requirements FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- 4. Storage bucket para documentos de viajantes
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'card-documents',
  'card-documents',
  false,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
CREATE POLICY "Authenticated users can upload card documents"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'card-documents');

CREATE POLICY "Authenticated users can read card documents"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'card-documents');

CREATE POLICY "Authenticated users can delete card documents"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'card-documents');

-- 5. Seção de documentos no sistema de seções
INSERT INTO sections (key, label, icon, color, position, order_index, is_system, is_governable, active, widget_component)
VALUES ('documentos', 'Documentos', 'FileCheck', 'bg-teal-50 text-teal-700 border-teal-100', 'left_column', 15, true, false, true, 'documentos')
ON CONFLICT (key) DO NOTHING;

-- 6. Atualizar view_cards_acoes com docs_total e docs_completed
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
    TRIM(COALESCE(pe.nome, '') || ' ' || COALESCE(pe.sobrenome, '')) AS pessoa_nome,
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
                   FROM public.tarefas
                  WHERE tarefas.card_id = c.id AND COALESCE(tarefas.concluida, false) = false AND (tarefas.status IS NULL OR tarefas.status <> 'reagendada'::text)
                  ORDER BY tarefas.data_vencimento, tarefas.created_at DESC, tarefas.id DESC
                 LIMIT 1) t) AS proxima_tarefa,
    ( SELECT count(*) AS count
           FROM public.tarefas
          WHERE tarefas.card_id = c.id AND COALESCE(tarefas.concluida, false) = false AND (tarefas.status IS NULL OR tarefas.status <> 'reagendada'::text)) AS tarefas_pendentes,
    ( SELECT count(*) AS count
           FROM public.tarefas
          WHERE tarefas.card_id = c.id AND COALESCE(tarefas.concluida, false) = false AND tarefas.data_vencimento < CURRENT_DATE AND (tarefas.status IS NULL OR tarefas.status <> 'reagendada'::text)) AS tarefas_atrasadas,
    ( SELECT row_to_json(t.*) AS row_to_json
           FROM ( SELECT tarefas.id,
                    tarefas.titulo,
                    tarefas.concluida_em AS data,
                    tarefas.tipo
                   FROM public.tarefas
                  WHERE tarefas.card_id = c.id AND tarefas.concluida = true
                  ORDER BY tarefas.concluida_em DESC
                 LIMIT 1) t) AS ultima_interacao,
    -- Document collection progress
    COALESCE(dc.docs_total, 0) AS docs_total,
    COALESCE(dc.docs_completed, 0) AS docs_completed,
    EXTRACT(day FROM now() - c.updated_at) AS tempo_sem_contato,
    c.produto_data ->> 'taxa_planejamento'::text AS status_taxa,
        CASE
            WHEN c.data_viagem_inicio IS NOT NULL THEN EXTRACT(day FROM c.data_viagem_inicio - now())
            ELSE NULL::numeric
        END AS dias_ate_viagem,
        CASE
            WHEN c.data_viagem_inicio IS NOT NULL AND EXTRACT(day FROM c.data_viagem_inicio - now()) < 30::numeric THEN 100
            ELSE 0
        END AS urgencia_viagem,
    EXTRACT(day FROM now() - COALESCE(c.stage_entered_at, c.updated_at)) AS tempo_etapa_dias,
        CASE
            WHEN s.sla_hours IS NOT NULL AND (EXTRACT(epoch FROM now() - COALESCE(c.stage_entered_at, c.updated_at)) / 3600::numeric) > s.sla_hours::numeric THEN 1
            ELSE 0
        END AS urgencia_tempo_etapa,
    c.produto_data -> 'destinos'::text AS destinos,
    c.produto_data -> 'orcamento'::text AS orcamento,
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
    c.archived_at
   FROM public.cards c
     LEFT JOIN public.pipeline_stages s ON c.pipeline_stage_id = s.id
     LEFT JOIN public.pipelines p ON c.pipeline_id = p.id
     LEFT JOIN public.contatos pe ON c.pessoa_principal_id = pe.id
     LEFT JOIN public.profiles pr ON c.dono_atual_id = pr.id
     LEFT JOIN public.profiles sdr ON c.sdr_owner_id = sdr.id
     LEFT JOIN public.profiles vendas ON c.vendas_owner_id = vendas.id
     LEFT JOIN (
       SELECT card_id,
         COUNT(*) AS docs_total,
         COUNT(*) FILTER (WHERE status = 'recebido') AS docs_completed
       FROM public.card_document_requirements
       GROUP BY card_id
     ) dc ON dc.card_id = c.id
  WHERE c.deleted_at IS NULL;
