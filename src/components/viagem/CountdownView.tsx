import { useMemo } from 'react'
import type { Viagem, DayGroupData, TripItem, TripComment } from '@/types/viagem'
import { CountdownBanner } from './CountdownBanner'
import { DayGroup } from './DayGroup'
import { ItemCard } from './ItemCard'
import { EmergencyContacts } from './EmergencyContacts'
import { ChecklistPreEmbarque } from './ChecklistPreEmbarque'
import { useParticipant } from '@/hooks/viagem/useParticipant'

interface CountdownViewProps {
  viagem: Viagem
  days: DayGroupData[]
  orphans: TripItem[]
  comments: TripComment[]
  token: string
}

/**
 * Descobre a data de embarque olhando, em ordem:
 * 1. Primeiro item com `operacional.data_inicio` (ex: voo ou hotel após upload de voucher)
 * 2. `comercial.data` do primeiro dia
 * 3. `comercial.data_inicio` do primeiro item comercial
 */
function getDepartureDate(days: DayGroupData[], orphans: TripItem[]): string | null {
  const allItems = [
    ...days.flatMap((d) => [d.day, ...d.children]),
    ...orphans,
  ]
  const candidatas: string[] = []
  for (const item of allItems) {
    const op = item.operacional as { data_inicio?: string | null }
    if (op?.data_inicio) candidatas.push(op.data_inicio)
    const com = item.comercial as { data?: string | null; data_inicio?: string | null }
    if (com?.data_inicio) candidatas.push(com.data_inicio)
    if (com?.data) candidatas.push(com.data)
  }
  if (candidatas.length === 0) return null
  candidatas.sort()
  return candidatas[0]
}

export function CountdownView({ viagem, days, orphans, comments, token }: CountdownViewProps) {
  const departureDate = useMemo(
    () => getDepartureDate(days, orphans),
    [days, orphans],
  )
  const { participant } = useParticipant(viagem.id)

  return (
    <div className="space-y-4 pb-8">
      <CountdownBanner targetDate={departureDate} />

      <EmergencyContacts tp={viagem.tp} pv={viagem.pv} viagemTitulo={viagem.titulo} />

      {participant && (
        <ChecklistPreEmbarque
          token={token}
          participantId={participant.id}
        />
      )}

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
