import { CheckCircle2 } from 'lucide-react'

interface StickyFooterProps {
  totalEstimado: number
  totalAprovado: number
  onConfirm: () => void
  isConfirming?: boolean
  canConfirm?: boolean
}

export function StickyFooter({
  totalEstimado,
  totalAprovado,
  onConfirm,
  isConfirming,
  canConfirm = true,
}: StickyFooterProps) {
  const total = totalAprovado > 0 ? totalAprovado : totalEstimado
  const fmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

  return (
    <div className="fixed bottom-0 inset-x-0 z-30 bg-white/90 backdrop-blur-md border-t border-slate-200 safe-area-bottom">
      <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
        <div className="flex-1">
          <p className="text-xs text-slate-500">
            {totalAprovado > 0 ? 'Total aprovado' : 'Total estimado'}
          </p>
          <p className="text-lg font-semibold text-slate-900 tracking-tight">
            {fmt.format(total)}
          </p>
        </div>
        {canConfirm && (
          <button
            type="button"
            onClick={onConfirm}
            disabled={isConfirming}
            className="flex items-center gap-2 rounded-full bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            <CheckCircle2 className="h-4 w-4" />
            Confirmar viagem
          </button>
        )}
      </div>
    </div>
  )
}
