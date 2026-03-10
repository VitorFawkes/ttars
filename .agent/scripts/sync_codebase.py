#!/usr/bin/env python3
"""
Sync CODEBASE.md - WelcomeCRM
=============================

Mantém CODEBASE.md sincronizado com o estado real do projeto.

Uso:
    python .agent/scripts/sync_codebase.py --audit     # Apenas relatório
    python .agent/scripts/sync_codebase.py --fix       # Auto-atualiza CODEBASE.md
    python .agent/scripts/sync_codebase.py --strict    # Modo CI - falha se gaps
    python .agent/scripts/sync_codebase.py --verbose   # Mostra detalhes

Cobertura:
    - Hooks (src/hooks/*.ts)
    - Pages (src/pages/**/*.tsx)
    - Components (src/components/**/*)
    - Utils (src/utils/*)
    - Lib (src/lib/*)
    - Tables (Supabase live ou database.types.ts)
    - Views (Supabase live ou database.types.ts)
"""

import re
import sys
import argparse
from pathlib import Path
from dataclasses import dataclass, field
from datetime import datetime

# ANSI colors for terminal output
class Colors:
    HEADER = '\033[95m'
    BLUE = '\033[94m'
    CYAN = '\033[96m'
    GREEN = '\033[92m'
    YELLOW = '\033[93m'
    RED = '\033[91m'
    ENDC = '\033[0m'
    BOLD = '\033[1m'

def print_header(text: str):
    print(f"\n{Colors.BOLD}{Colors.CYAN}{'='*60}{Colors.ENDC}")
    print(f"{Colors.BOLD}{Colors.CYAN}{text.center(60)}{Colors.ENDC}")
    print(f"{Colors.BOLD}{Colors.CYAN}{'='*60}{Colors.ENDC}\n")

def print_success(text: str):
    print(f"{Colors.GREEN}✅ {text}{Colors.ENDC}")

def print_warning(text: str):
    print(f"{Colors.YELLOW}⚠️  {text}{Colors.ENDC}")

def print_error(text: str):
    print(f"{Colors.RED}❌ {text}{Colors.ENDC}")

def print_info(text: str):
    print(f"{Colors.BLUE}ℹ️  {text}{Colors.ENDC}")


@dataclass
class ResourceCount:
    """Contagem de um tipo de recurso."""
    documented: int = 0
    actual: int = 0
    items: list = field(default_factory=list)

    @property
    def delta(self) -> int:
        return self.actual - self.documented

    @property
    def is_synced(self) -> bool:
        return self.delta == 0


@dataclass
class SyncReport:
    """Relatório completo de sincronização."""
    hooks: ResourceCount = field(default_factory=ResourceCount)
    pages: ResourceCount = field(default_factory=ResourceCount)
    components: ResourceCount = field(default_factory=ResourceCount)
    tables: ResourceCount = field(default_factory=ResourceCount)
    views: ResourceCount = field(default_factory=ResourceCount)
    utils: ResourceCount = field(default_factory=ResourceCount)
    lib: ResourceCount = field(default_factory=ResourceCount)
    components_by_dir: dict = field(default_factory=dict)

    @property
    def is_synced(self) -> bool:
        return all([
            self.hooks.is_synced,
            self.pages.is_synced,
            self.tables.is_synced,
            self.views.is_synced,
        ])


class CodebaseSync:
    """Sincronizador de CODEBASE.md."""

    def __init__(self, project_root: str):
        self.root = Path(project_root).resolve()
        self.codebase_path = self.root / ".agent" / "CODEBASE.md"
        self.env_path = self.root / ".env"
        self._load_env()

    def _load_env(self):
        """Carrega variáveis do .env."""
        self.env = {}
        if self.env_path.exists():
            for line in self.env_path.read_text().splitlines():
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    key, _, value = line.partition('=')
                    # Remove aspas
                    value = value.strip().strip('"').strip("'")
                    self.env[key.strip()] = value

    # === SCANNERS ===

    def scan_hooks(self) -> list[str]:
        """Escaneia src/hooks/*.ts"""
        hooks_dir = self.root / "src" / "hooks"
        if not hooks_dir.exists():
            return []
        return sorted([f.stem for f in hooks_dir.glob("*.ts") if f.is_file()])

    def scan_pages(self) -> list[str]:
        """Escaneia src/pages/**/*.tsx (exclui components/)"""
        pages_dir = self.root / "src" / "pages"
        if not pages_dir.exists():
            return []
        pages = []
        for f in pages_dir.rglob("*.tsx"):
            # Excluir arquivos dentro de /components/
            rel_str = str(f.relative_to(pages_dir))
            if "/components/" not in f"/{rel_str}" and "\\components\\" not in f"\\{rel_str}":
                pages.append(rel_str)
        return sorted(pages)

    def scan_components(self) -> tuple[dict[str, int], int]:
        """Escaneia src/components/ por subdiretório."""
        comp_dir = self.root / "src" / "components"
        if not comp_dir.exists():
            return {}, 0

        by_dir = {}
        total = 0
        for item in comp_dir.iterdir():
            if item.is_dir():
                count = len(list(item.rglob("*.tsx")))
                by_dir[item.name] = count
                total += count
            elif item.suffix == ".tsx":
                total += 1

        return by_dir, total

    def scan_utils(self) -> list[str]:
        """Escaneia src/utils/"""
        utils_dir = self.root / "src" / "utils"
        if not utils_dir.exists():
            return []
        return sorted([f.name for f in utils_dir.glob("*.ts") if f.is_file()])

    def scan_lib(self) -> list[str]:
        """Escaneia src/lib/"""
        lib_dir = self.root / "src" / "lib"
        if not lib_dir.exists():
            return []
        return sorted([f.name for f in lib_dir.glob("*.ts") if f.is_file()])

    # === SUPABASE QUERIES ===

    def query_supabase_tables(self) -> list[str]:
        """Consulta tabelas via REST API ou fallback para types."""
        url = self.env.get("VITE_SUPABASE_URL")
        anon = self.env.get("VITE_SUPABASE_ANON_KEY")
        service_key = self.env.get("SUPABASE_SERVICE_ROLE_KEY")

        if url and (service_key or anon):
            try:
                import requests
                auth_key = service_key or anon

                # Tentar RPC function primeiro
                response = requests.get(
                    f"{url}/rest/v1/rpc/get_all_tables",
                    headers={
                        "apikey": anon or service_key,
                        "Authorization": f"Bearer {auth_key}"
                    },
                    timeout=10
                )
                if response.ok:
                    data = response.json()
                    if isinstance(data, list) and len(data) > 0:
                        return sorted([t.get("table_name", t) if isinstance(t, dict) else str(t) for t in data])
            except Exception as e:
                print_warning(f"Supabase query falhou: {e}")

        # Fallback para database.types.ts
        return self._parse_database_types_tables()

    def query_supabase_views(self) -> list[str]:
        """Consulta views via REST API ou fallback para types."""
        url = self.env.get("VITE_SUPABASE_URL")
        anon = self.env.get("VITE_SUPABASE_ANON_KEY")
        service_key = self.env.get("SUPABASE_SERVICE_ROLE_KEY")

        if url and (service_key or anon):
            try:
                import requests
                auth_key = service_key or anon

                response = requests.get(
                    f"{url}/rest/v1/rpc/get_all_views",
                    headers={
                        "apikey": anon or service_key,
                        "Authorization": f"Bearer {auth_key}"
                    },
                    timeout=10
                )
                if response.ok:
                    data = response.json()
                    if isinstance(data, list) and len(data) > 0:
                        return sorted([v.get("view_name", v) if isinstance(v, dict) else str(v) for v in data])
            except Exception:
                pass

        # Fallback para database.types.ts
        return self._parse_database_types_views()

    def _parse_database_types_tables(self) -> list[str]:
        """Extrai tabelas do database.types.ts."""
        types_file = self.root / "src" / "database.types.ts"
        if not types_file.exists():
            return []

        content = types_file.read_text()
        tables = set()

        # Encontra bloco Tables: { ... }
        tables_match = re.search(r'Tables:\s*\{', content)
        if not tables_match:
            return []

        # Encontra onde termina o bloco Tables (próximo bloco é Views ou Functions)
        tables_end = re.search(r'\n\s{4}Views:\s*\{|\n\s{4}Functions:\s*\{', content[tables_match.start():])
        tables_section = content[tables_match.start():tables_match.start() + (tables_end.start() if tables_end else len(content))]

        # Pattern: nome_tabela no nível correto (6 espaços de indentação)
        # Formato: "      nome_tabela: {"
        for match in re.finditer(r'^\s{6}(\w+):\s*\{', tables_section, re.MULTILINE):
            table_name = match.group(1)
            tables.add(table_name)

        return sorted(tables)

    def _parse_database_types_views(self) -> list[str]:
        """Extrai views do database.types.ts."""
        types_file = self.root / "src" / "database.types.ts"
        if not types_file.exists():
            return []

        content = types_file.read_text()
        views = set()

        # Encontra bloco Views: { ... }
        views_match = re.search(r'Views:\s*\{', content)
        if not views_match:
            return []

        # Encontra onde termina o bloco Views (próximo bloco é Functions)
        views_end = re.search(r'\n\s{4}Functions:\s*\{', content[views_match.start():])
        views_section = content[views_match.start():views_match.start() + (views_end.start() if views_end else len(content))]

        # Pattern: nome_view no nível correto (6 espaços de indentação)
        for match in re.finditer(r'^\s{6}(\w+):\s*\{', views_section, re.MULTILINE):
            view_name = match.group(1)
            views.add(view_name)

        return sorted(views)

    # === CODEBASE.MD PARSER ===

    def parse_codebase_md(self) -> dict:
        """Extrai stats do CODEBASE.md."""
        if not self.codebase_path.exists():
            return {"stats": {"tables": 0, "pages": 0, "hooks": 0, "views": 0, "components": 0}}

        content = self.codebase_path.read_text()

        # Parse header stats - formato: "> **Stats:** 94 tabelas | 35 paginas | 48 hooks | 16 views"
        # Suporta com ou sem markdown bold e com ou sem > no início
        stats_match = re.search(
            r'Stats:\*{0,2}\s*(\d+)\s*tabelas\s*\|\s*(\d+)\s*paginas\s*\|\s*(\d+)\s*hooks\s*\|\s*(\d+)\s*views(?:\s*\|\s*(\d+)\s*components)?',
            content
        )

        if stats_match:
            return {
                "stats": {
                    "tables": int(stats_match.group(1)),
                    "pages": int(stats_match.group(2)),
                    "hooks": int(stats_match.group(3)),
                    "views": int(stats_match.group(4)),
                    "components": int(stats_match.group(5)) if stats_match.group(5) else 0,
                },
                "raw_content": content
            }

        return {"stats": {"tables": 0, "pages": 0, "hooks": 0, "views": 0, "components": 0}, "raw_content": content}

    # === COMPARAÇÃO ===

    def compare(self) -> SyncReport:
        """Compara estado real vs documentado."""
        # Escanear código
        actual_hooks = self.scan_hooks()
        actual_pages = self.scan_pages()
        components_by_dir, actual_components = self.scan_components()
        actual_tables = self.query_supabase_tables()
        actual_views = self.query_supabase_views()
        actual_utils = self.scan_utils()
        actual_lib = self.scan_lib()

        # Ler documentado
        documented = self.parse_codebase_md()
        stats = documented["stats"]

        return SyncReport(
            hooks=ResourceCount(
                documented=stats["hooks"],
                actual=len(actual_hooks),
                items=actual_hooks
            ),
            pages=ResourceCount(
                documented=stats["pages"],
                actual=len(actual_pages),
                items=actual_pages
            ),
            components=ResourceCount(
                documented=stats.get("components", 0),
                actual=actual_components,
                items=[]
            ),
            tables=ResourceCount(
                documented=stats["tables"],
                actual=len(actual_tables),
                items=actual_tables
            ),
            views=ResourceCount(
                documented=stats["views"],
                actual=len(actual_views),
                items=actual_views
            ),
            utils=ResourceCount(
                documented=0,
                actual=len(actual_utils),
                items=actual_utils
            ),
            lib=ResourceCount(
                documented=0,
                actual=len(actual_lib),
                items=actual_lib
            ),
            components_by_dir=components_by_dir
        )

    # === TABLE GENERATORS ===

    def _generate_hooks_table(self, hooks: list[str]) -> str:
        """Gera tabela markdown de hooks a partir do scan do filesystem."""
        lines = [
            "### 2.4 Frontend Hooks (AUTO-GENERATED)",
            "",
            f"> **{len(hooks)} hooks** escaneados de `src/hooks/*.ts` — atualizado automaticamente via `npm run sync:fix`",
            "",
        ]

        # Categorizar hooks por prefixo
        categories: dict[str, list[str]] = {}
        for hook in hooks:
            if hook.startswith("use"):
                # Tenta categorizar por nome
                name = hook[3:]  # remove "use"
                if any(k in name.lower() for k in ["pipeline", "card", "stage", "filter", "kanban"]):
                    cat = "Pipeline & Cards"
                elif any(k in name.lower() for k in ["proposal", "builder", "library", "pdf"]):
                    cat = "Proposals"
                elif any(k in name.lower() for k in ["user", "team", "role", "department", "profile"]):
                    cat = "Users & Teams"
                elif any(k in name.lower() for k in ["analytics", "overview", "funnel", "sla", "whatsapp", "retention", "financial", "operation", "performance"]):
                    cat = "Analytics"
                elif any(k in name.lower() for k in ["calendar", "meeting", "drag"]):
                    cat = "Calendar"
                elif any(k in name.lower() for k in ["report", "dashboard", "saved", "field_registry"]):
                    cat = "Reports"
                elif any(k in name.lower() for k in ["section", "field", "requirement"]):
                    cat = "Section & Field"
                elif any(k in name.lower() for k in ["ai", "chat", "briefing", "extract", "search"]):
                    cat = "AI & Search"
                elif any(k in name.lower() for k in ["integration", "health", "cadence"]):
                    cat = "Integrations"
                elif any(k in name.lower() for k in ["contact", "people", "duplicate", "quality"]):
                    cat = "Contacts"
                else:
                    cat = "Other"
            else:
                cat = "Other"
            categories.setdefault(cat, []).append(hook)

        for cat_name in sorted(categories.keys()):
            cat_hooks = sorted(categories[cat_name])
            lines.append(f"#### {cat_name}")
            lines.append(f"| Hook | File |")
            lines.append(f"|------|------|")
            for h in cat_hooks:
                lines.append(f"| `{h}()` | `{h}.ts` |")
            lines.append("")

        return "\n".join(lines)

    def _generate_pages_table(self, pages: list[str]) -> str:
        """Gera tabela markdown de pages a partir do scan do filesystem."""
        lines = [
            "### 3.3 All Pages (AUTO-GENERATED)",
            "",
            f"> **{len(pages)} pages** escaneadas de `src/pages/` — atualizado automaticamente via `npm run sync:fix`",
            "",
            "| Page | Path |",
            "|------|------|",
        ]
        for p in sorted(pages):
            name = Path(p).stem
            lines.append(f"| `{name}` | `src/pages/{p}` |")
        lines.append("")
        return "\n".join(lines)

    # === AUTO-FIX ===

    def auto_fix(self, report: SyncReport) -> bool:
        """Atualiza CODEBASE.md com dados reais."""
        if not self.codebase_path.exists():
            print_error("CODEBASE.md não encontrado!")
            return False

        content = self.codebase_path.read_text()

        # Novo stats line
        new_stats = (
            f"**Stats:** {report.tables.actual} tabelas | "
            f"{report.pages.actual} paginas | "
            f"{report.hooks.actual} hooks | "
            f"{report.views.actual} views | "
            f"{report.components.actual} components"
        )

        # Atualizar stats
        content = re.sub(
            r'\*\*Stats:\*\*.*',
            new_stats,
            content
        )

        # Fallback para formato sem bold
        content = re.sub(
            r'> \*\*Stats:\*\*.*',
            f"> {new_stats}",
            content
        )

        # Atualizar timestamp
        today = datetime.now().strftime("%Y-%m-%d")
        content = re.sub(
            r'\*\*Last Updated:\*\*.*',
            f"**Last Updated:** {today}",
            content
        )

        # Auto-gerar tabela de hooks (substitui seção 2.4 Frontend Hooks)
        if report.hooks.items:
            hooks_table = self._generate_hooks_table(report.hooks.items)
            # Encontrar e substituir seção de hooks (entre "### 2.4 Frontend Hooks" e "### 2.4 Admin")
            hooks_pattern = r'### 2\.4 Frontend Hooks.*?(?=### 2\.4 Admin|## 3\.)'
            if re.search(hooks_pattern, content, re.DOTALL):
                content = re.sub(hooks_pattern, hooks_table + "\n", content, flags=re.DOTALL)
                print_info(f"Tabela de hooks atualizada ({len(report.hooks.items)} hooks)")

        # Auto-gerar tabela de pages (substitui seção 3.3 All Pages)
        if report.pages.items:
            pages_table = self._generate_pages_table(report.pages.items)
            # Encontrar e substituir seção de pages (entre "### 3.3 All Pages" e próxima seção ##)
            pages_pattern = r'### 3\.3 All Pages.*?(?=## 4\.)'
            if re.search(pages_pattern, content, re.DOTALL):
                content = re.sub(pages_pattern, pages_table + "\n", content, flags=re.DOTALL)
                print_info(f"Tabela de pages atualizada ({len(report.pages.items)} pages)")

        self.codebase_path.write_text(content)
        return True


def main():
    parser = argparse.ArgumentParser(
        description="Sincroniza CODEBASE.md com o estado real do projeto"
    )
    parser.add_argument("--audit", action="store_true", help="Apenas relatório, não modifica")
    parser.add_argument("--fix", action="store_true", help="Auto-atualiza CODEBASE.md")
    parser.add_argument("--strict", action="store_true", help="Modo CI - exit 1 se gaps")
    parser.add_argument("--verbose", "-v", action="store_true", help="Mostra detalhes")
    parser.add_argument("path", nargs="?", default=".", help="Caminho do projeto")

    args = parser.parse_args()

    # Resolver caminho
    project_path = Path(args.path).resolve()
    if not project_path.exists():
        print_error(f"Caminho não existe: {project_path}")
        sys.exit(1)

    sync = CodebaseSync(str(project_path))

    print_header("CODEBASE.md SYNC CHECK")

    # Executar comparação
    print_info("Escaneando projeto...")
    report = sync.compare()

    # Mostrar relatório
    print("\n" + "─" * 50)
    print(f"{'RECURSO':<15} {'DOCS':<8} {'REAL':<8} {'DELTA':<8} {'STATUS'}")
    print("─" * 50)

    resources = [
        ("Hooks", report.hooks),
        ("Pages", report.pages),
        ("Components", report.components),
        ("Tables", report.tables),
        ("Views", report.views),
        ("Utils", report.utils),
        ("Lib", report.lib),
    ]

    for name, rc in resources:
        delta_str = f"+{rc.delta}" if rc.delta > 0 else str(rc.delta)
        status = f"{Colors.GREEN}✓{Colors.ENDC}" if rc.is_synced else f"{Colors.RED}✗{Colors.ENDC}"
        print(f"{name:<15} {rc.documented:<8} {rc.actual:<8} {delta_str:<8} {status}")

    print("─" * 50)

    # Verbose: mostrar detalhes dos components
    if args.verbose and report.components_by_dir:
        print(f"\n{Colors.CYAN}Components por diretório:{Colors.ENDC}")
        for dir_name, count in sorted(report.components_by_dir.items()):
            print(f"  {dir_name}: {count}")

    # Status geral
    print()
    if report.is_synced:
        print_success("CODEBASE.md está SINCRONIZADO!")
    else:
        print_error("CODEBASE.md está DESATUALIZADO!")

        # Mostrar gaps
        gaps = []
        if not report.hooks.is_synced:
            gaps.append(f"Hooks: {report.hooks.delta:+d}")
        if not report.pages.is_synced:
            gaps.append(f"Pages: {report.pages.delta:+d}")
        if not report.tables.is_synced:
            gaps.append(f"Tables: {report.tables.delta:+d}")
        if not report.views.is_synced:
            gaps.append(f"Views: {report.views.delta:+d}")

        if gaps:
            print(f"  Gaps: {', '.join(gaps)}")

    # Auto-fix
    if args.fix:
        print()
        print_info("Executando auto-fix...")
        if sync.auto_fix(report):
            print_success("CODEBASE.md atualizado!")
        else:
            print_error("Falha ao atualizar CODEBASE.md")
            sys.exit(1)

    # Strict mode
    if args.strict and not report.is_synced:
        print()
        print_error("STRICT MODE: Documentação desatualizada!")
        print("  Execute: python .agent/scripts/sync_codebase.py --fix")
        sys.exit(1)

    sys.exit(0)


if __name__ == "__main__":
    main()
