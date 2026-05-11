#!/usr/bin/env python3
"""
Reorganiza migrations: move arquivos antigos para _archived/.
Mantém na raiz apenas os arquivos registrados no .migration_log.
Uso: python3 .claude/hooks/reorganize-migrations.py [--dry-run]
"""

import os
import re
import shutil
import sys
from pathlib import Path

DRY_RUN = "--dry-run" in sys.argv

MIGRATIONS_DIR = Path("supabase/migrations")
ARCHIVE_DIR = MIGRATIONS_DIR / "_archived"
BASELINE_DIR = MIGRATIONS_DIR / "_baseline"
LOG_FILE = Path(".claude/.migration_log")


def get_logged_files():
    """Retorna set de filenames registrados no migration_log."""
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
                    logged.add(os.path.basename(filepath))
    return logged


def get_month_folder(filename):
    """Determina a pasta de destino baseado no prefixo do arquivo."""
    if filename.startswith("SPRINT"):
        return "SPRINT"
    if filename.startswith("00000000"):
        return "bootstrap"

    # Extract date prefix
    m = re.match(r'(\d{4})(\d{2})', filename)
    if m:
        year = m.group(1)
        month = m.group(2)
        return f"{year}{month}"

    return "misc"


def main():
    logged_files = get_logged_files()
    print(f"Arquivos no migration_log: {len(logged_files)}")

    # List all .sql files in migrations root (not in subdirs)
    all_files = sorted(f for f in MIGRATIONS_DIR.iterdir()
                       if f.is_file() and f.suffix == ".sql")
    print(f"Arquivos .sql no disco: {len(all_files)}")

    # Also handle the erroneous supabase/ subdir
    erroneous_dir = MIGRATIONS_DIR / "supabase"

    to_keep = []
    to_archive = []
    to_delete = []

    for f in all_files:
        filename = f.name

        # schema.sql (empty dump) → delete
        if filename == "schema.sql":
            to_delete.append(f)
            continue

        # Logged files stay
        if filename in logged_files:
            to_keep.append(f)
            continue

        # Everything else → archive
        to_archive.append(f)

    print(f"\nPlano:")
    print(f"  Manter na raiz:  {len(to_keep)} (logados)")
    print(f"  Arquivar:        {len(to_archive)}")
    print(f"  Deletar:         {len(to_delete)}")

    if DRY_RUN:
        print("\n[DRY RUN] Nenhuma alteração feita.")
        print("\nArquivos a manter:")
        for f in to_keep[:5]:
            print(f"  ✓ {f.name}")
        print(f"  ... ({len(to_keep)} total)")

        print("\nArquivos a arquivar (amostra):")
        folders = {}
        for f in to_archive:
            folder = get_month_folder(f.name)
            folders.setdefault(folder, []).append(f.name)
        for folder, files in sorted(folders.items()):
            print(f"  _archived/{folder}/: {len(files)} arquivos")

        print("\nArquivos a deletar:")
        for f in to_delete:
            print(f"  ✗ {f.name}")
        return

    # Execute
    print("\nExecutando...")

    # Create archive dirs and move files
    moved = 0
    for f in to_archive:
        folder = get_month_folder(f.name)
        dest_dir = ARCHIVE_DIR / folder
        dest_dir.mkdir(parents=True, exist_ok=True)
        dest = dest_dir / f.name
        shutil.move(str(f), str(dest))
        moved += 1

    # Delete files
    deleted = 0
    for f in to_delete:
        f.unlink()
        deleted += 1

    # Handle erroneous supabase/ subdir
    if erroneous_dir.exists() and erroneous_dir.is_dir():
        shutil.rmtree(str(erroneous_dir))
        print(f"  Removido diretório errôneo: {erroneous_dir}")

    print(f"\n  Movidos para _archived/: {moved}")
    print(f"  Deletados: {deleted}")
    print(f"  Mantidos na raiz: {len(to_keep)}")

    # Show final structure
    print(f"\nEstrutura final:")
    remaining = sorted(f.name for f in MIGRATIONS_DIR.iterdir()
                       if f.is_file() and f.suffix == ".sql")
    print(f"  Raiz: {len(remaining)} arquivos")
    for d in sorted(ARCHIVE_DIR.iterdir()):
        if d.is_dir():
            count = len(list(d.glob("*.sql")))
            print(f"  _archived/{d.name}/: {count} arquivos")
    if BASELINE_DIR.exists():
        count = len(list(BASELINE_DIR.glob("*.sql")))
        print(f"  _baseline/: {count} arquivos")


if __name__ == "__main__":
    main()