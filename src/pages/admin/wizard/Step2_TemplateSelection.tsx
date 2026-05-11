import { useState, createElement } from 'react'
import { Check, Eye, Sparkles, X, ListChecks, MessageSquare, Zap } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { useAgentTemplates, type AgentTemplate } from '@/hooks/useAgentTemplates'
import { AgentChatPreview } from '@/components/ai-agent/AgentChatPreview'
import { cn } from '@/lib/utils'
import type { useAgentWizard } from '@/hooks/useAgentWizard'
import * as LucideIcons from 'lucide-react'

type WizardProps = { wizard: ReturnType<typeof useAgentWizard> }

const CATEGORIA_LABEL: Record<string, { label: string; color: string }> = {
  sdr: { label: 'Vendas (SDR)', color: 'bg-green-100 text-green-700 border-green-200' },
  support: { label: 'Suporte', color: 'bg-blue-100 text-blue-700 border-blue-200' },
  onboarding: { label: 'Onboarding', color: 'bg-purple-100 text-purple-700 border-purple-200' },
  success: { label: 'Sucesso', color: 'bg-pink-100 text-pink-700 border-pink-200' },
  booking: { label: 'Agendamento', color: 'bg-amber-100 text-amber-700 border-amber-200' },
  custom: { label: 'Personalizado', color: 'bg-slate-100 text-slate-700 border-slate-200' },
}

function getIconComponent(iconName: string): React.ComponentType<{ className?: string }> | null {
  const Icons = LucideIcons as unknown as Record<string, React.ComponentType<{ className?: string }>>
  return Icons[iconName] || null
}

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
          maps_to_field: (stage as Record<string, unknown>).maps_to_field as string || '',
          skip_if_filled: ((stage as Record<string, unknown>).skip_if_filled as boolean) ?? true,
        })),
      })
    }
  }

  const handleNext = () => {
    if (!selectedTemplateId) return
    wizard.goNext()
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-semibold text-slate-900 tracking-tight">Escolha um template</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-64 bg-slate-100 rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-12 text-center text-red-600">
        Erro ao carregar templates. Tente recarregar a página.
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900 tracking-tight">Escolha um template</h2>
        <p className="text-slate-500 mt-1 text-sm">
          Comece a partir de um template pré-configurado. Você pode ajustar tudo depois.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {templates.map((template) => {
          const IconComponent = getIconComponent(template.icon_name)
          const isSelected = selectedTemplateId === template.id
          const catConfig = CATEGORIA_LABEL[template.categoria] || CATEGORIA_LABEL.custom
          const stageCount = template.default_qualification_flow?.length || 0
          const scenarioCount = template.default_special_scenarios?.length || 0
          const escalationCount = template.default_escalation_rules?.length || 0

          return (
            <div
              key={template.id}
              onClick={() => handleSelectTemplate(template)}
              className={cn(
                'relative p-5 rounded-xl border-2 cursor-pointer transition-all',
                isSelected
                  ? 'border-indigo-500 bg-indigo-50/30 shadow-md'
                  : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm'
              )}
            >
              {isSelected && (
                <div className="absolute top-3 right-3 w-7 h-7 bg-indigo-600 rounded-full flex items-center justify-center">
                  <Check className="w-4 h-4 text-white" strokeWidth={3} />
                </div>
              )}

              <div className="flex items-start gap-3 mb-3">
                <div className={cn(
                  'w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0',
                  isSelected ? 'bg-indigo-100' : 'bg-slate-100'
                )}>
                  {IconComponent
                    ? createElement(IconComponent, { className: cn('w-5 h-5', isSelected ? 'text-indigo-600' : 'text-slate-600') })
                    : <Sparkles className={cn('w-5 h-5', isSelected ? 'text-indigo-600' : 'text-slate-600')} />
                  }
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold text-slate-900 tracking-tight">{template.nome}</h3>
                  <Badge variant="outline" className={cn('text-xs mt-1', catConfig.color)}>
                    {catConfig.label}
                  </Badge>
                </div>
              </div>

              <p className="text-sm text-slate-600 line-clamp-2 mb-3">
                {template.descricao || 'Sem descrição'}
              </p>

              {/* Features */}
              <div className="space-y-1.5 mb-4">
                {stageCount > 0 && (
                  <div className="flex items-center gap-2 text-xs text-slate-600">
                    <ListChecks className="w-3.5 h-3.5 text-slate-400" />
                    <span>{stageCount} etapas de qualificação</span>
                  </div>
                )}
                {scenarioCount > 0 && (
                  <div className="flex items-center gap-2 text-xs text-slate-600">
                    <Zap className="w-3.5 h-3.5 text-slate-400" />
                    <span>{scenarioCount} cenário{scenarioCount > 1 ? 's' : ''} especial</span>
                  </div>
                )}
                {escalationCount > 0 && (
                  <div className="flex items-center gap-2 text-xs text-slate-600">
                    <MessageSquare className="w-3.5 h-3.5 text-slate-400" />
                    <span>{escalationCount} regra{escalationCount > 1 ? 's' : ''} de escalação</span>
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setPreviewTemplate(template) }}
                className="w-full flex items-center justify-center gap-1.5 text-xs font-medium text-indigo-600 hover:bg-indigo-50 py-2 rounded-lg transition-colors"
              >
                <Eye className="w-3.5 h-3.5" />
                Ver conversa de exemplo
              </button>
            </div>
          )
        })}
      </div>

      {/* Preview Modal */}
      {previewTemplate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[85vh] overflow-hidden shadow-2xl flex flex-col">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-900 tracking-tight">{previewTemplate.nome}</h3>
                <p className="text-sm text-slate-500 mt-0.5">Exemplo de conversa real</p>
              </div>
              <button
                onClick={() => setPreviewTemplate(null)}
                className="p-2 hover:bg-slate-100 rounded-lg"
              >
                <X className="w-4 h-4 text-slate-500" />
              </button>
            </div>

            <div className="p-5 flex-1 overflow-y-auto">
              <AgentChatPreview
                agentName={previewTemplate.nome}
                subtitle="exemplo de conversa"
                messages={(previewTemplate.preview_conversation || []).map((m) => ({
                  role: m.role === 'user' ? 'user' : 'agent',
                  content: m.content,
                }))}
                className="min-h-[360px]"
              />
            </div>

            <div className="px-6 py-4 border-t border-slate-200 flex gap-3">
              <Button variant="outline" onClick={() => setPreviewTemplate(null)} className="flex-1">
                Fechar
              </Button>
              <Button
                onClick={() => { handleSelectTemplate(previewTemplate); setPreviewTemplate(null) }}
                className="flex-1 gap-2"
              >
                <Check className="w-4 h-4" />
                Usar este template
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="flex justify-between pt-2">
        <Button onClick={() => wizard.goBack()} variant="outline">
          ← Voltar
        </Button>
        <Button onClick={handleNext} disabled={!selectedTemplateId} className="gap-2">
          Próximo passo →
        </Button>
      </div>
    </div>
  )
}
