# WelcomeCRM

CRM multi-tenant da Welcome (Trips · Weddings · Courses). React + Vite + TailwindCSS +
Supabase (PostgreSQL + Edge Functions) + TypeScript strict.

## Começando

➡️ **[Guia do Desenvolvedor](docs/DEVELOPER_SETUP.md)** — setup, como rodar, como subir e
**como reverter** com segurança.

```bash
npm install
cp .env.example .env   # preencha com os valores recebidos por canal seguro
npm run dev            # http://localhost:5714
```

> Requer Node ≥ 22. Recomendado usar o **Claude Code** — as travas de segurança do projeto
> rodam dentro dele.

## Documentação

| Arquivo | O que é |
|---|---|
| [`CLAUDE.md`](CLAUDE.md) | Bíblia do projeto: arquitetura, multi-tenant, isolamento, regras invioláveis |
| [`docs/DEVELOPER_SETUP.md`](docs/DEVELOPER_SETUP.md) | Onboarding: instalar, rodar, subir, reverter |
| [`docs/SQL_SOP.md`](docs/SQL_SOP.md) | Procedimentos de SQL (ler antes de views/triggers) |
| [`docs/SYSTEM_CONTEXT.md`](docs/SYSTEM_CONTEXT.md) | Decisões arquiteturais |
| [`docs/DESIGN_SYSTEM.md`](docs/DESIGN_SYSTEM.md) | Regras de UI |
| `.agent/CODEBASE.md` | Inventário (hooks, pages, componentes, tabelas) — gerado por `npm run sync:fix` |

## Comandos

```bash
npm run dev          # servidor de desenvolvimento (porta 5714)
npm run build        # build de produção (inclui checagem de tipos)
npm run lint         # ESLint
npm run test         # testes unitários (Vitest)
npm run test:e2e     # testes de ponta a ponta (Playwright)
npm run sync:fix     # atualiza o inventário .agent/CODEBASE.md
```

## Como reverter (resumo)

- **Site:** Instant Rollback no painel Vercel, ou `bash scripts/vercel-rollback.sh`, ou `git revert`.
- **Banco:** Point-in-Time Recovery do Supabase + SQL de "como desfazer" guardado junto da migração.

Detalhes em [`docs/DEVELOPER_SETUP.md`](docs/DEVELOPER_SETUP.md#7-como-desfazer-se-algo-der-errado-).
