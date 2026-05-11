/**
 * InsuranceEditor - Editor dedicado para seguros viagem
 *
 * Layout direto com seções condicionais
 * Campos: seguradora, período, viajantes, coberturas, valor, opções
 */

import { useState, useCallback, useMemo } from 'react'
import { Plus, X, Shield, Calendar, Users, DollarSign, FileText, Eye, EyeOff, Check } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import { ItemImageUploader } from '@/components/proposals/builder/ItemImageUploader'
import { PriceField, InlinePriceField } from '../shared/PriceField'
import { SortableOptionsContainer } from '../shared/SortableOptionsContainer'
import { SortableOptionItem } from '../shared/SortableOptionItem'
import {
    type InsuranceData,
    type InsuranceOption,
    type InsuranceTier,
    INSURANCE_PROVIDERS,
    INSURANCE_TIER_LABELS,
    DEFAULT_COVERAGES,
    createInitialInsuranceData,
    calculateDays,
} from './types'

interface InsuranceEditorProps {
    data: InsuranceData | null
    onChange: (data: InsuranceData) => void
    itemId: string
}

export function InsuranceEditor({ data, onChange, itemId }: InsuranceEditorProps) {
    const insuranceData = useMemo(() => {
        const raw = data || createInitialInsuranceData()
        // Ensure arrays are always defined
        return {
            ...raw,
            options: raw.options || [],
            coverages: raw.coverages || [],
        }
    }, [data])
    const [newCoverage, setNewCoverage] = useState('')

    const updateField = useCallback(<K extends keyof InsuranceData>(
        field: K,
        value: InsuranceData[K]
    ) => {
        onChange({ ...insuranceData, [field]: value })
    }, [insuranceData, onChange])

    // Coverage handlers
    const addCoverage = useCallback((coverage: string) => {
        if (coverage.trim() && !insuranceData.coverages.includes(coverage.trim())) {
            onChange({
                ...insuranceData,
                coverages: [...insuranceData.coverages, coverage.trim()],
            })
        }
        setNewCoverage('')
    }, [insuranceData, onChange])

    const removeCoverage = useCallback((index: number) => {
        onChange({
            ...insuranceData,
            coverages: insuranceData.coverages.filter((_, i) => i !== index),
        })
    }, [insuranceData, onChange])

    // Option handlers
    const addOption = useCallback(() => {
        const newOption: InsuranceOption = {
            id: crypto.randomUUID(),
            label: 'Nova opção',
            tier: 'standard',
            price: 0,
            is_recommended: false,
            enabled: true,
            ordem: insuranceData.options.length,
        }
        onChange({
            ...insuranceData,
            options: [...insuranceData.options, newOption],
        })
    }, [insuranceData, onChange])

    const updateOption = useCallback((id: string, updates: Partial<InsuranceOption>) => {
        onChange({
            ...insuranceData,
            options: insuranceData.options.map(opt =>
                opt.id === id ? { ...opt, ...updates } : opt
            ),
        })
    }, [insuranceData, onChange])

    const removeOption = useCallback((id: string) => {
        onChange({
            ...insuranceData,
            options: insuranceData.options.filter(opt => opt.id !== id),
        })
    }, [insuranceData, onChange])

    const setRecommended = useCallback((id: string) => {
        onChange({
            ...insuranceData,
            options: insuranceData.options.map(opt => ({
                ...opt,
                is_recommended: opt.id === id,
            })),
        })
    }, [insuranceData, onChange])

    const toggleOptionEnabled = useCallback((id: string) => {
        onChange({
            ...insuranceData,
            options: insuranceData.options.map(opt =>
                opt.id === id ? { ...opt, enabled: !opt.enabled } : opt
            ),
        })
    }, [insuranceData, onChange])

    const reorderOptions = useCallback((reorderedOptions: InsuranceOption[]) => {
        onChange({
            ...insuranceData,
            options: reorderedOptions,
        })
    }, [insuranceData, onChange])

    // Campos condicionais
    const showCoverageDates = insuranceData.show_coverage_dates !== false
    const showMedicalValue = insuranceData.show_medical_value !== false

    const days = calculateDays(insuranceData.coverage_start, insuranceData.coverage_end)

    return (
        <div className="space-y-4">
            {/* Toggles de Campos */}
            <div className="flex items-center gap-2 flex-wrap p-2 bg-slate-50 rounded-lg border border-slate-200">
                <span className="text-xs font-medium text-slate-500 mr-2">Mostrar:</span>
                <FieldToggle
                    label="Período"
                    enabled={showCoverageDates}
                    onToggle={(v) => updateField('show_coverage_dates', v)}
                />
                <FieldToggle
                    label="Cobertura Médica"
                    enabled={showMedicalValue}
                    onToggle={(v) => updateField('show_medical_value', v)}
                />
            </div>

            {/* Imagem */}
            <div>
                <label className="text-xs font-medium text-slate-500 mb-2 block">
                    Logo/Imagem
                </label>
                <ItemImageUploader
                    imageUrl={insuranceData.image_url || null}
                    onImageChange={(url) => updateField('image_url', url)}
                    itemId={itemId}
                />
            </div>

            {/* Nome do Seguro */}
            <div>
                <label className="text-xs font-medium text-slate-500 mb-1 flex items-center gap-1">
                    <Shield className="h-3 w-3" />
                    Nome do Seguro
                </label>
                <input
                    type="text"
                    value={insuranceData.name}
                    onChange={(e) => updateField('name', e.target.value)}
                    placeholder="Ex: Seguro Viagem Europa 60k"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                />
            </div>

            {/* Seguradora e Viajantes */}
            <div className="grid grid-cols-2 gap-3">
                <div>
                    <label className="text-xs font-medium text-slate-500 mb-1 block">
                        Seguradora
                    </label>
                    <select
                        value={insuranceData.provider}
                        onChange={(e) => updateField('provider', e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent bg-white"
                    >
                        {INSURANCE_PROVIDERS.map(provider => (
                            <option key={provider.code} value={provider.code}>{provider.name}</option>
                        ))}
                    </select>
                </div>
                <div>
                    <label className="text-xs font-medium text-slate-500 mb-1 flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        Viajantes
                    </label>
                    <input
                        type="number"
                        value={insuranceData.travelers}
                        onChange={(e) => updateField('travelers', parseInt(e.target.value) || 1)}
                        min={1}
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                    />
                </div>
            </div>

            {/* Período de Cobertura (condicional) */}
            {showCoverageDates && (
                <div className="p-3 bg-amber-50/50 rounded-lg border border-amber-100">
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-xs font-medium text-amber-700 mb-1 flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                Início Cobertura
                            </label>
                            <input
                                type="date"
                                value={insuranceData.coverage_start}
                                onChange={(e) => updateField('coverage_start', e.target.value)}
                                className="w-full px-3 py-2 text-sm border border-amber-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                            />
                        </div>
                        <div>
                            <label className="text-xs font-medium text-amber-700 mb-1 flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                Fim Cobertura
                            </label>
                            <input
                                type="date"
                                value={insuranceData.coverage_end}
                                onChange={(e) => updateField('coverage_end', e.target.value)}
                                min={insuranceData.coverage_start}
                                className="w-full px-3 py-2 text-sm border border-amber-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                            />
                        </div>
                    </div>
                    {days > 0 && (
                        <div className="text-center text-sm text-amber-700 mt-2 py-1 bg-white rounded border border-amber-200">
                            <Shield className="h-4 w-4 inline mr-1" />
                            {days} {days === 1 ? 'dia' : 'dias'} de cobertura
                        </div>
                    )}
                </div>
            )}

            {/* Valor Cobertura Médica (condicional) */}
            {showMedicalValue && (
                <div>
                    <label className="text-xs font-medium text-slate-500 mb-1 flex items-center gap-1">
                        <DollarSign className="h-3 w-3" />
                        Cobertura Médica
                    </label>
                    <div className="flex items-center gap-2">
                        <select
                            value={insuranceData.medical_coverage_currency}
                            onChange={(e) => updateField('medical_coverage_currency', e.target.value as 'USD' | 'EUR' | 'BRL')}
                            className="px-2 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white"
                        >
                            <option value="USD">US$</option>
                            <option value="EUR">€</option>
                            <option value="BRL">R$</option>
                        </select>
                        <input
                            type="number"
                            value={insuranceData.medical_coverage || ''}
                            onChange={(e) => updateField('medical_coverage', parseFloat(e.target.value) || 0)}
                            placeholder="60000"
                            className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                        />
                    </div>
                </div>
            )}

            {/* Preço */}
            <div className="p-3 bg-amber-50 rounded-lg border border-amber-200">
                <div className="flex items-center gap-4 mb-2">
                    <label className="text-xs font-medium text-slate-600">Tipo:</label>
                    <div className="flex items-center gap-3">
                        <label className="flex items-center gap-1.5 cursor-pointer">
                            <input
                                type="radio"
                                checked={insuranceData.price_type === 'per_person'}
                                onChange={() => updateField('price_type', 'per_person')}
                                className="text-amber-600 focus:ring-amber-500"
                            />
                            <span className="text-sm text-slate-600">Por pessoa</span>
                        </label>
                        <label className="flex items-center gap-1.5 cursor-pointer">
                            <input
                                type="radio"
                                checked={insuranceData.price_type === 'total'}
                                onChange={() => updateField('price_type', 'total')}
                                className="text-amber-600 focus:ring-amber-500"
                            />
                            <span className="text-sm text-slate-600">Total</span>
                        </label>
                    </div>
                </div>

                <PriceField
                    price={insuranceData.price}
                    onChange={(price) => updateField('price', price)}
                    priceType={insuranceData.price_type}
                    quantity={insuranceData.travelers}
                    quantityLabel="pessoa"
                    accentColor="amber"
                />
            </div>

            {/* Coberturas */}
            <div className="border-t border-slate-200 pt-4">
                <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-medium text-slate-600 flex items-center gap-1">
                        <Check className="h-3 w-3" />
                        Coberturas Incluídas
                    </span>
                </div>

                {insuranceData.coverages.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-3">
                        {insuranceData.coverages.map((coverage, index) => (
                            <span
                                key={index}
                                className="inline-flex items-center gap-1 px-2 py-1 bg-emerald-50 text-emerald-700 text-xs rounded-full border border-emerald-200"
                            >
                                <Check className="h-3 w-3" />
                                {coverage}
                                <button
                                    onClick={() => removeCoverage(index)}
                                    className="ml-1 text-emerald-500 hover:text-red-500 transition-colors"
                                >
                                    <X className="h-3 w-3" />
                                </button>
                            </span>
                        ))}
                    </div>
                )}

                {/* Quick add common coverages */}
                <div className="flex flex-wrap gap-1 mb-2">
                    {DEFAULT_COVERAGES.filter(c => !insuranceData.coverages.includes(c)).slice(0, 4).map((coverage) => (
                        <button
                            key={coverage}
                            onClick={() => addCoverage(coverage)}
                            className="px-2 py-0.5 text-xs text-slate-500 bg-slate-100 rounded-full hover:bg-slate-200 transition-colors"
                        >
                            + {coverage.length > 25 ? coverage.substring(0, 25) + '...' : coverage}
                        </button>
                    ))}
                </div>

                <div className="flex items-center gap-2">
                    <input
                        type="text"
                        value={newCoverage}
                        onChange={(e) => setNewCoverage(e.target.value)}
                        placeholder="Adicionar cobertura..."
                        className="flex-1 px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                        onKeyDown={(e) => e.key === 'Enter' && addCoverage(newCoverage)}
                    />
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => addCoverage(newCoverage)}
                        disabled={!newCoverage.trim()}
                        className="h-8"
                    >
                        <Plus className="h-3 w-3" />
                    </Button>
                </div>
            </div>

            {/* Descrição */}
            <div>
                <label className="text-xs font-medium text-slate-500 mb-1 flex items-center gap-1">
                    <FileText className="h-3 w-3" />
                    Descrição (opcional)
                </label>
                <textarea
                    value={insuranceData.description || ''}
                    onChange={(e) => updateField('description', e.target.value)}
                    placeholder="Informações adicionais sobre o seguro..."
                    rows={2}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent resize-none"
                />
            </div>

            {/* Número da Apólice */}
            <div>
                <label className="text-xs font-medium text-slate-500 mb-1 block">
                    Número da Apólice (opcional)
                </label>
                <input
                    type="text"
                    value={insuranceData.policy_number || ''}
                    onChange={(e) => updateField('policy_number', e.target.value || null)}
                    placeholder="Ex: POL-123456"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                />
            </div>

            {/* Notas Internas */}
            <div>
                <label className="text-xs font-medium text-slate-500 mb-1 block">
                    Observações Internas
                </label>
                <input
                    type="text"
                    value={insuranceData.notes}
                    onChange={(e) => updateField('notes', e.target.value)}
                    placeholder="Notas internas..."
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent bg-amber-50"
                />
            </div>

            {/* Opções de Plano */}
            <div className="border-t border-slate-200 pt-4">
                <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-medium text-slate-600">Opções de Plano</span>
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

                {insuranceData.options.length > 0 && (
                    <SortableOptionsContainer
                        items={insuranceData.options}
                        onReorder={reorderOptions}
                    >
                        <div className="space-y-2">
                            {insuranceData.options
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
                                            <select
                                                value={option.tier}
                                                onChange={(e) => updateOption(option.id, { tier: e.target.value as InsuranceTier })}
                                                className={cn(
                                                    "text-xs bg-transparent border-none outline-none cursor-pointer",
                                                    !option.enabled && "text-slate-400"
                                                )}
                                            >
                                                {Object.entries(INSURANCE_TIER_LABELS).map(([value, label]) => (
                                                    <option key={value} value={value}>{label}</option>
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

                                            <InlinePriceField
                                                price={option.price}
                                                onChange={(price) => updateOption(option.id, { price })}
                                                disabled={!option.enabled}
                                            />
                                        </div>
                                    </SortableOptionItem>
                                ))}
                        </div>
                    </SortableOptionsContainer>
                )}

                {insuranceData.options.length === 0 && (
                    <p className="text-xs text-slate-400 text-center py-2">
                        Nenhuma opção de plano adicionada
                    </p>
                )}
            </div>
        </div>
    )
}

/**
 * FieldToggle - Mini toggle para habilitar/desabilitar campo
 */
function FieldToggle({
    label,
    enabled,
    onToggle,
}: {
    label: string
    enabled: boolean
    onToggle: (enabled: boolean) => void
}) {
    return (
        <button
            type="button"
            onClick={() => onToggle(!enabled)}
            className={cn(
                "flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium transition-colors",
                enabled
                    ? "bg-amber-100 text-amber-700 border border-amber-200"
                    : "bg-slate-100 text-slate-400 border border-slate-200 hover:bg-slate-200"
            )}
        >
            {enabled ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
            {label}
        </button>
    )
}

export default InsuranceEditor
