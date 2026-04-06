-- H3-023: adicionar org_id em configuracao_taxa_trips + RLS org-scoped
--
-- Problema: configuracao_taxa_trips não tem org_id — configuração compartilhada
-- entre todas as orgs. Se cliente white-label usar TRIPS, vai ver a mesma taxa
-- da Welcome Group.
--
-- Solução: adicionar org_id, backfill com Welcome Group (único registro),
-- RLS org-scoped + is_admin check para escrita.

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'configuracao_taxa_trips') THEN

    -- Adicionar org_id
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'configuracao_taxa_trips' AND column_name = 'org_id') THEN
      ALTER TABLE configuracao_taxa_trips ADD COLUMN org_id UUID REFERENCES organizations(id);
    END IF;

    -- Backfill Welcome Group
    UPDATE configuracao_taxa_trips SET org_id = 'a0000000-0000-0000-0000-000000000001'::UUID WHERE org_id IS NULL;

    -- NOT NULL + DEFAULT
    ALTER TABLE configuracao_taxa_trips ALTER COLUMN org_id SET NOT NULL;
    ALTER TABLE configuracao_taxa_trips ALTER COLUMN org_id SET DEFAULT requesting_org_id();

    -- Índice
    CREATE INDEX IF NOT EXISTS idx_configuracao_taxa_trips_org_id ON configuracao_taxa_trips(org_id);

    -- Unique (org_id) — cada org tem no máximo 1 configuração
    CREATE UNIQUE INDEX IF NOT EXISTS idx_configuracao_taxa_trips_org_unique ON configuracao_taxa_trips(org_id);

    -- Drop políticas antigas
    DROP POLICY IF EXISTS "Config Taxa viewable by authenticated" ON configuracao_taxa_trips;
    DROP POLICY IF EXISTS "Config Taxa modify by gestor" ON configuracao_taxa_trips;
    DROP POLICY IF EXISTS "configuracao_taxa_trips_org_select" ON configuracao_taxa_trips;
    DROP POLICY IF EXISTS "configuracao_taxa_trips_org_admin_all" ON configuracao_taxa_trips;
    DROP POLICY IF EXISTS "configuracao_taxa_trips_service_all" ON configuracao_taxa_trips;

    -- Novas políticas org-scoped
    CREATE POLICY "configuracao_taxa_trips_org_select" ON configuracao_taxa_trips
      FOR SELECT TO authenticated
      USING (org_id = requesting_org_id());

    CREATE POLICY "configuracao_taxa_trips_org_admin_all" ON configuracao_taxa_trips
      FOR ALL TO authenticated
      USING (org_id = requesting_org_id() AND EXISTS (
        SELECT 1 FROM profiles WHERE id = auth.uid() AND org_id = requesting_org_id() AND (is_admin = TRUE OR role = 'admin')
      ));

    CREATE POLICY "configuracao_taxa_trips_service_all" ON configuracao_taxa_trips
      FOR ALL TO service_role USING (true) WITH CHECK (true);

    RAISE NOTICE 'configuracao_taxa_trips: org_id adicionado e RLS atualizado';
  ELSE
    RAISE NOTICE 'configuracao_taxa_trips: tabela não existe, pulando';
  END IF;
END $$;
