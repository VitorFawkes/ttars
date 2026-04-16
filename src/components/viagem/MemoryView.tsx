import { Heart } from 'lucide-react'
import type { Viagem, DayGroupData, TripItem, TripComment } from '@/types/viagem'
import { DayGroup } from './DayGroup'
import { ItemCard } from './ItemCard'
import { NPSForm } from './NPSForm'

interface MemoryViewProps {
  viagem: Viagem
  days: DayGroupData[]
  orphans: TripItem[]
  comments: TripComment[]
}

export function MemoryView({ viagem, days, orphans, comments }: MemoryViewProps) {
  return (
    <div className="space-y-4 pb-8">
      {/* Thank you banner */}
      <div className="rounded-xl bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 p-4 text-center">
        <Heart className="h-8 w-8 text-amber-500 mx-auto mb-2" />
        <h2 className="text-lg font-bold text-slate-900 tracking-tight">
          {viagem.estado === 'concluida' ? 'Sua viagem' : 'Bem-vindo de volta!'}
        </h2>
        <p className="text-sm text-slate-600 mt-1">
          Esperamos que tenha sido inesquecível.
        </p>
      </div>

      {/* NPS */}
      {viagem.estado === 'pos_viagem' && <NPSForm />}

      {/* Timeline as memory */}
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
