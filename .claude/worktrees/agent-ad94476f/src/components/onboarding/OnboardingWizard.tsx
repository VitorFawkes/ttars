import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useOrg } from '../../contexts/OrgContext'
import { useAuth } from '../../contexts/AuthContext'
import {
    CheckCircle2,
    Circle,
    ArrowRight,
    Palette,
    Users,
    Kanban,
    Plug,
    Rocket,
    X,
    Building2,
    Loader2,
} from 'lucide-react'
import { Button } from '../ui/Button'

/**
 * Onboarding Wizard — 6 passos guiando o admin de uma org nova.
 *
 * Aparece sobre o Dashboard no primeiro login. Cada passo aponta para a
 * página correspondente (StudioStructure, UserManagement, etc) via link.
 * Pode ser fechado e retomado — o progresso é salvo em organizations.onboarding_step.
 *
 * Ordem dos passos:
 *   1. Identidade: logo + cores (workspace/general)
 *   2. Pipeline: fases e estágios (pipeline/structure)
 *   3. Campos: customização por estágio (customization/data-rules)
 *   4. Time: convidar usuários (team/members)
 *   5. Integrações (opcional)
 *   6. Pronto! → fecha e vai pra pipeline
 */

interface Step {
    id: number
    title: string
    description: string
    icon: typeof Palette
    action: string
    route: string
    optional?: boolean
}

const STEPS: Step[] = [
    {
        id: 1,
        title: 'Configure a identidade',
        description: 'Defina nome, logo e cores da sua empresa. Isso personaliza o CRM para o seu time.',
        icon: Palette,
        action: 'Abrir configurações',
        route: '/settings/workspace/general',
    },
    {
        id: 2,
        title: 'Monte seu pipeline',
        description: 'Ajuste as fases e estágios do seu funil de vendas. Você pode renomear, reordenar e adicionar novos.',
        icon: Kanban,
        action: 'Editar pipeline',
        route: '/settings/pipeline/structure',
    },
    {
        id: 3,
        title: 'Customize os campos',
        description: 'Defina quais campos aparecem em cada estágio e quais são obrigatórios para avançar.',
        icon: Building2,
        action: 'Configurar campos',
        route: '/settings/customization/data-rules',
    },
    {
        id: 4,
        title: 'Convide seu time',
        description: 'Adicione vendedores, gestores e outros membros do time. Eles receberão um email de convite.',
        icon: Users,
        action: 'Convidar usuários',
        route: '/settings/team/members',
    },
    {
        id: 5,
        title: 'Conecte integrações',
        description: 'ActiveCampaign, WhatsApp, webhooks — conecte suas ferramentas favoritas (opcional).',
        icon: Plug,
        action: 'Ver integrações',
        route: '/settings/integrations',
        optional: true,
    },
    {
        id: 6,
        title: 'Pronto para começar!',
        description: 'Sua conta está configurada. Acesse seu pipeline para criar o primeiro card.',
        icon: Rocket,
        action: 'Ir para o pipeline',
        route: '/pipeline',
    },
]

export default function OnboardingWizard() {
    const { org } = useOrg()
    const { profile } = useAuth()
    const navigate = useNavigate()
    const queryClient = useQueryClient()

    const currentStep = org?.onboarding_step ?? 0
    const [minimized, setMinimized] = useState(false)

    // Mostrar apenas para admins e quando onboarding não foi completado
    const isAdmin = profile?.is_admin === true
    const shouldShow = isAdmin && org && currentStep < STEPS.length && !org.onboarding_completed_at

    const updateStepMutation = useMutation({
        mutationFn: async (newStep: number) => {
            if (!org) return
            const payload: { onboarding_step: number; onboarding_completed_at?: string } = {
                onboarding_step: newStep,
            }
            if (newStep >= STEPS.length) {
                payload.onboarding_completed_at = new Date().toISOString()
            }
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { error } = await (supabase as any)
                .from('organizations')
                .update(payload)
                .eq('id', org.id)
            if (error) throw error
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['organization'] })
        },
    })

    if (!shouldShow || minimized) {
        // Botão flutuante para reabrir
        if (shouldShow && minimized) {
            return (
                <button
                    onClick={() => setMinimized(false)}
                    className="fixed bottom-6 right-6 z-40 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full shadow-lg px-4 py-3 flex items-center gap-2 text-sm font-medium"
                >
                    <Rocket className="w-4 h-4" />
                    Continuar configuração ({currentStep}/{STEPS.length})
                </button>
            )
        }
        return null
    }

    const handleStepAction = async (step: Step) => {
        // Marca o passo como feito antes de navegar (ou avança se for o atual)
        const nextStep = Math.max(currentStep, step.id)
        await updateStepMutation.mutateAsync(nextStep)
        if (step.id === STEPS.length) {
            // Passo final: marca como completo
            await updateStepMutation.mutateAsync(STEPS.length)
        }
        navigate(step.route)
        setMinimized(true) // Minimiza ao navegar
    }

    const handleSkip = async () => {
        await updateStepMutation.mutateAsync(STEPS.length)
    }

    const progressPercent = Math.round((currentStep / STEPS.length) * 100)

    return (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
            <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full my-8">
                {/* Header */}
                <div className="relative border-b border-slate-200 px-8 pt-8 pb-6">
                    <button
                        onClick={() => setMinimized(true)}
                        className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-md transition-colors"
                        title="Fechar (você pode voltar depois)"
                    >
                        <X className="w-4 h-4" />
                    </button>

                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 bg-indigo-100 rounded-lg">
                            <Rocket className="w-5 h-5 text-indigo-600" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-slate-900">Bem-vindo ao WelcomeCRM!</h2>
                            <p className="text-sm text-slate-500">Vamos configurar sua conta em 6 passos rápidos</p>
                        </div>
                    </div>

                    {/* Progress bar */}
                    <div className="mt-4">
                        <div className="flex items-center justify-between mb-1.5">
                            <span className="text-xs text-slate-500 font-medium">
                                Progresso: {currentStep}/{STEPS.length} passos
                            </span>
                            <span className="text-xs text-indigo-600 font-semibold">{progressPercent}%</span>
                        </div>
                        <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-indigo-600 transition-all duration-500 ease-out"
                                style={{ width: `${progressPercent}%` }}
                            />
                        </div>
                    </div>
                </div>

                {/* Steps list */}
                <div className="px-8 py-6 max-h-[60vh] overflow-y-auto space-y-3">
                    {STEPS.map((step) => {
                        const Icon = step.icon
                        const isCompleted = currentStep >= step.id
                        const isCurrent = currentStep === step.id - 1 || (currentStep === 0 && step.id === 1)
                        return (
                            <div
                                key={step.id}
                                className={`border rounded-xl p-4 transition-all ${
                                    isCurrent
                                        ? 'border-indigo-500 bg-indigo-50/50 shadow-sm'
                                        : isCompleted
                                        ? 'border-green-200 bg-green-50/30'
                                        : 'border-slate-200 bg-white'
                                }`}
                            >
                                <div className="flex items-start gap-4">
                                    <div className="flex-shrink-0">
                                        {isCompleted ? (
                                            <CheckCircle2 className="w-6 h-6 text-green-600" />
                                        ) : (
                                            <Circle className={`w-6 h-6 ${isCurrent ? 'text-indigo-600' : 'text-slate-300'}`} />
                                        )}
                                    </div>

                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <Icon className={`w-4 h-4 ${isCurrent ? 'text-indigo-600' : 'text-slate-400'}`} />
                                            <h3 className="font-semibold text-sm text-slate-900">
                                                {step.id}. {step.title}
                                                {step.optional && (
                                                    <span className="ml-2 text-xs font-normal text-slate-400">(opcional)</span>
                                                )}
                                            </h3>
                                        </div>
                                        <p className="text-xs text-slate-600 mt-1 leading-relaxed">{step.description}</p>

                                        {(isCurrent || (isCompleted && !isCurrent)) && (
                                            <Button
                                                size="sm"
                                                variant={isCurrent ? 'default' : 'outline'}
                                                className="mt-3"
                                                onClick={() => handleStepAction(step)}
                                                disabled={updateStepMutation.isPending}
                                            >
                                                {updateStepMutation.isPending ? (
                                                    <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
                                                ) : (
                                                    <ArrowRight className="w-3 h-3 mr-1.5" />
                                                )}
                                                {step.action}
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )
                    })}
                </div>

                {/* Footer */}
                <div className="border-t border-slate-200 px-8 py-4 flex items-center justify-between bg-slate-50 rounded-b-2xl">
                    <button
                        onClick={handleSkip}
                        className="text-xs text-slate-500 hover:text-slate-700"
                    >
                        Pular e explorar depois
                    </button>
                    <p className="text-xs text-slate-400">Você pode retomar esta configuração a qualquer momento</p>
                </div>
            </div>
        </div>
    )
}
