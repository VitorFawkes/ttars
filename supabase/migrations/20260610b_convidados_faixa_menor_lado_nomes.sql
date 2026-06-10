-- Lista de Convidados — simplifica faixa etária + nomes do casal no "Lado"
--
-- 1) Faixa: só 'adulto' e 'menor' (de 18 anos). Dados legados são remapeados:
--    idoso → adulto | crianca/bebe → menor
-- 2) Lado: o casal pode personalizar como cada um aparece nos botões de Lado
--    (resolve casais do mesmo sexo — em vez de Noiva/Noivo fixos, usa os nomes).
--    NULL = frontend deriva do nome_casal.
--
-- Recriações verificadas: wedding_casal_get_by_codigo só foi criada em
-- 20260527l_wedding_casal_rpcs.sql (nenhuma outra migration mexeu nela).

BEGIN;

-- ── 1) Faixa etária ──────────────────────────────────────────────────────
-- Constraint antiga sai ANTES do remap (senão o UPDATE pra 'menor' viola ela)
ALTER TABLE public.wedding_guests
  DROP CONSTRAINT IF EXISTS wedding_guests_faixa_check;

UPDATE public.wedding_guests SET faixa = 'adulto' WHERE faixa = 'idoso';
UPDATE public.wedding_guests SET faixa = 'menor'  WHERE faixa IN ('crianca', 'bebe');

ALTER TABLE public.wedding_guests
  ADD CONSTRAINT wedding_guests_faixa_check
    CHECK (faixa IN ('adulto', 'menor'));

-- ── 2) Nomes personalizados do casal pro campo Lado ─────────────────────
ALTER TABLE public.wedding_casais
  ADD COLUMN IF NOT EXISTS lado_label_a TEXT NULL,
  ADD COLUMN IF NOT EXISTS lado_label_b TEXT NULL;

COMMENT ON COLUMN public.wedding_casais.lado_label_a IS
  'Como a pessoa A do casal aparece no campo Lado (chave interna: noiva). NULL = derivar do nome_casal.';
COMMENT ON COLUMN public.wedding_casais.lado_label_b IS
  'Como a pessoa B do casal aparece no campo Lado (chave interna: noivo). NULL = derivar do nome_casal.';

-- ── 3) get_by_codigo devolve os labels ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.wedding_casal_get_by_codigo(p_codigo TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_casal public.wedding_casais;
  v_result JSONB;
BEGIN
  v_casal := public._wedding_casal_by_codigo(p_codigo);

  SELECT jsonb_build_object(
    'casal', jsonb_build_object(
      'id', v_casal.id,
      'codigo', v_casal.codigo,
      'nome_casal', v_casal.nome_casal,
      'whatsapp_digits', v_casal.whatsapp_digits,
      'card_id', v_casal.card_id,
      'criado_em', v_casal.criado_em,
      'ultima_edicao_casal_em', v_casal.ultima_edicao_casal_em,
      'lado_label_a', v_casal.lado_label_a,
      'lado_label_b', v_casal.lado_label_b
    ),
    'convites', COALESCE(jsonb_agg(
      jsonb_build_object(
        'id', cv.id,
        'nome', cv.nome,
        'posicao', cv.posicao,
        'pessoas', cv.pessoas
      ) ORDER BY cv.posicao
    ) FILTER (WHERE cv.id IS NOT NULL), '[]'::jsonb)
  ) INTO v_result
  FROM (
    SELECT
      c.id,
      c.nome,
      c.posicao,
      COALESCE(
        (
          SELECT jsonb_agg(
            jsonb_build_object(
              'id', g.id,
              'nome_raw', g.nome_raw,
              'telefone_raw', g.telefone_raw,
              'email_raw', g.email_raw,
              'faixa', g.faixa,
              'lado', g.lado,
              'tipo', g.tipo,
              'observacoes', g.observacoes,
              'posicao', g.posicao,
              'status_rsvp', g.status_rsvp
            ) ORDER BY g.posicao, g.created_at
          )
          FROM public.wedding_guests g
          WHERE g.convite_id = c.id
        ),
        '[]'::jsonb
      ) AS pessoas
    FROM public.wedding_convites c
    WHERE c.casal_id = v_casal.id
  ) cv;

  RETURN v_result;
END
$fn$;

-- ── 4) RPC pública para o casal salvar os nomes ──────────────────────────
CREATE OR REPLACE FUNCTION public.wedding_casal_update_lado_nomes(
  p_codigo TEXT,
  p_label_a TEXT,
  p_label_b TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_casal public.wedding_casais;
BEGIN
  v_casal := public._wedding_casal_by_codigo(p_codigo);

  UPDATE public.wedding_casais
  SET lado_label_a = NULLIF(TRIM(COALESCE(p_label_a, '')), ''),
      lado_label_b = NULLIF(TRIM(COALESCE(p_label_b, '')), '')
  WHERE id = v_casal.id;

  PERFORM public._wedding_casal_touch(v_casal.id);
  RETURN true;
END
$fn$;

REVOKE ALL ON FUNCTION public.wedding_casal_update_lado_nomes(TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.wedding_casal_update_lado_nomes(TEXT, TEXT, TEXT) TO service_role;

COMMIT;
