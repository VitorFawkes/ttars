-- =============================================================================
-- SYNC BIDIRECIONAL DE TAREFAS: ActiveCampaign ↔ WelcomeCRM
--
-- 1. Colunas external_id/external_source em tarefas
-- 2. Coluna tarefa_id em integration_outbound_queue
-- 3. Tabela integration_task_type_map (mapeamento AC dealTasktype ↔ CRM tipo)
-- 4. Tabela integration_task_sync_config (toggles por produto/pipeline)
-- 5. Trigger outbound em tarefas → integration_outbound_queue
-- =============================================================================

-- ══════════════════════════════════════════
-- 1. COLUNAS EM TAREFAS
-- ══════════════════════════════════════════
ALTER TABLE public.tarefas
  ADD COLUMN IF NOT EXISTS external_id TEXT,
  ADD COLUMN IF NOT EXISTS external_source TEXT DEFAULT 'activecampaign';

CREATE UNIQUE INDEX IF NOT EXISTS uq_tarefas_external
  ON public.tarefas(external_id, external_source)
  WHERE external_id IS NOT NULL AND deleted_at IS NULL;

-- ══════════════════════════════════════════
-- 2. COLUNA EM INTEGRATION_OUTBOUND_QUEUE
-- ══════════════════════════════════════════
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'integration_outbound_queue') THEN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'integration_outbound_queue' AND column_name = 'tarefa_id'
        ) THEN
            ALTER TABLE public.integration_outbound_queue
              ADD COLUMN tarefa_id UUID REFERENCES public.tarefas(id) ON DELETE SET NULL;
        END IF;
    END IF;
END $$;

-- ══════════════════════════════════════════
-- 3. TABELA integration_task_type_map
-- ══════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.integration_task_type_map (
    id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    integration_id  UUID REFERENCES public.integrations(id) ON DELETE CASCADE,
    pipeline_id     UUID REFERENCES public.pipelines(id) ON DELETE CASCADE,
    ac_task_type    INT NOT NULL,           -- 1=call, 2=email, 3=todo
    crm_task_tipo   TEXT NOT NULL,          -- 'ligacao', 'tarefa', 'reuniao', etc.
    sync_direction  TEXT NOT NULL DEFAULT 'both'
                    CHECK (sync_direction IN ('inbound', 'outbound', 'both')),
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(integration_id, pipeline_id, ac_task_type)
);

ALTER TABLE public.integration_task_type_map ENABLE ROW LEVEL SECURITY;

CREATE POLICY "task_type_map_select" ON public.integration_task_type_map
    FOR SELECT TO authenticated USING (TRUE);

CREATE POLICY "task_type_map_admin" ON public.integration_task_type_map
    FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = TRUE))
    WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = TRUE));

-- Seed defaults para TRIPS e WEDDING
INSERT INTO public.integration_task_type_map
    (integration_id, pipeline_id, ac_task_type, crm_task_tipo, sync_direction)
SELECT
    i.id, p.id, m.ac_type, m.crm_tipo, 'both'
FROM public.integrations i
JOIN public.pipelines p ON p.produto IN ('TRIPS', 'WEDDING')
CROSS JOIN (VALUES
    (1, 'ligacao'),   -- AC: call    → CRM: ligacao
    (2, 'tarefa'),    -- AC: email   → CRM: tarefa
    (3, 'tarefa')     -- AC: todo    → CRM: tarefa
) AS m(ac_type, crm_tipo)
WHERE i.provider = 'activecampaign'
ON CONFLICT (integration_id, pipeline_id, ac_task_type) DO NOTHING;

-- ══════════════════════════════════════════
-- 4. TABELA integration_task_sync_config
-- ══════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.integration_task_sync_config (
    id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    integration_id   UUID REFERENCES public.integrations(id) ON DELETE CASCADE,
    pipeline_id      UUID REFERENCES public.pipelines(id) ON DELETE CASCADE,
    inbound_enabled  BOOLEAN DEFAULT FALSE,
    outbound_enabled BOOLEAN DEFAULT FALSE,
    created_at       TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(integration_id, pipeline_id)
);

ALTER TABLE public.integration_task_sync_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "task_sync_config_select" ON public.integration_task_sync_config
    FOR SELECT TO authenticated USING (TRUE);

CREATE POLICY "task_sync_config_admin" ON public.integration_task_sync_config
    FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = TRUE))
    WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = TRUE));

-- Seed: TRIPS e WEDDING desligados por default (rollout seguro)
INSERT INTO public.integration_task_sync_config
    (integration_id, pipeline_id, inbound_enabled, outbound_enabled)
SELECT i.id, p.id, FALSE, FALSE
FROM public.integrations i
JOIN public.pipelines p ON p.produto IN ('TRIPS', 'WEDDING')
WHERE i.provider = 'activecampaign'
ON CONFLICT (integration_id, pipeline_id) DO NOTHING;

-- ══════════════════════════════════════════
-- 5. TRIGGER OUTBOUND EM TAREFAS
-- ══════════════════════════════════════════
CREATE OR REPLACE FUNCTION log_outbound_tarefa_event()
RETURNS TRIGGER AS $$
DECLARE
    v_integration_id    UUID;
    v_card_external_id  TEXT;
    v_card_id           UUID;
    v_card_pipeline_id  UUID;
    v_outbound_enabled  BOOLEAN := FALSE;
    v_event_type        TEXT;
    v_payload           JSONB := '{}';
BEGIN
    -- Guard 1: Loop prevention (integration-process seta esta variável)
    IF current_setting('app.update_source', TRUE) = 'integration' THEN
        RETURN NEW;
    END IF;

    -- Guard 2: Tarefa deletada → ignorar
    IF NEW.deleted_at IS NOT NULL THEN
        RETURN NEW;
    END IF;

    -- Guard 3: Se UPDATE mudou APENAS external_id → skip (write-back do dispatcher)
    IF TG_OP = 'UPDATE'
       AND NEW.external_id IS DISTINCT FROM OLD.external_id
       AND NEW.titulo IS NOT DISTINCT FROM OLD.titulo
       AND NEW.concluida IS NOT DISTINCT FROM OLD.concluida
       AND NEW.data_vencimento IS NOT DISTINCT FROM OLD.data_vencimento
       AND NEW.tipo IS NOT DISTINCT FROM OLD.tipo
       AND NEW.responsavel_id IS NOT DISTINCT FROM OLD.responsavel_id
    THEN
        RETURN NEW;
    END IF;

    -- Resolve card → external_id + pipeline_id
    SELECT c.external_id, c.id, c.pipeline_id
    INTO v_card_external_id, v_card_id, v_card_pipeline_id
    FROM public.cards c
    WHERE c.id = NEW.card_id
      AND c.external_id IS NOT NULL;

    -- Sem card vinculado ao AC → ignorar
    IF v_card_external_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- Buscar integração AC
    SELECT id INTO v_integration_id
    FROM public.integrations
    WHERE provider = 'activecampaign' AND is_active = TRUE
    LIMIT 1;

    IF v_integration_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- Check toggle por produto/pipeline
    SELECT outbound_enabled INTO v_outbound_enabled
    FROM public.integration_task_sync_config
    WHERE integration_id = v_integration_id
      AND pipeline_id = v_card_pipeline_id;

    IF NOT COALESCE(v_outbound_enabled, FALSE) THEN
        RETURN NEW;
    END IF;

    -- Determinar event_type
    IF TG_OP = 'INSERT' THEN
        v_event_type := 'task_created';
    ELSIF OLD.concluida IS DISTINCT FROM NEW.concluida AND NEW.concluida = TRUE THEN
        v_event_type := 'task_completed';
    ELSE
        v_event_type := 'task_updated';
    END IF;

    -- Construir payload
    v_payload := jsonb_build_object(
        'ac_deal_id',       v_card_external_id,
        'tarefa_id',        NEW.id,
        'titulo',           NEW.titulo,
        'tipo',             NEW.tipo,
        'data_vencimento',  NEW.data_vencimento,
        'concluida',        COALESCE(NEW.concluida, FALSE),
        'responsavel_id',   NEW.responsavel_id,
        'pipeline_id',      v_card_pipeline_id
    );

    -- Enfileirar
    INSERT INTO public.integration_outbound_queue (
        card_id, tarefa_id, integration_id, external_id, event_type, payload, status, triggered_by
    ) VALUES (
        v_card_id,
        NEW.id,
        v_integration_id,
        NEW.external_id,  -- NULL para task_created (sem AC task ID ainda)
        v_event_type,
        v_payload,
        'pending',
        'system'
    );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Dropar trigger existente se houver (idempotência)
DROP TRIGGER IF EXISTS trg_tarefa_outbound_sync ON public.tarefas;

CREATE TRIGGER trg_tarefa_outbound_sync
AFTER INSERT OR UPDATE ON public.tarefas
FOR EACH ROW EXECUTE FUNCTION log_outbound_tarefa_event();

COMMENT ON FUNCTION log_outbound_tarefa_event IS
'Trigger que monitora INSERT/UPDATE em tarefas e enfileira eventos outbound.
INSERT → task_created, UPDATE concluida → task_completed, UPDATE outros → task_updated.
Guards: app.update_source=integration (anti-loop), deleted_at, external_id-only update,
card com external_id, integration_task_sync_config.outbound_enabled por pipeline.';
