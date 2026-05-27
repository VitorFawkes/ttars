-- Fix: admin_list_v3 — coluna id ambígua (RETURNS TABLE id vs organizations.id)

BEGIN;

CREATE OR REPLACE FUNCTION public.wedding_casal_admin_list_v3()
RETURNS TABLE (
  id UUID,
  codigo TEXT,
  nome_casal TEXT,
  whatsapp_digits TEXT,
  card_id UUID,
  card_titulo TEXT,
  org_id UUID,
  workspace_name TEXT,
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
DECLARE
  v_org UUID := requesting_org_id();
BEGIN
  RETURN QUERY
  SELECT
    c.id, c.codigo, c.nome_casal, c.whatsapp_digits, c.card_id,
    cd.titulo AS card_titulo,
    c.org_id,
    o.name AS workspace_name,
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
  LEFT JOIN public.organizations o ON o.id = c.org_id
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
  WHERE
    c.org_id = v_org
    OR c.org_id IN (SELECT organizations.id FROM public.organizations WHERE organizations.parent_org_id = v_org)
  ORDER BY c.criado_em DESC;
END
$fn$;

COMMIT;

DO $$ BEGIN RAISE NOTICE 'v3 fix OK'; END $$;
