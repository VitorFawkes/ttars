-- ═══════════════════════════════════════════════════════════════════════════
-- Calendly multi-conta: carimbo da org de origem no evento bruto
-- ═══════════════════════════════════════════════════════════════════════════
-- Contexto: Weddings vai usar uma conta Calendly SEPARADA da do Trips. O edge
-- function calendly-webhook valida o HMAC contra a chave de cada conta e, com
-- base em qual chave validou, sabe de qual org veio o agendamento. Gravamos isso
-- em source_org_id pra que o trigger process_cadence_entry_on_calendly_invitee()
-- roteie SÓ os triggers daquela org — sem isso, o trigger catch-all do Trips
-- (sem filtro de organizer, create_card_if_missing=true) dispararia em
-- agendamentos de Weddings e criaria cards fantasma no Trips.
--
-- Coluna nullable: eventos antigos (pré-deploy do edge function) ficam com NULL,
-- e o trigger trata NULL como "todas as orgs" (compat retroativa).
-- A reescrita da função que LÊ esta coluna vai em 20260617b.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.calendly_webhook_events
  ADD COLUMN IF NOT EXISTS source_org_id UUID REFERENCES public.organizations(id);

COMMENT ON COLUMN public.calendly_webhook_events.source_org_id IS
'Org dona da conta Calendly cuja signing key validou este evento (Trips ou Weddings). '
'Definido pelo edge function calendly-webhook. Usado pelo trigger SQL pra rotear '
'os cadence_event_triggers só dessa org. NULL em eventos antigos = sem fence (compat).';
