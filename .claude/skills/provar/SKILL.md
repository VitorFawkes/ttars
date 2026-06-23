---
name: provar
description: Prova que uma mudança funciona contra o sistema VIVO (banco/RPC/UI real) antes de dizer "pronto/corrigido". Use SEMPRE antes de afirmar conclusão de algo que NÃO mudou .sql — correção em RPC existente, config/prompt de agente, ou frontend que consome RPC/embed/analytics. Build verde NÃO é prova.
user-invocable: true
argument-hint: (opcional) o que provar — ex: "o RPC ww_funil_conversao_v1" ou "a tela /analytics"
---

# /provar — prova contra o sistema vivo (WelcomeCRM)

**Por que existe:** a falha de qualidade mais recorrente do projeto é *afirmar que está corrigido sem
provar contra o banco/UI real*. `build verde ≠ feature funciona` ([[feedback_console_first]]); validar
por leitura de código é ilusão ([[feedback_mutation_testing]]). Os hooks já cobrem o ESTÁTICO
(isolamento, RLS, lint, build) e o smoke test só roda quando há `.sql` — e mesmo aí só checa HTTP 200,
nunca o **valor**. Esta skill cobre o eixo que falta: **o dado/comportamento certo sai de verdade**.

## Quando usar (obrigatório antes de dizer "pronto")
- Corrigiu/criou um **RPC** ou query (especialmente analytics) — mesmo sem mudar `.sql`.
- Mexeu em **config/prompt** de agente, feature flag, ou qualquer valor que o app consome.
- Mexeu em **frontend** que lê RPC/embed/analytics (o dado pode quebrar em runtime com build verde).
- Vai responder "está tudo ok?" / "corrigido" / "funcionando".

Não substitui `/test` (estático) nem os hooks — é a camada de **prova de runtime** por cima deles.

## Procedimento

### 1. Declare o que vai provar
Uma frase: *qual* query/RPC/campo/tela e *qual resultado esperado* (o número, o estado, o que a tela deve mostrar). Sem isso, você não sabe o que está testando.

### 2. Prove a query/RPC contra o banco REAL
```bash
source .env   # carrega VITE_SUPABASE_ANON_KEY e SUPABASE_SERVICE_ROLE_KEY
BASE="https://szyrzxvlptqqheizyrxu.supabase.co/rest/v1"   # PRODUÇÃO

# Tabela (replique a query LITERAL do código — mesmos filtros/colunas):
curl -s "$BASE/<tabela>?select=<cols>&<filtros>" \
  -H "apikey: $VITE_SUPABASE_ANON_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" | jq

# RPC (mesmos parâmetros que o frontend envia):
curl -s -X POST "$BASE/rpc/<nome_rpc>" \
  -H "apikey: $VITE_SUPABASE_ANON_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" -d '{"p_param": "valor"}' | jq
```
- Confirme o **VALOR**, não só que respondeu. HTTP 200 com `{"error": ...}` no corpo é falha mascarada ([[feedback_promote_to_prod_swallows_errors]]).
- Enum `app_product` comparado com texto exige `::TEXT` (ex.: `pip.produto::TEXT = p_product`). Veja MEMORY.md §Regras.

### 3. Prove o isolamento (se a mudança toca tabela por-org)
A query NÃO pode vazar dados de outra org/produto. Reaproveite as contagens cross-org que já existem:
```bash
# 0 = ok; >0 = vazamento. (RPCs usadas no schema-smoke-test.sh)
curl -s -X POST "$BASE/rpc/cadence_triggers_cross_org_count" -H "apikey: $VITE_SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" | jq
```
Para dados de workspace, lembre: usuários via `org_members`, não `profiles.org_id` ([[feedback_multi_tenant_org_members]]).

### 4. Mutation test (se mexeu em config/campo editável)
Não confie em `{"success": true}`. **Mude o valor → provoque o uso real → confirme que o comportamento mudou.** Ex.: editou um campo do agente → dispare a ação que usa o campo → veja o valor novo chegar. ([[feedback_mutation_testing]] — "validar por presença no código é ilusão".)

### 5. Analytics: agregado == drill
Se mexeu em funil/dashboard: o **número do agregado tem que bater com o tamanho da lista do drill** sob o MESMO filtro (mesmo normalizer, date_mode, definição de ganho). Divergência zera silenciosamente. ([[feedback_ww_drill_down_mismatch]], [[feedback_ww_funil_throughput_atividade]].)

### 6. UI/lógica: abra a tela e leia o console (Playwright MCP)
```
browser_navigate  → a tela afetada (login: test@welcomecrm.test / Test123!@#)
browser_snapshot  → confirme que renderiza o estado esperado
browser_console_messages → ZERO erro vermelho (embed PostgREST quebra em runtime com build verde)
```

### 7. Só então afirme "pronto" — com a evidência
Cite a prova concreta, não "parece correto":
> ✅ Provado: RPC `x` retornou `<valor>` (esperado `<valor>`); agregado 31 == drill 31; isolamento cross-org = 0; console limpo.

Se NÃO conseguiu provar (sem acesso, ambiente fora do ar), **diga isso explicitamente** e o que falta — nunca afirme conclusão sem prova.

## Regra de ouro
**Nenhuma afirmação de "corrigido/funcionando" sem evidência de runtime real.** Em dúvida entre afirmar e provar, prove.
