import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/Badge'
import { DollarSign, Workflow, Zap, Users, Calendar, Plus, Trash2, Sparkles, Send } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SpecialScenariosEditor } from '@/components/ai-agent/editor/SpecialScenariosEditor'
import type { SpecialScenarioInput } from '@/hooks/useAgentSpecialScenarios'
import type { WizardStep5, SpecialScenario, useAgentWizard } from '@/hooks/useAgentWizard'

type WizardProps = { wizard: ReturnType<typeof useAgentWizard> }

const PRICING_MODELS = [
  { value: 'flat', label: 'Taxa fixa', description: 'Valor fixo cobrado ao cliente (ex: R$ 500)' },
  { value: 'percentage', label: 'Percentual', description: 'Porcentagem sobre o valor da venda' },
  { value: 'free', label: 'Gratuito', description: 'Não cobra taxa de planejamento' },
] as const

const FEE_TIMING_OPTIONS = [
  { value: 'immediately', label: 'Imediatamente', description: 'Já nas primeiras mensagens' },
  { value: 'after_discovery', label: 'Após descoberta', description: 'Depois de entender a necessidade' },
  { value: 'after_qualification', label: 'Após qualificação', description: 'Depois de qualificar o lead' },
  { value: 'at_commitment', label: 'No fechamento', description: 'Só quando cliente confirmar interesse' },
  { value: 'never', label: 'Nunca', description: 'Agente nunca menciona taxa' },
]

const CALENDAR_SYSTEMS = [
  { value: 'none', label: 'Não agendar', description: 'Agente não agenda reuniões' },
  { value: 'supabase_rpc', label: 'Calendário interno', description: 'Usa a agenda do CRM' },
  { value: 'calendly', label: 'Calendly', description: 'Envia link do Calendly' },
  { value: 'google', label: 'Google Calendar', description: 'Integração via Google' },
] as const

const SECONDARY_CONTACT_FIELDS = [
  { value: 'passaporte', label: 'Passaporte' },
  { value: 'cpf', label: 'CPF' },
  { value: 'data_nascimento', label: 'Data de nascimento' },
  { value: 'preferencias', label: 'Preferências alimentares / restrições' },
]

export default function Step5_BusinessRules({ wizard }: WizardProps) {
  const step5 = (wizard.wizardData.step5 || {}) as Partial<WizardStep5>

  const updateStep5 = (patch: Partial<WizardStep5>) => {
    wizard.updateStep('step5', patch)
  }

  const updatePricingAmount = (value: string) => {
    const amount = value ? parseFloat(value) : undefined
    updateStep5({ pricing_json: { ...step5.pricing_json, amount } })
  }

  const updatePricingCurrency = (value: string) => {
    updateStep5({ pricing_json: { ...step5.pricing_json, currency: value } })
  }

  const addProcessStep = () => {
    updateStep5({ process_steps: [...(step5.process_steps || []), ''] })
  }

  const updateProcessStep = (idx: number, value: string) => {
    const next = [...(step5.process_steps || [])]
    next[idx] = value
    updateStep5({ process_steps: next })
  }

  const removeProcessStep = (idx: number) => {
    updateStep5({ process_steps: (step5.process_steps || []).filter((_, i) => i !== idx) })
  }

  const toggleSecondaryField = (field: string) => {
    const current = step5.secondary_contact_fields || []
    const next = current.includes(field) ? current.filter((f) => f !== field) : [...current, field]
    updateStep5({ secondary_contact_fields: next })
  }

  const scenarios = step5.special_scenarios || []

  // Adapter: wizard.SpecialScenario (simples) ⇆ SpecialScenarioInput (completo)
  const scenariosAsEditorInput: SpecialScenarioInput[] = scenarios.map((s, i) => ({
    scenario_name: s.scenario_name,
    trigger_type: (s.trigger_type || 'keyword') as SpecialScenarioInput['trigger_type'],
    trigger_config: s.trigger_config ?? {},
    response_adjustment: s.response_adjustment || null,
    simplified_qualification: null,
    skip_fee_presentation: s.skip_fee_presentation,
    skip_meeting_scheduling: s.skip_meeting_scheduling,
    auto_assign_tag: s.auto_assign_tag || null,
    handoff_message: s.handoff_message || null,
    target_agent_id: null,
    enabled: true,
    priority: (scenarios.length - i) * 10,
  }))

  const updateScenarios = (next: SpecialScenarioInput[]) => {
    const adapted: SpecialScenario[] = next.map((s) => ({
      scenario_name: s.scenario_name,
      trigger_type: s.trigger_type,
      trigger_config: s.trigger_config,
      response_adjustment: s.response_adjustment ?? '',
      skip_fee_presentation: s.skip_fee_presentation,
      skip_meeting_scheduling: s.skip_meeting_scheduling,
      auto_assign_tag: s.auto_assign_tag ?? '',
      handoff_message: s.handoff_message ?? '',
    }))
    updateStep5({ special_scenarios: adapted })
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900 tracking-tight">Regras de negócio</h2>
        <p className="text-slate-500 mt-1 text-sm">
          Configure como o agente cobra, atende e lida com casos especiais.
        </p>
      </div>

      {wizard.wizardData.step1?.interaction_mode !== 'inbound' && (
        <div className="flex items-start gap-3 p-4 bg-indigo-50 border border-indigo-200 rounded-xl">
          <Send className="w-4 h-4 text-indigo-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-indigo-900">Modo outbound ativo</p>
            <p className="text-xs text-indigo-700 mt-0.5">
              Quando o agente inicia a conversa, os campos de formulario configurados abaixo sao usados como contexto para personalizar a abordagem. Certifique-se de que os campos de dados de formulario estao corretos.
            </p>
          </div>
        </div>
      )}

      {/* Card 1: Pricing (opcional — muitos agentes não abordam preço) */}
      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-green-100 rounded-lg flex items-center justify-center">
              <DollarSign className="w-4 h-4 text-green-600" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-900">Preço e cobrança <span className="text-xs font-normal text-slate-400">— opcional</span></h3>
              <p className="text-xs text-slate-500">Ative apenas se o agente precisa abordar valores com o cliente.</p>
            </div>
          </div>
          <Switch
            checked={!!step5.pricing_model}
            onCheckedChange={(on) => {
              if (on) {
                updateStep5({ pricing_model: 'flat', fee_presentation_timing: 'after_qualification', pricing_json: {} })
              } else {
                updateStep5({ pricing_model: '', fee_presentation_timing: 'never', pricing_json: {} })
              }
            }}
          />
        </div>

        {step5.pricing_model && (
        <div className="space-y-4">
          <div>
            <Label className="text-xs mb-2 block">Modelo de cobrança</Label>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              {PRICING_MODELS.map((opt) => {
                const active = step5.pricing_model === opt.value
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => updateStep5({ pricing_model: opt.value })}
                    className={cn(
                      'text-left p-3 rounded-lg border-2 transition-all',
                      active ? 'border-indigo-500 bg-indigo-50/30' : 'border-slate-200 bg-white hover:border-slate-300'
                    )}
                  >
                    <p className="font-medium text-sm text-slate-900">{opt.label}</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">{opt.description}</p>
                  </button>
                )
              })}
            </div>
          </div>

          {step5.pricing_model === 'flat' && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Valor da taxa</Label>
                <Input
                  type="number"
                  placeholder="500.00"
                  value={(step5.pricing_json?.amount as number) || ''}
                  onChange={(e) => updatePricingAmount(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Moeda</Label>
                <select
                  value={(step5.pricing_json?.currency as string) || 'BRL'}
                  onChange={(e) => updatePricingCurrency(e.target.value)}
                  className="w-full h-10 rounded-md border border-slate-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="BRL">BRL (R$)</option>
                  <option value="USD">USD ($)</option>
                  <option value="EUR">EUR (€)</option>
                </select>
              </div>
            </div>
          )}

          {step5.pricing_model !== 'free' && (
            <div>
              <Label className="text-xs mb-2 block">Quando apresentar</Label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {FEE_TIMING_OPTIONS.map((opt) => {
                  const active = step5.fee_presentation_timing === opt.value
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => updateStep5({ fee_presentation_timing: opt.value })}
                      className={cn(
                        'text-left px-3 py-2 rounded-lg border-2 transition-all',
                        active ? 'border-indigo-500 bg-indigo-50/30' : 'border-slate-200 bg-white hover:border-slate-300'
                      )}
                    >
                      <p className="font-medium text-sm text-slate-900">{opt.label}</p>
                      <p className="text-[11px] text-slate-500">{opt.description}</p>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>
        )}
      </div>

      {/* Card 2: Process steps */}
      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 bg-blue-100 rounded-lg flex items-center justify-center">
            <Workflow className="w-4 h-4 text-blue-600" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-slate-900">Processo de atendimento</h3>
            <p className="text-xs text-slate-500">Etapas que o agente apresenta ao cliente</p>
          </div>
          <Button onClick={addProcessStep} size="sm" variant="outline" className="gap-1.5">
            <Plus className="w-3.5 h-3.5" /> Etapa
          </Button>
        </div>

        <div className="space-y-2">
          {(step5.process_steps || []).length === 0 && (
            <p className="text-xs text-slate-400 italic">Nenhuma etapa. Adicione passos como "Entender necessidade", "Montar roteiro", etc.</p>
          )}
          {(step5.process_steps || []).map((step, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-semibold flex-shrink-0">
                {idx + 1}
              </span>
              <Input
                placeholder={`Etapa ${idx + 1}: ex: Entender a necessidade`}
                value={step}
                onChange={(e) => updateProcessStep(idx, e.target.value)}
              />
              <button
                onClick={() => removeProcessStep(idx)}
                className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>

        <div className="mt-4 space-y-1.5">
          <Label className="text-xs flex items-center gap-1.5">
            <Sparkles className="w-3 h-3 text-slate-400" />
            Metodologia (opcional)
          </Label>
          <Textarea
            placeholder="Ex: Trabalhamos com consultoria personalizada. Uma consultora exclusiva monta o roteiro, faz cotações e apresenta uma proposta completa."
            value={step5.methodology_text || ''}
            onChange={(e) => updateStep5({ methodology_text: e.target.value })}
            className="min-h-[80px]"
          />
        </div>
      </div>

      {/* Card 3: Special scenarios */}
      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 bg-amber-100 rounded-lg flex items-center justify-center">
            <Zap className="w-4 h-4 text-amber-600" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-slate-900">Cenários especiais</h3>
            <p className="text-xs text-slate-500">Comportamento diferente em situações específicas (ex: Club Med, VIP)</p>
          </div>
          {scenarios.length > 0 && (
            <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200">
              {scenarios.length}
            </Badge>
          )}
        </div>

        <SpecialScenariosEditor value={scenariosAsEditorInput} onChange={updateScenarios} />
      </div>

      {/* Card 4: Secondary contacts */}
      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-9 h-9 bg-purple-100 rounded-lg flex items-center justify-center flex-shrink-0">
            <Users className="w-4 h-4 text-purple-600" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-slate-900">Contatos secundários</h3>
            <p className="text-xs text-slate-500">Agente atende viajantes/acompanhantes separadamente?</p>
          </div>
          <Switch
            checked={step5.has_secondary_contacts || false}
            onCheckedChange={(v) => updateStep5({ has_secondary_contacts: v })}
          />
        </div>

        {step5.has_secondary_contacts && (
          <div className="space-y-2 pt-3 border-t border-slate-100">
            <Label className="text-xs">Dados que o agente pode coletar de acompanhantes</Label>
            <div className="grid grid-cols-2 gap-2">
              {SECONDARY_CONTACT_FIELDS.map((field) => {
                const active = (step5.secondary_contact_fields || []).includes(field.value)
                return (
                  <button
                    key={field.value}
                    type="button"
                    onClick={() => toggleSecondaryField(field.value)}
                    className={cn(
                      'flex items-center gap-2 p-2.5 rounded-lg border-2 transition-all text-left',
                      active ? 'border-indigo-500 bg-indigo-50/30' : 'border-slate-200 bg-white hover:border-slate-300'
                    )}
                  >
                    <div className={cn(
                      'w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center',
                      active ? 'border-indigo-500 bg-indigo-500' : 'border-slate-300'
                    )}>
                      {active && <div className="w-2 h-2 bg-white rounded-sm" />}
                    </div>
                    <span className="text-sm text-slate-900">{field.label}</span>
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* Card 5: Calendar */}
      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 bg-pink-100 rounded-lg flex items-center justify-center">
            <Calendar className="w-4 h-4 text-pink-600" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-900">Agendamento</h3>
            <p className="text-xs text-slate-500">Como o agente agenda reuniões com clientes qualificados</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {CALENDAR_SYSTEMS.map((opt) => {
            const active = step5.calendar_system === opt.value
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => updateStep5({ calendar_system: opt.value })}
                className={cn(
                  'text-left p-3 rounded-lg border-2 transition-all',
                  active ? 'border-indigo-500 bg-indigo-50/30' : 'border-slate-200 bg-white hover:border-slate-300'
                )}
              >
                <p className="font-medium text-sm text-slate-900">{opt.label}</p>
                <p className="text-[11px] text-slate-500 mt-0.5">{opt.description}</p>
              </button>
            )
          })}
        </div>
      </div>

      <div className="flex justify-between">
        <Button onClick={() => wizard.goBack()} variant="outline">
          ← Voltar
        </Button>
        <Button onClick={() => wizard.goNext()}>Próximo passo →</Button>
      </div>
    </div>
  )
}
