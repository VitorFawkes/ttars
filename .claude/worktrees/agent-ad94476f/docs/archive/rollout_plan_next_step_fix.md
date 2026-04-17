# Plano de Rollout e Observabilidade: Fix "Sem próxima tarefa"

## Ordem de Execução (Sequential, não paralelo)

### Fase 1: Preparação e Backup (5-10 min)
**Quando**: Horário de baixo tráfego recomendado

1. **Backup do banco** (safety first)
   ```bash
   # Via Supabase Dashboard:
   # Settings → Database → Create backup
   
   # Ou via CLI:
   supabase db dump -f backup_pre_next_step_fix.sql
   ```

2. **Snapshot do estado atual** (baseline para comparação)
   ```sql
   -- Salvar métricas pré-fix
   CREATE TEMP TABLE pre_fix_metrics AS
   SELECT 
       count(*) as total_cards,
       count(*) FILTER (WHERE tarefas_pendentes > 0) as cards_with_pending,
       count(*) FILTER (WHERE tarefas_pendentes > 0 AND proxima_tarefa IS NULL) as broken_cards,
       avg(tarefas_pendentes) as avg_pending_per_card
   FROM view_cards_acoes;
   
   SELECT * FROM pre_fix_metrics;
   -- Anotar os números, especialmente "broken_cards"
   ```

3. **Commit/push do código** (garantir que frontend está sincronizado)
   ```bash
   git status
   git add .
   git commit -m "fix: resolve 'Sem próxima tarefa' bug with deterministic ordering"
   git push
   ```

---

### Fase 2: Aplicação das Migrations (10-15 min)

**Ordem crítica**:
1. Migration principal (view)
2. Migration de índices (performance)

#### 2.1: Aplicar migration da view

```bash
# Opção A: Via Supabase CLI (recomendado para ter controle)
cd /Users/vitorgambetti/Documents/WelcomeCRM
supabase db push

# Opção B: Via Supabase Dashboard SQL Editor
# Copiar e executar: 20251223132000_fix_proxima_tarefa_final.sql
```

**Validação imediata**:
```sql
-- Verificar view foi recriada
SELECT 
    schemaname, 
    viewname, 
    definition 
FROM pg_views 
WHERE viewname = 'view_cards_acoes';

-- Deve conter "NULLS LAST" e "created_at DESC, id DESC" na definição
```

#### 2.2: Aplicar migration de índices

```bash
# Rodar migration de índices
# 20251223132100_add_performance_indexes.sql

# IMPORTANTE: Esta migration usa CONCURRENTLY
# Não bloqueia reads/writes, mas demora mais (~5-10min dependendo do tamanho)
```

**Monitorar progresso**:
```sql
-- Ver progresso da criação de índices
SELECT 
    phase,
    round(100.0 * blocks_done / nullif(blocks_total, 0), 1) AS "% done",
    blocks_done,
    blocks_total,
    tuples_done,
    tuples_total
FROM pg_stat_progress_create_index;

-- Quando vazio, índices foram criados
```

**Validação de índices**:
```sql
-- Confirmar índices criados
SELECT 
    indexname,
    indexdef
FROM pg_indexes
WHERE tablename = 'tarefas'
  AND indexname LIKE 'idx_tarefas_%';

-- Esperado: 3-4 índices novos incluindo idx_tarefas_proxima_tarefa_optimized
```

---

### Fase 3: Deploy do Frontend (5 min)

**Triggers de deploy** (dependendo do setup):
```bash
# Se Vercel/Netlify/etc: push automatically triggers deploy
git push origin main

# Se deploy manual:
npm run build
# [seguir processo de deploy do projeto]
```

**Aguardar**: Deploy completar (verificar logs do serviço de hosting)

---

### Fase 4: Validação Pós-Deploy (10 min)

#### 4.1: Verificação SQL

```sql
-- Métrica principal: broken_cards deve ser 0
SELECT 
    count(*) FILTER (WHERE tarefas_pendentes > 0 AND proxima_tarefa IS NULL) as broken_cards
FROM view_cards_acoes;

-- Esperado: 0 (era > 0 antes do fix)

-- Comparação antes/depois
SELECT 
    'BEFORE' as momento,
    * 
FROM pre_fix_metrics
UNION ALL
SELECT 
    'AFTER' as momento,
    count(*) as total_cards,
    count(*) FILTER (WHERE tarefas_pendentes > 0) as cards_with_pending,
    count(*) FILTER (WHERE tarefas_pendentes > 0 AND proxima_tarefa IS NULL) as broken_cards,
    avg(tarefas_pendentes) as avg_pending_per_card
FROM view_cards_acoes;
```

#### 4.2: Testes Manuais (Smoke Tests)

1. **Abrir 3-5 cards diferentes** no frontend
2. Para cada card:
   - Verificar header mostra próxima tarefa corretamente
   - F5 (refresh)
   - Confirmar header não muda
3. **Criar 1 tarefa nova**:
   - Salvar
   - Verificar header atualiza
   - F5
   - Confirmar header mantém

**Critério de sucesso**: Nenhum "Sem próxima tarefa" indevido aparece.

---

## Métricas e Observabilidade

### Métricas Críticas (monitorar por 24-48h)

#### 1. **Broken Cards** (principal KPI do fix)
```sql
-- Rodar a cada 1-2 horas nas primeiras 24h
SELECT 
    now() as checked_at,
    count(*) FILTER (WHERE tarefas_pendentes > 0 AND proxima_tarefa IS NULL) as broken_cards,
    count(*) FILTER (WHERE tarefas_pendentes > 0) as total_cards_with_tasks
FROM view_cards_acoes;

-- Criar log manual ou salvar em planilha
-- Esperado: broken_cards = 0 sempre
```

#### 2. **Performance da View** (não deve degradar)
```sql
-- Rodar 2-3x por dia
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM view_cards_acoes LIMIT 100;

-- Anotar "Planning Time" e "Execution Time"
-- Baseline antes do fix: ___ ms
-- Após fix: não deve ser >20% mais lento
```

#### 3. **Index Usage** (confirmar índices estão sendo usados)
```sql
-- Rodar 1x por dia
SELECT 
    indexname,
    idx_scan as scans,
    idx_tup_read as tuples_read,
    pg_size_pretty(pg_relation_size(indexrelid)) as size
FROM pg_stat_user_indexes
WHERE tablename = 'tarefas'
  AND indexname LIKE 'idx_tarefas_proxima%'
ORDER BY idx_scan DESC;

-- Esperado: idx_scan aumentando diariamente (índice está sendo usado)
```

### Logs do Frontend (opcional, mas recomendado)

Adicionar logging temporário no `CardHeader.tsx`:

```typescript
// No componente CardHeader, após useQuery do card
useEffect(() => {
    if (card?.proxima_tarefa) {
        console.log('[DEBUG] proxima_tarefa:', {
            titulo: card.proxima_tarefa.titulo,
            data: card.proxima_tarefa.data_vencimento,
            pendentes: card.tarefas_pendentes
        })
    } else if (card?.tarefas_pendentes > 0) {
        console.warn('[BUG] Card has pending tasks but no proxima_tarefa!', {
            cardId: card.id,
            pendentes: card.tarefas_pendentes
        })
        // Opcional: enviar para Sentry/monitoring
    }
}, [card])
```

**Remover após 1 semana** se nenhum warning aparecer.

---

## Rollback Seguro (se algo der errado)

### Cenário 1: Migration causou erro no banco

**Sintomas**: View não carrega, erros SQL nos logs

**Ação**:
```sql
-- Reverter migration principal
-- (copiar SQL da migration anterior de view_cards_acoes, exemplo: 20251223120000_fix_tempo_etapa_dias.sql)
-- E re-executar

-- Ou restaurar backup
-- Via Supabase Dashboard: Settings → Database → Restore backup
```

### Cenário 2: Performance degradou significativamente

**Sintomas**: View >2x mais lenta, timeouts

**Ação**:
```sql
-- 1. Manter a view (é mais correta), mas drop dos índices temporariamente
DROP INDEX CONCURRENTLY IF EXISTS idx_tarefas_proxima_tarefa_optimized;
DROP INDEX CONCURRENTLY IF EXISTS idx_tarefas_counts_optimized;
DROP INDEX CONCURRENTLY IF EXISTS idx_tarefas_ultima_interacao;

-- 2. Investigar query plan e otimizar índices
-- 3. Re-criar índices otimizados
```

### Cenário 3: Bug ainda reproduz (improvável)

**Sintomas**: Usuários ainda reportam "Sem próxima tarefa" após refresh

**Ação**:
1. **Coletar evidência**:
   ```sql
   -- Para o card reportado
   SELECT * FROM view_cards_acoes WHERE id = 'CARD_ID';
   
   SELECT * FROM tarefas 
   WHERE card_id = 'CARD_ID' AND COALESCE(concluida, false) = false
   ORDER BY data_vencimento ASC NULLS LAST, created_at DESC, id DESC;
   ```

2. **Executar diagnostic script**:
   ```bash
   psql < diagnostic_next_step_bug.sql
   ```

3. **NÃO reverter imediatamente** - a correção é objetivamente mais robusta
   - Investigar se há outro edge case não coberto
   - Possível causa: cache do React Query com staleTime muito alto (ajustar no código)

### Cenário 4: Frontend quebrou (deploy falhou)

**Sintomas**: Erros no console, página não carrega

**Ação**:
```bash
# Reverter commit
git revert HEAD
git push origin main

# Ou: Re-deploy versão anterior via plataforma de hosting
```

**IMPORTANTE**: A migration do banco pode ficar, ela é benéfica independente do frontend.

---

## Timeline de Monitoramento

| Tempo | Ação | Responsável |
|-------|------|-------------|
| T+0 (deploy) | Smoke tests manuais | Engenheiro |
| T+1h | Check broken_cards metric | Engenheiro |
| T+4h | Check performance + index usage | Engenheiro |
| T+24h | Review logs do frontend para warnings | Engenheiro |
| T+48h | Final validation, remover logs debug | Engenheiro |
| T+1 semana | Cleanup: remover card de teste, consolidar docs | Tech Lead |

---

## Comunicação

### Antes do deploy:
- ✅ Avisar equipe técnica (se houver)
- ✅ Definir janela de manutenção (se aplicável)

### Durante o deploy:
- ✅ Status updates no Slack/Discord (se aplicável)

### Após o deploy:
- ✅ Confirmar em canal de tech: "Deploy concluído, monitorando"
- ✅ Após 24h sem issues: "Fix validado, bug resolvido"

---

## Checklist de Rollout

- [ ] Backup do banco criado
- [ ] Baseline metrics coletadas
- [ ] Migration da view aplicada
- [ ] Migration de índices aplicada (CONCURRENTLY)
- [ ] Índices criados e verificados
- [ ] Frontend deployed
- [ ] Smoke tests passaram
- [ ] Metric "broken_cards" = 0
- [ ] Performance não degradou
- [ ] Logs do frontend não mostram warnings
- [ ] Comunicação pós-deploy enviada

**Status final**: ✅ ROLLOUT COMPLETO

---

## Contato de Emergência

Se houver problema crítico:
1. Verificar seção "Rollback Seguro" acima
2. Se necessário, pausar aplicação temporariamente
3. Coletar logs/evidências antes de reverter
4. Abrir issue no repositório com detalhes completos
