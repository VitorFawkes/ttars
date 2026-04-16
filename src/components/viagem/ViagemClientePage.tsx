import { Clock } from 'lucide-react'
import type { Viagem, DayGroupData, TripItem, TripComment, ViagemEstado } from '@/types/viagem'
import { ViagemHero } from './ViagemHero'
import { DecisionView } from './DecisionView'
import { PreparationView } from './PreparationView'
import { CountdownView } from './CountdownView'
import { TravelView } from './TravelView'
import { MemoryView } from './MemoryView'
import { OfflineBanner } from './OfflineBanner'

interface ViagemClientePageProps {
  viagem: Viagem
  days: DayGroupData[]
  orphans: TripItem[]
  comments: TripComment[]
  token: string
}

const ESTADO_TO_VIEW: Record<ViagemEstado, string> = {
  desenho: 'preparing',
  em_recomendacao: 'decision',
  em_aprovacao: 'decision',
  confirmada: 'preparation',
  em_montagem: 'preparation',
  aguardando_embarque: 'countdown',
  em_andamento: 'travel',
  pos_viagem: 'memory',
  concluida: 'memory',
}

export function ViagemClientePage({
  viagem,
  days,
  orphans,
  comments,
  token,
}: ViagemClientePageProps) {
  const view = ESTADO_TO_VIEW[viagem.estado]

  return (
    <div className="min-h-dvh bg-slate-50">
      <OfflineBanner />
      <div className="max-w-lg mx-auto">
        <ViagemHero
          titulo={viagem.titulo}
          subtitulo={viagem.subtitulo}
          capaUrl={viagem.capa_url}
          estado={viagem.estado}
        />

        <div className="px-4 py-4">
          {view === 'preparing' && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Clock className="h-12 w-12 text-indigo-300 mb-4" />
              <h2 className="text-lg font-semibold text-slate-900">
                Sua viagem está sendo preparada
              </h2>
              <p className="text-sm text-slate-500 mt-2 max-w-xs">
                Sua Travel Planner está desenhando algo especial para você. Em breve você receberá uma notificação.
              </p>
            </div>
          )}

          {view === 'decision' && (
            <DecisionView
              viagem={viagem}
              days={days}
              orphans={orphans}
              comments={comments}
              token={token}
            />
          )}

          {view === 'preparation' && (
            <PreparationView
              viagem={viagem}
              days={days}
              orphans={orphans}
              comments={comments}
            />
          )}

          {view === 'countdown' && (
            <CountdownView
              viagem={viagem}
              days={days}
              orphans={orphans}
              comments={comments}
            />
          )}

          {view === 'travel' && (
            <TravelView
              viagem={viagem}
              days={days}
              orphans={orphans}
              comments={comments}
            />
          )}

          {view === 'memory' && (
            <MemoryView
              viagem={viagem}
              days={days}
              orphans={orphans}
              comments={comments}
            />
          )}
        </div>
      </div>
    </div>
  )
}
