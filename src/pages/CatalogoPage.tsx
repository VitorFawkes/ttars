import { useMemo, useState } from 'react'
import {
    Search,
    Plus,
    X,
    Star,
    MapPin,
    TrendingUp,
    Clock,
    Building2,
    Sparkles,
    Car,
    Plane,
    Shield,
    Receipt,
    Ship,
    Package,
    FileText,
    Archive,
    Loader2,
    SlidersHorizontal,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'
import {
    useCatalogSearch,
    useCatalogTopRegions,
    useCatalogTopTags,
    type CatalogCategory,
    type CatalogFilters,
    type CatalogSort,
    type CatalogItem,
    CATEGORY_CONFIG,
    SORT_OPTIONS,
} from '@/hooks/useCatalog'
import { cn } from '@/lib/utils'

// ============================================================
// Tipos auxiliares
// ============================================================

const CATEGORY_ICONS: Record<string, typeof Building2> = {
    hotel: Building2,
    experience: Sparkles,
    transfer: Car,
    flight: Plane,
    service: Shield,
    insurance: Shield,
    fee: Receipt,
    cruise: Ship,
    text_block: FileText,
    custom: Package,
}

const ALL_CATEGORIES: CatalogCategory[] = [
    'hotel',
    'experience',
    'transfer',
    'cruise',
    'insurance',
    'fee',
    'custom',
]

// ============================================================
// Componentes pequenos (mantidos no arquivo até estabilizar)
// ============================================================

function FilterSection({
    title,
    children,
}: {
    title: string
    children: React.ReactNode
}) {
    return (
        <div className="border-b border-slate-200 py-4 last:border-b-0">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">
                {title}
            </h3>
            {children}
        </div>
    )
}

function CategoryToggle({
    value,
    selected,
    onToggle,
}: {
    value: CatalogCategory
    selected: boolean
    onToggle: () => void
}) {
    const config = CATEGORY_CONFIG[value]
    const Icon = CATEGORY_ICONS[value] ?? Package
    return (
        <button
            onClick={onToggle}
            className={cn(
                'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition-all',
                selected
                    ? 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200'
                    : 'text-slate-700 hover:bg-slate-50'
            )}
        >
            <Icon className={cn('h-4 w-4', selected ? 'text-indigo-600' : 'text-slate-500')} />
            <span className="flex-1 text-left font-medium">{config.label}</span>
        </button>
    )
}

function StarFilterRow({
    value,
    selected,
    onToggle,
}: {
    value: number
    selected: boolean
    onToggle: () => void
}) {
    return (
        <button
            onClick={onToggle}
            className={cn(
                'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition-all',
                selected
                    ? 'bg-amber-50 text-amber-800 ring-1 ring-amber-200'
                    : 'text-slate-700 hover:bg-slate-50'
            )}
        >
            <div className="flex">
                {Array.from({ length: value }).map((_, i) => (
                    <Star
                        key={i}
                        className={cn(
                            'h-3.5 w-3.5',
                            selected ? 'fill-amber-400 text-amber-400' : 'fill-slate-300 text-slate-300'
                        )}
                    />
                ))}
            </div>
            <span className="text-xs font-medium">{value} {value === 1 ? 'estrela' : 'estrelas'}</span>
        </button>
    )
}

function QuickChip({
    label,
    active,
    icon,
    onClick,
}: {
    label: string
    active?: boolean
    icon?: React.ReactNode
    onClick: () => void
}) {
    return (
        <button
            onClick={onClick}
            className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all',
                active
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50'
            )}
        >
            {icon}
            {label}
        </button>
    )
}

function ItemCard({ item }: { item: CatalogItem }) {
    const Icon = CATEGORY_ICONS[item.category] ?? Package
    const config = CATEGORY_CONFIG[item.category as CatalogCategory]
    const placeholder =
        'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 225"><rect width="400" height="225" fill="%23f1f5f9"/></svg>'

    return (
        <div className="group flex flex-col overflow-hidden rounded-xl bg-white ring-1 ring-slate-200 transition hover:ring-slate-300 hover:shadow-md">
            <div className="relative aspect-[16/10] bg-slate-100">
                <img
                    src={item.thumbnail_url || placeholder}
                    alt={item.name}
                    className="h-full w-full object-cover"
                    loading="lazy"
                />
                <div className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-md bg-black/55 px-2 py-1 text-xs font-medium text-white backdrop-blur-sm">
                    <Icon className="h-3 w-3" />
                    {config?.label ?? item.category}
                </div>
                {item.star_rating ? (
                    <div className="absolute right-3 top-3 inline-flex items-center gap-0.5 rounded-md bg-white/95 px-1.5 py-0.5 text-xs font-medium text-slate-900 shadow-sm">
                        {Array.from({ length: item.star_rating }).map((_, i) => (
                            <Star key={i} className="h-3 w-3 fill-amber-400 text-amber-400" />
                        ))}
                    </div>
                ) : null}
            </div>
            <div className="flex flex-1 flex-col gap-2 p-4">
                <div className="flex items-start justify-between gap-2">
                    <h3 className="line-clamp-2 text-sm font-semibold text-slate-900">{item.name}</h3>
                </div>
                {item.region ? (
                    <div className="flex items-center gap-1 text-xs text-slate-500">
                        <MapPin className="h-3 w-3" />
                        {item.region}
                        {item.region_country ? `, ${item.region_country}` : ''}
                    </div>
                ) : null}
                {item.amenities?.length ? (
                    <div className="line-clamp-1 text-xs text-slate-500">
                        {item.amenities.slice(0, 3).join(' · ')}
                    </div>
                ) : null}
                <div className="mt-auto flex items-end justify-between pt-2">
                    <div>
                        {item.base_price && item.base_price > 0 ? (
                            <div className="text-base font-semibold text-slate-900">
                                R$ {item.base_price.toLocaleString('pt-BR')}
                            </div>
                        ) : (
                            <div className="text-xs text-slate-400">Sem preço</div>
                        )}
                        {item.supplier ? (
                            <div className="text-xs text-slate-500">{item.supplier}</div>
                        ) : null}
                    </div>
                    {item.usage_count && item.usage_count > 0 ? (
                        <div className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">
                            <TrendingUp className="h-3 w-3" />
                            {item.usage_count}× usado
                        </div>
                    ) : null}
                </div>
            </div>
        </div>
    )
}

// ============================================================
// Página principal
// ============================================================

export default function CatalogoPage() {
    const [filters, setFilters] = useState<CatalogFilters>({
        sort: 'most_used',
        limit: 60,
    })

    const { data: items, isLoading, error } = useCatalogSearch(filters)
    const { data: topRegions } = useCatalogTopRegions(6)
    const { data: topTags } = useCatalogTopTags(8)

    const total = items?.[0]?.total_count ?? 0

    const activeFilterCount = useMemo(() => {
        let n = 0
        if (filters.search) n++
        if (filters.categories?.length) n += filters.categories.length
        if (filters.region) n++
        if (filters.tags?.length) n += filters.tags.length
        if (filters.stars?.length) n++
        if (filters.priceMin || filters.priceMax) n++
        return n
    }, [filters])

    const toggleCategory = (cat: CatalogCategory) => {
        setFilters((prev) => {
            const current = prev.categories ?? []
            const next = current.includes(cat) ? current.filter((c) => c !== cat) : [...current, cat]
            return { ...prev, categories: next.length ? next : undefined }
        })
    }

    const toggleStar = (stars: number) => {
        setFilters((prev) => {
            const current = prev.stars ?? []
            const next = current.includes(stars)
                ? current.filter((s) => s !== stars)
                : [...current, stars]
            return { ...prev, stars: next.length ? next : undefined }
        })
    }

    const setRegion = (region: string | undefined) => {
        setFilters((prev) => ({ ...prev, region }))
    }

    const setSort = (sort: CatalogSort) => {
        setFilters((prev) => ({ ...prev, sort }))
    }

    const clearAll = () => setFilters({ sort: 'most_used', limit: 60 })

    return (
        <ErrorBoundary>
            <div className="flex h-full flex-col overflow-hidden bg-slate-50">
                {/* Header */}
                <div className="flex-shrink-0 border-b border-slate-200 bg-white px-8 pt-6 pb-4">
                    <div className="mb-4 flex items-start justify-between">
                        <div>
                            <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Catálogo</h1>
                            <p className="mt-1 text-sm text-slate-500">
                                Todos os hotéis, experiências, transfers e serviços do time. Aprende sozinho conforme vocês usam.
                            </p>
                        </div>
                        <Button variant="default" size="sm">
                            <Plus className="mr-1.5 h-4 w-4" />
                            Adicionar manualmente
                        </Button>
                    </div>

                    {/* Busca e ordenação */}
                    <div className="flex items-center gap-3">
                        <div className="relative flex-1 max-w-xl">
                            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                            <Input
                                placeholder="Buscar por nome, região, fornecedor…"
                                value={filters.search ?? ''}
                                onChange={(e) =>
                                    setFilters((prev) => ({
                                        ...prev,
                                        search: e.target.value || undefined,
                                    }))
                                }
                                className="pl-9"
                            />
                        </div>
                        <select
                            value={filters.sort ?? 'most_used'}
                            onChange={(e) => setSort(e.target.value as CatalogSort)}
                            className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-100"
                        >
                            {SORT_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                    Ordenar: {opt.label}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* Layout 2 colunas */}
                <div className="flex flex-1 overflow-hidden">
                    {/* Sidebar filtros */}
                    <aside className="w-72 flex-shrink-0 overflow-y-auto border-r border-slate-200 bg-white px-5 py-4">
                        <div className="mb-3 flex items-center justify-between">
                            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                                <SlidersHorizontal className="h-4 w-4 text-slate-500" />
                                Filtros
                                {activeFilterCount > 0 ? (
                                    <span className="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-indigo-600 px-1.5 text-xs font-medium text-white">
                                        {activeFilterCount}
                                    </span>
                                ) : null}
                            </div>
                            {activeFilterCount > 0 ? (
                                <button
                                    onClick={clearAll}
                                    className="text-xs font-medium text-slate-500 hover:text-slate-900"
                                >
                                    Limpar
                                </button>
                            ) : null}
                        </div>

                        <FilterSection title="Tipo">
                            <div className="space-y-1">
                                {ALL_CATEGORIES.map((cat) => (
                                    <CategoryToggle
                                        key={cat}
                                        value={cat}
                                        selected={filters.categories?.includes(cat) ?? false}
                                        onToggle={() => toggleCategory(cat)}
                                    />
                                ))}
                            </div>
                        </FilterSection>

                        <FilterSection title="Região">
                            <Input
                                placeholder="Filtrar por região…"
                                value={filters.region ?? ''}
                                onChange={(e) => setRegion(e.target.value || undefined)}
                            />
                            {topRegions && topRegions.length > 0 ? (
                                <div className="mt-2 flex flex-wrap gap-1.5">
                                    {topRegions.map((r) => (
                                        <button
                                            key={r.region}
                                            onClick={() =>
                                                setRegion(
                                                    filters.region === r.region ? undefined : r.region
                                                )
                                            }
                                            className={cn(
                                                'rounded-full px-2.5 py-1 text-xs transition',
                                                filters.region === r.region
                                                    ? 'bg-slate-900 text-white'
                                                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                                            )}
                                        >
                                            {r.region}
                                            <span className="ml-1 opacity-60">{r.item_count}</span>
                                        </button>
                                    ))}
                                </div>
                            ) : null}
                        </FilterSection>

                        <FilterSection title="Estrelas (hotel)">
                            <div className="space-y-1">
                                {[5, 4, 3].map((n) => (
                                    <StarFilterRow
                                        key={n}
                                        value={n}
                                        selected={filters.stars?.includes(n) ?? false}
                                        onToggle={() => toggleStar(n)}
                                    />
                                ))}
                            </div>
                        </FilterSection>

                        <FilterSection title="Preço (R$)">
                            <div className="flex items-center gap-2">
                                <Input
                                    type="number"
                                    placeholder="Mín."
                                    value={filters.priceMin ?? ''}
                                    onChange={(e) =>
                                        setFilters((prev) => ({
                                            ...prev,
                                            priceMin: e.target.value ? Number(e.target.value) : undefined,
                                        }))
                                    }
                                />
                                <span className="text-slate-400">–</span>
                                <Input
                                    type="number"
                                    placeholder="Máx."
                                    value={filters.priceMax ?? ''}
                                    onChange={(e) =>
                                        setFilters((prev) => ({
                                            ...prev,
                                            priceMax: e.target.value ? Number(e.target.value) : undefined,
                                        }))
                                    }
                                />
                            </div>
                        </FilterSection>

                        <FilterSection title="Arquivados">
                            <label className="flex items-center gap-2 text-sm text-slate-700">
                                <input
                                    type="checkbox"
                                    checked={filters.includeArchived ?? false}
                                    onChange={(e) =>
                                        setFilters((prev) => ({
                                            ...prev,
                                            includeArchived: e.target.checked,
                                        }))
                                    }
                                    className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                />
                                Incluir itens arquivados
                            </label>
                        </FilterSection>
                    </aside>

                    {/* Main */}
                    <main className="flex-1 overflow-y-auto px-8 py-6">
                        {/* Chips de segmento rápido */}
                        <div className="mb-5 flex flex-wrap items-center gap-2">
                            <QuickChip
                                label="Mais usados"
                                active={filters.sort === 'most_used' && !filters.region && !filters.categories?.length}
                                icon={<TrendingUp className="h-3.5 w-3.5" />}
                                onClick={() => {
                                    setFilters({ sort: 'most_used', limit: 60 })
                                }}
                            />
                            <QuickChip
                                label="Recém adicionados"
                                active={filters.sort === 'recent'}
                                icon={<Clock className="h-3.5 w-3.5" />}
                                onClick={() => setSort('recent')}
                            />
                            {topTags?.slice(0, 6).map((t) => (
                                <QuickChip
                                    key={t.tag}
                                    label={t.tag}
                                    active={filters.tags?.includes(t.tag)}
                                    onClick={() =>
                                        setFilters((prev) => ({
                                            ...prev,
                                            tags: prev.tags?.includes(t.tag)
                                                ? prev.tags.filter((x) => x !== t.tag)
                                                : [...(prev.tags ?? []), t.tag],
                                        }))
                                    }
                                />
                            ))}
                        </div>

                        {/* Contador + filtros ativos resumo */}
                        <div className="mb-4 flex items-center justify-between">
                            <div className="text-sm text-slate-600">
                                {isLoading ? (
                                    <span className="inline-flex items-center gap-2">
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                        Buscando…
                                    </span>
                                ) : (
                                    <>
                                        <span className="font-medium text-slate-900">{total}</span>{' '}
                                        {total === 1 ? 'item encontrado' : 'itens encontrados'}
                                    </>
                                )}
                            </div>
                            {filters.region ? (
                                <button
                                    onClick={() => setRegion(undefined)}
                                    className="inline-flex items-center gap-1 rounded-full bg-slate-900 px-3 py-1 text-xs font-medium text-white"
                                >
                                    {filters.region}
                                    <X className="h-3 w-3" />
                                </button>
                            ) : null}
                        </div>

                        {/* Grid */}
                        {error ? (
                            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                                Erro ao carregar catálogo: {(error as Error).message}
                            </div>
                        ) : isLoading && !items ? (
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                                {Array.from({ length: 8 }).map((_, i) => (
                                    <div
                                        key={i}
                                        className="aspect-[16/13] animate-pulse rounded-xl bg-slate-100"
                                    />
                                ))}
                            </div>
                        ) : !items || items.length === 0 ? (
                            <div className="rounded-xl border border-dashed border-slate-300 bg-white py-16 text-center">
                                <Archive className="mx-auto h-10 w-10 text-slate-400" />
                                <h3 className="mt-3 text-base font-semibold text-slate-900">Nenhum item encontrado</h3>
                                <p className="mt-1 text-sm text-slate-500">
                                    Tente ajustar os filtros ou adicione um item manualmente.
                                </p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                                {items.map((item) => (
                                    <ItemCard key={item.id} item={item} />
                                ))}
                            </div>
                        )}
                    </main>
                </div>
            </div>
        </ErrorBoundary>
    )
}
