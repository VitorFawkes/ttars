import { Clock, Eye } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import type { Viagem, DayGroupData, TripItem, TripComment, ViagemEstado } from '@/types/viagem'
import { ViagemHero } from './ViagemHero'
import { DecisionView } from './DecisionView'
import { PreparationView } from './PreparationView'
import { CountdownView } from './CountdownView'
import { TravelView } from './TravelView'
import { MemoryView } from './MemoryView'
import { OfflineBanner } from './OfflineBanner'
import { ParticipantGate } from './ParticipantGate'
import { FloatingChatButton } from './FloatingChatButton'
import { PWAInstallHint } from './PWAInstallHint'
import { useParticipant } from '@/hooks/viagem/useParticipant'

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
  const { participant, ready, refresh } = useParticipant(viagem.id)
  const [searchParams] = useSearchParams()
  // Modo preview: TP/PV previewando via iframe do editor.
  // Pula o gate e não renderiza widgets de passageiro real (chat, PWA install).
  const isPreview = searchParams.get('preview') === '1'

  // Gate aparece em estados onde o passageiro interage ativamente:
  // decisão, preparação, contagem e em andamento. Nos estados iniciais
  // ("preparando") e de memória, não bloqueia.
  const precisaIdentificar =
    !isPreview &&
    !participant &&
    ready &&
    ['decision', 'preparation', 'countdown', 'travel'].includes(view)

  if (precisaIdentificar) {
    return (
      <ParticipantGate
        viagemId={viagem.id}
        token={token}
        tpNome={viagem.tp?.nome ?? null}
        onIdentified={() => {
          // Gate já gravou em localStorage; re-ler para rerender desta página.
          refresh()
        }}
      />
    )
  }

  return (
    <div className="min-h-dvh bg-slate-50">
      <OfflineBanner />
      {isPreview && (
        <div className="sticky top-0 z-40 flex items-center justify-center gap-2 bg-indigo-50 border-b border-indigo-200 px-4 py-1.5">
          <Eye className="h-3.5 w-3.5 text-indigo-600 shrink-0" />
          <p className="text-[11px] font-medium text-indigo-800">
            Preview do editor — o cliente vê a mesma página depois de se identificar
          </p>
        </div>
      )}
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
              token={token}
            />
          )}

          {view === 'countdown' && (
            <CountdownView
              viagem={viagem}
              days={days}
              orphans={orphans}
              comments={comments}
              token={token}
            />
          )}

          {view === 'travel' && (
            <TravelView
              viagem={viagem}
              days={days}
              orphans={orphans}
              comments={comments}
              token={token}
            />
          )}

          {view === 'memory' && (
            <MemoryView
              viagem={viagem}
              days={days}
              orphans={orphans}
              comments={comments}
              token={token}
            />
          )}
        </div>
      </div>

      {/* Botão flutuante "Conversar com a equipe" — disponível em todos os
          estados ativos com passageiro identificado. Não aparece no preview
          do editor. */}
      {!isPreview && participant && ['decision', 'preparation', 'countdown', 'travel'].includes(view) && (
        <FloatingChatButton
          token={token}
          comments={comments}
          participantId={participant.id}
        />
      )}

      {/* Sugestão de instalar como PWA (só em mobile e fora do preview) */}
      {!isPreview && <PWAInstallHint />}
    </div>
  )
}
