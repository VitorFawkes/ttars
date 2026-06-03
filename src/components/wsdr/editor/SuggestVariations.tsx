import { useState } from 'react'
import { Sparkles, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'

interface Suggestion { text: string; rationale?: string }

// Botão "Sugerir variações": gera 3 opções de texto pro campo (em vez de escrever do zero).
// Reusa a edge ai-agent-prompt-variations (utilitário puro de texto — não toca a engine).
export function SuggestVariations({ text, fieldType = 'custom', context, onPick }: {
  text: string
  fieldType?: string
  context?: Record<string, unknown>
  onPick: (t: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])

  const fetchSug = async () => {
    setLoading(true)
    setOpen(true)
    const { data, error } = await supabase.functions.invoke<{ suggestions?: Suggestion[]; error?: string }>(
      'ai-agent-prompt-variations',
      { body: { text, field_type: fieldType, context: context ?? {}, num_variations: 3 } },
    )
    setLoading(false)
    if (error || data?.error || !data?.suggestions?.length) {
      toast.error('Não consegui sugerir agora')
      setOpen(false)
      return
    }
    setSuggestions(data.suggestions)
  }

  return (
    <div className="relative inline-block">
      <button type="button" onClick={() => (open ? setOpen(false) : fetchSug())} className="flex items-center gap-1 text-xs text-ww-gold-ink hover:text-ww-gold">
        <Sparkles className="w-3.5 h-3.5" />Sugerir variações
      </button>
      {open && (
        <div className="absolute z-20 right-0 mt-1 w-80 max-w-[88vw] rounded-lg border border-slate-200 bg-white shadow-lg p-2 space-y-1.5">
          {loading ? (
            <div className="flex items-center gap-2 text-xs text-slate-400 p-2"><Loader2 className="w-3.5 h-3.5 animate-spin" />Gerando 3 opções…</div>
          ) : (
            suggestions.map((s, i) => (
              <button key={i} type="button" onClick={() => { onPick(s.text); setOpen(false) }}
                className="block w-full text-left text-xs text-slate-700 hover:bg-ww-gold-soft rounded p-2 border border-slate-100 leading-relaxed">
                {s.text}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
