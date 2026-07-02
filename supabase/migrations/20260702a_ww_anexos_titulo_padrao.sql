-- Anexos da página do casamento (Weddings) — título customizável + anexos-PADRÃO editáveis.
--
-- 1) `arquivos` ganha `titulo` (nome de exibição editável; `nome_original` preservado)
--    e `slot_key` (liga o arquivo a um "anexo padrão" esperado do casamento).
-- 2) `wedding_default_attachments` = catálogo POR WORKSPACE dos anexos que todo
--    casamento deve ter (ex.: contrato assinado, comprovante do sinal). Editável
--    na própria tela (mesmo espírito do wedding_stage_default_tasks: catálogo de
--    DEFAULTS, não sistema paralelo). Seed = 1ª sugestão pro Vitor revisar.
-- 3) Buckets: card-documents volta à lista ampla de tipos (a config viva em prod
--    regrediu p/ 4 mimes/10MB); novo bucket meeting-recordings (gravações de
--    reunião — vídeo/áudio, privado) usado pelo ciclo de reunião da espinha.

BEGIN;

-- ─── 1. arquivos: título de exibição + slot de anexo padrão ──────────────────
-- IF EXISTS: resiliente a ambiente defasado (staging pode não ter arquivos).
ALTER TABLE IF EXISTS public.arquivos ADD COLUMN IF NOT EXISTS titulo TEXT;
ALTER TABLE IF EXISTS public.arquivos ADD COLUMN IF NOT EXISTS slot_key TEXT;

DO $$
BEGIN
  IF to_regclass('public.arquivos') IS NULL THEN
    RAISE NOTICE 'arquivos não existe neste ambiente — parte 1 virou no-op.';
    RETURN;
  END IF;
  CREATE INDEX IF NOT EXISTS idx_arquivos_card_slot ON public.arquivos(card_id, slot_key)
    WHERE slot_key IS NOT NULL;
  COMMENT ON COLUMN public.arquivos.titulo IS
    'Nome de exibição editável pelo usuário (fallback: nome_original). nome_original nunca é sobrescrito.';
  COMMENT ON COLUMN public.arquivos.slot_key IS
    'Chave do anexo-padrão que este arquivo cumpre (wedding_default_attachments.slot_key). NULL = anexo livre.';
END $$;

-- ─── 2. Catálogo de anexos-padrão por workspace (Weddings) ───────────────────
CREATE TABLE IF NOT EXISTS public.wedding_default_attachments (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id      UUID NOT NULL DEFAULT requesting_org_id() REFERENCES public.organizations(id) ON DELETE CASCADE,
    slot_key    TEXT NOT NULL,
    titulo      TEXT NOT NULL,
    descricao   TEXT,
    obrigatorio BOOLEAN NOT NULL DEFAULT false,
    ordem       INTEGER NOT NULL DEFAULT 0,
    ativo       BOOLEAN NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (org_id, slot_key)
);

CREATE INDEX IF NOT EXISTS idx_wda_org_ordem ON public.wedding_default_attachments(org_id, ordem);

ALTER TABLE public.wedding_default_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS wda_org_all ON public.wedding_default_attachments;
CREATE POLICY wda_org_all ON public.wedding_default_attachments TO authenticated
    USING (org_id = requesting_org_id())
    WITH CHECK (org_id = requesting_org_id());

DROP POLICY IF EXISTS wda_service_all ON public.wedding_default_attachments;
CREATE POLICY wda_service_all ON public.wedding_default_attachments TO service_role
    USING (TRUE) WITH CHECK (TRUE);

COMMENT ON TABLE public.wedding_default_attachments IS
    'Anexos-padrão esperados em todo casamento (Weddings), editáveis pela equipe na tela do casamento. Um arquivo em `arquivos` com slot_key correspondente marca o slot como cumprido.';

CREATE OR REPLACE FUNCTION public.update_wda_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $fn$
BEGIN NEW.updated_at := NOW(); RETURN NEW; END;
$fn$;

DROP TRIGGER IF EXISTS trg_wda_updated_at ON public.wedding_default_attachments;
CREATE TRIGGER trg_wda_updated_at
  BEFORE UPDATE ON public.wedding_default_attachments
  FOR EACH ROW EXECUTE FUNCTION public.update_wda_updated_at();

-- ─── 3. Seed — 1ª sugestão (Vitor revisa/edita na tela) ──────────────────────
-- Semeia em todo WORKSPACE que tem pipeline WEDDING (hoje: Welcome Weddings).
-- Guardado num DO + EXECUTE: o staging defasado não tem pipelines.org_id — lá
-- o seed vira no-op em vez de quebrar a migration inteira.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'pipelines' AND column_name = 'org_id'
  ) THEN
    RAISE NOTICE 'pipelines.org_id não existe neste ambiente — seed pulado (esperado no staging).';
    RETURN;
  END IF;

  EXECUTE $seed$
    WITH ww_orgs AS (
      SELECT DISTINCT p.org_id
        FROM public.pipelines p
        JOIN public.organizations o ON o.id = p.org_id
       WHERE p.produto::TEXT = 'WEDDING'
         AND o.parent_org_id IS NOT NULL
    ),
    seeds(slot_key, titulo, descricao, obrigatorio, ordem) AS (
      VALUES
        ('contrato_casamento',   'Contrato do casamento (assinado)',            'O contrato fechado com o casal, já assinado.',                      true,  1),
        ('comprovante_sinal',    'Comprovante do sinal',                        'Comprovante do pagamento do sinal.',                                true,  2),
        ('contrato_hotel',       'Contrato / acordo do hotel (bloqueio)',       'Contrato ou acordo de bloqueio de quartos com o hotel.',            true,  3),
        ('contrato_venue',       'Contrato do espaço (venue)',                  'Contrato do local da cerimônia/recepção, quando separado do hotel.', false, 4),
        ('tarifario_politicas',  'Tarifário & políticas do hotel',              'Tarifas, política de cancelamento e de redução do contrato.',       false, 5),
        ('apresentacao_casal',   'Apresentação enviada ao casal',               'A apresentação/proposta que o casal recebeu.',                      false, 6),
        ('planilha_orcamento',   'Planilha de orçamento',                       'Orçamento do casamento (versão mais atual).',                       false, 7),
        ('lista_convidados',     'Lista de convidados (arquivo)',               'Arquivo da lista, quando o casal manda em planilha.',               false, 8),
        ('cronograma_grande_dia','Cronograma do grande dia',                    'Roteiro/cronograma do dia do casamento.',                           false, 9),
        ('documentos_casal',     'Documentos do casal (RG / passaporte)',       'Documentos de identificação dos noivos.',                           false, 10)
    )
    INSERT INTO public.wedding_default_attachments (org_id, slot_key, titulo, descricao, obrigatorio, ordem)
    SELECT w.org_id, s.slot_key, s.titulo, s.descricao, s.obrigatorio, s.ordem
      FROM ww_orgs w CROSS JOIN seeds s
    ON CONFLICT (org_id, slot_key) DO NOTHING
  $seed$;
END $$;

-- ─── 4. Buckets ───────────────────────────────────────────────────────────────
-- card-documents: restaura a lista ampla (a config viva regrediu) + 25MB.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('card-documents', 'card-documents', false, 26214400, ARRAY[
  'image/jpeg','image/png','image/webp','image/gif','image/svg+xml','image/heic','image/heif',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain','text/csv',
  'application/zip','application/x-rar-compressed','application/x-zip-compressed',
  'audio/mpeg','audio/mp4','audio/m4a','audio/x-m4a','audio/wav','audio/ogg','audio/webm'
])
ON CONFLICT (id) DO UPDATE SET
  allowed_mime_types = EXCLUDED.allowed_mime_types,
  file_size_limit = EXCLUDED.file_size_limit;

-- meeting-recordings: gravações de reunião (assistir depois). Privado, 1GB.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('meeting-recordings', 'meeting-recordings', false, 1073741824, ARRAY['video/*','audio/*'])
ON CONFLICT (id) DO UPDATE SET
  allowed_mime_types = EXCLUDED.allowed_mime_types,
  file_size_limit = EXCLUDED.file_size_limit;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'meeting-recordings-select') THEN
    CREATE POLICY "meeting-recordings-select" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'meeting-recordings');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'meeting-recordings-insert') THEN
    CREATE POLICY "meeting-recordings-insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'meeting-recordings');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'meeting-recordings-delete') THEN
    CREATE POLICY "meeting-recordings-delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'meeting-recordings');
  END IF;
END $$;

COMMIT;
