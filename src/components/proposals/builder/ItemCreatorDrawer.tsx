import { useState, useCallback } from 'react'
import { useProposalBuilder } from '@/hooks/useProposalBuilder'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import {
    X,
    Plus,
    Loader2,
    Save,
    Library,
    ArrowRight,
} from 'lucide-react'
import { ItemImageUploader } from './ItemImageUploader'
import type { ProposalItemType } from '@/types/proposals'
import { toast } from 'sonner'

/**
 * ItemCreatorDrawer - Slide-out drawer for creating new proposal items
 * 
 * Features:
 * - Slide from right (not modal)
 * - Title, Description, Price fields
 * - Image upload/URL
 * - Option to save to library
 * - Add to proposal
 */

interface ItemCreatorDrawerProps {
    isOpen: boolean
    onClose: () => void
    sectionId: string
    itemType: ProposalItemType
    defaultTitle?: string
}

export function ItemCreatorDrawer({
    isOpen,
    onClose,
    sectionId,
    itemType,
    defaultTitle = '',
}: ItemCreatorDrawerProps) {
    const { addItem, updateItem, sections } = useProposalBuilder()

    // Form state
    const [title, setTitle] = useState(defaultTitle)
    const [description, setDescription] = useState('')
    const [price, setPrice] = useState('')
    const [imageUrl, setImageUrl] = useState<string | null>(null)
    const [saveToLibrary, setSaveToLibrary] = useState(false)
    const [isSubmitting, setIsSubmitting] = useState(false)

    // Get temporary item ID for image uploader
    const [tempItemId] = useState(() => crypto.randomUUID())

    // Validation
    const isValid = title.trim().length > 0

    // Reset form
    const resetForm = useCallback(() => {
        setTitle('')
        setDescription('')
        setPrice('')
        setImageUrl(null)
        setSaveToLibrary(false)
    }, [])

    // Handle close
    const handleClose = useCallback(() => {
        resetForm()
        onClose()
    }, [resetForm, onClose])

    // Save to library
    const saveItemToLibrary = async () => {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) throw new Error('Not authenticated')

        // Map item type to library category
        const typeToCategory: Record<ProposalItemType, string> = {
            hotel: 'hotel',
            flight: 'flight',
            transfer: 'transfer',
            experience: 'experience',
            service: 'service',
            insurance: 'service',
            fee: 'service',
            custom: 'custom',
        }

        const { error } = await supabase
            .from('proposal_library')
            .insert({
                name: title.trim(),
                category: typeToCategory[itemType] || 'custom',
                content: {
                    description,
                    image_url: imageUrl,
                },
                base_price: parseFloat(price) || 0,
                created_by: user.id,
                is_shared: false,
            })

        if (error) throw error
    }

    // Handle submit
    const handleSubmit = async () => {
        if (!isValid || isSubmitting) return

        setIsSubmitting(true)

        try {
            // Create the item in the proposal
            addItem(sectionId, itemType, title.trim())

            // Get the newly created item (last one added to section)
            const section = sections.find(s => s.id === sectionId)
            const newItem = section?.items[section.items.length - 1]

            if (newItem) {
                // Update with additional data
                const richContent = imageUrl ? { image_url: imageUrl } : {}
                updateItem(newItem.id, {
                    description: description.trim() || null,
                    base_price: parseFloat(price) || 0,
                    rich_content: richContent as any,
                })
            }

            // Save to library if requested
            if (saveToLibrary && title.trim()) {
                try {
                    await saveItemToLibrary()
                    toast.success('Item adicionado e salvo na biblioteca!')
                } catch (error) {
                    console.error('Error saving to library:', error)
                    toast.success('Item adicionado! (Erro ao salvar na biblioteca)')
                }
            } else {
                toast.success('Item adicionado!')
            }

            handleClose()
        } catch (error) {
            console.error('Error creating item:', error)
            toast.error('Erro ao criar item')
        } finally {
            setIsSubmitting(false)
        }
    }

    // Don't render if not open
    if (!isOpen) return null

    return (
        <>
            {/* Backdrop */}
            <div
                className="fixed inset-0 bg-black/20 z-40 transition-opacity"
                onClick={handleClose}
            />

            {/* Drawer */}
            <div
                className={cn(
                    'fixed right-0 top-0 h-full w-full max-w-md',
                    'bg-white shadow-2xl z-50',
                    'flex flex-col',
                    'transform transition-transform duration-300 ease-out',
                    isOpen ? 'translate-x-0' : 'translate-x-full'
                )}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-4 border-b border-slate-200">
                    <div>
                        <h2 className="text-lg font-semibold text-slate-900">
                            Criar Novo Item
                        </h2>
                        <p className="text-sm text-slate-500">
                            Adicione um item personalizado
                        </p>
                    </div>
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={handleClose}
                        className="h-10 w-10"
                    >
                        <X className="h-5 w-5" />
                    </Button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-4 space-y-6">
                    {/* Title */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-700">
                            Título *
                        </label>
                        <Input
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="Ex: Hotel Copacabana Palace"
                            autoFocus
                        />
                    </div>

                    {/* Price */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-700">
                            Preço Base (R$)
                        </label>
                        <Input
                            type="number"
                            value={price}
                            onChange={(e) => setPrice(e.target.value)}
                            placeholder="0,00"
                        />
                        <p className="text-xs text-slate-400">
                            Deixe em branco ou 0 para itens sem preço
                        </p>
                    </div>

                    {/* Image */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-700">
                            Imagem
                        </label>
                        <ItemImageUploader
                            imageUrl={imageUrl}
                            onImageChange={setImageUrl}
                            itemId={tempItemId}
                        />
                    </div>

                    {/* Description */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-700">
                            Descrição
                        </label>
                        <Textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="Descreva o item para o cliente..."
                            className="min-h-[120px]"
                        />
                    </div>

                    {/* Save to Library Toggle */}
                    <div className="flex items-center gap-3 p-4 rounded-lg border border-slate-200 bg-slate-50">
                        <button
                            onClick={() => setSaveToLibrary(!saveToLibrary)}
                            className={cn(
                                'w-10 h-6 rounded-full transition-colors relative',
                                saveToLibrary ? 'bg-blue-600' : 'bg-slate-300'
                            )}
                        >
                            <div
                                className={cn(
                                    'absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm transition-transform',
                                    saveToLibrary ? 'left-5' : 'left-1'
                                )}
                            />
                        </button>
                        <div className="flex-1">
                            <div className="flex items-center gap-2">
                                <Library className="h-4 w-4 text-slate-500" />
                                <span className="text-sm font-medium text-slate-700">
                                    Salvar na Biblioteca
                                </span>
                            </div>
                            <p className="text-xs text-slate-500 mt-0.5">
                                Reutilize este item em futuras propostas
                            </p>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-slate-200 space-y-3">
                    <Button
                        onClick={handleSubmit}
                        disabled={!isValid || isSubmitting}
                        className="w-full h-12"
                    >
                        {isSubmitting ? (
                            <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                Adicionando...
                            </>
                        ) : (
                            <>
                                <Plus className="h-4 w-4 mr-2" />
                                Adicionar à Proposta
                                <ArrowRight className="h-4 w-4 ml-2" />
                            </>
                        )}
                    </Button>

                    {saveToLibrary && (
                        <p className="text-xs text-center text-slate-400">
                            <Save className="h-3 w-3 inline mr-1" />
                            Também será salvo na sua biblioteca
                        </p>
                    )}
                </div>
            </div>
        </>
    )
}

export default ItemCreatorDrawer
