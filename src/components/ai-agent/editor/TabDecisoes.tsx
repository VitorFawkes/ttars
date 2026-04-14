import { Lightbulb } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { INTELLIGENT_DECISIONS_CATALOG, type AgentEditorForm } from './types'
import { cn } from '@/lib/utils'

interface Props {
  form: AgentEditorForm
  setForm: (updater: (f: AgentEditorForm) => AgentEditorForm) => void
}

export function TabDecisoes({ form, setForm }: Props) {
  const toggle = (key: string) => {
    setForm(f => {
      const current = f.intelligent_decisions[key] ?? { enabled: false, config: {} }
      return {
        ...f,
        intelligent_decisions: {
          ...f.intelligent_decisions,
          [key]: { ...current, enabled: !current.enabled },
        },
      }
    })
  }

  const updateInstructions = (key: string, instructions: string) => {
    setForm(f => {
      const current = f.intelligent_decisions[key] ?? { enabled: true, config: {} }
      return {
        ...f,
        intelligent_decisions: {
          ...f.intelligent_decisions,
          [key]: {
            ...current,
            config: { ...current.config, instructions },
          },
        },
      }
    })
  }

  return (
    <section className="bg-white border border-slate-200 shadow-sm rounded-xl p-6 space-y-4">
      <header className="flex items-center gap-2">
        <Lightbulb className="w-5 h-5 text-yellow-500" />
        <h2 className="text-lg font-semibold text-slate-900 tracking-tight">Decisões inteligentes</h2>
      </header>
      <p className="text-sm text-slate-500 -mt-2">
        Decisões que o agente toma com julgamento. Cada uma ativada vira instrução no prompt. Se tiver regra específica (ex: só criar reunião após e-mail confirmado), escreva no campo de instruções — é injetado literalmente.
      </p>

      <div className="space-y-2">
        {INTELLIGENT_DECISIONS_CATALOG.map(cat => {
          const decision = form.intelligent_decisions[cat.key] ?? { enabled: false, config: {} }
          const instructions = (decision.config.instructions as string) || ''
          return (
            <div
              key={cat.key}
              className={cn(
                'border rounded-lg p-3 space-y-2 transition-colors',
                decision.enabled ? 'border-yellow-200 bg-yellow-50/40' : 'border-slate-200'
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900">{cat.label}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{cat.description}</p>
                </div>
                <Switch checked={decision.enabled} onCheckedChange={() => toggle(cat.key)} />
              </div>
              {decision.enabled && (
                <div className="space-y-1 pt-1">
                  <Label className="text-xs text-slate-600">Instruções específicas (opcional)</Label>
                  <Textarea
                    value={instructions}
                    onChange={e => updateInstructions(cat.key, e.target.value)}
                    rows={2}
                    className="text-xs"
                    placeholder="Ex: Só criar reunião depois que o cliente confirmar email. Nunca agendar antes das 9h ou depois das 18h."
                  />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}
