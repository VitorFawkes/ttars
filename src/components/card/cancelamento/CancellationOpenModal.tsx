import { useEffect, useMemo, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/Button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  useMotivosCancelamento,
  useAbrirCancelamento,
  type ModoCancelamento,
  escopoFromModo,
} from '@/hooks/cancelamento/useCancelamento'

interface CancellationOpenModalProps {
  isOpen: boolean
  onClose: () => void
  viagemId: string
  orgId: string
  onOpened?: () => void
}

const MODOS: Array<{ id: ModoCancelamento; titulo: string; descricao: string }> = [
  {
    id: 'total',
    titulo: 'Total',
    descricao: 'A viagem inteira foi cancelada — não vai mais acontecer.',
  },
  {
    id: 'parcial',
    titulo: 'Parcial',
    descricao: 'Itens específicos serão cancelados, mas a viagem segue.',
  },
  {
    id: 'mudanca_brusca',
    titulo: 'Mudança brusca',
    descricao: 'Muda destino/datas/escopo, mas o cliente vai viajar.',
  },
]

export default function CancellationOpenModal({
  isOpen,
  onClose,
  viagemId,
  orgId,
  onOpened,
}: CancellationOpenModalProps) {
  const [modo, setModo] = useState<ModoCancelamento>('parcial')
  const [motivoId, setMotivoId] = useState('')
  const [obs, setObs] = useState('')
  const [error, setError] = useState<string | null>(null)

  const escopoAtual = useMemo(() => escopoFromModo(modo), [modo])
  const { data: motivos, isLoading: loadingMotivos } = useMotivosCancelamento(
    orgId,
    isOpen ? escopoAtual : null,
  )
  const abrir = useAbrirCancelamento()

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (isOpen) {
      setModo('parcial')
      setMotivoId('')
      setObs('')
      setError(null)
    }
  }, [isOpen])

  // Quando muda modo, motivo selecionado pode não ser compatível — limpa
  useEffect(() => {
    setMotivoId('')
  }, [modo])
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleConfirm = () => {
    setError(null)
    if (!motivoId) {
      setError('Selecione um motivo.')
      return
    }
    abrir.mutate(
      { viagemId, modo, motivoId, obs: obs.trim() || null },
      {
        onSuccess: () => {
          onOpened?.()
          onClose()
        },
        onError: (err) => {
          setError(err instanceof Error ? err.message : 'Erro ao abrir cancelamento')
        },
      },
    )
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-amber-600">
            <AlertTriangle className="w-5 h-5" />
            Abrir cancelamento
          </DialogTitle>
          <DialogDescription>
            Esta viagem já foi aceita pelo cliente. Abrir cancelamento sinaliza pra todo
            mundo (TP, Pós-Venda, cliente) que algo precisa ser ajustado.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-4">
          {error && (
            <div className="bg-red-50 text-red-700 text-sm p-3 rounded-md border border-red-200 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          {/* Tipo */}
          <div className="space-y-2">
            <Label>Tipo de cancelamento</Label>
            <div className="grid grid-cols-1 gap-2">
              {MODOS.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setModo(m.id)}
                  className={cn(
                    'text-left p-3 rounded-lg border-2 transition-colors',
                    modo === m.id
                      ? 'border-amber-500 bg-amber-50'
                      : 'border-slate-200 hover:border-slate-300 bg-white',
                  )}
                >
                  <div className="font-medium text-slate-900">{m.titulo}</div>
                  <div className="text-sm text-slate-600 mt-0.5">{m.descricao}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Motivo */}
          <div className="space-y-2">
            <Label className="flex items-center gap-1">
              Motivo <span className="text-red-500">*</span>
            </Label>
            {loadingMotivos ? (
              <div className="h-10 w-full bg-slate-100 animate-pulse rounded-md" />
            ) : (
              <select
                value={motivoId}
                onChange={(e) => setMotivoId(e.target.value)}
                className={cn(
                  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-primary',
                  error && !motivoId && 'border-red-300',
                )}
              >
                <option value="">Selecione um motivo…</option>
                {motivos?.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nome}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Observação */}
          <div className="space-y-2">
            <Label>Observação (opcional)</Label>
            <Textarea
              value={obs}
              onChange={(e) => setObs(e.target.value)}
              placeholder="Detalhes do que aconteceu, contexto pro time…"
              className="min-h-[80px]"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={abrir.isPending}>
            Cancelar
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={abrir.isPending}
            className="bg-amber-600 hover:bg-amber-700 text-white"
          >
            {abrir.isPending ? 'Abrindo…' : 'Abrir cancelamento'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
