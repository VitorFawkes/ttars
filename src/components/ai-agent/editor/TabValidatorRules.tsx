import { ShieldAlert, Plus, Trash2, Download } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Button } from '@/components/ui/Button'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import type { AgentEditorForm, ValidatorRule } from './types'
import { JULIA_VALIDATOR_RULES } from '@/lib/julia-defaults'
import { cn } from '@/lib/utils'

interface Props {
  form: AgentEditorForm
  setForm: (updater: (f: AgentEditorForm) => AgentEditorForm) => void
}

const ACTION_OPTIONS = [
  { value: 'block', label: 'Bloquear envio' },
  { value: 'correct', label: 'Corrigir e reenviar' },
  { value: 'ignore', label: 'Ignorar (só avisar)' },
]

function newRule(): ValidatorRule {
  return {
    id: `rule_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    condition: '',
    action: 'block',
    enabled: true,
  }
}

export function TabValidatorRules({ form, setForm }: Props) {
  const rules = form.validator_rules

  const update = (idx: number, patch: Partial<ValidatorRule>) => {
    setForm(f => ({
      ...f,
      validator_rules: f.validator_rules.map((r, i) => (i === idx ? { ...r, ...patch } : r)),
    }))
  }

  const remove = (idx: number) => {
    setForm(f => ({ ...f, validator_rules: f.validator_rules.filter((_, i) => i !== idx) }))
  }

  const add = () => {
    setForm(f => ({ ...f, validator_rules: [...f.validator_rules, newRule()] }))
  }

  const loadJuliaDefaults = () => {
    // Confirmação destrutiva — substitui TUDO. Sem isso, admin que customizou
    // regras (ex: Estela tem 'echo_pergunta_social' e 'usar_nome_revelado'
    // específicas) perde silenciosamente.
    const customCount = rules.length
    if (customCount > 0) {
      const confirmed = confirm(
        `Isso vai SUBSTITUIR todas as ${customCount} regras atuais pelas 8 da Julia. Suas customizações serão perdidas. Confirma?`,
      )
      if (!confirmed) return
    }
    setForm(f => ({ ...f, validator_rules: JULIA_VALIDATOR_RULES.map(r => ({ ...r })) }))
    toast.success('Regras da Julia carregadas')
  }

  const enabledCount = rules.filter(r => r.enabled).length

  return (
    <div className="space-y-6">
      <section className="bg-white border border-slate-200 shadow-sm rounded-xl p-6 space-y-4">
        <header className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-red-500" />
            <div>
              <h2 className="text-lg font-semibold text-slate-900 tracking-tight">Regras do validador</h2>
              <p className="text-sm text-slate-500 mt-0.5">
                {enabledCount > 0
                  ? `${enabledCount} de ${rules.length} regras ativas. Cada regra vira uma checagem antes da mensagem sair.`
                  : 'Nenhuma regra cadastrada ainda.'}
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={loadJuliaDefaults} className="gap-2 flex-shrink-0">
            <Download className="w-4 h-4" /> Usar padrão Julia
          </Button>
        </header>

        <div className="rounded-lg bg-amber-50 border border-amber-200 p-3">
          <p className="text-xs text-amber-900">
            <strong>Ações:</strong> <em>Bloquear</em> descarta a mensagem e gera nova. <em>Corrigir</em> ajusta o texto e envia. <em>Ignorar</em> só registra no log. Para Julia: tudo que vaza sistema/IA é <em>Bloquear</em>; problemas de tom são <em>Corrigir</em>.
          </p>
        </div>

        <div className="space-y-3">
          {rules.length === 0 && (
            <div className="text-center py-8 border border-dashed border-slate-300 rounded-lg">
              <p className="text-sm text-slate-500">Nenhuma regra cadastrada.</p>
              <Button variant="outline" size="sm" onClick={loadJuliaDefaults} className="mt-3 gap-2">
                <Download className="w-4 h-4" /> Carregar padrão Julia (8 regras)
              </Button>
            </div>
          )}

          {rules.map((rule, idx) => {
            // Regra ativa sem condição preenchida vai pro prompt como
            // "→ BLOQUEAR" sem critério — LLM não sabe quando aplicar.
            // Marcamos vermelho pra admin não esquecer.
            const conditionEmpty = rule.enabled && !rule.condition.trim()
            return (
            <div
              key={rule.id}
              className={cn(
                'border rounded-lg p-4 space-y-3 transition-colors',
                conditionEmpty
                  ? 'border-red-400 bg-red-50 ring-2 ring-red-100'
                  : rule.enabled ? 'border-red-200 bg-red-50/40' : 'border-slate-200 bg-slate-50/40 opacity-70'
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <Switch checked={rule.enabled} onCheckedChange={v => update(idx, { enabled: v })} />
                  <Input
                    value={rule.id}
                    onChange={e => update(idx, { id: e.target.value })}
                    className="text-xs font-mono h-8 max-w-xs"
                    placeholder="rule_id_unico"
                  />
                </div>
                <Button variant="ghost" size="sm" onClick={() => remove(idx)} className="text-red-500 hover:bg-red-100 h-8 w-8 p-0">
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-slate-600">
                  Condição que dispara a regra
                  {rule.enabled && <span className="text-red-600 ml-1">*</span>}
                </Label>
                <Input
                  value={rule.condition}
                  onChange={e => update(idx, { condition: e.target.value })}
                  placeholder='Ex: "Menciona IA, modelo ou prompt"'
                  className={cn(conditionEmpty && 'border-red-400 ring-1 ring-red-200')}
                />
                {conditionEmpty && (
                  <p className="text-[11px] text-red-600">
                    Regra ativa sem condição. A IA não saberá quando aplicar — preencha ou desligue.
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-slate-600">Ação</Label>
                <Select
                  value={rule.action}
                  onChange={(v: string) => update(idx, { action: v as ValidatorRule['action'] })}
                  options={ACTION_OPTIONS}
                />
              </div>
            </div>
            )
          })}
        </div>

        <Button variant="outline" onClick={add} className="gap-2 w-full">
          <Plus className="w-4 h-4" /> Adicionar regra
        </Button>
      </section>
    </div>
  )
}
