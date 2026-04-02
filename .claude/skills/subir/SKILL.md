---
name: subir
description: Publica código em produção — branch, migrations, review, commit, merge na main, push. Fluxo completo.
disable-model-invocation: true
---

Faça o que for preciso para colocar o código **da task atual em produção** (visível para todos no site). Siga TODAS as etapas aplicáveis:

**REGRA IMPORTANTE:** Suba APENAS o que é relacionado à task/feature que acabamos de trabalhar nesta conversa. NÃO suba mudanças avulsas, migrations de outras features, ou arquivos que não fazem parte do escopo atual — a menos que o usuário peça explicitamente ("suba tudo").

## Etapa 1 — Branch

Se estiver na branch main, crie uma feature branch:
```bash
BRANCH_NAME="feat/$(echo '<descricao-curta>' | tr ' ' '-' | tr '[:upper:]' '[:lower:]')"
git checkout -b "$BRANCH_NAME"
```

Se já estiver numa feature branch, continue nela.

## Etapa 2 — Migrations da task atual

Verifique se há migrations SQL relacionadas à task atual:
```bash
git diff --name-only | grep '\.sql$'
git ls-files --others --exclude-standard | grep '\.sql$'
```

Filtre apenas as migrations que pertencem à feature/task desta conversa. Ignore migrations de outras features.

Se houver migrations da task:
1. Aplicar CADA uma no staging: `bash .claude/hooks/apply-to-staging.sh <arquivo>`
2. Aguardar confirmação do usuário que testou no staging
3. Promover para produção: `bash .claude/hooks/promote-to-prod.sh <arquivo>`
4. Marcar como aplicada: `touch .claude/.migration_applied`
5. Deletar migrations intermediárias/rascunho se houver

Se NÃO houver migrations da task, pule para Etapa 3.

## Etapa 3 — Qualidade

1. `npm run lint` — corrigir erros se houver
2. `npm run build` — garantir que compila (inclui TypeScript)

Se qualquer etapa falhar, CORRIJA e rode novamente.

## Etapa 4 — Code Review (obrigatório)

Lance o agente code-reviewer (subagent_type: "code-reviewer") com prompt:
```
Revise as seguintes mudanças no WelcomeCRM. Foque em:
- Duplicações de código ou lógica
- Imports não utilizados ou quebrados
- Secrets hardcoded ou expostos
- Tipos TypeScript incorretos ou faltantes
- Consistência com padrões existentes
- Problemas de design (glassmorphism em light mode, cores hex, etc.)

Arquivos modificados: [lista dos arquivos via git diff --name-only]

Para cada arquivo, leia o conteúdo e analise contra os padrões documentados em sua memória.
Reporte apenas problemas REAIS — não sugira melhorias estéticas.
```

Se o review encontrar problemas de severidade ALTA ou CRÍTICA:
1. CORRIJA os problemas antes de prosseguir
2. Rode Etapa 3 (Qualidade) novamente
3. Rode o review novamente até ficar limpo

Se encontrar apenas MÉDIO/BAIXO, registre e prossiga.

## Etapa 5 — Commit

1. `git status` — ver o que mudou
2. `git diff` — entender as mudanças
3. `git log --oneline -5` — ver estilo dos commits recentes
4. Adicionar APENAS os arquivos da task atual (NUNCA .env, secrets, ou arquivos de outras features)
5. Criar commit em PORTUGUÊS com mensagem descritiva:
```bash
git commit -m "$(cat <<'EOF'
<tipo>: <descrição concisa>

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

Tipos: feat, fix, perf, refactor, chore, docs

## Etapa 6 — Merge na main e Push para produção

O objetivo do /subir é colocar em PRODUÇÃO. Sempre fazer merge na main:

```bash
# Push da feature branch primeiro
git push -u origin $(git branch --show-current)

# Merge na main e push para produção
git stash --include-untracked 2>/dev/null || true
git checkout main
git merge $(git branch --show-current)
git push
```

Se houver conflitos no merge, resolver antes de pushar.

O push na main dispara o deploy Vercel de produção automaticamente.

## Etapa 7 — Confirmação

Reporte ao usuário:
- Migrations aplicadas (se houver)
- O que foi commitado
- Hash do commit na main
- Confirmação de que está em produção (Vercel deployando)