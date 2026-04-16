import type { Viagem, DayGroupData, TripItem, TripComment } from '@/types/viagem'
import { DayGroup } from './DayGroup'
import { ItemCard } from './ItemCard'
import { ContactCard } from './ContactCard'
import { CommentThread } from './CommentThread'
import { StickyFooter } from './StickyFooter'
import { useViagemMutations } from '@/hooks/viagem/useViagemMutations'
import { useState } from 'react'

interface DecisionViewProps {
  viagem: Viagem
  days: DayGroupData[]
  orphans: TripItem[]
  comments: TripComment[]
  token: string
}

export function DecisionView({
  viagem,
  days,
  orphans,
  comments,
  token,
}: DecisionViewProps) {
  const { aprovarItem, escolherAlternativa, comentar, confirmarViagem } = useViagemMutations(token)
  const [showViagemComments, setShowViagemComments] = useState(false)

  const viagemComments = comments.filter((c) => c.item_id === null)
  const approvingItemId = aprovarItem.isPending ? (aprovarItem.variables as string) : null

  return (
    <div className="space-y-4 pb-28">
      {/* Travel Planner contact */}
      {viagem.tp && (
        <ContactCard owner={viagem.tp} role="tp" />
      )}

      {/* Days timeline */}
      {days.map((group) => (
        <DayGroup
          key={group.day.id}
          group={group}
          comments={comments}
          onApprove={(id) => aprovarItem.mutate(id)}
          onChooseAlternative={(itemId, altId) =>
            escolherAlternativa.mutate({ itemId, alternativaId: altId })
          }
          onComment={(itemId, texto) =>
            comentar.mutate({ itemId, texto })
          }
          approvingItemId={approvingItemId}
          isCommenting={comentar.isPending}
        />
      ))}

      {/* Orphan items (no parent day) */}
      {orphans.map((item) => (
        <ItemCard
          key={item.id}
          item={item}
          comments={comments}
          onApprove={(id) => aprovarItem.mutate(id)}
          onChooseAlternative={(itemId, altId) =>
            escolherAlternativa.mutate({ itemId, alternativaId: altId })
          }
          onComment={(itemId, texto) =>
            comentar.mutate({ itemId, texto })
          }
          isApproving={approvingItemId === item.id}
          isCommenting={comentar.isPending}
        />
      ))}

      {/* General comments */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4 space-y-3">
        <button
          type="button"
          onClick={() => setShowViagemComments(!showViagemComments)}
          className="text-sm font-medium text-slate-700 w-full text-left"
        >
          Comentários gerais {viagemComments.length > 0 && `(${viagemComments.length})`}
        </button>
        {showViagemComments && (
          <CommentThread
            comments={viagemComments}
            onComment={(texto) => comentar.mutate({ itemId: null, texto })}
            isSubmitting={comentar.isPending}
            placeholder="Fale com sua Travel Planner..."
          />
        )}
      </div>

      {/* Sticky footer */}
      <StickyFooter
        totalEstimado={viagem.total_estimado}
        totalAprovado={viagem.total_aprovado}
        onConfirm={() => confirmarViagem.mutate()}
        isConfirming={confirmarViagem.isPending}
      />
    </div>
  )
}
