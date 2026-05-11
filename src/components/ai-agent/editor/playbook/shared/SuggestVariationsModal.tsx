import { useEffect, useState } from 'react'
import { Loader2, X, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { toast } from 'sonner'
import { useAgentSuggestVariations, type FieldType, type SuggestVariationsContext, type Suggestion } from '@/hooks/playbook/useAgentSuggestVariations'

interface Props {
  text: string
  fieldType: FieldType
  context?: SuggestVariationsContext
  onSelect: (text: string) => void
  onClose: () => void
}

const FIELD_TITLES: Record<FieldType, string> = {
  mission_one_liner: 'Missão em 1 linha',
  anchor_text: 'Frase-âncora',
  typical_phrase: 'Frase típica',
  forbidden_phrase: 'Frase a evitar',
  example_lead_message: 'Exemplo — mensagem do lead',
  example_agent_response: 'Exemplo — resposta do agente',
  red_line: 'Linha vermelha',
  signal_hint: 'Detecção de sinal',
  moment_label: 'Nome do momento',
  custom: 'Texto',
}

export function SuggestVariationsModal({ text, fieldType, context, onSelect, onClose }: Props) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const mutation = useAgentSuggestVariations()

  const loadSuggestions = async () => {
    try {
      const res = await mutation.mutateAsync({ text, field_type: fieldType, context, num_variations: 3 })
      setSuggestions(res.suggestions ?? [])
    } catch (err) {
      console.error('[SuggestVariationsModal] error:', err)
      toast.error('Não consegui sugerir agora. Tenta de novo.')
    }
  }

  useEffect(() => {
    loadSuggestions()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl border border-slate-200 shadow-xl max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col">
        <header className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div>
            <h3 className="font-medium text-slate-900">Sugestões para: {FIELD_TITLES[fieldType]}</h3>
            <p className="text-xs text-slate-500 mt-0.5">Escolha uma variação ou gere outras 3.</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
            <X className="w-5 h-5" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {mutation.isPending && suggestions.length === 0 && (
            <div className="flex items-center justify-center py-12 text-slate-400">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> Gerando sugestões...
            </div>
          )}
          {suggestions.map((s, i) => (
            <div key={i} className="border border-slate-200 rounded-lg p-4 hover:border-indigo-300 transition-colors">
              <p className="text-sm text-slate-900 whitespace-pre-wrap">{s.text}</p>
              <p className="text-xs text-slate-500 mt-2">• {s.rationale}</p>
              <div className="mt-3 flex justify-end">
                <Button size="sm" onClick={() => onSelect(s.text)}>Usar</Button>
              </div>
            </div>
          ))}
        </div>

        <footer className="flex items-center justify-between px-5 py-3 border-t border-slate-100 bg-slate-50">
          <Button variant="outline" size="sm" onClick={loadSuggestions} disabled={mutation.isPending} className="gap-1.5">
            {mutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Gerar outras 3
          </Button>
          <Button variant="outline" size="sm" onClick={onClose}>Cancelar</Button>
        </footer>
      </div>
    </div>
  )
}
