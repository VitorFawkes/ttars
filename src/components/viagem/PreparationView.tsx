import { PartyPopper } from 'lucide-react'
import type { Viagem, DayGroupData, TripItem, TripComment } from '@/types/viagem'
import { DayGroup } from './DayGroup'
import { ItemCard } from './ItemCard'
import { ContactCard } from './ContactCard'
import { ChecklistPreEmbarque } from './ChecklistPreEmbarque'
import { useParticipant } from '@/hooks/viagem/useParticipant'

interface PreparationViewProps {
  viagem: Viagem
  days: DayGroupData[]
  orphans: TripItem[]
  comments: TripComment[]
  token: string
}

export function PreparationView({ viagem, days, orphans, comments, token }: PreparationViewProps) {
  const { participant } = useParticipant(viagem.id)
  const pvFirstName = viagem.pv?.nome?.split(' ')[0]
  return (
    <div className="space-y-4 pb-8">
      {/* Confirmed banner */}
      <div className="rounded-xl bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 p-4 text-center">
        <PartyPopper className="h-8 w-8 text-emerald-500 mx-auto mb-2" />
        <h2 className="text-lg font-bold text-slate-900 tracking-tight">
          Sua viagem está confirmada! 🎉
        </h2>
        <p className="text-sm text-slate-600 mt-1">
          {pvFirstName
            ? `Agora ${pvFirstName} cuida de todos os detalhes.`
            : 'Nosso time de pós-venda cuida de todos os detalhes a partir daqui.'}
        </p>
      </div>

      {/* PV contact — primary pós-aceite */}
      {viagem.pv && (
        <div className="space-y-1">
          <p className="text-xs text-slate-500 px-1">
            Quem cuida da sua viagem agora:
          </p>
          <ContactCard owner={viagem.pv} role="pv" variant="primary" viagemTitulo={viagem.titulo} />
        </div>
      )}

      {/* TP — contato secundário pós-aceite */}
      {viagem.tp && (
        <div className="space-y-1">
          <p className="text-xs text-slate-500 px-1">
            Quem desenhou sua viagem:
          </p>
          <ContactCard owner={viagem.tp} role="tp" variant="secondary" viagemTitulo={viagem.titulo} />
        </div>
      )}

      {/* Checklist pré-embarque */}
      {participant && (
        <ChecklistPreEmbarque
          token={token}
          participantId={participant.id}
        />
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
