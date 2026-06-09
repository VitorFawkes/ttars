-- Painel de saúde das linhas de WhatsApp usadas em disparos (produto WEDDING).
-- Mostra, por número: enviados hoje, quantos dos destinatários responderam (últimos 7d)
-- e um STATUS ESTIMADO (saudável / risco / bloqueada).
--
-- IMPORTANTE: o status é heurística por volume × respostas — NÃO é confirmação do
-- WhatsApp. O gateway não-oficial reporta "enviado" mesmo quando o número já foi banido,
-- então "0 falhas" não significa nada; o sinal real de saúde é gente respondendo.
--
-- Fonte dos ENVIOS: disparo_fila (status='sent') + disparo_campanhas (tem o phone_number_id).
--   Não usar whatsapp_messages.phone_number_id: disparos gravam lá com phone_number_id NULL
--   (label "Automação"), então não dá pra atribuir o envio à linha por ali.
-- Fonte das RESPOSTAS: whatsapp_messages (direction='inbound') por contact_id, após o envio.
-- SECURITY DEFINER + filtro por requesting_org_id() → isolado por workspace.

CREATE OR REPLACE FUNCTION public.disparo_saude_linhas()
RETURNS TABLE (
  phone_number_id     text,
  phone_number_label  text,
  is_oficial          boolean,
  enviados_hoje       bigint,
  responderam         bigint,
  destinatarios       bigint,
  ultimo_envio_at     timestamptz,
  status              text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH alvo AS (SELECT requesting_org_id() AS org_id),
  hoje AS (SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date AS d),
  linhas AS (
    SELECT lc.phone_number_id, lc.phone_number_label
      FROM public.whatsapp_linha_config lc, alvo
     WHERE lc.org_id = alvo.org_id
       AND lc.ativo = true
       AND lc.phone_number_id IS NOT NULL
  ),
  envios AS (   -- envios de disparo dos últimos 7 dias, atribuídos à linha via campanha
    SELECT c.phone_number_id, f.contact_id, f.enviado_at
      FROM public.disparo_fila f
      JOIN public.disparo_campanhas c ON c.id = f.campaign_id
     WHERE f.status = 'sent'
       AND f.enviado_at IS NOT NULL
       AND f.enviado_at >= now() - interval '7 days'
       AND c.phone_number_id IN (SELECT phone_number_id FROM linhas)
  ),
  agg AS (
    SELECT
      e.phone_number_id,
      count(*) FILTER (
        WHERE (e.enviado_at AT TIME ZONE 'America/Sao_Paulo')::date = (SELECT d FROM hoje)
      ) AS enviados_hoje,
      count(*) FILTER (WHERE e.enviado_at >= now() - interval '3 hours') AS enviados_3h,
      count(DISTINCT e.contact_id) AS destinatarios,
      count(DISTINCT e.contact_id) FILTER (
        WHERE EXISTS (
          SELECT 1 FROM public.whatsapp_messages m
           WHERE m.contact_id = e.contact_id
             AND m.direction = 'inbound'
             AND m.created_at >= e.enviado_at
        )
      ) AS responderam,
      max(e.enviado_at) AS ultimo_envio_at
    FROM envios e
    GROUP BY e.phone_number_id
  )
  SELECT
    l.phone_number_id,
    l.phone_number_label,
    (l.phone_number_id ~ '^[0-9]+$')        AS is_oficial,
    COALESCE(a.enviados_hoje, 0)             AS enviados_hoje,
    COALESCE(a.responderam, 0)              AS responderam,
    COALESCE(a.destinatarios, 0)           AS destinatarios,
    a.ultimo_envio_at,
    CASE
      -- provável bloqueio: disparou bastante há pouco e NINGUÉM respondeu
      WHEN COALESCE(a.enviados_3h,0) >= 12
           AND COALESCE(a.responderam,0) = 0
           AND COALESCE(a.destinatarios,0) >= 20        THEN 'bloqueada'
      -- risco: amostra relevante (≥20) com taxa de resposta muito baixa (<5%),
      --        ou volume muito alto num dia só
      WHEN COALESCE(a.destinatarios,0) >= 20
           AND COALESCE(a.responderam,0)::numeric / a.destinatarios < 0.05 THEN 'risco'
      WHEN COALESCE(a.enviados_hoje,0) >= 60            THEN 'risco'
      ELSE 'saudavel'
    END                                     AS status
  FROM linhas l
  LEFT JOIN agg a ON a.phone_number_id = l.phone_number_id
  ORDER BY COALESCE(a.enviados_hoje,0) DESC, l.phone_number_label;
$$;

GRANT EXECUTE ON FUNCTION public.disparo_saude_linhas() TO authenticated;

COMMENT ON FUNCTION public.disparo_saude_linhas() IS
  'Saúde por linha de WhatsApp (disparos WEDDING): enviados hoje + quantos responderam (7d) + status estimado. Envios via disparo_fila/campanhas (whatsapp_messages.phone_number_id é NULL em disparo). Isolado por requesting_org_id().';
