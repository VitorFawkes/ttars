import { useState } from 'react'
import { X } from 'lucide-react'
import { Button } from '../../ui/Button'
import { Textarea } from '../../ui/textarea'
import { cn } from '../../../lib/utils'

interface EncerrarAtendimentoModalProps {
  open: boolean
  onClose: () => void
  onConfirm: (motivo: 'recusado' | 'cancelado', observacao: string) => void
  isSubmitting?: boolean
}

export function EncerrarAtendimentoModal({ open, onClose, onConfirm, isSubmitting }: EncerrarAtendimentoModalProps) {
  const [motivo, setMotivo] = useState<'recusado' | 'cancelado'>('cancelado')
  const [observacao, setObservacao] = useState('')

  if (!open) return null

  const handleConfirm = () => {
    onConfirm(motivo, observacao)
    setObservacao('')
  }

  const handleClose = () => {
    setObservacao('')
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={handleClose}>
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h3 className="text-base font-bold text-slate-900">Encerrar atendimento</h3>
          <button onClick={handleClose} className="p-1.5 hover:bg-slate-100 rounded">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="text-sm font-semibold text-slate-900 block mb-2">Motivo</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setMotivo('cancelado')}
                className={cn(
                  'px-3 py-2 rounded-lg text-sm font-medium border transition',
                  motivo === 'cancelado'
                    ? 'bg-slate-100 border-slate-400 text-slate-900'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                )}
              >
                Cancelado
              </button>
              <button
                type="button"
                onClick={() => setMotivo('recusado')}
                className={cn(
                  'px-3 py-2 rounded-lg text-sm font-medium border transition',
                  motivo === 'recusado'
                    ? 'bg-red-50 border-red-300 text-red-700'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                )}
              >
                Recusado pelo cliente
              </button>
            </div>
            <p className="text-[11px] text-slate-500 mt-2">
              "Cancelado" = não rolou (interno). "Recusado" = cliente disse não.
            </p>
          </div>

          <div>
            <label className="text-sm font-semibold text-slate-900 block mb-2">
              Observação <span className="text-slate-400 font-normal">(opcional)</span>
            </label>
            <Textarea
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder="Por que foi encerrado?"
              rows={3}
              className="w-full"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-200 bg-slate-50 rounded-b-xl">
          <Button variant="ghost" onClick={handleClose} disabled={isSubmitting}>Cancelar</Button>
          <Button onClick={handleConfirm} disabled={isSubmitting}>
            {isSubmitting ? 'Encerrando…' : 'Confirmar encerramento'}
          </Button>
        </div>
      </div>
    </div>
  )
}
