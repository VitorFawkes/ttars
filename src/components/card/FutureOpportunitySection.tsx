import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
    CalendarClock,
    Plus,
    XCircle,
    ExternalLink,
    CheckCircle2,
    Clock,
    ChevronRight,
    AlertCircle
} from 'lucide-react'
import { useFutureOpportunities, type FutureOpportunity } from '@/hooks/useFutureOpportunities'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

interface FutureOpportunitySectionProps {
    cardId: string
    cardTitle: string
    produto?: string | null
    pipelineId?: string | null
    responsavelId?: string | null
    pessoaPrincipalId?: string | null
}

export default function FutureOpportunitySection({
    cardId,
    cardTitle,
    produto,
    pipelineId,
    responsavelId,
    pessoaPrincipalId
}: FutureOpportunitySectionProps) {
    const navigate = useNavigate()
    const {
        pending,
        executed,
        isLoading,
        create,
        isCreating,
        cancel,
        isCancelling
    } = useFutureOpportunities(cardId)

    const [showCreateModal, setShowCreateModal] = useState(false)
    const [expandedSection, setExpandedSection] = useState<'pending' | 'executed' | null>(
        'pending'
    )

    const total = pending.length + executed.length

    if (isLoading) return null
    if (total === 0 && !showCreateModal) {
        // Compact empty state with create button
        return (
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-2.5">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <CalendarClock className="w-4 h-4 text-gray-500" />
                        <h3 className="text-sm font-semibold text-gray-900">Oportunidades Futuras</h3>
                    </div>
                    <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setShowCreateModal(true)}
                        className="text-xs"
                    >
                        <Plus className="w-3 h-3 mr-1" />
                        Agendar
                    </Button>
                </div>

                <CreateFutureOpportunityModal
                    isOpen={showCreateModal}
                    onClose={() => setShowCreateModal(false)}
                    cardId={cardId}
                    cardTitle={cardTitle}
                    produto={produto}
                    pipelineId={pipelineId}
                    responsavelId={responsavelId}
                    pessoaPrincipalId={pessoaPrincipalId}
                    onCreate={create}
                    isCreating={isCreating}
                />
            </div>
        )
    }

    return (
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-2.5">
            <div className="space-y-3">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <CalendarClock className="w-4 h-4 text-gray-500" />
                        <h3 className="text-sm font-semibold text-gray-900">Oportunidades Futuras</h3>
                        {pending.length > 0 && (
                            <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-blue-100 text-blue-700">
                                {pending.length} agendada(s)
                            </span>
                        )}
                    </div>
                    <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setShowCreateModal(true)}
                        className="text-xs"
                    >
                        <Plus className="w-3 h-3 mr-1" />
                        Agendar
                    </Button>
                </div>

                {/* Pending */}
                {pending.length > 0 && (
                    <div className="space-y-2">
                        <button
                            onClick={() => setExpandedSection(expandedSection === 'pending' ? null : 'pending')}
                            className="flex items-center gap-1 text-xs font-medium text-gray-600 hover:text-gray-900"
                        >
                            <ChevronRight className={cn(
                                'w-3 h-3 transition-transform',
                                expandedSection === 'pending' && 'rotate-90'
                            )} />
                            Agendadas ({pending.length})
                        </button>

                        {expandedSection === 'pending' && (
                            <div className="space-y-2 pl-4">
                                {pending.map(opp => (
                                    <PendingItem
                                        key={opp.id}
                                        opportunity={opp}
                                        onCancel={() => {
                                            if (confirm('Cancelar esta oportunidade futura?')) {
                                                cancel(opp.id)
                                            }
                                        }}
                                        isCancelling={isCancelling}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Executed */}
                {executed.length > 0 && (
                    <div className="space-y-2">
                        <button
                            onClick={() => setExpandedSection(expandedSection === 'executed' ? null : 'executed')}
                            className="flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-700"
                        >
                            <ChevronRight className={cn(
                                'w-3 h-3 transition-transform',
                                expandedSection === 'executed' && 'rotate-90'
                            )} />
                            Executadas ({executed.length})
                        </button>

                        {expandedSection === 'executed' && (
                            <div className="space-y-2 pl-4">
                                {executed.map(opp => (
                                    <ExecutedItem
                                        key={opp.id}
                                        opportunity={opp}
                                        onNavigate={() => opp.created_card_id && navigate(`/cards/${opp.created_card_id}`)}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>

            <CreateFutureOpportunityModal
                isOpen={showCreateModal}
                onClose={() => setShowCreateModal(false)}
                cardId={cardId}
                cardTitle={cardTitle}
                produto={produto}
                pipelineId={pipelineId}
                responsavelId={responsavelId}
                pessoaPrincipalId={pessoaPrincipalId}
                onCreate={create}
                isCreating={isCreating}
            />
        </div>
    )
}

// ═══════════════════════════════════════════════════════════
// Sub-components
// ═══════════════════════════════════════════════════════════

function PendingItem({
    opportunity,
    onCancel,
    isCancelling
}: {
    opportunity: FutureOpportunity
    onCancel: () => void
    isCancelling: boolean
}) {
    return (
        <div className="p-3 rounded-lg border-l-4 border-l-blue-500 bg-white border shadow-sm">
            <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                        <CalendarClock className="w-3 h-3 text-blue-500 flex-shrink-0" />
                        <span className="text-sm font-medium text-gray-900 truncate">
                            {opportunity.titulo}
                        </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                        <Clock className="w-3 h-3" />
                        <span>{formatDate(opportunity.scheduled_date)}</span>
                        {opportunity.sub_card_mode && opportunity.source_type === 'won_future' && (
                            <span className={cn(
                                'px-1.5 py-0.5 rounded text-xs font-medium',
                                opportunity.sub_card_mode === 'incremental'
                                    ? 'bg-orange-100 text-orange-700'
                                    : 'bg-blue-100 text-blue-700'
                            )}>
                                {opportunity.sub_card_mode === 'incremental' ? 'Somar valor' : 'Substituir'}
                            </span>
                        )}
                    </div>
                    {opportunity.descricao && (
                        <p className="text-xs text-gray-400 mt-1 line-clamp-2">{opportunity.descricao}</p>
                    )}
                </div>
                <button
                    onClick={onCancel}
                    disabled={isCancelling}
                    className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded disabled:opacity-50"
                    title="Cancelar agendamento"
                >
                    <XCircle className="w-4 h-4" />
                </button>
            </div>
        </div>
    )
}

function ExecutedItem({
    opportunity,
    onNavigate
}: {
    opportunity: FutureOpportunity
    onNavigate: () => void
}) {
    return (
        <div
            className="p-2 rounded-lg border border-green-200 bg-gray-50 cursor-pointer hover:bg-gray-100 transition-colors"
            onClick={onNavigate}
        >
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-3 h-3 text-green-500" />
                    <span className="text-sm text-gray-600 truncate">{opportunity.titulo}</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                    <span className="text-gray-400">{formatDate(opportunity.scheduled_date)}</span>
                    {opportunity.created_card_id && (
                        <ExternalLink className="w-3 h-3 text-gray-400" />
                    )}
                </div>
            </div>
        </div>
    )
}

// ═══════════════════════════════════════════════════════════
// Create Modal
// ═══════════════════════════════════════════════════════════

interface CreateModalProps {
    isOpen: boolean
    onClose: () => void
    cardId: string
    cardTitle: string
    produto?: string | null
    pipelineId?: string | null
    responsavelId?: string | null
    pessoaPrincipalId?: string | null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onCreate: (...args: any[]) => void
    isCreating: boolean
}

function CreateFutureOpportunityModal({
    isOpen,
    onClose,
    cardId,
    cardTitle,
    produto,
    pipelineId,
    responsavelId,
    pessoaPrincipalId,
    onCreate,
    isCreating
}: CreateModalProps) {
    const [titulo, setTitulo] = useState('')
    const [descricao, setDescricao] = useState('')
    const [scheduledDate, setScheduledDate] = useState('')
    const [mode, setMode] = useState<'incremental' | 'complete'>('incremental')
    const [errors, setErrors] = useState<Record<string, string>>({})

    const minDate = useMemo(() => {
        const d = new Date()
        d.setDate(d.getDate() + 1)
        return d.toISOString().split('T')[0]
    }, [])

    const handleSubmit = () => {
        const newErrors: Record<string, string> = {}
        if (!titulo.trim()) newErrors.titulo = 'Título é obrigatório'
        if (!scheduledDate) newErrors.date = 'Data é obrigatória'
        if (!descricao.trim()) newErrors.descricao = 'Descrição é obrigatória'

        if (Object.keys(newErrors).length > 0) {
            setErrors(newErrors)
            return
        }

        onCreate(
            {
                sourceCardId: cardId,
                sourceType: 'won_future',
                titulo: titulo.trim(),
                descricao: descricao.trim(),
                scheduledDate,
                subCardMode: mode,
                produto,
                pipelineId,
                responsavelId,
                pessoaPrincipalId,
            },
            {
                onSuccess: () => handleClose()
            }
        )
    }

    const handleClose = () => {
        setTitulo('')
        setDescricao('')
        setScheduledDate('')
        setMode('incremental')
        setErrors({})
        onClose()
    }

    return (
        <Dialog open={isOpen} onOpenChange={handleClose}>
            <DialogContent className="sm:max-w-[520px] bg-white border-gray-200">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-xl text-gray-900">
                        <CalendarClock className="w-5 h-5 text-blue-500" />
                        Agendar Sub-Card Futuro
                    </DialogTitle>
                    <p className="text-sm text-gray-500 mt-1">
                        Vinculado a: <span className="font-medium text-gray-700">{cardTitle}</span>
                    </p>
                </DialogHeader>

                <div className="space-y-5 py-4">
                    {/* Info box */}
                    <div className="p-3 rounded-lg bg-blue-50 text-blue-800 border border-blue-200 text-sm">
                        <span className="font-semibold">Agendamento automático:</span> Um sub-card será criado
                        automaticamente em "Proposta em Construção" na data escolhida, vinculado a este card.
                    </div>

                    {/* Mode Selection */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-3">
                            Tipo de alteração futura
                        </label>
                        <div className="grid grid-cols-2 gap-3">
                            <button
                                type="button"
                                onClick={() => setMode('incremental')}
                                className={cn(
                                    'relative p-3 rounded-lg border-2 text-left transition-all',
                                    mode === 'incremental'
                                        ? 'border-orange-500 bg-orange-50'
                                        : 'border-gray-200 hover:border-gray-300 bg-white'
                                )}
                            >
                                <div className="flex items-start gap-2">
                                    <Plus className={cn(
                                        'w-4 h-4 mt-0.5 flex-shrink-0',
                                        mode === 'incremental' ? 'text-orange-500' : 'text-gray-400'
                                    )} />
                                    <div>
                                        <p className={cn(
                                            'font-semibold text-sm',
                                            mode === 'incremental' ? 'text-orange-700' : 'text-gray-700'
                                        )}>
                                            Adicionar item
                                        </p>
                                        <p className="text-xs text-gray-500 mt-0.5">
                                            Valor será somado ao card
                                        </p>
                                    </div>
                                </div>
                            </button>

                            <button
                                type="button"
                                onClick={() => setMode('complete')}
                                className={cn(
                                    'relative p-3 rounded-lg border-2 text-left transition-all',
                                    mode === 'complete'
                                        ? 'border-blue-500 bg-blue-50'
                                        : 'border-gray-200 hover:border-gray-300 bg-white'
                                )}
                            >
                                <div className="flex items-start gap-2">
                                    <CalendarClock className={cn(
                                        'w-4 h-4 mt-0.5 flex-shrink-0',
                                        mode === 'complete' ? 'text-blue-500' : 'text-gray-400'
                                    )} />
                                    <div>
                                        <p className={cn(
                                            'font-semibold text-sm',
                                            mode === 'complete' ? 'text-blue-700' : 'text-gray-700'
                                        )}>
                                            Refazer proposta
                                        </p>
                                        <p className="text-xs text-gray-500 mt-0.5">
                                            Valor substituirá o card
                                        </p>
                                    </div>
                                </div>
                            </button>
                        </div>
                    </div>

                    {/* Title */}
                    <div>
                        <Label className="flex items-center gap-1">
                            Título <span className="text-red-500">*</span>
                        </Label>
                        <Input
                            type="text"
                            value={titulo}
                            onChange={(e) => {
                                setTitulo(e.target.value)
                                if (errors.titulo) setErrors(prev => ({ ...prev, titulo: '' }))
                            }}
                            placeholder="Ex: Passagem aérea — Família Silva"
                            className={cn(errors.titulo && 'border-red-500')}
                        />
                        {errors.titulo && (
                            <p className="text-red-500 text-xs mt-1 flex items-center gap-1">
                                <AlertCircle className="w-3 h-3" /> {errors.titulo}
                            </p>
                        )}
                    </div>

                    {/* Description */}
                    <div>
                        <Label className="flex items-center gap-1">
                            Descrição <span className="text-red-500">*</span>
                        </Label>
                        <Textarea
                            value={descricao}
                            onChange={(e) => {
                                setDescricao(e.target.value)
                                if (errors.descricao) setErrors(prev => ({ ...prev, descricao: '' }))
                            }}
                            placeholder="Descreva o que o cliente vai querer fechar..."
                            rows={3}
                            className={cn(errors.descricao && 'border-red-500')}
                        />
                        {errors.descricao && (
                            <p className="text-red-500 text-xs mt-1 flex items-center gap-1">
                                <AlertCircle className="w-3 h-3" /> {errors.descricao}
                            </p>
                        )}
                    </div>

                    {/* Scheduled Date */}
                    <div>
                        <Label className="flex items-center gap-1">
                            Data para criação do card <span className="text-red-500">*</span>
                        </Label>
                        <Input
                            type="date"
                            value={scheduledDate}
                            onChange={(e) => {
                                setScheduledDate(e.target.value)
                                if (errors.date) setErrors(prev => ({ ...prev, date: '' }))
                            }}
                            min={minDate}
                            className={cn(errors.date && 'border-red-500')}
                        />
                        {errors.date && (
                            <p className="text-red-500 text-xs mt-1 flex items-center gap-1">
                                <AlertCircle className="w-3 h-3" /> {errors.date}
                            </p>
                        )}
                        <p className="text-xs text-gray-500 mt-1">
                            O sub-card será criado automaticamente nesta data
                        </p>
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={handleClose} disabled={isCreating}>
                        Cancelar
                    </Button>
                    <Button
                        onClick={handleSubmit}
                        disabled={isCreating}
                        className={cn(
                            'text-white',
                            mode === 'incremental'
                                ? 'bg-orange-600 hover:bg-orange-700'
                                : 'bg-blue-600 hover:bg-blue-700'
                        )}
                    >
                        {isCreating ? 'Agendando...' : 'Agendar Sub-Card'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

// ═══════════════════════════════════════════════════════════
// Utilities
// ═══════════════════════════════════════════════════════════

function formatDate(dateStr: string): string {
    const [year, month, day] = dateStr.split('-')
    return `${day}/${month}/${year}`
}
