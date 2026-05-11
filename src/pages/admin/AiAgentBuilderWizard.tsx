import { useNavigate, useParams } from 'react-router-dom'
import { useAgentWizard } from '@/hooks/useAgentWizard'
import { useOrg } from '@/contexts/OrgContext'
import {
  Bot, Building2, LayoutTemplate, GitBranch, BookOpen, Settings, PhoneForwarded, Rocket, X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import Step1BusinessIdentity from './wizard/Step1_BusinessIdentity'
import Step2TemplateSelection from './wizard/Step2_TemplateSelection'
import Step3FunnelConfiguration from './wizard/Step3_FunnelConfiguration'
import Step4KnowledgeBase from './wizard/Step4_KnowledgeBase'
import Step5BusinessRules from './wizard/Step5_BusinessRules'
import Step6Escalation from './wizard/Step6_Escalation'
import Step7PreviewDeploy from './wizard/Step7_PreviewDeploy'

const STEPS = [
  { id: 1, label: 'Identidade', icon: Building2, hint: 'Nome do negócio, persona, idioma. Define como o agente se apresenta.' },
  { id: 2, label: 'Template', icon: LayoutTemplate, hint: 'Escolha um template pronto (vendas, suporte, agendamento) ou comece do zero.' },
  { id: 3, label: 'Funil', icon: GitBranch, hint: 'Etapas de qualificação que o agente persegue (SPIN, perguntas chave).' },
  { id: 4, label: 'Conhecimento', icon: BookOpen, hint: 'Bases de conhecimento que o agente consulta antes de responder.' },
  { id: 5, label: 'Regras', icon: Settings, hint: 'Regras de negócio (preço, taxa, política) e cenários especiais.' },
  { id: 6, label: 'Escalação', icon: PhoneForwarded, hint: 'Quando passar pra humano e o que dizer ao cliente.' },
  { id: 7, label: 'Testar & ativar', icon: Rocket, hint: 'Pré-visualize, simule e ative o agente nas linhas WhatsApp.' },
]

export default function AiAgentBuilderWizard() {
  const { draftId } = useParams<{ draftId?: string }>()
  const navigate = useNavigate()
  const { org } = useOrg()
  const wizard = useAgentWizard(draftId, org?.id)

  const progress = Math.round((wizard.currentStep / STEPS.length) * 100)
  const currentStepMeta = STEPS.find((s) => s.id === wizard.currentStep)

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center">
                <Bot className="w-5 h-5 text-indigo-600" />
              </div>
              <div>
                <h1 className="text-lg font-semibold text-slate-900 tracking-tight">Criador de agente</h1>
                <p className="text-xs text-slate-500">
                  Passo {wizard.currentStep} de {STEPS.length}
                  {currentStepMeta && <> — {currentStepMeta.label}</>}
                </p>
              </div>
            </div>
            <button
              onClick={() => navigate('/settings/ai-agents')}
              className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg"
              aria-label="Sair do assistente"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Progress bar */}
          <div className="w-full bg-slate-100 rounded-full h-1">
            <div
              className="bg-indigo-600 h-1 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>

          {/* Step indicators */}
          <div className="flex items-center justify-between mt-3 overflow-x-auto no-scrollbar">
            {STEPS.map((step) => {
              const Icon = step.icon
              const isActive = wizard.currentStep === step.id
              const isComplete = wizard.currentStep > step.id

              return (
                <button
                  key={step.id}
                  onClick={() => wizard.goToStep(step.id)}
                  title={step.hint}
                  className={cn(
                    'flex items-center gap-1.5 text-xs font-medium transition-colors flex-shrink-0 px-1.5 cursor-pointer',
                    isActive ? 'text-indigo-600' :
                      isComplete ? 'text-slate-700 hover:text-indigo-600' :
                      'text-slate-500 hover:text-indigo-600'
                  )}
                >
                  <div
                    className={cn(
                      'w-7 h-7 rounded-full flex items-center justify-center transition-all',
                      isActive ? 'bg-indigo-600 text-white scale-110' :
                        isComplete ? 'bg-indigo-100 text-indigo-600' :
                        'bg-slate-100 text-slate-500'
                    )}
                  >
                    <Icon className="w-3.5 h-3.5" />
                  </div>
                  <span className="hidden md:inline">{step.label}</span>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* Step content */}
      <div className={cn(
        'mx-auto px-6 py-8',
        wizard.currentStep === 7 ? 'max-w-7xl' : 'max-w-5xl'
      )}>
        {wizard.currentStep === 1 && <Step1BusinessIdentity wizard={wizard} />}
        {wizard.currentStep === 2 && <Step2TemplateSelection wizard={wizard} />}
        {wizard.currentStep === 3 && <Step3FunnelConfiguration wizard={wizard} />}
        {wizard.currentStep === 4 && <Step4KnowledgeBase wizard={wizard} />}
        {wizard.currentStep === 5 && <Step5BusinessRules wizard={wizard} />}
        {wizard.currentStep === 6 && <Step6Escalation wizard={wizard} />}
        {wizard.currentStep === 7 && <Step7PreviewDeploy wizard={wizard} />}
      </div>
    </div>
  )
}
