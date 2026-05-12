import { useEffect, useState } from 'react'
import { Clock } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '../../ui/popover'
import { Button } from '../../ui/Button'
import { useOrg } from '../../../contexts/OrgContext'
import { useUpdateConciergeFutureThreshold } from '../../../hooks/concierge/useUpdateConciergeFutureThreshold'
import { DEFAULT_CONCIERGE_FUTURE_THRESHOLD_DAYS } from '../../../hooks/concierge/useKanbanTarefas'

export function ConciergeFutureThresholdControl() {
  const { org } = useOrg()
  const atual = org?.concierge_future_threshold_days ?? DEFAULT_CONCIERGE_FUTURE_THRESHOLD_DAYS
  const update = useUpdateConciergeFutureThreshold()
  const [open, setOpen] = useState(false)
  const [valor, setValor] = useState<string>(String(atual))

  useEffect(() => {
    if (open) setValor(String(atual))
  }, [open, atual])

  const handleSalvar = () => {
    const n = Number(valor)
    if (!Number.isFinite(n)) return
    update.mutate(
      { dias: n },
      { onSuccess: () => setOpen(false) }
    )
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 h-7 px-2.5 text-[12px] font-medium rounded text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
          title="Configurar a partir de quantos dias um atendimento entra na aba Agendados para o futuro"
        >
          <Clock className="w-3.5 h-3.5 text-violet-500" />
          Futuros: <span className="font-semibold tabular-nums">{atual}d</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72">
        <div className="space-y-3">
          <div>
            <div className="text-sm font-semibold text-slate-900">Estocar a partir de</div>
            <div className="text-[11.5px] text-slate-500 mt-0.5">
              Atendimentos com vencimento acima desse valor ficam na coluna "Agendados para o futuro".
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              max={365}
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              className="w-20 px-2 py-1.5 border border-slate-200 rounded-md text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-violet-400 tabular-nums"
            />
            <span className="text-sm text-slate-600">dias</span>
          </div>
          <div className="flex items-center justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={update.isPending}>
              Cancelar
            </Button>
            <Button onClick={handleSalvar} disabled={update.isPending || valor === String(atual)}>
              {update.isPending ? 'Salvando…' : 'Salvar'}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
