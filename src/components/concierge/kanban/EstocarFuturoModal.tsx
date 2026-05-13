import { useState, useEffect } from 'react'
import { X, AlarmClock } from 'lucide-react'
import { Button } from '../../ui/Button'
import { cn } from '../../../lib/utils'

interface EstocarFuturoModalProps {
  open: boolean
  /** Pré-popula o input quando re-estocando um card que já tinha valor. */
  avisoDiasAtual?: number
  /** Modo de exibição: "estocar" ao mover pra Futuro, "editar" pra ajustar
   *  o aviso de um card já estocado. Muda só labels. */
  modo?: 'estocar' | 'editar'
  onClose: () => void
  onConfirm: (avisoDias: number) => void
  isSubmitting?: boolean
}

const PRESETS = [3, 7, 15, 30] as const

export function EstocarFuturoModal({ open, avisoDiasAtual, modo = 'estocar', onClose, onConfirm, isSubmitting }: EstocarFuturoModalProps) {
  const [avisoDias, setAvisoDias] = useState<number>(avisoDiasAtual ?? 7)

  useEffect(() => {
    if (open) setAvisoDias(avisoDiasAtual ?? 7)
  }, [open, avisoDiasAtual])

  if (!open) return null

  const titulo = modo === 'editar' ? 'Ajustar aviso do Futuro' : 'Estocar em "Agendados para o futuro"'
  const cta = isSubmitting
    ? 'Salvando…'
    : modo === 'editar' ? 'Salvar aviso' : 'Estocar'

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <AlarmClock className="w-4 h-4 text-violet-600" />
            <h3 className="text-base font-bold text-slate-900">{titulo}</h3>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded" type="button">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-3">
          <p className="text-sm text-slate-600">
            Quantos dias antes do prazo o card deve <span className="font-semibold text-amber-700">começar a piscar</span> pra te avisar?
          </p>

          <div className="grid grid-cols-4 gap-2">
            {PRESETS.map(dias => {
              const isSel = avisoDias === dias
              return (
                <button
                  key={dias}
                  type="button"
                  onClick={() => setAvisoDias(dias)}
                  className={cn(
                    'px-2.5 py-2 rounded-md text-[12.5px] font-medium border transition',
                    isSel
                      ? 'bg-violet-100 border-violet-300 text-violet-800'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                  )}
                >
                  {dias}d antes
                </button>
              )
            })}
          </div>

          <div className="flex items-center gap-2">
            <label className="text-[12px] text-slate-600 shrink-0">Custom:</label>
            <input
              type="number"
              min={1}
              max={365}
              value={avisoDias}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10)
                if (Number.isFinite(v) && v >= 1) setAvisoDias(v)
              }}
              className="w-20 h-8 px-2 text-sm border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-300"
            />
            <span className="text-[12px] text-slate-500">dias antes do prazo</span>
          </div>

          <p className="text-[11px] text-slate-500">
            O card fica em Futuro indefinidamente — nada move sozinho. Quando faltar {avisoDias}d ou menos pro prazo, a coluna pisca em amarelo pra te avisar.
          </p>
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-200 bg-slate-50 rounded-b-xl">
          <Button variant="ghost" onClick={onClose} disabled={isSubmitting}>Cancelar</Button>
          <Button onClick={() => onConfirm(avisoDias)} disabled={isSubmitting || avisoDias < 1}>
            {cta}
          </Button>
        </div>
      </div>
    </div>
  )
}
