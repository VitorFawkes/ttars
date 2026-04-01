# Code Reviewer — Memoria Persistente

## Protocolo de Escrita

**Regras para adicionar novos padroes:**
- Cada item: max 4 linhas (Padrao + Impacto + Arquivo + Regra)
- Numerar sequencialmente. NUNCA duplicar numeros.
- Se confirmado OK (nao e bug): mover para §Padroes Confirmados ou DELETAR
- Se corrigido pelo codigo: DELETAR (nao manter historico de bugs fixados)
- ANTES de adicionar: `wc -l` deste arquivo. Se > 180 linhas → comprimir antes

---

## Erros Recorrentes

### 1. Migration SQL nao reflete schema real do banco
Colunas adicionadas via Dashboard sem atualizar .sql. Sempre comparar `database.types.ts` com `supabase/migrations/`.

### 2. Tailwind classes inexistentes (h-4.5, w-4.5)
Escala correta: h-3(12px), h-4(16px), h-5(20px). Class invalida e silenciosamente ignorada.

### 3. group-hover sem classe group no ancestral
Elemento com `group-hover:*` sem o pai ter `className="group"` → permanece invisivel.

### 9. RPC reescrita perde logica de versoes anteriores
**REGRA:** Antes de reescrever RPC critica, diff linha a linha com versao anterior. Regressoes classicas: perda de validacao telefone, perda de `find_contact_by_whatsapp()`, uso de colunas legadas.

### 13. queryKey com objeto nao serializado causa refetch
Objetos na queryKey devem ser `JSON.stringify`. React Query compara por referencia para objetos.

### 14. catch vazio silencia erros sem toast
REGRA: `.mutateAsync` em UI deve ter try/catch com toast.error. Visto em: ReportViewer, DashboardViewer.

### 19. Botoes icone-only sem aria-label
REGRA: `<button>` com apenas `<Icon />` precisa de aria-label. GovernanceConsole (X fechar, Trash2 delete), DashboardViewer, ReportViewer.

### 26. database.types.ts desatualizado apos migration com RPCs novas
**REGRA:** Apos migration que adiciona/remove campos em RPCs: `npx supabase gen types typescript --project-id szyrzxvlptqqheizyrxu > src/database.types.ts`

### 27. useMutation onSuccess async: isPending permanece true
Post-processamento longo dentro de onSuccess mantem isPending=true e botoes desabilitados. Mover pos-processamento para FORA do onSuccess.

### 36. queryKey compartilhado com filtro diferente polui cache
queryKeys corretos: `['active-profiles-list']` (ativos), `['profiles-list']` (display), `['users']` (EXCLUSIVO useUsers.ts admin).

### 38. activities INSERT usa coluna 'dados' em vez de 'metadata' — CRITICO
Padrao correto: `(card_id, tipo, descricao, metadata, created_by, created_at)`.

### 40. Migration sem BEGIN/COMMIT quando contem DROP + CREATE — ALTO
Se CREATE falhar apos DROP sem transacao, funcao some permanentemente. Envolver em BEGIN; ... COMMIT;

### 41. database.types.ts desatualizado apos mudanca de assinatura de RPC — CRITICO
Frontend usa `(supabase as any).rpc(...)` para contornar, mas TypeScript nao valida os args. Regenerar types apos mudanca de assinatura.

### 42. Interface TypeScript local nao sincronizada com novo campo de tabela — MEDIO
Ao adicionar coluna em tabela com interface TypeScript local (ex: `notifications`), atualizar AMBAS as interfaces.

### 48. Hook condicional via string vazia polui cache React Query — ALTO
Passar `''` como ID cria entrada `['cache-key', '']` no cache para cada instancia. Usar `enabled` como parametro opcional.
Reincidencia: `DynamicSectionWidget.tsx` L454 — `useCardAlerts(isAlertas ? card.id! : '')` — mesmo padrao.

### 50. Helpers duplicados entre hooks — MEDIO
Extrair helpers compartilhados (ex: `blobToBase64`, `N8N_WEBHOOK_URL`) para arquivo fonte unico.

### 53. invalidateQueries com queryKey errada (singular vs plural) nao propaga — MEDIO
`GovernanceConsole` invalida `['stage-field-config-all']` mas `useFieldConfig` registra `['stage-field-configs-all']` (plural).
Mutacoes no console nao atualizam a matriz do Studio nem o quality gate. Verificar ortografia exata de todas as queryKeys ao invalidar.

### 54. Query local de pipeline_stages duplica usePipelineStages — ALTO
`GovernanceConsole` (L92-110) faz query propria de `pipeline_stages` com sort identico ao centralizado em `usePipelineStages`.
queryKey privada `['pipeline-stages-governance']` nao e invalidada pelo Studio. Correto: usar `usePipelineStages(pipelineId)`.

### 55. UUIDs hardcoded em pagina de importacao — ALTO
`ImportacaoPosVendaPage.tsx` L26-33 hardcoda stage_ids, SAMANTHA_ID, TEAM_PLANNER_ID, pipeline_id no codigo.
UUIDs mudam entre ambientes (staging vs prod). Extrair para constants.ts ou buscar do banco por slug/nome.

### 56. Dupla contagem de valor em cpfValues quando key ja existe — ALTO
`ImportacaoPosVendaPage.tsx` L303-306: `existing.total += r.valorTotal` E depois `cpfValues.get(key)!.total += r.valorTotal`.
Quando o CPF ja esta no Map, o valor e somado duas vezes. Remover um dos dois incrementos.

### 57. database.types.ts nao regenerado apos adicao de RPCs novas — CRITICO
`bulk_create_pos_venda_cards` e `revert_pos_venda_import_items` nao aparecem em database.types.ts.
Frontend usa `(supabase as any).rpc(...)` sem validacao TypeScript dos parametros. Padrao recorrente (ver #41).

### 58. setState no corpo do componente (fora de useEffect) — ALTO
`PessoasWidget.tsx` L36-40: bloco `if (!sscLoading && !configApplied) { setState... }` fora de qualquer hook.
Causa re-render imediato no mesmo ciclo; em StrictMode executa dobrado. Padrao correto: `useEffect` com `[sscLoading]`.

### 59. alert() nativo em vez de toast.error — MEDIO
`PessoasField.tsx` L94: `alert('Erro ao remover contato')`. Padrao do projeto e `toast.error()` do Sonner.
Verificar arquivos com `.catch` que nao importam `toast`.

### 60. onContactsAdded callback com tipo mais restrito que o contrato — MEDIO
`PessoasWidget.handleBatchContactsAdded` tipado como `{ id, nome }[]` mas recebe `SelectedContact[]` em runtime.
REGRA: Callbacks que recebem dados de `ContactSelector` devem tipar `SelectedContact[]` ou importar o tipo.

### 61. mutate() + setDismissed() no mesmo click fecha UI mesmo se mutacao falhar — ALTO
`CardDetail.tsx` L226-228: `markAllAlertsRead.mutate()` seguido de `setAlertOverlayDismissed(true)` no mesmo handler.
Se a mutacao falhar, overlay fecha mas alertas permanecem nao lidos — na proxima abertura o overlay reaparece confundindo o usuario.
REGRA: Quando fechar UI depende do sucesso da mutacao, usar `.mutateAsync` com try/catch ou mover o dismiss para `onSuccess`.

### 62. Constante literal declarada dentro do componente — BAIXO
`SCROLL_KEY = 'kanban-scroll-left'` em `KanbanBoard.tsx` L82 recriada a cada render.
REGRA: Strings/numeros constantes sem dependencia do componente devem ser declaradas no escopo do modulo.

### 63. Comentarios de rascunho de depuracao deixados no arquivo — MEDIO
`KanbanBoard.tsx` L125-137: bloco de 13 linhas de raciocinio de escrita ("This is TRICKY", "Wait. If we return early...").
REGRA: Comentarios que descrevem o processo de pensar o codigo (nao o codigo em si) devem ser removidos antes do merge.

### 64. sessionStorage key nao inclui productFilter — BAIXO
`KanbanBoard.tsx`: `'kanban-scroll-left'` e compartilhado entre TRIPS e WEDDING.
Ao trocar produto, o scroll restaurado e o do outro produto. Correto: `kanban-scroll-left-${productFilter}`.

### 65. formatDisplayValue: ordem de branches captura data_exata como range_meses — ALTO
`AIExtractionReviewModal.tsx` L54-72: `EpocaViagem` do tipo `data_exata` tem `mes_inicio + mes_fim + data_inicio`.
Branch `mes_inicio/mes_fim` (L57) dispara antes da branch `data_inicio/data_fim` (L65) — exibe "Agosto a Agosto/2026" em vez de "15/08/2026 a 30/08/2026".
REGRA: Em `formatDisplayValue` com shape `EpocaViagem`, checar `data_inicio` antes de `mes_inicio`.

### 66. Set.size comparado com subset filtrado causa toggle invertido — ALTO
`toggleAllTrips` (ImportacaoPosVendaPage.tsx L1108): `prev.size >= actionableTrips.length` falha quando Set inclui IDs de trips com action=skip (inicializados junto). Desmarcar-tudo dispara na primeira interacao.
REGRA: Ao comparar tamanho de Set com um subconjunto, filtrar o Set antes de comparar: `[...prev].filter(id => actionableIds.has(id)).length`.

### 67. selectedTrips inicializado com trips nao-acionaveis — MEDIO
`ImportacaoPosVendaPage.tsx` L904: `new Set(fullTrips.map(t => t.id))` inclui trips com action=skip.
Checkbox aparece marcado para viagens que serao puladas de qualquer forma — confusao visual. Inicializar apenas com `fullTrips.filter(t => t.action !== 'skip')`.

### 68. Coluna inserida que existe apenas como comentario no schema — ALTO
`previous_state` inserida em `pos_venda_import_log_items` (L1049, L1068) mas coluna esta apenas como `-- previous_state jsonb NULL` no baseline, nunca criada via migration ativa.
INSERT com `as any` silencia o erro — dado perdido invisivelmente. REGRA: Verificar schema real (nao comentarios) antes de inserir campos.

### 70. .not('col', 'is', null) em coluna NOT NULL e no-op silencioso — ALTO
`useStageRequirements.ts` L134: `.not('requirement_type', 'is', null)` nao exclui nada porque coluna tem `NOT NULL DEFAULT 'field'`.
Intento era separar visibility configs (type='field') de action requirements (type='proposal'/'task'). Filtro correto seria `.neq('requirement_type', 'field')` ou `.in('requirement_type', ['proposal','task','rule','document'])`.

### 71. <a href> para rota interna viola regra de navegacao — MEDIO
`StudioUnified.tsx` L409 e L561: `<a href="/settings/customization/sections">` causa full page reload.
REGRA: Rotas internas DEVEM usar `<Link to>` (react-router-dom) ou `navigate()`. Ver Padroes Confirmados.

### 72. allSame em useFieldConfig nao compara is_secondary — BAIXO
`useFieldConfig.ts` L129-133: `allSame` compara `is_visible`, `is_required`, `show_in_header` mas omite `is_secondary`.
Dois siblings com is_secondary diferente ainda ativam o fallback — o valor de is_secondary do primeiro sibling e herdado arbitrariamente.

### 69. queryKey com array nao ordenado nao compartilha cache entre componentes — ALTO
`PessoasWidget` e `TravelHistorySection` usam `['travel-history', contactIds]` com arrays construidos independentemente.
Se a ordem dos IDs diferir entre renders, React Query trata como chaves diferentes — cache nao e reaproveitado e fetch duplo ocorre.
REGRA: Arrays usados em queryKey que devem ser compartilhados entre componentes precisam ser ordenados (`[...ids].sort()`) antes de entrar na chave.

---

## Padroes do Projeto Confirmados

### Hooks
- Mutations: exportar `mutation.mutateAsync` (nao .mutate)
- `invalidateAll`: invalida query especifica + `['cards']` para sync global
- `enabled: !!id` em todas as queries com ID

### Navegacao interna
NUNCA `<a href>` ou `window.location.href` para rotas internas. Usar `<Link to>` ou `navigate()`.

### createElement para LucideIcon dinamico — OK
`createElement(product.icon, { className: "..." })` e o padrao correto para renderizar LucideIcon em variavel. Nao e bug.

### confirm() nativo — OK no projeto
`window.confirm(...)` e padrao aceito para confirmacoes destrutivas em toda a base de codigo.

### ownerIds/tagIds em queryKey — OK
React Query v5 compara arrays de primitivos por valor profundo. string[] na queryKey nao causa problema.
