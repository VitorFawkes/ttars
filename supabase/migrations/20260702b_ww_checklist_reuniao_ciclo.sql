-- Ciclo de reunião na espinha do casamento (Weddings) — paridade com Trips.
--
-- Tarefas tipo='reuniao' do wedding_checklist ganham o ciclo completo que o
-- Trips tem em `tarefas`: agendar (data+hora), registrar como foi (status +
-- resultado), transcrição colada e GRAVAÇÃO da reunião (arquivo no bucket
-- meeting-recordings OU link externo) pra assistir depois.
--
-- Colunas espelham os nomes de `tarefas` (status/resultado/transcricao) de
-- propósito — a migração futura pro nativo (Fase 5) vira renomeio+backfill.

BEGIN;

-- IF EXISTS: o staging (defasado) não tem wedding_checklist — lá a migration é
-- no-op; em produção aplica de verdade (mesmo precedente da 20260623a).
ALTER TABLE IF EXISTS public.wedding_checklist ADD COLUMN IF NOT EXISTS data_hora TIMESTAMPTZ;
ALTER TABLE IF EXISTS public.wedding_checklist ADD COLUMN IF NOT EXISTS status_reuniao TEXT
  CHECK (status_reuniao IS NULL OR status_reuniao IN ('agendada','realizada','cancelada','reagendada','nao_compareceu'));
ALTER TABLE IF EXISTS public.wedding_checklist ADD COLUMN IF NOT EXISTS resultado TEXT;
ALTER TABLE IF EXISTS public.wedding_checklist ADD COLUMN IF NOT EXISTS transcricao TEXT;
ALTER TABLE IF EXISTS public.wedding_checklist ADD COLUMN IF NOT EXISTS gravacao_path TEXT;
ALTER TABLE IF EXISTS public.wedding_checklist ADD COLUMN IF NOT EXISTS gravacao_link TEXT;

DO $$
BEGIN
  IF to_regclass('public.wedding_checklist') IS NULL THEN
    RAISE NOTICE 'wedding_checklist não existe neste ambiente — migration virou no-op (esperado no staging).';
    RETURN;
  END IF;
  COMMENT ON COLUMN public.wedding_checklist.data_hora IS
    'Data e hora da reunião (tipo=reuniao). `prazo` continua sendo o prazo da tarefa; data_hora é o horário agendado.';
  COMMENT ON COLUMN public.wedding_checklist.status_reuniao IS
    'Ciclo da reunião: agendada → realizada/cancelada/reagendada/nao_compareceu. NULL em tarefas que não são reunião.';
  COMMENT ON COLUMN public.wedding_checklist.resultado IS
    'Resumo/ata do que foi decidido na reunião (registrado ao marcar realizada).';
  COMMENT ON COLUMN public.wedding_checklist.transcricao IS
    'Transcrição colada da reunião (texto).';
  COMMENT ON COLUMN public.wedding_checklist.gravacao_path IS
    'Path do arquivo da gravação no bucket meeting-recordings (upload direto).';
  COMMENT ON COLUMN public.wedding_checklist.gravacao_link IS
    'Link externo da gravação (Meet/Zoom/Drive), alternativa ao upload.';
END $$;

COMMIT;
