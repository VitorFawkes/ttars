/**
 * HotelEditor - Editor dedicado para hoteis
 *
 * Estrutura em 4 grupos:
 *   A. Identidade (galeria, nome, localizacao, estrelas)
 *   B. Estadia & Preco (datas, horarios collapse, quarto, regime, preco)
 *   C. Condicoes (comodidades, politica de cancelamento) — sempre visivel
 *   D. Detalhes opcionais (descricao, upgrades, observacoes) — colapsado por padrao
 */

import { useState, useCallback, useMemo } from 'react'
import { Plus, MapPin, Calendar, Bed, Utensils, Clock, FileText, Building2, Wifi, Ban, Star, X, ChevronDown, StickyNote } from 'lucide-react'
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

const AMENITIES_PREVIEW_LIMIT = 6
const GROUP_LABEL_CLASS = 'text-[10px] uppercase tracking-widest text-slate-400 font-semibold'

export function HotelEditor({ data, onChange, itemId }: HotelEditorProps) {
    const rawHotelData = data || createInitialHotelData()
    const hotelData = {
        ...rawHotelData,
        options: rawHotelData.options || [],
        amenities: rawHotelData.amenities || [],
    }
    const [newAmenity, setNewAmenity] = useState('')
    const [showOptional, setShowOptional] = useState(false)
    const [showTimeDetail, setShowTimeDetail] = useState(false)
    const [showAllAmenities, setShowAllAmenities] = useState(false)
    const { getCurrency } = useProposalBuilder()
    const currency = getCurrency()
    const currencySymbol = CURRENCY_SYMBOLS[currency] || 'R$'

    const validation = useMemo(() => validateHotel(hotelData), [hotelData])

    const updateField = useCallback(<K extends keyof HotelData>(
        field: K,
        value: HotelData[K]
    ) => {
        const updated = { ...hotelData, [field]: value }
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
        onChange({ ...hotelData, options: [...hotelData.options, newOption] })
    }, [hotelData, onChange])

    const updateOption = useCallback((id: string, updates: Partial<HotelData['options'][0]>) => {
        onChange({
            ...hotelData,
            options: hotelData.options.map(opt => opt.id === id ? { ...opt, ...updates } : opt),
        })
    }, [hotelData, onChange])

    const removeOption = useCallback((id: string) => {
        onChange({ ...hotelData, options: hotelData.options.filter(opt => opt.id !== id) })
    }, [hotelData, onChange])

    const setRecommended = useCallback((id: string) => {
        onChange({
            ...hotelData,
            options: hotelData.options.map(opt => ({ ...opt, is_recommended: opt.id === id })),
        })
    }, [hotelData, onChange])

    const toggleOptionEnabled = useCallback((id: string) => {
        onChange({
            ...hotelData,
            options: hotelData.options.map(opt => opt.id === id ? { ...opt, enabled: !opt.enabled } : opt),
        })
    }, [hotelData, onChange])

    const reorderOptions = useCallback((reorderedOptions: HotelOption[]) => {
        onChange({ ...hotelData, options: reorderedOptions })
    }, [hotelData, onChange])

    const addAmenity = useCallback(() => {
        if (newAmenity.trim()) {
            onChange({ ...hotelData, amenities: [...hotelData.amenities, newAmenity.trim()] })
            setNewAmenity('')
        }
    }, [hotelData, newAmenity, onChange])

    const removeAmenity = useCallback((index: number) => {
        onChange({ ...hotelData, amenities: hotelData.amenities.filter((_, i) => i !== index) })
    }, [hotelData, onChange])

    const totalPrice = hotelData.price_per_night * Math.max(1, hotelData.nights)

    // Empty hints para grupo D
    const emptyHints = useMemo(() => {
        const hints: string[] = []
        if (!hotelData.description?.trim()) hints.push('Sem descricao')
        if (hotelData.options.length === 0) hints.push('Sem upgrades')
        if (!hotelData.notes?.trim()) hints.push('Sem notas internas')
        return hints
    }, [hotelData.description, hotelData.options.length, hotelData.notes])

    const checkInTime = hotelData.check_in_time || '14:00'
    const checkOutTime = hotelData.check_out_time || '12:00'
    const isDefaultTimes = checkInTime === '14:00' && checkOutTime === '12:00'

    const visibleAmenities = showAllAmenities ? hotelData.amenities : hotelData.amenities.slice(0, AMENITIES_PREVIEW_LIMIT)
    const hiddenAmenitiesCount = Math.max(0, hotelData.amenities.length - AMENITIES_PREVIEW_LIMIT)

    return (
        <div className="space-y-0">
            {/* ====== GRUPO A — IDENTIDADE ====== */}
            <section className="space-y-4 pb-5">
                <span className={GROUP_LABEL_CLASS}>Identidade</span>

                <ImageGallery
                    images={hotelData.images || []}
                    mainImage={hotelData.image_url}
                    onImagesChange={(images) => updateField('images', images)}
                    onMainImageChange={(url) => updateField('image_url', url)}
                    itemId={itemId}
                    maxImages={6}
                />

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

                <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 items-end">
                    <div>
                        <label className="text-xs font-medium text-slate-500 mb-1 flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            Localizacao
                        </label>
                        <input
                            type="text"
                            value={hotelData.location_city}
                            onChange={(e) => updateField('location_city', e.target.value)}
                            placeholder="Cidade (ex: Sao Paulo)"
                            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                        />
                    </div>
                    <div>
                        <label className="text-xs font-medium text-slate-500 mb-1 block">Classificacao</label>
                        <div className="flex items-center gap-0.5 h-[38px]">
                            {[1, 2, 3, 4, 5].map((star) => (
                                <button
                                    key={star}
                                    onClick={() => updateField('star_rating', star as 1 | 2 | 3 | 4 | 5)}
                                    className="p-0.5 transition-colors"
                                    title={`${star} ${star === 1 ? 'estrela' : 'estrelas'}`}
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
                </div>
            </section>

            <div className="border-t border-slate-100" />

            {/* ====== GRUPO B — ESTADIA & PRECO ====== */}
            <section className="space-y-4 py-5">
                <span className={GROUP_LABEL_CLASS}>Estadia & Preco</span>

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

                {/* Horarios — collapse */}
                {!showTimeDetail ? (
                    <button
                        type="button"
                        onClick={() => setShowTimeDetail(true)}
                        className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 transition-colors"
                    >
                        <Clock className="h-3 w-3" />
                        <span>Check-in {checkInTime} <span aria-hidden>·</span> Check-out {checkOutTime}{isDefaultTimes && <span className="text-slate-400"> (padrao)</span>}</span>
                        <span className="text-indigo-500 hover:underline">Editar</span>
                    </button>
                ) : (
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-xs font-medium text-slate-500 mb-1 flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                Horario Check-in
                            </label>
                            <input
                                type="time"
                                value={checkInTime}
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
                                value={checkOutTime}
                                onChange={(e) => updateField('check_out_time', e.target.value)}
                                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                            />
                        </div>
                    </div>
                )}

                {hotelData.nights > 0 && (
                    <div className="text-center text-xs text-slate-500">
                        {hotelData.nights} {hotelData.nights === 1 ? 'noite' : 'noites'}
                    </div>
                )}

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
            </section>

            <div className="border-t border-slate-100" />

            {/* ====== GRUPO C — CONDICOES ====== */}
            <section className="space-y-4 py-5">
                <span className={GROUP_LABEL_CLASS}>Condicoes para o cliente</span>

                {/* Comodidades */}
                <div>
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-medium text-slate-600 flex items-center gap-1">
                            <Wifi className="h-3 w-3" />
                            Comodidades
                            {hotelData.amenities.length > 0 && (
                                <span className="text-slate-400 font-normal">({hotelData.amenities.length})</span>
                            )}
                        </span>
                    </div>

                    {hotelData.amenities.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mb-2">
                            {visibleAmenities.map((amenity, index) => (
                                <span
                                    key={index}
                                    className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-50 text-emerald-700 text-[11px] rounded-full border border-emerald-200"
                                >
                                    {amenity}
                                    <button
                                        onClick={() => removeAmenity(index)}
                                        className="ml-0.5 text-emerald-500 hover:text-red-500 transition-colors"
                                    >
                                        <X className="h-2.5 w-2.5" />
                                    </button>
                                </span>
                            ))}
                            {hiddenAmenitiesCount > 0 && !showAllAmenities && (
                                <button
                                    onClick={() => setShowAllAmenities(true)}
                                    className="inline-flex items-center px-2 py-0.5 bg-slate-100 text-slate-600 text-[11px] rounded-full border border-slate-200 hover:bg-slate-200 transition-colors"
                                >
                                    +{hiddenAmenitiesCount} mais
                                </button>
                            )}
                            {showAllAmenities && hotelData.amenities.length > AMENITIES_PREVIEW_LIMIT && (
                                <button
                                    onClick={() => setShowAllAmenities(false)}
                                    className="inline-flex items-center px-2 py-0.5 bg-slate-100 text-slate-600 text-[11px] rounded-full border border-slate-200 hover:bg-slate-200 transition-colors"
                                >
                                    Mostrar menos
                                </button>
                            )}
                        </div>
                    )}

                    <div className="flex items-center gap-2">
                        <input
                            type="text"
                            value={newAmenity}
                            onChange={(e) => setNewAmenity(e.target.value)}
                            placeholder={hotelData.amenities.length === 0 ? 'Ex: Wi-Fi, Piscina, Spa, Academia...' : 'Adicionar comodidade'}
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
                </div>

                {/* Politica de Cancelamento */}
                <div>
                    <label className="text-xs font-medium text-slate-600 mb-1 flex items-center gap-1">
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
            </section>

            <div className="border-t border-slate-100" />

            {/* ====== GRUPO D — DETALHES OPCIONAIS (collapse) ====== */}
            <section className="py-4">
                <button
                    type="button"
                    onClick={() => setShowOptional(!showOptional)}
                    className="w-full flex items-center justify-between text-left group"
                >
                    <div className="flex items-center gap-2">
                        <span className={GROUP_LABEL_CLASS}>Detalhes opcionais</span>
                        {emptyHints.length > 0 && !showOptional && (
                            <span className="text-[11px] text-slate-400 normal-case font-normal tracking-normal">
                                {emptyHints.join(' · ')}
                            </span>
                        )}
                    </div>
                    <ChevronDown
                        className={cn(
                            'h-4 w-4 text-slate-400 transition-transform group-hover:text-slate-600',
                            showOptional && 'rotate-180'
                        )}
                    />
                </button>

                {showOptional && (
                    <div className="mt-4 space-y-4">
                        {/* Descricao */}
                        <div>
                            <label className="text-xs font-medium text-slate-500 mb-1 flex items-center gap-1">
                                <FileText className="h-3 w-3" />
                                Descricao
                            </label>
                            <textarea
                                value={hotelData.description || ''}
                                onChange={(e) => updateField('description', e.target.value)}
                                placeholder="Adicione uma descricao para o cliente ver mais detalhes sobre a hospedagem..."
                                rows={3}
                                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent resize-none"
                            />
                        </div>

                        {/* Opcoes de Quarto (Upgrades) */}
                        <div>
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-xs font-medium text-slate-600">
                                    Opcoes de Quarto (Upgrades)
                                    {hotelData.options.length > 0 && (
                                        <span className="text-slate-400 font-normal ml-1">({hotelData.options.length})</span>
                                    )}
                                </span>
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

                            {hotelData.options.length > 0 ? (
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
                            ) : (
                                <button
                                    type="button"
                                    onClick={addOption}
                                    className="w-full py-2 text-xs text-slate-400 border border-dashed border-slate-200 rounded-lg hover:border-slate-300 hover:text-slate-500 transition-colors"
                                >
                                    Adicione um upgrade (ex: Vista mar, Andar alto, Suite)
                                </button>
                            )}
                        </div>

                        {/* Notas Internas */}
                        <div>
                            <label className="text-xs font-medium text-slate-500 mb-1 flex items-center gap-1">
                                <StickyNote className="h-3 w-3" />
                                Observacoes Internas
                                <span className="text-slate-400 font-normal">(nao aparece para cliente)</span>
                            </label>
                            <input
                                type="text"
                                value={hotelData.notes || ''}
                                onChange={(e) => updateField('notes', e.target.value)}
                                placeholder="Lembretes para a equipe..."
                                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent bg-amber-50/50"
                            />
                        </div>
                    </div>
                )}
            </section>

            {/* Validation Feedback */}
            <ValidationFeedback
                errors={validation.errors}
                warnings={validation.warnings}
            />
        </div>
    )
}

export default HotelEditor
