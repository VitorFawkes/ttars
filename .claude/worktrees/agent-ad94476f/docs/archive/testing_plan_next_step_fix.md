# Plano de Testes: Fix "Sem próxima tarefa"

## Objetivos
Validar que as correções eliminam o bug em todos os cenários, incluindo edge cases.

---

## Setup Inicial

### Preparação do ambiente
```bash
# 1. Aplicar migrations
cd /Users/vitorgambetti/Documents/WelcomeCRM
supabase db push

# 2. Verificar migrations aplicadas
supabase db status

# 3. Frontend deve estar rodando
npm run dev
```

### Query SQL de apoio (cole no Supabase SQL Editor)
```sql
-- Helper: Criar card de teste com múltiplas tarefas
DO $$
DECLARE
    test_card_id UUID;
    test_user_id UUID;
BEGIN
    -- Get first user
    SELECT id INTO test_user_id FROM profiles LIMIT 1;
    
    -- Create test card
    INSERT INTO cards (titulo, produto, dono_atual_id, status_comercial)
    VALUES ('TEST: Bug Validation Card', 'TRIPS', test_user_id, 'aberto')
    RETURNING id INTO test_card_id;
    
    -- Insert tasks with various scenarios
    -- 1. Task with NULL data_vencimento
    INSERT INTO tarefas (card_id, titulo, tipo, concluida, prioridade, data_vencimento)
    VALUES (test_card_id, 'Task com data NULL', 'outro', false, 'baixa', NULL);
    
    -- 2. Task with same date as #3 but created earlier
    INSERT INTO tarefas (card_id, titulo, tipo, concluida, prioridade, data_vencimento, created_at)
    VALUES (test_card_id, 'Task com data duplicada (antiga)', 'follow_up', false, 'media', 
            CURRENT_DATE + INTERVAL '2 days', NOW() - INTERVAL '1 hour');
    
    -- 3. Task with same date as #2 but created later (should win)
    INSERT INTO tarefas (card_id, titulo, tipo, concluida, prioridade, data_vencimento)
    VALUES (test_card_id, 'Task com data duplicada (nova - deve vencer)', 'follow_up', false, 'alta', 
            CURRENT_DATE + INTERVAL '2 days');
    
    -- 4. Task with earliest date (should be proxima_tarefa despite #3 being newer)
    INSERT INTO tarefas (card_id, titulo, tipo, concluida, prioridade, data_vencimento)
    VALUES (test_card_id, 'Task mais próxima (DEVE SER A ESCOLHIDA)', 'ligacao', false, 'alta', 
            CURRENT_DATE);
    
    -- 5. Completed task (should be ignored)
    INSERT INTO tarefas (card_id, titulo, tipo, concluida, prioridade, data_vencimento)
    VALUES (test_card_id, 'Task concluída (ignorar)', 'outro', true, 'baixa', CURRENT_DATE - INTERVAL '1 day');
    
    RAISE NOTICE 'Test card created with ID: %', test_card_id;
END $$;
```

---

## Teste 1: Refresh Não Muda Header

**Objetivo**: Garantir que após criar tarefa e fazer F5, o header continua mostrando a mesma tarefa.

### Passos:
1. Abrir card de teste no navegador
2. **Verificar estado inicial**:
   - Header deve mostrar "Task mais próxima (DEVE SER A ESCOLHIDA)"
   - Badge deve mostrar "Para hoje" ou dias até vencimento
3. **Criar nova tarefa**:
   - Clicar "Nova Tarefa"
   - Título: "Teste de Refresh"
   - Data: Hoje
   - Salvar
4. **Verificar imediatamente**:
   - Header deve atualizar para "Teste de Refresh"
5. **Fazer F5 (refresh completo)**
6. **Verificar após refresh**:
   - ✅ Header DEVE continuar mostrando "Teste de Refresh"
   - ❌ NÃO PODE voltar para "Sem próxima tarefa" ou outra tarefa

### Query SQL de validação:
```sql
-- Verificar qual tarefa a view está retornando
SELECT 
    id,
    titulo,
    (proxima_tarefa->>'titulo') as proxima_tarefa_titulo,
    (proxima_tarefa->>'data_vencimento')::date as proxima_data,
    tarefas_pendentes
FROM view_cards_acoes
WHERE titulo LIKE 'TEST:%'
ORDER BY created_at DESC
LIMIT 1;
```

**Critério de sucesso**: Header deve ser idêntico antes e depois do F5.

---

## Teste 2: Ordenação Determinística (Tie-Breaker)

**Objetivo**: Quando 2 tarefas têm mesma `data_vencimento`, a mais recente (por `created_at`) deve vencer.

### Passos:
1. Usar o card de teste criado no setup (tem tarefas duplicadas)
2. **Verificar no SQL**:
```sql
-- Ver ordenação aplicada pela view
SELECT 
    t.id,
    t.titulo,
    t.data_vencimento,
    t.created_at,
    t.concluida,
    ROW_NUMBER() OVER (
        PARTITION BY t.card_id 
        ORDER BY 
            t.data_vencimento ASC NULLS LAST, 
            t.created_at DESC, 
            t.id DESC
    ) as rank
FROM tarefas t
WHERE t.card_id = (SELECT id FROM cards WHERE titulo LIKE 'TEST:%' LIMIT 1)
  AND COALESCE(t.concluida, false) = false
ORDER BY rank;
```

3. **Verificar resultado esperado**:
   - Rank 1 = "Task mais próxima (DEVE SER A ESCOLHIDA)" (data = hoje)
   - Rank 2 = "Task com data duplicada (nova)" (created_at mais recente)
   - Rank 3 = "Task com data duplicada (antiga)" (created_at mais antigo)
   - Último rank = "Task com data NULL"

4. **Validar no frontend**:
   - Abrir card
   - Verificar header mostra a tarefa de rank 1

**Critério de sucesso**: A tarefa com menor `data_vencimento` vence. Em empate, a com maior `created_at` vence.

---

## Teste 3: NULL Handling (`concluida` e `data_vencimento`)

**Objetivo**: Tarefas com `concluida = NULL` ou `data_vencimento = NULL` são tratadas corretamente.

### 3A: `concluida = NULL` deve ser tratado como `false`

```sql
-- 1. Criar tarefa com concluida = NULL (forçar)
INSERT INTO tarefas (card_id, titulo, tipo, prioridade, data_vencimento, concluida)
SELECT id, 'Task com concluida NULL', 'outro', 'baixa', CURRENT_DATE + INTERVAL '1 day', NULL
FROM cards WHERE titulo LIKE 'TEST:%' LIMIT 1;

-- 2. Verificar que aparece como pendente
SELECT 
    titulo,
    tarefas_pendentes,
    (proxima_tarefa->>'titulo') as proxima
FROM view_cards_acoes
WHERE titulo LIKE 'TEST:%';

-- Esperado: tarefas_pendentes deve incluir a task NULL, 
--           e proxima_tarefa pode ser ela se for a mais próxima
```

**Critério de sucesso**: Task com `concluida NULL` aparece como pendente e pode ser selecionada como próxima.

### 3B: `data_vencimento = NULL` deve ir para o final (NULLS LAST)

```sql
-- Ver que task com data NULL está no final da ordenação
SELECT 
    titulo,
    data_vencimento,
    CASE 
        WHEN data_vencimento IS NULL THEN 'NULL (deve ser última)'
        ELSE data_vencimento::text
    END as data_display
FROM tarefas
WHERE card_id = (SELECT id FROM cards WHERE titulo LIKE 'TEST:%' LIMIT 1)
  AND COALESCE(concluida, false) = false
ORDER BY 
    data_vencimento ASC NULLS LAST,
    created_at DESC,
    id DESC;
```

**Critério de sucesso**: Tarefas sem data aparecem por último na ordenação.

---

## Teste 4: Race Condition com Rede Lenta

**Objetivo**: Simular latência de rede e garantir que a UI não "volta" para estado antigo após alguns segundos.

### Passos:
1. **Abrir DevTools → Network**
2. **Configurar throttling**:
   - Preset: "Slow 3G" ou "Fast 3G"
   - Ou custom: Download 400kb/s, Upload 200kb/s, Latency 500ms
3. **Criar nova tarefa**:
   - Título: "Teste com rede lenta"
   - Data: Amanhã
   - Clicar "Salvar"
4. **Observar**:
   - Modal deve fechar somente APÓS loading terminar
   - Header deve atualizar para a nova tarefa
5. **Aguardar 10 segundos** sem interagir
6. **Verificar**:
   - ✅ Header DEVE permanecer com "Teste com rede lenta"
   - ❌ NÃO PODE voltar para estado anterior ou "Sem próxima tarefa"

**Critério de sucesso**: Mesmo com rede lenta, o estado final é consistente e não há "flicker" de volta ao estado anterior.

---

## Teste 5: Toggle Task (Marcar como Concluída)

**Objetivo**: Ao marcar tarefa como concluída, o header atualiza imediatamente para a próxima tarefa.

### Passos:
1. Card deve ter pelo menos 2 tarefas pendentes
2. **Estado inicial**:
   - Header mostra a primeira tarefa (ex: "Task A")
3. **Marcar "Task A" como concluída**:
   - Clicar no checkbox da tarefa
4. **Verificar imediatamente**:
   - ✅ Header deve atualizar para "Task B" (próxima na fila)
   - ✅ "Task A" deve aparecer em "Concluídos"
5. **Fazer F5**
6. **Verificar após refresh**:
   - ✅ Header continua mostrando "Task B"
   - ❌ NÃO pode voltar para "Task A" ou "Sem próxima tarefa"

**Critério de sucesso**: Toggle + refresh mantém consistência.

---

## Teste 6: Caso Extremo - Todas Tarefas com Mesma Data

**Objetivo**: Validar tie-breaker final por `id DESC`.

```sql
-- Criar 3 tarefas com EXATAMENTE a mesma data E mesmo created_at
DO $$
DECLARE
    test_card_id UUID;
    fixed_date TIMESTAMPTZ := '2025-12-25 12:00:00'::timestamptz;
BEGIN
    SELECT id INTO test_card_id FROM cards WHERE titulo LIKE 'TEST:%' LIMIT 1;
    
    -- Insert with exact same timestamp
    INSERT INTO tarefas (card_id, titulo, tipo, concluida, data_vencimento, created_at)
    VALUES 
        (test_card_id, 'Tie A', 'outro', false, fixed_date, fixed_date),
        (test_card_id, 'Tie B', 'outro', false, fixed_date, fixed_date),
        (test_card_id, 'Tie C', 'outro', false, fixed_date, fixed_date);
END $$;

-- Verificar ordenação por ID
SELECT 
    id,
    titulo,
    ROW_NUMBER() OVER (ORDER BY data_vencimento ASC NULLS LAST, created_at DESC, id DESC) as rank
FROM tarefas
WHERE card_id = (SELECT id FROM cards WHERE titulo LIKE 'TEST:%' LIMIT 1)
  AND titulo LIKE 'Tie %'
ORDER BY rank;
```

**Critério de sucesso**: A tarefa com maior `id` (mais recente no banco) vence. Ordenação deve ser 100% consistente entre refetches.

---

## Teste 7: Regressão - Funcionalidades Adjacentes

**Checklist rápido**:
- [ ] Contador "X Futuras" no header ainda funciona?
- [ ] Badge "Para hoje" / "Atrasada há X dias" atualiza corretamente?
- [ ] Lista de tarefas em "Próximos" mostra todas as pendentes?
- [ ] Criar reunião (não tarefa) também atualiza header?
- [ ] Deletar tarefa atualiza header para a próxima?
- [ ] Editar data de vencimento da próxima tarefa re-calcula corretamente?

---

## Verificação Final (SQL)

Após todos os testes, rodar:

```sql
-- 1. Nenhum card deve ter tarefas_pendentes > 0 E proxima_tarefa IS NULL
SELECT 
    id,
    titulo,
    tarefas_pendentes,
    proxima_tarefa
FROM view_cards_acoes
WHERE tarefas_pendentes > 0 
  AND proxima_tarefa IS NULL;

-- Esperado: 0 linhas (se retornar alguma, há bug)

-- 2. Verificar performance da query (deve usar índice)
EXPLAIN (ANALYZE, BUFFERS)
SELECT id, titulo, data_vencimento, prioridade, tipo 
FROM tarefas 
WHERE card_id = (SELECT id FROM cards WHERE titulo LIKE 'TEST:%' LIMIT 1)
  AND COALESCE(concluida, false) = false
ORDER BY data_vencimento ASC NULLS LAST, created_at DESC, id DESC
LIMIT 1;

-- Esperado: "Index Scan using idx_tarefas_proxima_tarefa_optimized"
--           (não deve ser "Seq Scan")
```

---

## Limpeza

```sql
-- Remover card de teste
DELETE FROM tarefas WHERE card_id IN (SELECT id FROM cards WHERE titulo LIKE 'TEST:%');
DELETE FROM cards WHERE titulo LIKE 'TEST:%';
```

---

## Checklist de Aprovação

| Teste | Status | Observações |
|-------|--------|-------------|
| 1. Refresh não muda header | ⬜ | |
| 2. Ordenação determinística | ⬜ | |
| 3A. concluida NULL tratado | ⬜ | |
| 3B. data_vencimento NULL no final | ⬜ | |
| 4. Rede lenta sem race | ⬜ | |
| 5. Toggle task atualiza | ⬜ | |
| 6. Tie-breaker por ID | ⬜ | |
| 7. Sem regressões | ⬜ | |
| Verificação SQL final | ⬜ | |

**Critério de release**: Todos os testes devem estar ✅ antes de deploy para produção.
