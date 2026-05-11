---
name: pre-deploy-checklist
description: Use before claiming task is complete, before /subir, or when finishing any implementation task - mandatory quality gate
user-invocable: true
argument-hint: (sem argumentos)
---

# Pre-Deploy Checklist — WelcomeCRM

## Quando usar

- Antes de dizer que uma task está "pronta" ou "concluída"
- Antes de rodar `/subir`
- Antes de commitar
- Quando o usuário perguntar "está tudo ok?"

## Checklist Obrigatório

### 1. Build & Types
```bash
npm run build
```
- [ ] Build passa sem erros
- [ ] Sem warnings de TypeScript novos

### 2. Código Novo
- [ ] Sem `any` novo sem justificativa (ver skill `typescript-strict`)
- [ ] Imports usando `@/` (não relativos longos)
- [ ] Componentes com loading/empty/error states
- [ ] Product isolation aplicado (queryKey inclui `currentProduct`)

### 3. Migrations (se aplicável)
- [ ] Migration aplicada no STAGING (`bash .claude/hooks/apply-to-staging.sh`)
- [ ] Smoke test passou
- [ ] Testou contra banco real via curl (não apenas "parece correto")
- [ ] Migration antiga deletada se foi supersedida

### 4. Inventário
- [ ] Se criou hook/page/componente novo: rodar `npm run sync:fix`
- [ ] Se criou view/coluna nova: adicionou ao smoke test

### 5. Git
- [ ] TODOS os arquivos modificados serão commitados (não só os da feature)
- [ ] Git author é `vitorgambetti@gmail.com`
- [ ] Commit em português

### 6. Dependências
- [ ] Verificou se mudanças afetam triggers/RPCs/views (grep ou MCP `get_dependencies`)
- [ ] Se modificou arquivo crítico (KanbanBoard, CardDetail, Pipeline): rodou `check_impact`

## Output ao Usuário

Após rodar o checklist, SEMPRE informar ao usuário:

```
## Status
- Build: OK/FALHOU
- Migrations: N/A ou aplicadas no staging
- Testes: OK/pendente

## Próximos passos para produção
1. [ ] Commitar: `git add ... && git commit -m "..."`
2. [ ] Push: `git push`
3. [ ] Promover migrations (se houver): `bash .claude/hooks/promote-to-prod.sh <arquivo>`
4. [ ] Deploy edge functions (se houver): `npx supabase functions deploy <nome>`
```

**NUNCA terminar uma task sem listar os próximos passos.**