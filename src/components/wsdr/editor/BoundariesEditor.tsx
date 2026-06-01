import { AlertTriangle, ShieldCheck } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { Field } from '@/components/wsdr/editor/ui/primitives'
import { type SofiaConfigV2, type EscalationConfig, CURATED_BOUNDARIES } from '@/components/wsdr/sofiaConfig'

type Boundaries = SofiaConfigV2['boundaries']

// Controle total: TODAS as linhas vermelhas são editáveis. As que protegem qualidade
// mostram um aviso ao desligar (mas o dono manda). Inclui escalação por nº de turnos.
export function BoundariesEditor({ boundaries, onChange }: { boundaries: Boundaries; onChange: (b: Boundaries) => void }) {
  const curadas = boundaries.curadas || {}
  const escalation: EscalationConfig = boundaries.escalation ?? { enabled: false, max_turns: 12, message: '' }
  const toggle = (key: string, v: boolean) => onChange({ ...boundaries, curadas: { ...curadas, [key]: v } })
  const setEsc = (patch: Partial<EscalationConfig>) => onChange({ ...boundaries, escalation: { ...escalation, ...patch } })

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {CURATED_BOUNDARIES.map(b => {
          const on = curadas[b.key] ?? b.defaultOn
          const warn = b.protectsQuality && !on
          return (
            <div
              key={b.key}
              className={cn(
                'flex items-start justify-between gap-3 p-3 rounded-lg border transition-colors',
                warn ? 'bg-amber-50/70 border-amber-300' : on ? 'bg-rose-50/50 border-rose-200' : 'bg-white border-slate-200'
              )}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="text-sm font-medium text-slate-900">{b.label}</p>
                  {b.protectsQuality && (
                    <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-emerald-700" title="Protege a qualidade da conversa">
                      <ShieldCheck className="w-3 h-3" />qualidade
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-0.5">{b.hint}</p>
                {warn && (
                  <p className="text-[11px] text-amber-700 mt-1 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3 shrink-0" />
                    Desligado: a Sofia pode fazer isso. Isso costuma reduzir a qualidade, mas a escolha é sua.
                  </p>
                )}
              </div>
              <Switch checked={on} onCheckedChange={v => toggle(b.key, v)} className={on ? 'bg-rose-600' : ''} />
            </div>
          )
        })}
      </div>

      {/* Escalação por nº de turnos */}
      <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-3">
        <label className="flex items-center justify-between">
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-900">Chamar uma pessoa se a conversa travar</p>
            <p className="text-xs text-slate-500 mt-0.5">Depois de muitas mensagens sem avançar, a Sofia passa pra um humano.</p>
          </div>
          <Switch checked={escalation.enabled} onCheckedChange={v => setEsc({ enabled: v })} className={escalation.enabled ? 'bg-indigo-600' : ''} />
        </label>
        {escalation.enabled && (
          <div className="grid sm:grid-cols-2 gap-3 pt-1">
            <Field label="Máximo de mensagens antes de escalar">
              <Input type="number" value={escalation.max_turns} onChange={e => setEsc({ max_turns: Number(e.target.value) })} />
            </Field>
            <Field label="Mensagem ao escalar">
              <Textarea value={escalation.message} onChange={e => setEsc({ message: e.target.value })} className="min-h-[44px]" placeholder="Ex: Vou chamar a nossa Wedding Planner pra conversar com vocês." />
            </Field>
          </div>
        )}
      </div>
    </div>
  )
}
