import { Loader2 } from 'lucide-react'
import { useAllGuests } from '../../../hooks/convidados/useAllGuests'
import { useDebouncedValue } from '../../../hooks/useDebouncedValue'
import type { StatusRSVP } from '../../../hooks/convidados/types'
import { GuestKanbanBoard } from '../guests/GuestKanbanBoard'

interface ConvidadosBoardProps {
  search: string
  statusFilter: StatusRSVP[]
  weddingFilter: string[]
}

export function ConvidadosBoard({ search, statusFilter, weddingFilter }: ConvidadosBoardProps) {
  const { data, isLoading, isError, isFetching } = useAllGuests({ statusFilter, weddingFilter })
  // A lista tem milhares de cards (cada um é um draggable). Filtrar a cada
  // tecla re-renderiza o board inteiro e trava a aba. Debounce: o input segue
  // respondendo na hora (prefs.search), mas o filtro pesado roda só na pausa.
  const debouncedSearch = useDebouncedValue(search, 200)

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="bg-white border border-slate-200 rounded-xl h-80 animate-pulse" />
        ))}
      </div>
    )
  }

  if (isError) {
    return (
      <div className="bg-white border border-rose-200 text-rose-700 rounded-xl p-4 text-sm">
        Não consegui carregar a lista de convidados.
      </div>
    )
  }

  const guests = data ?? []

  // O kanban filtra por status visualmente (cada coluna = um status) e por
  // texto (busca client-side, instantânea). Mesmo quando a lista vier vazia,
  // mostra as 4 colunas com placeholder "Sem convidados aqui" — assim o layout
  // fica estável e o usuário entende o efeito dos filtros do topo. Altura ~80%
  // da viewport: o usuário pode rolar a página um pouco pra ver o que ficou
  // abaixo. O indicador de "Atualizando…" aparece nos refetches reais (troca de
  // status/casamento) sem esconder os dados já carregados.
  return (
    <div className="h-[80vh] min-h-[480px] relative">
      {isFetching && !isLoading && (
        <div className="absolute top-2 right-2 z-10 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white border border-slate-200 shadow-sm text-xs font-medium text-slate-500">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          Atualizando…
        </div>
      )}
      <GuestKanbanBoard guests={guests} search={debouncedSearch} />
    </div>
  )
}
