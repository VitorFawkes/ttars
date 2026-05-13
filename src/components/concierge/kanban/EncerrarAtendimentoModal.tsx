import { useState } from 'react'
import { X } from 'lucide-react'
import { Button } from '../../ui/Button'
import { Textarea } from '../../ui/textarea'

interface EncerrarAtendimentoModalProps {
  open: boolean
  onClose: () => void
  onConfirm: (motivo: 'recusado' | 'cancelado', observacao: string) => void
  isSubmitting?: boolean
}

export function EncerrarAtendimentoModal({ open, onClose, onConfirm, isSubmitting }: EncerrarAtendimentoModalProps) {
  const [observacao, setObservacao] = useState('')

  if (!open) return null

  const handleConfirm = () => {
    onConfirm('cancelado', observacao)
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
          <h3 className="text-base font-bold text-slate-900">Cancelar atendimento</h3>
          <button onClick={handleClose} className="p-1.5 hover:bg-slate-100 rounded">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="text-sm font-semibold text-slate-900 block mb-2">
              Observação <span className="text-slate-400 font-normal">(opcional)</span>
            </label>
            <Textarea
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder="Por que foi cancelado?"
              rows={3}
              className="w-full"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-200 bg-slate-50 rounded-b-xl">
          <Button variant="ghost" onClick={handleClose} disabled={isSubmitting}>Voltar</Button>
          <Button onClick={handleConfirm} disabled={isSubmitting}>
            {isSubmitting ? 'Cancelando…' : 'Confirmar cancelamento'}
          </Button>
        </div>
      </div>
    </div>
  )
}
