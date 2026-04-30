import { Zap, Target } from 'lucide-react'
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
      {/* SheetContent já tem overflow-y-auto + p-6 + max-h-screen por padrão.
          Removemos o p-0 e o wrapper interno com overflow pra evitar scroll duplo. */}
      <SheetContent
        side="right"
        className="w-full sm:max-w-3xl lg:max-w-4xl bg-slate-50 gap-0"
      >
        <SheetHeader className="-mx-6 -mt-6 px-6 py-4 mb-6 border-b border-slate-200 bg-white shadow-sm sticky top-0 z-10">
          <div className="flex items-start gap-3 pr-8">
            <span className={`mt-1 ${tone}`}>
              <Icon className="w-5 h-5" />
            </span>
            <div className="flex-1 min-w-0">
              <SheetTitle className="text-lg font-semibold text-slate-900 tracking-tight text-left">
                {moment.moment_label || moment.moment_key}
              </SheetTitle>
              <SheetDescription className="text-xs text-slate-500 mt-0.5 text-left">
                {isFlow ? 'Fase do funil' : 'Jogada situacional'} · key {moment.moment_key}
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <MomentCard
          agentId={agentId}
          agentName={agentName}
          companyName={companyName}
          moment={moment}
          defaultExpanded={true}
          hideToggle={true}
        />
      </SheetContent>
    </Sheet>
  )
}
