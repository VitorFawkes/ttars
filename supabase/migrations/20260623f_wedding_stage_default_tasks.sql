-- Tarefas-padrão de cada etapa EDITÁVEIS (Welcome Weddings) — F2.
-- Catálogo de DEFAULTS por etapa (não sistema operacional paralelo): o dono/Diana
-- editam sem dev (titulo, tipo, prazo em dias, trava, cobrança, abre-doc, ordem,
-- ativo) no Pipeline Studio. O seed_wedding_checklist_on_pos_venda passa a LER esta
-- tabela (20260623g) em vez do INSERT hardcoded.
--
-- Desenhada de propósito com as MESMAS colunas que stage_entry_task_templates +
-- as flags que faltam lá (trava/gera_cobranca/abre_doc) e 'marco', pra a migração
-- futura pro nativo (F4) ser renomeio+backfill, não rewrite.
--
-- Isolamento: org_id carimbado a partir do stage (strict-org); RLS por org;
-- seed nos stages REAIS do pos_venda WEDDING via pipeline_id (nunca slug solto —
-- resíduo da account Welcome Group colidiria).

BEGIN;

-- ─── 1. Tabela ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.wedding_stage_default_tasks (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id        UUID NOT NULL DEFAULT requesting_org_id() REFERENCES public.organizations(id) ON DELETE CASCADE,
    stage_id      UUID NOT NULL REFERENCES public.pipeline_stages(id) ON DELETE CASCADE,
    titulo        TEXT NOT NULL,
    tipo          TEXT NOT NULL DEFAULT 'tarefa'
                  CHECK (tipo IN ('reuniao','tarefa','pagamento','documento','reserva','bloqueio','lista')),
    dias_prazo    INTEGER CHECK (dias_prazo IS NULL OR dias_prazo BETWEEN 0 AND 365),
    trava         BOOLEAN NOT NULL DEFAULT false,   -- segura a etapa (vira gate na F3)
    gera_cobranca BOOLEAN NOT NULL DEFAULT false,   -- cobrança automática ao vencer (F3)
    abre_doc      BOOLEAN NOT NULL DEFAULT false,   -- "ler/abrir o documento" (anexo)
    marco         TEXT,                              -- 'etapa:key' (agrupa na espinha / roll-up do gate)
    ordem         INTEGER NOT NULL DEFAULT 0,
    ativo         BOOLEAN NOT NULL DEFAULT true,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wsdt_stage_ordem ON public.wedding_stage_default_tasks(stage_id, ordem);
CREATE INDEX IF NOT EXISTS idx_wsdt_org ON public.wedding_stage_default_tasks(org_id);

ALTER TABLE public.wedding_stage_default_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS wsdt_org_all ON public.wedding_stage_default_tasks;
CREATE POLICY wsdt_org_all ON public.wedding_stage_default_tasks TO authenticated
    USING (org_id = requesting_org_id())
    WITH CHECK (org_id = requesting_org_id());

DROP POLICY IF EXISTS wsdt_service_all ON public.wedding_stage_default_tasks;
CREATE POLICY wsdt_service_all ON public.wedding_stage_default_tasks TO service_role
    USING (TRUE) WITH CHECK (TRUE);

COMMENT ON TABLE public.wedding_stage_default_tasks IS
    'Tarefas-padrão editáveis por etapa do pos_venda WEDDING. Catálogo de DEFAULTS (não paralelo): seed_wedding_checklist_on_pos_venda lê daqui. Mesmas colunas de stage_entry_task_templates + trava/gera_cobranca/abre_doc/marco (ponte pra migração nativa futura). trava/gera_cobranca/abre_doc são GRAVADOS já, mas só AGEM na F3.';

-- ─── 2. org_id carimbado a partir do stage (strict-org) ─────────────────────
CREATE OR REPLACE FUNCTION public.wedding_stage_default_tasks_strict_org()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
BEGIN
  SELECT s.org_id INTO NEW.org_id FROM public.pipeline_stages s WHERE s.id = NEW.stage_id;
  IF NEW.org_id IS NULL THEN
    RAISE EXCEPTION 'wedding_stage_default_tasks: stage % sem org_id', NEW.stage_id;
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_wsdt_strict_org ON public.wedding_stage_default_tasks;
CREATE TRIGGER trg_wsdt_strict_org
  BEFORE INSERT OR UPDATE OF stage_id ON public.wedding_stage_default_tasks
  FOR EACH ROW EXECUTE FUNCTION public.wedding_stage_default_tasks_strict_org();

-- ─── 3. updated_at automático ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_wsdt_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $fn$
BEGIN NEW.updated_at := NOW(); RETURN NEW; END;
$fn$;

DROP TRIGGER IF EXISTS trg_wsdt_updated_at ON public.wedding_stage_default_tasks;
CREATE TRIGGER trg_wsdt_updated_at
  BEFORE UPDATE ON public.wedding_stage_default_tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_wsdt_updated_at();

-- ─── 4. SEED — 1ª versão das tarefas-padrão das 6 etapas (guia aprovado) ─────
-- Mapeado por ORDEM da etapa (1..6) nos stages reais do pos_venda WEDDING.
WITH wstages AS (
  SELECT s.id AS stage_id, s.ordem AS etapa_ordem
    FROM public.pipeline_stages s
    JOIN public.pipeline_phases ph ON ph.id = s.phase_id
    JOIN public.pipelines p ON p.id = s.pipeline_id
   WHERE p.produto::TEXT = 'WEDDING'
     AND ph.slug = 'pos_venda'
     AND s.ordem BETWEEN 1 AND 6
),
defs(etapa_ordem, ordem, titulo, tipo, dias_prazo, trava, gera_cobranca, abre_doc, marco) AS (
  VALUES
   -- E1 — Boas-vindas & Preparação
   (1,0,'Ler o contrato',                                  'documento', 3,   true,  false, true,  'boas_vindas:preparacao'),
   (1,1,'Assistir à conversa/reunião de vendas',           'tarefa',    3,   false, false, false, 'boas_vindas:preparacao'),
   (1,2,'Montar 3 opções de destino + hotel',              'tarefa',    5,   false, false, false, 'boas_vindas:preparacao'),
   (1,3,'Agendar a 1ª reunião com o casal',                'reuniao',   3,   true,  true,  false, 'boas_vindas:preparacao'),
   -- E2 — Primeira Reunião & Onboarding
   (2,0,'Realizar a 1ª reunião',                           'reuniao',   NULL,true,  true,  false, 'onboarding:reuniao1'),
   (2,1,'Mostrar ao casal as datas/prazos do planejamento','tarefa',    NULL,false, false, false, 'onboarding:reuniao1'),
   (2,2,'Casal começa a lista de convidados',              'lista',     NULL,false, true,  false, 'onboarding:lista_iniciada'),
   (2,3,'Agendar a próxima reunião',                       'reuniao',   7,   true,  false, false, 'onboarding:reuniao1'),
   -- E3 — Ciclo de Definição
   (3,0,'Definir o destino',                               'tarefa',    NULL,false, true,  false, 'propostas:definicao'),
   (3,1,'Definir o local da cerimônia',                    'tarefa',    NULL,false, true,  false, 'propostas:definicao'),
   (3,2,'Definir a data do casamento',                     'tarefa',    NULL,true,  true,  false, 'propostas:definicao'),
   (3,3,'Reuniões de ajuste',                              'reuniao',   NULL,false, false, false, 'propostas:definicao'),
   -- E4 — Reserva do Evento & Documentação
   (4,0,'Fazer a reserva da cerimônia/espaço',             'reserva',   NULL,true,  true,  false, 'definicao:reserva'),
   (4,1,'Enviar a documentação ao casal',                  'documento', NULL,false, false, false, 'definicao:documentacao'),
   (4,2,'Receber o contrato do casamento assinado',        'documento', NULL,true,  true,  true,  'definicao:documentacao'),
   (4,3,'Receber o sinal',                                 'pagamento', NULL,true,  true,  false, 'definicao:pagamento'),
   -- E5 — Bloqueio de Hospedagem & Ação Promocional
   (5,0,'Casal definir o nº de apartamentos a bloquear',   'bloqueio',  NULL,true,  true,  false, 'passagem:bloqueio'),
   (5,1,'Fechar o bloqueio com o hotel',                   'bloqueio',  NULL,true,  true,  false, 'passagem:hotel'),
   (5,2,'Definir a ação promocional',                      'tarefa',    NULL,false, false, false, 'passagem:promo'),
   -- E6 — Programação Final
   (6,0,'Montar a programação dia a dia',                  'tarefa',    NULL,false, false, false, 'aditivo:programacao'),
   (6,1,'Garantir a lista de convidados preenchida',       'lista',     NULL,true,  true,  false, 'aditivo:lista'),
   (6,2,'Revisar tudo + marcar "Pronto para Produção"',    'tarefa',    NULL,true,  false, false, 'aditivo:programacao')
)
INSERT INTO public.wedding_stage_default_tasks
       (stage_id, titulo, tipo, dias_prazo, trava, gera_cobranca, abre_doc, marco, ordem)
SELECT w.stage_id, d.titulo, d.tipo, d.dias_prazo, d.trava, d.gera_cobranca, d.abre_doc, d.marco, d.ordem
  FROM defs d
  JOIN wstages w ON w.etapa_ordem = d.etapa_ordem
 WHERE NOT EXISTS (
   SELECT 1 FROM public.wedding_stage_default_tasks x
    WHERE x.stage_id = w.stage_id AND x.titulo = d.titulo
 );

COMMIT;

-- ─── Validação ──────────────────────────────────────────────────────────────
DO $$
DECLARE v_tasks INT; v_stages INT;
BEGIN
  SELECT count(DISTINCT s.id) INTO v_stages
    FROM public.wedding_stage_default_tasks d
    JOIN public.pipeline_stages s ON s.id = d.stage_id
    JOIN public.pipeline_phases ph ON ph.id = s.phase_id
    JOIN public.pipelines p ON p.id = s.pipeline_id
   WHERE p.produto::TEXT = 'WEDDING' AND ph.slug = 'pos_venda';
  SELECT count(*) INTO v_tasks
    FROM public.wedding_stage_default_tasks d
    JOIN public.pipeline_stages s ON s.id = d.stage_id
    JOIN public.pipelines p ON p.id = s.pipeline_id
   WHERE p.produto::TEXT = 'WEDDING';
  IF v_stages < 6 THEN
    RAISE EXCEPTION 'wedding_stage_default_tasks: esperava 6 etapas semeadas, achei %', v_stages;
  END IF;
  RAISE NOTICE 'wedding_stage_default_tasks: OK (% tarefas em % etapas)', v_tasks, v_stages;
END $$;
