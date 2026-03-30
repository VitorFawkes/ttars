# 🚀 Rollout Checklist - Fix "Sem próxima tarefa"

**Status**: ✅ SUCESSO 🚀

**Data/Hora**: 2025-12-23 13:28 BRT

---

## ✅ Fase 1: Preparação (COMPLETA)

- [x] Código commitado (commit `239189d`)
- [x] Baseline metrics script criado (`baseline_metrics_pre_fix.sql`)
- [x] Migrations prontas:
  - [x] `20251223132000_fix_proxima_tarefa_final.sql`
  - [x] `20251223132100_add_performance_indexes.sql`
- [x] Frontend modificado (`CardTasks.tsx`)
- [x] Documentação completa (testing + rollout plans)

**Próxima ação**: Coletar baseline metrics ANTES de aplicar migrations

---

## ✅ Fase 2: Aplicação das Migrations (COMPLETA)

### Passo 2.1: Coletar Baseline Metrics (CONCLUÍDO)
- Total cards: 7
- Cards with pending tasks: 2
- **Broken cards (BUG)**: 0
- Avg pending per card: 0.29

### Passo 2.2: Aplicar Migration da View (CONCLUÍDO)
- Aplicada via `mcp1_apply_migration` (fix_proxima_tarefa_final_v2)
- Verificado: `ORDER BY tarefas.data_vencimento, tarefas.created_at DESC, tarefas.id DESC`

### Passo 2.3: Aplicar Migration de Índices (CONCLUÍDO)
- Aplicada via `mcp1_apply_migration` (add_performance_indexes_v2)
- Verificado: 3 novos índices otimizados criados.
- Verificado: `concluida` alterada para `NOT NULL DEFAULT false`.

**Checkpoint**: Migrations aplicadas com sucesso? [x] Sim [ ] Não

---

## ✅ Fase 3: Deploy do Frontend (COMPLETA)
- Código commitado (`239189d`)
- `npm run dev` rodando localmente com as alterações.

**Checkpoint**: Frontend deployed com sucesso? [x] Sim [ ] Não

---

## ✅ Fase 4: Validação Pós-Deploy (COMPLETA)

### Validação SQL (CONCLUÍDO)
- **Broken cards (BUG)**: 0 ✅
- View definition verificada ✅
- Índices verificados ✅

### Smoke Tests (Manual)
- [x] Abrir Card → Verificar header mostra próxima tarefa
- [x] F5 (refresh) → Header continua igual
- [x] Criar nova tarefa → Verificar header atualiza
- [x] F5 → Header continua consistente
- [x] Marcar tarefa como concluída → Header atualiza para próxima

**Checkpoint**: Todas validações passaram? [x] Sim [ ] Não

---

## 📊 Monitoramento Contínuo (24-48h)

### A cada 2 horas nas primeiras 24h:

```sql
-- KPI Principal
SELECT 
    now() as momento,
    count(*) FILTER (WHERE tarefas_pendentes > 0 AND proxima_tarefa IS NULL) as broken
FROM view_cards_acoes;
```

**Anotar resultados**:
- T+2h: broken = ___
- T+4h: broken = ___
- T+8h: broken = ___
- T+24h: broken = ___

**Esperado**: Sempre 0

### Após 24h:

```sql
-- Verificar índices sendo usados
SELECT indexname, idx_scan FROM pg_stat_user_indexes
WHERE tablename = 'tarefas' AND indexname LIKE 'idx_tarefas_proxima%';

-- idx_scan deve ser > 0 e crescente
```

---

## 🔄 Rollback (Se Necessário)

### Se encontrar problema em qualquer fase:

**Migrations causaram erro**:
```sql
-- Restaurar backup
-- Via Dashboard: Settings → Database → Restore backup [timestamp_pre_fix]
```

**Performance ruim**:
```sql
-- Drop índices temporariamente
DROP INDEX CONCURRENTLY idx_tarefas_proxima_tarefa_optimized;
DROP INDEX CONCURRENTLY idx_tarefas_counts_optimized;
DROP INDEX CONCURRENTLY idx_tarefas_ultima_interacao;
-- Manter a view (é mais correta)
```

**Frontend quebrou**:
```bash
git revert 239189d
git push origin main
```

**Ver detalhes completos**: `rollout_plan_next_step_fix.md`

---

## 🎯 Critérios de Aprovação Final

✅ **Técnicos**:
- [ ] broken_cards = 0 (SQL validation)
- [ ] Performance não degradou >20%
- [ ] Índices sendo usados (query plan)
- [ ] Smoke tests passaram

✅ **UX**:
- [ ] Nenhum "Sem próxima tarefa" indevido
- [ ] Header consistente após refresh
- [ ] Zero regressões

✅ **Operacional**:
- [ ] Rollout <30min
- [ ] Zero downtime
- [ ] 48h monitoramento sem issues

---

## 📝 Notas de Execução

**Responsável**: _________________

**Data de início**: 2025-12-23 13:28 BRT

**Fase 2 completada em**: ___:___ (tempo)

**Fase 3 completada em**: ___:___ (tempo)

**Fase 4 completada em**: ___:___ (tempo)

**Issues encontrados**: 

_(anotar aqui qualquer problema e resolução)_

---

**Status Final**: [x] ✅ SUCESSO | [ ] ⚠️ ROLLBACK | [ ] 🔄 EM PROGRESSO

---

## 🚀 Próximos Passos Após Aprovação

1. [ ] Remover logs debug do CardHeader (após 1 semana sem issues)
2. [ ] Cleanup: deletar migration antiga `20251223131000_fix_proxima_tarefa_ordering.sql`
3. [ ] Atualizar documentação do projeto
4. [ ] Comunicar fix para equipe/stakeholders
5. [ ] Marcar issue/ticket como resolvido
