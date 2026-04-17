import { useState, useMemo } from 'react'
import { useLibrarySearch, LIBRARY_CATEGORY_CONFIG, type LibraryCategory, type LibrarySearchResult } from '@/hooks/useLibrary'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import {
    Search,
    Building2,
    Sparkles,
    Car,
    Plane,
    Briefcase,
    FileText,
    Package,
    Plus,
    Loader2,
    Library,
    X,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface LibrarySearchProps {
    onSelectItem: (item: LibrarySearchResult) => void
    onCreateNew?: () => void
    category?: LibraryCategory
    destination?: string
    className?: string
}

const ICONS: Record<LibraryCategory, React.ElementType> = {
    hotel: Building2,
    experience: Sparkles,
    transfer: Car,
    flight: Plane,
    service: Briefcase,
    text_block: FileText,
    custom: Package,
}

export function LibrarySearch({
    onSelectItem,
    onCreateNew,
    category,
    destination,
    className,
}: LibrarySearchProps) {
    const [search, setSearch] = useState('')
    const [selectedCategory, setSelectedCategory] = useState<LibraryCategory | undefined>(category)
    const [isOpen, setIsOpen] = useState(false)

    const filters = useMemo(() => ({
        search,
        category: selectedCategory,
        destination,
    }), [search, selectedCategory, destination])

    const { data: results = [], isLoading } = useLibrarySearch(filters, isOpen && search.length >= 2)

    const handleSelect = (item: LibrarySearchResult) => {
        onSelectItem(item)
        setSearch('')
        setIsOpen(false)
    }

    const categories = Object.entries(LIBRARY_CATEGORY_CONFIG) as [LibraryCategory, typeof LIBRARY_CATEGORY_CONFIG[LibraryCategory]][]

    return (
        <div className={cn("relative", className)}>
            {/* Search Input */}
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                    placeholder="Buscar na biblioteca..."
                    value={search}
                    onChange={(e) => {
                        setSearch(e.target.value)
                        setIsOpen(true)
                    }}
                    onFocus={() => setIsOpen(true)}
                    className="pl-9 pr-9"
                />
                {search && (
                    <button
                        onClick={() => {
                            setSearch('')
                            setIsOpen(false)
                        }}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                        <X className="h-4 w-4" />
                    </button>
                )}
            </div>

            {/* Dropdown Results */}
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <div
                        className="fixed inset-0 z-40"
                        onClick={() => setIsOpen(false)}
                    />

                    {/* Results Panel */}
                    <div className="absolute top-full left-0 right-0 mt-2 z-50 bg-white rounded-lg border border-slate-200 shadow-xl max-h-96 overflow-hidden">
                        {/* Category Filter Tabs */}
                        <div className="flex gap-1 p-2 border-b border-slate-100 overflow-x-auto">
                            <button
                                onClick={() => setSelectedCategory(undefined)}
                                className={cn(
                                    "px-2 py-1 text-xs font-medium rounded-md whitespace-nowrap transition-colors",
                                    !selectedCategory
                                        ? "bg-slate-900 text-white"
                                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                                )}
                            >
                                Todos
                            </button>
                            {categories.map(([key, config]) => {
                                const Icon = ICONS[key]
                                return (
                                    <button
                                        key={key}
                                        onClick={() => setSelectedCategory(key)}
                                        className={cn(
                                            "flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md whitespace-nowrap transition-colors",
                                            selectedCategory === key
                                                ? "bg-slate-900 text-white"
                                                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                                        )}
                                    >
                                        <Icon className="h-3 w-3" />
                                        {config.label}
                                    </button>
                                )
                            })}
                        </div>

                        {/* Results List */}
                        <div className="max-h-72 overflow-y-auto">
                            {isLoading ? (
                                <div className="flex items-center justify-center py-8">
                                    <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
                                </div>
                            ) : search.length < 2 ? (
                                <div className="p-6 text-center">
                                    <Library className="h-10 w-10 mx-auto text-slate-300 mb-3" />
                                    <p className="text-sm text-slate-500">
                                        Digite pelo menos 2 caracteres para buscar
                                    </p>
                                </div>
                            ) : results.length === 0 ? (
                                <div className="p-6 text-center">
                                    <Search className="h-10 w-10 mx-auto text-slate-300 mb-3" />
                                    <p className="text-sm text-slate-500 mb-3">
                                        Nenhum item encontrado para "{search}"
                                    </p>
                                    {onCreateNew && (
                                        <Button size="sm" onClick={onCreateNew}>
                                            <Plus className="h-4 w-4 mr-1" />
                                            Criar Novo
                                        </Button>
                                    )}
                                </div>
                            ) : (
                                <div className="divide-y divide-slate-100">
                                    {results.map((item) => {
                                        const Icon = ICONS[item.category as LibraryCategory]
                                        const config = LIBRARY_CATEGORY_CONFIG[item.category as LibraryCategory]

                                        return (
                                            <button
                                                key={item.id}
                                                onClick={() => handleSelect(item)}
                                                className="w-full px-4 py-3 flex items-start gap-3 hover:bg-slate-50 transition-colors text-left"
                                            >
                                                {/* Thumbnail */}
                                                <div className="w-12 h-12 rounded-lg bg-slate-100 flex-shrink-0 overflow-hidden">
                                                    {item.thumbnail_url ? (
                                                        <img
                                                            src={item.thumbnail_url}
                                                            alt={item.name}
                                                            className="w-full h-full object-cover"
                                                        />
                                                    ) : (
                                                        <div className={cn(
                                                            "w-full h-full flex items-center justify-center",
                                                            config.color
                                                        )}>
                                                            <Icon className="h-5 w-5" />
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="font-medium text-slate-900 truncate">
                                                        {item.name}
                                                    </p>
                                                    <div className="flex items-center gap-2 mt-0.5">
                                                        <span className="text-xs text-slate-500">
                                                            {config.label}
                                                        </span>
                                                        {item.supplier && (
                                                            <>
                                                                <span className="text-slate-300">•</span>
                                                                <span className="text-xs text-slate-500">
                                                                    {item.supplier}
                                                                </span>
                                                            </>
                                                        )}
                                                        {item.destination && (
                                                            <>
                                                                <span className="text-slate-300">•</span>
                                                                <span className="text-xs text-slate-500">
                                                                    {item.destination}
                                                                </span>
                                                            </>
                                                        )}
                                                    </div>
                                                    {item.base_price && Number(item.base_price) > 0 && (
                                                        <p className="text-xs text-emerald-600 font-medium mt-1">
                                                            {new Intl.NumberFormat('pt-BR', {
                                                                style: 'currency',
                                                                currency: item.currency || 'BRL',
                                                            }).format(Number(item.base_price))}
                                                        </p>
                                                    )}
                                                </div>
                                                {item.usage_count > 0 && (
                                                    <span className="text-xs text-slate-400">
                                                        {item.usage_count} usos
                                                    </span>
                                                )}
                                            </button>
                                        )
                                    })}
                                </div>
                            )}
                        </div>

                        {/* Footer */}
                        {onCreateNew && results.length > 0 && (
                            <div className="p-2 border-t border-slate-100">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={onCreateNew}
                                    className="w-full justify-start"
                                >
                                    <Plus className="h-4 w-4 mr-2" />
                                    Criar item do zero
                                </Button>
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    )
}
