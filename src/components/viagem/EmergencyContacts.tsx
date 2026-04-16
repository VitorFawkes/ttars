import { Phone, MessageCircle } from 'lucide-react'
import type { ViagemOwner } from '@/types/viagem'

interface EmergencyContactsProps {
  tp: ViagemOwner | null
  pv: ViagemOwner | null
}

export function EmergencyContacts({ tp, pv }: EmergencyContactsProps) {
  const contacts = [
    pv ? { ...pv, label: 'Pós-Venda' } : null,
    tp ? { ...tp, label: 'Travel Planner' } : null,
  ].filter(Boolean) as (ViagemOwner & { label: string })[]

  if (contacts.length === 0) return null

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4 space-y-3">
      <h3 className="text-sm font-semibold text-slate-900">Contatos de apoio</h3>
      <div className="space-y-2">
        {contacts.map((c) => (
          <div key={c.id} className="flex items-center gap-3">
            {c.avatar_url ? (
              <img src={c.avatar_url} alt={c.nome} className="h-8 w-8 rounded-full object-cover" />
            ) : (
              <div className="h-8 w-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600">
                <Phone className="h-3.5 w-3.5" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-900 truncate">{c.nome}</p>
              <p className="text-xs text-slate-500">{c.label}</p>
            </div>
            <button
              type="button"
              className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-colors"
              aria-label={`Falar com ${c.nome}`}
            >
              <MessageCircle className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
