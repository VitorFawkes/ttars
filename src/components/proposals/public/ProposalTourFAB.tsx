import { HelpCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ProposalTourFABProps {
  device: 'desktop' | 'mobile'
  onClick: () => void
}

export function ProposalTourFAB({ device, onClick }: ProposalTourFABProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Ver guia da proposta"
      className={cn(
        'fixed right-4 z-50 flex items-center gap-2 rounded-full bg-emerald-600 px-4 py-3 text-sm font-medium text-white shadow-lg shadow-emerald-600/30 transition-all hover:bg-emerald-700 active:scale-95',
        // Mobile: footer sticky ocupa ~80-110px (com safe-area iOS). bottom-28 (112px) garante folga.
        device === 'mobile' ? 'bottom-28' : 'bottom-6',
      )}
    >
      <HelpCircle className="h-5 w-5" />
      <span className="hidden sm:inline">Ver guia</span>
    </button>
  )
}
