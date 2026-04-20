import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog'
import { Button } from '../ui/Button'
import { AlertTriangle, ExternalLink, FileText, FileCheck, CheckCircle2, LayoutList, ShieldAlert, AlertCircle, UserCheck, type LucideIcon } from 'lucide-react'
import { createElement } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { toast } from 'sonner'
import OwnerSelector from '../pipeline/OwnerSelector'
import type { MissingRequirement } from '../../hooks/useQualityGate'

interface QualityGateModalProps {
    isOpen: boolean
    onClose: () => void
    onConfirm: () => void // Keep for API compatibility but not used in new flow
    cardId: string
    targetStageName: string
    missingRequirements: MissingRequirement[]
    initialData?: Record<string, unknown>  // Keep for API compatibility
    context?: 'kanban' | 'card-detail'
}

// --- Config map: defines how each requirement type renders ---
interface TypeConfig {
    title: string
    icon: LucideIcon
    bg: string
    border: string
    text: string
    dot: string
    titleColor: string
}

const TYPE_CONFIG: Record<string, TypeConfig> = {
    field: {
        title: 'Campos Obrigatórios',
        icon: LayoutList,
        bg: 'bg-blue-50',
        border: 'border-blue-100',
        text: 'text-blue-800',
        dot: 'bg-blue-500',
        titleColor: 'text-blue-700',
    },
    proposal: {
        title: 'Propostas Obrigatórias',
        icon: FileText,
        bg: 'bg-emerald-50',
        border: 'border-emerald-100',
        text: 'text-emerald-800',
        dot: 'bg-emerald-500',
        titleColor: 'text-emerald-700',
    },
    task: {
        title: 'Tarefas Obrigatórias',
        icon: CheckCircle2,
        bg: 'bg-purple-50',
        border: 'border-purple-100',
        text: 'text-purple-800',
        dot: 'bg-purple-500',
        titleColor: 'text-purple-700',
    },
    document: {
        title: 'Documentos Pendentes',
        icon: FileCheck,
        bg: 'bg-teal-50',
        border: 'border-teal-100',
        text: 'text-teal-800',
        dot: 'bg-teal-500',
        titleColor: 'text-teal-700',
    },
    rule: {
        title: 'Requisitos Obrigatórios',
        icon: ShieldAlert,
        bg: 'bg-amber-50',
        border: 'border-amber-100',
        text: 'text-amber-800',
        dot: 'bg-amber-500',
        titleColor: 'text-amber-700',
    },
    team_member: {
        title: 'Responsáveis Obrigatórios',
        icon: UserCheck,
        bg: 'bg-indigo-50',
        border: 'border-indigo-100',
        text: 'text-indigo-800',
        dot: 'bg-indigo-500',
        titleColor: 'text-indigo-700',
    },
}

const FALLBACK_CONFIG: TypeConfig = {
    title: 'Outros Requisitos',
    icon: AlertCircle,
    bg: 'bg-gray-50',
    border: 'border-gray-200',
    text: 'text-gray-800',
    dot: 'bg-gray-500',
    titleColor: 'text-gray-700',
}

const TEAM_ROLE_TO_OWNER_COLUMN: Record<string, string> = {
    sdr: 'sdr_owner_id',
    planner: 'vendas_owner_id',
    pos_venda: 'pos_owner_id',
    concierge: 'concierge_owner_id',
}

export default function QualityGateModal({
    isOpen,
    onClose,
    cardId,
    targetStageName,
    missingRequirements,
    context = 'kanban',
}: QualityGateModalProps) {
    const navigate = useNavigate()
    const queryClient = useQueryClient()

    const handleOpenCard = () => {
        onClose()
        navigate(`/cards/${cardId}`)
    }

    const assignOwnerMutation = useMutation({
        mutationFn: async ({ role, userId }: { role: string; userId: string | null }) => {
            const ownerCol = TEAM_ROLE_TO_OWNER_COLUMN[role]
            if (!ownerCol) throw new Error(`Role desconhecida: ${role}`)

            const { error } = await supabase
                .from('cards')
                .update({ [ownerCol]: userId })
                .eq('id', cardId)
            if (error) throw error
        },
        onSuccess: () => {
            toast.success('Responsável atribuído')
            queryClient.invalidateQueries({ queryKey: ['card-detail', cardId] })
            queryClient.invalidateQueries({ queryKey: ['card', cardId] })
            queryClient.invalidateQueries({ queryKey: ['cards'] })
            queryClient.invalidateQueries({ queryKey: ['card-team-roles', cardId] })
        },
        onError: (error: Error) => {
            toast.error('Erro ao atribuir responsável: ' + error.message)
        }
    })

    // Group requirements by type, preserving insertion order
    const grouped = new Map<string, MissingRequirement[]>()
    for (const req of missingRequirements) {
        const list = grouped.get(req.type) || []
        list.push(req)
        grouped.set(req.type, list)
    }

    const remainingCount = missingRequirements.length

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[480px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-amber-600">
                        <AlertTriangle className="h-5 w-5" />
                        Requisitos Obrigatórios
                    </DialogTitle>
                </DialogHeader>

                <div className="py-4 space-y-4">
                    <p className="text-sm text-gray-600">
                        {context === 'card-detail'
                            ? <>A etapa <strong className="text-gray-900">{targetStageName}</strong> exige os seguintes requisitos pendentes:</>
                            : <>Para mover para a etapa <strong className="text-gray-900">{targetStageName}</strong>, é necessário atender os seguintes requisitos:</>
                        }
                    </p>

                    {Array.from(grouped.entries()).map(([type, items]) => {
                        const config = TYPE_CONFIG[type] || FALLBACK_CONFIG

                        return (
                            <div key={type} className={`${config.bg} border ${config.border} rounded-lg p-4`}>
                                <div className={`flex items-center gap-2 mb-2 ${config.titleColor} font-medium text-sm`}>
                                    {createElement(config.icon, { className: 'w-4 h-4' })}
                                    {config.title}
                                </div>
                                <ul className="space-y-2">
                                    {items.map((item, idx) => {
                                        if (item.type === 'team_member' && item.required_team_role) {
                                            return (
                                                <li key={idx} className="flex items-center justify-between gap-3">
                                                    <div className={`flex items-center gap-2 text-sm ${config.text}`}>
                                                        <span className={`w-1.5 h-1.5 ${config.dot} rounded-full flex-shrink-0`} />
                                                        {item.label}
                                                    </div>
                                                    <div className="min-w-[180px]">
                                                        <OwnerSelector
                                                            value={null}
                                                            onChange={(userId) => {
                                                                if (!userId) return
                                                                assignOwnerMutation.mutate({
                                                                    role: item.required_team_role!,
                                                                    userId,
                                                                })
                                                            }}
                                                            phaseSlug={item.required_team_role}
                                                            placeholder="Selecionar…"
                                                            compact
                                                        />
                                                    </div>
                                                </li>
                                            )
                                        }

                                        return (
                                            <li
                                                key={idx}
                                                className={`flex items-center gap-2 text-sm ${config.text}`}
                                            >
                                                <span className={`w-1.5 h-1.5 ${config.dot} rounded-full flex-shrink-0`} />
                                                {item.label}
                                                {item.detail && (
                                                    <span className="text-xs opacity-70">({item.detail})</span>
                                                )}
                                            </li>
                                        )
                                    })}
                                </ul>
                            </div>
                        )
                    })}

                    {context === 'kanban' && remainingCount > 0 && (
                        <p className="text-xs text-gray-500">
                            Acesse a página do card para atender os requisitos necessários.
                        </p>
                    )}
                </div>

                <DialogFooter className="gap-2 sm:gap-0">
                    {context === 'card-detail' ? (
                        <Button
                            onClick={onClose}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white"
                        >
                            {remainingCount === 0 ? 'Fechar' : 'Entendi'}
                        </Button>
                    ) : (
                        <>
                            <Button variant="outline" onClick={onClose}>
                                Cancelar
                            </Button>
                            <Button
                                onClick={handleOpenCard}
                                className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2"
                            >
                                <ExternalLink className="w-4 h-4" />
                                Abrir Card
                            </Button>
                        </>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
