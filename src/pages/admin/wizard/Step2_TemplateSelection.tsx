import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { useAgentTemplates, type AgentTemplate } from '@/hooks/useAgentTemplates'
import type { useAgentWizard } from '@/hooks/useAgentWizard'
import { Eye } from 'lucide-react'
import * as LucideIcons from 'lucide-react'

type WizardProps = { wizard: ReturnType<typeof useAgentWizard> }

export default function Step2_TemplateSelection({ wizard }: WizardProps) {
  const { data: templates = [], isLoading, error } = useAgentTemplates()
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(
    wizard.wizardData.step2?.template_id || null
  )
  const [previewTemplate, setPreviewTemplate] = useState<AgentTemplate | null>(null)

  const handleSelectTemplate = (template: AgentTemplate) => {
    setSelectedTemplateId(template.id)
    wizard.updateStep('step2', { template_id: template.id })

    if (template.default_qualification_flow && template.default_qualification_flow.length > 0) {
      wizard.updateStep('step3', {
        stages: template.default_qualification_flow.map((stage) => ({
          stage_name: stage.stage_name,
          stage_key: stage.stage_key,
          question: stage.question,
          subquestions: stage.subquestions || [],
          disqualification_triggers: stage.disqualification_triggers || [],
          advance_to_stage_id: '',
          advance_condition: '',
          response_options: stage.response_options || [],
        })),
      })
    }
  }

  const handleNext = () => {
    if (!selectedTemplateId) return
    wizard.goNext()
  }

  const getIconComponent = (iconName: string) => {
    const Icons = LucideIcons as unknown as Record<string, React.ComponentType<any>>
    return Icons[iconName] || null
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Selecione um Template</h2>
          <p className="text-slate-500 mt-2">Carregando templates...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Selecione um Template</h2>
          <p className="text-slate-500 mt-2">Erro ao carregar templates</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Selecione um Template</h2>
        <p className="text-slate-500 mt-2">
          Escolha um template pré-configurado para acelerar a configuração do seu agente.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        {templates.map((template) => {
          const IconComponent = getIconComponent(template.icon_name)
          const isSelected = selectedTemplateId === template.id

          return (
            <div
              key={template.id}
              onClick={() => handleSelectTemplate(template)}
              className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
                isSelected
                  ? 'border-indigo-600 bg-indigo-50'
                  : 'border-slate-200 bg-white hover:border-slate-300'
              }`}
            >
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  {IconComponent && (
                    <IconComponent className="w-6 h-6 text-indigo-600" />
                  )}
                  <h3 className="font-semibold text-slate-900 text-sm">{template.nome}</h3>
                </div>

                <p className="text-xs text-slate-500 line-clamp-2">
                  {template.descricao || 'Sem descrição'}
                </p>

                <Button
                  onClick={(e) => {
                    e.stopPropagation()
                    setPreviewTemplate(template)
                  }}
                  variant="ghost"
                  size="sm"
                  className="w-full text-indigo-600 hover:bg-indigo-100"
                >
                  <Eye className="w-4 h-4 mr-1" />
                  Visualizar
                </Button>
              </div>
            </div>
          )
        })}
      </div>

      {previewTemplate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[80vh] overflow-auto">
            <h3 className="text-xl font-bold text-slate-900 mb-4">{previewTemplate.nome}</h3>

            <div className="space-y-4 mb-6">
              <div className="bg-slate-50 rounded-lg p-4 space-y-3 max-h-[400px] overflow-auto">
                {previewTemplate.preview_conversation && previewTemplate.preview_conversation.length > 0
                  ? previewTemplate.preview_conversation.map((msg, idx) => (
                      <div
                        key={idx}
                        className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`max-w-xs px-3 py-2 rounded-lg text-sm ${
                            msg.role === 'user'
                              ? 'bg-indigo-600 text-white'
                              : 'bg-slate-200 text-slate-900'
                          }`}
                        >
                          {msg.content}
                        </div>
                      </div>
                    ))
                  : <p className="text-slate-500 text-sm">Sem visualização disponível</p>}
              </div>
            </div>

            <div className="flex gap-3">
              <Button
                onClick={() => setPreviewTemplate(null)}
                variant="outline"
                className="flex-1"
              >
                Fechar
              </Button>
              <Button
                onClick={() => {
                  handleSelectTemplate(previewTemplate)
                  setPreviewTemplate(null)
                }}
                className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white"
              >
                Usar Este Template
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="flex justify-between">
        <Button
          onClick={() => wizard.goBack()}
          variant="outline"
          className="text-slate-900 border-slate-200"
        >
          Voltar
        </Button>
        <Button
          onClick={handleNext}
          disabled={!selectedTemplateId}
          className="bg-indigo-600 hover:bg-indigo-700 text-white"
        >
          Próximo
        </Button>
      </div>
    </div>
  )
}
