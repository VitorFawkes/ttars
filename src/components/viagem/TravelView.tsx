import { Plane } from 'lucide-react'
import type { Viagem, DayGroupData, TripItem, TripComment } from '@/types/viagem'
import { DayGroup } from './DayGroup'
import { ItemCard } from './ItemCard'
import { EmergencyContacts } from './EmergencyContacts'

interface TravelViewProps {
  viagem: Viagem
  days: DayGroupData[]
  orphans: TripItem[]
  comments: TripComment[]
}

export function TravelView({ viagem, days, orphans, comments }: TravelViewProps) {
  return (
    <div className="space-y-4 pb-8">
      {/* Today banner */}
      <div className="rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 p-4 text-white text-center">
        <Plane className="h-7 w-7 mx-auto mb-1" />
        <h2 className="text-xl font-bold tracking-tight">Boa viagem!</h2>
        <p className="text-sm text-white/80 mt-0.5">
          Todos os seus vouchers e contatos estão aqui.
        </p>
      </div>

      <EmergencyContacts tp={viagem.tp} pv={viagem.pv} />

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
