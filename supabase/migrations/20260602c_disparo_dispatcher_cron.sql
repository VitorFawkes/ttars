-- ============================================================================
-- Disparo Livre — claim atômico, detecção de opt-out por inbound, e pg_cron
-- ============================================================================
-- disparo_claim_batch        — reaper + claim de N itens prontos (FOR UPDATE SKIP LOCKED)
-- disparo_detectar_opt_outs  — inbound com palavra-chave estrita (SAIR/PARAR) → blocklist
-- cron 'disparo-dispatcher'  — chama a edge function a cada 1 min
-- ============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────
-- Claim atômico (service_role only). Reaper solta travados há >10min.
-- FOR UPDATE SKIP LOCKED evita duplo-envio entre ticks de cron sobrepostos.
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.disparo_claim_batch(p_limit INT DEFAULT 5)
RETURNS TABLE(
  id              UUID,
  campaign_id     UUID,
  contact_id      UUID,
  org_id          UUID,
  corpo           TEXT,
  phone_number_id TEXT,
  telefone        TEXT,
  attempts        INT,
  max_attempts    INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Reaper: itens travados em processing voltam pra fila
  UPDATE public.disparo_fila
     SET status = 'pending', claimed_at = NULL
   WHERE status = 'processing'
     AND claimed_at < now() - interval '10 minutes';

  RETURN QUERY
  WITH cte AS (
    SELECT f.id
      FROM public.disparo_fila f
      JOIN public.disparo_campanhas c ON c.id = f.campaign_id
     WHERE f.status = 'pending'
       AND f.execute_at <= now()
       AND c.status IN ('agendado', 'disparando')
     ORDER BY f.priority DESC, f.execute_at ASC
     LIMIT GREATEST(p_limit, 1)
     FOR UPDATE OF f SKIP LOCKED
  ), upd AS (
    UPDATE public.disparo_fila f
       SET status = 'processing', claimed_at = now()
      FROM cte
     WHERE f.id = cte.id
    RETURNING f.id, f.campaign_id, f.contact_id, f.org_id,
              f.corpo_renderizado, f.telefone_normalizado, f.attempts, f.max_attempts
  )
  SELECT u.id, u.campaign_id, u.contact_id, u.org_id,
         u.corpo_renderizado, cmp.phone_number_id, u.telefone_normalizado,
         u.attempts, u.max_attempts
    FROM upd u
    JOIN public.disparo_campanhas cmp ON cmp.id = u.campaign_id;

  -- Primeira saída → marca campanha como 'disparando'
  UPDATE public.disparo_campanhas c
     SET status = 'disparando', started_at = COALESCE(c.started_at, now())
   WHERE c.status = 'agendado'
     AND EXISTS (SELECT 1 FROM public.disparo_fila f
                  WHERE f.campaign_id = c.id AND f.status = 'processing');
END;
$$;

GRANT EXECUTE ON FUNCTION public.disparo_claim_batch(INT) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────
-- Detecção de opt-out por inbound — palavra-chave ESTRITA (mensagem é só isso).
-- Evita falso-positivo de "não vou ao evento" (que é RSVP, não opt-out).
-- Só age sobre contatos que estão em alguma campanha ativa.
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.disparo_detectar_opt_outs(p_minutes INT DEFAULT 120)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INT := 0;
BEGIN
  WITH recent AS (
    SELECT DISTINCT m.contact_id, c.org_id, c.telefone_normalizado
      FROM public.whatsapp_messages m
      JOIN public.contatos c ON c.id = m.contact_id
     WHERE m.direction = 'inbound'
       AND m.created_at > now() - make_interval(mins => p_minutes)
       AND m.body ~* '^\s*(sair|parar|pare|stop|cancelar|descadastrar|remover)\s*[.!]*\s*$'
       AND c.telefone_normalizado IS NOT NULL
       AND EXISTS (SELECT 1 FROM public.disparo_fila f
                    WHERE f.contact_id = m.contact_id
                      AND f.status IN ('pending', 'processing'))
  ), ins AS (
    INSERT INTO public.disparo_opt_outs (org_id, contact_id, telefone_normalizado, reason)
    SELECT org_id, contact_id, telefone_normalizado, 'inbound_rejection' FROM recent
    ON CONFLICT (org_id, telefone_normalizado) DO NOTHING
    RETURNING 1
  )
  UPDATE public.disparo_fila f
     SET status = 'opt_out'
    FROM recent r
   WHERE f.contact_id = r.contact_id
     AND f.status IN ('pending', 'processing');
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.disparo_detectar_opt_outs(INT) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────
-- pg_cron: chama o dispatcher a cada 1 minuto. O espaçamento real entre
-- mensagens vem do execute_at de cada item (calculado na agenda), não do cron.
--
-- Auth: lê o service_role_key do Vault (NÃO usa app.settings.* — esse GUC não
-- está configurado em prod e o cron falharia; e setá-lo acordaria o cron de
-- ai-agent-outbound parado). URL é o endpoint público do projeto (não-segredo).
-- ─────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  PERFORM cron.unschedule('disparo-dispatcher');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'disparo-dispatcher',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://szyrzxvlptqqheizyrxu.supabase.co/functions/v1/disparo-dispatcher',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1)
    ),
    body := '{}'::jsonb
  );
  $$
);

COMMIT;
