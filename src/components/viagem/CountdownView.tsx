import type { Viagem, DayGroupData, TripItem, TripComment } from '@/types/viagem'
import { CountdownBanner } from './CountdownBanner'
import { DayGroup } from './DayGroup'
import { ItemCard } from './ItemCard'
import { EmergencyContacts } from './EmergencyContacts'

interface CountdownViewProps {
  viagem: Viagem
  days: DayGroupData[]
  orphans: TripItem[]
  comments: TripComment[]
}

export function CountdownView({ viagem, days, orphans, comments }: CountdownViewProps) {
  // Try to extract departure date from first day item's comercial
  const firstDay = days[0]?.day
  const departureDate = (firstDay?.comercial as Record<string, string | undefined>)?.data ?? null

  return (
    <div className="space-y-4 pb-8">
      <CountdownBanner targetDate={departureDate} />

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
