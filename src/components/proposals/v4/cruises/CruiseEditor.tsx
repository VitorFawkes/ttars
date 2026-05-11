/**
 * CruiseEditor - Editor dedicado para cruzeiros
 *
 * Layout direto sem expand/collapse
 * Campos: imagem, companhia, navio, roteiro, datas, cabine, regime, preco, opcoes
 */

import { useState, useCallback } from 'react'
import { Plus, X, Ship, Calendar, Users, Anchor, MapPin, Utensils, FileText, Ban } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import { useProposalBuilder } from '@/hooks/useProposalBuilder'
import { ItemImageUploader } from '@/components/proposals/builder/ItemImageUploader'
import {
    type CruiseData,
    type CruiseOption,
    type CabinType,
    type BoardType,
    CRUISE_LINES,
    CABIN_TYPES,
    BOARD_TYPES,
    CURRENCY_SYMBOLS,
    createInitialCruiseData,
    calculateNights,
    getCruiseLineInfo,
} from './types'
import { SortableOptionsContainer } from '../shared/SortableOptionsContainer'
import { SortableOptionItem } from '../shared/SortableOptionItem'

interface CruiseEditorProps {
    data: CruiseData | null
    onChange: (data: CruiseData) => void
    itemId: string
}

export function CruiseEditor({ data, onChange, itemId }: CruiseEditorProps) {
    const rawCruiseData = data || createInitialCruiseData()
    // Ensure arrays are always defined
    const cruiseData = {
        ...rawCruiseData,
        options: rawCruiseData.options || [],
        included: rawCruiseData.included || [],
    }
    const [newIncluded, setNewIncluded] = useState('')
    const { getCurrency } = useProposalBuilder()
    const currency = getCurrency()
    const currencySymbol = CURRENCY_SYMBOLS[currency] || 'R$'

    const cruiseLine = getCruiseLineInfo(cruiseData.cruise_line)

    const updateField = useCallback(<K extends keyof CruiseData>(
        field: K,
        value: CruiseData[K]
    ) => {
        const updated = { ...cruiseData, [field]: value }

        // Auto-calculate nights when dates change
        if (field === 'embarkation_date' || field === 'disembarkation_date') {
            updated.nights = calculateNights(
                field === 'embarkation_date' ? value as string : updated.embarkation_date,
                field === 'disembarkation_date' ? value as string : updated.disembarkation_date
            )
        }

        onChange(updated)
    }, [cruiseData, onChange])

    // Included items handlers
    const addIncluded = useCallback(() => {
        if (newIncluded.trim()) {
            onChange({
                ...cruiseData,
                included: [...cruiseData.included, newIncluded.trim()],
            })
            setNewIncluded('')
        }
    }, [cruiseData, newIncluded, onChange])

    const removeIncluded = useCallback((index: number) => {
        onChange({
            ...cruiseData,
            included: cruiseData.included.filter((_, i) => i !== index),
        })
    }, [cruiseData, onChange])

    // Option handlers
    const addOption = useCallback(() => {
        const newOption: CruiseOption = {
            id: crypto.randomUUID(),
            cabin_type: 'balcony',
            label: 'Nova opção',
            price: 0,
            is_recommended: false,
            enabled: true,
            ordem: cruiseData.options.length,
        }
        onChange({
            ...cruiseData,
            options: [...cruiseData.options, newOption],
        })
    }, [cruiseData, onChange])

    const updateOption = useCallback((id: string, updates: Partial<CruiseOption>) => {
        onChange({
            ...cruiseData,
            options: cruiseData.options.map(opt =>
                opt.id === id ? { ...opt, ...updates } : opt
            ),
        })
    }, [cruiseData, onChange])

    const removeOption = useCallback((id: string) => {
        onChange({
            ...cruiseData,
            options: cruiseData.options.filter(opt => opt.id !== id),
        })
    }, [cruiseData, onChange])

    const setRecommended = useCallback((id: string) => {
        onChange({
            ...cruiseData,
            options: cruiseData.options.map(opt => ({
                ...opt,
                is_recommended: opt.id === id,
            })),
        })
    }, [cruiseData, onChange])

    const toggleOptionEnabled = useCallback((id: string) => {
        onChange({
            ...cruiseData,
            options: cruiseData.options.map(opt =>
                opt.id === id ? { ...opt, enabled: !opt.enabled } : opt
            ),
        })
    }, [cruiseData, onChange])

    const reorderOptions = useCallback((reorderedOptions: CruiseOption[]) => {
        onChange({
            ...cruiseData,
            options: reorderedOptions,
        })
    }, [cruiseData, onChange])

    const totalPrice = cruiseData.price_type === 'per_person'
        ? cruiseData.price * cruiseData.passengers
        : cruiseData.price

    return (
        <div className="space-y-4">
            {/* Imagem do Cruzeiro */}
            <div>
                <label className="text-xs font-medium text-slate-500 mb-2 block">
                    Imagem do Cruzeiro/Navio
                </label>
                <ItemImageUploader
                    imageUrl={cruiseData.image_url || null}
                    onImageChange={(url) => updateField('image_url', url)}
                    itemId={itemId}
                />
            </div>

            {/* Nome do Cruzeiro */}
            <div>
                <label className="text-xs font-medium text-slate-500 mb-1 flex items-center gap-1">
                    <Ship className="h-3 w-3" />
                    Nome do Cruzeiro
                </label>
                <input
                    type="text"
                    value={cruiseData.cruise_name}
                    onChange={(e) => updateField('cruise_name', e.target.value)}
                    placeholder="Ex: Reveillon no Caribe 2025"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
            </div>

            {/* Companhia e Navio */}
            <div className="grid grid-cols-2 gap-3">
                <div>
                    <label className="text-xs font-medium text-slate-500 mb-1 block">
                        Companhia
                    </label>
                    <select
                        value={cruiseData.cruise_line}
                        onChange={(e) => updateField('cruise_line', e.target.value)}
                        className={cn(
                            "w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent",
                            cruiseLine.color
                        )}
                    >
                        {CRUISE_LINES.map(line => (
                            <option key={line.code} value={line.code}>{line.name}</option>
                        ))}
                    </select>
                </div>
                <div>
                    <label className="text-xs font-medium text-slate-500 mb-1 block">
                        Navio
                    </label>
                    <input
                        type="text"
                        value={cruiseData.ship_name}
                        onChange={(e) => updateField('ship_name', e.target.value)}
                        placeholder="Ex: MSC Seaside"
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    />
                </div>
            </div>

            {/* Roteiro */}
            <div>
                <label className="text-xs font-medium text-slate-500 mb-1 flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    Roteiro / Itinerário
                </label>
                <textarea
                    value={cruiseData.itinerary}
                    onChange={(e) => updateField('itinerary', e.target.value)}
                    placeholder="Ex: Santos > Búzios > Ilhabela > Santos"
                    rows={2}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
                />
            </div>

            {/* Embarque/Desembarque */}
            <div className="grid grid-cols-2 gap-3">
                <div>
                    <label className="text-xs font-medium text-slate-500 mb-1 flex items-center gap-1">
                        <Anchor className="h-3 w-3" />
                        Porto de Embarque
                    </label>
                    <input
                        type="text"
                        value={cruiseData.embarkation_port}
                        onChange={(e) => updateField('embarkation_port', e.target.value)}
                        placeholder="Ex: Santos"
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    />
                </div>
                <div>
                    <label className="text-xs font-medium text-slate-500 mb-1 flex items-center gap-1">
                        <Anchor className="h-3 w-3" />
                        Porto de Desembarque
                    </label>
                    <input
                        type="text"
                        value={cruiseData.disembarkation_port}
                        onChange={(e) => updateField('disembarkation_port', e.target.value)}
                        placeholder="Ex: Santos"
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    />
                </div>
            </div>

            {/* Datas */}
            <div className="grid grid-cols-2 gap-3">
                <div>
                    <label className="text-xs font-medium text-slate-500 mb-1 flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        Data de Embarque
                    </label>
                    <input
                        type="date"
                        value={cruiseData.embarkation_date}
                        onChange={(e) => updateField('embarkation_date', e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    />
                </div>
                <div>
                    <label className="text-xs font-medium text-slate-500 mb-1 flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        Data de Desembarque
                    </label>
                    <input
                        type="date"
                        value={cruiseData.disembarkation_date}
                        onChange={(e) => updateField('disembarkation_date', e.target.value)}
                        min={cruiseData.embarkation_date}
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    />
                </div>
            </div>

            {/* Noites display */}
            {cruiseData.nights > 0 && (
                <div className="text-center text-sm text-slate-500 py-1 bg-slate-50 rounded-lg">
                    <Ship className="h-4 w-4 inline mr-1" />
                    {cruiseData.nights} {cruiseData.nights === 1 ? 'noite' : 'noites'} a bordo
                </div>
            )}

            {/* Cabine e Regime */}
            <div className="grid grid-cols-2 gap-3">
                <div>
                    <label className="text-xs font-medium text-slate-500 mb-1 block">
                        Tipo de Cabine
                    </label>
                    <select
                        value={cruiseData.cabin_type}
                        onChange={(e) => updateField('cabin_type', e.target.value as CabinType)}
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white"
                    >
                        {CABIN_TYPES.map(cabin => (
                            <option key={cabin.value} value={cabin.value}>
                                {cabin.label} - {cabin.description}
                            </option>
                        ))}
                    </select>
                </div>
                <div>
                    <label className="text-xs font-medium text-slate-500 mb-1 flex items-center gap-1">
                        <Utensils className="h-3 w-3" />
                        Regime
                    </label>
                    <select
                        value={cruiseData.board_type}
                        onChange={(e) => updateField('board_type', e.target.value as BoardType)}
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white"
                    >
                        {Object.entries(BOARD_TYPES).map(([value, label]) => (
                            <option key={value} value={value}>{label}</option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Passageiros */}
            <div>
                <label className="text-xs font-medium text-slate-500 mb-1 flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    Passageiros
                </label>
                <input
                    type="number"
                    value={cruiseData.passengers}
                    onChange={(e) => updateField('passengers', parseInt(e.target.value) || 1)}
                    min={1}
                    className="w-32 px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
            </div>

            {/* Price Row */}
            <div className="p-3 bg-indigo-50 rounded-lg border border-indigo-200">
                <div className="flex items-center gap-4 mb-2">
                    <label className="text-xs font-medium text-slate-600">Tipo de preço:</label>
                    <div className="flex items-center gap-3">
                        <label className="flex items-center gap-1.5 cursor-pointer">
                            <input
                                type="radio"
                                checked={cruiseData.price_type === 'per_person'}
                                onChange={() => updateField('price_type', 'per_person')}
                                className="text-indigo-600 focus:ring-indigo-500"
                            />
                            <span className="text-sm text-slate-600">Por pessoa</span>
                        </label>
                        <label className="flex items-center gap-1.5 cursor-pointer">
                            <input
                                type="radio"
                                checked={cruiseData.price_type === 'total'}
                                onChange={() => updateField('price_type', 'total')}
                                className="text-indigo-600 focus:ring-indigo-500"
                            />
                            <span className="text-sm text-slate-600">Total</span>
                        </label>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-indigo-700">{currencySymbol}</span>
                        <input
                            type="number"
                            value={cruiseData.price || ''}
                            onChange={(e) => updateField('price', parseFloat(e.target.value) || 0)}
                            placeholder="0,00"
                            step="0.01"
                            className="w-28 text-sm font-semibold text-indigo-800 bg-white border border-indigo-200 rounded px-2 py-1 outline-none focus:ring-2 focus:ring-indigo-500 text-right"
                        />
                        {cruiseData.price_type === 'per_person' && (
                            <span className="text-sm text-indigo-600">/pessoa</span>
                        )}
                    </div>

                    {cruiseData.price_type === 'per_person' && (
                        <div className="flex-1 text-right">
                            <span className="text-sm text-indigo-600">× {cruiseData.passengers} = </span>
                            <span className="text-lg font-bold text-indigo-700">
                                {currencySymbol} {totalPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </span>
                        </div>
                    )}
                </div>
            </div>

            {/* Descrição */}
            <div>
                <label className="text-xs font-medium text-slate-500 mb-1 flex items-center gap-1">
                    <FileText className="h-3 w-3" />
                    Descrição (opcional)
                </label>
                <textarea
                    value={cruiseData.description || ''}
                    onChange={(e) => updateField('description', e.target.value)}
                    placeholder="Detalhes sobre o cruzeiro, atividades a bordo, destaques..."
                    rows={3}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
                />
            </div>

            {/* Política de Cancelamento */}
            <div>
                <label className="text-xs font-medium text-slate-500 mb-1 flex items-center gap-1">
                    <Ban className="h-3 w-3" />
                    Política de Cancelamento
                </label>
                <textarea
                    value={cruiseData.cancellation_policy || ''}
                    onChange={(e) => updateField('cancellation_policy', e.target.value || null)}
                    placeholder="Ex: Cancelamento com 60 dias de antecedência..."
                    rows={2}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
                />
            </div>

            {/* Notas Internas */}
            <div>
                <label className="text-xs font-medium text-slate-500 mb-1 block">
                    Observações Internas (não aparece para cliente)
                </label>
                <input
                    type="text"
                    value={cruiseData.notes}
                    onChange={(e) => updateField('notes', e.target.value)}
                    placeholder="Notas internas..."
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-amber-50"
                />
            </div>

            {/* O que está incluso */}
            <div className="border-t border-slate-200 pt-4">
                <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-medium text-slate-600">
                        O que está incluso
                    </span>
                </div>

                {cruiseData.included.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-3">
                        {cruiseData.included.map((item, index) => (
                            <span
                                key={index}
                                className="inline-flex items-center gap-1 px-2 py-1 bg-indigo-50 text-indigo-700 text-xs rounded-full border border-indigo-200"
                            >
                                {item}
                                <button
                                    onClick={() => removeIncluded(index)}
                                    className="ml-0.5 text-indigo-500 hover:text-red-500 transition-colors"
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
                        value={newIncluded}
                        onChange={(e) => setNewIncluded(e.target.value)}
                        placeholder="ex: Taxas portuárias, Refeições, Shows..."
                        className="flex-1 px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        onKeyDown={(e) => e.key === 'Enter' && addIncluded()}
                    />
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={addIncluded}
                        disabled={!newIncluded.trim()}
                        className="h-8"
                    >
                        <Plus className="h-3 w-3" />
                    </Button>
                </div>
            </div>

            {/* Opções de Cabine (Upgrades) */}
            <div className="border-t border-slate-200 pt-4">
                <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-medium text-slate-600">Opções de Cabine (Upgrades)</span>
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

                {cruiseData.options.length > 0 && (
                    <SortableOptionsContainer
                        items={cruiseData.options}
                        onReorder={reorderOptions}
                    >
                        <div className="space-y-2">
                            {cruiseData.options
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
                                        accentColor="indigo"
                                    >
                                        <div className="flex items-center gap-2">
                                            <select
                                                value={option.cabin_type}
                                                onChange={(e) => updateOption(option.id, { cabin_type: e.target.value as CabinType })}
                                                className={cn(
                                                    "text-xs bg-transparent border-none outline-none cursor-pointer",
                                                    !option.enabled && "text-slate-400"
                                                )}
                                            >
                                                {CABIN_TYPES.map(cabin => (
                                                    <option key={cabin.value} value={cabin.value}>{cabin.label}</option>
                                                ))}
                                            </select>

                                            <input
                                                type="text"
                                                value={option.label}
                                                onChange={(e) => updateOption(option.id, { label: e.target.value })}
                                                placeholder="Descrição"
                                                className={cn(
                                                    "flex-1 text-sm bg-transparent border-none outline-none",
                                                    !option.enabled && "text-slate-400"
                                                )}
                                            />

                                            <div className="flex items-center gap-1 text-sm text-slate-500">
                                                <span>{currencySymbol}</span>
                                                <input
                                                    type="number"
                                                    value={option.price || ''}
                                                    onChange={(e) => updateOption(option.id, { price: parseFloat(e.target.value) || 0 })}
                                                    className="w-20 text-right bg-transparent border-none outline-none"
                                                    placeholder="0"
                                                    step="0.01"
                                                />
                                            </div>
                                        </div>
                                    </SortableOptionItem>
                                ))}
                        </div>
                    </SortableOptionsContainer>
                )}

                {cruiseData.options.length === 0 && (
                    <p className="text-xs text-slate-400 text-center py-2">
                        Nenhuma opção de cabine adicionada
                    </p>
                )}
            </div>
        </div>
    )
}

export default CruiseEditor
