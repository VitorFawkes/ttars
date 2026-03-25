-- ============================================================
-- Anexos: substituir sistema de Documentos (checklist) por
-- sistema de Anexos genérico (upload livre de arquivos)
-- ============================================================

-- 0. Criar tabela arquivos se não existir (existe em prod via Pipeline Studio, pode não existir em staging)
CREATE TABLE IF NOT EXISTS arquivos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  pessoa_id UUID REFERENCES contatos(id) ON DELETE SET NULL,
  caminho_arquivo TEXT NOT NULL,
  nome_original TEXT NOT NULL,
  mime_type TEXT,
  tamanho_bytes BIGINT,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_arquivos_card_id ON arquivos(card_id);

-- RLS
ALTER TABLE arquivos ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'arquivos' AND policyname = 'arquivos_select') THEN
    CREATE POLICY arquivos_select ON arquivos FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'arquivos' AND policyname = 'arquivos_insert') THEN
    CREATE POLICY arquivos_insert ON arquivos FOR INSERT WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'arquivos' AND policyname = 'arquivos_update') THEN
    CREATE POLICY arquivos_update ON arquivos FOR UPDATE USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'arquivos' AND policyname = 'arquivos_delete') THEN
    CREATE POLICY arquivos_delete ON arquivos FOR DELETE USING (true);
  END IF;
END $$;

-- 0b. Criar bucket card-documents se não existir
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('card-documents', 'card-documents', false, 26214400, ARRAY[
  'image/jpeg','image/png','image/webp','image/gif','image/svg+xml',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain','text/csv',
  'application/zip','application/x-rar-compressed'
])
ON CONFLICT (id) DO UPDATE SET
  allowed_mime_types = EXCLUDED.allowed_mime_types,
  file_size_limit = EXCLUDED.file_size_limit;

-- Storage policies para card-documents
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'card-documents-select') THEN
    CREATE POLICY "card-documents-select" ON storage.objects FOR SELECT USING (bucket_id = 'card-documents');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'card-documents-insert') THEN
    CREATE POLICY "card-documents-insert" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'card-documents');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'card-documents-delete') THEN
    CREATE POLICY "card-documents-delete" ON storage.objects FOR DELETE USING (bucket_id = 'card-documents');
  END IF;
END $$;

-- 1. Coluna descricao na tabela arquivos (nota por arquivo)
ALTER TABLE arquivos ADD COLUMN IF NOT EXISTS descricao TEXT;

-- 2. Atualizar referências FK antes de renomear a key
UPDATE stage_section_config SET section_key = 'anexos' WHERE section_key = 'documentos';

-- 3. Atualizar seção documentos → anexos
UPDATE sections
SET key = 'anexos',
    label = 'Anexos',
    icon = 'Paperclip',
    color = 'bg-indigo-50 text-indigo-700 border-indigo-100',
    widget_component = 'anexos'
WHERE key = 'documentos';

-- 4. Atualizar view_cards_acoes: trocar card_document_requirements por arquivos
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
    -- Anexos: contagem simples (substitui docs_total/docs_completed)
    COALESCE(ac.anexos_count, (0)::bigint) AS anexos_count,
    pe.telefone_normalizado AS pessoa_telefone_normalizado,
    ARRAY( SELECT cta.tag_id
           FROM card_tag_assignments cta
          WHERE (cta.card_id = c.id)) AS tag_ids,
    c.receita,
    c.receita_source,
    COALESCE(c.valor_final, c.valor_estimado, 0) AS valor_display,
    COALESCE(prd.prods_total, (0)::bigint) AS prods_total,
    COALESCE(prd.prods_ready, (0)::bigint) AS prods_ready
   FROM ((((((((cards c
     LEFT JOIN pipeline_stages s ON ((c.pipeline_stage_id = s.id)))
     LEFT JOIN pipelines p ON ((c.pipeline_id = p.id)))
     LEFT JOIN contatos pe ON ((c.pessoa_principal_id = pe.id)))
     LEFT JOIN profiles pr ON ((c.dono_atual_id = pr.id)))
     LEFT JOIN profiles sdr ON ((c.sdr_owner_id = sdr.id)))
     LEFT JOIN profiles vendas ON ((c.vendas_owner_id = vendas.id)))
     LEFT JOIN ( SELECT arquivos.card_id,
            count(*) AS anexos_count
           FROM arquivos
          GROUP BY arquivos.card_id) ac ON ((ac.card_id = c.id)))
     LEFT JOIN ( SELECT card_financial_items.card_id,
            count(*) AS prods_total,
            count(*) FILTER (WHERE (card_financial_items.is_ready = true)) AS prods_ready
           FROM card_financial_items
          GROUP BY card_financial_items.card_id) prd ON ((prd.card_id = c.id)))
  WHERE (c.deleted_at IS NULL);
