/**
 * ExperienceEditor - Editor dedicado para experiencias/passeios
 *
 * Layout direto sem expand/collapse
 * Campos: imagem, data, hora, duracao, local, participantes, preco, inclui, opcoes
 */

import { useState, useCallback, useMemo } from 'react'
import { Plus, X, MapPin, Calendar, Clock, Users, Check, FileText, Sparkles, Ban, Activity, UserX } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import { useProposalBuilder } from '@/hooks/useProposalBuilder'
import { ItemImageUploader } from '@/components/proposals/builder/ItemImageUploader'
import {
    type ExperienceData,
    type ExperienceOption,
    type DifficultyLevel,
    CURRENCY_SYMBOLS,
    DIFFICULTY_LABELS,
    createInitialExperienceData,
} from './types'
import { validateExperience } from '../validation'
import { ValidationFeedback } from '../ValidationFeedback'
import { SortableOptionsContainer } from '../shared/SortableOptionsContainer'
import { SortableOptionItem } from '../shared/SortableOptionItem'

interface ExperienceEditorProps {
    data: ExperienceData | null
    onChange: (data: ExperienceData) => void
    itemId: string
}

export function ExperienceEditor({ data, onChange, itemId }: ExperienceEditorProps) {
    const rawExpData = data || createInitialExperienceData()
    // Ensure arrays are always defined
    const expData = {
        ...rawExpData,
        options: rawExpData.options || [],
        included: rawExpData.included || [],
    }
    const [newIncluded, setNewIncluded] = useState('')
    const { getCurrency } = useProposalBuilder()
    const currency = getCurrency()
    const currencySymbol = CURRENCY_SYMBOLS[currency] || 'R$'

    // Validação
    const validation = useMemo(() => validateExperience(expData), [expData])

    const updateField = useCallback(<K extends keyof ExperienceData>(
        field: K,
        value: ExperienceData[K]
    ) => {
        onChange({ ...expData, [field]: value })
    }, [expData, onChange])

    const addIncluded = useCallback(() => {
        if (newIncluded.trim()) {
            onChange({
                ...expData,
                included: [...expData.included, newIncluded.trim()],
            })
            setNewIncluded('')
        }
    }, [expData, newIncluded, onChange])

    const removeIncluded = useCallback((index: number) => {
        onChange({
            ...expData,
            included: expData.included.filter((_, i) => i !== index),
        })
    }, [expData, onChange])

    const addOption = useCallback(() => {
        const newOption: ExperienceOption = {
            id: crypto.randomUUID(),
            label: 'Nova opcao',
            price: 0,
            is_recommended: false,
            enabled: true,
            ordem: expData.options.length,
        }
        onChange({
            ...expData,
            options: [...expData.options, newOption],
        })
    }, [expData, onChange])

    const updateOption = useCallback((id: string, updates: Partial<ExperienceData['options'][0]>) => {
        onChange({
            ...expData,
            options: expData.options.map(opt =>
                opt.id === id ? { ...opt, ...updates } : opt
            ),
        })
    }, [expData, onChange])

    const removeOption = useCallback((id: string) => {
        onChange({
            ...expData,
            options: expData.options.filter(opt => opt.id !== id),
        })
    }, [expData, onChange])

    const setRecommended = useCallback((id: string) => {
        onChange({
            ...expData,
            options: expData.options.map(opt => ({
                ...opt,
                is_recommended: opt.id === id,
            })),
        })
    }, [expData, onChange])

    const toggleOptionEnabled = useCallback((id: string) => {
        onChange({
            ...expData,
            options: expData.options.map(opt =>
                opt.id === id ? { ...opt, enabled: !opt.enabled } : opt
            ),
        })
    }, [expData, onChange])

    const reorderOptions = useCallback((reorderedOptions: ExperienceOption[]) => {
        onChange({
            ...expData,
            options: reorderedOptions,
        })
    }, [expData, onChange])

    const totalPrice = expData.price_type === 'per_person'
        ? expData.price * expData.participants
        : expData.price

    return (
        <div className="space-y-4">
            {/* Imagem da Experiencia */}
            <div>
                <label className="text-xs font-medium text-slate-500 mb-2 block">
                    Imagem da Experiencia
                </label>
                <ItemImageUploader
                    imageUrl={expData.image_url || null}
                    onImageChange={(url) => updateField('image_url', url)}
                    itemId={itemId}
                />
            </div>

            {/* Nome da Experiencia */}
            <div>
                <label className="text-xs font-medium text-slate-500 mb-1 flex items-center gap-1">
                    <Sparkles className="h-3 w-3" />
                    Nome da Experiencia
                </label>
                <input
                    type="text"
                    value={expData.name}
                    onChange={(e) => updateField('name', e.target.value)}
                    placeholder="Ex: Tour de Helicóptero sobre a cidade"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                />
            </div>

            {/* Date, Time, Duration Row */}
            <div className="grid grid-cols-3 gap-3">
                <div>
                    <label className="text-xs font-medium text-slate-500 mb-1 flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        Data
                    </label>
                    <input
                        type="date"
                        value={expData.date}
                        onChange={(e) => updateField('date', e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                    />
                </div>
                <div>
                    <label className="text-xs font-medium text-slate-500 mb-1 flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Horario
                    </label>
                    <input
                        type="time"
                        value={expData.time}
                        onChange={(e) => updateField('time', e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                    />
                </div>
                <div>
                    <label className="text-xs font-medium text-slate-500 mb-1 flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Duracao
                    </label>
                    <input
                        type="text"
                        value={expData.duration}
                        onChange={(e) => updateField('duration', e.target.value)}
                        placeholder="ex: 4 horas"
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                    />
                </div>
            </div>

            {/* Location Row */}
            <div className="grid grid-cols-2 gap-3">
                <div>
                    <label className="text-xs font-medium text-slate-500 mb-1 flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        Local
                    </label>
                    <input
                        type="text"
                        value={expData.location_city}
                        onChange={(e) => updateField('location_city', e.target.value)}
                        placeholder="Cidade ou regiao"
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                    />
                </div>
                <div>
                    <label className="text-xs font-medium text-slate-500 mb-1 flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        Participantes
                    </label>
                    <input
                        type="number"
                        value={expData.participants}
                        onChange={(e) => updateField('participants', parseInt(e.target.value) || 1)}
                        min={1}
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                    />
                </div>
            </div>

            {/* Meeting Point & Provider */}
            <div className="grid grid-cols-2 gap-3">
                <div>
                    <label className="text-xs font-medium text-slate-500 mb-1 block">
                        Ponto de Encontro
                    </label>
                    <input
                        type="text"
                        value={expData.meeting_point}
                        onChange={(e) => updateField('meeting_point', e.target.value)}
                        placeholder="ex: Lobby do hotel"
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                    />
                </div>
                <div>
                    <label className="text-xs font-medium text-slate-500 mb-1 block">
                        Fornecedor/Operador
                    </label>
                    <input
                        type="text"
                        value={expData.provider || ''}
                        onChange={(e) => updateField('provider', e.target.value)}
                        placeholder="ex: GetYourGuide, Viator..."
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                    />
                </div>
            </div>

            {/* Age Restriction & Difficulty Level */}
            <div className="grid grid-cols-2 gap-3">
                <div>
                    <label className="text-xs font-medium text-slate-500 mb-1 flex items-center gap-1">
                        <UserX className="h-3 w-3" />
                        Restricao de Idade
                    </label>
                    <input
                        type="text"
                        value={expData.age_restriction || ''}
                        onChange={(e) => updateField('age_restriction', e.target.value || null)}
                        placeholder="ex: Maiores de 18 anos"
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                    />
                </div>
                <div>
                    <label className="text-xs font-medium text-slate-500 mb-1 flex items-center gap-1">
                        <Activity className="h-3 w-3" />
                        Nivel de Dificuldade
                    </label>
                    <select
                        value={expData.difficulty_level || ''}
                        onChange={(e) => updateField('difficulty_level', (e.target.value as DifficultyLevel) || null)}
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent bg-white"
                    >
                        <option value="">Nao especificado</option>
                        {Object.entries(DIFFICULTY_LABELS).map(([value, label]) => (
                            <option key={value} value={value}>{label}</option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Price Row */}
            <div className="p-3 bg-orange-50 rounded-lg border border-orange-200">
                <div className="flex items-center gap-4 mb-2">
                    <label className="text-xs font-medium text-slate-600">Tipo de preco:</label>
                    <div className="flex items-center gap-3">
                        <label className="flex items-center gap-1.5 cursor-pointer">
                            <input
                                type="radio"
                                checked={expData.price_type === 'per_person'}
                                onChange={() => updateField('price_type', 'per_person')}
                                className="text-orange-600 focus:ring-orange-500"
                            />
                            <span className="text-sm text-slate-600">Por pessoa</span>
                        </label>
                        <label className="flex items-center gap-1.5 cursor-pointer">
                            <input
                                type="radio"
                                checked={expData.price_type === 'total'}
                                onChange={() => updateField('price_type', 'total')}
                                className="text-orange-600 focus:ring-orange-500"
                            />
                            <span className="text-sm text-slate-600">Total</span>
                        </label>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-orange-700">{currencySymbol}</span>
                        <input
                            type="number"
                            value={expData.price || ''}
                            onChange={(e) => updateField('price', parseFloat(e.target.value) || 0)}
                            placeholder="0,00"
                            step="0.01"
                            className="w-24 text-sm font-semibold text-orange-800 bg-white border border-orange-200 rounded px-2 py-1 outline-none focus:ring-2 focus:ring-orange-500 text-right"
                        />
                        {expData.price_type === 'per_person' && (
                            <span className="text-sm text-orange-600">/pessoa</span>
                        )}
                    </div>

                    {expData.price_type === 'per_person' && (
                        <div className="flex-1 text-right">
                            <span className="text-sm text-orange-600">× {expData.participants} = </span>
                            <span className="text-lg font-bold text-orange-700">
                                {currencySymbol} {totalPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </span>
                        </div>
                    )}
                </div>
            </div>

            {/* Descricao */}
            <div>
                <label className="text-xs font-medium text-slate-500 mb-1 flex items-center gap-1">
                    <FileText className="h-3 w-3" />
                    Descricao (opcional)
                </label>
                <textarea
                    value={expData.description || ''}
                    onChange={(e) => updateField('description', e.target.value)}
                    placeholder="Detalhes sobre a experiencia, o que esperar, recomendacoes..."
                    rows={3}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent resize-none"
                />
            </div>

            {/* Cancellation Policy */}
            <div>
                <label className="text-xs font-medium text-slate-500 mb-1 flex items-center gap-1">
                    <Ban className="h-3 w-3" />
                    Politica de Cancelamento
                </label>
                <textarea
                    value={expData.cancellation_policy || ''}
                    onChange={(e) => updateField('cancellation_policy', e.target.value || null)}
                    placeholder="Ex: Reembolso integral ate 24h antes do inicio..."
                    rows={2}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent resize-none"
                />
            </div>

            {/* Notas Internas */}
            <div>
                <label className="text-xs font-medium text-slate-500 mb-1 block">
                    Observacoes Internas (nao aparece para cliente)
                </label>
                <input
                    type="text"
                    value={expData.notes || ''}
                    onChange={(e) => updateField('notes', e.target.value)}
                    placeholder="Notas internas..."
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent bg-amber-50"
                />
            </div>

            {/* Validation Feedback */}
            <ValidationFeedback
                errors={validation.errors}
                warnings={validation.warnings}
            />

            {/* Included Items */}
            <div className="border-t border-slate-200 pt-4">
                <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-medium text-slate-600 flex items-center gap-1">
                        <Check className="h-3 w-3" />
                        O que esta incluso
                    </span>
                </div>

                {expData.included.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-3">
                        {expData.included.map((item, index) => (
                            <span
                                key={index}
                                className="inline-flex items-center gap-1 px-2 py-1 bg-emerald-50 text-emerald-700 text-xs rounded-full border border-emerald-200"
                            >
                                <Check className="h-3 w-3" />
                                {item}
                                <button
                                    onClick={() => removeIncluded(index)}
                                    className="ml-1 text-emerald-500 hover:text-red-500 transition-colors"
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
                        placeholder="ex: Transporte, Guia, Entrada..."
                        className="flex-1 px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
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

            {/* Options (Packages/Tiers) */}
            <div className="border-t border-slate-200 pt-4">
                <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-medium text-slate-600">Opcoes (Pacotes)</span>
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

                {expData.options.length > 0 && (
                    <SortableOptionsContainer
                        items={expData.options}
                        onReorder={reorderOptions}
                    >
                        <div className="space-y-2">
                            {expData.options
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
                                        accentColor="orange"
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

                {expData.options.length === 0 && (
                    <p className="text-xs text-slate-400 text-center py-2">
                        Nenhuma opcao de pacote adicionada
                    </p>
                )}
            </div>
        </div>
    )
}

export default ExperienceEditor
