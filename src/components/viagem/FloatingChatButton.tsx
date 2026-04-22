import { useState } from 'react'
import { MessageCircle, X } from 'lucide-react'
import type { TripComment } from '@/types/viagem'
import { CommentThread } from './CommentThread'
import { useViagemMutations } from '@/hooks/viagem/useViagemMutations'

interface Props {
  token: string
  comments: TripComment[]
  participantId: string | null
  label?: string
}

/**
 * Botão flutuante que abre a thread "geral" (item_id=null) da viagem.
 * Fica disponível em todos os estados ativos (decision, preparation,
 * countdown, em_andamento), sempre a um toque.
 */
export function FloatingChatButton({ token, comments, participantId, label }: Props) {
  const [open, setOpen] = useState(false)
  const { comentar } = useViagemMutations(token)
  const viagemComments = comments.filter((c) => c.item_id === null)
  const naoLidas = viagemComments.filter((c) => c.autor !== 'client').length

  return (
    <>
      {/* Drawer / modal com thread */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">Conversar com a equipe</h2>
                <p className="text-[11px] text-slate-500">Mensagens sobre a viagem toda</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                aria-label="Fechar"
              >
                <X className="h-4 w-4" />
              </button>
            </header>

            <div className="flex-1 overflow-y-auto px-4 py-3">
              <CommentThread
                comments={viagemComments}
                onComment={(texto) =>
                  comentar.mutate({ itemId: null, texto, participantId })
                }
                isSubmitting={comentar.isPending}
                placeholder="Escreva uma mensagem..."
                selfParticipantId={participantId}
              />
            </div>
          </div>
        </div>
      )}

      {/* Botão flutuante */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-24 right-4 sm:bottom-6 z-30 flex items-center gap-2 rounded-full bg-indigo-600 text-white px-4 py-3 shadow-lg hover:bg-indigo-700 transition-colors"
        aria-label="Conversar com a equipe"
      >
        <MessageCircle className="h-5 w-5" />
        <span className="text-sm font-medium hidden sm:inline">
          {label ?? 'Conversar'}
        </span>
        {naoLidas > 0 && (
          <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
            {naoLidas > 9 ? '9+' : naoLidas}
          </span>
        )}
      </button>
    </>
  )
}
