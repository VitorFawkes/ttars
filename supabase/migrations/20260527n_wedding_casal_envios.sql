-- Feature: Lista de Convidados — Envios e histórico (snapshot por "Pronto")
--
-- Adiciona:
-- 1) wedding_casais.enviado_em / visto_em — última vez que casal clicou
--    "Pronto" e última vez que time marcou como visto.
-- 2) wedding_casal_envios — tabela de snapshots. Cada vez que casal clica
--    "Pronto" cria um registro com snapshot completo da lista (JSONB).
-- 3) RPC pública: wedding_casal_marcar_pronto(codigo)
-- 4) RPC pública: wedding_casal_get_by_codigo_v2(codigo) — versão estendida
--    que inclui enviado_em e tem_alteracoes_pendentes. A v1 continua existindo.
-- 5) RPC admin: wedding_casal_admin_list_v2() — inclui enviado_em e flag
--    alterado_depois_do_envio.
-- 6) RPC admin: wedding_casal_admin_envios(casal_id) + marcar_visto(casal_id)
--
-- NOMES V2 deliberadamente novos para evitar rebase cego de funções que
-- têm múltiplas migrations anteriores (regra do warn-function-rebase hook).

BEGIN;

-- ── 1) Colunas em wedding_casais ─────────────────────────────────────────
ALTER TABLE public.wedding_casais
  ADD COLUMN IF NOT EXISTS enviado_em TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS visto_em TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS idx_wedding_casais_pendente
  ON public.wedding_casais(org_id, ultima_edicao_casal_em)
  WHERE encerrado_em IS NULL;

-- ── 2) Tabela wedding_casal_envios ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.wedding_casal_envios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  casal_id UUID NOT NULL REFERENCES public.wedding_casais(id) ON DELETE CASCADE,
  org_id UUID NOT NULL DEFAULT requesting_org_id() REFERENCES public.organizations(id),
  enviado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  snapshot JSONB NOT NULL,
  total_convites INTEGER NOT NULL DEFAULT 0,
  total_pessoas INTEGER NOT NULL DEFAULT 0,
  total_sem_telefone INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_wedding_casal_envios_casal
  ON public.wedding_casal_envios(casal_id, enviado_em DESC);
CREATE INDEX IF NOT EXISTS idx_wedding_casal_envios_org
  ON public.wedding_casal_envios(org_id);

-- Sincroniza org_id com o casal pai
CREATE OR REPLACE FUNCTION public.wedding_casal_envios_sync_org()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE v_org UUID;
BEGIN
  SELECT org_id INTO v_org FROM public.wedding_casais WHERE id = NEW.casal_id;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'wedding_casal_envios: casal_id % não encontrado', NEW.casal_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  NEW.org_id := v_org;
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS trg_wedding_casal_envios_sync ON public.wedding_casal_envios;
CREATE TRIGGER trg_wedding_casal_envios_sync
  BEFORE INSERT ON public.wedding_casal_envios
  FOR EACH ROW
  EXECUTE FUNCTION public.wedding_casal_envios_sync_org();

-- ── 3) RLS ────────────────────────────────────────────────────────────────
ALTER TABLE public.wedding_casal_envios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS wedding_casal_envios_org_all ON public.wedding_casal_envios;
CREATE POLICY wedding_casal_envios_org_all ON public.wedding_casal_envios
  TO authenticated
  USING (org_id = requesting_org_id())
  WITH CHECK (org_id = requesting_org_id());

DROP POLICY IF EXISTS wedding_casal_envios_service_all ON public.wedding_casal_envios;
CREATE POLICY wedding_casal_envios_service_all ON public.wedding_casal_envios
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ── 4) RPC PÚBLICA: marcar_pronto ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.wedding_casal_marcar_pronto(p_codigo TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_casal public.wedding_casais;
  v_snapshot JSONB;
  v_total_convites INTEGER;
  v_total_pessoas INTEGER;
  v_sem_tel INTEGER;
  v_envio_id UUID;
BEGIN
  v_casal := public._wedding_casal_by_codigo(p_codigo);

  SELECT
    COALESCE(jsonb_agg(
      jsonb_build_object(
        'id', cv.id, 'nome', cv.nome, 'posicao', cv.posicao, 'pessoas', cv.pessoas
      ) ORDER BY cv.posicao
    ) FILTER (WHERE cv.id IS NOT NULL), '[]'::jsonb)
  INTO v_snapshot
  FROM (
    SELECT
      c.id, c.nome, c.posicao,
      COALESCE(
        (SELECT jsonb_agg(
            jsonb_build_object(
              'id', g.id,
              'nome_raw', g.nome_raw,
              'telefone_raw', g.telefone_raw,
              'email_raw', g.email_raw,
              'faixa', g.faixa,
              'lado', g.lado,
              'tipo', g.tipo,
              'observacoes', g.observacoes,
              'posicao', g.posicao
            ) ORDER BY g.posicao, g.created_at
          )
          FROM public.wedding_guests g WHERE g.convite_id = c.id
        ), '[]'::jsonb
      ) AS pessoas
    FROM public.wedding_convites c WHERE c.casal_id = v_casal.id
  ) cv;

  SELECT COUNT(*) INTO v_total_convites
  FROM public.wedding_convites WHERE casal_id = v_casal.id;

  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE faixa IN ('adulto','idoso') AND COALESCE(telefone_raw,'') = '')
  INTO v_total_pessoas, v_sem_tel
  FROM public.wedding_guests WHERE casal_id = v_casal.id;

  INSERT INTO public.wedding_casal_envios
    (casal_id, snapshot, total_convites, total_pessoas, total_sem_telefone)
  VALUES (v_casal.id, v_snapshot, v_total_convites, v_total_pessoas, v_sem_tel)
  RETURNING id INTO v_envio_id;

  UPDATE public.wedding_casais
  SET enviado_em = now(),
      visto_em = NULL,
      ultima_edicao_casal_em = now()
  WHERE id = v_casal.id;

  RETURN v_envio_id;
END
$fn$;

-- ── 5) RPC PÚBLICA: get_status_envio ────────────────────────────────────
-- Retorna só o status de envio, pra rodar em paralelo ao get_by_codigo
-- existente sem precisar recriar aquela função.
CREATE OR REPLACE FUNCTION public.wedding_casal_get_status_envio(p_codigo TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE v_casal public.wedding_casais;
BEGIN
  v_casal := public._wedding_casal_by_codigo(p_codigo);
  RETURN jsonb_build_object(
    'enviado_em', v_casal.enviado_em,
    'ultima_edicao_casal_em', v_casal.ultima_edicao_casal_em,
    'tem_alteracoes_pendentes', (
      v_casal.enviado_em IS NULL
      OR (v_casal.ultima_edicao_casal_em IS NOT NULL
          AND v_casal.ultima_edicao_casal_em > v_casal.enviado_em)
    ),
    'nunca_enviou', v_casal.enviado_em IS NULL
  );
END
$fn$;

-- ── 6) RPC ADMIN: list_v2 com status de envio ──────────────────────────
-- Nome NOVO (não rebase) — frontend troca o RPC chamado.
CREATE OR REPLACE FUNCTION public.wedding_casal_admin_list_v2()
RETURNS TABLE (
  id UUID,
  codigo TEXT,
  nome_casal TEXT,
  whatsapp_digits TEXT,
  card_id UUID,
  card_titulo TEXT,
  criado_em TIMESTAMPTZ,
  ultima_edicao_casal_em TIMESTAMPTZ,
  enviado_em TIMESTAMPTZ,
  visto_em TIMESTAMPTZ,
  encerrado_em TIMESTAMPTZ,
  total_convites INTEGER,
  total_pessoas INTEGER,
  pessoas_sem_telefone INTEGER,
  total_envios INTEGER,
  alterado_depois_do_envio BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE v_org UUID := requesting_org_id();
BEGIN
  RETURN QUERY
  SELECT
    c.id, c.codigo, c.nome_casal, c.whatsapp_digits, c.card_id,
    cd.titulo AS card_titulo,
    c.criado_em, c.ultima_edicao_casal_em,
    c.enviado_em, c.visto_em, c.encerrado_em,
    COALESCE(cnt.total_convites, 0)::INTEGER,
    COALESCE(cnt.total_pessoas, 0)::INTEGER,
    COALESCE(cnt.pessoas_sem_telefone, 0)::INTEGER,
    COALESCE(cnt.total_envios, 0)::INTEGER,
    (
      c.enviado_em IS NOT NULL AND
      (
        (c.visto_em IS NULL)
        OR (c.ultima_edicao_casal_em IS NOT NULL AND c.ultima_edicao_casal_em > c.visto_em)
      )
    ) AS alterado_depois_do_envio
  FROM public.wedding_casais c
  LEFT JOIN public.cards cd ON cd.id = c.card_id
  LEFT JOIN LATERAL (
    SELECT
      (SELECT COUNT(*) FROM public.wedding_convites WHERE casal_id = c.id) AS total_convites,
      (SELECT COUNT(*) FROM public.wedding_guests WHERE casal_id = c.id) AS total_pessoas,
      (SELECT COUNT(*) FROM public.wedding_guests
        WHERE casal_id = c.id AND faixa IN ('adulto','idoso')
          AND COALESCE(telefone_raw, '') = ''
      ) AS pessoas_sem_telefone,
      (SELECT COUNT(*) FROM public.wedding_casal_envios WHERE casal_id = c.id) AS total_envios
  ) cnt ON true
  WHERE c.org_id = v_org
  ORDER BY c.criado_em DESC;
END
$fn$;

-- ── 7) RPC ADMIN: list_envios + marcar_visto ────────────────────────────
CREATE OR REPLACE FUNCTION public.wedding_casal_admin_envios(p_casal_id UUID)
RETURNS TABLE (
  id UUID,
  enviado_em TIMESTAMPTZ,
  snapshot JSONB,
  total_convites INTEGER,
  total_pessoas INTEGER,
  total_sem_telefone INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_org UUID := requesting_org_id();
  v_belongs BOOLEAN;
BEGIN
  SELECT EXISTS(SELECT 1 FROM public.wedding_casais WHERE id = p_casal_id AND org_id = v_org) INTO v_belongs;
  IF NOT v_belongs THEN
    RAISE EXCEPTION 'casal_id % não encontrado na sua org', p_casal_id;
  END IF;

  RETURN QUERY
  SELECT e.id, e.enviado_em, e.snapshot, e.total_convites, e.total_pessoas, e.total_sem_telefone
  FROM public.wedding_casal_envios e
  WHERE e.casal_id = p_casal_id
  ORDER BY e.enviado_em DESC;
END
$fn$;

CREATE OR REPLACE FUNCTION public.wedding_casal_admin_marcar_visto(p_casal_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE v_org UUID := requesting_org_id();
BEGIN
  UPDATE public.wedding_casais
  SET visto_em = now()
  WHERE id = p_casal_id AND org_id = v_org;
END
$fn$;

-- ── 8) Permissions ──────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.wedding_casal_marcar_pronto(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.wedding_casal_get_status_envio(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.wedding_casal_admin_envios(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.wedding_casal_admin_marcar_visto(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.wedding_casal_admin_list_v2() TO authenticated;

COMMIT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='wedding_casais' AND column_name='enviado_em') THEN
    RAISE EXCEPTION 'enviado_em não criada';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='wedding_casal_envios') THEN
    RAISE EXCEPTION 'wedding_casal_envios não criada';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname='wedding_casal_marcar_pronto') THEN
    RAISE EXCEPTION 'wedding_casal_marcar_pronto não criada';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname='wedding_casal_admin_list_v2') THEN
    RAISE EXCEPTION 'wedding_casal_admin_list_v2 não criada';
  END IF;
  RAISE NOTICE 'wedding_casal_envios + RPCs OK';
END $$;
