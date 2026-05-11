import { useState } from 'react'
import {
    useMyLibraryItems,
    useDeleteLibraryItem,
    LIBRARY_CATEGORY_CONFIG,
    type LibraryCategory,
    type LibraryItem
} from '@/hooks/useLibrary'
import { seedLibraryItems } from '@/utils/seedLibraryItems'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { LibraryItemForm } from '@/components/proposals/LibraryItemForm'
import {
    Search,
    Plus,
    MoreVertical,
    Pencil,
    Trash2,
    Loader2,
    Package,
    RotateCcw,
    Building2,
    Sparkles,
    Car,
    Shield,
    Plane,
    Ship,
} from 'lucide-react'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { useQueryClient } from '@tanstack/react-query'

// Ícones por categoria
const CATEGORY_ICONS: Record<string, React.ElementType> = {
    hotel: Building2,
    experience: Sparkles,
    transfer: Car,
    service: Shield,
    flight: Plane,
    cruise: Ship,
    text_block: Package,
    custom: Package,
}

// Cores por categoria (bg para badge, gradient para placeholder)
const CATEGORY_COLORS: Record<string, { bg: string; gradient: string }> = {
    hotel: { bg: 'bg-emerald-500', gradient: 'from-emerald-400 to-emerald-600' },
    experience: { bg: 'bg-orange-500', gradient: 'from-orange-400 to-orange-600' },
    transfer: { bg: 'bg-teal-500', gradient: 'from-teal-400 to-teal-600' },
    service: { bg: 'bg-amber-500', gradient: 'from-amber-400 to-amber-600' },
    flight: { bg: 'bg-sky-500', gradient: 'from-sky-400 to-sky-600' },
    cruise: { bg: 'bg-indigo-500', gradient: 'from-indigo-400 to-indigo-600' },
    text_block: { bg: 'bg-slate-500', gradient: 'from-slate-400 to-slate-600' },
    custom: { bg: 'bg-slate-500', gradient: 'from-slate-400 to-slate-600' },
}

// Extrair thumbnail do content JSONB
function getThumbnail(item: LibraryItem): string | null {
    const content = item.content as Record<string, unknown>
    if (!content) return null

    // Tentar cada namespace
    const namespaces = ['hotel', 'experience', 'transfer', 'insurance', 'cruise']
    for (const ns of namespaces) {
        const nsContent = content[ns] as Record<string, unknown> | undefined
        if (nsContent) {
            // Array de imagens
            if (Array.isArray(nsContent.images) && nsContent.images.length > 0) {
                const first = nsContent.images[0]
                if (typeof first === 'string' && first) return first
            }
            // image_url única
            if (typeof nsContent.image_url === 'string' && nsContent.image_url) {
                return nsContent.image_url
            }
        }
    }

    // Formato flat/legado
    if (Array.isArray(content.images) && content.images.length > 0) {
        const first = content.images[0]
        if (typeof first === 'string' && first) return first
    }
    if (typeof content.image_url === 'string' && content.image_url) {
        return content.image_url
    }

    return null
}

// Extrair descrição do content
function getDescription(item: LibraryItem): string {
    const content = item.content as Record<string, unknown>
    if (!content) return ''

    // Tentar cada namespace
    const namespaces = ['hotel', 'experience', 'transfer', 'insurance', 'cruise']
    for (const ns of namespaces) {
        const nsContent = content[ns] as Record<string, unknown> | undefined
        if (nsContent?.description && typeof nsContent.description === 'string') {
            return nsContent.description
        }
    }

    // Formato flat
    if (typeof content.description === 'string') return content.description

    return ''
}

export function LibraryManager() {
    const [search, setSearch] = useState('')
    const [selectedCategory, setSelectedCategory] = useState<LibraryCategory | 'all'>('all')
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
    const [editingItem, setEditingItem] = useState<LibraryItem | null>(null)
    const [isSeeding, setIsSeeding] = useState(false)
    const queryClient = useQueryClient()

    const { data: items = [], isLoading } = useMyLibraryItems(
        selectedCategory === 'all' ? undefined : selectedCategory
    )
    const deleteItem = useDeleteLibraryItem()

    const filteredItems = items.filter(item =>
        item.name.toLowerCase().includes(search.toLowerCase()) ||
        getDescription(item).toLowerCase().includes(search.toLowerCase())
    )

    const handleDelete = async (id: string) => {
        if (!confirm('Tem certeza que deseja excluir este item?')) return
        try {
            await deleteItem.mutateAsync(id)
            toast.success('Item excluído com sucesso')
        } catch (error) {
            console.error('Error deleting item:', error)
            toast.error('Erro ao excluir item')
        }
    }

    const formatCurrency = (value: number | null) => {
        if (value === null || value === 0) return null
        return new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL',
        }).format(value)
    }

    return (
        <div className="h-full flex flex-col">
            {/* Toolbar */}
            <div className="flex items-center justify-between gap-4 mb-6">
                <div className="flex items-center gap-2 flex-1 max-w-lg">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <Input
                            placeholder="Buscar itens..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="pl-10 bg-white"
                        />
                    </div>
                    <div className="flex gap-1 bg-white p-1 rounded-lg border border-slate-200">
                        <button
                            onClick={() => setSelectedCategory('all')}
                            className={cn(
                                'px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
                                selectedCategory === 'all'
                                    ? 'bg-slate-900 text-white'
                                    : 'text-slate-500 hover:bg-slate-50'
                            )}
                        >
                            Todos
                        </button>
                        {Object.entries(LIBRARY_CATEGORY_CONFIG)
                            .filter(([, config]) => config.isAvailable !== false)
                            .map(([key, config]) => {
                                const Icon = CATEGORY_ICONS[key] || Package
                                return (
                                    <button
                                        key={key}
                                        onClick={() => setSelectedCategory(key as LibraryCategory)}
                                        className={cn(
                                            'px-3 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5',
                                            selectedCategory === key
                                                ? 'bg-slate-900 text-white'
                                                : 'text-slate-500 hover:bg-slate-50'
                                        )}
                                        title={config.label}
                                    >
                                        <Icon className="h-3.5 w-3.5" />
                                        {config.label}
                                    </button>
                                )
                            })}
                    </div>
                </div>

                <Button onClick={() => setIsCreateModalOpen(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Novo Item
                </Button>
            </div>

            {/* Grid */}
            {isLoading ? (
                <div className="flex-1 flex items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
                </div>
            ) : filteredItems.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-slate-500">
                    <Package className="h-12 w-12 mb-4 text-slate-300" />
                    <p className="text-lg font-medium text-slate-900">Nenhum item encontrado</p>
                    <p className="text-sm mb-4">Crie itens reutilizáveis para suas propostas.</p>
                    <div className="flex items-center gap-3">
                        <Button variant="outline" onClick={() => setIsCreateModalOpen(true)}>
                            <Plus className="h-4 w-4 mr-2" />
                            Criar Primeiro Item
                        </Button>
                        <Button
                            variant="outline"
                            onClick={async () => {
                                setIsSeeding(true)
                                await seedLibraryItems()
                                queryClient.invalidateQueries({ queryKey: ['library'] })
                                setIsSeeding(false)
                            }}
                            disabled={isSeeding}
                        >
                            {isSeeding ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RotateCcw className="h-4 w-4 mr-2" />}
                            Carregar Exemplos
                        </Button>
                    </div>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 pb-20">
                    {filteredItems.map((item) => {
                        const config = LIBRARY_CATEGORY_CONFIG[item.category as LibraryCategory] || LIBRARY_CATEGORY_CONFIG.custom
                        const colors = CATEGORY_COLORS[item.category] || CATEGORY_COLORS.custom
                        const Icon = CATEGORY_ICONS[item.category] || Package
                        const thumbnail = getThumbnail(item)
                        const description = getDescription(item)
                        const price = formatCurrency(item.base_price)

                        return (
                            <div
                                key={item.id}
                                onClick={() => setEditingItem(item)}
                                className="bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-lg hover:border-slate-300 transition-all duration-200 group overflow-hidden cursor-pointer"
                            >
                                {/* Thumbnail ou Placeholder */}
                                <div className="relative aspect-[4/3] overflow-hidden bg-slate-100">
                                    {thumbnail ? (
                                        <img
                                            src={thumbnail}
                                            alt={item.name}
                                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                            onError={(e) => {
                                                // Fallback se imagem falhar
                                                (e.target as HTMLImageElement).style.display = 'none'
                                            }}
                                        />
                                    ) : (
                                        <div className={cn(
                                            "w-full h-full flex items-center justify-center bg-gradient-to-br",
                                            colors.gradient
                                        )}>
                                            <Icon className="h-14 w-14 text-white/70" />
                                        </div>
                                    )}

                                    {/* Menu no hover */}
                                    <div
                                        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <button className="p-1.5 rounded-lg bg-white/90 hover:bg-white shadow-sm">
                                                    <MoreVertical className="h-4 w-4 text-slate-600" />
                                                </button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                                <DropdownMenuItem onClick={() => setEditingItem(item)}>
                                                    <Pencil className="h-4 w-4 mr-2" />
                                                    Editar
                                                </DropdownMenuItem>
                                                <DropdownMenuItem
                                                    onClick={() => handleDelete(item.id)}
                                                    className="text-red-600"
                                                >
                                                    <Trash2 className="h-4 w-4 mr-2" />
                                                    Excluir
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </div>
                                </div>

                                {/* Content */}
                                <div className="p-4">
                                    {/* Badge colorido */}
                                    <div className={cn(
                                        "inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider text-white mb-2",
                                        colors.bg
                                    )}>
                                        <Icon className="h-3 w-3" />
                                        {config.label}
                                    </div>

                                    {/* Nome */}
                                    <h3 className="font-semibold text-slate-900 line-clamp-1 mb-1" title={item.name}>
                                        {item.name}
                                    </h3>

                                    {/* Destino */}
                                    {item.destination && (
                                        <p className="text-sm text-slate-500 line-clamp-1">
                                            {item.destination}
                                        </p>
                                    )}

                                    {/* Supplier */}
                                    {item.supplier && (
                                        <p className="text-xs text-slate-400 mt-0.5">
                                            {item.supplier}
                                        </p>
                                    )}

                                    {/* Descrição (se não tem destino nem supplier) */}
                                    {!item.destination && !item.supplier && description && (
                                        <p className="text-sm text-slate-500 line-clamp-2 mt-1">
                                            {description}
                                        </p>
                                    )}

                                    {/* Footer */}
                                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100">
                                        {price ? (
                                            <span className="font-semibold text-emerald-600">
                                                {price}
                                            </span>
                                        ) : (
                                            <span className="text-xs text-slate-400">Sem preco</span>
                                        )}

                                        {item.usage_count > 0 && (
                                            <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                                                {item.usage_count} {item.usage_count === 1 ? 'uso' : 'usos'}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}

            {/* Modals */}
            <LibraryItemForm
                isOpen={isCreateModalOpen}
                onClose={() => setIsCreateModalOpen(false)}
            />

            {editingItem && (
                <LibraryItemForm
                    isOpen={true}
                    onClose={() => setEditingItem(null)}
                    item={editingItem}
                />
            )}
        </div>
    )
}
