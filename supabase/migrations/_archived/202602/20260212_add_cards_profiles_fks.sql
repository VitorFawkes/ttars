-- ============================================================================
-- Add FK constraints: cards owner columns → profiles
-- ============================================================================
-- Problem: vendas_owner_id and dono_atual_id have FKs to auth.users(id),
-- but PostgREST cannot traverse auth schema. This makes embedded joins
-- like profiles!cards_vendas_owner_id_fkey(...) fail silently.
-- Fix: Add additional FK constraints pointing to profiles(id).
-- Safety: profiles.id = auth.users.id always (1:1 sync via trigger).
-- The existing FKs to auth.users remain intact.
-- ============================================================================

ALTER TABLE cards
  ADD CONSTRAINT cards_vendas_owner_id_profiles_fkey
  FOREIGN KEY (vendas_owner_id) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE cards
  ADD CONSTRAINT cards_dono_atual_id_profiles_fkey
  FOREIGN KEY (dono_atual_id) REFERENCES profiles(id) ON DELETE SET NULL;
