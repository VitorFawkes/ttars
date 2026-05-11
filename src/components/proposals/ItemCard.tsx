import { useState } from 'react'
import { useProposalBuilder } from '@/hooks/useProposalBuilder'
import { useSaveToLibrary, type LibraryCategory } from '@/hooks/useLibrary'
import { ITEM_TYPE_CONFIG } from '@/types/proposals'
import type { ProposalItemWithOptions } from '@/types/proposals'
import { toast } from 'sonner'
import {
    MoreVertical,
    Pencil,
    Trash2,
    Copy,
    Check,
    X,
    Library,
} from 'lucide-react'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import * as LucideIcons from 'lucide-react'

interface ItemCardProps {
    item: ProposalItemWithOptions
}

export function ItemCard({ item }: ItemCardProps) {
    const { updateItem, removeItem, duplicateItem, selectItem, selectedItemId } = useProposalBuilder()
    const saveToLibrary = useSaveToLibrary()
    const [isEditing, setIsEditing] = useState(false)
    const [editTitle, setEditTitle] = useState(item.title)

    const config = ITEM_TYPE_CONFIG[item.item_type]
    const IconComponent = (LucideIcons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[config.icon] || LucideIcons.Package
    const isSelected = selectedItemId === item.id

    const handleDelete = () => {
        if (confirm('Tem certeza que deseja remover este item?')) {
            removeItem(item.id)
        }
    }

    const handleSaveTitle = () => {
        updateItem(item.id, { title: editTitle })
        setIsEditing(false)
    }

    const handleCancelEdit = () => {
        setEditTitle(item.title)
        setIsEditing(false)
    }

    const formatPrice = (value: number | string) =>
        new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL',
        }).format(Number(value) || 0)

    const handleSaveToLibrary = async () => {
        // Map item_type to library category
        const categoryMap: Record<string, LibraryCategory> = {
            hotel: 'hotel',
            flight: 'flight',
            transfer: 'transfer',
            experience: 'experience',
            service: 'service',
            insurance: 'service',
            fee: 'service',
            custom: 'custom',
        }

        try {
            await saveToLibrary.mutateAsync({
                name: item.title,
                category: categoryMap[item.item_type] || 'custom',
                content: {
                    description: item.description || '',
                    ...((item.rich_content as Record<string, unknown>) || {}),
                },
                basePrice: Number(item.base_price) || 0,
            })
            toast.success('Item salvo na biblioteca!')
        } catch {
            toast.error('Erro ao salvar na biblioteca')
        }
    }

    return (
        <div
            className={`bg-slate-50 rounded-lg p-3 flex items-center gap-3 group transition-all hover:bg-slate-100 cursor-pointer ${isSelected ? 'ring-2 ring-blue-200 bg-blue-50' : ''
                }`}
            onClick={() => selectItem(item.id)}
        >
            {/* Icon */}
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${item.is_optional ? 'bg-amber-100 text-amber-600' : 'bg-blue-100 text-blue-600'
                }`}>
                <IconComponent className="h-4 w-4" />
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
                {isEditing ? (
                    <div className="flex items-center gap-2">
                        <input
                            type="text"
                            value={editTitle}
                            onChange={(e) => setEditTitle(e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSaveTitle()
                                if (e.key === 'Escape') handleCancelEdit()
                            }}
                            autoFocus
                            className="flex-1 px-2 py-1 text-sm border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-200"
                        />
                        <button
                            onClick={(e) => { e.stopPropagation(); handleSaveTitle() }}
                            className="p-1 text-green-600 hover:bg-green-50 rounded"
                        >
                            <Check className="h-4 w-4" />
                        </button>
                        <button
                            onClick={(e) => { e.stopPropagation(); handleCancelEdit() }}
                            className="p-1 text-slate-400 hover:bg-slate-100 rounded"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    </div>
                ) : (
                    <>
                        <p className="font-medium text-sm text-slate-900 truncate">{item.title}</p>
                        <div className="flex items-center gap-2 text-xs text-slate-500">
                            <span>{config.label}</span>
                            {item.is_optional && (
                                <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">
                                    Opcional
                                </span>
                            )}
                            {item.options.length > 0 && (
                                <span className="px-1.5 py-0.5 rounded bg-purple-100 text-purple-700">
                                    {item.options.length} opções
                                </span>
                            )}
                        </div>
                    </>
                )}
            </div>

            {/* Price */}
            <div className="text-right flex-shrink-0">
                <p className="font-semibold text-sm text-slate-900">
                    {formatPrice(item.base_price || 0)}
                </p>
            </div>

            {/* Actions */}
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <button
                        onClick={(e) => e.stopPropagation()}
                        className="p-1.5 rounded opacity-0 group-hover:opacity-100 hover:bg-slate-200 transition-all"
                    >
                        <MoreVertical className="h-4 w-4 text-slate-500" />
                    </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setIsEditing(true)}>
                        <Pencil className="h-4 w-4 mr-2" />
                        Editar
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => {
                        duplicateItem(item.id)
                        toast.success('Item duplicado!')
                    }}>
                        <Copy className="h-4 w-4 mr-2" />
                        Duplicar
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                        onClick={handleSaveToLibrary}
                        disabled={saveToLibrary.isPending}
                    >
                        <Library className="h-4 w-4 mr-2" />
                        {saveToLibrary.isPending ? 'Salvando...' : 'Salvar na Biblioteca'}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={handleDelete} className="text-red-600">
                        <Trash2 className="h-4 w-4 mr-2" />
                        Remover
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    )
}
