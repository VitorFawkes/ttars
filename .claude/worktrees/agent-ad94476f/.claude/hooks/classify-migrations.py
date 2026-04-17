#!/usr/bin/env python3
"""
Classificador de migrations — cruza arquivos SQL com estado real do banco.
Uso: python3 .claude/hooks/classify-migrations.py

Saída: .claude/db-audit/classification-report.txt
"""

import json
import os
import re
import sys
from pathlib import Path
from collections import defaultdict

MIGRATIONS_DIR = Path("supabase/migrations")
AUDIT_DIR = Path(".claude/db-audit")
LOG_FILE = Path(".claude/.migration_log")
REPORT_FILE = AUDIT_DIR / "classification-report.txt"


def load_json(name):
    path = AUDIT_DIR / f"{name}.json"
    if not path.exists():
        print(f"ERRO: {path} não encontrado. Rode audit-db-schema.sh primeiro.")
        sys.exit(1)
    with open(path) as f:
        data = json.load(f)
    if isinstance(data, list):
        return data
    print(f"AVISO: {name}.json não é lista: {str(data)[:200]}")
    return []


def load_migration_log():
    """Retorna set de nomes de arquivo (sem path) que foram aplicados em prod."""
    logged = set()
    if not LOG_FILE.exists():
        return logged
    with open(LOG_FILE) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            parts = line.split("|")
            if len(parts) >= 3:
                filepath = parts[1].strip()
                status = parts[2].strip()
                if "prod" in status or "preexisting" in status or "already_exists" in status:
                    # Extract just filename
                    filename = os.path.basename(filepath)
                    logged.add(filename)
    return logged


def extract_sql_objects(sql_content):
    """Extrai objetos SQL referenciados no arquivo."""
    sql = sql_content.upper()
    objects = {
        "creates_tables": [],
        "alters_tables": [],
        "adds_columns": [],
        "creates_functions": [],
        "creates_views": [],
        "creates_triggers": [],
        "creates_indexes": [],
        "creates_policies": [],
        "creates_enums": [],
        "drops": [],
        "data_ops": [],  # INSERT, UPDATE, DELETE
    }

    content_lower = sql_content.lower()

    # SQL keywords that should never be treated as object names
    SQL_KEYWORDS = {
        'if', 'not', 'exists', 'or', 'replace', 'public', 'constraint',
        'unique', 'primary', 'key', 'references', 'default', 'null',
        'check', 'foreign', 'cascade', 'restrict', 'set', 'on',
        'for', 'to', 'from', 'with', 'as', 'in', 'all', 'any',
        'each', 'row', 'statement', 'before', 'after', 'instead',
        'of', 'when', 'then', 'begin', 'end', 'return', 'returns',
        'language', 'plpgsql', 'sql', 'volatile', 'stable', 'immutable',
        'security', 'definer', 'invoker', 'declare', 'using', 'select',
        'insert', 'update', 'delete', 'where', 'and', 'true', 'false',
        'enable', 'disable', 'grant', 'revoke', 'alter', 'drop', 'create',
        'table', 'column', 'index', 'trigger', 'function', 'view', 'policy',
        'type', 'schema', 'sequence', 'concurrently', 'only', 'add',
        'rename', 'owner', 'tablespace', 'comment', 'extension',
        'authenticated', 'anon', 'service_role',
        'users', 'admins', 'admin', 'everyone', 'anyone', 'allow',
        'settings', 'service', 'role',
    }

    def is_valid_name(name):
        """Filter out SQL keywords mistakenly captured as object names."""
        return name and name.lower() not in SQL_KEYWORDS and len(name) > 2

    # CREATE TABLE
    for m in re.finditer(r'create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?(\w+)', content_lower):
        name = m.group(1)
        if is_valid_name(name):
            objects["creates_tables"].append(name)

    # ALTER TABLE ... ADD COLUMN — capture table name and column name separately
    for m in re.finditer(r'alter\s+table\s+(?:only\s+)?(?:public\.)?(\w+)\s+add\s+(?:column\s+)?(?:if\s+not\s+exists\s+)?(\w+)', content_lower):
        table = m.group(1)
        col = m.group(2)
        if is_valid_name(table):
            objects["alters_tables"].append(table)
            if is_valid_name(col):
                objects["adds_columns"].append((table, col))

    # CREATE [OR REPLACE] FUNCTION
    for m in re.finditer(r'create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?(\w+)', content_lower):
        name = m.group(1)
        if is_valid_name(name):
            objects["creates_functions"].append(name)

    # CREATE [OR REPLACE] VIEW
    for m in re.finditer(r'create\s+(?:or\s+replace\s+)?(?:materialized\s+)?view\s+(?:public\.)?(\w+)', content_lower):
        name = m.group(1)
        if is_valid_name(name):
            objects["creates_views"].append(name)

    # CREATE TRIGGER
    for m in re.finditer(r'create\s+(?:or\s+replace\s+)?trigger\s+(\w+)', content_lower):
        name = m.group(1)
        if is_valid_name(name):
            objects["creates_triggers"].append(name)

    # CREATE INDEX — handle CONCURRENTLY keyword
    for m in re.finditer(r'create\s+(?:unique\s+)?index\s+(?:concurrently\s+)?(?:if\s+not\s+exists\s+)?(\w+)', content_lower):
        name = m.group(1)
        if is_valid_name(name):
            objects["creates_indexes"].append(name)

    # CREATE POLICY — handle quoted names with spaces
    for m in re.finditer(r'create\s+policy\s+"([^"]+)"', content_lower):
        objects["creates_policies"].append(m.group(1))
    # Also handle unquoted single-word policy names
    for m in re.finditer(r'create\s+policy\s+(?!")[a-z]\w+', content_lower):
        name = m.group(0).split()[-1]
        if is_valid_name(name):
            objects["creates_policies"].append(name)

    # CREATE TYPE (enum)
    for m in re.finditer(r'create\s+type\s+(?:public\.)?(\w+)\s+as\s+enum', content_lower):
        name = m.group(1)
        if is_valid_name(name):
            objects["creates_enums"].append(name)

    # DROP
    for m in re.finditer(r'drop\s+(table|function|view|trigger|index|policy|type)\s+(?:if\s+exists\s+)?(?:public\.)?(\w+)', content_lower):
        name = m.group(2)
        if is_valid_name(name):
            objects["drops"].append((m.group(1), name))

    # Data operations
    for op in ['insert', 'update', 'delete']:
        if re.search(rf'\b{op}\s+(?:into|from|public\.)\b', content_lower):
            objects["data_ops"].append(op)

    return objects


def check_objects_exist(objects, db):
    """Verifica se objetos criados pelo migration existem no banco."""
    missing = []
    found = []

    # Check tables
    db_tables = {t["table_name"] for t in db["tables"]}
    for t in objects["creates_tables"]:
        if t in db_tables:
            found.append(f"table:{t}")
        else:
            missing.append(f"table:{t}")

    # Check columns
    db_columns = {(c["table_name"], c["column_name"]) for c in db["columns"]}
    for table, col in objects["adds_columns"]:
        if (table, col) in db_columns:
            found.append(f"column:{table}.{col}")
        else:
            missing.append(f"column:{table}.{col}")

    # Check functions
    db_funcs = {f["function_name"] for f in db["functions"]}
    for fn in objects["creates_functions"]:
        if fn in db_funcs:
            found.append(f"function:{fn}")
        else:
            missing.append(f"function:{fn}")

    # Check views
    db_views = {v["viewname"] for v in db["views"]}
    for v in objects["creates_views"]:
        if v in db_views:
            found.append(f"view:{v}")
        else:
            missing.append(f"view:{v}")

    # Check triggers
    db_triggers = {t["trigger_name"] for t in db["triggers"]}
    for t in objects["creates_triggers"]:
        if t in db_triggers:
            found.append(f"trigger:{t}")
        else:
            missing.append(f"trigger:{t}")

    # Check indexes
    db_indexes = {i["indexname"] for i in db["indexes"]}
    for i in objects["creates_indexes"]:
        if i in db_indexes:
            found.append(f"index:{i}")
        else:
            missing.append(f"index:{i}")

    # Check enums
    db_enums = {e["typname"] for e in db["enums"]}
    for e in objects["creates_enums"]:
        if e in db_enums:
            found.append(f"enum:{e}")
        else:
            missing.append(f"enum:{e}")

    # Check policies
    db_policies = {p["policyname"] for p in db["policies"]}
    for p in objects["creates_policies"]:
        if p in db_policies:
            found.append(f"policy:{p}")
        else:
            missing.append(f"policy:{p}")

    return found, missing


def detect_superseded(files):
    """Detecta arquivos que foram supersedidos por versões mais novas."""
    superseded = set()
    # Group by base name pattern
    base_groups = defaultdict(list)

    for f in files:
        name = f.stem  # without .sql
        # Remove version suffixes
        base = re.sub(r'_v\d+$', '', name)
        base = re.sub(r'_final$', '', base)
        base = re.sub(r'_fix$', '', base)
        base_groups[base].append(f)

    for base, group in base_groups.items():
        if len(group) > 1:
            # Sort by filename (date prefix ensures chronological order)
            group.sort(key=lambda x: x.name)
            # All except the last are superseded
            for f in group[:-1]:
                superseded.add(f.name)

    return superseded


def classify_migration(filepath, objects, db, logged_files, superseded_files):
    """Classifica uma migration em uma categoria."""
    filename = filepath.name

    # Check if logged
    if filename in logged_files:
        return "LOGGED", "Registrado no .migration_log como aplicado em prod"

    # Check if superseded
    if filename in superseded_files:
        return "SUPERSEDED", "Versão anterior — existe versão mais recente"

    # Check schema objects against real DB
    found, missing = check_objects_exist(objects, db)

    has_schema_ops = (
        objects["creates_tables"] or objects["adds_columns"] or
        objects["creates_functions"] or objects["creates_views"] or
        objects["creates_triggers"] or objects["creates_indexes"] or
        objects["creates_policies"] or objects["creates_enums"]
    )
    has_data_ops = bool(objects["data_ops"])
    has_drops = bool(objects["drops"])

    # Pure data operations
    if has_data_ops and not has_schema_ops and not has_drops:
        return "DATA_ONLY", f"Apenas operações de dados: {', '.join(objects['data_ops'])}"

    # All schema objects confirmed in DB
    if has_schema_ops and found and not missing:
        return "CONFIRMED", f"Todos objetos existem no banco: {', '.join(found[:5])}"

    # Some objects found, some missing (might be drops that ran)
    if has_schema_ops and found and missing:
        # Check if missing objects were also dropped
        dropped_types = {d[1] for d in objects["drops"]}
        real_missing = [m for m in missing if m.split(":")[1] not in dropped_types]
        if not real_missing:
            return "CONFIRMED", f"Objetos criados existem, drops executados: {', '.join(found[:3])}"
        return "NEEDS_REVIEW", f"Parcial — encontrados: {', '.join(found[:3])}; faltam: {', '.join(real_missing[:3])}"

    # Only drops
    if has_drops and not has_schema_ops and not has_data_ops:
        return "DATA_ONLY", f"Apenas drops: {', '.join(f'{t}:{n}' for t, n in objects['drops'][:3])}"

    # Mixed or unclear
    if has_schema_ops and not found and not missing:
        # Parser didn't find specific objects but there are schema ops
        return "NEEDS_REVIEW", "Schema ops detectadas mas objetos não identificáveis pelo parser"

    if not has_schema_ops and not has_data_ops and not has_drops:
        # Empty or unrecognized SQL
        return "NEEDS_REVIEW", "Nenhuma operação SQL reconhecida"

    if has_schema_ops and missing and not found:
        return "NEEDS_REVIEW", f"Objetos NÃO encontrados no banco: {', '.join(missing[:5])}"

    return "NEEDS_REVIEW", "Classificação incerta"


def main():
    print("=== CLASSIFICADOR DE MIGRATIONS ===\n")

    # Load DB state
    db = {
        "tables": load_json("tables"),
        "columns": load_json("columns"),
        "functions": load_json("functions"),
        "views": load_json("views"),
        "triggers": load_json("triggers"),
        "indexes": load_json("indexes"),
        "enums": load_json("enums"),
        "policies": load_json("policies"),
    }

    # Load migration log
    logged_files = load_migration_log()
    print(f"Arquivos no migration_log: {len(logged_files)}")

    # List all migration files
    migration_files = sorted(MIGRATIONS_DIR.glob("*.sql"))
    print(f"Arquivos de migration no disco: {len(migration_files)}")

    # Detect superseded
    superseded_files = detect_superseded(migration_files)
    print(f"Arquivos supersedidos detectados: {len(superseded_files)}")

    # Classify each file
    results = defaultdict(list)
    report_lines = []

    for filepath in migration_files:
        try:
            content = filepath.read_text(encoding="utf-8", errors="replace")
        except Exception as e:
            category = "NEEDS_REVIEW"
            reason = f"Erro ao ler: {e}"
            results[category].append((filepath.name, reason))
            report_lines.append(f"{category:15} | {filepath.name} | {reason}")
            continue

        objects = extract_sql_objects(content)
        category, reason = classify_migration(filepath, objects, db, logged_files, superseded_files)
        results[category].append((filepath.name, reason))
        report_lines.append(f"{category:15} | {filepath.name} | {reason}")

    # Write report
    with open(REPORT_FILE, "w") as f:
        f.write("# Relatório de Classificação de Migrations\n")
        f.write(f"# Data: 2026-03-31\n")
        f.write(f"# Total: {len(migration_files)} arquivos\n\n")

        f.write("## RESUMO\n")
        for cat in ["CONFIRMED", "LOGGED", "DATA_ONLY", "SUPERSEDED", "NEEDS_REVIEW"]:
            count = len(results.get(cat, []))
            f.write(f"  {cat:15}: {count:4} arquivos\n")
        f.write(f"  {'TOTAL':15}: {len(migration_files):4} arquivos\n\n")

        f.write("## DETALHES\n\n")
        for line in report_lines:
            f.write(line + "\n")

        # Section for NEEDS_REVIEW files
        if results.get("NEEDS_REVIEW"):
            f.write(f"\n## ARQUIVOS QUE PRECISAM REVISÃO MANUAL ({len(results['NEEDS_REVIEW'])})\n\n")
            for filename, reason in results["NEEDS_REVIEW"]:
                f.write(f"  {filename}\n    → {reason}\n")

    # Print summary
    print(f"\n{'='*60}")
    print("RESUMO DA CLASSIFICAÇÃO:")
    print(f"{'='*60}")
    safe_total = 0
    for cat in ["CONFIRMED", "LOGGED", "DATA_ONLY", "SUPERSEDED"]:
        count = len(results.get(cat, []))
        safe_total += count
        print(f"  {cat:15}: {count:4} (seguro para arquivar)")
    review_count = len(results.get("NEEDS_REVIEW", []))
    print(f"  {'NEEDS_REVIEW':15}: {review_count:4} (revisão manual)")
    print(f"  {'─'*40}")
    print(f"  {'SAFE TO ARCHIVE':15}: {safe_total:4}")
    print(f"  {'TOTAL':15}: {len(migration_files):4}")
    print(f"\nRelatório salvo em: {REPORT_FILE}")


if __name__ == "__main__":
    main()