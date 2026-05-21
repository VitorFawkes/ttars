import { lazy, Suspense, useState } from 'react'
import { Download, Loader2 } from 'lucide-react'
import { cn } from '../../../lib/utils'

// Lazy: o chunk com @react-pdf/renderer (~150KB gzip) só carrega quando
// o usuário clica em "Baixar PDF".
const PdfDownloader = lazy(() => import('./PdfDownloader'))

interface BaixarPdfButtonProps {
  cardId: string
  /** 'button' = botão completo com texto · 'icon' = só ícone, compacto */
  variant?: 'button' | 'icon'
  className?: string
  label?: string
}

export function BaixarPdfButton({ cardId, variant = 'button', className, label = 'Baixar PDF' }: BaixarPdfButtonProps) {
  const [busy, setBusy] = useState(false)

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (busy) return
    setBusy(true)
  }

  const handleDone = () => setBusy(false)

  if (variant === 'icon') {
    return (
      <>
        <button
          type="button"
          onClick={handleClick}
          disabled={busy}
          title={label}
          aria-label={label}
          className={cn(
            'h-7 w-7 inline-flex items-center justify-center rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50',
            className,
          )}
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
        </button>
        {busy && (
          <Suspense fallback={null}>
            <PdfDownloader cardId={cardId} onDone={handleDone} />
          </Suspense>
        )}
      </>
    )
  }

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={busy}
        className={cn(
          'inline-flex items-center gap-1.5 h-9 px-3 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 transition-colors disabled:opacity-60',
          className,
        )}
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
        {busy ? 'Gerando…' : label}
      </button>
      {busy && (
        <Suspense fallback={null}>
          <PdfDownloader cardId={cardId} onDone={handleDone} />
        </Suspense>
      )}
    </>
  )
}
