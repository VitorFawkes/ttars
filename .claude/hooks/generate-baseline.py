#!/usr/bin/env python3
"""
Gera baseline schema snapshot a partir dos JSONs de auditoria.
Uso: python3 .claude/hooks/generate-baseline.py
Saída: supabase/migrations/_baseline/schema-baseline-20260331.sql
"""

import json
from pathlib import Path
from collections import defaultdict

AUDIT_DIR = Path(".claude/db-audit")
OUTPUT_DIR = Path("supabase/migrations/_baseline")
OUTPUT_FILE = OUTPUT_DIR / "schema-baseline-20260331.sql"


def load(name):
    with open(AUDIT_DIR / f"{name}.json") as f:
        return json.load(f)


def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    tables = load("tables")
    columns = load("columns")
    functions = load("functions")
    views = load("views")
    triggers = load("triggers")
    indexes = load("indexes")
    enums = load("enums")
    policies = load("policies")

    # Group columns by table
    cols_by_table = defaultdict(list)
    for c in columns:
        cols_by_table[c["table_name"]].append(c)

    # Group indexes by table
    idx_by_table = defaultdict(list)
    for i in indexes:
        idx_by_table[i["tablename"]].append(i)

    # Group triggers by table
    trg_by_table = defaultdict(list)
    for t in triggers:
        trg_by_table[t["event_object_table"]].append(t)

    # Group policies by table
    pol_by_table = defaultdict(list)
    for p in policies:
        pol_by_table[p["tablename"]].append(p)

    lines = []
    lines.append("-- ============================================================")
    lines.append("-- WelcomeCRM — Schema Baseline Snapshot")
    lines.append("-- Gerado em: 2026-03-31")
    lines.append("-- Fonte: Banco de produção (szyrzxvlptqqheizyrxu)")
    lines.append("-- ")
    lines.append("-- ATENÇÃO: Este arquivo é REFERÊNCIA, não executável.")
    lines.append("-- Ele documenta o estado real do banco nesta data.")
    lines.append("-- Para criar objetos, use migrations individuais.")
    lines.append("-- ============================================================")
    lines.append("")

    # === ENUMS ===
    lines.append("-- ============================================================")
    lines.append("-- ENUMS")
    lines.append("-- ============================================================")
    enum_groups = defaultdict(list)
    for e in enums:
        enum_groups[e["typname"]].append(e["enumlabel"])
    for name, values in sorted(enum_groups.items()):
        vals = ", ".join(f"'{v}'" for v in values)
        lines.append(f"-- CREATE TYPE public.{name} AS ENUM ({vals});")
    lines.append("")

    # === TABLES ===
    lines.append("-- ============================================================")
    lines.append("-- TABLES")
    lines.append("-- ============================================================")

    base_tables = [t for t in tables if t["table_type"] == "BASE TABLE"]
    for table in sorted(base_tables, key=lambda t: t["table_name"]):
        tname = table["table_name"]
        lines.append(f"")
        lines.append(f"-- TABLE: {tname}")
        lines.append(f"--   Columns:")
        for col in cols_by_table.get(tname, []):
            nullable = "NULL" if col["is_nullable"] == "YES" else "NOT NULL"
            default = f" DEFAULT {col['column_default']}" if col["column_default"] else ""
            lines.append(f"--     {col['column_name']:40} {col['data_type']:20} {nullable}{default}")

        # Indexes for this table
        table_indexes = idx_by_table.get(tname, [])
        if table_indexes:
            lines.append(f"--   Indexes:")
            for idx in sorted(table_indexes, key=lambda x: x["indexname"]):
                lines.append(f"--     {idx['indexname']}")

        # Triggers for this table
        table_triggers = trg_by_table.get(tname, [])
        if table_triggers:
            lines.append(f"--   Triggers:")
            for trg in sorted(table_triggers, key=lambda x: x["trigger_name"]):
                lines.append(f"--     {trg['trigger_name']} ({trg['action_timing']} {trg['event_manipulation']})")

        # Policies for this table
        table_policies = pol_by_table.get(tname, [])
        if table_policies:
            lines.append(f"--   RLS Policies:")
            for pol in sorted(table_policies, key=lambda x: x["policyname"]):
                lines.append(f"--     {pol['policyname']} ({pol['cmd']})")

    lines.append("")

    # === VIEWS ===
    lines.append("-- ============================================================")
    lines.append("-- VIEWS")
    lines.append("-- ============================================================")
    for v in sorted(views, key=lambda x: x["viewname"]):
        lines.append(f"-- VIEW: {v['viewname']}")
    lines.append("")

    # === FUNCTIONS ===
    lines.append("-- ============================================================")
    lines.append("-- FUNCTIONS / RPCs")
    lines.append("-- ============================================================")
    for f in sorted(functions, key=lambda x: x["function_name"]):
        ret = f.get("return_type", "?")
        args = f.get("arguments", "")
        lines.append(f"-- FUNCTION: {f['function_name']}({args}) → {ret}")
    lines.append("")

    # === SUMMARY ===
    lines.append("-- ============================================================")
    lines.append("-- SUMMARY")
    lines.append("-- ============================================================")
    lines.append(f"-- Tables:    {len(base_tables)}")
    lines.append(f"-- Views:     {len(views)}")
    lines.append(f"-- Functions: {len(functions)}")
    lines.append(f"-- Triggers:  {len(triggers)}")
    lines.append(f"-- Indexes:   {len(indexes)}")
    lines.append(f"-- Enums:     {len(enum_groups)}")
    lines.append(f"-- Policies:  {len(policies)}")
    lines.append(f"-- Columns:   {len(columns)}")

    content = "\n".join(lines) + "\n"
    OUTPUT_FILE.write_text(content)
    print(f"Baseline gerado: {OUTPUT_FILE}")
    print(f"  {len(base_tables)} tabelas, {len(views)} views, {len(functions)} functions")
    print(f"  {len(content)} bytes")


if __name__ == "__main__":
    main()