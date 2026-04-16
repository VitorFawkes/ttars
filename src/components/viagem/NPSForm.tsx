import { useState } from 'react'
import { Star, Send } from 'lucide-react'

interface NPSFormProps {
  onSubmit?: (score: number, comment: string) => void
}

export function NPSForm({ onSubmit }: NPSFormProps) {
  const [score, setScore] = useState<number | null>(null)
  const [comment, setComment] = useState('')
  const [submitted, setSubmitted] = useState(false)

  const handleSubmit = () => {
    if (score === null) return
    onSubmit?.(score, comment)
    setSubmitted(true)
  }

  if (submitted) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6 text-center">
        <Star className="h-8 w-8 text-amber-400 mx-auto mb-2 fill-amber-400" />
        <p className="text-sm font-semibold text-slate-900">Obrigado pelo feedback!</p>
        <p className="text-xs text-slate-500 mt-1">Sua opinião nos ajuda a melhorar.</p>
      </div>
    )
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4 space-y-4">
      <h3 className="text-sm font-semibold text-slate-900 text-center">
        Como foi sua viagem?
      </h3>

      {/* Score picker */}
      <div className="flex justify-center gap-1">
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setScore(n)}
            className={`flex h-9 w-9 items-center justify-center rounded-lg text-sm font-medium transition-colors ${
              score === n
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-50 text-slate-600 hover:bg-indigo-50'
            }`}
          >
            {n}
          </button>
        ))}
      </div>

      <div className="flex justify-between text-xs text-slate-400 px-1">
        <span>Ruim</span>
        <span>Excelente</span>
      </div>

      {score !== null && (
        <>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Quer contar mais? (opcional)"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-300 resize-none"
            rows={3}
          />
          <button
            type="button"
            onClick={handleSubmit}
            className="w-full flex items-center justify-center gap-2 rounded-full bg-indigo-600 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 transition-colors"
          >
            <Send className="h-3.5 w-3.5" />
            Enviar
          </button>
        </>
      )}
    </div>
  )
}
