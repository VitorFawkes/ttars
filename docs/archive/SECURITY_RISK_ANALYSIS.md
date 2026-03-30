# ANÁLISE DE RISCOS DE SEGURANÇA
## WelcomeCRM - Funções Críticas

---

## RISCO 1: exec_sql - VULNERABILIDADE CRÍTICA
**Severidade:** 🔴 CRÍTICO  
**Status:** Não implementada no banco, mas chamada no código

### Problema
- Script `scripts/supabase-admin.ts` tenta chamar `/rpc/exec_sql` (linhas 86-94)
- Função não existe no banco (não encontrada em migrations)
- Se implementada incorretamente, permite SQL Injection massivo

### Código Vulnerable
```typescript
// scripts/supabase-admin.ts linha 86
const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
  method: 'POST',
  headers: { 'apikey': SERVICE_ROLE_KEY, ... },
  body: JSON.stringify({ query: sql })
});
```

### Cenário de Ataque
1. Alguém descobre `SERVICE_ROLE_KEY` no repositório
2. Executa: `npx ts-node scripts/supabase-admin.ts sql "DROP TABLE cards"`
3. Banco inteiro pode ser destruído

### Impacto
- Perda total de dados
- Vazamento de informações confidenciais
- Modificação/corrupção de dados
- Denial of Service

### Recomendação
- **NÃO IMPLEMENTAR** essa função
- Remover código em scripts/supabase-admin.ts que tenta usar
- Usar RPCs específicas para operações necessárias em vez

---

## RISCO 2: SERVICE_ROLE_KEY Exposto
**Severidade:** 🔴 CRÍTICO  
**Status:** Código ainda existe no repositório

### Problema
```typescript
// scripts/supabase-admin.ts linhas 8-10
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';
const MANAGEMENT_API_KEY = 'sb_secret_RFrk_cRPCfIES5-wrwfHiQ_LskCpaab';
```

- Credenciais hardcoded em arquivo TypeScript
- Se repositório foi público antes, chave pode ter sido capturada
- Supabase deveria ter rotacionado essas chaves

### Impacto
- Acesso total ao banco de dados
- Criação/deleção de usuários
- Modificação de RLS policies
- Acesso a Management API do Supabase

### Recomendação Imediata
1. Assumir que essas chaves foram comprometidas
2. Rotar SERVICE_ROLE_KEY no Supabase
3. Rotar Management API Key
4. Remover arquivo scripts/supabase-admin.ts ou mover para .gitignored
5. Se não for necessário, deletar completamente

---

## RISCO 3: validate_api_key - Ponto Único de Falha
**Severidade:** 🔴 CRÍTICO  
**Status:** Tipada, implementação desconhecida

### Problema
- Toda requisição à Public API passa por `validate_api_key()`
- Se essa função falhar, retornar dados incorretos ou não existir, segurança é comprometida
- Não há fallback seguro no código

### Código Crítico
```typescript
// supabase/functions/public-api/index.ts linhas 37-41
const { data, error } = await supabase.rpc("validate_api_key", { p_key: apiKey });

if (error || !data || data.length === 0 || !data[0].is_valid) {
  return c.json({ error: "Invalid API Key" }, 401);
}
```

### Cenários de Falha
1. Se função não existir → erro RPC → requisição retorna 500 (não 401)
2. Se função retornar sempre `is_valid: true` → bypass de autenticação
3. Se rate_limit não for respeitado → DDoS possível

### Recomendação
1. Procurar implementação da função `validate_api_key` no banco
2. Verificar se está com `SECURITY DEFINER`
3. Auditar lógica de rate limit (coluna `current_count`)
4. Testar falha da função

---

## RISCO 4: API Keys - Implementação Incompleta
**Severidade:** 🟡 MÉDIO  
**Status:** 3 funções tipadas, origem SQL desconhecida

### Problema
- `generate_api_key`, `validate_api_key`, `revoke_api_key` estão em database.types.ts
- Não encontramos arquivo SQL que as cria
- Podem estar criadas dinamicamente ou em arquivo perdido

### Funções Afetadas
```typescript
// database.types.ts linhas 6213, 6330, 6383
generate_api_key: { Args: {...}, Returns: {...} }
validate_api_key: { Args: {...}, Returns: {...} }
revoke_api_key: { Args: {...}, Returns: boolean }
```

### Riscos Específicos
1. **generate_api_key**
   - Precisa retornar `plain_text_key` UMA ÚNICA VEZ
   - Se não criptografar, chaves são expostas em logs
   - Se retornar múltiplas vezes, vazamento de segredo

2. **validate_api_key**
   - Se não incrementar `current_count`, rate limit não funciona
   - Se não verificar `is_active`, chaves revogadas ainda funcionam
   - Precisa ser rápido (é chamada em CADA requisição)

3. **revoke_api_key**
   - Se apenas deletar em vez de marcar inativa, pode queimar chaves ativas
   - Se não atualizar log de auditoria, impossível rastrear

### Recomendação
1. **Urgente:** Localizar arquivo SQL que implementa essas 3 funções
2. Verificar cada função tem `SECURITY DEFINER SET search_path = public`
3. Auditar lógica de cada uma:
   - generate_api_key: criptografia, retorno único
   - validate_api_key: counter, is_active check, performance
   - revoke_api_key: soft delete vs hard delete

---

## RISCO 5: list_all_tables - Criada Dinamicamente
**Severidade:** 🟡 MÉDIO  
**Status:** Script tenta criar em tempo de execução

### Problema
```typescript
// scripts/supabase-admin.ts linhas 61-73
if (!tablesQuery.ok) {
  await runSQL(`
    CREATE OR REPLACE FUNCTION list_all_tables()
    RETURNS TABLE (table_name text, row_estimate bigint)
    LANGUAGE sql
    SECURITY DEFINER
    AS $$
      SELECT tablename::text,
             (SELECT reltuples::bigint FROM pg_class WHERE relname = tablename)
      FROM pg_tables
      WHERE schemaname = 'public'
      ORDER BY tablename;
    $$;
  `);
}
```

- Função criada em tempo de execução por script admin
- Sem permissões de propriedade definidas (pode ser público)
- Se executada por usuário não-admin, cria função com permissões erradas

### Impacto
- Qualquer usuário autenticado pode listar todas as tabelas
- Informação sobre schema fica disponível para atacantes
- Permite reconhecimento para outros ataques

### Recomendação
1. Migrar criação para migration SQL permanente
2. Definir GRANT explicitamente (apenas admin pode executar)
3. Remover criação dinâmica

---

## RISCO 6: API Request Logging - Performance & Privacy
**Severidade:** 🟡 MÉDIO  
**Status:** Logging implementado, sem truncate

### Problema
```typescript
// supabase/functions/public-api/index.ts linhas 53-61
supabase.from("api_request_logs").insert({
  api_key_id: keyData.key_id,
  endpoint: c.req.path,
  method: c.req.method,
  status_code: c.res.status,
  response_time_ms: endTime - startTime,
  ip_address: c.req.header("x-forwarded-for"),
  user_agent: c.req.header("user-agent"),
}).then();  // Fire and forget!
```

### Riscos
1. Logging é "fire and forget" (`.then()` sem await)
   - Se falhar, ninguém sabe
   - Possível que não esteja funcionando

2. Sem limite de retenção
   - Tabela `api_request_logs` pode crescer indefinidamente
   - Pode causar slow queries no banco
   - Dados pessoais (IP, User-Agent) mantidos indefinidamente

3. IP Address não é confiável
   - `x-forwarded-for` pode ser spoofado
   - Não há validação de proxy

### Recomendação
1. Mudar de fire-and-forget para await (detectar falhas)
2. Adicionar política de retenção (30 dias?)
3. Hash de IP address em vez de IP pleno
4. Remover User-Agent ou minimizar dados

---

## RISCO 7: describe_table - Ausente
**Severidade:** 🟢 BAIXO  
**Status:** Não existe no código

### Observação
- Função mencionada na missão mas não existe em lugar algum
- Nenhuma referência em código ou documentação
- Não afeta segurança atual

---

## RISCO 8: Database.types.ts Desincronizado
**Severidade:** 🟡 MÉDIO  
**Status:** Assinaturas podem estar incorretas

### Problema
```typescript
// Linha 6213 mostra assinatura esperada
generate_api_key: {
  Args: {...},
  Returns: [{ api_key_id: string; plain_text_key: string }]
}
```

- Arquivo é gerado por: `npx supabase gen types typescript --project-id ...`
- Se última geração foi há semanas, pode estar desatualizado
- Se implementação no banco mudou, types está errado

### Impacto
- TypeScript compile passa mas runtime falha
- Acessar propriedades que não existem
- Retornos null/undefined não tratados

### Recomendação
1. Executar geração de types (ver CLAUDE.md linha 158)
2. Committar novo database.types.ts
3. Verificar se tipos condizem com implementação real

---

## MATRIZ DE RISCO RESUMIDA

| Risco | Severidade | Impacto | Probabilidade | Ação |
|-------|-----------|--------|--------------|------|
| exec_sql | 🔴 Crítico | Total perda | Média | NÃO IMPLEMENTAR |
| SERVICE_ROLE_KEY | 🔴 Crítico | Acesso total | Alta | ROTAR CHAVES |
| validate_api_key | 🔴 Crítico | Bypass auth | Alta | AUDITAR |
| generate_api_key | 🟡 Médio | Vazamento | Média | VERIFICAR |
| revoke_api_key | 🟡 Médio | Chaves ativas | Baixa | TESTAR |
| list_all_tables | 🟡 Médio | Enumeração | Média | MIGRAR |
| logging | 🟡 Médio | Privacy | Baixa | CONFG |
| describe_table | 🟢 Baixo | N/A | N/A | N/A |
| types_sync | 🟡 Médio | Runtime error | Baixa | REGENERAR |

---

## AÇÕES IMEDIATAS (HOJE)

1. [ ] Rotar SERVICE_ROLE_KEY e MANAGEMENT_API_KEY no Supabase
2. [ ] Localizar implementação de validate_api_key, generate_api_key, revoke_api_key
3. [ ] Verificar se exec_sql realmente não existe
4. [ ] Testar validate_api_key manualmente com chave inválida
5. [ ] Regenerar database.types.ts

## AÇÕES CURTO PRAZO (ESTA SEMANA)

6. [ ] Implementar SECURITY DEFINER em todas as funções
7. [ ] Migrar list_all_tables para migration SQL
8. [ ] Adicionar retenção de logs (30 dias)
9. [ ] Remover scripts/supabase-admin.ts ou .gitignore
10. [ ] Auditar RLS policies nas tabelas api_keys, api_request_logs

