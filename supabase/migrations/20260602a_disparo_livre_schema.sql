-- ============================================================================
-- Disparo Livre — schema base (3 tabelas + triggers + RLS + realtime)
-- ============================================================================
-- Subsistema de disparo de mensagens de TEXTO LIVRE para convidados via número
-- NÃO-OFICIAL do Echo, com throttle por tempo pra reduzir risco de bloqueio Meta.
-- Roda em PARALELO ao fluxo de template (send-echo-template / envio_lotes) — NÃO
-- mexe nele. Produto WEDDING / workspace Welcome Weddings, isolado por org_id.
--
--   disparo_campanhas  — a campanha/lote pai (texto + linha + config de ritmo)
--   disparo_fila       — 1 linha por destinatário, com execute_at (quando enviar)
--   disparo_opt_outs   — blocklist persistente (quem pediu pra não receber)
--
-- Reusa: send-whatsapp-message (envio), padrão execute_at + pg_cron (dreno),
--        whatsapp_linha_config (linha), sdr_normalize_phone (telefone).
-- ============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────
-- 1. disparo_campanhas — campanha/lote pai
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.disparo_campanhas (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              UUID NOT NULL DEFAULT requesting_org_id() REFERENCES public.organizations(id) ON DELETE CASCADE,
  titulo              TEXT NOT NULL,
  corpo_mensagem      TEXT NOT NULL,
  phone_number_id     TEXT NOT NULL,                       -- linha Echo (UUID = não-oficial)
  status              TEXT NOT NULL DEFAULT 'rascunho'
                        CHECK (status IN ('rascunho','agendado','disparando','pausado','concluido','cancelado')),
  total               INT  NOT NULL DEFAULT 0,
  enviados            INT  NOT NULL DEFAULT 0,
  falhados            INT  NOT NULL DEFAULT 0,
  opt_outs            INT  NOT NULL DEFAULT 0,
  -- Config de ritmo (anti-bloqueio)
  cap_diario          INT  NOT NULL DEFAULT 500,           -- teto/dia ajustável
  usar_ramp           BOOLEAN NOT NULL DEFAULT true,       -- sobe gradual até o cap pra aquecer
  janela_inicio       TIME NOT NULL DEFAULT '08:00',
  janela_fim          TIME NOT NULL DEFAULT '20:00',
  -- Variáveis disponíveis na mensagem (nomes das colunas da lista + 'nome')
  variaveis_mapeadas  JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Estimativa mostrada ao usuário
  estimado_termino_at TIMESTAMPTZ,
  estimado_dias       NUMERIC,
  criado_por          UUID,                                 -- user_id (opcional, sem FK cross-org)
  started_at          TIMESTAMPTZ,
  paused_at           TIMESTAMPTZ,
  finished_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_disparo_campanhas_org_created
  ON public.disparo_campanhas(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_disparo_campanhas_org_status
  ON public.disparo_campanhas(org_id, status);

-- ─────────────────────────────────────────────────────────────────────────
-- 2. disparo_fila — 1 linha por destinatário (o "miolo")
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.disparo_fila (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              UUID NOT NULL DEFAULT requesting_org_id() REFERENCES public.organizations(id) ON DELETE CASCADE,
  campaign_id         UUID NOT NULL REFERENCES public.disparo_campanhas(id) ON DELETE CASCADE,
  contact_id          UUID NOT NULL REFERENCES public.contatos(id) ON DELETE CASCADE,
  telefone_normalizado TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','processing','sent','failed','opt_out','cancelado')),
  execute_at          TIMESTAMPTZ NOT NULL,                -- ⭐ quando enviar (throttle)
  priority            INT  NOT NULL DEFAULT 0,             -- 1 = já interagiu (vai antes), 0 = novo
  attempts            INT  NOT NULL DEFAULT 0,
  max_attempts        INT  NOT NULL DEFAULT 3,
  claimed_at          TIMESTAMPTZ,                         -- lock do dispatcher (reaper de travados)
  whatsapp_message_id TEXT,                                -- id retornado pelo send-whatsapp-message
  variaveis           JSONB NOT NULL DEFAULT '{}'::jsonb,  -- valores das colunas da lista p/ esta pessoa
  corpo_renderizado   TEXT,                                -- mensagem já com variáveis substituídas
  erro_motivo         TEXT,
  error_code          TEXT,                                -- código Echo/Meta (circuit breaker)
  enviado_at          TIMESTAMPTZ,
  metadata            JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_disparo_fila_campaign_contact UNIQUE (campaign_id, contact_id)
);

-- Dreno: próximos itens prontos a enviar
CREATE INDEX IF NOT EXISTS idx_disparo_fila_pending
  ON public.disparo_fila(execute_at, priority DESC)
  WHERE status = 'pending';
-- Reaper: itens travados em processing
CREATE INDEX IF NOT EXISTS idx_disparo_fila_stale_claimed
  ON public.disparo_fila(claimed_at)
  WHERE status = 'processing';
CREATE INDEX IF NOT EXISTS idx_disparo_fila_campaign_status
  ON public.disparo_fila(campaign_id, status);
CREATE INDEX IF NOT EXISTS idx_disparo_fila_org
  ON public.disparo_fila(org_id);

-- ─────────────────────────────────────────────────────────────────────────
-- 3. disparo_opt_outs — blocklist persistente
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.disparo_opt_outs (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id               UUID NOT NULL DEFAULT requesting_org_id() REFERENCES public.organizations(id) ON DELETE CASCADE,
  contact_id           UUID REFERENCES public.contatos(id) ON DELETE CASCADE,
  telefone_normalizado TEXT NOT NULL,
  phone_number_id      TEXT,
  reason               TEXT NOT NULL
                         CHECK (reason IN ('user_requested','inbound_rejection','repeated_failure','manual')),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_disparo_opt_outs_org_phone UNIQUE (org_id, telefone_normalizado)
);

CREATE INDEX IF NOT EXISTS idx_disparo_opt_outs_org_phone
  ON public.disparo_opt_outs(org_id, telefone_normalizado);

-- ─────────────────────────────────────────────────────────────────────────
-- 4. Trigger FK cross-org — força disparo_fila.org_id = campanha.org_id
--    (modelo canônico cadence_steps; impede linha apontar p/ outra org)
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.disparo_fila_set_org()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_campaign_org UUID;
BEGIN
  SELECT org_id INTO v_campaign_org FROM public.disparo_campanhas WHERE id = NEW.campaign_id;
  IF v_campaign_org IS NULL THEN
    RAISE EXCEPTION 'disparo_fila: campanha % inexistente', NEW.campaign_id
      USING ERRCODE = 'check_violation';
  END IF;
  NEW.org_id := v_campaign_org;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_disparo_fila_set_org ON public.disparo_fila;
CREATE TRIGGER trg_disparo_fila_set_org
  BEFORE INSERT OR UPDATE ON public.disparo_fila
  FOR EACH ROW EXECUTE FUNCTION public.disparo_fila_set_org();

-- ─────────────────────────────────────────────────────────────────────────
-- 5. Recalc de contadores da campanha (STATEMENT-level, via transition table —
--    1 recálculo por statement, barato mesmo enfileirando centenas de uma vez)
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.recalc_disparo_campanha()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.disparo_campanhas c
     SET total       = s.total,
         enviados    = s.sent,
         falhados    = s.failed,
         opt_outs    = s.opt,
         status      = CASE
                         WHEN c.status IN ('cancelado','rascunho') THEN c.status
                         WHEN s.total > 0 AND s.pending = 0 THEN 'concluido'
                         ELSE c.status
                       END,
         finished_at = CASE
                         WHEN s.total > 0 AND s.pending = 0 AND c.finished_at IS NULL THEN now()
                         ELSE c.finished_at
                       END
    FROM (
      SELECT f.campaign_id,
             count(*)                                                  AS total,
             count(*) FILTER (WHERE f.status = 'sent')                 AS sent,
             count(*) FILTER (WHERE f.status = 'failed')               AS failed,
             count(*) FILTER (WHERE f.status = 'opt_out')              AS opt,
             count(*) FILTER (WHERE f.status IN ('pending','processing')) AS pending
        FROM public.disparo_fila f
       WHERE f.campaign_id IN (SELECT DISTINCT campaign_id FROM affected)
       GROUP BY f.campaign_id
    ) s
   WHERE c.id = s.campaign_id;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_recalc_disparo_campanha_ins ON public.disparo_fila;
CREATE TRIGGER trg_recalc_disparo_campanha_ins
  AFTER INSERT ON public.disparo_fila
  REFERENCING NEW TABLE AS affected
  FOR EACH STATEMENT EXECUTE FUNCTION public.recalc_disparo_campanha();

DROP TRIGGER IF EXISTS trg_recalc_disparo_campanha_upd ON public.disparo_fila;
CREATE TRIGGER trg_recalc_disparo_campanha_upd
  AFTER UPDATE ON public.disparo_fila
  REFERENCING NEW TABLE AS affected
  FOR EACH STATEMENT EXECUTE FUNCTION public.recalc_disparo_campanha();

DROP TRIGGER IF EXISTS trg_recalc_disparo_campanha_del ON public.disparo_fila;
CREATE TRIGGER trg_recalc_disparo_campanha_del
  AFTER DELETE ON public.disparo_fila
  REFERENCING OLD TABLE AS affected
  FOR EACH STATEMENT EXECUTE FUNCTION public.recalc_disparo_campanha();

-- ─────────────────────────────────────────────────────────────────────────
-- 6. RLS — isolamento por org_id (padrão canônico; nada de USING(true) p/ auth)
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE public.disparo_campanhas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.disparo_fila      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.disparo_opt_outs  ENABLE ROW LEVEL SECURITY;

-- disparo_campanhas: authenticated faz CRUD da própria org (cria/edita rascunho;
-- pausar/cancelar). Mutations setam org_id implicitamente via DEFAULT.
DROP POLICY IF EXISTS disparo_campanhas_org_all ON public.disparo_campanhas;
CREATE POLICY disparo_campanhas_org_all ON public.disparo_campanhas FOR ALL TO authenticated
  USING (org_id = requesting_org_id()) WITH CHECK (org_id = requesting_org_id());
DROP POLICY IF EXISTS disparo_campanhas_service_all ON public.disparo_campanhas;
CREATE POLICY disparo_campanhas_service_all ON public.disparo_campanhas FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- disparo_fila: authenticated só LÊ (realtime/relatório). Escrita só via RPC
-- SECURITY DEFINER e dispatcher (service_role).
DROP POLICY IF EXISTS disparo_fila_org_read ON public.disparo_fila;
CREATE POLICY disparo_fila_org_read ON public.disparo_fila FOR SELECT TO authenticated
  USING (org_id = requesting_org_id());
DROP POLICY IF EXISTS disparo_fila_service_all ON public.disparo_fila;
CREATE POLICY disparo_fila_service_all ON public.disparo_fila FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- disparo_opt_outs: authenticated lê. Escrita via RPC/dispatcher.
DROP POLICY IF EXISTS disparo_opt_outs_org_read ON public.disparo_opt_outs;
CREATE POLICY disparo_opt_outs_org_read ON public.disparo_opt_outs FOR SELECT TO authenticated
  USING (org_id = requesting_org_id());
DROP POLICY IF EXISTS disparo_opt_outs_service_all ON public.disparo_opt_outs;
CREATE POLICY disparo_opt_outs_service_all ON public.disparo_opt_outs FOR ALL TO service_role
  USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.disparo_campanhas TO authenticated;
GRANT SELECT ON public.disparo_fila      TO authenticated;
GRANT SELECT ON public.disparo_opt_outs  TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 7. Realtime — board acompanha progresso ao vivo
-- ─────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.disparo_campanhas;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.disparo_fila;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

COMMENT ON TABLE public.disparo_campanhas IS 'Disparo Livre: campanha de mensagem de texto livre (Echo não-oficial) com throttle. Por-org. Paralelo ao fluxo de template (envio_lotes).';
COMMENT ON TABLE public.disparo_fila IS 'Disparo Livre: 1 linha por destinatário, drenada por disparo-dispatcher (pg_cron) respeitando execute_at. Por-org.';
COMMENT ON TABLE public.disparo_opt_outs IS 'Disparo Livre: blocklist de quem pediu pra não receber. Checada na ingestão e no envio.';

COMMIT;
