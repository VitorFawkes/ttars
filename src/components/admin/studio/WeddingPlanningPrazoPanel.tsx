import { useEffect, useState } from 'react'
import { CalendarClock } from 'lucide-react'
import { useWeddingPlanningPrazo } from '../../../hooks/planejamento/useWeddingPlanningPrazo'

/**
 * Prazo PADRÃO do Planejamento (dias) deste workspace — editável pelo admin.
 * O relógio de cada casamento conta da entrada no planejamento; cada casamento
 * pode ter um prazo próprio (override na tela do casamento).
 */
export default function WeddingPlanningPrazoPanel({ pipelineId }: { pipelineId: string }) {
  const { defaultDias, isLoading, setDefault } = useWeddingPlanningPrazo(pipelineId)
  const [val, setVal] = useState<string>('')

  useEffect(() => {
    if (!isLoading) setVal(String(defaultDias))
  }, [defaultDias, isLoading])

  const dirty = val !== '' && Number(val) !== defaultDias && Number(val) > 0

  return (
    <div className="p-3 rounded-lg border border-slate-200 bg-white">
      <div className="flex items-center gap-2 mb-1">
        <CalendarClock className="w-4 h-4 text-indigo-600" />
        <span className="text-sm font-semibold text-slate-900">Prazo padrão do Planejamento</span>
      </div>
      <p className="text-xs text-slate-500 mb-2">
        Quantos dias o planejamento deve durar, contando da entrada de cada casamento. Cada casamento pode ter um prazo próprio na tela dele.
      </p>
      <div className="flex items-center gap-2">
        <input
          type="number"
          min={1}
          max={365}
          value={val}
          onChange={(e) => setVal(e.target.value)}
          className="w-20 px-2 py-1.5 text-sm border border-slate-300 rounded tabular-nums focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
        />
        <span className="text-sm text-slate-500">dias</span>
        <button
          type="button"
          disabled={!dirty || setDefault.isPending}
          onClick={() => setDefault.mutate(Number(val))}
          className="ml-auto px-3 py-1.5 text-sm bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {setDefault.isPending ? 'Salvando…' : 'Salvar padrão'}
        </button>
      </div>
    </div>
  )
}
