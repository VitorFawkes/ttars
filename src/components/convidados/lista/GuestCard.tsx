import { Mail, Phone, Heart } from 'lucide-react'
import { RsvpBadge } from '../RsvpBadge'
import type { GuestWithWedding } from '../../../hooks/convidados/types'

interface GuestCardProps {
  guest: GuestWithWedding
  onClick: () => void
}

export function GuestCard({ guest, onClick }: GuestCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-left bg-white border border-slate-200 shadow-sm rounded-xl p-4 hover:border-indigo-300 hover:shadow transition-all flex flex-col gap-2"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h4 className="text-sm font-semibold text-slate-900 truncate">{guest.nome}</h4>
          <p className="text-xs text-slate-500 inline-flex items-center gap-1 truncate">
            <Heart className="w-3 h-3 shrink-0 text-rose-400" />
            <span className="truncate">{guest.card_titulo}</span>
          </p>
        </div>
        <RsvpBadge status={guest.status_rsvp} />
      </div>

      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
        {guest.telefone && (
          <span className="inline-flex items-center gap-1">
            <Phone className="w-3 h-3" />
            {guest.telefone}
          </span>
        )}
        {guest.email && (
          <span className="inline-flex items-center gap-1 truncate">
            <Mail className="w-3 h-3 shrink-0" />
            <span className="truncate">{guest.email}</span>
          </span>
        )}
        {!guest.telefone && !guest.email && (
          <span className="text-slate-400 italic">Sem contato registrado</span>
        )}
      </div>
    </button>
  )
}
