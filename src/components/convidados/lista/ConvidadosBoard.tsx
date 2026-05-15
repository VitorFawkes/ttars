import { useState } from 'react'
import { useAllGuests } from '../../../hooks/convidados/useAllGuests'
import type { GuestWithWedding, StatusRSVP } from '../../../hooks/convidados/types'
import { GuestCard } from './GuestCard'
import { GuestDetailModal } from '../GuestDetailModal'

interface ConvidadosBoardProps {
  search: string
  statusFilter: StatusRSVP[]
  weddingFilter: string[]
}

export function ConvidadosBoard({ search, statusFilter, weddingFilter }: ConvidadosBoardProps) {
  const { data, isLoading, isError } = useAllGuests({ search, statusFilter, weddingFilter })
  const [selected, setSelected] = useState<GuestWithWedding | null>(null)

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {[1, 2, 3].map(i => (
          <div key={i} className="bg-white border border-slate-200 shadow-sm rounded-xl p-4 h-28 animate-pulse" />
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

  if (guests.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-8 text-center">
        <p className="text-sm text-slate-700">Nenhum convidado encontrado.</p>
        <p className="text-xs text-slate-500 mt-1">Ajuste os filtros ou adicione um convidado a um casamento.</p>
      </div>
    )
  }

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {guests.map(guest => (
          <GuestCard key={guest.id} guest={guest} onClick={() => setSelected(guest)} />
        ))}
      </div>

      {selected && (
        <GuestDetailModal
          guest={selected}
          isOpen={!!selected}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  )
}
