# Code Reviewer — Memoria Persistente

## Protocolo de Escrita

**Regras para adicionar novos padroes:**
- Cada item: max 5 linhas (Padrao + Impacto + Arquivo + Regra)
- Numerar sequencialmente. NUNCA duplicar numeros.
- Se confirmado OK (nao e bug): mover para §Padroes Confirmados ou DELETAR
- Se corrigido pelo codigo: DELETAR (nao manter historico de bugs fixados)
- ANTES de adicionar: `wc -l` deste arquivo. Se > 180 linhas → comprimir antes
- `patterns-extended.md` foi DEPRECADO. Tudo fica neste arquivo (max 200 linhas)

---

## Erros Recorrentes

### 1. Migration SQL nao reflete schema real do banco
Colunas adicionadas via Dashboard sem atualizar .sql. Sempre comparar `database.types.ts` com `supabase/migrations/`.

### 2. Tailwind classes inexistentes (h-4.5, w-4.5)
Escala correta: h-3(12px), h-4(16px), h-5(20px). Class invalida e silenciosamente ignorada.

### 3. group-hover sem classe group no ancestral
Elemento com `group-hover:*` sem o pai ter `className="group"` → permanece invisivel.

### 4. campo_contato no seed vs CAMPO_CONTATO_MAP desalinhados
Se `campo_contato` esta preenchido no seed, DEVE ter mapeamento no Map ou ser NULL.

### 5. useCardPeople pode retornar duplicatas
Pessoa principal + viajantes sem deduplicar por ID. `people.length` pode estar errado.

### 6. SmartTaskModal: duracao nao restaurada + icone errado
Edit mode: duracao default 30min, correto: `initialData.metadata.duration_minutes`. Icone `Star` deveria ser `Search`.

### 8. computePositions: totalCols calculado dentro do map (WeekView/DayView)
Items processados antes nao sabem totalCols final do grupo overlap. Bug pre-existente. Fix: 2 passes.

### 9. RPC reescrita perde logica de versoes anteriores
**REGRA:** Antes de reescrever RPC critica, diff linha a linha com versao anterior. Regressoes classicas: perda de validacao telefone, perda de `find_contact_by_whatsapp()`, uso de colunas legadas (`etapa_funil_id`).

### 11. btoa com spread operator falha para arquivos >1MB (Edge Function)
`btoa(String.fromCharCode(...new Uint8Array(buffer)))` → RangeError. Usar `encode` do std/encoding/base64.ts.

### 12. setVisibility nao marca isDirty em Zustand stores
`useReportBuilderStore.setVisibility` falta `isDirty: true`. Mudanca nao dispara beforeunload warning.

### 13. queryKey com objeto nao serializado causa refetch
Objetos na queryKey devem ser `JSON.stringify`. React Query compara por referencia para objetos.

### 14. catch vazio silencia erros sem toast
handleDelete em ReportViewer/DashboardViewer tem catch silencioso. REGRA: `.mutateAsync` em UI deve ter try/catch com toast.error.

### 15. ScrollArea ref aponta para Root, nao Viewport
`ScrollArea` forward ref para Root (overflow:hidden). Auto-scroll via scrollTop e NOOP. Fix: div ref dentro do ScrollArea ou scrollIntoView em sentinela.
Arquivos: AIChat.tsx, WhatsAppHistory.tsx.

### 16. useChatIA: chat_history usa closure stale
`messages` na closure do useCallback nao inclui ultima msg. Fix: usar `useRef` para espelhar messages.

### 17. useChatIA sem cleanup no unmount
Falta `useEffect(() => () => abortRef.current?.abort(), [])`. Request continua apos desmonte.

### 18. toggleAI sem feedback de erro
ConversationHistory: try/finally sem catch com toast. UPDATE Supabase falha silenciosamente.

### 19. Botoes icone-only sem aria-label
REGRA: `<button>` com apenas `<Icon />` precisa de aria-label. DashboardViewer, ReportViewer.

### 21. DashboardFilters: dateRange default em custom usa YYYY-MM-DD
`handleDatePresetChange` usa `.toISOString().split('T')[0]`. Pode quebrar comparacao de data em RPCs.

### 22. documentos source sem filtro de data no engine
`report_query_engine` nao aplica p_date_start/p_date_end para source 'documentos'. Data silenciosamente ignorada.

### 23. Presets stale quando persistidos no DashboardViewer
`dateRange` resolvido e persistido, nao o `datePreset`. 'today' nunca e "hoje" apos o dia de criacao.
Correto: re-resolver preset ao carregar, ou persistir apenas datePreset.

### 24. ORDER BY %I falha para campos com ponto
`format('ORDER BY %I', 'ps.nome')` → `"ps.nome"` (nome unico, nao tabela.coluna). Bug pre-existente.
Correto: usar alias da dimensao (dim_0, dim_1).

### 26. database.types.ts desatualizado apos migration com RPCs novas
**REGRA:** Apos migration que adiciona/remove campos em RPCs: `npx supabase gen types typescript --project-id szyrzxvlptqqheizyrxu > src/database.types.ts`

### 27. useMutation onSuccess async: isPending permanece true
Post-processamento longo (ex: briefing IA) dentro de onSuccess mantem isPending=true e botoes desabilitados.
Correto: mover pos-processamento para FORA do onSuccess (apos mutateAsync).

### 28. Record<string, unknown> quebra acesso por indice em JSX
`top_destinations: Record<string, unknown>` → `top_destinations?.[0]` e `unknown`, nao e ReactNode. TS2322.
Regra: para arrays JSON do banco, preferir `unknown[]` ou `any[]`.

### 29. AC valor: centavos vs reais — ver memory/integration-gotchas.md
Fonte autoritativa: `memory/integration-gotchas.md` seção REGRA CRÍTICA.

### 30. migration de correcao nao atualiza valor_final
Migration fix de valor_estimado nao toca valor_final. Cards com proposta aceita podem ter valor_final errado.

### 31. setDatePreset polui store global ao sair da view
Views de snapshot chamam setDatePreset('all_time') sem restaurar no cleanup.
Correto: capturar prev, restaurar no cleanup.
Arquivo: PipelineCurrentView.tsx.

### 32. derivedViewMode deve ser declarado ANTES do useState
`useMemo(derivedViewMode)` ANTES de `useState(derivedViewMode)`. Se useState usa valor hardcoded, estado inicial fica travado.
Arquivos: TripInformation.tsx, ObservacoesEstruturadas.tsx.

### 33. Drill-down current_stage usa dateRange do store global (fragil)
DrillDownContext deveria ter p_date_start/p_date_end opcionais para override explicito em vez de herdar do store.

### 34. Realtime filter por coluna nao-PK requer REPLICA IDENTITY FULL
`whatsapp_messages` sem REPLICA IDENTITY FULL → filtro `card_id=eq.X` falha para UPDATE.
Correto: `ALTER TABLE whatsapp_messages REPLICA IDENTITY FULL;`

### 35. useChatIA ignora cardId quando contactId e null — ALTO
Guard `if (!contactId) return` bloqueia envio quando so cardId existe. Chat silenciosamente nao funciona.
Correto: `if (!question.trim() || (!contactId && !cardId)) return`.
Arquivo: useChatIA.ts linha 28.

### 37. Auto-correcoes em contatos omitem updated_at — MEDIO
Blocos que corrigem dados de contatos existentes (ex: nome 'Sem Nome') nao incluem `updated_at` explicito.
Contact handler (L509) inclui; deal auto-fix (L1088) nao inclui. Verificar se trigger `set_updated_at` existe antes de considerar bug.
Regra: sempre incluir `updated_at: new Date().toISOString()` em updates de correcao para simetria com o contact handler.

### 38. activities INSERT usa coluna 'dados' em vez de 'metadata' — CRITICO
Tabela `activities` tem coluna `metadata jsonb` (ver `20260201700000_create_activities_table.sql`).
Usar `dados` na lista de colunas do INSERT causa erro de runtime no Postgres. Padrao correto: `(card_id, tipo, descricao, metadata, created_by, created_at)`.
Visto em: `20260313_sub_card_fixes.sql` linha 142 (`merge_sub_card`).

### 36. queryKey ['users'] compartilhado com filtro diferente — ALTO
IntegrationMapping.tsx e MetricsWidget.tsx usam `['users']` com `.eq('active', true)`. Cache poluido de useUsers.ts (sem filtro).
**CORRETO:** Usar `['active-profiles-list']` nesses dois arquivos.
**queryKeys corretos:** `['active-profiles-list']` (ativos), `['profiles-list']` (display incluindo inativos), `['users']` (EXCLUSIVO useUsers.ts admin).

---

## Padroes do Projeto Confirmados

### Hooks
- Mutations: exportar `mutation.mutateAsync` (nao .mutate)
- `invalidateAll`: invalida query especifica + `['cards']` para sync global
- `enabled: !!id` em todas as queries com ID

### Navegacao interna
NUNCA `<a href>` ou `window.location.href` para rotas internas. Usar `<Link to>` ou `navigate()`.

### Visibilidade de Widget por Fase
`DocumentCollectionWidget` usa `phaseSlug === 'planner' || phaseSlug === 'pos_venda'`.

### Design System
Cada widget pode ter cor propria (teal para Documentos). Usar tokens Tailwind.

### Arquivos/Storage
`supabase.storage.from('card-documents')`. Tabela `arquivos` tem `pessoa_id` (FK contatos).

### ownerIds/tagIds em queryKey — OK
React Query v5 compara arrays de primitivos por valor profundo. string[] na queryKey nao causa problema.

### useProposals filtro de produto (ineficiente mas funcional)
Step 2 filtra server-side com `.eq('produto', currentProduct)`. Funciona, mas poderia ser otimizado.
