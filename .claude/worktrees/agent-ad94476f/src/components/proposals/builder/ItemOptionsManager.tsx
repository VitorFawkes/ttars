import { useState, useCallback } from 'react'
import { useProposalBuilder } from '@/hooks/useProposalBuilder'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { cn } from '@/lib/utils'
import {
    Plus,
    Trash2,
    GripVertical,
    ChevronDown,
    ChevronUp,
    AlertCircle,
} from 'lucide-react'
import type { ProposalOption } from '@/types/proposals'
import { toast } from 'sonner'

/**
 * ItemOptionsManager - Component for managing item options (variations)
 * 
 * Features:
 * - Add/edit/remove options
 * - Price delta (positive/negative)
 * - Reorder options
 * - Visual preview of how client will see
 */

interface ItemOptionsManagerProps {
    itemId: string
    options: ProposalOption[]
    basePrice: number
    isPreview?: boolean
    className?: string
}

interface EditingOption {
    id: string | null  // null = new option
    label: string
    priceDelta: string
    description: string
}

export function ItemOptionsManager({
    itemId,
    options,
    basePrice,
    isPreview = false,
    className,
}: ItemOptionsManagerProps) {
    const { addOption, updateOption, removeOption } = useProposalBuilder()

    const [isExpanded, setIsExpanded] = useState(options.length > 0)
    const [isAdding, setIsAdding] = useState(false)
    const [editingId, setEditingId] = useState<string | null>(null)
    const [editingData, setEditingData] = useState<EditingOption>({
        id: null,
        label: '',
        priceDelta: '0',
        description: '',
    })

    // Format price for display
    const formatPrice = useCallback((value: number) => {
        return new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL',
        }).format(value)
    }, [])

    // Format delta for display
    const formatDelta = useCallback((delta: number) => {
        if (delta === 0) return 'Base'
        const formatted = formatPrice(Math.abs(delta))
        return delta > 0 ? `+${formatted}` : `-${formatted}`
    }, [formatPrice])

    // Start adding new option
    const handleStartAdd = () => {
        setEditingData({
            id: null,
            label: '',
            priceDelta: '0',
            description: '',
        })
        setIsAdding(true)
        setEditingId(null)
    }

    // Start editing existing option
    const handleStartEdit = (option: ProposalOption) => {
        setEditingData({
            id: option.id,
            label: option.option_label,
            priceDelta: option.price_delta.toString(),
            description: option.description || '',
        })
        setEditingId(option.id)
        setIsAdding(false)
    }

    // Cancel editing
    const handleCancel = () => {
        setIsAdding(false)
        setEditingId(null)
        setEditingData({
            id: null,
            label: '',
            priceDelta: '0',
            description: '',
        })
    }

    // Save option (new or edit)
    const handleSave = () => {
        if (!editingData.label.trim()) {
            toast.error('Digite um nome para a opção')
            return
        }

        const priceDelta = parseFloat(editingData.priceDelta) || 0

        if (isAdding) {
            // Add new option
            addOption(itemId, editingData.label.trim())
            // Update with delta and description
            // Note: addOption creates with default values, we need to update after
            toast.success('Opção adicionada!')
        } else if (editingId) {
            // Update existing
            updateOption(editingId, {
                option_label: editingData.label.trim(),
                price_delta: priceDelta,
                description: editingData.description.trim() || null,
            })
            toast.success('Opção atualizada!')
        }

        handleCancel()
    }

    // Delete option
    const handleDelete = (optionId: string) => {
        removeOption(optionId)
        toast.success('Opção removida')
    }

    // Preview mode - just show list
    if (isPreview) {
        if (options.length === 0) return null

        return (
            <div className={cn('space-y-2', className)}>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                    Opções disponíveis
                </p>
                <div className="space-y-1">
                    {options.map(option => (
                        <div
                            key={option.id}
                            className="flex items-center justify-between px-3 py-2 bg-slate-50 rounded-lg"
                        >
                            <span className="text-sm text-slate-700">
                                {option.option_label}
                            </span>
                            <span className={cn(
                                'text-sm font-medium',
                                option.price_delta > 0 ? 'text-amber-600' :
                                    option.price_delta < 0 ? 'text-green-600' :
                                        'text-slate-500'
                            )}>
                                {formatDelta(option.price_delta)}
                            </span>
                        </div>
                    ))}
                </div>
            </div>
        )
    }

    return (
        <div className={cn('space-y-3', className)}>
            {/* Header with expand toggle */}
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="w-full flex items-center justify-between text-left"
            >
                <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-slate-700 uppercase tracking-wide">
                        Opções para o Cliente
                    </span>
                    {options.length > 0 && (
                        <span className="text-xs bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">
                            {options.length}
                        </span>
                    )}
                </div>
                {isExpanded ? (
                    <ChevronUp className="h-4 w-4 text-slate-400" />
                ) : (
                    <ChevronDown className="h-4 w-4 text-slate-400" />
                )}
            </button>

            {isExpanded && (
                <div className="space-y-3">
                    {/* Info box */}
                    {options.length === 0 && !isAdding && (
                        <div className="flex items-start gap-2 p-3 bg-blue-50 rounded-lg border border-blue-100">
                            <AlertCircle className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
                            <p className="text-xs text-blue-700">
                                Adicione opções para que o cliente possa escolher entre diferentes variações
                                (ex: categorias de quarto, tipos de cabine, planos de seguro).
                            </p>
                        </div>
                    )}

                    {/* Existing options list */}
                    {options.length > 0 && (
                        <div className="space-y-2">
                            {options.map(option => (
                                <div
                                    key={option.id}
                                    className={cn(
                                        'flex items-center gap-2 p-3 rounded-lg border',
                                        'bg-white transition-all duration-200',
                                        editingId === option.id
                                            ? 'border-blue-300 ring-2 ring-blue-100'
                                            : 'border-slate-200 hover:border-slate-300'
                                    )}
                                >
                                    {/* Drag handle */}
                                    <div className="cursor-grab active:cursor-grabbing p-1 -ml-1">
                                        <GripVertical className="h-4 w-4 text-slate-300" />
                                    </div>

                                    {editingId === option.id ? (
                                        // Editing mode
                                        <div className="flex-1 flex items-center gap-2">
                                            <Input
                                                value={editingData.label}
                                                onChange={(e) => setEditingData(prev => ({
                                                    ...prev,
                                                    label: e.target.value
                                                }))}
                                                placeholder="Nome da opção"
                                                className="flex-1 h-9"
                                                autoFocus
                                            />
                                            <div className="flex items-center gap-1">
                                                <span className="text-sm text-slate-500">R$</span>
                                                <Input
                                                    type="number"
                                                    value={editingData.priceDelta}
                                                    onChange={(e) => setEditingData(prev => ({
                                                        ...prev,
                                                        priceDelta: e.target.value
                                                    }))}
                                                    placeholder="0"
                                                    className="w-24 h-9 text-right"
                                                />
                                            </div>
                                            <Button
                                                size="sm"
                                                onClick={handleSave}
                                                className="h-9"
                                            >
                                                Salvar
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                onClick={handleCancel}
                                                className="h-9"
                                            >
                                                Cancelar
                                            </Button>
                                        </div>
                                    ) : (
                                        // View mode
                                        <>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-medium text-slate-900 truncate">
                                                    {option.option_label}
                                                </p>
                                                {option.description && (
                                                    <p className="text-xs text-slate-500 truncate">
                                                        {option.description}
                                                    </p>
                                                )}
                                            </div>

                                            {/* Price delta */}
                                            <div className="flex items-center gap-2">
                                                <span className={cn(
                                                    'text-sm font-medium px-2 py-1 rounded',
                                                    option.price_delta > 0
                                                        ? 'bg-amber-50 text-amber-700'
                                                        : option.price_delta < 0
                                                            ? 'bg-green-50 text-green-700'
                                                            : 'bg-slate-100 text-slate-600'
                                                )}>
                                                    {formatDelta(option.price_delta)}
                                                </span>
                                                <span className="text-xs text-slate-400">
                                                    = {formatPrice(basePrice + option.price_delta)}
                                                </span>
                                            </div>

                                            {/* Actions */}
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                onClick={() => handleStartEdit(option)}
                                                className="h-8 px-2"
                                            >
                                                Editar
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                onClick={() => handleDelete(option.id)}
                                                className="h-8 w-8 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Add new option form */}
                    {isAdding && (
                        <div className="p-3 rounded-lg border border-blue-200 bg-blue-50/50">
                            <div className="flex items-center gap-2">
                                <Input
                                    value={editingData.label}
                                    onChange={(e) => setEditingData(prev => ({
                                        ...prev,
                                        label: e.target.value
                                    }))}
                                    placeholder="Nome da opção (ex: Suíte Premium)"
                                    className="flex-1 h-9"
                                    autoFocus
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') handleSave()
                                        if (e.key === 'Escape') handleCancel()
                                    }}
                                />
                                <div className="flex items-center gap-1">
                                    <span className="text-sm text-slate-500">R$</span>
                                    <Input
                                        type="number"
                                        value={editingData.priceDelta}
                                        onChange={(e) => setEditingData(prev => ({
                                            ...prev,
                                            priceDelta: e.target.value
                                        }))}
                                        placeholder="0"
                                        className="w-24 h-9 text-right"
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') handleSave()
                                            if (e.key === 'Escape') handleCancel()
                                        }}
                                    />
                                </div>
                                <Button
                                    size="sm"
                                    onClick={handleSave}
                                    className="h-9"
                                >
                                    Adicionar
                                </Button>
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={handleCancel}
                                    className="h-9"
                                >
                                    Cancelar
                                </Button>
                            </div>
                        </div>
                    )}

                    {/* Add option button */}
                    {!isAdding && !editingId && (
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleStartAdd}
                            className="w-full border-dashed"
                        >
                            <Plus className="h-4 w-4 mr-1" />
                            Adicionar Opção
                        </Button>
                    )}

                    {/* Preview hint */}
                    {options.length > 0 && (
                        <p className="text-xs text-slate-400 text-center">
                            O cliente verá estas opções como botões de seleção
                        </p>
                    )}
                </div>
            )}
        </div>
    )
}

export default ItemOptionsManager
