# AUDITORIA DE SEGURANÇA - WelcomeCRM
## Mapeamento de Dependências de Funções Críticas

---

## RESUMO EXECUTIVO

| Função | Usado em Frontend? | Usado em Edge Functions? | Usado em Triggers/SQL? | Implementação | Status |
|--------|------------------|--------------------------|------------------------|-----------------|--------|
| **exec_sql** | ❌ Não | ❌ Não | ❌ Não | Não encontrada | 🔴 NÃO IMPLEMENTADA |
| **generate_api_key** | ✅ Sim | ❌ Não | ❌ Não | Tipada em DB | 🟡 TIPADA |
| **validate_api_key** | ❌ Não | ✅ Sim | ❌ Não | Tipada em DB | 🟡 TIPADA |
| **revoke_api_key** | ✅ Sim | ❌ Não | ❌ Não | Tipada em DB | 🟡 TIPADA |
| **describe_table** | ❌ Não | ❌ Não | ❌ Não | Não encontrada | 🔴 NÃO IMPLEMENTADA |
| **list_all_tables** | ❌ Não | ❌ Não | ❌ Não | Mencionada em docs | 🟡 MENCIONADA |

---

## DETALHES POR FUNÇÃO

### 1. EXEC_SQL
- **Status:** 🔴 NÃO IMPLEMENTADA
- **Descrição:** Executa SQL arbitrário no banco via RPC
- **Encontrado em:** 
  - `/sessions/sleepy-epic-clarke/mnt/WelcomeCRM/.skills/modo-antigravity/SKILL.md` (linha 82)
  - `/sessions/sleepy-epic-clarke/mnt/WelcomeCRM/CLAUDE.md` (linha 101)
  - `/sessions/sleepy-epic-clarke/mnt/WelcomeCRM/scripts/supabase-admin.ts` (linhas 86-94)
- **Contexto de Uso:**
  ```typescript
  // scripts/supabase-admin.ts
  async function runSQL(sql: string) {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers: { 'apikey': SERVICE_ROLE_KEY, ... },
      body: JSON.stringify({ query: sql })
    });
  }
  ```
- **Observação:** Mencionada em documentação como capacidade disponível, mas não há implementação SQL no banco
- **Risco de Segurança:** ⚠️ ALTO - Se implementada sem SECURITY DEFINER, pode permitir SQL Injection

---

### 2. GENERATE_API_KEY
- **Status:** 🟡 TIPADA (Assinatura definida, implementação desconhecida)
- **Encontrado em:**
  - `/sessions/sleepy-epic-clarke/mnt/WelcomeCRM/src/hooks/useApiKeys.ts` (linha 57)
  - `/sessions/sleepy-epic-clarke/mnt/WelcomeCRM/src/database.types.ts` (linha 6213)
- **Contexto de Uso - Frontend:**
  ```typescript
  // src/hooks/useApiKeys.ts (useCreateApiKey)
  const { data, error } = await supabase.rpc('generate_api_key', {
    p_name: params.name,
    p_permissions: params.permissions || { read: true, write: true },
    p_rate_limit: params.rate_limit || 5000,
    p_expires_at: params.expires_at || undefined
  });
  ```
- **Assinatura do Banco:**
  ```typescript
  generate_api_key: {
    Args: {
      p_name: string;
      p_permissions?: Json;
      p_rate_limit?: number;
      p_expires_at?: string;
    };
    Returns: {
      api_key_id: string;
      plain_text_key: string;
    };
  }
  ```
- **Chamadas Via RPC:** SIM (supabase.rpc())
- **Observação:** Função é chamada do Hook React, precisa retornar plain_text_key uma única vez

---

### 3. VALIDATE_API_KEY
- **Status:** 🟡 TIPADA (Assinatura definida, implementação desconhecida)
- **Encontrado em:**
  - `/sessions/sleepy-epic-clarke/mnt/WelcomeCRM/supabase/functions/public-api/index.ts` (linha 37)
  - `/sessions/sleepy-epic-clarke/mnt/WelcomeCRM/src/database.types.ts` (linha 6383)
- **Contexto de Uso - Edge Function:**
  ```typescript
  // supabase/functions/public-api/index.ts (Authentication Middleware)
  const { data, error } = await supabase.rpc("validate_api_key", { p_key: apiKey });
  
  if (error || !data || data.length === 0 || !data[0].is_valid) {
    return c.json({ error: "Invalid API Key" }, 401);
  }
  
  const keyData = data[0];
  // Logs request and tracks rate limits
  ```
- **Assinatura do Banco:**
  ```typescript
  validate_api_key: {
    Args: { p_key: string };
    Returns: {
      is_valid: boolean;
      key_id: string;
      rate_limit: number;
      current_count: number;
      error_message: string;
    };
  }
  ```
- **Chamadas Via RPC:** SIM (supabase.rpc())
- **Crítico em:** Middleware de autenticação da Public API (toda requisição passa por validação)
- **Observação:** Esta função é crítica para segurança da Public API

---

### 4. REVOKE_API_KEY
- **Status:** 🟡 TIPADA (Assinatura definida, implementação desconhecida)
- **Encontrado em:**
  - `/sessions/sleepy-epic-clarke/mnt/WelcomeCRM/src/hooks/useApiKeys.ts` (linha 81)
  - `/sessions/sleepy-epic-clarke/mnt/WelcomeCRM/src/database.types.ts` (linha 6330)
- **Contexto de Uso - Frontend:**
  ```typescript
  // src/hooks/useApiKeys.ts (useRevokeApiKey)
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
  ```
- **Assinatura do Banco:**
  ```typescript
  revoke_api_key: { 
    Args: { p_key_id: string }; 
    Returns: boolean 
  }
  ```
- **Chamadas Via RPC:** SIM (supabase.rpc())
- **Observação:** Função de remoção de acesso, comportamento esperado é marcar como inativa

---

### 5. DESCRIBE_TABLE
- **Status:** 🔴 NÃO IMPLEMENTADA
- **Encontrado em:** Nenhuma localização (buscas não retornaram resultados)
- **Observação:** Não é mencionada em nenhum arquivo do projeto
- **Possível Uso:** Seria para retornar schema de uma tabela (colunas, tipos, etc.)

---

### 6. LIST_ALL_TABLES
- **Status:** 🟡 MENCIONADA
- **Encontrado em:**
  - `/sessions/sleepy-epic-clarke/mnt/WelcomeCRM/.skills/modo-antigravity/SKILL.md` (linha 33)
  - `/sessions/sleepy-epic-clarke/mnt/WelcomeCRM/CLAUDE.md` (linha 102)
  - `/sessions/sleepy-epic-clarke/mnt/WelcomeCRM/scripts/supabase-admin.ts` (linhas 37-83)
- **Contexto de Uso - Script Admin:**
  ```typescript
  // scripts/supabase-admin.ts listTables()
  const { data, error } = await supabaseAdmin.rpc('pg_tables_list')
    .catch(() => ({ data: null, error: { message: 'RPC not available' } }));
  
  // Se falhar, tenta criar a função:
  await runSQL(`
    CREATE OR REPLACE FUNCTION list_all_tables()
    RETURNS TABLE (table_name text, row_estimate bigint)
    ...
  `);
  ```
- **Chamadas Via RPC:** SIM (supabaseAdmin.rpc())
- **Observação:** Criada dinamicamente se não existir no script admin

---

## MATRIZ DE CHAMADAS

### FRONTEND (src/)
```
useApiKeys.ts
├── generate_api_key() → via supabase.rpc()
└── revoke_api_key()  → via supabase.rpc()
```

### EDGE FUNCTIONS (supabase/functions/)
```
public-api/index.ts
├── validate_api_key() → via supabase.rpc() [AUTHENTICATION MIDDLEWARE]
└── Logs all requests to api_request_logs table
```

### SCRIPTS (scripts/)
```
supabase-admin.ts
├── exec_sql()         → via REST endpoint /rpc/exec_sql
├── list_all_tables()  → via supabase.rpc() ou REST endpoint
└── runSQL()           → chamador de exec_sql
```

### DOCUMENTAÇÃO
```
CLAUDE.md, SKILL.md
├── list_all_tables()  → Mencionada como capacidade
└── exec_sql()         → Mencionada como capacidade
```

---

## CONSTATAÇÕES DE SEGURANÇA

### 🔴 CRÍTICO

1. **Funções Não Implementadas**
   - `exec_sql` é mencionada em docs/skills mas NÃO está implementada no banco
   - Há tentativa de chamar via `/rpc/exec_sql` em scripts/supabase-admin.ts (linhas 86-94)
   - Risco: Se essa função for criada depois, pode ser vulnerável

2. **API Key Management Incompleto**
   - `generate_api_key`, `validate_api_key`, `revoke_api_key` estão tipadas mas não há proof de implementação
   - Database.types.ts mostra assinatura, mas origem SQL desconhecida
   - Não há migrations encontradas com CREATE FUNCTION para essas funções

3. **Public API Dependency**
   - Toda requisição à Public API passa por `validate_api_key()`
   - Se essa função falhar silenciosamente, a segurança é comprometida
   - Log em linha 37 do public-api/index.ts mostra verificação: `if (error || !data || !data[0].is_valid)`

### 🟡 MODERADO

4. **Scripts Admin com Acesso Não Controlado**
   - `/scripts/supabase-admin.ts` contém SERVICE_ROLE_KEY (linhas 8-10)
   - Tenta executar SQL arbitrário via `exec_sql`
   - Se descoberto/vazado, permite controle total do banco

5. **Capabilities Mencionadas Mas Não Verificadas**
   - CLAUDE.md lista capacidades (SQL arbitrário, listar tabelas) sem validação
   - Pode enganar usuários sobre o que é possível fazer

### 🟢 BOM

6. **Edge Function Tem Validação**
   - public-api/index.ts verifica retorno de validate_api_key
   - Middleware está estruturado corretamente
   - Logging de requisições implementado

---

## RECOMENDAÇÕES

### Imediato (P1)

1. **Verificar Implementação das Funções de API Key**
   - Procurar migrations SQL com as funções API Key
   - Confirmar se estão em `20250128_*_*.sql` ou anterior
   - Validar lógica de rate limit em `validate_api_key`

2. **Não Implementar exec_sql**
   - Se essa função não existir, deixar como está
   - É extremamente perigosa para SQL Injection
   - Usar RPC específicas para cada operação em vez

3. **Auditar scripts/supabase-admin.ts**
   - SERVICE_ROLE_KEY exposto em texto plano
   - Mover para variáveis de ambiente
   - Remover após uso

### Curto Prazo (P2)

4. **Documentar Origem de Cada Função SQL**
   - Adicionar comments em database.types.ts indicando migration
   - Criar registro de quem criou cada função

5. **Implementar SECURITY DEFINER**
   - Todas as funções RPC devem ter `SECURITY DEFINER SET search_path = public`
   - Evitar privilege escalation

### Longo Prazo (P3)

6. **Remover list_all_tables() da API Pública**
   - Criar a função dinâmico em scripts não é seguro
   - Se necessária, implementar com permissões restritas

---

## RESUMO TABELA FINAL

| Função | Frontend | Edge Func | Banco | RPC | Implementada | Risco |
|--------|----------|-----------|-------|-----|--------------|-------|
| exec_sql | ❌ | ❌ | ❌ | 🔴 | Não | ⚠️ SQL Injection |
| generate_api_key | ✅ (Hook) | ❌ | ? | ✅ | Desconhecida | 🟡 Médio |
| validate_api_key | ❌ | ✅ (Middleware) | ? | ✅ | Desconhecida | 🔴 Alto |
| revoke_api_key | ✅ (Hook) | ❌ | ? | ✅ | Desconhecida | 🟡 Médio |
| describe_table | ❌ | ❌ | ❌ | ❌ | Não | ℹ️ N/A |
| list_all_tables | ❌ | ❌ | 🔄 | ✅ | Criada dinamicamente | 🟡 Segurança |

