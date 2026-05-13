import { useState, useMemo } from 'react'
import { X, CalendarClock } from 'lucide-react'
import { Button } from '../../ui/Button'
import { cn } from '../../../lib/utils'

interface SnoozeAtendimentoModalProps {
  open: boolean
  onClose: () => void
  onConfirm: (dataIso: string) => void
  isSubmitting?: boolean
}

const PRESETS = [
  { label: 'Em 7 dias',  dias: 7 },
  { label: 'Em 30 dias', dias: 30 },
  { label: 'Em 60 dias', dias: 60 },
] as const

function addDaysIso(dias: number): string {
  const d = new Date()
  d.setDate(d.getDate() + dias)
  d.setHours(9, 0, 0, 0)
  return d.toISOString()
}

function toDateInputValue(iso: string): string {
  const d = new Date(iso)
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

export function SnoozeAtendimentoModal({ open, onClose, onConfirm, isSubmitting }: SnoozeAtendimentoModalProps) {
  const defaultIso = useMemo(() => addDaysIso(30), [])
  const [dataIso, setDataIso] = useState<string>(defaultIso)

  if (!open) return null

  const handleConfirm = () => {
    onConfirm(dataIso)
  }

  const handlePreset = (dias: number) => {
    setDataIso(addDaysIso(dias))
  }

  const handleCustom = (value: string) => {
    if (!value) return
    const d = new Date(`${value}T09:00:00`)
    if (!Number.isFinite(d.getTime())) return
    setDataIso(d.toISOString())
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <CalendarClock className="w-4 h-4 text-violet-600" />
            <h3 className="text-base font-bold text-slate-900">Estocar para o futuro</h3>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded" type="button">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <p className="text-sm text-slate-600">
            O atendimento fica na coluna <span className="font-semibold text-slate-900">"Agendados para o futuro"</span> até você arrastar de volta. A data abaixo é só o prazo planejado — usamos pra avisar quando chegar perto.
          </p>

          <div>
            <label className="text-sm font-semibold text-slate-900 block mb-2">Prazo planejado de retorno</label>
            <div className="grid grid-cols-3 gap-2 mb-3">
              {PRESETS.map(({ label, dias }) => {
                const presetIso = addDaysIso(dias)
                const isSelected = toDateInputValue(dataIso) === toDateInputValue(presetIso)
                return (
                  <button
                    key={dias}
                    type="button"
                    onClick={() => handlePreset(dias)}
                    className={cn(
                      'px-3 py-2 rounded-lg text-sm font-medium border transition',
                      isSelected
                        ? 'bg-violet-50 border-violet-300 text-violet-700'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    )}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
            <input
              type="date"
              value={toDateInputValue(dataIso)}
              onChange={(e) => handleCustom(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-200 focus:border-violet-300"
            />
            <p className="text-[11px] text-slate-500 mt-2">
              Dica: nada se move sozinho. Quando a data chegar perto, o card vai destacar em amarelo; se passar, em vermelho.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-200 bg-slate-50 rounded-b-xl">
          <Button variant="ghost" onClick={onClose} disabled={isSubmitting}>Cancelar</Button>
          <Button onClick={handleConfirm} disabled={isSubmitting}>
            {isSubmitting ? 'Estocando…' : 'Estocar'}
          </Button>
        </div>
      </div>
    </div>
  )
}
