-- ============================================================================
-- MIGRATION: Normalização Definitiva de Telefone
-- Date: 2026-02-18
--
-- Problema:
-- O trigger normalize_contato_meio usa normalize_phone() (mantém código 55)
-- mas o sistema inteiro espera normalize_phone_brazil() (sem 55).
-- Isso cria dados inconsistentes em contato_meios.valor_normalizado,
-- causando falhas no matching de contatos e mensagens órfãs no WhatsApp History.
--
-- Fix: Cirúrgico no trigger + backfill seguro + coluna generated + simplificação
-- normalize_phone() NÃO é alterada (usada por APIs externas que precisam do 55)
-- ============================================================================

BEGIN;

-- ============================================================================
-- PARTE 1: Fix cirúrgico no trigger
-- O trigger agora usa normalize_phone_brazil() (sem 55) em vez de normalize_phone()
-- ============================================================================

CREATE OR REPLACE FUNCTION normalize_contato_meio()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.tipo IN ('telefone', 'whatsapp') THEN
        NEW.valor_normalizado := normalize_phone_brazil(NEW.valor);
    ELSIF NEW.tipo = 'email' THEN
        NEW.valor_normalizado := lower(trim(NEW.valor));
    ELSE
        NEW.valor_normalizado := NEW.valor;
    END IF;
    NEW.updated_at := now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- PARTE 2: Coluna generated em contatos (elimina normalização on-the-fly)
-- Atualiza automaticamente quando contatos.telefone muda
-- ============================================================================

ALTER TABLE contatos
ADD COLUMN IF NOT EXISTS telefone_normalizado text
  GENERATED ALWAYS AS (normalize_phone_brazil(telefone)) STORED;

CREATE INDEX IF NOT EXISTS idx_contatos_telefone_normalizado
ON contatos(telefone_normalizado) WHERE telefone_normalizado IS NOT NULL;

-- ============================================================================
-- PARTE 3: Backfill seguro de contato_meios.valor_normalizado
-- Tratamento de unique constraint (global: tipo + valor_normalizado)
-- ============================================================================

-- 3a. Dropar unique index temporariamente para evitar violações durante UPDATE
DROP INDEX IF EXISTS idx_contato_meios_unique;

-- 3b. Recalcular todos os valor_normalizado usando normalize_phone_brazil
UPDATE contato_meios
SET valor_normalizado = normalize_phone_brazil(valor)
WHERE tipo IN ('telefone', 'whatsapp')
AND valor IS NOT NULL AND valor <> '';

-- 3c. Dedup intra-contato: mesmo contato, mesmo tipo, mesmo normalizado → manter mais antigo
DELETE FROM contato_meios a
USING contato_meios b
WHERE a.contato_id = b.contato_id
AND a.tipo = b.tipo
AND a.valor_normalizado = b.valor_normalizado
AND a.valor_normalizado IS NOT NULL
AND a.id > b.id;

-- 3d. Dedup cross-contato: contatos diferentes, mesmo tipo+normalizado
-- Manter o registro cujo contato foi criado primeiro (mais antigo = mais provável de ser o correto)
DELETE FROM contato_meios
WHERE id IN (
    SELECT cm_newer.id
    FROM contato_meios cm_newer
    JOIN contato_meios cm_older ON cm_newer.tipo = cm_older.tipo
        AND cm_newer.valor_normalizado = cm_older.valor_normalizado
        AND cm_newer.valor_normalizado IS NOT NULL
        AND cm_newer.contato_id <> cm_older.contato_id
    JOIN contatos c_newer ON cm_newer.contato_id = c_newer.id
    JOIN contatos c_older ON cm_older.contato_id = c_older.id
    WHERE c_newer.created_at > c_older.created_at
);

-- 3e. Recriar unique index
CREATE UNIQUE INDEX idx_contato_meios_unique
ON contato_meios(tipo, valor_normalizado) WHERE valor_normalizado IS NOT NULL;

-- ============================================================================
-- PARTE 4: Simplificar find_contact_by_whatsapp
-- Com dados consistentes, match direto é o caminho principal.
-- normalize_phone_robust mantido apenas como fallback (9o dígito, edge cases).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.find_contact_by_whatsapp(p_phone text, p_convo_id text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_contact_id uuid;
    v_canonical text;
BEGIN
    -- STEP 1: Exact match by Conversation ID (fastest, most precise)
    IF p_convo_id IS NOT NULL AND p_convo_id <> '' THEN
        SELECT id INTO v_contact_id
        FROM contatos
        WHERE last_whatsapp_conversation_id = p_convo_id
        LIMIT 1;

        IF v_contact_id IS NOT NULL THEN
            RETURN v_contact_id;
        END IF;
    END IF;

    -- Canonical format: DDD + number, no country code, digits only
    v_canonical := normalize_phone_brazil(p_phone);

    IF v_canonical IS NULL OR v_canonical = '' THEN
        RETURN NULL;
    END IF;

    -- STEP 2: Direct match on contato_meios (data now consistent)
    SELECT cm.contato_id INTO v_contact_id
    FROM contato_meios cm
    WHERE cm.tipo IN ('telefone', 'whatsapp')
    AND cm.valor_normalizado = v_canonical
    LIMIT 1;

    IF v_contact_id IS NOT NULL THEN
        RETURN v_contact_id;
    END IF;

    -- STEP 3: Direct match on contatos.telefone_normalizado (generated column)
    SELECT id INTO v_contact_id
    FROM contatos
    WHERE telefone_normalizado = v_canonical
    LIMIT 1;

    IF v_contact_id IS NOT NULL THEN
        RETURN v_contact_id;
    END IF;

    -- STEP 4: Multi-variant fallback (handles 9th digit differences, edge cases)
    -- Only runs if steps 2-3 miss, which should be rare with consistent data
    SELECT cm.contato_id INTO v_contact_id
    FROM contato_meios cm
    WHERE cm.tipo IN ('telefone', 'whatsapp')
    AND cm.valor_normalizado = ANY(normalize_phone_robust(p_phone))
    LIMIT 1;

    RETURN v_contact_id;
END;
$$;

-- ============================================================================
-- PARTE 5: Religar mensagens órfãs
-- Mensagens sem contact_id que agora podem ser linkadas
-- ============================================================================

-- Link orphan messages to contacts via phone matching
UPDATE whatsapp_messages wm
SET contact_id = c.id
FROM contatos c
WHERE wm.contact_id IS NULL
AND wm.sender_phone IS NOT NULL
AND c.telefone_normalizado = normalize_phone_brazil(wm.sender_phone);

-- Re-queue orphan raw events for reprocessing (last 30 days)
UPDATE whatsapp_raw_events
SET status = 'pending'
WHERE status IN ('no_contact', 'orphan')
AND processed_at > NOW() - interval '30 days';

-- ============================================================================
-- PARTE 6: CHECK constraint para prevenir regressão
-- valor_normalizado deve ser apenas dígitos (sem +, espaços, parênteses)
-- ============================================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_valor_normalizado_digits_only'
    ) THEN
        ALTER TABLE contato_meios
        ADD CONSTRAINT chk_valor_normalizado_digits_only
        CHECK (
            valor_normalizado IS NULL
            OR tipo NOT IN ('telefone', 'whatsapp')
            OR valor_normalizado ~ '^\d+$'
        );
    END IF;
END $$;

-- ============================================================================
-- PARTE 7: Recriar view_cards_acoes adicionando pessoa_telefone_normalizado
-- Baseada na definição REAL em produção (20260213_fix_view_cards_acoes_archived_at)
-- Única mudança: adicionar pe.telefone_normalizado AS pessoa_telefone_normalizado
-- ============================================================================

DROP VIEW IF EXISTS public.view_cards_acoes CASCADE;

CREATE VIEW public.view_cards_acoes AS
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
    pe.nome AS pessoa_nome,
    pe.telefone AS pessoa_telefone,
    pe.telefone_normalizado AS pessoa_telefone_normalizado,  -- NEW: stored column for phone search
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
  WHERE c.deleted_at IS NULL;

-- Refresh statistics
ANALYZE contatos;
ANALYZE contato_meios;

COMMIT;
