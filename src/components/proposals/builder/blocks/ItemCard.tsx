import { useState, useCallback } from 'react'
import { cn } from '@/lib/utils'
import {
    GripVertical,
    Trash2,
    Copy,
    Pencil,
    ChevronDown,
    ChevronUp,
    Check,
    X,
} from 'lucide-react'
import type { ProposalItemWithOptions } from '@/types/proposals'
import { ItemImageUploader } from '../ItemImageUploader'
import { ItemOptionsManager } from '../ItemOptionsManager'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/textarea'

/**
 * ItemCard - Enhanced card for proposal items (flights, hotels, etc)
 * 
 * Features:
 * - Expandable card with full editing
 * - Inline title/description editing
 * - Price editing
 * - Optional toggle
 * - Default selected toggle
 * - Image upload/URL
 * - Options management
 */
interface ItemCardProps {
    item: ProposalItemWithOptions
    sectionType: string
    isPreview?: boolean
    isSelected?: boolean
    onUpdate?: (updates: Partial<ProposalItemWithOptions>) => void
    onDuplicate?: () => void
    onDelete?: () => void
}

export function ItemCard({
    item,
    sectionType,
    isPreview,
    isSelected,
    onUpdate,
    onDuplicate,
    onDelete,
}: ItemCardProps) {
    const [isExpanded, setIsExpanded] = useState(false)
    const [isEditingTitle, setIsEditingTitle] = useState(false)
    const [isEditingPrice, setIsEditingPrice] = useState(false)
    const [isEditingDescription, setIsEditingDescription] = useState(false)
    const [localTitle, setLocalTitle] = useState(item.title)
    const [localPrice, setLocalPrice] = useState(item.base_price.toString())
    const [localDescription, setLocalDescription] = useState(item.description || '')

    // Format price
    const formatPrice = useCallback((value: number) => {
        return new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL',
        }).format(value)
    }, [])

    const handleTitleSave = useCallback(() => {
        if (localTitle !== item.title) {
            onUpdate?.({ title: localTitle })
        }
        setIsEditingTitle(false)
    }, [localTitle, item.title, onUpdate])

    const handlePriceSave = useCallback(() => {
        const newPrice = parseFloat(localPrice) || 0
        if (newPrice !== item.base_price) {
            onUpdate?.({ base_price: newPrice })
        }
        setIsEditingPrice(false)
    }, [localPrice, item.base_price, onUpdate])

    const handleDescriptionSave = useCallback(() => {
        if (localDescription !== item.description) {
            onUpdate?.({ description: localDescription || null })
        }
        setIsEditingDescription(false)
    }, [localDescription, item.description, onUpdate])

    const toggleOptional = useCallback(() => {
        onUpdate?.({ is_optional: !item.is_optional })
    }, [item.is_optional, onUpdate])

    const toggleDefaultSelected = useCallback(() => {
        onUpdate?.({ is_default_selected: !item.is_default_selected })
    }, [item.is_default_selected, onUpdate])

    const handleImageChange = useCallback((url: string | null) => {
        // Update via rich_content since image_url might not be in the type
        const richContent = (item.rich_content as Record<string, unknown>) || {}
        onUpdate?.({
            rich_content: { ...richContent, image_url: url } as any
        })
    }, [item.rich_content, onUpdate])

    // Get image URL from rich_content
    const imageUrl = ((item.rich_content as Record<string, unknown>)?.image_url as string) || null

    // Section emoji for fallback
    const sectionEmoji = sectionType === 'flights' ? '✈️' :
        sectionType === 'hotels' ? '🏨' :
            sectionType === 'experiences' ? '⭐' : '🚗'

    // Preview mode
    if (isPreview) {
        return (
            <div className={cn(
                'flex items-center gap-4 p-4 rounded-xl border border-slate-200',
                'bg-white transition-colors'
            )}>
                {/* Image */}
                <div className="w-16 h-16 rounded-lg bg-slate-100 flex-shrink-0 overflow-hidden">
                    {imageUrl ? (
                        <img
                            src={imageUrl}
                            alt={item.title}
                            className="w-full h-full object-cover"
                        />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center text-slate-400 text-2xl">
                            {sectionEmoji}
                        </div>
                    )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-semibold text-slate-900 truncate">
                        {item.title}
                    </h4>
                    {item.description && (
                        <p className="text-xs text-slate-500 line-clamp-1 mt-0.5">
                            {item.description}
                        </p>
                    )}
                </div>

                {/* Price */}
                <div className="text-right flex-shrink-0">
                    <p className="text-sm font-semibold text-slate-900">
                        {formatPrice(item.base_price)}
                    </p>
                    <div className="flex gap-1 mt-1">
                        {item.is_optional && (
                            <span className="text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
                                Opcional
                            </span>
                        )}
                        {item.options.length > 0 && (
                            <span className="text-xs text-purple-600 bg-purple-50 px-2 py-0.5 rounded">
                                {item.options.length} opções
                            </span>
                        )}
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div
            className={cn(
                'group relative rounded-xl border bg-white transition-all duration-200',
                isSelected
                    ? 'border-blue-500 ring-2 ring-blue-100'
                    : 'border-slate-200 hover:border-slate-300',
                isExpanded && 'shadow-lg'
            )}
        >
            {/* Collapsed Header */}
            <div
                className={cn(
                    'flex items-start gap-3 p-3 cursor-pointer',
                    isExpanded && 'border-b border-slate-100'
                )}
                onClick={() => !isExpanded && setIsExpanded(true)}
            >
                {/* Drag Handle */}
                <div className="flex-shrink-0 mt-1 cursor-grab active:cursor-grabbing">
                    <GripVertical className="h-4 w-4 text-slate-300" />
                </div>

                {/* Image Thumbnail */}
                <div className="w-14 h-14 rounded-lg bg-slate-100 flex-shrink-0 overflow-hidden">
                    {imageUrl ? (
                        <img
                            src={imageUrl}
                            alt={item.title}
                            className="w-full h-full object-cover"
                        />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center text-slate-400 text-xl">
                            {sectionEmoji}
                        </div>
                    )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                    {/* Title */}
                    {isEditingTitle ? (
                        <div className="flex items-center gap-1">
                            <Input
                                value={localTitle}
                                onChange={(e) => setLocalTitle(e.target.value)}
                                onBlur={handleTitleSave}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleTitleSave()
                                    if (e.key === 'Escape') {
                                        setLocalTitle(item.title)
                                        setIsEditingTitle(false)
                                    }
                                }}
                                className="h-7 text-sm font-semibold"
                                autoFocus
                                onClick={(e) => e.stopPropagation()}
                            />
                            <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 w-7 p-0"
                                onClick={(e) => { e.stopPropagation(); handleTitleSave() }}
                            >
                                <Check className="h-4 w-4" />
                            </Button>
                            <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 w-7 p-0"
                                onClick={(e) => {
                                    e.stopPropagation()
                                    setLocalTitle(item.title)
                                    setIsEditingTitle(false)
                                }}
                            >
                                <X className="h-4 w-4" />
                            </Button>
                        </div>
                    ) : (
                        <h4
                            onClick={(e) => { e.stopPropagation(); setIsEditingTitle(true) }}
                            className="text-sm font-semibold text-slate-900 truncate cursor-text hover:text-blue-600 group/title"
                        >
                            {item.title}
                            <Pencil className="inline h-3 w-3 ml-1 opacity-0 group-hover/title:opacity-50" />
                        </h4>
                    )}

                    {/* Description Preview */}
                    {item.description && (
                        <p className="text-xs text-slate-500 line-clamp-1 mt-0.5">
                            {item.description}
                        </p>
                    )}

                    {/* Tags */}
                    <div className="flex items-center gap-2 mt-2">
                        <button
                            onClick={(e) => { e.stopPropagation(); toggleOptional() }}
                            className={cn(
                                'text-xs px-2 py-0.5 rounded border transition-colors',
                                item.is_optional
                                    ? 'bg-blue-50 border-blue-200 text-blue-600'
                                    : 'bg-slate-50 border-slate-200 text-slate-500'
                            )}
                        >
                            {item.is_optional ? 'Opcional' : 'Obrigatório'}
                        </button>

                        {item.is_optional && (
                            <button
                                onClick={(e) => { e.stopPropagation(); toggleDefaultSelected() }}
                                className={cn(
                                    'text-xs px-2 py-0.5 rounded border transition-colors',
                                    item.is_default_selected
                                        ? 'bg-green-50 border-green-200 text-green-600'
                                        : 'bg-slate-50 border-slate-200 text-slate-500'
                                )}
                            >
                                {item.is_default_selected ? 'Pré-selecionado' : 'Não selecionado'}
                            </button>
                        )}

                        {item.options.length > 0 && (
                            <span className="text-xs text-purple-500">
                                {item.options.length} opções
                            </span>
                        )}
                    </div>
                </div>

                {/* Price */}
                <div className="text-right flex-shrink-0">
                    {isEditingPrice ? (
                        <div className="flex items-center gap-1">
                            <span className="text-sm text-slate-500">R$</span>
                            <Input
                                type="number"
                                value={localPrice}
                                onChange={(e) => setLocalPrice(e.target.value)}
                                onBlur={handlePriceSave}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') handlePriceSave()
                                    if (e.key === 'Escape') {
                                        setLocalPrice(item.base_price.toString())
                                        setIsEditingPrice(false)
                                    }
                                }}
                                className="w-24 h-7 text-sm font-semibold text-right"
                                autoFocus
                                onClick={(e) => e.stopPropagation()}
                            />
                        </div>
                    ) : (
                        <p
                            onClick={(e) => { e.stopPropagation(); setIsEditingPrice(true) }}
                            className="text-sm font-semibold text-slate-900 cursor-text hover:text-blue-600"
                        >
                            {formatPrice(item.base_price)}
                        </p>
                    )}
                </div>

                {/* Expand/Collapse Button */}
                <Button
                    size="sm"
                    variant="ghost"
                    onClick={(e) => { e.stopPropagation(); setIsExpanded(!isExpanded) }}
                    className="h-8 w-8 p-0"
                >
                    {isExpanded ? (
                        <ChevronUp className="h-4 w-4" />
                    ) : (
                        <ChevronDown className="h-4 w-4" />
                    )}
                </Button>

                {/* Actions */}
                <div className={cn(
                    'flex items-center gap-1',
                    !isExpanded && 'opacity-0 group-hover:opacity-100 transition-opacity'
                )}>
                    <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => { e.stopPropagation(); onDuplicate?.() }}
                        className="h-8 w-8 p-0"
                        title="Duplicar"
                    >
                        <Copy className="h-4 w-4" />
                    </Button>
                    <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => { e.stopPropagation(); onDelete?.() }}
                        className="h-8 w-8 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                        title="Remover"
                    >
                        <Trash2 className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            {/* Expanded Content */}
            {isExpanded && (
                <div className="p-4 space-y-6">
                    {/* Image Section */}
                    <div>
                        <h5 className="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-2">
                            Imagem
                        </h5>
                        <ItemImageUploader
                            imageUrl={imageUrl}
                            onImageChange={handleImageChange}
                            itemId={item.id}
                        />
                    </div>

                    {/* Description Section */}
                    <div>
                        <h5 className="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-2">
                            Descrição
                        </h5>
                        {isEditingDescription ? (
                            <div className="space-y-2">
                                <Textarea
                                    value={localDescription}
                                    onChange={(e) => setLocalDescription(e.target.value)}
                                    placeholder="Descreva o item para o cliente..."
                                    className="min-h-[100px]"
                                    autoFocus
                                />
                                <div className="flex gap-2">
                                    <Button
                                        size="sm"
                                        onClick={handleDescriptionSave}
                                    >
                                        Salvar
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => {
                                            setLocalDescription(item.description || '')
                                            setIsEditingDescription(false)
                                        }}
                                    >
                                        Cancelar
                                    </Button>
                                </div>
                            </div>
                        ) : (
                            <div
                                onClick={() => setIsEditingDescription(true)}
                                className={cn(
                                    'p-3 rounded-lg border border-dashed cursor-text',
                                    'hover:border-slate-300 hover:bg-slate-50 transition-colors',
                                    item.description
                                        ? 'border-slate-200 bg-white'
                                        : 'border-slate-200 bg-slate-50'
                                )}
                            >
                                {item.description ? (
                                    <p className="text-sm text-slate-700 whitespace-pre-wrap">
                                        {item.description}
                                    </p>
                                ) : (
                                    <p className="text-sm text-slate-400">
                                        Clique para adicionar uma descrição...
                                    </p>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Options Section */}
                    <ItemOptionsManager
                        itemId={item.id}
                        options={item.options}
                        basePrice={item.base_price}
                    />

                    {/* Client Preview Hint */}
                    <div className="pt-4 border-t border-slate-100">
                        <p className="text-xs text-slate-400 text-center">
                            💡 Clique em "Preview" no header para ver como o cliente verá este item
                        </p>
                    </div>
                </div>
            )}
        </div>
    )
}

export default ItemCard
