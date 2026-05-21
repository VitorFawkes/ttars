import { useEffect, useState } from 'react'
import {
    X,
    Save,
    Archive,
    ArchiveRestore,
    Star,
    Building2,
    Sparkles,
    Car,
    Plane,
    Shield,
    Receipt,
    Ship,
    Package,
    Wrench,
    Loader2,
    Image as ImageIcon,
    TrendingUp,
    Calendar,
    Trash2,
} from 'lucide-react'
import { Sheet, SheetContent, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import * as VisuallyHidden from '@radix-ui/react-visually-hidden'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import {
    useCatalogItem,
    useUpdateCatalogItem,
    useArchiveCatalogItem,
    type CatalogCategory,
    CATEGORY_CONFIG,
} from '@/hooks/useCatalog'
import type { Database, Json } from '@/database.types'

type LibraryRow = Database['public']['Tables']['proposal_library']['Row']

const ICON_MAP: Record<string, typeof Building2> = {
    hotel: Building2,
    experience: Sparkles,
    transfer: Car,
    flight: Plane,
    service: Wrench,
    insurance: Shield,
    fee: Receipt,
    cruise: Ship,
    text_block: Package,
    custom: Package,
}

interface FormState {
    name: string
    region: string
    region_country: string
    sub_category: string
    base_price: string
    currency: string
    supplier: string
    star_rating: number | null
    description: string
    tags: string[]
    client_profile_tags: string[]
    amenities: string[]
    thumbnail_url: string
    gallery_urls: string[]
}

const PROFILE_TAG_OPTIONS = [
    { value: 'lua_de_mel', label: 'Lua de mel' },
    { value: 'familia', label: 'Família' },
    { value: 'grupo', label: 'Grupo' },
    { value: 'casal', label: 'Casal' },
    { value: 'sozinho', label: 'Sozinho' },
    { value: 'corporativo', label: 'Corporativo' },
    { value: 'aventura', label: 'Aventura' },
    { value: 'luxo', label: 'Luxo' },
    { value: 'romantico', label: 'Romântico' },
]

function buildInitialForm(item: LibraryRow | null | undefined): FormState {
    if (!item) {
        return {
            name: '',
            region: '',
            region_country: '',
            sub_category: '',
            base_price: '',
            currency: 'BRL',
            supplier: '',
            star_rating: null,
            description: '',
            tags: [],
            client_profile_tags: [],
            amenities: [],
            thumbnail_url: '',
            gallery_urls: [],
        }
    }

    // Tentar extrair descrição do content (varia por categoria)
    const content = (item.content ?? {}) as Record<string, unknown>
    const ns = (content[item.category] ?? {}) as Record<string, unknown>
    const description =
        (ns.description as string) || (content.description as string) || ''

    return {
        name: item.name ?? '',
        region: item.region ?? item.destination ?? '',
        region_country: item.region_country ?? item.location_country ?? '',
        sub_category: item.sub_category ?? '',
        base_price: item.base_price != null ? String(item.base_price) : '',
        currency: item.currency ?? 'BRL',
        supplier: item.supplier ?? '',
        star_rating: item.star_rating ?? null,
        description,
        tags: item.tags ?? [],
        client_profile_tags: item.client_profile_tags ?? [],
        amenities: item.amenities ?? [],
        thumbnail_url: item.thumbnail_url ?? '',
        gallery_urls: item.gallery_urls ?? [],
    }
}

interface Props {
    itemId: string | null
    open: boolean
    onClose: () => void
}

export function CatalogItemDetailDrawer({ itemId, open, onClose }: Props) {
    const { data: item, isLoading } = useCatalogItem(itemId)
    const updateMutation = useUpdateCatalogItem()
    const archiveMutation = useArchiveCatalogItem()
    const [form, setForm] = useState<FormState>(buildInitialForm(null))
    const [tagInput, setTagInput] = useState('')
    const [amenityInput, setAmenityInput] = useState('')
    const [galleryInput, setGalleryInput] = useState('')

    useEffect(() => {
        if (item) {
            setForm(buildInitialForm(item))
            setTagInput('')
            setAmenityInput('')
            setGalleryInput('')
        }
    }, [item])

    if (!open) return null

    const handleSave = async () => {
        if (!itemId) return
        const priceParsed = form.base_price ? Number(form.base_price) : 0
        if (Number.isNaN(priceParsed)) {
            toast.error('Preço inválido')
            return
        }

        // Atualizar content preservando dados originais e atualizando description no namespace
        const originalContent = (item?.content ?? {}) as Record<string, unknown>
        const namespace = item?.category ?? 'custom'
        const updatedContent = {
            ...originalContent,
            [namespace]: {
                ...((originalContent[namespace] ?? {}) as Record<string, unknown>),
                description: form.description || null,
            },
        }

        try {
            await updateMutation.mutateAsync({
                id: itemId,
                updates: {
                    name: form.name.trim(),
                    region: form.region.trim() || null,
                    region_country: form.region_country.trim() || null,
                    sub_category: form.sub_category.trim() || null,
                    base_price: priceParsed,
                    currency: form.currency,
                    supplier: form.supplier.trim() || null,
                    star_rating: form.star_rating,
                    tags: form.tags,
                    client_profile_tags: form.client_profile_tags,
                    amenities: form.amenities,
                    thumbnail_url: form.thumbnail_url.trim() || null,
                    gallery_urls: form.gallery_urls,
                    content: updatedContent as Json,
                    destination: form.region.trim() || null, // legado
                    location_city: form.region.trim() || null,
                    location_country: form.region_country.trim() || null,
                },
            })
            toast.success('Item atualizado')
            onClose()
        } catch (err) {
            toast.error('Erro ao salvar: ' + (err as Error).message)
        }
    }

    const handleArchive = async () => {
        if (!itemId || !item) return
        const archived = !item.is_archived
        try {
            await archiveMutation.mutateAsync({ id: itemId, archived })
            toast.success(archived ? 'Item arquivado' : 'Item restaurado')
            onClose()
        } catch (err) {
            toast.error('Erro: ' + (err as Error).message)
        }
    }

    const addTag = () => {
        const t = tagInput.trim().toLowerCase()
        if (!t || form.tags.includes(t)) {
            setTagInput('')
            return
        }
        setForm((p) => ({ ...p, tags: [...p.tags, t] }))
        setTagInput('')
    }

    const removeTag = (tag: string) => {
        setForm((p) => ({ ...p, tags: p.tags.filter((t) => t !== tag) }))
    }

    const toggleProfileTag = (tag: string) => {
        setForm((p) => ({
            ...p,
            client_profile_tags: p.client_profile_tags.includes(tag)
                ? p.client_profile_tags.filter((t) => t !== tag)
                : [...p.client_profile_tags, tag],
        }))
    }

    const addAmenity = () => {
        const a = amenityInput.trim()
        if (!a || form.amenities.includes(a)) {
            setAmenityInput('')
            return
        }
        setForm((p) => ({ ...p, amenities: [...p.amenities, a] }))
        setAmenityInput('')
    }

    const removeAmenity = (amenity: string) => {
        setForm((p) => ({ ...p, amenities: p.amenities.filter((a) => a !== amenity) }))
    }

    const addGallery = () => {
        const u = galleryInput.trim()
        if (!u || form.gallery_urls.includes(u)) {
            setGalleryInput('')
            return
        }
        setForm((p) => ({ ...p, gallery_urls: [...p.gallery_urls, u] }))
        setGalleryInput('')
    }

    const removeGallery = (url: string) => {
        setForm((p) => ({ ...p, gallery_urls: p.gallery_urls.filter((u) => u !== url) }))
    }

    const Icon = item ? ICON_MAP[item.category] ?? Package : Package
    const config = item ? CATEGORY_CONFIG[item.category as CatalogCategory] : null
    const isHotel = item?.category === 'hotel'
    const placeholder =
        'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 225"><rect width="400" height="225" fill="%23f1f5f9"/></svg>'

    return (
        <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
            <SheetContent
                side="right"
                className="w-full max-w-2xl p-0 sm:max-w-2xl"
            >
                <VisuallyHidden.Root>
                    <SheetTitle>{item?.name ?? 'Item do catálogo'}</SheetTitle>
                    <SheetDescription>Detalhes e edição do item</SheetDescription>
                </VisuallyHidden.Root>
                {isLoading || !item ? (
                    <div className="flex h-full items-center justify-center">
                        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                    </div>
                ) : (
                    <div className="flex h-full flex-col">
                        {/* Cover image */}
                        <div className="relative aspect-[16/9] flex-shrink-0 bg-slate-100">
                            <img
                                src={form.thumbnail_url || placeholder}
                                alt={form.name}
                                className="h-full w-full object-cover"
                            />
                            <div className="absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-md bg-black/60 px-2.5 py-1 text-xs font-medium text-white backdrop-blur-sm">
                                <Icon className="h-3.5 w-3.5" />
                                {config?.label ?? item.category}
                            </div>
                            <button
                                onClick={onClose}
                                className="absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm hover:bg-black/80"
                            >
                                <X className="h-4 w-4" />
                            </button>
                            {item.is_archived ? (
                                <div className="absolute bottom-4 left-4 inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-2.5 py-1 text-xs font-medium text-white">
                                    <Archive className="h-3.5 w-3.5" />
                                    Arquivado
                                </div>
                            ) : null}
                            {item.usage_count && item.usage_count > 0 ? (
                                <div className="absolute bottom-4 right-4 inline-flex items-center gap-1.5 rounded-md bg-emerald-500/90 px-2.5 py-1 text-xs font-medium text-white">
                                    <TrendingUp className="h-3.5 w-3.5" />
                                    Usado {item.usage_count}× · última {item.last_used_at ? new Date(item.last_used_at).toLocaleDateString('pt-BR') : '?'}
                                </div>
                            ) : null}
                        </div>

                        {/* Conteúdo rolável */}
                        <div className="flex-1 overflow-y-auto px-6 py-6">
                            {/* Identidade */}
                            <Section title="Identidade">
                                <Field label="Nome">
                                    <Input
                                        value={form.name}
                                        onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                                        placeholder="Ex: Bambu Indah — Ubud"
                                    />
                                </Field>
                                <div className="grid grid-cols-2 gap-3">
                                    <Field label="Fornecedor">
                                        <Input
                                            value={form.supplier}
                                            onChange={(e) =>
                                                setForm((p) => ({ ...p, supplier: e.target.value }))
                                            }
                                            placeholder="Iterpec, manual, etc"
                                        />
                                    </Field>
                                    <Field label="Sub-categoria">
                                        <Input
                                            value={form.sub_category}
                                            onChange={(e) =>
                                                setForm((p) => ({ ...p, sub_category: e.target.value }))
                                            }
                                            placeholder="Ex: resort, urban"
                                        />
                                    </Field>
                                </div>
                            </Section>

                            <Section title="Localização">
                                <div className="grid grid-cols-2 gap-3">
                                    <Field label="Cidade / Região">
                                        <Input
                                            value={form.region}
                                            onChange={(e) =>
                                                setForm((p) => ({ ...p, region: e.target.value }))
                                            }
                                            placeholder="Ex: Ubud, Bali"
                                        />
                                    </Field>
                                    <Field label="País">
                                        <Input
                                            value={form.region_country}
                                            onChange={(e) =>
                                                setForm((p) => ({ ...p, region_country: e.target.value }))
                                            }
                                            placeholder="Ex: Indonésia"
                                        />
                                    </Field>
                                </div>
                            </Section>

                            <Section title="Preço">
                                <div className="grid grid-cols-3 gap-3">
                                    <div className="col-span-2">
                                        <Field label="Preço base">
                                            <Input
                                                type="number"
                                                value={form.base_price}
                                                onChange={(e) =>
                                                    setForm((p) => ({ ...p, base_price: e.target.value }))
                                                }
                                                placeholder="0"
                                            />
                                        </Field>
                                    </div>
                                    <Field label="Moeda">
                                        <select
                                            value={form.currency}
                                            onChange={(e) =>
                                                setForm((p) => ({ ...p, currency: e.target.value }))
                                            }
                                            className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                                        >
                                            <option value="BRL">BRL</option>
                                            <option value="USD">USD</option>
                                            <option value="EUR">EUR</option>
                                        </select>
                                    </Field>
                                </div>
                            </Section>

                            {isHotel && (
                                <Section title="Estrelas">
                                    <div className="flex gap-2">
                                        {[1, 2, 3, 4, 5].map((n) => (
                                            <button
                                                key={n}
                                                onClick={() =>
                                                    setForm((p) => ({
                                                        ...p,
                                                        star_rating: p.star_rating === n ? null : n,
                                                    }))
                                                }
                                                className="inline-flex items-center justify-center p-1 transition hover:scale-110"
                                            >
                                                <Star
                                                    className={cn(
                                                        'h-7 w-7',
                                                        (form.star_rating ?? 0) >= n
                                                            ? 'fill-amber-400 text-amber-400'
                                                            : 'fill-slate-200 text-slate-200'
                                                    )}
                                                />
                                            </button>
                                        ))}
                                    </div>
                                </Section>
                            )}

                            <Section title="Descrição">
                                <Textarea
                                    rows={4}
                                    value={form.description}
                                    onChange={(e) =>
                                        setForm((p) => ({ ...p, description: e.target.value }))
                                    }
                                    placeholder="Como você descreveria isso pra um cliente?"
                                />
                            </Section>

                            <Section title="Tags (texto livre)">
                                <div className="mb-2 flex flex-wrap gap-1.5">
                                    {form.tags.map((t) => (
                                        <span
                                            key={t}
                                            className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700"
                                        >
                                            {t}
                                            <button
                                                onClick={() => removeTag(t)}
                                                className="text-slate-400 hover:text-slate-700"
                                            >
                                                <X className="h-3 w-3" />
                                            </button>
                                        </span>
                                    ))}
                                </div>
                                <div className="flex gap-2">
                                    <Input
                                        value={tagInput}
                                        onChange={(e) => setTagInput(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                e.preventDefault()
                                                addTag()
                                            }
                                        }}
                                        placeholder="Digite e Enter pra adicionar"
                                    />
                                    <Button variant="outline" size="sm" onClick={addTag}>
                                        Adicionar
                                    </Button>
                                </div>
                            </Section>

                            <Section title="Perfil de cliente que combina">
                                <div className="flex flex-wrap gap-1.5">
                                    {PROFILE_TAG_OPTIONS.map((opt) => {
                                        const selected = form.client_profile_tags.includes(opt.value)
                                        return (
                                            <button
                                                key={opt.value}
                                                onClick={() => toggleProfileTag(opt.value)}
                                                className={cn(
                                                    'rounded-full px-3 py-1 text-xs font-medium transition',
                                                    selected
                                                        ? 'bg-indigo-600 text-white'
                                                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                                                )}
                                            >
                                                {opt.label}
                                            </button>
                                        )
                                    })}
                                </div>
                            </Section>

                            {(isHotel || form.amenities.length > 0) && (
                                <Section title="Comodidades">
                                    <div className="mb-2 flex flex-wrap gap-1.5">
                                        {form.amenities.map((a) => (
                                            <span
                                                key={a}
                                                className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2.5 py-1 text-xs text-blue-700"
                                            >
                                                {a}
                                                <button
                                                    onClick={() => removeAmenity(a)}
                                                    className="text-blue-400 hover:text-blue-700"
                                                >
                                                    <X className="h-3 w-3" />
                                                </button>
                                            </span>
                                        ))}
                                    </div>
                                    <div className="flex gap-2">
                                        <Input
                                            value={amenityInput}
                                            onChange={(e) => setAmenityInput(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') {
                                                    e.preventDefault()
                                                    addAmenity()
                                                }
                                            }}
                                            placeholder="Ex: Piscina, Wi-Fi, Café da manhã"
                                        />
                                        <Button variant="outline" size="sm" onClick={addAmenity}>
                                            Adicionar
                                        </Button>
                                    </div>
                                </Section>
                            )}

                            <Section title="Foto de capa">
                                <Input
                                    value={form.thumbnail_url}
                                    onChange={(e) =>
                                        setForm((p) => ({ ...p, thumbnail_url: e.target.value }))
                                    }
                                    placeholder="https://..."
                                />
                            </Section>

                            <Section title="Galeria de fotos">
                                {form.gallery_urls.length > 0 ? (
                                    <div className="mb-3 grid grid-cols-3 gap-2">
                                        {form.gallery_urls.map((url) => (
                                            <div key={url} className="group relative aspect-square overflow-hidden rounded-md bg-slate-100">
                                                <img src={url} alt="" className="h-full w-full object-cover" />
                                                <button
                                                    onClick={() => removeGallery(url)}
                                                    className="absolute right-1 top-1 inline-flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition group-hover:opacity-100"
                                                >
                                                    <Trash2 className="h-3 w-3" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="mb-2 rounded-md border border-dashed border-slate-300 py-6 text-center text-xs text-slate-500">
                                        <ImageIcon className="mx-auto mb-1 h-5 w-5" />
                                        Nenhuma foto na galeria
                                    </div>
                                )}
                                <div className="flex gap-2">
                                    <Input
                                        value={galleryInput}
                                        onChange={(e) => setGalleryInput(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                e.preventDefault()
                                                addGallery()
                                            }
                                        }}
                                        placeholder="Cole URL de foto e Enter"
                                    />
                                    <Button variant="outline" size="sm" onClick={addGallery}>
                                        Adicionar
                                    </Button>
                                </div>
                            </Section>

                            {item.last_used_at || item.created_at ? (
                                <Section title="Histórico">
                                    <div className="space-y-1 text-xs text-slate-500">
                                        {item.created_at ? (
                                            <div className="flex items-center gap-2">
                                                <Calendar className="h-3.5 w-3.5" />
                                                Adicionado em {new Date(item.created_at).toLocaleDateString('pt-BR')}
                                            </div>
                                        ) : null}
                                        {item.last_used_at ? (
                                            <div className="flex items-center gap-2">
                                                <TrendingUp className="h-3.5 w-3.5" />
                                                Último uso em {new Date(item.last_used_at).toLocaleDateString('pt-BR')}
                                            </div>
                                        ) : null}
                                        {item.source_provider ? (
                                            <div className="flex items-center gap-2">
                                                <Package className="h-3.5 w-3.5" />
                                                Origem: {item.source_provider}
                                            </div>
                                        ) : null}
                                    </div>
                                </Section>
                            ) : null}
                        </div>

                        {/* Footer fixo */}
                        <div className="flex flex-shrink-0 items-center justify-between border-t border-slate-200 bg-slate-50 px-6 py-3">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handleArchive}
                                disabled={archiveMutation.isPending}
                            >
                                {item.is_archived ? (
                                    <>
                                        <ArchiveRestore className="mr-1.5 h-4 w-4" />
                                        Restaurar
                                    </>
                                ) : (
                                    <>
                                        <Archive className="mr-1.5 h-4 w-4" />
                                        Arquivar
                                    </>
                                )}
                            </Button>
                            <div className="flex items-center gap-2">
                                <Button variant="ghost" size="sm" onClick={onClose}>
                                    Cancelar
                                </Button>
                                <Button
                                    size="sm"
                                    onClick={handleSave}
                                    disabled={updateMutation.isPending || !form.name.trim()}
                                >
                                    {updateMutation.isPending ? (
                                        <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                                    ) : (
                                        <Save className="mr-1.5 h-4 w-4" />
                                    )}
                                    Salvar
                                </Button>
                            </div>
                        </div>
                    </div>
                )}
            </SheetContent>
        </Sheet>
    )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div className="mb-6">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                {title}
            </h3>
            <div className="space-y-2">{children}</div>
        </div>
    )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <label className="block">
            <span className="mb-1 block text-xs text-slate-600">{label}</span>
            {children}
        </label>
    )
}
