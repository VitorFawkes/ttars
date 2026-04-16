import type { ViagemOwner } from '@/types/viagem'
import { MessageCircle, User } from 'lucide-react'

interface ContactCardProps {
  owner: ViagemOwner
  role: 'tp' | 'pv'
  className?: string
}

const ROLE_LABELS = {
  tp: 'sua Travel Planner',
  pv: 'seu consultor Pós-Venda',
} as const

export function ContactCard({ owner, role, className }: ContactCardProps) {
  return (
    <div className={`flex items-center gap-3 rounded-xl bg-white border border-slate-200 shadow-sm p-3 ${className ?? ''}`}>
      {owner.avatar_url ? (
        <img
          src={owner.avatar_url}
          alt={owner.nome}
          className="h-10 w-10 rounded-full object-cover"
        />
      ) : (
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-100 text-indigo-600">
          <User className="h-5 w-5" />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-900 truncate">{owner.nome}</p>
        <p className="text-xs text-slate-500">{ROLE_LABELS[role]}</p>
      </div>
      <button
        type="button"
        className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-colors"
        aria-label={`Falar com ${owner.nome}`}
      >
        <MessageCircle className="h-4 w-4" />
      </button>
    </div>
  )
}
