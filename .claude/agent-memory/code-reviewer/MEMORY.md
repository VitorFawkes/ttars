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

### 53/54. invalidateQueries key errada + query duplicada — MEDIO/ALTO
Verificar ortografia exata (singular vs plural) de queryKeys ao invalidar. Nao duplicar queries que ja existem em hooks centralizados (ex: `usePipelineStages`).

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

### 62/63/64. KanbanBoard: constante no escopo errado, comentarios rascunho, scroll key sem produto — BAIXO
Constantes sem dependencia de componente devem ser no modulo. Comentarios de raciocinio removidos antes do merge. sessionStorage key sem `${productFilter}` sufixo mistura produtos.

### 65. formatDisplayValue: ordem de branches captura data_exata como range_meses — ALTO
`AIExtractionReviewModal.tsx` L54-72: `EpocaViagem` do tipo `data_exata` tem `mes_inicio + mes_fim + data_inicio`.
Branch `mes_inicio/mes_fim` (L57) dispara antes da branch `data_inicio/data_fim` (L65) — exibe "Agosto a Agosto/2026" em vez de "15/08/2026 a 30/08/2026".
REGRA: Em `formatDisplayValue` com shape `EpocaViagem`, checar `data_inicio` antes de `mes_inicio`.

### 66/67. Set inicializado com itens nao-acionaveis causa toggle invertido — ALTO
`selectedTrips` inclui trips `action=skip`. `prev.size >= actionableTrips.length` dispara errado.
REGRA: Inicializar Set apenas com itens acionaveis. Comparar filtrando o Set: `[...prev].filter(id => actionableIds.has(id)).length`.

### 68. Coluna inserida que existe apenas como comentario no schema — ALTO
`previous_state` inserida em `pos_venda_import_log_items` (L1049, L1068) mas coluna esta apenas como `-- previous_state jsonb NULL` no baseline, nunca criada via migration ativa.
INSERT com `as any` silencia o erro — dado perdido invisivelmente. REGRA: Verificar schema real (nao comentarios) antes de inserir campos.

### 70. .not('col', 'is', null) em coluna NOT NULL e no-op silencioso — ALTO
`useStageRequirements.ts` L134: `.not('requirement_type', 'is', null)` nao exclui nada porque coluna tem `NOT NULL DEFAULT 'field'`.
Intento era separar visibility configs (type='field') de action requirements (type='proposal'/'task'). Filtro correto seria `.neq('requirement_type', 'field')` ou `.in('requirement_type', ['proposal','task','rule','document'])`.

### 71. <a href> para rota interna viola regra de navegacao — MEDIO
`StudioUnified.tsx` L409 e L561: `<a href="/settings/customization/sections">` causa full page reload.
REGRA: Rotas internas DEVEM usar `<Link to>` (react-router-dom) ou `navigate()`. Ver Padroes Confirmados.

### 73. DROP POLICY IF EXISTS com nomes errados nao falha, mas deixa polices antigas — CRITICO
Migrations de RLS devem verificar nomes EXATOS no baseline. DROP POLICY IF EXISTS silencia o erro se o nome nao bate.
Resultado: policies antigas (cross-org permissivas) permanecem ativas ao lado das novas org-scoped.
REGRA: Antes de DROP POLICY, comparar com `schema-baseline-*.sql` secao RLS Policies da tabela alvo.

### 74. pg_get_functiondef EXECUTE patching nao e idempotente — ALTO
Migrations H3-010/013: replace() em funcdef pode causar dupla injecao se migration rodar mais de uma vez.
Ex: `pip.produto = p_product` substituido por `pip.org_id = ... AND pip.produto = p_product`,
na segunda execucao encontra a substring `pip.produto = p_product` dentro do patch e injeta de novo.
REGRA: Adicionar verificacao `IF position('requesting_org_id()' IN func_def) > 0 THEN CONTINUE` antes do replace.

### 72. allSame em useFieldConfig nao compara is_secondary — BAIXO
`useFieldConfig.ts` L129-133: `allSame` compara `is_visible`, `is_required`, `show_in_header` mas omite `is_secondary`.
Dois siblings com is_secondary diferente ainda ativam o fallback — o valor de is_secondary do primeiro sibling e herdado arbitrariamente.

### 69. queryKey com array nao ordenado nao compartilha cache entre componentes — ALTO
`PessoasWidget` e `TravelHistorySection` usam `['travel-history', contactIds]` com arrays construidos independentemente.
Se a ordem dos IDs diferir entre renders, React Query trata como chaves diferentes — cache nao e reaproveitado e fetch duplo ocorre.
REGRA: Arrays usados em queryKey que devem ser compartilhados entre componentes precisam ser ordenados (`[...ids].sort()`) antes de entrar na chave.

### 73. React.ReactNode como tipo sem importar React — CRITICO
Arquivos com `"jsx": "react-jsx"` nao precisam de React para JSX, mas o namespace `React.ReactNode` ainda exige import.
Com `verbatimModuleSyntax: true`, usar `import { type ReactNode } from 'react'` e `children: ReactNode` na assinatura.
Visto em: `OrgContext.tsx` L1/L19.

### 74. isLoading falso-negativo em Context que depende de AuthContext — ALTO
Provider com `enabled: !!profile?.org_id` retorna `isLoading: false` quando `profile` ainda e `null` (AuthContext carregando).
Consumidores veem `{ data: null, isLoading: false }` e concluem "sem dado" em vez de "carregando".
FIX: `isLoading: queryIsLoading || authLoading` no value do Provider.

### 76. Coluna em defaultColumns sem renderer correspondente em columnRenderers — ALTO
`PipelineListView.tsx`: `{ id: 'documentos' }` em defaultColumns mas o renderer usa key `anexos`.
`visibleColumnsOrdered` filtra por `columnRenderers[col.id]` entao a coluna nunca renderiza — silencioso.
REGRA: IDs em defaultColumns DEVEM ter key identica em columnRenderers.

### 77. localStorage key nao incrementada apos adicao de colunas — MEDIO
`PipelineListView.tsx` L148: `pipeline_list_columns_v3` nao foi bumped para `_v4` apos adicao de 6 colunas novas.
Usuarios com state salvo nao verao as novas colunas no ColumnManager ate limpar localStorage.
REGRA: Ao adicionar colunas a defaultColumns, sempre incrementar o numero de versao da chave de localStorage.

### 78. valorMin/Max filtra apenas valor_estimado, ignora cards com valor_final — MEDIO
`usePipelineListCards.ts` L251-255: filtros de faixa de valor usam `.gte('valor_estimado')` e `.lte('valor_estimado')`.
Cards ganhos com `valor_final` preenchido e `valor_estimado=null` desaparecem do filtro mesmo dentro da faixa.
Correto seria filtrar em `valor_display` (que ja resolve COALESCE(valor_final, valor_estimado)).

### 79. taskStatus e docStatus definidos no FilterState mas nao aplicados em usePipelineListCards — ALTO
`usePipelineListCards.ts` nao tem nenhuma clausula para `filters.taskStatus` nem `filters.docStatus`.
Esses filtros existem em `usePipelineCards.ts` (Kanban) mas nao foram portados para a view de lista.
Usuario aplica o filtro, nao ve efeito — sem erro, sem aviso.

### 75. Fallback products[0] em vez de null quando produto nao encontrado — ALTO
`useCurrentProductMeta.ts` L14: `?? products[0]` devolve pipeline_id de TRIPS para usuarios WEDDING durante loading.
Queries com `pipelineId` filtram estagios errados. FIX: fallback deve ser `null`, nao `products[0]`.

### 80. set_config anti-loop nao funciona com pgBouncer transaction pooling — CRITICO
Edge Functions usam pgBouncer (transaction mode): `set_config('app.x', 'val', is_local=true)` e UPDATE seguinte ficam em conexoes diferentes.
Trigger ve variavel vazia e re-enfileira → loop. FIX: DB direct URL (:5432) ou coluna `is_being_synced_from_monde`.

### 81. RLS USING (true) sem filtro de role expoe tabela a todos autenticados — CRITICO
Policy nomeada "service role" mas sem `auth.role() = 'service_role'` → qualquer usuario logado le/escreve a fila.
FIX: `USING (auth.role() = 'service_role')`. Visto em: `monde_people_queue`.

### 82. Dedup por nome (low confidence) nao bloqueia merge — MEDIO
Import Monde: match_type='nome' gera confidence='low' mas ainda executa merge — dois clientes homônimos se fundem.
FIX: confidence='low' deve criar contato novo ou pular para revisao manual.

### 83. usePhaseCapabilities: cast desnecessario para campos que ja existem em PipelinePhase — MEDIO
`usePhaseCapabilities.ts` L35-41: `supports_win`, `win_action`, `owner_field` etc. sao campos tipados em `PipelinePhase` (`types/pipeline.ts` L23-29). `(p as unknown as Record<string, unknown>).supports_win` e redundante e esconde checagem TypeScript.
REGRA: Ler campos diretamente: `p.supports_win ?? false`. Usar cast apenas quando o tipo do banco nao incluir o campo.

### 84. KanbanBoard.handleWin L887: is_terminal_phase lido via `as any` quando campo existe em PipelinePhase — MEDIO
`(phase as any).is_terminal_phase` em KanbanBoard L887 enquanto `PipelinePhase.is_terminal_phase` esta tipado.
REGRA: Quando `phasesData` e `PipelinePhase[]`, ler `phase.is_terminal_phase` diretamente sem cast.

### 85. CardHeader.handleMarkAsWon: win_action lido via `as any` mesmo apos PipelinePhase tipado — MEDIO
`CardHeader.tsx` L859: `(currentPhaseObj as any)?.win_action`. `currentPhaseObj` e `PipelinePhase | undefined`, campo tipado.
REGRA: Apos H3-015 adicionar campos a `PipelinePhase`, revisar todos `as any` que acessam esses campos.

### 86. AppProduct importado de useProductContext mas re-declarado localmente em EditUserModal — BAIXO
`EditUserModal.tsx` L76: `type AppProduct = Database['public']['Enums']['app_product']` redefine o tipo localmente.
`useProductContext.ts` exporta `AppProduct = string`. Os dois types sao incompativeis se o enum for restrito.
REGRA: Usar apenas um AppProduct. Se a tabela tem enum, importar de `database.types.ts` em todos os lugares.

### 87. ProductSwitcher importa AppProduct do hook mas chama `as AppProduct` desnecessariamente — BAIXO
`ProductSwitcher.tsx` L37/75: `setProduct(product.slug as AppProduct)`. Com `AppProduct = string`, o cast e no-op mas mascara tipo errado futuro.

### 88. Multi-row INSERT RETURNING INTO scalar var em PL/pgSQL lanca erro em runtime — CRITICO
`INSERT INTO t VALUES(r1),(r2),(r3) RETURNING id INTO v_id` lanca "query returned more than one row".
FIX: Remover RETURNING da clause multi-row; buscar IDs individualmente com SELECT apos INSERT.
Visto em: H3-017 provision_organization L64 (roles INSERT).

### 89. provision_organization insere em sections com UNIQUE(key) global — CRITICO
`sections.key` tem UNIQUE global (nunca scoped por org). Chaves 'people' e 'payment' ja existem.
Segunda org provisionada falha com unique violation. FIX: ON CONFLICT (key) DO NOTHING ou dropar sections_key_key e criar UNIQUE(org_id, key, pipeline_id).

### 90. roles_name_key UNIQUE global nao atualizado para multi-tenant — CRITICO
H3-002 adicionou org_id em roles mas nao atualizou UNIQUE(name). Segunda org com 'admin','sales','support' falha.
FIX: DROP CONSTRAINT roles_name_key; ADD CONSTRAINT roles_org_name_key UNIQUE(org_id, name).

### 91. pipelines.produto e app_product ENUM — 'MAIN' nao e valor valido — CRITICO
app_product ENUM = ('TRIPS','WEDDING','CORP'). provision_organization usa p_product_slug='MAIN' como DEFAULT.
INSERT pipelines com produto='MAIN' falha em runtime. FIX: adicionar 'MAIN' ao enum, ou mudar pipelines.produto para TEXT, ou exigir que o caller passe slug valido.

### 92. Fase 5 Org Split — useProductContext fallback usa products[0] antes org carrega, causa flash errado — ALTO
`useProductContext.ts` L39-41: `ORG_SLUG_PRODUCT_FALLBACK[org.slug] ?? products[0]?.slug ?? 'TRIPS'`.
Se org esta carregando (null) e products retorna FALLBACK_PRODUCTS=[TRIPS,WEDDING,...], currentProduct flash como TRIPS.
Usuario Weddings ve Trips stages por ~500ms antes org.slug ficar disponivel.
FIX: Adicionar `isLoading` flag — quando org ou products carregando, manter produto anterior (via useRef) ou retornar null.

### 93. useOrgSwitch mutationFn ainda recebe orgSlug mas nunca usa — BAIXO
`useOrgSwitch.ts` L8 destructura `orgSlug` mas nunca referencia. Remove-o do parametro ou adiciona no comentario "unused".
OrgSwitcher.tsx L98 passa `orgSlug` mas nao sera mais usado. FIX: Remover `orgSlug` da destructuring em useOrgSwitch.ts L8.

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
