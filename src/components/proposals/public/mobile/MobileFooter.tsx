/**
 * MobileFooter - Footer sticky com total e CTA
 */

import { cn } from '@/lib/utils'
import { formatPrice, type Currency } from '../shared/utils/priceUtils'
import { CommentButton } from '@/components/proposals/comments/CommentButton'

interface MobileFooterProps {
  total: number
  currency?: Currency
  travelers?: number
  onAccept: () => void
  isVisible?: boolean
  /** Token público pra abrir drawer de comentários (cliente) */
  proposalToken?: string | null
}

export function MobileFooter({
  total,
  currency = 'BRL',
  travelers = 1,
  onAccept,
  isVisible = true,
  proposalToken,
}: MobileFooterProps) {
  const pricePerPerson = travelers > 1 ? total / travelers : null

  return (
    <div
      className={cn(
        "fixed bottom-0 left-0 right-0 z-40",
        "bg-white/95 backdrop-blur-lg border-t border-slate-200",
        "transition-transform duration-300",
        "safe-area-bottom",
        isVisible ? "translate-y-0" : "translate-y-full"
      )}
    >
      <div className="px-4 py-3 flex items-center justify-between gap-3">
        {/* Total */}
        <div className="min-w-0" data-tour="footer-total">
          <p className="text-xs text-slate-500">Total da viagem</p>
          <div className="flex items-baseline gap-2">
            <p className="text-2xl font-bold text-slate-900">
              {formatPrice(total, currency)}
            </p>
            {pricePerPerson && (
              <p className="text-xs text-slate-500 truncate">
                {formatPrice(pricePerPerson, currency)}/pessoa
              </p>
            )}
          </div>
        </div>

        {/* Ações */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {proposalToken && (
            <CommentButton
              mode={{ kind: 'public', proposalToken }}
              scope={{ kind: 'proposal' }}
              size="md"
              variant="icon"
            />
          )}
          <button
            onClick={onAccept}
            disabled={total <= 0}
            data-tour="accept-btn"
            className={cn(
              'px-5 py-3.5 rounded-xl font-semibold text-sm transition-all min-h-[52px]',
              'bg-emerald-600 text-white hover:bg-emerald-700 active:bg-emerald-800',
              'disabled:bg-slate-300 disabled:cursor-not-allowed',
              'shadow-lg shadow-emerald-600/20',
            )}
            style={{ touchAction: 'manipulation' }}
          >
            {total > 0 ? 'Aceitar Proposta' : 'Selecione itens'}
          </button>
        </div>
      </div>

      {/* Safe area spacer para iOS */}
      <div className="h-safe-area-inset-bottom bg-white" />
    </div>
  )
}
