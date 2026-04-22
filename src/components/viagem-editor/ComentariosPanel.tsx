import { useState, useMemo } from 'react'
import { Lock, MessageSquare, User } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useTripComments, useCreateTripComment } from '@/hooks/viagem/useTripComments'
import type { TripCommentInterno } from '@/hooks/viagem/useTripComments'

interface Props {
  viagemId: string
  itemId: string | null
  viagemTitulo?: string | null
}

function formatRelative(iso: string) {
  const then = new Date(iso).getTime()
  const now = Date.now()
  const diff = Math.floor((now - then) / 1000)
  if (diff < 60) return 'agora'
  if (diff < 3600) return `há ${Math.floor(diff / 60)} min`
  if (diff < 86400) return `há ${Math.floor(diff / 3600)} h`
  if (diff < 604800) return `há ${Math.floor(diff / 86400)} dia${Math.floor(diff / 86400) > 1 ? 's' : ''}`
  return new Date(iso).toLocaleDateString('pt-BR')
}

function autorLabel(c: TripCommentInterno) {
  if (c.autor === 'client') return 'Cliente'
  if (c.autor === 'tp') return 'Travel Planner'
  return 'Pós-Venda'
}

function autorColor(autor: TripCommentInterno['autor']) {
  if (autor === 'client') return 'bg-emerald-50 text-emerald-900 border-emerald-100'
  if (autor === 'tp') return 'bg-indigo-50 text-indigo-900 border-indigo-100'
  return 'bg-violet-50 text-violet-900 border-violet-100'
}

export function ComentariosPanel({ viagemId, itemId, viagemTitulo }: Props) {
  const { data: allComments = [], isLoading } = useTripComments(viagemId)
  const createComment = useCreateTripComment()

  const [text, setText] = useState('')
  const [isInterno, setIsInterno] = useState(false)

  const comments = useMemo(() => {
    // Mostra comentários do item específico. Se itemId é null, mostra os "da viagem".
    return allComments.filter((c) => c.item_id === itemId)
  }, [allComments, itemId])

  const handleSend = () => {
    const t = text.trim()
    if (!t) return
    createComment.mutate(
      { viagem_id: viagemId, item_id: itemId, texto: t, interno: isInterno },
      {
        onSuccess: () => setText(''),
      },
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-slate-200 px-4 py-2 text-xs text-slate-500">
        {itemId
          ? 'Conversando sobre este item'
          : `Conversando sobre ${viagemTitulo ? `"${viagemTitulo}"` : 'a viagem'}`}
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {isLoading ? (
          <p className="text-center text-xs text-slate-400">Carregando...</p>
        ) : comments.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center text-xs text-slate-400">
            <MessageSquare className="h-8 w-8 text-slate-300" />
            <p>Nenhum comentário ainda.</p>
            <p>Seja o primeiro a escrever.</p>
          </div>
        ) : (
          comments.map((c) => (
            <div
              key={c.id}
              className={`rounded-xl border px-3 py-2 text-sm ${autorColor(c.autor)}`}
            >
              <div className="mb-1 flex items-center justify-between gap-2 text-[11px]">
                <span className="flex items-center gap-1 font-medium">
                  <User className="h-3 w-3" />
                  {autorLabel(c)}
                </span>
                <span className="flex items-center gap-1 text-slate-500">
                  {c.interno && (
                    <span className="flex items-center gap-0.5 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
                      <Lock className="h-2.5 w-2.5" />
                      Interno
                    </span>
                  )}
                  {formatRelative(c.created_at)}
                </span>
              </div>
              <p className="whitespace-pre-wrap text-slate-800">{c.texto}</p>
            </div>
          ))
        )}
      </div>

      <div className="border-t border-slate-200 bg-slate-50 p-3">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault()
              handleSend()
            }
          }}
          placeholder={
            isInterno
              ? 'Comentário interno (cliente não vê)...'
              : 'Escreva para o cliente...'
          }
          rows={3}
          className="w-full resize-none rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <div className="mt-2 flex items-center justify-between">
          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-600">
            <input
              type="checkbox"
              checked={isInterno}
              onChange={(e) => setIsInterno(e.target.checked)}
              className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
            <Lock className="h-3 w-3" />
            Interno (não enviar ao cliente)
          </label>
          <Button
            size="sm"
            onClick={handleSend}
            disabled={!text.trim() || createComment.isPending}
          >
            {createComment.isPending ? 'Enviando...' : 'Enviar'}
          </Button>
        </div>
      </div>
    </div>
  )
}
