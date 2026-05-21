import { useState } from 'react'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/textarea'
import { Loader2, Star } from 'lucide-react'
import { toast } from 'sonner'
import { useOrg } from '@/contexts/OrgContext'
import { useCreateCatalogItem, type CatalogCategory } from '@/hooks/useCatalog'
import { cn } from '@/lib/utils'

interface Props {
    open: boolean
    onClose: () => void
}

const CATEGORY_OPTIONS: Array<{ value: CatalogCategory; label: string }> = [
    { value: 'hotel', label: 'Hotel / Pousada / Resort' },
    { value: 'experience', label: 'Experiência / Passeio' },
    { value: 'transfer', label: 'Transfer' },
    { value: 'cruise', label: 'Cruzeiro' },
    { value: 'insurance', label: 'Seguro' },
    { value: 'service', label: 'Serviço' },
    { value: 'fee', label: 'Taxa' },
    { value: 'custom', label: 'Outro' },
]

export function CatalogCreateModal({ open, onClose }: Props) {
    const { org } = useOrg()
    const create = useCreateCatalogItem()
    const [category, setCategory] = useState<CatalogCategory>('hotel')
    const [name, setName] = useState('')
    const [region, setRegion] = useState('')
    const [country, setCountry] = useState('')
    const [price, setPrice] = useState('')
    const [supplier, setSupplier] = useState('')
    const [stars, setStars] = useState<number | null>(null)
    const [description, setDescription] = useState('')
    const [thumbnail, setThumbnail] = useState('')

    const reset = () => {
        setCategory('hotel')
        setName('')
        setRegion('')
        setCountry('')
        setPrice('')
        setSupplier('')
        setStars(null)
        setDescription('')
        setThumbnail('')
    }

    const handleSave = async () => {
        if (!name.trim()) {
            toast.error('Nome é obrigatório')
            return
        }
        if (!org?.id) {
            toast.error('Workspace não identificado')
            return
        }

        const priceNum = price ? Number(price) : 0
        if (Number.isNaN(priceNum)) {
            toast.error('Preço inválido')
            return
        }

        const namespace = category
        const content = {
            [namespace]: {
                description: description.trim() || null,
            },
        }

        try {
            await create.mutateAsync({
                org_id: org.id,
                category,
                name: name.trim(),
                content,
                base_price: priceNum,
                currency: 'BRL',
                supplier: supplier.trim() || null,
                region: region.trim() || null,
                region_country: country.trim() || null,
                destination: region.trim() || null,
                location_city: region.trim() || null,
                location_country: country.trim() || null,
                star_rating: stars,
                thumbnail_url: thumbnail.trim() || null,
                source_provider: 'manual',
                ownership_type: 'personal',
                is_shared: true,
                tags: [],
                client_profile_tags: [],
                season_tags: [],
                amenities: [],
                gallery_urls: [],
                is_archived: false,
            })
            toast.success('Item adicionado ao catálogo')
            reset()
            onClose()
        } catch (err) {
            toast.error('Erro: ' + (err as Error).message)
        }
    }

    const isHotel = category === 'hotel'

    return (
        <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle>Adicionar item ao Catálogo</DialogTitle>
                    <DialogDescription>
                        Crie um novo item manualmente. Você pode editar tags, fotos e detalhes depois.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-2">
                    <label className="block">
                        <span className="mb-1 block text-xs text-slate-600">Tipo</span>
                        <select
                            value={category}
                            onChange={(e) => setCategory(e.target.value as CatalogCategory)}
                            className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                        >
                            {CATEGORY_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                    {opt.label}
                                </option>
                            ))}
                        </select>
                    </label>

                    <label className="block">
                        <span className="mb-1 block text-xs text-slate-600">
                            Nome <span className="text-red-500">*</span>
                        </span>
                        <Input
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Ex: Hotel Fasano Rio"
                            autoFocus
                        />
                    </label>

                    <div className="grid grid-cols-2 gap-3">
                        <label className="block">
                            <span className="mb-1 block text-xs text-slate-600">Cidade / Região</span>
                            <Input
                                value={region}
                                onChange={(e) => setRegion(e.target.value)}
                                placeholder="Ex: Ipanema, Rio"
                            />
                        </label>
                        <label className="block">
                            <span className="mb-1 block text-xs text-slate-600">País</span>
                            <Input
                                value={country}
                                onChange={(e) => setCountry(e.target.value)}
                                placeholder="Ex: Brasil"
                            />
                        </label>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <label className="block">
                            <span className="mb-1 block text-xs text-slate-600">Preço base (BRL)</span>
                            <Input
                                type="number"
                                value={price}
                                onChange={(e) => setPrice(e.target.value)}
                                placeholder="0"
                            />
                        </label>
                        <label className="block">
                            <span className="mb-1 block text-xs text-slate-600">Fornecedor</span>
                            <Input
                                value={supplier}
                                onChange={(e) => setSupplier(e.target.value)}
                                placeholder="Iterpec, manual, etc"
                            />
                        </label>
                    </div>

                    {isHotel && (
                        <div>
                            <span className="mb-1 block text-xs text-slate-600">Estrelas</span>
                            <div className="flex gap-1">
                                {[1, 2, 3, 4, 5].map((n) => (
                                    <button
                                        key={n}
                                        type="button"
                                        onClick={() => setStars(stars === n ? null : n)}
                                        className="inline-flex items-center justify-center p-1 transition hover:scale-110"
                                    >
                                        <Star
                                            className={cn(
                                                'h-6 w-6',
                                                (stars ?? 0) >= n
                                                    ? 'fill-amber-400 text-amber-400'
                                                    : 'fill-slate-200 text-slate-200'
                                            )}
                                        />
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    <label className="block">
                        <span className="mb-1 block text-xs text-slate-600">Foto de capa (URL)</span>
                        <Input
                            value={thumbnail}
                            onChange={(e) => setThumbnail(e.target.value)}
                            placeholder="https://..."
                        />
                    </label>

                    <label className="block">
                        <span className="mb-1 block text-xs text-slate-600">Descrição curta</span>
                        <Textarea
                            rows={3}
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="Como você descreveria isso pra um cliente?"
                        />
                    </label>
                </div>

                <DialogFooter>
                    <Button variant="ghost" onClick={onClose}>
                        Cancelar
                    </Button>
                    <Button onClick={handleSave} disabled={create.isPending || !name.trim()}>
                        {create.isPending ? (
                            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                        ) : null}
                        Adicionar
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
