import { useState } from 'react'
import {
    Search,
    Loader2,
    AlertCircle,
    Library,
    Plus,
    Star,
    MapPin,
    TrendingUp,
} from 'lucide-react'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import {
    useCatalogSearch,
    useCatalogTopRegions,
    type CatalogCategory,
    type CatalogItem,
    type CatalogSort,
} from '@/hooks/useCatalog'
import type { LibrarySearchResult, LibraryCategory } from '@/hooks/useLibrary'

interface Props {
    /** Filtra resultados por categoria. Aceita string do tipo "hotel"|"experience"|etc */
    category?: CatalogCategory | LibraryCategory
    label: string
    /**
     * Chamado quando usuário escolhe um item.
     * Recebe item já no formato LibrarySearchResult pra plugar direto no
     * addItemFromLibrary existente.
     */
    onSelect: (item: LibrarySearchResult) => void
    /** Botão discreto "Buscar mais opções na Iterpec" — clique abre fluxo antigo */
    onFallbackIterpec?: () => void
    /** Mostra link "Criar novo" — clique muda pra tab Criar Novo */
    onCreateNew?: () => void
}

const SORT_OPTIONS: Array<{ value: CatalogSort; label: string }> = [
    { value: 'most_used', label: 'Mais usados' },
    { value: 'recent', label: 'Recentes' },
    { value: 'az', label: 'A — Z' },
    { value: 'price_asc', label: 'Menor preço' },
    { value: 'price_desc', label: 'Maior preço' },
]

/**
 * Converte CatalogItem em LibrarySearchResult, compatível com
 * addItemFromLibrary do useProposalBuilder.
 */
function adaptCatalogToLibrary(item: CatalogItem): LibrarySearchResult {
    return {
        id: item.id,
        category: item.category,
        name: item.name,
        content: item.content,
        base_price: item.base_price,
        currency: item.currency,
        tags: item.tags ?? [],
        supplier: item.supplier,
        destination: item.region,
        created_by: null,
        is_shared: true,
        usage_count: item.usage_count ?? 0,
        created_at: item.created_at,
        similarity_score: item.similarity_score,
        thumbnail_url: item.thumbnail_url,
    } as unknown as LibrarySearchResult
}

export function CatalogPickerPanel({
    category,
    label,
    onSelect,
    onFallbackIterpec,
    onCreateNew,
}: Props) {
    const [search, setSearch] = useState('')
    const [sort, setSort] = useState<CatalogSort>('most_used')
    const [region, setRegion] = useState<string | undefined>()

    const { data: items, isLoading, error } = useCatalogSearch({
        search: search.trim() || undefined,
        categories: category ? [category as CatalogCategory] : undefined,
        region,
        sort,
        limit: 30,
    })
    const { data: topRegions } = useCatalogTopRegions(5)

    const total = items?.[0]?.total_count ?? 0

    return (
        <div className="flex flex-col">
            {/* Search + sort */}
            <div className="border-b border-slate-100 bg-slate-50/50 px-5 py-3">
                <div className="flex gap-2">
                    <div className="relative flex-1">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                        <Input
                            placeholder={`Buscar ${label.toLowerCase()} no catálogo…`}
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="h-10 pl-9 bg-white"
                            autoFocus
                        />
                    </div>
                    <select
                        value={sort}
                        onChange={(e) => setSort(e.target.value as CatalogSort)}
                        className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700"
                    >
                        {SORT_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>
                                {o.label}
                            </option>
                        ))}
                    </select>
                </div>

                {/* Chips de região populares (clicáveis pra filtrar) */}
                {topRegions && topRegions.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                        <button
                            onClick={() => setRegion(undefined)}
                            className={cn(
                                'rounded-full px-2.5 py-0.5 text-xs font-medium transition',
                                !region
                                    ? 'bg-slate-900 text-white'
                                    : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100'
                            )}
                        >
                            Todas
                        </button>
                        {topRegions.map((r) => (
                            <button
                                key={r.region}
                                onClick={() =>
                                    setRegion(region === r.region ? undefined : r.region)
                                }
                                className={cn(
                                    'rounded-full px-2.5 py-0.5 text-xs font-medium transition',
                                    region === r.region
                                        ? 'bg-slate-900 text-white'
                                        : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100'
                                )}
                            >
                                {r.region}
                            </button>
                        ))}
                    </div>
                ) : null}
            </div>

            {/* Resultados */}
            <div className="px-3 py-3">
                {error ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
                            <AlertCircle className="h-6 w-6 text-red-500" />
                        </div>
                        <p className="text-sm font-medium text-slate-900">Erro ao buscar</p>
                        <p className="mt-1 text-xs text-slate-500">
                            {(error as Error).message}
                        </p>
                    </div>
                ) : isLoading ? (
                    <div className="flex flex-col items-center justify-center py-12">
                        <Loader2 className="mb-3 h-7 w-7 animate-spin text-blue-500" />
                        <p className="text-sm text-slate-500">Buscando…</p>
                    </div>
                ) : !items || items.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
                            <Library className="h-6 w-6 text-slate-400" />
                        </div>
                        <p className="text-sm font-medium text-slate-700">
                            {search.length > 0 ? 'Nenhum resultado' : 'Catálogo vazio'}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                            {search.length > 0
                                ? `Não encontramos "${search}" no catálogo da Welcome Trips`
                                : 'O time ainda não usou esse tipo de item em propostas'}
                        </p>
                        {onCreateNew ? (
                            <Button className="mt-3" size="sm" onClick={onCreateNew}>
                                <Plus className="mr-1.5 h-4 w-4" />
                                Criar do zero
                            </Button>
                        ) : null}
                    </div>
                ) : (
                    <>
                        <div className="mb-2 px-2 text-xs text-slate-500">
                            <span className="font-medium text-slate-700">{total}</span>{' '}
                            {total === 1 ? 'item encontrado' : 'itens encontrados'}
                        </div>
                        <div className="space-y-1.5">
                            {items.map((item) => (
                                <CatalogPickerRow
                                    key={item.id}
                                    item={item}
                                    onSelect={() => onSelect(adaptCatalogToLibrary(item))}
                                />
                            ))}
                        </div>
                    </>
                )}
            </div>

            {/* Footer: fallback Iterpec */}
            {onFallbackIterpec ? (
                <div className="border-t border-slate-100 bg-slate-50/50 px-5 py-3 text-center">
                    <button
                        onClick={onFallbackIterpec}
                        className="text-xs font-medium text-indigo-600 hover:text-indigo-800"
                    >
                        Não encontrou? Buscar mais opções na Iterpec →
                    </button>
                </div>
            ) : null}
        </div>
    )
}

function CatalogPickerRow({
    item,
    onSelect,
}: {
    item: CatalogItem
    onSelect: () => void
}) {
    const placeholder =
        'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="%23f1f5f9"/></svg>'

    return (
        <button
            onClick={onSelect}
            className="group flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white p-2.5 text-left transition-all hover:border-blue-300 hover:bg-blue-50/40 hover:shadow-sm"
        >
            <div className="h-14 w-14 flex-shrink-0 overflow-hidden rounded-lg bg-slate-100">
                <img
                    src={item.thumbnail_url || placeholder}
                    alt={item.name}
                    className="h-full w-full object-cover"
                    loading="lazy"
                />
            </div>
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium text-slate-900 group-hover:text-blue-700">
                        {item.name}
                    </p>
                    {item.star_rating ? (
                        <div className="flex flex-shrink-0">
                            {Array.from({ length: item.star_rating }).map((_, i) => (
                                <Star
                                    key={i}
                                    className="h-3 w-3 fill-amber-400 text-amber-400"
                                />
                            ))}
                        </div>
                    ) : null}
                </div>
                <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-500">
                    {item.region ? (
                        <span className="inline-flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {item.region}
                        </span>
                    ) : null}
                    {item.supplier ? <span>· {item.supplier}</span> : null}
                </div>
                {item.usage_count && item.usage_count > 0 ? (
                    <div className="mt-0.5 inline-flex items-center gap-1 text-xs text-emerald-700">
                        <TrendingUp className="h-3 w-3" />
                        Usado {item.usage_count}× pelo time
                    </div>
                ) : null}
            </div>
            <div className="text-right">
                {item.base_price && item.base_price > 0 ? (
                    <p className="text-sm font-semibold text-slate-900">
                        {new Intl.NumberFormat('pt-BR', {
                            style: 'currency',
                            currency: item.currency || 'BRL',
                            maximumFractionDigits: 0,
                        }).format(item.base_price)}
                    </p>
                ) : null}
            </div>
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-400 transition group-hover:bg-blue-500 group-hover:text-white">
                <Plus className="h-4 w-4" />
            </div>
        </button>
    )
}
