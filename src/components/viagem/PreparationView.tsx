import { PartyPopper } from 'lucide-react'
import type { Viagem, DayGroupData, TripItem, TripComment } from '@/types/viagem'
import { DayGroup } from './DayGroup'
import { ItemCard } from './ItemCard'
import { ContactCard } from './ContactCard'

interface PreparationViewProps {
  viagem: Viagem
  days: DayGroupData[]
  orphans: TripItem[]
  comments: TripComment[]
}

export function PreparationView({ viagem, days, orphans, comments }: PreparationViewProps) {
  return (
    <div className="space-y-4 pb-8">
      {/* Confirmed banner */}
      <div className="rounded-xl bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 p-4 text-center">
        <PartyPopper className="h-8 w-8 text-emerald-500 mx-auto mb-2" />
        <h2 className="text-lg font-bold text-slate-900 tracking-tight">
          Sua viagem está confirmada!
        </h2>
        <p className="text-sm text-slate-600 mt-1">
          Estamos preparando todos os detalhes para você.
        </p>
      </div>

      {/* PV contact */}
      {viagem.pv && (
        <div className="space-y-1">
          <p className="text-xs text-slate-500 px-1">
            A partir de agora, quem cuida da sua viagem é:
          </p>
          <ContactCard owner={viagem.pv} role="pv" />
        </div>
      )}

      {/* TP secondary contact */}
      {viagem.tp && (
        <div className="space-y-1">
          <p className="text-xs text-slate-500 px-1">
            Quem desenhou sua viagem:
          </p>
          <ContactCard owner={viagem.tp} role="tp" />
        </div>
      )}

      {/* Timeline read-only */}
      {days.map((group) => (
        <DayGroup
          key={group.day.id}
          group={group}
          comments={comments}
          readOnly
        />
      ))}

      {orphans.map((item) => (
        <ItemCard
          key={item.id}
          item={item}
          comments={comments}
          readOnly
        />
      ))}
    </div>
  )
}
