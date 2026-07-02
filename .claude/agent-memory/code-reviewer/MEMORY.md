# Code Reviewer — Memoria Persistente

## Protocolo de Escrita
- Cada item: max 3 linhas (Padrao + Impacto + Regra). Numerar sequencial, sem duplicar.
- Corrigido/confirmado OK → DELETAR (nao guardar historico de bugs fixados).
- ANTES de adicionar: `wc -l`. Se > 160 → comprimir primeiro.
- Priorizar padroes GENERALIZAVEIS; achados de arquivo unico so se recorrentes.

---

## Regras Generalizaveis (recorrentes)

### 1. Migration SQL nao reflete schema real
Colunas via Dashboard/SQL direto nao entram no .sql. Comparar `database.types.ts` + REST real com `migrations/`. Nunca auditar so por migration.

### 2. Tailwind classes inexistentes (h-4.5). Escala: h-3=12px, h-4=16px, h-5=20px. Class invalida e ignorada em silencio.

### 3. group-hover sem `group` no ancestral → invisivel.

### 9. RPC/funcao reescrita perde logica anterior. ANTES de CREATE OR REPLACE: grep todas migrations + diff linha a linha (validacao telefone, find_contact_by_whatsapp, colunas legadas).

### 13. queryKey com objeto → serializar (JSON.stringify). React Query compara objeto por referencia.

### 14. `.mutateAsync` em UI sem try/catch+toast.error silencia erro. (Hook com onError+toast proprio cobre — checar antes de acusar.)

### 19. Botao icone-only precisa aria-label.

### 26/41/57. database.types.ts stale apos add/remover/mudar assinatura de RPC. Frontend usa `(supabase as any).rpc` e perde validacao de args. Regenerar: `npx supabase gen types typescript --project-id szyrzxvlptqqheizyrxu > src/database.types.ts`.

### 27. useMutation onSuccess async: pos-processamento longo mantem isPending=true. Mover pra fora do onSuccess.

### 36. queryKey compartilhado com filtro diferente polui cache. Chaves distintas por escopo (ativos vs display vs admin).

### 38. activities INSERT usa coluna `metadata` (NAO `dados`): (card_id, tipo, descricao, metadata, created_by[, org_id, actor_type, actor_label]).

### 40. Migration com DROP+CREATE sem transacao: se CREATE falha, funcao some. Envolver BEGIN;...COMMIT;

### 42. Interface TS local dessincronizada de nova coluna. Atualizar AMBAS (ex: notifications, arquivos).

### 48. ID '' como cache key polui React Query (`['key','']`). Usar `enabled`, nao string vazia.

### 50. Helpers duplicados entre hooks → extrair pra fonte unica.

### 53/54. invalidateQueries com key mal escrita (singular vs plural) / query duplicada de hook central (ex: usePipelineStages). Conferir ortografia exata.

### 69. Array nao ordenado em queryKey nao compartilha cache entre componentes. `[...ids].sort()` antes de entrar na chave.

### 71. `<a href>` para rota interna = full reload. Usar `<Link to>`/`navigate()`.

### 73. RLS: DROP POLICY IF EXISTS com nome errado nao falha, deixa policy antiga cross-org ativa. Comparar nome EXATO com schema-baseline.

### 74. pg_get_functiondef + replace() nao e idempotente (dupla injecao ao re-rodar). Guard `IF position(...)>0 THEN CONTINUE`.

### 75. Fallback `products[0]` quando produto nao encontrado devolve pipeline errado (TRIPS p/ WEDDING). Fallback deve ser `null`.

### 76. Coluna em defaultColumns sem key identica em columnRenderers → nunca renderiza (silencioso).

### 80. set_config anti-loop nao funciona com pgBouncer transaction pooling (conexoes diferentes). Usar DB direct URL (:5432) ou coluna de flag.

### 81. RLS `USING(true)` sem `auth.role()='service_role'` expoe tabela a todo autenticado.

### 82. Dedup por nome (confidence low) nao deve executar merge — homonimos se fundem.

### 83/84/85. `as any`/cast p/ campos que JA existem em `PipelinePhase` (supports_win, win_action, is_terminal_phase). Ler `phase.campo` direto; cast so quando o tipo do banco nao inclui.

### 88. Multi-row `INSERT ... RETURNING id INTO v_scalar` lanca "more than one row". Buscar IDs com SELECT depois.

### 89/90. UNIQUE global (sections.key, roles.name) quebra 2a org provisionada. Scoping por org ou ON CONFLICT DO NOTHING.

### 91. pipelines.produto e ENUM app_product (TRIPS/WEDDING/CORP). Valor fora do enum (ex 'MAIN') falha em runtime.

### 92. React.ReactNode como tipo exige import mesmo com jsx:react-jsx. Com verbatimModuleSyntax: `import { type ReactNode }`.

### 93. Context com `enabled: !!profile?.org_id` retorna isLoading=false enquanto AuthContext carrega → consumidor conclui "sem dado". FIX: `isLoading: queryIsLoading || authLoading`.

### 94. Edge function service_role que so checa presenca de Authorization NAO isola por org — MEDIO
`ww-assistente` e sibling `ai-conversation-extraction`: verify_jwt default (true) aceita a anon key (publica), e o handler nao valida que o card pertence ao org do caller. Caller com anon key le qualquer card cross-org via card_id arbitrario. Padrao sistemico (ver memory global feedback_rpc_grants_anon_systemic). Nao e regressao nova quando espelha o sibling — flag so como observacao.

### 95. Webhook publico (verify_jwt=false) sem assinatura obrigatoria — MEDIO
`email-inbound`: se RESEND_INBOUND_SECRET vazio, verifySvix retorna true e insere mensagens lado='in' em qualquer card resolvido. Escrita-only e guardada a card valido, mas setar o secret antes de rollout amplo.

---

## Padroes do Projeto Confirmados (NAO acusar)

- Mutations expoem `.mutateAsync`; `enabled: !!id` em queries com ID.
- `createElement(Icon,{...})` p/ LucideIcon dinamico — OK.
- `window.confirm(...)` p/ acao destrutiva — OK.
- string[]/array de primitivos em queryKey — OK (React Query compara por valor).
- Storage policy bucket-level `USING (bucket_id='x')` p/ authenticated — padrao existente (card-documents). meeting-recordings segue igual.
- Estender componente compartilhado com prop OPCIONAL aditiva (ex: WhatsAppHistory `viewFilter` client-side; upload aceitar `File[] | {files,slotKey,titulo}`) — back-compat OK.
- Lookup por card_id/id unico sem `.eq(org_id)` — RLS barra; OK (activities/arquivos/whatsapp_messages/mensagens).
- Recriar funcao SQL preservando fixes anteriores + bloco DO $$ de validacao (RAISE EXCEPTION se regrediu) — padrao correto (log_mensagem_activity 20260624f→20260702c).
