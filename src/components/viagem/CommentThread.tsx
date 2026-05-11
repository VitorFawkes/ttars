import { useState } from 'react'
import { Send, User } from 'lucide-react'
import type { TripComment } from '@/types/viagem'

interface CommentThreadProps {
  comments: TripComment[]
  onComment: (texto: string) => void
  isSubmitting?: boolean
  placeholder?: string
  /** ID do participant logado, para distinguir "Você" de "outro passageiro" */
  selfParticipantId?: string | null
}

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'agora'
  if (mins < 60) return `${mins}min`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  return `${days}d`
}

const AUTOR_LABEL: Record<string, string> = {
  client: 'Você',
  tp: 'Travel Planner',
  pv: 'Pós-Venda',
}

const RELACAO_LABEL: Record<string, string> = {
  marido: 'marido',
  esposa: 'esposa',
  companheiro: 'companheiro(a)',
  filho: 'filho',
  filha: 'filha',
  pai: 'pai',
  mae: 'mãe',
  amigo: 'amigo(a)',
  outro: 'outro',
}

function labelFromComment(c: { autor: string; autor_nome?: string | null; autor_relacao?: string | null }, selfParticipantId?: string | null, commentAutorId?: string | null): string {
  if (c.autor === 'client') {
    // Se é o próprio participant logado, "Você"
    if (selfParticipantId && commentAutorId && selfParticipantId === commentAutorId) {
      return 'Você'
    }
    if (c.autor_nome) {
      const firstName = c.autor_nome.split(' ')[0]
      const rel = c.autor_relacao ? RELACAO_LABEL[c.autor_relacao] : null
      return rel ? `${firstName} (${rel})` : firstName
    }
    return 'Cliente'
  }
  return AUTOR_LABEL[c.autor] ?? c.autor
}

export function CommentThread({
  comments,
  onComment,
  isSubmitting,
  placeholder = 'Escreva um comentário...',
  selfParticipantId,
}: CommentThreadProps) {
  const [texto, setTexto] = useState('')

  const handleSubmit = () => {
    const trimmed = texto.trim()
    if (!trimmed) return
    onComment(trimmed)
    setTexto('')
  }

  return (
    <div className="space-y-3">
      {comments.length > 0 && (
        <div className="space-y-2">
          {comments.map((c) => {
            const commentAutorId = (c as { autor_id?: string | null }).autor_id ?? null
            const isSelf = c.autor === 'client' && selfParticipantId && commentAutorId === selfParticipantId
            const showOnRight = c.autor === 'client' && isSelf
            return (
              <div
                key={c.id}
                className={`rounded-lg px-3 py-2 text-sm ${
                  c.autor === 'client'
                    ? showOnRight
                      ? 'bg-indigo-50 text-slate-800 ml-6'
                      : 'bg-emerald-50 text-slate-800 ml-6'
                    : 'bg-slate-50 text-slate-700 mr-6'
                }`}
              >
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="font-medium text-xs">
                    {labelFromComment(c, selfParticipantId, commentAutorId)}
                  </span>
                  <span className="text-xs text-slate-400">
                    {formatTimeAgo(c.created_at)}
                  </span>
                </div>
                <p className="whitespace-pre-wrap">{c.texto}</p>
              </div>
            )
          })}
        </div>
      )}

      <div className="flex items-center gap-2">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-indigo-600">
          <User className="h-3.5 w-3.5" />
        </div>
        <input
          type="text"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          placeholder={placeholder}
          className="flex-1 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-300"
        />
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!texto.trim() || isSubmitting}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-white disabled:opacity-40 hover:bg-indigo-700 transition-colors"
          aria-label="Enviar comentário"
        >
          <Send className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}
