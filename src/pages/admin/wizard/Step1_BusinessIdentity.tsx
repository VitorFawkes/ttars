import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import type { WizardStep1 } from '@/hooks/useAgentWizard'
import type { useAgentWizard } from '@/hooks/useAgentWizard'

type WizardProps = { wizard: ReturnType<typeof useAgentWizard> }

const TONE_OPTIONS = ['formal', 'professional', 'friendly', 'casual', 'empathetic'] as const

export default function Step1_BusinessIdentity({ wizard }: WizardProps) {
  const step1 = (wizard.wizardData.step1 || {}) as Partial<WizardStep1>
  const [formData, setFormData] = useState<Partial<WizardStep1>>({
    agent_name: step1.agent_name || '',
    company_name: step1.company_name || '',
    company_description: step1.company_description || '',
    agent_persona: step1.agent_persona || '',
    tone: step1.tone || 'professional',
    language: step1.language || 'pt-BR',
  })

  const handleInputChange = (field: keyof WizardStep1, value: string) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }))
  }

  const handleNext = () => {
    wizard.updateStep('step1', formData)
    wizard.goNext()
  }

  const isFormValid = formData.agent_name?.trim() && formData.company_name?.trim()

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Identidade do Agente</h2>
        <p className="text-slate-500 mt-2">
          Configure o nome, empresa e personalidade do seu agente de IA.
        </p>
      </div>

      <div className="space-y-4 bg-white border border-slate-200 rounded-lg p-6">
        <div className="space-y-2">
          <Label htmlFor="agent_name">Nome do agente</Label>
          <Input
            id="agent_name"
            placeholder="Ex: Julia, Bot Vendas"
            value={formData.agent_name || ''}
            onChange={(e) => handleInputChange('agent_name', e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="company_name">Nome da empresa</Label>
          <Input
            id="company_name"
            placeholder="Ex: Welcome Viagens"
            value={formData.company_name || ''}
            onChange={(e) => handleInputChange('company_name', e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="company_description">Descrição da empresa (opcional)</Label>
          <Textarea
            id="company_description"
            placeholder="Descrição breve: 2-3 frases sobre o que a empresa faz"
            value={formData.company_description || ''}
            onChange={(e) => handleInputChange('company_description', e.target.value)}
            className="min-h-[80px]"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="agent_persona">Personalidade do agente (opcional)</Label>
          <Textarea
            id="agent_persona"
            placeholder="Ex: consultora de viagens empática, atencioso com detalhes"
            value={formData.agent_persona || ''}
            onChange={(e) => handleInputChange('agent_persona', e.target.value)}
            className="min-h-[80px]"
          />
        </div>

        <div className="space-y-3">
          <Label>Tom de comunicação</Label>
          <div className="space-y-2">
            {TONE_OPTIONS.map((tone) => (
              <label key={tone} className="flex items-center cursor-pointer">
                <input
                  type="radio"
                  name="tone"
                  value={tone}
                  checked={formData.tone === tone}
                  onChange={(e) => handleInputChange('tone', e.target.value)}
                  className="mr-3 rounded border-slate-300"
                />
                <span className="text-slate-900 capitalize">
                  {tone === 'formal' && 'Formal'}
                  {tone === 'professional' && 'Profissional'}
                  {tone === 'friendly' && 'Amigável'}
                  {tone === 'casual' && 'Casual'}
                  {tone === 'empathetic' && 'Empático'}
                </span>
              </label>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="language">Idioma</Label>
          <select
            id="language"
            value={formData.language || 'pt-BR'}
            onChange={(e) => handleInputChange('language', e.target.value)}
            className="w-full h-8 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-600"
          >
            <option value="pt-BR">Português (Brasil)</option>
            <option value="en">English</option>
            <option value="es">Español</option>
          </select>
        </div>
      </div>

      <div className="flex justify-between">
        <div />
        <Button
          onClick={handleNext}
          disabled={!isFormValid}
          className="bg-indigo-600 hover:bg-indigo-700 text-white"
        >
          Próximo
        </Button>
      </div>
    </div>
  )
}
