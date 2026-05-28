-- Feature: Lista de Convidados — RPC pública para painel de casais sem login
--
-- Lista TODOS os casais da org Welcome Weddings (hardcoded) sem depender de
-- requesting_org_id() — pra ser chamada via edge function pública.
-- Mesma estrutura do admin_list_v3 mas sem filtro por org do usuário.
--
-- E uma RPC para "marcar como verificado" também sem auth: aceita o ID e
-- valida que o casal pertence à org Welcome Weddings antes de atualizar.

BEGIN;

CREATE OR REPLACE FUNCTION public.wedding_casais_publico_list()
RETURNS TABLE (
  id UUID,
  codigo TEXT,
  nome_casal TEXT,
  whatsapp_digits TEXT,
  criado_em TIMESTAMPTZ,
  ultima_edicao_casal_em TIMESTAMPTZ,
  enviado_em TIMESTAMPTZ,
  visto_em TIMESTAMPTZ,
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
DECLARE
  v_org UUID := 'b0000000-0000-0000-0000-000000000002'::UUID;
BEGIN
  RETURN QUERY
  SELECT
    c.id, c.codigo, c.nome_casal, c.whatsapp_digits,
    c.criado_em, c.ultima_edicao_casal_em,
    c.enviado_em, c.visto_em,
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
  WHERE c.org_id = v_org AND c.encerrado_em IS NULL
  ORDER BY
    -- prioridade: casais com alteração pendente primeiro, depois nunca enviou, depois últimos editados
    (c.enviado_em IS NOT NULL AND c.ultima_edicao_casal_em > COALESCE(c.visto_em, c.enviado_em)) DESC,
    c.enviado_em ASC NULLS FIRST,
    c.criado_em DESC;
END
$fn$;

-- "Marcar como verificado" via público — restringe à org Welcome Weddings
CREATE OR REPLACE FUNCTION public.wedding_casal_publico_marcar_visto(p_casal_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_org UUID := 'b0000000-0000-0000-0000-000000000002'::UUID;
  v_updated INTEGER;
BEGIN
  UPDATE public.wedding_casais
  SET visto_em = now()
  WHERE id = p_casal_id AND org_id = v_org;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END
$fn$;

-- Listar envios de um casal específico (público), validando que pertence à org WW
CREATE OR REPLACE FUNCTION public.wedding_casal_publico_envios(p_casal_id UUID)
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
  v_org UUID := 'b0000000-0000-0000-0000-000000000002'::UUID;
  v_belongs BOOLEAN;
BEGIN
  SELECT EXISTS(SELECT 1 FROM public.wedding_casais WHERE wedding_casais.id = p_casal_id AND org_id = v_org)
  INTO v_belongs;
  IF NOT v_belongs THEN
    RAISE EXCEPTION 'Casal não pertence a Welcome Weddings'
      USING ERRCODE = 'no_data_found';
  END IF;
  RETURN QUERY
  SELECT e.id, e.enviado_em, e.snapshot, e.total_convites, e.total_pessoas, e.total_sem_telefone
  FROM public.wedding_casal_envios e
  WHERE e.casal_id = p_casal_id
  ORDER BY e.enviado_em DESC;
END
$fn$;

GRANT EXECUTE ON FUNCTION public.wedding_casais_publico_list() TO service_role;
GRANT EXECUTE ON FUNCTION public.wedding_casal_publico_marcar_visto(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.wedding_casal_publico_envios(UUID) TO service_role;

COMMIT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname='wedding_casais_publico_list') THEN
    RAISE EXCEPTION 'RPC não criada';
  END IF;
  RAISE NOTICE 'RPCs públicas do painel OK';
END $$;
