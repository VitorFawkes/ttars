/**
 * TravelItemBlock — Item da viagem com 3 modos:
 * 1. Buscar no catálogo (hotel via LiteAPI, voo via AeroDataBox)
 * 2. Importar da proposta aceita (se existir)
 * 3. Preencher manualmente
 */

import { useState, useCallback } from 'react'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { HotelCatalogPicker } from '@/components/proposals/v4/HotelCatalogPicker'
import type { HotelDetailsResult } from '@/hooks/useHotelSearch'
import { cn } from '@/lib/utils'
import {
    Building2,
    Plane,
    Car,
    Sparkles,
    Shield,
    Search,
    Edit3,
    X,
    Upload,
    Loader2,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'

const TYPE_OPTIONS = [
    { value: 'hotel', label: 'Hotel', icon: Building2, color: 'text-emerald-600' },
    { value: 'flight', label: 'Voo', icon: Plane, color: 'text-sky-600' },
    { value: 'transfer', label: 'Transfer', icon: Car, color: 'text-teal-600' },
    { value: 'experience', label: 'Experiência', icon: Sparkles, color: 'text-orange-600' },
    { value: 'insurance', label: 'Seguro', icon: Shield, color: 'text-rose-600' },
]

interface TravelItemBlockProps {
    data: Record<string, unknown>
    onChange: (data: Record<string, unknown>) => void
}

type Mode = 'display' | 'edit' | 'search'

export function TravelItemBlock({ data, onChange }: TravelItemBlockProps) {
    const [mode, setMode] = useState<Mode>(data.title ? 'display' : 'edit')
    const [showCatalog, setShowCatalog] = useState(false)
    const [isUploading, setIsUploading] = useState(false)

    const itemType = String(data.item_type || 'hotel')
    const title = String(data.title || '')
    const description = String(data.description || '')
    const imageUrl = String(data.image_url || '')

    const typeConfig = TYPE_OPTIONS.find(t => t.value === itemType) || TYPE_OPTIONS[0]
    const Icon = typeConfig.icon

    // Import from hotel catalog
    const handleHotelImport = useCallback((hotel: HotelDetailsResult) => {
        onChange({
            ...data,
            item_type: 'hotel',
            title: hotel.name,
            description: [
                hotel.starRating ? `${hotel.starRating} estrelas` : '',
                hotel.city || hotel.address || '',
                hotel.amenities?.slice(0, 5).join(', ') || '',
            ].filter(Boolean).join(' | '),
            image_url: hotel.photos?.[0]?.url || '',
            catalog_data: {
                provider: hotel.provider,
                external_id: hotel.externalId,
                star_rating: hotel.starRating,
                guest_rating: hotel.guestRating,
                amenities: hotel.amenities,
                photos: hotel.photos?.map(p => p.url),
                address: hotel.address,
                phone: hotel.phone,
            },
        })
        setShowCatalog(false)
        setMode('display')
    }, [data, onChange])

    // Upload image
    const handleImageUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        setIsUploading(true)
        try {
            const ext = file.name.split('.').pop() || 'jpg'
            const path = `travel-items/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
            const { error } = await supabase.storage.from('trip-plan-assets').upload(path, file, { cacheControl: '3600', upsert: true })
            if (error) throw error
            const { data: urlData } = supabase.storage.from('trip-plan-assets').getPublicUrl(path)
            onChange({ ...data, image_url: urlData.publicUrl })
        } catch (err) {
            console.error('Upload error:', err)
        } finally {
            setIsUploading(false)
        }
    }, [data, onChange])

    // Catalog search view
    if (showCatalog) {
        return (
            <div className="space-y-2">
                <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-600">Buscar no Catálogo</span>
                    <button onClick={() => setShowCatalog(false)} className="p-1 text-slate-400 hover:text-slate-600">
                        <X className="h-3.5 w-3.5" />
                    </button>
                </div>
                <HotelCatalogPicker onImport={handleHotelImport} />
            </div>
        )
    }

    // Display mode (read-only with edit button)
    if (mode === 'display' && title) {
        return (
            <div className="flex items-start gap-3 group">
                {imageUrl ? (
                    <img src={imageUrl} alt={title} className="w-16 h-16 rounded-lg object-cover shrink-0" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
                ) : (
                    <div className={cn('w-16 h-16 rounded-lg flex items-center justify-center shrink-0', 'bg-slate-100')}>
                        <Icon className={cn('h-6 w-6', typeConfig.color)} />
                    </div>
                )}
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                        <Icon className={cn('h-3.5 w-3.5 shrink-0', typeConfig.color)} />
                        <span className="text-xs font-semibold text-slate-900 truncate">{title}</span>
                    </div>
                    {description && <p className="text-[10px] text-slate-500 mt-0.5 line-clamp-2">{description}</p>}
                </div>
                <button
                    onClick={() => setMode('edit')}
                    className="p-1.5 opacity-0 group-hover:opacity-100 text-slate-400 hover:text-slate-600 transition-opacity"
                >
                    <Edit3 className="h-3.5 w-3.5" />
                </button>
            </div>
        )
    }

    // Edit mode
    return (
        <div className="space-y-3">
            {/* Type selector */}
            <div className="flex gap-1 flex-wrap">
                {TYPE_OPTIONS.map(opt => (
                    <button
                        key={opt.value}
                        onClick={() => onChange({ ...data, item_type: opt.value })}
                        className={cn(
                            'px-2 py-1 rounded text-[10px] font-medium transition-colors flex items-center gap-1',
                            itemType === opt.value
                                ? 'bg-indigo-500 text-white'
                                : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                        )}
                    >
                        {opt.label}
                    </button>
                ))}
            </div>

            {/* Search button (hotel only for now) */}
            {itemType === 'hotel' && (
                <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowCatalog(true)}
                    className="w-full"
                >
                    <Search className="h-3.5 w-3.5 mr-1" />
                    Buscar hotel no catálogo
                </Button>
            )}

            {/* Manual fields */}
            <Input
                value={title}
                onChange={(e) => onChange({ ...data, title: e.target.value })}
                placeholder="Nome do item (ex: Hotel Copacabana Palace)"
                className="h-8 text-sm"
            />
            <Input
                value={description}
                onChange={(e) => onChange({ ...data, description: e.target.value })}
                placeholder="Descrição breve"
                className="h-7 text-xs"
            />

            {/* Image */}
            {imageUrl ? (
                <div className="relative group">
                    <img src={imageUrl} alt={title} className="w-full h-24 object-cover rounded-lg" />
                    <label className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer rounded-lg">
                        <span className="text-white text-xs">Trocar</span>
                        <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
                    </label>
                </div>
            ) : (
                <label className="flex items-center justify-center h-16 border-2 border-dashed border-slate-200 rounded-lg cursor-pointer hover:border-indigo-300">
                    {isUploading ? <Loader2 className="h-4 w-4 animate-spin text-slate-400" /> : (
                        <><Upload className="h-4 w-4 text-slate-400 mr-1" /><span className="text-xs text-slate-500">Foto</span></>
                    )}
                    <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
                </label>
            )}

            {title && (
                <button onClick={() => setMode('display')} className="text-xs text-indigo-600 hover:underline">
                    Concluir edição
                </button>
            )}
        </div>
    )
}
