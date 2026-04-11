import { useParams } from 'react-router-dom'
import { useAgentWizard } from '@/hooks/useAgentWizard'
import { Bot, Building2, LayoutTemplate, GitBranch, BookOpen, DollarSign, PhoneForwarded, Rocket } from 'lucide-react'
import Step1BusinessIdentity from './wizard/Step1_BusinessIdentity'
import Step2TemplateSelection from './wizard/Step2_TemplateSelection'
import Step3FunnelConfiguration from './wizard/Step3_FunnelConfiguration'
import Step4KnowledgeBase from './wizard/Step4_KnowledgeBase'
import Step5BusinessRules from './wizard/Step5_BusinessRules'
import Step6Escalation from './wizard/Step6_Escalation'
import Step7PreviewDeploy from './wizard/Step7_PreviewDeploy'

const STEPS = [
  { id: 1, label: 'Identidade', icon: Building2 },
  { id: 2, label: 'Template', icon: LayoutTemplate },
  { id: 3, label: 'Funil', icon: GitBranch },
  { id: 4, label: 'Knowledge Base', icon: BookOpen },
  { id: 5, label: 'Regras', icon: DollarSign },
  { id: 6, label: 'Handoff', icon: PhoneForwarded },
  { id: 7, label: 'Ativar', icon: Rocket },
]

export default function AiAgentBuilderWizard() {
  const { draftId } = useParams<{ draftId?: string }>()
  const wizard = useAgentWizard(draftId)

  const progress = Math.round((wizard.currentStep / 7) * 100)

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 py-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center">
              <Bot className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-slate-900 tracking-tight">Agent Builder</h1>
              <p className="text-sm text-slate-500">Crie seu agente IA de WhatsApp</p>
            </div>
          </div>

          {/* Progress bar */}
          <div className="w-full bg-slate-100 rounded-full h-1.5">
            <div
              className="bg-indigo-600 h-1.5 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>

          {/* Step indicators */}
          <div className="flex items-center justify-between mt-3">
            {STEPS.map((step) => {
              const Icon = step.icon
              const isActive = wizard.currentStep === step.id
              const isComplete = wizard.currentStep > step.id

              return (
                <button
                  key={step.id}
                  onClick={() => step.id <= wizard.currentStep && wizard.goToStep(step.id)}
                  className={`flex items-center gap-1.5 text-xs font-medium transition-colors ${
                    isActive
                      ? 'text-indigo-600'
                      : isComplete
                        ? 'text-slate-700 cursor-pointer hover:text-indigo-600'
                        : 'text-slate-400 cursor-default'
                  }`}
                >
                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center ${
                      isActive
                        ? 'bg-indigo-600 text-white'
                        : isComplete
                          ? 'bg-indigo-100 text-indigo-600'
                          : 'bg-slate-100 text-slate-400'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                  </div>
                  <span className="hidden sm:inline">{step.label}</span>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* Step content */}
      <div className="max-w-4xl mx-auto px-6 py-8">
        {wizard.currentStep === 1 && (
          <Step1BusinessIdentity wizard={wizard} />
        )}
        {wizard.currentStep === 2 && (
          <Step2TemplateSelection wizard={wizard} />
        )}
        {wizard.currentStep === 3 && (
          <Step3FunnelConfiguration wizard={wizard} />
        )}
        {wizard.currentStep === 4 && (
          <Step4KnowledgeBase wizard={wizard} />
        )}
        {wizard.currentStep === 5 && (
          <Step5BusinessRules wizard={wizard} />
        )}
        {wizard.currentStep === 6 && (
          <Step6Escalation wizard={wizard} />
        )}
        {wizard.currentStep === 7 && (
          <Step7PreviewDeploy wizard={wizard} />
        )}
      </div>
    </div>
  )
}
