DROP FUNCTION IF EXISTS public._audit_org_id_risky_triggers();

CREATE OR REPLACE FUNCTION public._audit_org_id_risky_triggers()
RETURNS TABLE(
  function_name TEXT,
  target_table TEXT,
  insert_has_org_id BOOLEAN,
  is_security_definer BOOLEAN,
  table_has_before_trigger BOOLEAN
) AS $$
DECLARE
  fn RECORD;
  tbl RECORD;
  pat TEXT;
  src TEXT;
  block_match TEXT;
BEGIN
  FOR tbl IN
    SELECT c.table_name AS tname
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.column_name = 'org_id'
      AND c.is_nullable = 'NO'
  LOOP
    pat := 'INSERT\s+INTO\s+(?:public\.)?' || tbl.tname || '\s*\(([^)]+)\)';
    FOR fn IN
      SELECT p.oid, p.proname, p.prosecdef
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.prokind = 'f'           -- regular function (exclui aggregates/procedures)
        AND p.prorettype IN (
          (SELECT oid FROM pg_type WHERE typname = 'trigger'),
          (SELECT oid FROM pg_type WHERE typname = 'void'),
          (SELECT oid FROM pg_type WHERE typname = 'record'),
          (SELECT oid FROM pg_type WHERE typname = 'bool'),
          (SELECT oid FROM pg_type WHERE typname = 'uuid'),
          (SELECT oid FROM pg_type WHERE typname = 'int4'),
          (SELECT oid FROM pg_type WHERE typname = 'int8'),
          (SELECT oid FROM pg_type WHERE typname = 'jsonb'),
          (SELECT oid FROM pg_type WHERE typname = 'text')
        )
    LOOP
      BEGIN
        src := pg_get_functiondef(fn.oid);
      EXCEPTION WHEN OTHERS THEN
        CONTINUE;
      END;
      IF src !~* pat THEN CONTINUE; END IF;
      block_match := substring(src FROM pat);
      RETURN QUERY SELECT
        fn.proname::TEXT,
        tbl.tname::TEXT,
        (block_match IS NOT NULL AND block_match ~* 'org_id')::BOOLEAN,
        fn.prosecdef,
        EXISTS(
          SELECT 1 FROM pg_trigger tg
          JOIN pg_class tc ON tc.oid = tg.tgrelid
          WHERE tc.relname = tbl.tname
            AND NOT tg.tgisinternal
            AND tg.tgtype::int & 2 = 2
            AND tg.tgtype::int & 4 = 4
        );
    END LOOP;
  END LOOP;
END;
$$ LANGUAGE plpgsql;
