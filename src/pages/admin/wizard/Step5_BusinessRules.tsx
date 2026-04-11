import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Trash2, Plus } from 'lucide-react'
import type { WizardStep5 } from '@/hooks/useAgentWizard'
import type { useAgentWizard } from '@/hooks/useAgentWizard'

type WizardProps = { wizard: ReturnType<typeof useAgentWizard> }

const PRICING_MODELS = ['flat', 'percentage', 'free'] as const
const FEE_TIMING_OPTIONS = [
  { value: 'immediately', label: 'Imediatamente' },
  { value: 'after_discovery', label: 'Após descoberta' },
  { value: 'after_qualification', label: 'Após qualificação' },
  { value: 'at_commitment', label: 'No compromisso' },
  { value: 'never', label: 'Nunca' },
]
const CALENDAR_SYSTEMS = ['none', 'supabase_rpc', 'calendly', 'google'] as const
const SECONDARY_CONTACT_FIELDS = [
  { value: 'passaporte', label: 'Passaporte' },
  { value: 'cpf', label: 'CPF' },
  { value: 'data_nascimento', label: 'Data de nascimento' },
  { value: 'preferencias', label: 'Preferências' },
]

export default function Step5_BusinessRules({ wizard }: WizardProps) {
  const step5 = (wizard.wizardData.step5 || {}) as Partial<WizardStep5>

  const [formData, setFormData] = useState<Partial<WizardStep5>>({
    pricing_model: step5.pricing_model || 'flat',
    pricing_json: step5.pricing_json || {},
    fee_presentation_timing: step5.fee_presentation_timing || 'after_qualification',
    process_steps: step5.process_steps || [],
    methodology_text: step5.methodology_text || '',
    has_secondary_contacts: step5.has_secondary_contacts || false,
    secondary_contact_fields: step5.secondary_contact_fields || [],
    form_data_fields: step5.form_data_fields || [],
    calendar_system: step5.calendar_system || 'none',
  })

  const handlePricingModelChange = (model: typeof PRICING_MODELS[number]) => {
    setFormData((prev) => ({
      ...prev,
      pricing_model: model,
      pricing_json: model === 'free' ? {} : prev.pricing_json || {},
    }))
  }

  const handleFeeAmountChange = (value: string) => {
    setFormData((prev) => ({
      ...prev,
      pricing_json: {
        ...prev.pricing_json,
        amount: value ? parseFloat(value) : undefined,
      },
    }))
  }

  const handleCurrencyChange = (value: string) => {
    setFormData((prev) => ({
      ...prev,
      pricing_json: {
        ...prev.pricing_json,
        currency: value,
      },
    }))
  }

  const handleProcessStepChange = (index: number, value: string) => {
    const updatedSteps = [...(formData.process_steps || [])]
    updatedSteps[index] = value
    setFormData((prev) => ({
      ...prev,
      process_steps: updatedSteps,
    }))
  }

  const addProcessStep = () => {
    setFormData((prev) => ({
      ...prev,
      process_steps: [...(prev.process_steps || []), ''],
    }))
  }

  const removeProcessStep = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      process_steps: (prev.process_steps || []).filter((_, i) => i !== index),
    }))
  }

  const handleFormFieldChange = (index: number, value: string) => {
    const updatedFields = [...(formData.form_data_fields || [])]
    updatedFields[index] = value
    setFormData((prev) => ({
      ...prev,
      form_data_fields: updatedFields,
    }))
  }

  const addFormField = () => {
    setFormData((prev) => ({
      ...prev,
      form_data_fields: [...(prev.form_data_fields || []), ''],
    }))
  }

  const removeFormField = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      form_data_fields: (prev.form_data_fields || []).filter((_, i) => i !== index),
    }))
  }

  const toggleSecondaryContactField = (field: string) => {
    setFormData((prev) => {
      const currentFields = prev.secondary_contact_fields || []
      const updated = currentFields.includes(field)
        ? currentFields.filter((f) => f !== field)
        : [...currentFields, field]
      return {
        ...prev,
        secondary_contact_fields: updated,
      }
    })
  }

  const handleNext = () => {
    wizard.updateStep('step5', formData)
    wizard.goNext()
  }

  const handleBack = () => {
    wizard.updateStep('step5', formData)
    wizard.goBack()
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Regras de Negócio</h2>
        <p className="text-slate-500 mt-2">
          Configure a precificação, metodologia e dados do seu processo de vendas.
        </p>
      </div>

      <div className="space-y-6">
        {/* Pricing Section */}
        <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-4">
          <div>
            <h3 className="font-semibold text-slate-900">Precificação</h3>
            <p className="text-sm text-slate-500 mt-1">Defina como seu agente vai apresentar a cobrança</p>
          </div>

          <div className="space-y-3">
            <Label>Modelo de cobrança</Label>
            <div className="space-y-2">
              {PRICING_MODELS.map((model) => (
                <label key={model} className="flex items-center cursor-pointer">
                  <input
                    type="radio"
                    name="pricing_model"
                    value={model}
                    checked={formData.pricing_model === model}
                    onChange={() => handlePricingModelChange(model)}
                    className="mr-3 rounded border-slate-300"
                  />
                  <span className="text-slate-900 capitalize">
                    {model === 'flat' && 'Valor fixo'}
                    {model === 'percentage' && 'Percentual'}
                    {model === 'free' && 'Gratuito'}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {formData.pricing_model === 'flat' && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="fee_amount">Valor da taxa</Label>
                <Input
                  id="fee_amount"
                  type="number"
                  placeholder="Ex: 199.00"
                  value={(formData.pricing_json?.amount as number) || ''}
                  onChange={(e) => handleFeeAmountChange(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="currency">Moeda</Label>
                <select
                  id="currency"
                  value={(formData.pricing_json?.currency as string) || 'BRL'}
                  onChange={(e) => handleCurrencyChange(e.target.value)}
                  className="w-full h-10 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-600"
                >
                  <option value="BRL">BRL (R$)</option>
                  <option value="USD">USD ($)</option>
                  <option value="EUR">EUR (€)</option>
                </select>
              </div>
            </div>
          )}

          <div className="space-y-3">
            <Label>Quando apresentar a taxa</Label>
            <div className="space-y-2">
              {FEE_TIMING_OPTIONS.map((option) => (
                <label key={option.value} className="flex items-center cursor-pointer">
                  <input
                    type="radio"
                    name="fee_timing"
                    value={option.value}
                    checked={formData.fee_presentation_timing === option.value}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        fee_presentation_timing: e.target.value,
                      }))
                    }
                    className="mr-3 rounded border-slate-300"
                  />
                  <span className="text-slate-900">{option.label}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* Process Steps */}
        <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-slate-900">Etapas do processo</h3>
              <p className="text-sm text-slate-500 mt-1">Descreva os passos do seu processo de venda</p>
            </div>
            <Button
              onClick={addProcessStep}
              className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2"
              size="sm"
            >
              <Plus className="w-4 h-4" />
              Adicionar etapa
            </Button>
          </div>

          <div className="space-y-3">
            {(formData.process_steps || []).map((step, index) => (
              <div key={index} className="flex gap-2">
                <Input
                  placeholder={`Etapa ${index + 1}`}
                  value={step}
                  onChange={(e) => handleProcessStepChange(index, e.target.value)}
                />
                <Button
                  onClick={() => removeProcessStep(index)}
                  variant="ghost"
                  size="icon"
                  className="text-slate-500 hover:text-red-600"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>

        {/* Methodology */}
        <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-4">
          <div>
            <h3 className="font-semibold text-slate-900">Descrição da metodologia</h3>
            <p className="text-sm text-slate-500 mt-1">Como você aborda o trabalho com clientes</p>
          </div>
          <Textarea
            placeholder="Descreva sua metodologia de atendimento e venda..."
            value={formData.methodology_text || ''}
            onChange={(e) =>
              setFormData((prev) => ({
                ...prev,
                methodology_text: e.target.value,
              }))
            }
            className="min-h-[100px]"
          />
        </div>

        {/* Secondary Contacts */}
        <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-slate-900">Acompanhantes/dependentes</h3>
              <p className="text-sm text-slate-500 mt-1">
                Seu negócio trabalha com acompanhantes (cônjuge, filhos, etc)?
              </p>
            </div>
            <Switch
              checked={formData.has_secondary_contacts || false}
              onCheckedChange={(checked) =>
                setFormData((prev) => ({
                  ...prev,
                  has_secondary_contacts: checked,
                }))
              }
            />
          </div>

          {formData.has_secondary_contacts && (
            <div className="space-y-3">
              <Label>Campos para acompanhantes</Label>
              <div className="space-y-2">
                {SECONDARY_CONTACT_FIELDS.map((field) => (
                  <label key={field.value} className="flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={(formData.secondary_contact_fields || []).includes(field.value)}
                      onChange={() => toggleSecondaryContactField(field.value)}
                      className="mr-3 rounded border-slate-300"
                    />
                    <span className="text-slate-900">{field.label}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Form Fields */}
        <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-slate-900">Campos de formulário</h3>
              <p className="text-sm text-slate-500 mt-1">Campos preenchidos automaticamente do marketing</p>
            </div>
            <Button
              onClick={addFormField}
              className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2"
              size="sm"
            >
              <Plus className="w-4 h-4" />
              Adicionar campo
            </Button>
          </div>

          <div className="space-y-3">
            {(formData.form_data_fields || []).map((field, index) => (
              <div key={index} className="flex gap-2">
                <Input
                  placeholder="Nome do campo"
                  value={field}
                  onChange={(e) => handleFormFieldChange(index, e.target.value)}
                />
                <Button
                  onClick={() => removeFormField(index)}
                  variant="ghost"
                  size="icon"
                  className="text-slate-500 hover:text-red-600"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>

        {/* Calendar System */}
        <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-4">
          <div>
            <h3 className="font-semibold text-slate-900">Sistema de calendário</h3>
            <p className="text-sm text-slate-500 mt-1">Como agendar reuniões com clientes</p>
          </div>

          <div className="space-y-2">
            {CALENDAR_SYSTEMS.map((system) => (
              <label key={system} className="flex items-center cursor-pointer">
                <input
                  type="radio"
                  name="calendar_system"
                  value={system}
                  checked={formData.calendar_system === system}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      calendar_system: e.target.value,
                    }))
                  }
                  className="mr-3 rounded border-slate-300"
                />
                <span className="text-slate-900">
                  {system === 'none' && 'Nenhum'}
                  {system === 'supabase_rpc' && 'RPC Supabase'}
                  {system === 'calendly' && 'Calendly'}
                  {system === 'google' && 'Google Calendar'}
                </span>
              </label>
            ))}
          </div>
        </div>
      </div>

      <div className="flex justify-between pt-4">
        <Button onClick={handleBack} variant="outline" className="text-slate-900 border-slate-300">
          Voltar
        </Button>
        <Button onClick={handleNext} className="bg-indigo-600 hover:bg-indigo-700 text-white">
          Próximo
        </Button>
      </div>
    </div>
  )
}
