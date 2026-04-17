---
name: subir
description: Publica código em produção. 3 modos — `/subir` (auto-detecta), `/subir rapido` (commit+push), `/subir completo` (fluxo robusto com review)
disable-model-invocation: true
user-invocable: true
argument-hint: "[rapido|completo] (opcional — sem argumento auto-detecta)"
---

# /subir — Publicar em produção

## Escolha do modo

| Argumento | Quando usar | O que faz |
|-----------|------------|----------|
| `/subir rapido` | Ajustes simples, skills, configs, hotfixes | Commit + push direto na main |
| `/subir completo` | Features novas, mudanças estruturais, migrations | Fluxo completo: migrations → qualidade → review → commit → push |
| `/subir` (sem arg) | Auto-detecta | Se tem .sql pendente → completo. Senão → rápido |

**REGRA:** Suba APENAS o que é da task atual. NUNCA incluir mudanças de outras features — a menos que o usuário diga "suba tudo".

---

## Pré-requisitos (TODOS os modos)

Antes de qualquer coisa:

```bash
# 1. Verificar email do git (Vercel bloqueia outros)
git config user.email  # DEVE ser vitorgambetti@gmail.com

# 2. Puxar mudanças remotas
git pull --rebase origin main

# 3. Verificar o que mudou
git status --short
git diff --name-only
```

Se o email estiver errado: `git config user.email "vitorgambetti@gmail.com"`

---

## Modo RÁPIDO (`/subir rapido`)

### 1. Commit
```bash
# Adicionar APENAS arquivos da task (NUNCA .env, secrets)
git add <arquivos-da-task>

# Commit em português
git commit -m "$(cat <<'EOF'
<tipo>: <descrição concisa>

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```
Tipos: feat, fix, perf, refactor, chore, docs

### 2. Push
```bash
git push origin main
```

### 3. Confirmar (formato PT simples)
Responder no formato obrigatório (sem jargão técnico):
```
Pronto! <o que foi feito em 1 frase>.
Você consegue testar em <tela ou link direto>.
Se algo parecer errado, me avisa.
```
Palavras PROIBIDAS na resposta ao usuário: commit, push, branch, merge, hash, deploy, Vercel, CI, staging.
Nunca mencionar arquivos pendentes de outras tarefas.

---

## Modo COMPLETO (`/subir completo`)

### Etapa 1 — Migrations (se houver)

Verificar se há migrations SQL da task:
```bash
git diff --name-only | grep '\.sql$'
git ls-files --others --exclude-standard | grep '\.sql$'
```

**Se houver migrations NÃO aplicadas no staging:**
1. Aplicar no staging: `bash .claude/hooks/apply-to-staging.sh <arquivo>`
2. Se staging passou sem erro → promover direto: `bash .claude/hooks/promote-to-prod.sh <arquivo>`
   - **NÃO pausar pedindo confirmação** (regra "Fluxo Autônomo com o Usuário" no CLAUDE.md)
   - Só pausar se a migration envolver DROP de tabela com dados, apagar registros, ou reset irreversível — aí sim pedir confirmação
3. Marcar: `touch .claude/.migration_applied`
4. Deletar migrations intermediárias/rascunho se houver

**Se migrations já foram aplicadas em produção** (já passou pelo promote):
- Pular para Etapa 2

**Se NÃO há migrations:**
- Pular para Etapa 2

### Etapa 2 — Qualidade

```bash
npm run build  # inclui TypeScript check
```

Se falhar: CORRIGIR e rodar novamente. Não prosseguir com build quebrado.

Se a task criou hooks/pages/componentes novos:
```bash
npm run sync:fix  # atualizar CODEBASE.md
```

### Etapa 3 — Code Review

Lançar agente code-reviewer:

```
Revise as mudanças do WelcomeCRM para esta task.

Arquivos modificados:
$(git diff --name-only HEAD)
$(git ls-files --others --exclude-standard | grep -v node_modules)

Para CADA arquivo acima:
1. Leia o conteúdo completo do arquivo
2. Verifique:
   - Imports não utilizados ou quebrados
   - Secrets hardcoded ou expostos
   - Tipos TypeScript incorretos (uso de `any` sem justificativa)
   - Consistência com padrões do CLAUDE.md
   - Isolamento de produto (currentProduct/pipelineId nos filtros)
   - Design: sem glassmorphism em light mode, sem cores hex

Reporte apenas problemas REAIS com severidade (CRÍTICA/ALTA/MÉDIA/BAIXA).
```

- CRÍTICA ou ALTA → corrigir, rodar build novamente, re-review
- MÉDIA ou BAIXA → registrar e prosseguir

### Etapa 4 — Commit

```bash
# Ver o que vai entrar
git status --short
git diff --stat

# Adicionar APENAS arquivos da task
git add <arquivos-da-task>

# Commit em português
git commit -m "$(cat <<'EOF'
<tipo>: <descrição concisa>

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

### Etapa 5 — Push para produção

```bash
# Se está numa feature branch, mergear na main
CURRENT_BRANCH=$(git branch --show-current)

if [ "$CURRENT_BRANCH" != "main" ]; then
  git push -u origin "$CURRENT_BRANCH"
  git checkout main
  git pull --rebase origin main
  git merge "$CURRENT_BRANCH"
fi

# Push para produção
git push origin main
```

### Etapa 6 — Confirmação (formato PT simples — OBRIGATÓRIO)

Responder ao Vitor no formato (sem jargão técnico):
```
Pronto! <o que foi feito em 1 frase humana>.
Você consegue testar em <tela ou link direto>.
Se algo parecer errado, me avisa.
```

**Palavras PROIBIDAS na resposta:** commit, push, branch, merge, hash, deploy, Vercel, CI, staging, migration, RLS, edge function.

**Nunca mencionar** arquivos modificados de outras tarefas, nem arquivos untracked fora do escopo. Ignorar em silêncio.

Se houver erro real que impeça a subida: explicar o problema em português humano e oferecer 2–3 caminhos. Nunca mostrar stack trace ao usuário.

---

## Auto-detecção (sem argumento)

Quando o usuário digita apenas `/subir`:

```
SE tem arquivo .sql novo ou modificado (não commitado):
  → Modo COMPLETO
SE tem mais de 5 arquivos modificados:
  → Modo COMPLETO
SENÃO:
  → Modo RÁPIDO
```

Informar qual modo foi escolhido: "Detectei que é uma mudança simples, usando modo rápido." ou "Há migrations pendentes, usando modo completo."