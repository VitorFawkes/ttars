# WelcomeCRM — Arquitetura de IA

> Documentação da infraestrutura de IA usada pelo Claude Code neste projeto.
> Atualizado em: 2026-03-30

---

## Estrutura de diretórios

```plaintext
.agent/
├── ARCHITECTURE.md          # Este arquivo
├── CODEBASE.md              # Inventário do projeto (tabelas, hooks, pages, components)
├── agents/                  # 9 agentes especialistas (metadados para MCP)
├── rules/                   # 4 regras obrigatórias
└── scripts/
    ├── sync_codebase.py     # Sincroniza CODEBASE.md com o código
    └── checklist.py         # Validação de qualidade (P0-P5)

.claude/
├── settings.local.json      # Hooks e permissões do Claude Code
├── hooks/                   # 7 hooks automáticos
├── skills/                  # 7 skills (comandos /)
├── agents/
│   └── code-reviewer.md     # Agente de review de código
├── agent-memory/
│   └── code-reviewer/       # Memória persistente do reviewer
└── plans/                   # Planos temporários por sessão

memory/                      # Memória persistente entre conversas
mcp-servers/
└── welcomecrm-context/      # MCP server customizado
```

---

## Agentes MCP (9)

Metadados parseados pelo MCP server para orientação contextual.
**Não são executados** — retornam sugestões em JSON via `get_context`.

| Agente | Foco | Usado pelo MCP? |
|--------|------|-----------------|
| `frontend-specialist` | React, UI/UX, Tailwind | ✅ DOMAIN_TO_AGENT |
| `backend-specialist` | API, Edge Functions, webhooks | ✅ DOMAIN_TO_AGENT |
| `database-architect` | SQL, schema, migrations, RLS | ✅ DOMAIN_TO_AGENT |
| `debugger` | Root cause analysis | ✅ Essential fallback |
| `devops-engineer` | CI/CD, deploy | Disponível |
| `performance-optimizer` | Performance, Web Vitals | Disponível |
| `project-planner` | Planejamento, roadmap | Disponível |
| `security-auditor` | Segurança, RLS, policies | Disponível |
| `test-engineer` | Testes, coverage | Disponível |

---

## Rules (4)

| Regra | Foco |
|-------|------|
| `00-project-context.md` | Contexto do projeto, stack, convenções |
| `10-secrets-protection.md` | Proteção de secrets e variáveis de ambiente |
| `20-supabase-safety.md` | Segurança do banco de dados |
| `90-project-architecture.md` | Decisões arquiteturais, 3 suns |

---

## Scripts

| Script | Comando | Uso |
|--------|---------|-----|
| `sync_codebase.py` | `npm run sync:fix` | Atualiza CODEBASE.md |
| `checklist.py` | `/verify` | Validação P0-P5 (segurança, lint, schema, testes, UX) |

---

## Quick Reference

| Precisa de | Agente MCP | Skill do projeto |
|------------|-----------|-----------------|
| Review de código | code-reviewer (.claude/agents/) | `/review` |
| Deploy completo | — | `/subir` |
| Verificação rápida | — | `/test` |
| Checklist completo | — | `/verify` |
| Deploy Edge Function | — | `/deploy` |
