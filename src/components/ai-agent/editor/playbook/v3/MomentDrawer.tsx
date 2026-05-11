import { Zap, Target, Info } from 'lucide-react'
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
  /**
   * Quando admin clicou num slot específico da Sondagem, recebe a key do slot
   * pra mostrar banner contextual ("Você está editando a fase inteira; o slot
   * X que você clicou está abaixo").
   */
  focusSlotKey?: string | null
  focusSlotLabel?: string | null
}

/**
 * Drawer lateral que mostra o form completo de um momento (UI v3).
 *
 * IMPORTANTE: este componente NÃO duplica o form do MomentCard.
 * Ele REUSA o próprio MomentCard com `defaultExpanded={true}` e `hideToggle={true}`,
 * garantindo paridade ABSOLUTA de comportamento de salvamento.
 *
 * Layout: usa padding default do SheetContent (p-6). NÃO usa sticky no header
 * pra não conflitar com o X built-in do Sheet (que fica em right-4 top-4
 * e seria coberto por header sticky com bg opaco).
 */
export function MomentDrawer({
  agentId, agentName, companyName, moment, open, onOpenChange,
  focusSlotKey, focusSlotLabel,
}: Props) {
  if (!moment) return null

  const isFlow = moment.kind === 'flow'
  const Icon = isFlow ? Target : Zap
  const tone = isFlow ? 'text-indigo-600' : 'text-rose-500'

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-3xl lg:max-w-4xl bg-slate-50 gap-0"
      >
        {/* Header simples, não-sticky, com padding-right pra dar espaço ao X
            built-in do Sheet (que fica em right-4 top-4). */}
        <SheetHeader className="text-left pr-8">
          <div className="flex items-start gap-3">
            <span className={`mt-0.5 ${tone}`}>
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

        {/* Banner contextual quando o admin clicou num slot — explica que está
            editando a fase inteira e mostra qual slot foi clicado. */}
        {focusSlotKey && focusSlotLabel && (
          <div className="rounded-lg border border-indigo-100 bg-indigo-50/50 p-3 mt-4 flex gap-2.5">
            <Info className="w-4 h-4 text-indigo-600 mt-0.5 flex-shrink-0" />
            <div className="text-xs text-slate-700">
              <p className="font-medium">
                Você está editando a fase inteira (todos os {moment.discovery_config?.slots.length ?? 0} slots).
              </p>
              <p className="text-slate-600 mt-0.5">
                Você clicou em <strong>{focusSlotLabel}</strong> — role abaixo até a seção
                "Configuração de Sondagem" pra encontrar e editar este slot específico.
              </p>
            </div>
          </div>
        )}

        <div className="mt-5">
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
