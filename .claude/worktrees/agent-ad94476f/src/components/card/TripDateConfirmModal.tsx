import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { CalendarDays, AlertTriangle } from 'lucide-react'

interface TripDateConfirmModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: (updatedDate?: { start: string; end: string }) => void
  currentDate: { start?: string; end?: string; data_inicio?: string; data_fim?: string } | null
  cardName?: string
}

function formatDateBR(dateStr: string | undefined): string {
  if (!dateStr) return ''
  const [y, m, d] = dateStr.split('-')
  return `${d}/${m}/${y}`
}

export default function TripDateConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  currentDate,
  cardName,
}: TripDateConfirmModalProps) {
  const [isEditing, setIsEditing] = useState(false)
  const startValue = currentDate?.start || currentDate?.data_inicio || ''
  const endValue = currentDate?.end || currentDate?.data_fim || ''
  const [editStart, setEditStart] = useState(startValue)
  const [editEnd, setEditEnd] = useState(endValue)

  // Reset state when modal opens
  const [prevOpen, setPrevOpen] = useState(false)
  if (isOpen !== prevOpen) {
    setPrevOpen(isOpen)
    if (isOpen) {
      setIsEditing(false)
      setEditStart(startValue)
      setEditEnd(endValue)
    }
  }

  const hasDate = !!(startValue || endValue)
  const displayStart = formatDateBR(startValue)
  const displayEnd = formatDateBR(endValue)

  const handleConfirm = () => {
    onConfirm()
  }

  const handleSaveAndConfirm = () => {
    onConfirm({ start: editStart, end: editEnd })
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <div className="p-2 rounded-lg bg-amber-100">
              <CalendarDays className="h-5 w-5 text-amber-600" />
            </div>
            Confirmar Data de Viagem
          </DialogTitle>
        </DialogHeader>

        <div className="py-4 space-y-4">
          {cardName && (
            <p className="text-sm text-slate-500">
              Card: <span className="font-medium text-slate-700">{cardName}</span>
            </p>
          )}

          <p className="text-sm text-slate-600">
            Antes de mover para Pós-Venda, confirme se a <strong>Data Viagem c/ Welcome</strong> está correta:
          </p>

          {!isEditing ? (
            <>
              {hasDate ? (
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-1">
                    Data Viagem c/ Welcome
                  </p>
                  <p className="text-base font-semibold text-slate-900">
                    {displayStart}{displayEnd && displayEnd !== displayStart ? ` — ${displayEnd}` : ''}
                  </p>
                </div>
              ) : (
                <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-amber-800">Nenhuma data definida</p>
                    <p className="text-xs text-amber-600 mt-0.5">
                      Recomendamos definir a data antes de prosseguir.
                    </p>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-slate-500 mb-1 block">Início</label>
                <Input
                  type="date"
                  value={editStart}
                  onChange={(e) => setEditStart(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500 mb-1 block">Fim</label>
                <Input
                  type="date"
                  value={editEnd}
                  onChange={(e) => setEditEnd(e.target.value)}
                />
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          {!isEditing ? (
            <>
              <Button variant="outline" onClick={() => setIsEditing(true)}>
                Editar data
              </Button>
              <Button onClick={handleConfirm}>
                Está correto
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => setIsEditing(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSaveAndConfirm} disabled={!editStart}>
                Salvar e continuar
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
