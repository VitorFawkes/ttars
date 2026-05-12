import { useEffect, useMemo, useState } from 'react'
import { X, Calendar as CalendarIcon } from 'lucide-react'
import { addDays, addMonths, addYears, setHours, setMinutes, format } from 'date-fns'
import { Button } from '../../ui/Button'
import { cn } from '../../../lib/utils'

export type ReagendarMode = 'to_future' | 'to_active'

interface Preset {
  key: string
  label: string
  compute: (now: Date) => Date
}

interface ReagendarConciergeDateModalProps {
  open: boolean
  mode: ReagendarMode
  thresholdDays: number
  onClose: () => void
  onConfirm: (novaDataIso: string) => void
  isSubmitting?: boolean
}

function buildPresets(mode: ReagendarMode, thresholdDays: number): Preset[] {
  if (mode === 'to_future') {
    return [
      { key: 'plus_threshold', label: `+ ${thresholdDays + 1} dias`, compute: (now) => addDays(now, thresholdDays + 1) },
      { key: '3m',  label: 'Daqui 3 meses',  compute: (now) => addMonths(now, 3) },
      { key: '6m',  label: 'Daqui 6 meses',  compute: (now) => addMonths(now, 6) },
      { key: '1y',  label: 'Daqui 1 ano',    compute: (now) => addYears(now, 1) },
    ]
  }
  return [
    { key: 'today_14', label: 'Hoje 14h',     compute: (now) => setMinutes(setHours(now, 14), 0) },
    { key: 'tomorrow_9', label: 'Amanhã 9h',  compute: (now) => setMinutes(setHours(addDays(now, 1), 9), 0) },
    { key: 'in_3d',   label: 'Daqui 3 dias',  compute: (now) => addDays(now, 3) },
    { key: 'in_7d',   label: 'Daqui 7 dias',  compute: (now) => addDays(now, 7) },
  ]
}

function toLocalInputValue(d: Date): string {
  // <input type="datetime-local"> espera "yyyy-MM-ddTHH:mm" em horário local.
  return format(d, "yyyy-MM-dd'T'HH:mm")
}

export function ReagendarConciergeDateModal({
  open,
  mode,
  thresholdDays,
  onClose,
  onConfirm,
  isSubmitting,
}: ReagendarConciergeDateModalProps) {
  const presets = useMemo(() => buildPresets(mode, thresholdDays), [mode, thresholdDays])
  const [valor, setValor] = useState<string>('')

  useEffect(() => {
    if (open) {
      const inicial = presets[0]?.compute(new Date()) ?? new Date()
      setValor(toLocalInputValue(inicial))
    }
  }, [open, presets])

  if (!open) return null

  const handlePreset = (preset: Preset) => {
    setValor(toLocalInputValue(preset.compute(new Date())))
  }

  const handleConfirm = () => {
    if (!valor) return
    // O input "datetime-local" é tz-naive. Construímos um Date local e
    // convertemos pra ISO/UTC pra persistir, igual o resto do app.
    const dt = new Date(valor)
    if (!Number.isFinite(dt.getTime())) return
    onConfirm(dt.toISOString())
  }

  const titulo = mode === 'to_future' ? 'Agendar para o futuro' : 'Trazer para o atendimento ativo'
  const descricao =
    mode === 'to_future'
      ? `Escolha quando o atendimento deve voltar ao kanban (deve estar a mais de ${thresholdDays} dias).`
      : 'Escolha a nova data de vencimento dentro da janela de atendimento ativo.'

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <CalendarIcon className="w-4 h-4 text-violet-600" />
            {titulo}
          </h3>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded" aria-label="Fechar">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <p className="text-[12.5px] text-slate-600">{descricao}</p>

          <div>
            <label className="text-sm font-semibold text-slate-900 block mb-2">Atalhos</label>
            <div className="grid grid-cols-2 gap-2">
              {presets.map((preset) => (
                <button
                  key={preset.key}
                  type="button"
                  onClick={() => handlePreset(preset)}
                  className={cn(
                    'px-3 py-2 rounded-lg text-sm font-medium border transition',
                    'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300'
                  )}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-sm font-semibold text-slate-900 block mb-2" htmlFor="reagendar-data">
              Data e hora
            </label>
            <input
              id="reagendar-data"
              type="datetime-local"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-violet-400"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-200 bg-slate-50 rounded-b-xl">
          <Button variant="ghost" onClick={onClose} disabled={isSubmitting}>Cancelar</Button>
          <Button onClick={handleConfirm} disabled={isSubmitting || !valor}>
            {isSubmitting ? 'Reagendando…' : 'Confirmar'}
          </Button>
        </div>
      </div>
    </div>
  )
}
