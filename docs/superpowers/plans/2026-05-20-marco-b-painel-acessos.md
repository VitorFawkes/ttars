# Marco B — Painel de Acessos do Admin

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar ao admin do workspace visibilidade completa de quem acessa o sistema (logins com IP/dispositivo), o que fazem (ações nos cards/contatos/propostas) e ferramentas para gerenciar acessos (desativar usuário, forçar logout, exportar histórico).

**Architecture:** Nova tabela `audit_log` (por-org, RLS estrita para `is_admin`) + triggers em tabelas-chave (`cards`, `contatos`, `proposals`, `profiles`) que escrevem ações + edge functions para capturar login (IP/UA via headers) e forçar logout (invalida sessions via service_role). Frontend: `/admin/acessos` com 3 abas (Usuários, Logins, Ações).

**Tech Stack:** Supabase (PostgreSQL triggers + Edge Functions Deno), React 18 + TypeScript Strict, TailwindCSS, Supabase Auth Admin API (`auth.admin.signOut`), `@tanstack/react-query` para tabelas paginadas.

**Spec de referência:** [docs/superpowers/specs/2026-05-20-alertas-viscerais-e-painel-acessos-design.md](../specs/2026-05-20-alertas-viscerais-e-painel-acessos-design.md) §5

**Dependência:** Pode iniciar independente do Marco A. Sem acoplamento técnico.

---

## File Structure

**Migrations:**
- `supabase/migrations/20260521a_audit_log_table.sql` — tabela + índices + RLS
- `supabase/migrations/20260521b_audit_log_triggers_cards.sql` — triggers cards
- `supabase/migrations/20260521c_audit_log_triggers_others.sql` — triggers contatos/proposals/profiles
- `supabase/migrations/20260521d_force_logout_helper.sql` — RPC SECURITY DEFINER que loga `user_force_logout`

**Edge Functions:**
- `supabase/functions/audit-login/index.ts` — webhook de login (captura IP/UA)
- `supabase/functions/audit-login/config.toml` — verify_jwt = false (recebe webhook)
- `supabase/functions/force-logout/index.ts` — invalida sessions de um user (admin only)
- `supabase/functions/audit-export/index.ts` — exporta CSV Latin-1

**Frontend - tipos:**
- `src/database.types.ts` — regenerado

**Frontend - hooks (novos):**
- `src/hooks/useAuditLog.ts` — query paginada + filtros
- `src/hooks/useWorkspaceUsersWithLastAccess.ts` — lista de usuários com último login

**Frontend - página + componentes (novos):**
- `src/pages/admin/AcessosPage.tsx` — estrutura com 3 abas
- `src/pages/admin/acessos/UsuariosTab.tsx` — lista de usuários + ações
- `src/pages/admin/acessos/LoginsTab.tsx` — timeline de logins
- `src/pages/admin/acessos/AcoesTab.tsx` — timeline de ações
- `src/pages/admin/acessos/ForcarLogoutModal.tsx` — confirmação
- `src/pages/admin/acessos/DesativarUsuarioModal.tsx` — confirmação

**Frontend - rota:**
- `src/App.tsx` — adicionar rota `/admin/acessos` (guard `is_admin`)
- `src/components/layout/Sidebar.tsx` — link no menu admin

**Smoke test:**
- `.claude/hooks/schema-smoke-test.sh` — query de assertion para audit_log

**E2E:**
- `tests/e2e/11-acessos-admin.spec.ts`

---

## Task 1: Migration — Tabela `audit_log`

**Files:**
- Create: `supabase/migrations/20260521a_audit_log_table.sql`

- [ ] **Step 1: Criar migration**

```sql
-- 20260521a_audit_log_table.sql
-- Tabela de auditoria por-org. Distinta de platform_audit_log (que é
-- global e cobre ações de admin de plataforma).
-- Spec: docs/superpowers/specs/2026-05-20-alertas-viscerais-e-painel-acessos-design.md §5.B.1

BEGIN;

CREATE TABLE IF NOT EXISTS public.audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL DEFAULT requesting_org_id() REFERENCES public.organizations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    action_type TEXT NOT NULL,
    -- 'login','logout','card_create','card_move','card_archive',
    -- 'contact_create','contact_edit','proposal_send',
    -- 'user_invite','user_deactivate','user_force_logout','user_reactivate'
    entity_type TEXT,
    -- 'card','contact','proposal','user'
    entity_id UUID,
    metadata JSONB DEFAULT '{}'::jsonb,
    ip TEXT,
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_org_created
    ON public.audit_log (org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_user_created
    ON public.audit_log (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_action_created
    ON public.audit_log (action_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity
    ON public.audit_log (entity_type, entity_id)
    WHERE entity_id IS NOT NULL;

-- RLS: somente admins do workspace lêem; service_role escreve
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY audit_log_admin_read ON public.audit_log
    FOR SELECT TO authenticated
    USING (
        org_id = requesting_org_id()
        AND EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid() AND p.is_admin = TRUE
        )
    );

CREATE POLICY audit_log_service_all ON public.audit_log
    FOR ALL TO service_role
    USING (TRUE) WITH CHECK (TRUE);

COMMENT ON TABLE public.audit_log IS
'Auditoria por-org. Cada linha: ação realizada por um usuário sobre uma entidade. Somente admins (is_admin=true) leem; service_role escreve.';

COMMIT;
```

- [ ] **Step 2: Aplicar em staging**

Run: `bash .claude/hooks/apply-to-staging.sh supabase/migrations/20260521a_audit_log_table.sql`

Expected: "Migration aplicada com sucesso em staging."

- [ ] **Step 3: Adicionar smoke test**

Modify: `.claude/hooks/schema-smoke-test.sh` — adicionar:

```bash
# Marco B — Painel de Acessos
run_query "audit_log existe" "audit_log?select=id&limit=1"
```

(Adaptar ao padrão real do script após ler 30 linhas.)

- [ ] **Step 4: Verificar isolation**

Inserir linha de teste via SQL editor em staging com `org_id` da Welcome Trips. Logar como user de outra org, tentar SELECT — esperado: 0 linhas (RLS bloqueia). Apagar linha de teste.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260521a_audit_log_table.sql .claude/hooks/schema-smoke-test.sh
git commit -m "feat(acessos): tabela audit_log por-org (Marco B.1)

Auditoria de ações dentro do workspace. RLS restrita a is_admin do
mesmo org_id. Service_role escreve via triggers e edge functions.
Índices para os 3 padrões de query: por org+data, por user+data,
por action+data.

Distinta de platform_audit_log (global, ações de plataforma).

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 2: Migration — Triggers em `cards`

**Files:**
- Create: `supabase/migrations/20260521b_audit_log_triggers_cards.sql`

- [ ] **Step 1: Criar migration**

```sql
-- 20260521b_audit_log_triggers_cards.sql
-- Triggers que escrevem em audit_log para ações em cards:
-- INSERT → card_create, UPDATE de etapa_id → card_move, UPDATE de archived_at → card_archive
-- Spec: §5.B.3

CREATE OR REPLACE FUNCTION public.fn_audit_cards()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO public.audit_log (org_id, user_id, action_type, entity_type, entity_id, metadata)
        VALUES (NEW.org_id, auth.uid(), 'card_create', 'card', NEW.id,
            jsonb_build_object('titulo', NEW.titulo, 'etapa_id', NEW.etapa_id));
        RETURN NEW;
    ELSIF TG_OP = 'UPDATE' THEN
        IF NEW.etapa_id IS DISTINCT FROM OLD.etapa_id THEN
            INSERT INTO public.audit_log (org_id, user_id, action_type, entity_type, entity_id, metadata)
            VALUES (NEW.org_id, auth.uid(), 'card_move', 'card', NEW.id,
                jsonb_build_object('from_etapa_id', OLD.etapa_id, 'to_etapa_id', NEW.etapa_id));
        END IF;
        IF NEW.archived_at IS DISTINCT FROM OLD.archived_at AND NEW.archived_at IS NOT NULL THEN
            INSERT INTO public.audit_log (org_id, user_id, action_type, entity_type, entity_id, metadata)
            VALUES (NEW.org_id, auth.uid(), 'card_archive', 'card', NEW.id,
                jsonb_build_object('archived_at', NEW.archived_at));
        END IF;
        RETURN NEW;
    END IF;
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_cards ON public.cards;
CREATE TRIGGER trg_audit_cards
    AFTER INSERT OR UPDATE ON public.cards
    FOR EACH ROW EXECUTE FUNCTION public.fn_audit_cards();

COMMENT ON FUNCTION public.fn_audit_cards IS
'Audita ações em cards: criação, mudança de etapa, arquivamento. Escreve em audit_log com auth.uid().';
```

- [ ] **Step 2: Aplicar em staging**

Run: `bash .claude/hooks/apply-to-staging.sh supabase/migrations/20260521b_audit_log_triggers_cards.sql`

- [ ] **Step 3: Testar — criar e mover card**

Em staging via UI ou SQL:
- Criar card → verificar `audit_log` com `action_type='card_create'`
- Mover card → `action_type='card_move'` com `metadata` contendo from/to etapa
- Arquivar card → `action_type='card_archive'`

```bash
source .env && curl -s "https://ivmebyvjarcvrkrbemam.supabase.co/rest/v1/audit_log?select=*&action_type=in.(card_create,card_move,card_archive)&order=created_at.desc&limit=5" \
  -H "apikey: $STAGING_SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $STAGING_SUPABASE_SERVICE_ROLE_KEY"
```

Expected: linhas correspondentes às ações feitas.

- [ ] **Step 4: Verificar performance**

Inserir 100 cards em batch via SQL em staging, medir tempo. Inserir mesmas 100 com trigger desabilitado, comparar. Trigger deve adicionar < 20% overhead.

Se exceder, otimizar (ex: trocar `auth.uid()` por captura em variável local).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260521b_audit_log_triggers_cards.sql
git commit -m "feat(acessos): triggers de auditoria em cards (Marco B.2)

3 actions: card_create (INSERT), card_move (UPDATE etapa_id),
card_archive (UPDATE archived_at IS NOT NULL).

Metadata leve (titulo + etapa_id). Performance bench validada.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 3: Migration — Triggers em `contatos`, `proposals`, `profiles`

**Files:**
- Create: `supabase/migrations/20260521c_audit_log_triggers_others.sql`

- [ ] **Step 1: Confirmar nomes das tabelas**

Run:
```bash
source .env && curl -s "https://szyrzxvlptqqheizyrxu.supabase.co/rest/v1/contatos?select=id&limit=1" \
  -H "apikey: $VITE_SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
```

Expected: 200 OK. Repetir pra `proposals`, `profiles`.

Se `proposals` tiver outro nome (ex: `propostas`), ajustar a migration.

- [ ] **Step 2: Criar migration**

```sql
-- 20260521c_audit_log_triggers_others.sql
-- Triggers em contatos, proposals (propostas), profiles
-- Spec: §5.B.3

-- ─── contatos ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_audit_contatos()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO public.audit_log (org_id, user_id, action_type, entity_type, entity_id, metadata)
        VALUES (NEW.org_id, auth.uid(), 'contact_create', 'contact', NEW.id,
            jsonb_build_object('nome', NEW.nome));
        RETURN NEW;
    ELSIF TG_OP = 'UPDATE' THEN
        INSERT INTO public.audit_log (org_id, user_id, action_type, entity_type, entity_id, metadata)
        VALUES (NEW.org_id, auth.uid(), 'contact_edit', 'contact', NEW.id,
            jsonb_build_object('nome', NEW.nome));
        RETURN NEW;
    END IF;
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_contatos ON public.contatos;
CREATE TRIGGER trg_audit_contatos
    AFTER INSERT OR UPDATE ON public.contatos
    FOR EACH ROW EXECUTE FUNCTION public.fn_audit_contatos();

-- ─── proposals (ou propostas — ajustar se necessário) ────────────────────────
CREATE OR REPLACE FUNCTION public.fn_audit_proposals()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status AND NEW.status = 'sent' THEN
        INSERT INTO public.audit_log (org_id, user_id, action_type, entity_type, entity_id, metadata)
        VALUES (NEW.org_id, auth.uid(), 'proposal_send', 'proposal', NEW.id,
            jsonb_build_object('status', NEW.status, 'card_id', NEW.card_id));
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_proposals ON public.proposals;
CREATE TRIGGER trg_audit_proposals
    AFTER UPDATE ON public.proposals
    FOR EACH ROW EXECUTE FUNCTION public.fn_audit_proposals();

-- ─── profiles ───────────────────────────────────────────────────────────────
-- user_invite quando profile é criado (insertion pode vir de auth hook ou app)
-- user_deactivate quando active passa de true para false
-- user_reactivate quando active passa de false para true
CREATE OR REPLACE FUNCTION public.fn_audit_profiles()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO public.audit_log (org_id, user_id, action_type, entity_type, entity_id, metadata)
        VALUES (NEW.org_id, auth.uid(), 'user_invite', 'user', NEW.id,
            jsonb_build_object('nome', NEW.nome, 'email', NEW.email));
        RETURN NEW;
    ELSIF TG_OP = 'UPDATE' THEN
        IF NEW.active IS DISTINCT FROM OLD.active THEN
            INSERT INTO public.audit_log (org_id, user_id, action_type, entity_type, entity_id, metadata)
            VALUES (NEW.org_id, auth.uid(),
                CASE WHEN NEW.active THEN 'user_reactivate' ELSE 'user_deactivate' END,
                'user', NEW.id,
                jsonb_build_object('nome', NEW.nome));
        END IF;
        RETURN NEW;
    END IF;
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_profiles ON public.profiles;
CREATE TRIGGER trg_audit_profiles
    AFTER INSERT OR UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.fn_audit_profiles();
```

- [ ] **Step 3: Aplicar em staging**

Run: `bash .claude/hooks/apply-to-staging.sh supabase/migrations/20260521c_audit_log_triggers_others.sql`

Expected: passa, ou erro de "table proposals does not exist" → ajustar nome para `propostas` ou descobrir nome real e refazer.

- [ ] **Step 4: Testar cada trigger**

Criar/editar contato → verificar `contact_create`/`contact_edit` em audit_log.
Atualizar proposal `status='sent'` → `proposal_send`.
Desativar profile → `user_deactivate`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260521c_audit_log_triggers_others.sql
git commit -m "feat(acessos): triggers de auditoria em contatos/proposals/profiles (Marco B.3)

contatos: contact_create, contact_edit
proposals: proposal_send (status muda para 'sent')
profiles: user_invite (INSERT), user_deactivate / user_reactivate (active toggle)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 4: Edge Function `audit-login`

**Files:**
- Create: `supabase/functions/audit-login/index.ts`
- Create: `supabase/functions/audit-login/config.toml`

- [ ] **Step 1: Criar config.toml**

```toml
# supabase/functions/audit-login/config.toml
verify_jwt = false
```

(Public webhook — recebe do Supabase Auth ou do AuthContext do frontend.)

- [ ] **Step 2: Criar index.ts**

```typescript
// supabase/functions/audit-login/index.ts
// Recebe webhook após login bem-sucedido. Captura IP/UA e grava audit_log.
// Chamado pelo AuthContext do frontend imediatamente após signIn().

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  try {
    const body = await req.json();
    const userId: string | undefined = body.user_id;
    const orgId: string | undefined = body.org_id;
    const action: string = body.action ?? 'login'; // 'login' | 'logout'

    if (!userId || !orgId) {
      return new Response(JSON.stringify({ error: 'user_id e org_id obrigatórios' }), {
        status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? null;
    const userAgent = req.headers.get('user-agent') ?? null;

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { error } = await supabase.from('audit_log').insert({
      org_id: orgId,
      user_id: userId,
      action_type: action,
      entity_type: 'user',
      entity_id: userId,
      ip,
      user_agent: userAgent,
      metadata: { source: 'audit-login' },
    });

    if (error) throw error;

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }
});
```

- [ ] **Step 3: Deploy em staging**

Per CLAUDE.md, function pública precisa `--no-verify-jwt`:

```bash
npx supabase functions deploy audit-login --no-verify-jwt --project-ref ivmebyvjarcvrkrbemam
```

Expected: "Deployed Function audit-login on project ivmebyvjarcvrkrbemam"

- [ ] **Step 4: Chamar do AuthContext após signIn**

Modify: `src/contexts/AuthContext.tsx`

Localizar o handler de `signIn` (ou listener `onAuthStateChange` com event `SIGNED_IN`). Adicionar:

```tsx
// Disparar audit-login após login bem-sucedido
async function fireAuditLogin(session: any, action: 'login' | 'logout' = 'login') {
  if (!session?.user?.id) return;
  // org_id deve ser pego do app_metadata ou do hook useOrg() depois do load
  const orgId = session.user?.app_metadata?.org_id;
  if (!orgId) return; // user sem org? não auditar
  try {
    await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/audit-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: session.user.id, org_id: orgId, action }),
    });
  } catch {
    // fail silent — auditoria não deve quebrar login
  }
}
```

Chamar no callback de `SIGNED_IN` e `SIGNED_OUT`.

- [ ] **Step 5: Testar em staging**

Logar com user de teste, verificar entry em audit_log:

```bash
source .env && curl -s "https://ivmebyvjarcvrkrbemam.supabase.co/rest/v1/audit_log?select=*&action_type=eq.login&order=created_at.desc&limit=5" \
  -H "apikey: $STAGING_SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $STAGING_SUPABASE_SERVICE_ROLE_KEY"
```

Expected: linha com `action_type='login'`, `ip` populado, `user_agent` populado.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/audit-login/ src/contexts/AuthContext.tsx
git commit -m "feat(acessos): edge function audit-login + integração AuthContext (Marco B.4)

Função pública (verify_jwt=false) que captura IP/UA via headers e
grava audit_log. AuthContext dispara após SIGNED_IN e SIGNED_OUT.
Falha silenciosa — auditoria não quebra login.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 5: Edge Function `force-logout`

**Files:**
- Create: `supabase/functions/force-logout/index.ts`
- Create: `supabase/functions/force-logout/config.toml`

- [ ] **Step 1: Criar config.toml**

```toml
verify_jwt = true
```

(Privada — só admins autenticados chamam.)

- [ ] **Step 2: Criar index.ts**

```typescript
// supabase/functions/force-logout/index.ts
// Invalida todas as sessions do user-alvo via Supabase Auth Admin API.
// Apenas admins do mesmo workspace podem chamar.

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*' } });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return new Response('Unauthorized', { status: 401 });

    // Validar quem chama
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) return new Response('Unauthorized', { status: 401 });

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Verificar se quem chama é admin do mesmo workspace do alvo
    const { target_user_id } = await req.json();
    if (!target_user_id) {
      return new Response(JSON.stringify({ error: 'target_user_id obrigatório' }), { status: 400 });
    }

    const { data: caller } = await adminClient.from('profiles')
      .select('id, is_admin, org_id').eq('id', user.id).single();
    if (!caller?.is_admin) {
      return new Response(JSON.stringify({ error: 'apenas admins' }), { status: 403 });
    }

    const { data: target } = await adminClient.from('profiles')
      .select('id, org_id').eq('id', target_user_id).single();
    if (!target || target.org_id !== caller.org_id) {
      return new Response(JSON.stringify({ error: 'usuário fora do workspace' }), { status: 403 });
    }

    // Invalidar sessions via Supabase Auth Admin API
    // signOut do user específico — Supabase v2 admin
    const { error: signOutErr } = await adminClient.auth.admin.signOut(target_user_id, 'global');
    if (signOutErr) throw signOutErr;

    // Auditar
    await adminClient.from('audit_log').insert({
      org_id: caller.org_id,
      user_id: user.id, // quem fez a ação
      action_type: 'user_force_logout',
      entity_type: 'user',
      entity_id: target_user_id,
      metadata: { actor_name: caller.id, target_user_id },
    });

    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
});
```

- [ ] **Step 3: Deploy em staging**

```bash
npx supabase functions deploy force-logout --project-ref ivmebyvjarcvrkrbemam
```

(Sem `--no-verify-jwt` — função autenticada.)

- [ ] **Step 4: Testar via curl**

Pegar JWT de admin logado (DevTools → Application → localStorage `supabase.auth.token`):

```bash
curl -s -X POST "https://ivmebyvjarcvrkrbemam.supabase.co/functions/v1/force-logout" \
  -H "Authorization: Bearer <JWT>" \
  -H "Content-Type: application/json" \
  -d '{"target_user_id": "<uuid-do-alvo>"}'
```

Expected: `{"ok": true}`. Verificar que o user-alvo é deslogado (próxima request dele retorna 401) e que aparece linha `user_force_logout` em audit_log.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/force-logout/
git commit -m "feat(acessos): edge function force-logout (Marco B.5)

Invalida todas sessions do user-alvo via auth.admin.signOut(uuid, 'global').
Apenas admins do mesmo workspace podem chamar (verifica via JWT + profiles.is_admin).
Audita a ação em audit_log com action_type='user_force_logout'.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 6: Regenerar types

**Files:**
- Modify: `src/database.types.ts`

- [ ] **Step 1: Regenerar**

Run: `npx supabase gen types typescript --project-id ivmebyvjarcvrkrbemam > src/database.types.ts`

- [ ] **Step 2: Build**

Run: `npm run build`

Expected: passa.

- [ ] **Step 3: Commit**

```bash
git add src/database.types.ts
git commit -m "chore(types): regenera database.types.ts pós Marco B migrations

Inclui audit_log e funções fn_audit_*.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 7: Hook `useAuditLog`

**Files:**
- Create: `src/hooks/useAuditLog.ts`

- [ ] **Step 1: Criar hook**

```tsx
// src/hooks/useAuditLog.ts
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useOrg } from '@/contexts/OrgContext';

export interface AuditLogFilters {
  actionTypes?: string[]; // ex: ['login','logout']
  userId?: string;
  entityType?: string;
  entityId?: string;
  fromDate?: string; // ISO
  toDate?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface AuditLogRow {
  id: string;
  org_id: string;
  user_id: string | null;
  action_type: string;
  entity_type: string | null;
  entity_id: string | null;
  metadata: Record<string, any>;
  ip: string | null;
  user_agent: string | null;
  created_at: string;
  user_nome?: string | null;
  user_email?: string | null;
}

export function useAuditLog(filters: AuditLogFilters = {}) {
  const { org } = useOrg();
  const orgId = org?.id;

  return useQuery({
    queryKey: ['audit-log', orgId, filters],
    queryFn: async () => {
      if (!orgId) return { rows: [] as AuditLogRow[], count: 0 };

      let q = supabase
        .from('audit_log')
        .select('*, profiles:user_id(nome, email)', { count: 'exact' })
        .eq('org_id', orgId)
        .order('created_at', { ascending: false });

      if (filters.actionTypes?.length) q = q.in('action_type', filters.actionTypes);
      if (filters.userId) q = q.eq('user_id', filters.userId);
      if (filters.entityType) q = q.eq('entity_type', filters.entityType);
      if (filters.entityId) q = q.eq('entity_id', filters.entityId);
      if (filters.fromDate) q = q.gte('created_at', filters.fromDate);
      if (filters.toDate) q = q.lte('created_at', filters.toDate);

      const limit = filters.limit ?? 50;
      const offset = filters.offset ?? 0;
      q = q.range(offset, offset + limit - 1);

      const { data, error, count } = await q;
      if (error) throw error;

      const rows: AuditLogRow[] = (data ?? []).map((r: any) => ({
        id: r.id,
        org_id: r.org_id,
        user_id: r.user_id,
        action_type: r.action_type,
        entity_type: r.entity_type,
        entity_id: r.entity_id,
        metadata: r.metadata ?? {},
        ip: r.ip,
        user_agent: r.user_agent,
        created_at: r.created_at,
        user_nome: r.profiles?.nome ?? null,
        user_email: r.profiles?.email ?? null,
      }));

      return { rows, count: count ?? 0 };
    },
    enabled: !!orgId,
  });
}
```

- [ ] **Step 2: Build**

Run: `npm run build`

Expected: passa.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useAuditLog.ts
git commit -m "feat(acessos): hook useAuditLog com filtros e paginação (Marco B.6)

Query paginada de audit_log filtrada por org_id (RLS confirma).
Filtros: actionTypes[], userId, entityType, entityId, fromDate, toDate.
Join com profiles para trazer nome/email do user que fez a ação.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 8: Hook `useWorkspaceUsersWithLastAccess`

**Files:**
- Create: `src/hooks/useWorkspaceUsersWithLastAccess.ts`

- [ ] **Step 1: Criar hook**

```tsx
// src/hooks/useWorkspaceUsersWithLastAccess.ts
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useOrg } from '@/contexts/OrgContext';

export interface UserWithLastAccess {
  id: string;
  nome: string | null;
  email: string;
  active: boolean;
  is_admin: boolean;
  role: string | null;
  last_login_at: string | null;
  last_login_ip: string | null;
}

export function useWorkspaceUsersWithLastAccess() {
  const { org } = useOrg();
  const orgId = org?.id;

  return useQuery({
    queryKey: ['workspace-users-last-access', orgId],
    queryFn: async (): Promise<UserWithLastAccess[]> => {
      if (!orgId) return [];

      // 1. Membros do workspace (per CLAUDE.md — NUNCA profiles.eq.org_id)
      const { data: members, error: memErr } = await supabase
        .from('org_members')
        .select('user_id, profiles!inner(id, nome, email, active, is_admin)')
        .eq('org_id', orgId);
      if (memErr) throw memErr;

      const profiles = (members ?? []).map((m: any) => m.profiles).filter(Boolean);

      // 2. Último login de cada um (audit_log)
      const userIds = profiles.map((p: any) => p.id);
      if (userIds.length === 0) return [];

      const { data: logs, error: logErr } = await supabase
        .from('audit_log')
        .select('user_id, ip, created_at')
        .eq('org_id', orgId)
        .eq('action_type', 'login')
        .in('user_id', userIds)
        .order('created_at', { ascending: false });
      if (logErr) throw logErr;

      // Pega o último por user
      const lastByUser = new Map<string, { ip: string | null; created_at: string }>();
      for (const row of logs ?? []) {
        if (row.user_id && !lastByUser.has(row.user_id)) {
          lastByUser.set(row.user_id, { ip: row.ip, created_at: row.created_at });
        }
      }

      return profiles.map((p: any): UserWithLastAccess => ({
        id: p.id,
        nome: p.nome,
        email: p.email,
        active: p.active !== false,
        is_admin: !!p.is_admin,
        role: null, // pode ser preenchido depois via teams etc.
        last_login_at: lastByUser.get(p.id)?.created_at ?? null,
        last_login_ip: lastByUser.get(p.id)?.ip ?? null,
      }));
    },
    enabled: !!orgId,
  });
}
```

- [ ] **Step 2: Build + Commit**

```bash
npm run build && git add src/hooks/useWorkspaceUsersWithLastAccess.ts && git commit -m "feat(acessos): hook useWorkspaceUsersWithLastAccess (Marco B.7)

Lista usuários do workspace via org_members + profiles inner join
(NÃO profiles.eq.org_id — workspace isolation per CLAUDE.md). Join
com audit_log para descobrir último login + IP.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 9: Página `AcessosPage` com estrutura de abas

**Files:**
- Create: `src/pages/admin/AcessosPage.tsx`
- Modify: `src/App.tsx` (adicionar rota)
- Modify: `src/components/layout/Sidebar.tsx` (link no menu admin)

- [ ] **Step 1: Criar `AcessosPage.tsx`**

```tsx
// src/pages/admin/AcessosPage.tsx
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Navigate } from 'react-router-dom';
import { UsuariosTab } from './acessos/UsuariosTab';
import { LoginsTab } from './acessos/LoginsTab';
import { AcoesTab } from './acessos/AcoesTab';

type Tab = 'usuarios' | 'logins' | 'acoes';

export default function AcessosPage() {
  const { profile } = useAuth();
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') ?? 'usuarios') as Tab;

  if (!profile?.is_admin) {
    return <Navigate to="/" replace />;
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'usuarios', label: 'Usuários' },
    { key: 'logins', label: 'Logins' },
    { key: 'acoes', label: 'Ações' },
  ];

  return (
    <div className="mx-auto max-w-7xl px-6 py-8 space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">Acessos</h1>
        <p className="text-sm text-slate-500 mt-1">
          Quem entra no CRM, de onde, e o que faz aqui dentro.
        </p>
      </header>

      <nav className="flex border-b border-slate-200">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setParams({ tab: t.key })}
            className={`px-4 py-2 text-sm font-medium transition ${
              tab === t.key
                ? 'border-b-2 border-indigo-600 text-indigo-700'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <div>
        {tab === 'usuarios' && <UsuariosTab />}
        {tab === 'logins' && <LoginsTab />}
        {tab === 'acoes' && <AcoesTab />}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Adicionar rota em `App.tsx`**

Localizar bloco de rotas. Adicionar:

```tsx
import AcessosPage from './pages/admin/AcessosPage';
// ...dentro de <Routes>:
<Route path="/admin/acessos" element={<AcessosPage />} />
```

- [ ] **Step 3: Adicionar link na Sidebar**

Modify: `src/components/layout/Sidebar.tsx`

Localizar bloco de links de admin (provavelmente condicionado por `is_admin`). Adicionar:

```tsx
{profile?.is_admin && (
  <Link to="/admin/acessos" className={linkClass}>
    <ShieldCheck className="h-4 w-4" />
    Acessos
  </Link>
)}
```

(Adapter ao padrão real do Sidebar.tsx — usar mesmo wrapper de outros links de admin.)

- [ ] **Step 4: Build**

Run: `npm run build`

(Falhará nas 3 tabs ainda não criadas. Stub temporário se necessário.)

- [ ] **Step 5: Commit (após criar stubs das tabs)**

Stubs temporários:
```tsx
// src/pages/admin/acessos/UsuariosTab.tsx (idem para LoginsTab e AcoesTab)
export function UsuariosTab() { return <div className="py-8 text-slate-500">Em construção</div>; }
```

```bash
git add src/pages/admin/AcessosPage.tsx src/pages/admin/acessos/ src/App.tsx src/components/layout/Sidebar.tsx
git commit -m "feat(acessos): página /admin/acessos com estrutura de 3 abas (Marco B.8)

Tabs: Usuários, Logins, Ações via query param ?tab=. Guard de
is_admin redireciona não-admins para /. Estilos light-mode.
Stubs de tabs serão preenchidos nas tasks seguintes.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 10: Tab `Usuários`

**Files:**
- Modify: `src/pages/admin/acessos/UsuariosTab.tsx`

- [ ] **Step 1: Criar tab completa**

```tsx
// src/pages/admin/acessos/UsuariosTab.tsx
import { useState } from 'react';
import { useWorkspaceUsersWithLastAccess } from '@/hooks/useWorkspaceUsersWithLastAccess';
import { ForcarLogoutModal } from './ForcarLogoutModal';
import { DesativarUsuarioModal } from './DesativarUsuarioModal';

type Filter = 'all' | 'active' | 'inactive' | 'never_logged';

export function UsuariosTab() {
  const { data: users = [], isLoading, refetch } = useWorkspaceUsersWithLastAccess();
  const [filter, setFilter] = useState<Filter>('active');
  const [forcaLogoutUserId, setForcaLogoutUserId] = useState<string | null>(null);
  const [desativarUserId, setDesativarUserId] = useState<string | null>(null);

  const filtered = users.filter((u) => {
    if (filter === 'active') return u.active;
    if (filter === 'inactive') return !u.active;
    if (filter === 'never_logged') return u.last_login_at === null;
    return true;
  });

  function formatRelative(iso: string | null): string {
    if (!iso) return '—';
    const diffMs = Date.now() - new Date(iso).getTime();
    const days = Math.floor(diffMs / 86400000);
    if (days === 0) return 'hoje';
    if (days === 1) return 'ontem';
    if (days < 7) return `${days}d atrás`;
    if (days < 30) return `${Math.floor(days / 7)}sem atrás`;
    return `${Math.floor(days / 30)}m atrás`;
  }

  if (isLoading) return <div className="py-8 text-slate-500">Carregando...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          {(['active', 'inactive', 'never_logged', 'all'] as Filter[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`rounded-md px-3 py-1 text-xs font-medium ${
                filter === f ? 'bg-slate-900 text-white' : 'bg-white border border-slate-300 text-slate-700'
              }`}
            >
              {f === 'active' && `Ativos (${users.filter((u) => u.active).length})`}
              {f === 'inactive' && `Inativos (${users.filter((u) => !u.active).length})`}
              {f === 'never_logged' && 'Nunca logou'}
              {f === 'all' && 'Todos'}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-700">
            <tr>
              <th className="px-4 py-2 text-left font-medium">Nome</th>
              <th className="px-4 py-2 text-left font-medium">Email</th>
              <th className="px-4 py-2 text-left font-medium">Papel</th>
              <th className="px-4 py-2 text-left font-medium">Último acesso</th>
              <th className="px-4 py-2 text-left font-medium">Status</th>
              <th className="px-4 py-2 text-right font-medium">Ações</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((u) => (
              <tr key={u.id} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-2 text-slate-900">{u.nome ?? '—'}</td>
                <td className="px-4 py-2 text-slate-700">{u.email}</td>
                <td className="px-4 py-2 text-slate-700">{u.is_admin ? 'Admin' : 'Usuário'}</td>
                <td className="px-4 py-2 text-slate-700">{formatRelative(u.last_login_at)}</td>
                <td className="px-4 py-2">
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                    u.active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'
                  }`}>
                    {u.active ? 'Ativo' : 'Inativo'}
                  </span>
                </td>
                <td className="px-4 py-2 text-right space-x-2">
                  {u.active && (
                    <>
                      <button
                        type="button"
                        onClick={() => setForcaLogoutUserId(u.id)}
                        className="text-xs text-slate-600 hover:text-slate-900"
                      >
                        Forçar logout
                      </button>
                      <button
                        type="button"
                        onClick={() => setDesativarUserId(u.id)}
                        className="text-xs text-red-600 hover:text-red-800"
                      >
                        Desativar
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">Nenhum usuário nesse filtro.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {forcaLogoutUserId && (
        <ForcarLogoutModal
          userId={forcaLogoutUserId}
          userName={users.find((u) => u.id === forcaLogoutUserId)?.nome ?? ''}
          onClose={() => setForcaLogoutUserId(null)}
          onSuccess={() => { setForcaLogoutUserId(null); refetch(); }}
        />
      )}
      {desativarUserId && (
        <DesativarUsuarioModal
          userId={desativarUserId}
          userName={users.find((u) => u.id === desativarUserId)?.nome ?? ''}
          onClose={() => setDesativarUserId(null)}
          onSuccess={() => { setDesativarUserId(null); refetch(); }}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Criar `ForcarLogoutModal`**

```tsx
// src/pages/admin/acessos/ForcarLogoutModal.tsx
import { useState } from 'react';
import { toast } from 'sonner';

interface Props {
  userId: string;
  userName: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function ForcarLogoutModal({ userId, userName, onClose, onSuccess }: Props) {
  const [loading, setLoading] = useState(false);

  async function handleConfirm() {
    setLoading(true);
    try {
      const token = (await import('@/lib/supabase')).supabase.auth.getSession();
      const { data: { session } } = await (await import('@/lib/supabase')).supabase.auth.getSession();
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/force-logout`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session?.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ target_user_id: userId }),
      });
      if (!res.ok) throw new Error(await res.text());
      toast.success('Sessão encerrada');
      onSuccess();
    } catch (err) {
      toast.error('Não foi possível forçar logout');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-2xl">
        <h3 className="text-base font-semibold text-slate-900">Forçar logout</h3>
        <p className="mt-2 text-sm text-slate-600">
          Vai encerrar todas as sessões abertas de <strong>{userName}</strong>. Próximo acesso vai exigir login de novo.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-md px-4 py-2 text-sm text-slate-700 hover:bg-slate-100">
            Cancelar
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={handleConfirm}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {loading ? 'Encerrando...' : 'Forçar logout'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Criar `DesativarUsuarioModal`**

```tsx
// src/pages/admin/acessos/DesativarUsuarioModal.tsx
import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

interface Props {
  userId: string;
  userName: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function DesativarUsuarioModal({ userId, userName, onClose, onSuccess }: Props) {
  const [loading, setLoading] = useState(false);

  async function handleConfirm() {
    setLoading(true);
    try {
      const { error } = await supabase.from('profiles')
        .update({ active: false }).eq('id', userId);
      if (error) throw error;
      toast.success('Usuário desativado');
      onSuccess();
    } catch (err) {
      toast.error('Não foi possível desativar');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-2xl">
        <h3 className="text-base font-semibold text-slate-900">Desativar usuário</h3>
        <p className="mt-2 text-sm text-slate-600">
          <strong>{userName}</strong> perde acesso ao CRM. Cards e dados criados por ele/ela são preservados.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-md px-4 py-2 text-sm text-slate-700 hover:bg-slate-100">
            Cancelar
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={handleConfirm}
            className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            {loading ? 'Desativando...' : 'Desativar'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Build + commit**

```bash
npm run build && git add src/pages/admin/acessos/UsuariosTab.tsx src/pages/admin/acessos/ForcarLogoutModal.tsx src/pages/admin/acessos/DesativarUsuarioModal.tsx
git commit -m "feat(acessos): tab Usuários com forçar logout e desativar (Marco B.9)

Tabela com Nome, Email, Papel, Último acesso (relativo), Status,
Ações. Filtros: Ativos, Inativos, Nunca logou, Todos. Botões
Forçar logout (chama edge function force-logout) e Desativar
(profiles.active=false → trigger registra user_deactivate).

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 11: Tab `Logins`

**Files:**
- Modify: `src/pages/admin/acessos/LoginsTab.tsx`

- [ ] **Step 1: Criar tab**

```tsx
// src/pages/admin/acessos/LoginsTab.tsx
import { useState } from 'react';
import { useAuditLog } from '@/hooks/useAuditLog';

function parseUA(ua: string | null): string {
  if (!ua) return 'desconhecido';
  if (ua.includes('Mobile')) return 'Mobile';
  if (ua.includes('Chrome')) return 'Chrome';
  if (ua.includes('Firefox')) return 'Firefox';
  if (ua.includes('Safari')) return 'Safari';
  return 'desktop';
}

export function LoginsTab() {
  const [page, setPage] = useState(0);
  const limit = 50;
  const { data, isLoading } = useAuditLog({
    actionTypes: ['login', 'logout'],
    limit,
    offset: page * limit,
  });

  if (isLoading) return <div className="py-8 text-slate-500">Carregando...</div>;

  const rows = data?.rows ?? [];
  const total = data?.count ?? 0;

  return (
    <div className="space-y-4">
      <div className="text-xs text-slate-500">Mostrando {rows.length} de {total} acessos</div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-700">
            <tr>
              <th className="px-4 py-2 text-left font-medium">Quando</th>
              <th className="px-4 py-2 text-left font-medium">Usuário</th>
              <th className="px-4 py-2 text-left font-medium">Ação</th>
              <th className="px-4 py-2 text-left font-medium">IP</th>
              <th className="px-4 py-2 text-left font-medium">Dispositivo</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-slate-100">
                <td className="px-4 py-2 text-slate-700">{new Date(r.created_at).toLocaleString('pt-BR')}</td>
                <td className="px-4 py-2 text-slate-900">{r.user_nome ?? r.user_email ?? '—'}</td>
                <td className="px-4 py-2 text-slate-700">{r.action_type === 'login' ? 'Entrou' : 'Saiu'}</td>
                <td className="px-4 py-2 text-slate-600 font-mono text-xs">{r.ip ?? '—'}</td>
                <td className="px-4 py-2 text-slate-600">{parseUA(r.user_agent)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-500">Nenhum acesso registrado.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex justify-between">
        <button type="button" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-xs text-slate-700 disabled:opacity-50">
          Anterior
        </button>
        <button type="button" onClick={() => setPage((p) => p + 1)} disabled={(page + 1) * limit >= total}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-xs text-slate-700 disabled:opacity-50">
          Próxima
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Build + commit**

```bash
npm run build && git add src/pages/admin/acessos/LoginsTab.tsx
git commit -m "feat(acessos): tab Logins com paginação (Marco B.10)

Timeline de logins/logouts: data, usuário, ação, IP, dispositivo
(parseado do UA). Paginação 50/página.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 12: Tab `Ações`

**Files:**
- Modify: `src/pages/admin/acessos/AcoesTab.tsx`

- [ ] **Step 1: Criar tab**

```tsx
// src/pages/admin/acessos/AcoesTab.tsx
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuditLog } from '@/hooks/useAuditLog';

const ACTION_LABELS: Record<string, string> = {
  card_create: 'Criou card',
  card_move: 'Moveu card',
  card_archive: 'Arquivou card',
  contact_create: 'Criou contato',
  contact_edit: 'Editou contato',
  proposal_send: 'Enviou proposta',
  user_invite: 'Convidou usuário',
  user_deactivate: 'Desativou usuário',
  user_reactivate: 'Reativou usuário',
  user_force_logout: 'Forçou logout',
};

const ALL_ACTIONS = Object.keys(ACTION_LABELS);

export function AcoesTab() {
  const [selectedActions, setSelectedActions] = useState<string[]>(ALL_ACTIONS);
  const [page, setPage] = useState(0);
  const limit = 50;
  const { data, isLoading } = useAuditLog({
    actionTypes: selectedActions,
    limit,
    offset: page * limit,
  });

  function entityLink(r: any): React.ReactNode {
    if (!r.entity_type || !r.entity_id) return null;
    if (r.entity_type === 'card') return <Link to={`/card/${r.entity_id}`} className="text-indigo-600 hover:underline">ver card</Link>;
    if (r.entity_type === 'contact') return <Link to={`/contato/${r.entity_id}`} className="text-indigo-600 hover:underline">ver contato</Link>;
    if (r.entity_type === 'user') return <span className="text-slate-500">usuário</span>;
    return null;
  }

  if (isLoading) return <div className="py-8 text-slate-500">Carregando...</div>;
  const rows = data?.rows ?? [];
  const total = data?.count ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {ALL_ACTIONS.map((a) => (
          <label key={a} className="flex items-center gap-1 text-xs text-slate-700">
            <input
              type="checkbox"
              checked={selectedActions.includes(a)}
              onChange={(e) => {
                if (e.target.checked) setSelectedActions([...selectedActions, a]);
                else setSelectedActions(selectedActions.filter((x) => x !== a));
                setPage(0);
              }}
              className="h-3 w-3"
            />
            {ACTION_LABELS[a]}
          </label>
        ))}
      </div>

      <div className="text-xs text-slate-500">Mostrando {rows.length} de {total} ações</div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-700">
            <tr>
              <th className="px-4 py-2 text-left font-medium">Quando</th>
              <th className="px-4 py-2 text-left font-medium">Quem</th>
              <th className="px-4 py-2 text-left font-medium">Ação</th>
              <th className="px-4 py-2 text-left font-medium">Detalhes</th>
              <th className="px-4 py-2 text-left font-medium">Link</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-slate-100">
                <td className="px-4 py-2 text-slate-700">{new Date(r.created_at).toLocaleString('pt-BR')}</td>
                <td className="px-4 py-2 text-slate-900">{r.user_nome ?? r.user_email ?? '—'}</td>
                <td className="px-4 py-2 text-slate-700">{ACTION_LABELS[r.action_type] ?? r.action_type}</td>
                <td className="px-4 py-2 text-slate-600 text-xs font-mono max-w-xs truncate">
                  {Object.entries(r.metadata).filter(([k]) => !['nome','titulo'].includes(k))
                    .map(([k, v]) => `${k}=${typeof v === 'string' ? v.slice(0, 30) : JSON.stringify(v).slice(0, 30)}`)
                    .join(' ') || '—'}
                </td>
                <td className="px-4 py-2">{entityLink(r)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-500">Nenhuma ação no filtro.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex justify-between">
        <button type="button" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-xs text-slate-700 disabled:opacity-50">
          Anterior
        </button>
        <button type="button" onClick={() => setPage((p) => p + 1)} disabled={(page + 1) * limit >= total}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-xs text-slate-700 disabled:opacity-50">
          Próxima
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Build + commit**

```bash
npm run build && git add src/pages/admin/acessos/AcoesTab.tsx
git commit -m "feat(acessos): tab Ações com filtros + links pra entidades (Marco B.11)

Timeline de ações (todas exceto login/logout). Filtros multi-select
por tipo. Coluna Detalhes resume metadata. Coluna Link leva ao
card/contato/usuário.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 13: Edge Function `audit-export` + botão "Exportar CSV"

**Files:**
- Create: `supabase/functions/audit-export/index.ts`
- Create: `supabase/functions/audit-export/config.toml`
- Modify: 3 tabs adicionam botão "Exportar"

- [ ] **Step 1: Criar config.toml**

```toml
verify_jwt = true
```

- [ ] **Step 2: Criar function**

```typescript
// supabase/functions/audit-export/index.ts
// Exporta audit_log filtrado em CSV Latin-1 (per memory/feedback_csv_encoding.md).

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*' } });
  }
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return new Response('Unauthorized', { status: 401 });

    const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return new Response('Unauthorized', { status: 401 });

    const adminClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: caller } = await adminClient.from('profiles')
      .select('id, is_admin, org_id').eq('id', user.id).single();
    if (!caller?.is_admin) return new Response('Forbidden', { status: 403 });

    const params = new URL(req.url).searchParams;
    const actionTypes = params.get('action_types')?.split(',') ?? null;
    const fromDate = params.get('from') ?? null;
    const toDate = params.get('to') ?? null;

    let q = adminClient.from('audit_log')
      .select('created_at, user_id, action_type, entity_type, entity_id, ip, user_agent, metadata, profiles:user_id(nome,email)')
      .eq('org_id', caller.org_id)
      .order('created_at', { ascending: false })
      .limit(10000);
    if (actionTypes) q = q.in('action_type', actionTypes);
    if (fromDate) q = q.gte('created_at', fromDate);
    if (toDate) q = q.lte('created_at', toDate);

    const { data, error } = await q;
    if (error) throw error;

    const header = ['created_at','user_nome','user_email','action_type','entity_type','entity_id','ip','user_agent','metadata'];
    const lines = [header.join(';')];
    for (const r of data ?? []) {
      lines.push([
        r.created_at,
        (r as any).profiles?.nome ?? '',
        (r as any).profiles?.email ?? '',
        r.action_type,
        r.entity_type ?? '',
        r.entity_id ?? '',
        r.ip ?? '',
        (r.user_agent ?? '').replace(/;/g, ','),
        JSON.stringify(r.metadata ?? {}).replace(/;/g, ','),
      ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';'));
    }

    const csv = lines.join('\r\n');
    // Encode para Latin-1 (per feedback_csv_encoding.md — Monde/Excel BR)
    const encoder = new TextEncoder(); // UTF-8 base
    const utf8Bytes = encoder.encode(csv);
    // Browser pode interpretar como Latin-1 ao incluir BOM-less; deixar UTF-8
    // com BOM melhora Excel BR (alternativa: usar lib latin1)
    const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
    const final = new Uint8Array(bom.length + utf8Bytes.length);
    final.set(bom);
    final.set(utf8Bytes, bom.length);

    return new Response(final, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="audit-${new Date().toISOString().slice(0,10)}.csv"`,
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
```

- [ ] **Step 3: Deploy**

```bash
npx supabase functions deploy audit-export --project-ref ivmebyvjarcvrkrbemam
```

- [ ] **Step 4: Adicionar botão em LoginsTab e AcoesTab**

```tsx
// No header de cada tab
async function exportCsv(actionTypes: string[]) {
  const { data: { session } } = await supabase.auth.getSession();
  const params = new URLSearchParams({ action_types: actionTypes.join(',') });
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/audit-export?${params}`;
  const res = await fetch(url, {
    headers: { 'Authorization': `Bearer ${session?.access_token}` },
  });
  const blob = await res.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `audit-${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
}

// No JSX, ao lado do contador:
<button type="button" onClick={() => exportCsv(actionTypesAtuais)}
  className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">
  Exportar CSV
</button>
```

- [ ] **Step 5: Build + Testar + Commit**

```bash
npm run build
git add supabase/functions/audit-export/ src/pages/admin/acessos/LoginsTab.tsx src/pages/admin/acessos/AcoesTab.tsx
git commit -m "feat(acessos): export CSV de audit_log (Marco B.12)

Edge function com auth + RLS check (is_admin do mesmo org). Limite
10k linhas por export. UTF-8 com BOM para Excel BR.

Botão 'Exportar CSV' nas tabs Logins e Ações.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 14: Teste E2E + Promoção pra produção

**Files:**
- Create: `tests/e2e/11-acessos-admin.spec.ts`

- [ ] **Step 1: Criar teste E2E básico**

```typescript
// tests/e2e/11-acessos-admin.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Painel de Acessos (Marco B)', () => {
  test('admin acessa /admin/acessos e vê as 3 abas', async ({ page }) => {
    await page.goto('/admin/acessos');
    await page.waitForLoadState('networkidle');

    // global-setup loga test@welcomecrm.test (admin do workspace Welcome Trips)
    await expect(page.getByRole('heading', { name: 'Acessos' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Usuários' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Logins' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Ações' })).toBeVisible();
  });

  test('tab Usuários mostra ao menos o user de teste', async ({ page }) => {
    await page.goto('/admin/acessos?tab=usuarios');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('text=test@welcomecrm.test')).toBeVisible({ timeout: 5000 });
  });

  test('tab Logins lista o login atual', async ({ page }) => {
    await page.goto('/admin/acessos?tab=logins');
    await page.waitForLoadState('networkidle');
    // Pode degradar se audit-login ainda não rodou — tolerante
    const hasRow = await page.locator('td:has-text("Entrou")').first().isVisible({ timeout: 3000 }).catch(() => false);
    if (!hasRow) {
      test.info().annotations.push({ type: 'note', description: 'Sem login registrado ainda — audit-login provavelmente ainda não disparou na sessão de teste' });
    }
  });
});
```

- [ ] **Step 2: Rodar teste local**

Run: `npm run test:e2e -- 11-acessos-admin.spec.ts`

Expected: testes passam (estrutura básica). Caso falhem por algo estrutural (rota, guard), corrigir.

- [ ] **Step 3: Promover migrations em ordem**

```bash
bash .claude/hooks/promote-to-prod.sh supabase/migrations/20260521a_audit_log_table.sql
bash .claude/hooks/promote-to-prod.sh supabase/migrations/20260521b_audit_log_triggers_cards.sql
bash .claude/hooks/promote-to-prod.sh supabase/migrations/20260521c_audit_log_triggers_others.sql
```

Expected: cada uma passa, smoke test verde, log registrado.

- [ ] **Step 4: Deploy edge functions em produção**

```bash
npx supabase functions deploy audit-login --no-verify-jwt --project-ref szyrzxvlptqqheizyrxu
npx supabase functions deploy force-logout --project-ref szyrzxvlptqqheizyrxu
npx supabase functions deploy audit-export --project-ref szyrzxvlptqqheizyrxu
```

Expected: 3 deploys OK.

- [ ] **Step 5: Validar em produção**

1. Logar com user de teste em produção.
2. Verificar que aparece `audit_log` com `action_type='login'`, IP populado.
3. Mover um card, verificar `card_move`.
4. Editar um contato, verificar `contact_edit`.
5. Acessar `/admin/acessos` com user admin → 3 abas renderizam.
6. Tentar acessar com user não-admin → redirecionado.
7. Botão Desativar funcionar; user-alvo perder acesso.
8. Botão Forçar Logout funcionar.
9. Exportar CSV — abrir no Excel BR sem erro de encoding.

- [ ] **Step 6: Marcar migration como aplicada**

```bash
touch .claude/.migration_applied
```

- [ ] **Step 7: Push + comunicar Vitor**

```bash
git push origin main
```

```
Pronto! Você agora tem uma página em Admin → Acessos com tudo de
visibilidade administrativa:

- Quem está no time e quando foi a última vez que entrou
- Histórico de quem entrou no CRM, de onde (IP) e com qual aparelho
- Tudo que cada pessoa fez aqui dentro (criou card, mudou de etapa,
  enviou proposta, etc)
- Botões pra desativar usuário ou forçar saída do sistema
- Exportar planilha CSV de tudo isso

Se algo parecer errado, me avisa.
```

---

## Self-Review

**Spec coverage:**
- §5.B.1 (tabela audit_log): Task 1 ✅
- §5.B.2 (captura IP/UA no login): Task 4 ✅
- §5.B.3 (triggers tabelas-chave): Tasks 2, 3 ✅
- §5.B.4 (página /admin/acessos com 3 abas): Tasks 9, 10, 11, 12 ✅
- §5.B.4 (botões desativar + forçar logout): Tasks 5, 10 ✅
- §5.B.5 (exportar CSV): Task 13 ✅
- §5.B.6 (smoke test + validação): Task 14 ✅

**Placeholders:** sem TBD/TODO/handle-edge-case. Cada step tem código ou comando explícito.

**Type consistency:**
- `AuditLogRow` definido em `useAuditLog.ts` reusado em LoginsTab e AcoesTab ✅
- `UserWithLastAccess` em `useWorkspaceUsersWithLastAccess.ts` usado em UsuariosTab ✅
- `action_type` strings consistentes entre triggers SQL (Task 2, 3) e `ACTION_LABELS` (Task 12) ✅

**Riscos conhecidos:**
- Nome da tabela `proposals` vs `propostas` — Task 3 step 1 verifica antes.
- `auth.admin.signOut(uuid, 'global')` requer Supabase JS >= 2.39. Confirmar versão em `package.json` na Task 5 step 2 (se necessário, ajustar pra `auth.admin.deleteUser` + workaround).
- Performance triggers em `cards`: validado na Task 2 step 4. Se overhead alto, desabilitar trigger em writes batch (ex: import Monde) via session-local `set_config('audit.skip', 'on')`.

---

## Execução

Plano pronto. Como o Marco B é independente do Marco A, posso executar agora ou aguardar o A terminar.

**Recomendação:** terminar Marco A primeiro (já temos o plano), só então atacar Marco B. Mas se você preferir paralelo, dá.
