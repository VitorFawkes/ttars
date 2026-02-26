import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog'
import { Button } from '../ui/Button'
import { AlertTriangle, ExternalLink, FileText, FileCheck, CheckCircle2, LayoutList } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

interface QualityGateModalProps {
    isOpen: boolean
    onClose: () => void
    onConfirm: () => void // Keep for API compatibility but not used in new flow
    cardId: string
    targetStageName: string
    missingFields: { key: string, label: string }[]
    missingProposals?: { label: string, min_status: string }[]
    missingTasks?: { label: string, task_tipo: string, task_require_completed: boolean }[]
    missingDocuments?: { label: string, total: number, completed: number }[]
    initialData?: Record<string, unknown>  // Keep for API compatibility
}

const PROPOSAL_STATUS_LABELS: Record<string, string> = {
    'sent': 'Enviada',
    'viewed': 'Visualizada',
    'in_progress': 'Em Análise',
    'accepted': 'Aceita'
}

export default function QualityGateModal({
    isOpen,
    onClose,
    cardId,
    targetStageName,
    missingFields,
    missingProposals = [],
    missingTasks = [],
    missingDocuments = [],
}: QualityGateModalProps) {
    const navigate = useNavigate()

    const handleOpenCard = () => {
        onClose()
        navigate(`/cards/${cardId}`)
    }

    const hasFields = missingFields.length > 0
    const hasProposals = missingProposals.length > 0
    const hasTasks = missingTasks.length > 0
    const hasDocuments = missingDocuments.length > 0

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[450px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-amber-600">
                        <AlertTriangle className="h-5 w-5" />
                        Requisitos Obrigatórios
                    </DialogTitle>
                </DialogHeader>

                <div className="py-4 space-y-4">
                    <p className="text-sm text-gray-600">
                        Para mover para a etapa <strong className="text-gray-900">{targetStageName}</strong>,
                        é necessário atender os seguintes requisitos:
                    </p>

                    {/* Campos Obrigatórios */}
                    {hasFields && (
                        <div className="bg-blue-50 border border-blue-100 rounded-lg p-4">
                            <div className="flex items-center gap-2 mb-2 text-blue-700 font-medium text-sm">
                                <LayoutList className="w-4 h-4" />
                                Campos Obrigatórios
                            </div>
                            <ul className="space-y-1.5">
                                {missingFields.map(field => (
                                    <li
                                        key={field.key}
                                        className="flex items-center gap-2 text-sm text-blue-800"
                                    >
                                        <span className="w-1.5 h-1.5 bg-blue-500 rounded-full flex-shrink-0" />
                                        {field.label}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {/* Propostas Obrigatórias */}
                    {hasProposals && (
                        <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-4">
                            <div className="flex items-center gap-2 mb-2 text-emerald-700 font-medium text-sm">
                                <FileText className="w-4 h-4" />
                                Propostas Obrigatórias
                            </div>
                            <ul className="space-y-1.5">
                                {missingProposals.map((proposal, idx) => (
                                    <li
                                        key={idx}
                                        className="flex items-center gap-2 text-sm text-emerald-800"
                                    >
                                        <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full flex-shrink-0" />
                                        Proposta {PROPOSAL_STATUS_LABELS[proposal.min_status] || proposal.min_status}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {/* Tarefas Obrigatórias */}
                    {hasTasks && (
                        <div className="bg-purple-50 border border-purple-100 rounded-lg p-4">
                            <div className="flex items-center gap-2 mb-2 text-purple-700 font-medium text-sm">
                                <CheckCircle2 className="w-4 h-4" />
                                Tarefas Obrigatórias
                            </div>
                            <ul className="space-y-1.5">
                                {missingTasks.map((task, idx) => (
                                    <li
                                        key={idx}
                                        className="flex items-center gap-2 text-sm text-purple-800"
                                    >
                                        <span className="w-1.5 h-1.5 bg-purple-500 rounded-full flex-shrink-0" />
                                        {task.label} {task.task_require_completed ? '(concluída)' : '(criada)'}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {/* Documentos Obrigatórios */}
                    {hasDocuments && (
                        <div className="bg-teal-50 border border-teal-100 rounded-lg p-4">
                            <div className="flex items-center gap-2 mb-2 text-teal-700 font-medium text-sm">
                                <FileCheck className="w-4 h-4" />
                                Documentos Pendentes
                            </div>
                            <ul className="space-y-1.5">
                                {missingDocuments.map((doc, idx) => (
                                    <li
                                        key={idx}
                                        className="flex items-center gap-2 text-sm text-teal-800"
                                    >
                                        <span className="w-1.5 h-1.5 bg-teal-500 rounded-full flex-shrink-0" />
                                        {doc.label} ({doc.completed}/{doc.total} recebidos)
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    <p className="text-xs text-gray-500">
                        Acesse a página do card para atender os requisitos necessários.
                    </p>
                </div>

                <DialogFooter className="gap-2 sm:gap-0">
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
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
