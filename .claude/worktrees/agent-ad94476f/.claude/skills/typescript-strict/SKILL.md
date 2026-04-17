---
name: typescript-strict
description: Use when creating or modifying TypeScript files (.ts/.tsx) to enforce type safety and prevent loose types
---

# TypeScript Strict — WelcomeCRM

## Regra Principal

```
ZERO `any` NOVO. Se adicionar `any`, justifique com comentário ESLint.
```

O projeto tem `strict: true` no tsconfig. Respeite.

## Hierarquia de Tipos

Ao trabalhar com dados do Supabase, use os tipos gerados:

```typescript
// CORRETO — tipo da tabela
import type { Database } from '@/database.types'
type Card = Database['public']['Tables']['cards']['Row']
type CardInsert = Database['public']['Tables']['cards']['Insert']
type CardUpdate = Database['public']['Tables']['cards']['Update']

// CORRETO — tipo de view
type LeadCard = Database['public']['Views']['view_cards_acoes']['Row']

// ERRADO — tipo manual que duplica o schema
interface Card {
  id: string
  nome: string
  // ...
}
```

**Exceção aceita:** Quando o Supabase query builder perde tipos em queries complexas (joins encadeados), usar `as any` no builder com tipo no retorno:

```typescript
// ACEITÁVEL — cast no builder, tipo no resultado
const { data, error } = await (supabase.from('view_cards_acoes') as any)
  .select('*', { count: 'exact' })
  .eq('produto', currentProduct)

// O resultado deve ser tipado:
return data as LeadCard[]
```

## Regras de Tipo

### NUNCA usar `any` sem justificativa
```typescript
// ERRADO
function processCard(card: any) { ... }

// CORRETO — usar tipo real
function processCard(card: Card) { ... }

// CORRETO — quando tipo é desconhecido
function processResponse(data: unknown) {
  if (isCard(data)) { ... }  // type guard
}
```

### NUNCA usar `as` sem verificação
```typescript
// ERRADO — assertion cega
const card = response as Card

// CORRETO — com verificação
if ('id' in response && 'nome' in response) {
  const card = response as Card
}

// EXCEÇÃO — retorno de Supabase com schema conhecido
const { data } = await supabase.from('cards').select('*').single()
// `data` já é tipado pelo SDK — não precisa de cast
```

### NUNCA usar `!` (non-null assertion) sem contexto
```typescript
// ERRADO — pode ser null em runtime
const nome = card.contato!.nome

// CORRETO — optional chaining + fallback
const nome = card.contato?.nome ?? 'Sem nome'

// ACEITÁVEL — após type guard explícito
if (card.contato) {
  const nome = card.contato.nome  // TS já sabe que não é null
}
```

### Enums: usar `as const` objects
```typescript
// ERRADO — enum keyword
enum Status { ATIVO, INATIVO }

// CORRETO — as const
const STATUS = {
  ATIVO: 'ativo',
  INATIVO: 'inativo',
} as const
type Status = typeof STATUS[keyof typeof STATUS]
```

### Props de componentes
```typescript
// CORRETO — interface explícita
interface CardHeaderProps {
  card: Card
  onUpdate: (updates: CardUpdate) => void
  isEditing?: boolean  // optional com ?
}

export function CardHeader({ card, onUpdate, isEditing = false }: CardHeaderProps) {
  // ...
}

// ERRADO — props inline sem nome
export function CardHeader({ card, onUpdate }: { card: any; onUpdate: Function }) {
  // ...
}
```

### Generics para hooks reutilizáveis
```typescript
// CORRETO — generic com constraint
function useSupabaseQuery<T extends Record<string, unknown>>(
  table: string,
  filters: Record<string, unknown>
) {
  return useQuery<T[]>({
    queryKey: [table, filters],
    queryFn: async () => {
      const { data, error } = await supabase.from(table).select('*')
      if (error) throw error
      return data as T[]
    },
  })
}
```

### Event handlers
```typescript
// CORRETO — tipo do evento
const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
  setValue(e.target.value)
}

// CORRETO — callback com tipo específico
const handleSelect = (value: string) => {
  setSelected(value)
}

// ERRADO
const handleChange = (e: any) => { ... }
```

## Quando `any` é Aceitável

1. **Supabase query builder** — Cast `as any` no `.from()` quando tipos genéricos não propagam
2. **Libs sem tipos** — Pacotes externos sem `@types/` (documentar com `// eslint-disable`)
3. **Migração gradual** — Código legacy sendo refatorado (adicionar TODO com prazo)

Em todos os casos: **comentário ESLint obrigatório** explicando por quê.

```typescript
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase query builder perde tipos em joins complexos
const query = (supabase.from('view_cards_acoes') as any)
```

## Checklist Rápido

Antes de finalizar qualquer arquivo .ts/.tsx:
- [ ] Zero `any` novo sem comentário justificativo?
- [ ] Tipos do `database.types.ts` usados onde aplicável?
- [ ] Props de componentes com interface nomeada?
- [ ] Optional chaining (`?.`) em vez de `!`?
- [ ] Event handlers tipados?
- [ ] Imports de tipo com `import type`?