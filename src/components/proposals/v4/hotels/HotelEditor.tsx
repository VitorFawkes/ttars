/**
 * HotelEditor - Editor dedicado para hoteis
 *
 * Layout direto sem expand/collapse
 * Campos: imagem, nome, cidade, datas, tipo quarto, regime, preco, estrelas, opcoes
 */

import { useState, useCallback, useMemo } from 'react'
import { Plus, MapPin, Calendar, Bed, Utensils, Clock, FileText, Building2, Wifi, Ban, Star, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import { useProposalBuilder } from '@/hooks/useProposalBuilder'
import {
    type HotelData,
    type HotelOption,
    type BoardType,
    BOARD_TYPE_LABELS,
    CURRENCY_SYMBOLS,
    createInitialHotelData,
    calculateNights,
} from './types'
import { validateHotel } from '../validation'
import { ValidationFeedback } from '../ValidationFeedback'
import { SortableOptionsContainer } from '../shared/SortableOptionsContainer'
import { SortableOptionItem } from '../shared/SortableOptionItem'
import { ImageGallery } from '../shared/ImageGallery'

interface HotelEditorProps {
    data: HotelData | null
    onChange: (data: HotelData) => void
    itemId: string
}

export function HotelEditor({ data, onChange, itemId }: HotelEditorProps) {
    const rawHotelData = data || createInitialHotelData()
    // Ensure arrays are always defined
    const hotelData = {
        ...rawHotelData,
        options: rawHotelData.options || [],
        amenities: rawHotelData.amenities || [],
    }
    const [newAmenity, setNewAmenity] = useState('')
    const { getCurrency } = useProposalBuilder()
    const currency = getCurrency()
    const currencySymbol = CURRENCY_SYMBOLS[currency] || 'R$'

    // Validação
    const validation = useMemo(() => validateHotel(hotelData), [hotelData])

    const updateField = useCallback(<K extends keyof HotelData>(
        field: K,
        value: HotelData[K]
    ) => {
        const updated = { ...hotelData, [field]: value }

        // Auto-calculate nights when dates change
        if (field === 'check_in_date' || field === 'check_out_date') {
            updated.nights = calculateNights(
                field === 'check_in_date' ? value as string : updated.check_in_date,
                field === 'check_out_date' ? value as string : updated.check_out_date
            )
        }

        onChange(updated)
    }, [hotelData, onChange])

    const addOption = useCallback(() => {
        const newOption: HotelOption = {
            id: crypto.randomUUID(),
            label: 'Nova opcao',
            price_delta: 0,
            is_recommended: false,
            enabled: true,
            ordem: hotelData.options.length,
        }
        onChange({
            ...hotelData,
            options: [...hotelData.options, newOption],
        })
    }, [hotelData, onChange])

    const updateOption = useCallback((id: string, updates: Partial<HotelData['options'][0]>) => {
        onChange({
            ...hotelData,
            options: hotelData.options.map(opt =>
                opt.id === id ? { ...opt, ...updates } : opt
            ),
        })
    }, [hotelData, onChange])

    const removeOption = useCallback((id: string) => {
        onChange({
            ...hotelData,
            options: hotelData.options.filter(opt => opt.id !== id),
        })
    }, [hotelData, onChange])

    const setRecommended = useCallback((id: string) => {
        onChange({
            ...hotelData,
            options: hotelData.options.map(opt => ({
                ...opt,
                is_recommended: opt.id === id,
            })),
        })
    }, [hotelData, onChange])

    const toggleOptionEnabled = useCallback((id: string) => {
        onChange({
            ...hotelData,
            options: hotelData.options.map(opt =>
                opt.id === id ? { ...opt, enabled: !opt.enabled } : opt
            ),
        })
    }, [hotelData, onChange])

    const reorderOptions = useCallback((reorderedOptions: HotelOption[]) => {
        onChange({
            ...hotelData,
            options: reorderedOptions,
        })
    }, [hotelData, onChange])

    // Amenities handlers
    const addAmenity = useCallback(() => {
        if (newAmenity.trim()) {
            onChange({
                ...hotelData,
                amenities: [...hotelData.amenities, newAmenity.trim()],
            })
            setNewAmenity('')
        }
    }, [hotelData, newAmenity, onChange])

    const removeAmenity = useCallback((index: number) => {
        onChange({
            ...hotelData,
            amenities: hotelData.amenities.filter((_, i) => i !== index),
        })
    }, [hotelData, onChange])

    const totalPrice = hotelData.price_per_night * Math.max(1, hotelData.nights)

    return (
        <div className="space-y-4">
            {/* Galeria de Imagens do Hotel */}
            <ImageGallery
                images={hotelData.images || []}
                mainImage={hotelData.image_url}
                onImagesChange={(images) => updateField('images', images)}
                onMainImageChange={(url) => updateField('image_url', url)}
                itemId={itemId}
                maxImages={6}
            />

            {/* Nome do Hotel */}
            <div>
                <label className="text-xs font-medium text-slate-500 mb-1 flex items-center gap-1">
                    <Building2 className="h-3 w-3" />
                    Nome do Hotel
                </label>
                <input
                    type="text"
                    value={hotelData.hotel_name}
                    onChange={(e) => updateField('hotel_name', e.target.value)}
                    placeholder="Ex: Grand Hyatt Sao Paulo"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                />
            </div>

            {/* Location Row */}
            <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-slate-400 flex-shrink-0" />
                <input
                    type="text"
                    value={hotelData.location_city}
                    onChange={(e) => updateField('location_city', e.target.value)}
                    placeholder="Cidade (ex: Sao Paulo)"
                    className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                />
            </div>

            {/* Star Rating */}
            <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-slate-500">Classificacao:</span>
                <div className="flex items-center gap-0.5">
                    {[1, 2, 3, 4, 5].map((star) => (
                        <button
                            key={star}
                            onClick={() => updateField('star_rating', star as 1 | 2 | 3 | 4 | 5)}
                            className="p-0.5 transition-colors"
                        >
                            <Star
                                className={cn(
                                    "h-5 w-5 transition-colors",
                                    star <= hotelData.star_rating
                                        ? "text-amber-400 fill-amber-400"
                                        : "text-slate-300"
                                )}
                            />
                        </button>
                    ))}
                </div>
            </div>

            {/* Dates Row */}
            <div className="grid grid-cols-2 gap-3">
                <div>
                    <label className="text-xs font-medium text-slate-500 mb-1 flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        Check-in
                    </label>
                    <input
                        type="date"
                        value={hotelData.check_in_date}
                        onChange={(e) => updateField('check_in_date', e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                    />
                </div>
                <div>
                    <label className="text-xs font-medium text-slate-500 mb-1 flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        Check-out
                    </label>
                    <input
                        type="date"
                        value={hotelData.check_out_date}
                        onChange={(e) => updateField('check_out_date', e.target.value)}
                        min={hotelData.check_in_date}
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                    />
                </div>
            </div>

            {/* Check-in/out Times */}
            <div className="grid grid-cols-2 gap-3">
                <div>
                    <label className="text-xs font-medium text-slate-500 mb-1 flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Horario Check-in
                    </label>
                    <input
                        type="time"
                        value={hotelData.check_in_time || '14:00'}
                        onChange={(e) => updateField('check_in_time', e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                    />
                </div>
                <div>
                    <label className="text-xs font-medium text-slate-500 mb-1 flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Horario Check-out
                    </label>
                    <input
                        type="time"
                        value={hotelData.check_out_time || '12:00'}
                        onChange={(e) => updateField('check_out_time', e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                    />
                </div>
            </div>

            {/* Nights display */}
            {hotelData.nights > 0 && (
                <div className="text-center text-sm text-slate-500">
                    {hotelData.nights} {hotelData.nights === 1 ? 'noite' : 'noites'}
                </div>
            )}

            {/* Room & Board Row */}
            <div className="grid grid-cols-2 gap-3">
                <div>
                    <label className="text-xs font-medium text-slate-500 mb-1 flex items-center gap-1">
                        <Bed className="h-3 w-3" />
                        Tipo de Quarto
                    </label>
                    <input
                        type="text"
                        value={hotelData.room_type}
                        onChange={(e) => updateField('room_type', e.target.value)}
                        placeholder="Standard, Deluxe, Suite..."
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                    />
                </div>
                <div>
                    <label className="text-xs font-medium text-slate-500 mb-1 flex items-center gap-1">
                        <Utensils className="h-3 w-3" />
                        Regime
                    </label>
                    <select
                        value={hotelData.board_type}
                        onChange={(e) => updateField('board_type', e.target.value as BoardType)}
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent bg-white"
                    >
                        {Object.entries(BOARD_TYPE_LABELS).map(([value, label]) => (
                            <option key={value} value={value}>{label}</option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Price Row */}
            <div className="flex items-center gap-3 p-3 bg-emerald-50 rounded-lg border border-emerald-200">
                <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-emerald-700">{currencySymbol}</span>
                    <input
                        type="number"
                        value={hotelData.price_per_night || ''}
                        onChange={(e) => updateField('price_per_night', parseFloat(e.target.value) || 0)}
                        placeholder="0,00"
                        step="0.01"
                        className="w-24 text-sm font-semibold text-emerald-800 bg-white border border-emerald-200 rounded px-2 py-1 outline-none focus:ring-2 focus:ring-emerald-500 text-right"
                    />
                    <span className="text-sm text-emerald-600">/noite</span>
                </div>

                <div className="flex-1 text-right">
                    <span className="text-sm text-emerald-600">× {hotelData.nights || 1} = </span>
                    <span className="text-lg font-bold text-emerald-700">
                        {currencySymbol} {totalPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </span>
                </div>
            </div>


            {/* Descricao */}
            <div>
                <label className="text-xs font-medium text-slate-500 mb-1 flex items-center gap-1">
                    <FileText className="h-3 w-3" />
                    Descricao (opcional)
                </label>
                <textarea
                    value={hotelData.description || ''}
                    onChange={(e) => updateField('description', e.target.value)}
                    placeholder="Detalhes adicionais sobre a hospedagem, comodidades, localizacao..."
                    rows={3}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent resize-none"
                />
            </div>

            {/* Amenities (Comodidades) */}
            <div className="border-t border-slate-200 pt-4">
                <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-medium text-slate-600 flex items-center gap-1">
                        <Wifi className="h-3 w-3" />
                        Comodidades
                    </span>
                </div>

                {hotelData.amenities.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-3">
                        {hotelData.amenities.map((amenity, index) => (
                            <span
                                key={index}
                                className="inline-flex items-center gap-1 px-2 py-1 bg-emerald-50 text-emerald-700 text-xs rounded-full border border-emerald-200"
                            >
                                {amenity}
                                <button
                                    onClick={() => removeAmenity(index)}
                                    className="ml-0.5 text-emerald-500 hover:text-red-500 transition-colors"
                                >
                                    <X className="h-3 w-3" />
                                </button>
                            </span>
                        ))}
                    </div>
                )}

                <div className="flex items-center gap-2">
                    <input
                        type="text"
                        value={newAmenity}
                        onChange={(e) => setNewAmenity(e.target.value)}
                        placeholder="ex: Wi-Fi, Piscina, Spa, Academia..."
                        className="flex-1 px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                        onKeyDown={(e) => e.key === 'Enter' && addAmenity()}
                    />
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={addAmenity}
                        disabled={!newAmenity.trim()}
                        className="h-8"
                    >
                        <Plus className="h-3 w-3" />
                    </Button>
                </div>

                {hotelData.amenities.length === 0 && (
                    <p className="text-xs text-slate-400 text-center py-2 mt-2">
                        Nenhuma comodidade adicionada
                    </p>
                )}
            </div>

            {/* Cancellation Policy */}
            <div>
                <label className="text-xs font-medium text-slate-500 mb-1 flex items-center gap-1">
                    <Ban className="h-3 w-3" />
                    Politica de Cancelamento
                </label>
                <textarea
                    value={hotelData.cancellation_policy || ''}
                    onChange={(e) => updateField('cancellation_policy', e.target.value)}
                    placeholder="Ex: Cancelamento gratuito ate 48h antes do check-in..."
                    rows={2}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent resize-none"
                />
            </div>

            {/* Notas Internas */}
            <div>
                <label className="text-xs font-medium text-slate-500 mb-1 block">
                    Observacoes Internas (nao aparece para cliente)
                </label>
                <input
                    type="text"
                    value={hotelData.notes || ''}
                    onChange={(e) => updateField('notes', e.target.value)}
                    placeholder="Notas internas..."
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent bg-amber-50"
                />
            </div>

            {/* Validation Feedback */}
            <ValidationFeedback
                errors={validation.errors}
                warnings={validation.warnings}
            />

            {/* Options (Room Upgrades) */}
            <div className="border-t border-slate-200 pt-4">
                <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-medium text-slate-600">Opcoes de Quarto (Upgrades)</span>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={addOption}
                        className="h-7 text-xs"
                    >
                        <Plus className="h-3 w-3 mr-1" />
                        Adicionar
                    </Button>
                </div>

                {hotelData.options.length > 0 && (
                    <SortableOptionsContainer
                        items={hotelData.options}
                        onReorder={reorderOptions}
                    >
                        <div className="space-y-2">
                            {hotelData.options
                                .sort((a, b) => a.ordem - b.ordem)
                                .map((option) => (
                                    <SortableOptionItem
                                        key={option.id}
                                        id={option.id}
                                        isRecommended={option.is_recommended}
                                        enabled={option.enabled ?? true}
                                        onSetRecommended={() => setRecommended(option.id)}
                                        onToggleEnabled={() => toggleOptionEnabled(option.id)}
                                        onRemove={() => removeOption(option.id)}
                                        accentColor="emerald"
                                    >
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="text"
                                                value={option.label}
                                                onChange={(e) => updateOption(option.id, { label: e.target.value })}
                                                placeholder="Nome da opcao"
                                                className={cn(
                                                    "flex-1 text-sm bg-transparent border-none outline-none",
                                                    !option.enabled && "text-slate-400"
                                                )}
                                            />

                                            <div className="flex items-center gap-1 text-sm text-slate-500">
                                                <span>+{currencySymbol}</span>
                                                <input
                                                    type="number"
                                                    value={option.price_delta || ''}
                                                    onChange={(e) => updateOption(option.id, { price_delta: parseFloat(e.target.value) || 0 })}
                                                    className="w-16 text-right bg-transparent border-none outline-none"
                                                    placeholder="0"
                                                    step="0.01"
                                                />
                                                <span>/noite</span>
                                            </div>
                                        </div>
                                    </SortableOptionItem>
                                ))}
                        </div>
                    </SortableOptionsContainer>
                )}

                {hotelData.options.length === 0 && (
                    <p className="text-xs text-slate-400 text-center py-2">
                        Nenhuma opcao de upgrade adicionada
                    </p>
                )}
            </div>
        </div>
    )
}

export default HotelEditor
