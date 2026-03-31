---
trigger: glob
globs: supabase/**
---

# 🛡️ Supabase Integrity & Safety Protocol
> **Activation:** ALWAYS ON.
> **Scope:** All Database Interactions (Migrations, RLS, Edge Functions, Types).
> **Source:** Based on live Supabase schema.

## 1. The "Hidden Dependency" Law
**Premise:** The database is NOT isolated. It is hard-linked to the Frontend via Views and Types.
**Protocol:** Before ANY schema change (`ALTER`, `DROP`), you MUST perform a **Dependency Audit**:
1.  **Search Codebase:** `grep -r "table_name" src/` (Finds UI usage).
2.  **Search Database:** Query `information_schema.views` and `triggers` (Finds DB usage).
*If dependencies exist, they MUST be updated in the SAME deployment unit.*

## 2. The "Non-Destructive Evolution" Strategy
**Premise:** Rollbacks are impossible if data is deleted.
**Rule:** NEVER use destructive operations (`DROP COLUMN`, `DROP TABLE`) in active systems.
**The Pattern:**
1.  **Phase 1 (Expand):** Add new column/table. Deploy.
2.  **Phase 2 (Migrate):** Dual-write to both old and new. Deploy.
3.  **Phase 3 (Contract):** Mark old as deprecated (rename to `_deprecated_`). Stop writing.
4.  **Phase 4 (Cleanup):** Drop only after N days of zero usage.

## 3. The "Type Sync" Imperative
**Premise:** TypeScript is your only defense against runtime crashes.
**Rule:** Immediately after ANY migration application, you MUST regenerate `database.types.ts`.
**Check:** If `git diff` shows a migration but NO change in `types.ts`, the build is **BROKEN**.

## 4. RLS & Tenant Isolation
**Premise:** Every table is a potential leak.
**Rule:** `ENABLE ROW LEVEL SECURITY` is mandatory for ALL tables.
**Policy:** Default to `auth.uid() = tenant_id` (or equivalent) unless explicitly public.

## 5. Isolamento de Produto (TRIPS / WEDDING)
**Premise:** Cada produto tem seu pipeline. Dados NÃO podem vazar entre produtos.
**Constantes:** `PRODUCT_PIPELINE_MAP` em `src/lib/constants.ts` (TRIPS e WEDDING).
**Frontend:**
- Toda query que toca `cards` DEVE filtrar por `produto` via `useProductContext().currentProduct`
- Toda query que toca `pipeline_stages` DEVE filtrar por `pipeline_id` via `PRODUCT_PIPELINE_MAP[currentProduct]`
**Backend (SQL/RPCs):**
- `AND (p_product IS NULL OR c.produto::TEXT = p_product)` em toda RPC que toca `cards`
- `JOIN pipelines pip ON pip.id = s.pipeline_id WHERE (p_product IS NULL OR pip.produto = p_product)` para stages

## 6. Protocolo de Migrations
**Fluxo obrigatório:** Staging → Teste → Produção (NUNCA direto em produção).
- Aplicar: `bash .claude/hooks/apply-to-staging.sh <arquivo.sql>`
- Promover: `bash .claude/hooks/promote-to-prod.sh <arquivo.sql>`
- O hook `check-before-done.sh` BLOQUEIA se detectar .sql sem registro no `.migration_log`

## 7. Edge Functions Públicas
**Functions que recebem webhooks externos** DEVEM ser deployadas com `--no-verify-jwt`.
**Verificar:** Se `config.toml` tem `verify_jwt = false`, SEMPRE usar `--no-verify-jwt` no deploy.
**Hook automático:** `check-edge-deploy.sh` bloqueia deploys incorretos.
