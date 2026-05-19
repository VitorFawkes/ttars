import { useAllGuests } from '../../../hooks/convidados/useAllGuests'
import type { StatusRSVP } from '../../../hooks/convidados/types'
import { GuestKanbanBoard } from '../guests/GuestKanbanBoard'

interface ConvidadosBoardProps {
  search: string
  statusFilter: StatusRSVP[]
  weddingFilter: string[]
}

export function ConvidadosBoard({ search, statusFilter, weddingFilter }: ConvidadosBoardProps) {
  const { data, isLoading, isError } = useAllGuests({ search, statusFilter, weddingFilter })

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

  // O kanban filtra por status visualmente (cada coluna = um status). Mesmo
  // quando a lista vier vazia, mostra as 4 colunas com placeholder "Sem
  // convidados aqui" — assim o layout fica estável e o usuário entende o
  // efeito dos filtros do topo. Altura ~80% da viewport: o usuário pode
  // rolar a página um pouco pra ver o que ficou abaixo.
  return (
    <div className="h-[80vh] min-h-[480px]">
      <GuestKanbanBoard guests={guests} search="" />
    </div>
  )
}
