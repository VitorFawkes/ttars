-- Migration: Enable Realtime for WhatsApp Raw Events
-- Date: 2026-01-13
-- Description: Adds whatsapp_raw_events to the supabase_realtime publication to allow frontend subscriptions.

begin;
  -- Check if publication exists and add table if not already added
  do $$
  begin
    if not exists (
      select 1 from pg_publication_tables 
      where pubname = 'supabase_realtime' 
      and tablename = 'whatsapp_raw_events'
    ) then
      alter publication supabase_realtime add table whatsapp_raw_events;
    end if;
  end
  $$;
commit;
