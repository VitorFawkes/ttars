import { X, Zap, Target } from 'lucide-react'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { MomentCard } from '../moments/MomentCard'
import type { PlaybookMoment } from '@/hooks/playbook/useAgentMoments'

interface Props {
  agentId: string
  agentName: string
  companyName: string
  moment: PlaybookMoment | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * Drawer lateral que mostra o form completo de um momento (UI v3).
 *
 * IMPORTANTE: este componente NÃO duplica o form do MomentCard.
 * Ele REUSA o próprio MomentCard com `defaultExpanded={true}` e `hideToggle={true}`,
 * garantindo paridade ABSOLUTA de comportamento de salvamento.
 *
 * Mesmo hook (useAgentMoments), mesma mutation, mesmo payload. A única diferença
 * é o ENVELOPE visual — em vez de inline-expandable, o form vive num drawer.
 */
export function MomentDrawer({ agentId, agentName, companyName, moment, open, onOpenChange }: Props) {
  if (!moment) return null

  const isFlow = moment.kind === 'flow'
  const Icon = isFlow ? Target : Zap
  const tone = isFlow ? 'text-indigo-600' : 'text-rose-500'

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-3xl lg:max-w-4xl p-0 flex flex-col h-full bg-slate-50"
      >
        <SheetHeader className="px-6 py-4 border-b border-slate-200 bg-white shadow-sm">
          <div className="flex items-start gap-3">
            <span className={`mt-1 ${tone}`}>
              <Icon className="w-5 h-5" />
            </span>
            <div className="flex-1 min-w-0">
              <SheetTitle className="text-lg font-semibold text-slate-900 tracking-tight">
                {moment.moment_label || moment.moment_key}
              </SheetTitle>
              <SheetDescription className="text-xs text-slate-500 mt-0.5">
                {isFlow ? 'Fase do funil' : 'Jogada situacional'} · key {moment.moment_key}
              </SheetDescription>
            </div>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-100 -mr-1"
              aria-label="Fechar"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-6">
          <MomentCard
            agentId={agentId}
            agentName={agentName}
            companyName={companyName}
            moment={moment}
            defaultExpanded={true}
            hideToggle={true}
          />
        </div>
      </SheetContent>
    </Sheet>
  )
}
