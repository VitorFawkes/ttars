# 10 - Secrets Protection (CRÍTICO)

> **Prioridade: MÁXIMA** - Violação = Falha Crítica de Engenharia

## Regra Absoluta

**NUNCA** escrever tokens, keys, senhas ou credenciais diretamente em código.

## O que é PROIBIDO

```typescript
// ❌ PROIBIDO - Nunca fazer isso
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';
const API_KEY = 'sk-xxxxx';
const GITHUB_TOKEN = 'ghp_xxxxx';
const PASSWORD = 'minhasenha123';
```

## O que é OBRIGATÓRIO

```typescript
// ✅ CORRETO - Sempre usar variáveis de ambiente
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const API_KEY = process.env.API_KEY;

// ✅ CORRETO - Ou ler de arquivo de secrets (que está no .gitignore)
import secrets from './.claude/secrets.json';
```

## Checklist Antes de Criar Qualquer Arquivo

1. [ ] O arquivo contém alguma string que parece token/key/senha?
2. [ ] Se sim, está vindo de `process.env` ou arquivo de secrets?
3. [ ] O arquivo está listado no `.gitignore` se for de debug/teste?

## Padrões de Tokens para NUNCA Hardcodar

| Padrão | Tipo |
|--------|------|
| `eyJ...` | JWT (Supabase, Auth) |
| `ghp_...` | GitHub Personal Access Token |
| `sk-...` | OpenAI/Stripe Secret Key |
| `sb_secret_...` | Supabase Management Key |
| `xoxb-...` | Slack Bot Token |
| Qualquer string > 20 chars aleatórios | Provavelmente é secret |

## Onde Secrets DEVEM Ficar

| Arquivo | Propósito | No .gitignore? |
|---------|-----------|----------------|
| `.env` | Variáveis de ambiente | ✅ SIM |
| `.env.local` | Override local | ✅ SIM |
| `.claude/secrets.json` | Secrets do Claude IDE | ✅ SIM |

## Se Precisar de Script de Debug

1. Criar o arquivo com prefixo `debug_` ou na pasta `scripts/debug-*`
2. Usar `process.env.VARIAVEL` para secrets
3. Verificar que está no `.gitignore` ANTES de commitar

## Consequência de Violação

Se um token for commitado:
1. O token está **permanentemente exposto** no histórico do Git
2. Deve ser **rotacionado imediatamente** no serviço correspondente
3. O arquivo deve ser removido do Git com `git rm --cached`

---

**Esta regra não tem exceções.**
