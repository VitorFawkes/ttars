-- Migration: Add RPC functions for CODEBASE.md sync
-- Purpose: Enable live queries of schema metadata for documentation sync

-- Function to list all public tables
CREATE OR REPLACE FUNCTION get_all_tables()
RETURNS TABLE(table_name text) AS $$
BEGIN
  RETURN QUERY
  SELECT tablename::text
  FROM pg_tables
  WHERE schemaname = 'public'
  ORDER BY tablename;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to list all public views
CREATE OR REPLACE FUNCTION get_all_views()
RETURNS TABLE(view_name text) AS $$
BEGIN
  RETURN QUERY
  SELECT viewname::text
  FROM pg_views
  WHERE schemaname = 'public'
  ORDER BY viewname;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get schema summary (tables + views + functions counts)
CREATE OR REPLACE FUNCTION get_schema_summary()
RETURNS TABLE(
  resource_type text,
  count bigint
) AS $$
BEGIN
  RETURN QUERY
  SELECT 'tables'::text, COUNT(*)::bigint FROM pg_tables WHERE schemaname = 'public'
  UNION ALL
  SELECT 'views'::text, COUNT(*)::bigint FROM pg_views WHERE schemaname = 'public'
  UNION ALL
  SELECT 'functions'::text, COUNT(*)::bigint FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION get_all_tables() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_all_views() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_schema_summary() TO anon, authenticated;

COMMENT ON FUNCTION get_all_tables() IS 'Lists all public tables for CODEBASE.md sync';
COMMENT ON FUNCTION get_all_views() IS 'Lists all public views for CODEBASE.md sync';
COMMENT ON FUNCTION get_schema_summary() IS 'Returns count of tables, views, and functions';
