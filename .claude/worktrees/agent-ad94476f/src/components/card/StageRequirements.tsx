import { CheckCircle2, AlertCircle } from 'lucide-react'
import type { Database } from '../../database.types'
import { cn } from '../../lib/utils'
import { useStageRequirements, type Requirement, type TaskRequirement } from '../../hooks/useStageRequirements'

type Card = Database['public']['Tables']['cards']['Row']

interface StageRequirementsProps {
    card: Card
}

// Labels for proposal statuses
const PROPOSAL_STATUS_LABELS: Record<string, string> = {
    draft: 'Criada (Rascunho)',
    sent: 'Enviada',
    viewed: 'Visualizada',
    in_progress: 'Em Andamento',
    accepted: 'Aceita'
}

export default function StageRequirements({ card }: StageRequirementsProps) {
    const {
        isLoading,
        blockingRequirements,
        checkRequirement
    } = useStageRequirements(card)

    if (isLoading) return <div className="animate-pulse h-20 bg-gray-100 rounded-lg"></div>
    if (blockingRequirements.length === 0) return null

    const completedBlocking = blockingRequirements.filter(req => checkRequirement(req)).length
    const totalBlocking = blockingRequirements.length
    const isAllBlockingCompleted = completedBlocking === totalBlocking

    // Helper to format dynamic labels
    const formatTaskLabel = (tipo: string) => {
        // Capitalize first letter and replace underscores
        return tipo
            .split('_')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ')
    }



    // Get label for requirement
    const getRequirementLabel = (req: Requirement): string => {
        switch (req.requirement_type) {
            case 'field':
                return req.label
            case 'proposal': {
                const statusLabel = PROPOSAL_STATUS_LABELS[req.proposal_min_status] || req.proposal_min_status
                return `Proposta ${statusLabel}`
            }
            case 'task': {
                // Use the label from config if available (it should be), otherwise format the type
                if (req.label && req.label !== 'Requisito') return req.label

                const typeLabel = formatTaskLabel(req.task_tipo)
                return `${typeLabel} ${req.task_require_completed ? 'Concluída' : 'Criada'}`
            }
            default:
                return (req as { label?: string }).label || 'Requisito'
        }
    }

    // Get badge color for requirement type
    const getTypeBadge = (req: Requirement) => {
        if (req.requirement_type === 'proposal') {
            return <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full">Proposta</span>
        }
        if (req.requirement_type === 'task') {
            return <span className="text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full">Tarefa</span>
        }
        return null
    }

    return (
        <div className="space-y-4 mb-6">
            {/* Blocking Requirements (Current Stage) */}
            <div className={cn(
                "bg-white rounded-xl shadow-sm border overflow-hidden transition-colors duration-300",
                isAllBlockingCompleted ? "border-green-100" : "border-red-100"
            )}>
                <div className={cn(
                    "px-4 py-3 border-b flex justify-between items-center transition-colors duration-300",
                    isAllBlockingCompleted ? "bg-green-50 border-green-100" : "bg-red-50 border-red-100"
                )}>
                    <h3 className={cn(
                        "font-semibold flex items-center gap-2",
                        isAllBlockingCompleted ? "text-green-900" : "text-red-900"
                    )}>
                        {isAllBlockingCompleted ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                        Requisitos para Entrar na Etapa
                    </h3>
                    <span className={cn(
                        "text-xs font-medium px-2 py-1 rounded-full transition-colors duration-300",
                        isAllBlockingCompleted ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                    )}>
                        {completedBlocking}/{totalBlocking}
                    </span>
                </div>

                <div className="divide-y divide-gray-50">
                    {blockingRequirements.map((req: Requirement) => {
                        const isCompleted = checkRequirement(req)

                        return (
                            <div key={req.id} className={`p-3 flex items-start gap-3 transition-colors ${isCompleted ? 'bg-gray-50/50' : 'bg-white'}`}>
                                <div className={`mt-0.5 flex-shrink-0`}>
                                    {isCompleted ? (
                                        <CheckCircle2 className="w-5 h-5 text-green-500" />
                                    ) : (
                                        <div className="w-5 h-5 rounded-full border-2 border-red-200 bg-red-50 flex items-center justify-center">
                                            <div className="w-2 h-2 rounded-full bg-red-400" />
                                        </div>
                                    )}
                                </div>
                                <div className="flex-1">
                                    <div className="flex items-center gap-2">
                                        <p className={`text-sm font-medium ${isCompleted ? 'text-gray-500 line-through' : 'text-gray-700'}`}>
                                            {getRequirementLabel(req)}
                                        </p>
                                        {getTypeBadge(req)}
                                    </div>
                                    {!isCompleted && (
                                        <p className="text-xs text-gray-500 mt-1">
                                            {req.requirement_type === 'task'
                                                ? ((req as TaskRequirement).task_require_completed
                                                    ? 'Conclua esta tarefa para entrar na etapa.'
                                                    : 'Crie esta tarefa para entrar na etapa.')
                                                : req.requirement_type === 'proposal'
                                                    ? 'Atualize o status da proposta para entrar na etapa.'
                                                    : 'Preencha este campo para entrar na etapa.'}
                                        </p>
                                    )}
                                </div>
                            </div>
                        )
                    })}
                </div>
            </div>
        </div>
    )
}
