# REFERÊNCIAS DE CÓDIGO - WelcomeCRM Security Audit

## ARQUIVO 1: scripts/supabase-admin.ts
**Caminho:** `/sessions/sleepy-epic-clarke/mnt/WelcomeCRM/scripts/supabase-admin.ts`

### Linhas 8-10: SERVICE_ROLE_KEY Exposto
```typescript
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';
const MANAGEMENT_API_KEY = 'sb_secret_RFrk_cRPCfIES5-wrwfHiQ_LskCpaab';
```
**Risco:** Credenciais em texto plano no código

### Linhas 37-83: listTables() Function
```typescript
async function listTables() {
  const { data, error } = await supabaseAdmin.rpc('pg_tables_list')
    .catch(() => ({ data: null, error: { message: 'RPC not available' } }));

  if (error) {
    // ... tenta criar lista_all_tables dinamicamente
    const tablesQuery = await fetch(`${SUPABASE_URL}/rest/v1/rpc/list_all_tables`, {
      method: 'POST',
      headers: { 'apikey': SERVICE_ROLE_KEY, ... },
    });
    
    if (!tablesQuery.ok) {
      await runSQL(`
        CREATE OR REPLACE FUNCTION list_all_tables() ...
      `);
    }
  }
}
```
**Funções:** list_all_tables, exec_sql (via runSQL)

### Linhas 85-110: runSQL() Function
```typescript
async function runSQL(sql: string) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers: {
      'apikey': SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ query: sql })
  });

  if (!response.ok) {
    // Fallback para Management API
    const mgmtResponse = await fetch(
      `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
      { ... }
    );
    return mgmtResponse.json();
  }

  return response.json();
}
```
**Funções:** exec_sql

---

## ARQUIVO 2: src/hooks/useApiKeys.ts
**Caminho:** `/sessions/sleepy-epic-clarke/mnt/WelcomeCRM/src/hooks/useApiKeys.ts`

### Linhas 52-73: useCreateApiKey() Hook
```typescript
export function useCreateApiKey() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (params: CreateApiKeyParams): Promise<ApiKeyWithPlainText> => {
            const { data, error } = await supabase.rpc('generate_api_key', {
                p_name: params.name,
                p_permissions: params.permissions || { read: true, write: true },
                p_rate_limit: params.rate_limit || 5000,
                p_expires_at: params.expires_at || undefined
            });

            if (error) throw error;
            if (!data || data.length === 0) throw new Error('Failed to generate API key');

            return data[0] as ApiKeyWithPlainText;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['api-keys'] });
        }
    });
}
```
**Função:** generate_api_key (linha 57)

### Linhas 76-91: useRevokeApiKey() Hook
```typescript
export function useRevokeApiKey() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (keyId: string) => {
            const { error } = await supabase.rpc('revoke_api_key', {
                p_key_id: keyId
            });

            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['api-keys'] });
        }
    });
}
```
**Função:** revoke_api_key (linha 81)

---

## ARQUIVO 3: supabase/functions/public-api/index.ts
**Caminho:** `/sessions/sleepy-epic-clarke/mnt/WelcomeCRM/supabase/functions/public-api/index.ts`

### Linhas 20-62: Authentication Middleware
```typescript
// Authentication Middleware
app.use("/*", async (c, next) => {
    // Skip auth for docs and health
    if (c.req.path.includes("/openapi.json") || ...) {
        return await next();
    }

    const apiKey = c.req.header("X-API-Key");
    if (!apiKey) {
        return c.json({ error: "Missing X-API-Key header" }, 401);
    }

    const supabase = createClient(...);

    // Validate Key
    const { data, error } = await supabase.rpc("validate_api_key", { p_key: apiKey });

    if (error || !data || data.length === 0 || !data[0].is_valid) {
        return c.json({ error: "Invalid API Key" }, 401);
    }

    const keyData = data[0];
    c.set("apiKey", keyData);
    c.set("supabase", supabase);

    // Log Request
    const startTime = Date.now();
    await next();
    const endTime = Date.now();

    // Log to DB
    supabase.from("api_request_logs").insert({
        api_key_id: keyData.key_id,
        endpoint: c.req.path,
        method: c.req.method,
        status_code: c.res.status,
        response_time_ms: endTime - startTime,
        ip_address: c.req.header("x-forwarded-for"),
        user_agent: c.req.header("user-agent"),
    }).then();
});
```
**Função:** validate_api_key (linha 37)
**Crítico:** Middleware de autenticação para TODAS as requisições da Public API

---

## ARQUIVO 4: src/database.types.ts
**Caminho:** `/sessions/sleepy-epic-clarke/mnt/WelcomeCRM/src/database.types.ts`

### Linha 6213: generate_api_key Function Type
```typescript
generate_api_key: {
  Args: {
    p_expires_at?: string
    p_name: string
    p_permissions?: Json
    p_rate_limit?: number
  }
  Returns: {
    api_key_id: string
    plain_text_key: string
  }[]
}
```

### Linha 6330: revoke_api_key Function Type
```typescript
revoke_api_key: { Args: { p_key_id: string }; Returns: boolean }
```

### Linha 6383: validate_api_key Function Type
```typescript
validate_api_key: {
  Args: { p_key: string }
  Returns: {
    current_count: number
    error_message: string
    is_valid: boolean
    key_id: string
    permissions: Json
    rate_limit: number
  }[]
}
```

---

## ARQUIVO 5: CLAUDE.md (Documentação)
**Caminho:** `/sessions/sleepy-epic-clarke/mnt/WelcomeCRM/CLAUDE.md`

### Linha 101-102: Capacidades Mencionadas
```markdown
| **SQL arbitrário** | `supabase_rpc` → `exec_sql({"query": "..."})` |
| **Listar tabelas** | `supabase_rpc` → `list_all_tables()` |
```

---

## ARQUIVO 6: .skills/modo-antigravity/SKILL.md
**Caminho:** `/sessions/sleepy-epic-clarke/mnt/WelcomeCRM/.skills/modo-antigravity/SKILL.md`

### Linha 82: Capacidades exec_sql
```markdown
| SQL arbitrário | `supabase_rpc` → `exec_sql({"query": "..."})` |
```

### Linha 33: Capacidades list_all_tables
```markdown
Executar: `supabase_rpc` → `list_all_tables()`
```

---

## SUMÁRIO DE LINHAS CRÍTICAS

| Função | Arquivo | Linhas | Tipo | Status |
|--------|---------|--------|------|--------|
| exec_sql | scripts/supabase-admin.ts | 86-94 | Chamada RPC | 🔴 Não existe |
| generate_api_key | src/hooks/useApiKeys.ts | 57 | Chamada RPC | 🟡 Tipada |
| validate_api_key | supabase/functions/public-api/index.ts | 37 | Chamada RPC | 🟡 Tipada |
| revoke_api_key | src/hooks/useApiKeys.ts | 81 | Chamada RPC | 🟡 Tipada |
| list_all_tables | scripts/supabase-admin.ts | 50, 62 | Chamada RPC | 🟡 Criada dinamicamente |
| describe_table | N/A | N/A | N/A | 🔴 Não encontrada |

