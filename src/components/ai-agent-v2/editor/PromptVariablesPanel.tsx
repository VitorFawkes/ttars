import { Variable } from 'lucide-react'
import { PROMPT_VARIABLES } from './types'

interface Props {
  onInsert: (token: string) => void
}

export function PromptVariablesPanel({ onInsert }: Props) {
  return (
    <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
      <div className="flex items-center gap-2 mb-2">
        <Variable className="w-3.5 h-3.5 text-slate-500" />
        <span className="text-xs font-medium text-slate-600">Variáveis disponíveis</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {PROMPT_VARIABLES.map(v => (
          <button
            key={v.token}
            type="button"
            onClick={() => onInsert(v.token)}
            title={v.description}
            className="text-xs px-2 py-1 bg-white border border-slate-200 rounded hover:border-indigo-300 hover:bg-indigo-50 text-slate-700 font-mono transition-colors"
          >
            {v.token}
          </button>
        ))}
      </div>
      <p className="text-[11px] text-slate-400 mt-2">
        Clique em uma variável para inserir no prompt focado. Valores são substituídos em runtime.
      </p>
    </div>
  )
}
