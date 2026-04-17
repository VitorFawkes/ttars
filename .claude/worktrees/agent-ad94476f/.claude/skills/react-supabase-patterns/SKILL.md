---
name: react-supabase-patterns
description: Use when creating or modifying React components, hooks, or Supabase queries in the WelcomeCRM project
---

# React + Supabase Patterns — WelcomeCRM

## Multi-Tenant (org_id)

O sistema é multi-tenant. Dados são isolados por `org_id` no banco via RLS.

```typescript
// ✅ Frontend — acessar org atual
import { useOrg } from '@/contexts/OrgContext'
const { org } = useOrg()  // org.id, org.name, org.slug

// ✅ Frontend — org_id NÃO precisa ser passado manualmente nas queries
// O RLS no banco já filtra automaticamente via JWT
// Basta usar supabase.from('tabela').select('*') — RLS faz o resto

// ✅ Backend (Edge Functions) — extrair org_id do request
import { getOrgId } from '../_shared/org-context.ts'
const orgId = getOrgId(req)

// ✅ SQL — nova tabela DEVE ter org_id
// org_id UUID NOT NULL DEFAULT requesting_org_id() REFERENCES organizations(id)

// ✅ SQL — RLS obrigatória
// CREATE POLICY "tabela_org_select" ON tabela FOR SELECT TO authenticated
//   USING (org_id = requesting_org_id());
```

**NUNCA:**
- Hardcodar UUID de organização no frontend
- Criar tabela com dados de cliente sem `org_id`
- Criar RLS policy sem `requesting_org_id()`

## State Management

Este projeto usa **3 ferramentas** para estado. Escolha a correta:

| Ferramenta | Quando usar | Exemplo no projeto |
|-----------|------------|-------------------|
| **Zustand** (com `persist`) | Estado global de UI (filtros, produto selecionado, sidebar) | `useProductContext`, `usePipelineFilters`, `useLeadsFilters` |
| **TanStack React Query** (`useQuery`/`useMutation`) | Dados do servidor (Supabase queries, cache, invalidação) | `useLeadsQuery`, `usePipelines`, `useCardGifts` |
| **Context API** | Injeção de dependência (auth, org) — NÃO state management | `AuthContext` |

**NUNCA:**
- `useState` para dados do servidor — usar `useQuery`
- Context para estado global de UI — usar Zustand
- Zustand para dados que vêm do banco — usar React Query

## Produto e Pipeline — Padrão atual

O projeto está migrando de `PRODUCT_PIPELINE_MAP` hardcoded para dados do banco:

```typescript
// ✅ CORRETO (padrão novo) — pipeline_id vem do banco
import { useCurrentProductMeta } from '@/hooks/useCurrentProductMeta'

const { pipelineId, slug } = useCurrentProductMeta()
const { data: stages } = usePipelineStages(pipelineId)
const { data: phases } = usePipelinePhases(pipelineId)

// ✅ CORRETO — quando precisa do pipeline_id de um card específico (não do contexto)
import { useProductPipelineId } from '@/hooks/useCurrentProductMeta'

const pipelineId = useProductPipelineId(card.produto)
```

```typescript
// ❌ ERRADO — PRODUCT_PIPELINE_MAP é hardcoded e está sendo removido
import { PRODUCT_PIPELINE_MAP } from '@/lib/constants'
const pipelineId = PRODUCT_PIPELINE_MAP[currentProduct]
```

## Fases do Pipeline — NUNCA comparar strings

As fases têm `name` que pode ser renomeado (ex: "T. Planner"). Use `slug` ou `phase_id`:

```typescript
// ✅ CORRETO — usar slug via SystemPhase
import { SystemPhase } from '@/types/pipeline'
import { getPhaseLabel } from '@/lib/pipeline/phaseLabels'

// Comparar por slug (estável)
if (phase.slug === SystemPhase.POS_VENDA) { ... }

// Obter label para exibição (dinâmico — vem do banco)
const posVendaLabel = getPhaseLabel(phases, SystemPhase.POS_VENDA)

// Resolver owner por fase
import { getPhaseOwnerName } from '@/lib/pipeline/phaseLabels'
const ownerName = getPhaseOwnerName(card, phaseSlug)
```

```typescript
// ❌ ERRADO — strings hardcoded quebram quando alguém renomeia a fase
if (stage.fase === 'Pós-venda') { ... }
if (phase.name === 'Planner') { ... }
```

**Slugs estáveis:** `sdr`, `planner`, `pos_venda`, `resolucao` (definidos em `SystemPhase`)

**Lookup por FK, não por nome:**
```typescript
// ✅ CORRETO — FK é estável
const phase = phases.find(p => p.id === stage.phase_id)

// ❌ ERRADO — name pode mudar
const phase = phases.find(p => p.name === stage.fase)
```

## Padrão de Query Supabase

```typescript
// Hook com useQuery — PADRÃO OBRIGATÓRIO
export function useMinhaEntidade(filtros: Filtros) {
  const { pipelineId } = useCurrentProductMeta()

  return useQuery({
    queryKey: ['minha-entidade', filtros, pipelineId],
    queryFn: async () => {
      let query = supabase
        .from('tabela')
        .select('*', { count: 'exact' })

      // Isolamento de produto — OBRIGATÓRIO
      if (pipelineId) {
        query = query.eq('pipeline_id', pipelineId)
      }

      const { data, error, count } = await query
      if (error) throw error  // React Query captura
      return { data, count }
    },
    staleTime: 1000 * 60 * 10,  // 10 min cache padrão
  })
}
```

**Regras de queryKey:**
- Sempre incluir `pipelineId` ou `currentProduct` no array
- Incluir todos os filtros que afetam o resultado
- Formato: `['entidade', ...filtros, pipelineId]`

## Padrão de Mutation

```typescript
const mutation = useMutation({
  mutationFn: async (input: MeuInput) => {
    const { data, error } = await supabase
      .from('tabela')
      .insert({ ...input })
      .select()
      .single()
    if (error) throw error
    return data
  },
  onSuccess: () => {
    // Invalidar caches relacionados
    queryClient.invalidateQueries({ queryKey: ['entidade-principal'] })
    queryClient.invalidateQueries({ queryKey: ['entidade-afetada'] })
    toast.success('Salvo com sucesso')
  },
  onError: (error) => {
    toast.error(`Erro: ${error.message}`)
  },
})
```

## Loading / Error / Empty States

```typescript
// Loading — Skeleton ou texto simples
if (isLoading) return <div className="p-4 text-center text-sm text-slate-500">Carregando...</div>

// Error — Toast, não inline (erros capturados pelo React Query via onError)

// Empty State — Borda tracejada + ícone + texto
if (!data || data.length === 0) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center">
      <IconeRelevante className="mx-auto h-8 w-8 text-slate-400" />
      <h3 className="mt-2 text-sm font-medium text-slate-900">Nenhum item encontrado</h3>
      <p className="mt-1 text-sm text-slate-500">Descrição contextual.</p>
    </div>
  )
}
```

**NUNCA:**
- Retornar `null` para loading — sempre mostrar feedback visual
- Usar `console.error` no lugar de `toast.error` — usuário não vê console
- Ignorar empty state — sempre dar feedback quando não há dados

## Schema do Banco — Nomes em Português

O banco usa nomes em português. As colunas mais comuns:

| Coluna | Tabela | NÃO é |
|--------|--------|-------|
| `nome` | profiles, pipeline_stages, contatos | ~~name~~ |
| `ordem` | pipeline_stages | ~~position, order~~ |
| `fase` | pipeline_stages (legacy) | Usar `phase_id` FK |
| `ativo` | pipeline_stages | ~~active~~ |
| `titulo` | cards | ~~title~~ |
| `produto` | cards | ~~product~~ |
| `etapa_funil_id` | cards (legacy) | Usar `pipeline_stage_id` |

## Memoização

Usar **apenas quando necessário** (listas filtradas, callbacks passados como props):

```typescript
// SIM — lista filtrada computada
const cardsVisiveis = useMemo(
  () => cards.filter(c => c.produto === currentProduct),
  [cards, currentProduct]
)

// SIM — callback passado como prop para componente filho
const handleDrag = useCallback((result: DropResult) => {
  // lógica de drag
}, [dependencias])

// NÃO — operação barata, não precisa de memo
const nomeFormatado = card.titulo.toUpperCase()
```

## Imports

```typescript
// CORRETO — path alias @/
import { useLeadsQuery } from '@/hooks/useLeadsQuery'
import { Button } from '@/components/ui/Button'
import type { Database } from '@/database.types'

// ERRADO — imports relativos longos
import { useLeadsQuery } from '../../../hooks/useLeadsQuery'
```

## Checklist Rápido

Antes de finalizar qualquer componente React:
- [ ] Produto isolado? (`pipelineId` no queryKey e no filtro)
- [ ] Fases comparadas por `slug` ou `phase_id`? (nunca por `name` ou `fase` string)
- [ ] Usa `useCurrentProductMeta` (não `PRODUCT_PIPELINE_MAP`)?
- [ ] Loading state visível?
- [ ] Empty state com feedback?
- [ ] Erros capturados? (throw em queryFn, toast em onError)
- [ ] QueryKey inclui todas dependências?
- [ ] Imports com `@/`?
- [ ] Tipos definidos (não `any`)? Ver skill `typescript-strict`