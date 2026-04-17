import { useState, useEffect } from 'react'
import { Clock } from 'lucide-react'
import { FieldWrapper, DisplayValue } from './BaseField'
import type { BaseFieldProps } from './BaseField'
import { cn } from '../../../lib/utils'

type DuracaoTipo = 'fixo' | 'range' | 'indefinido'

export interface DuracaoViagem {
    tipo: DuracaoTipo
    dias_min?: number
    dias_max?: number
    display: string
}

function buildDisplay(dias_min?: number, dias_max?: number): string {
    if (!dias_min) return ''
    if (!dias_max || dias_min === dias_max) {
        return `${dias_min} ${dias_min === 1 ? 'dia' : 'dias'}`
    }
    return `${dias_min} a ${dias_max} dias`
}

function detectTipo(value: DuracaoViagem | null | undefined): DuracaoTipo {
    if (!value) return 'fixo'
    if (value.tipo) return value.tipo
    if (value.dias_min && value.dias_max && value.dias_min !== value.dias_max) return 'range'
    return 'fixo'
}

export default function FlexibleDurationField({
    label,
    value,
    onChange,
    onSave,
    readOnly = false,
    required = false,
    error,
    helpText
}: BaseFieldProps) {
    const [tipo, setTipo] = useState<DuracaoTipo>(() => detectTipo(value))
    const [diasMin, setDiasMin] = useState<number | ''>(value?.dias_min || '')
    const [diasMax, setDiasMax] = useState<number | ''>(value?.dias_max || '')

    // Sync external value → local state
    /* eslint-disable react-hooks/set-state-in-effect -- valid prop→state sync for controlled component */
    useEffect(() => {
        if (value?.tipo === 'indefinido') {
            setTipo('indefinido')
            setDiasMin('')
            setDiasMax('')
        } else if (value) {
            setTipo(detectTipo(value))
            setDiasMin(value.dias_min || '')
            setDiasMax(value.dias_max || '')
        }
    }, [value])
    /* eslint-enable react-hooks/set-state-in-effect */

    const emitChange = (newTipo: DuracaoTipo, min: number | '', max: number | '') => {
        if (newTipo === 'indefinido') {
            onChange?.({ tipo: 'indefinido', display: 'A definir' })
            return
        }

        const numMin = typeof min === 'number' ? min : undefined
        const numMax = typeof max === 'number' ? max : undefined

        if (newTipo === 'fixo' && numMin) {
            onChange?.({
                tipo: 'fixo',
                dias_min: numMin,
                dias_max: numMin,
                display: buildDisplay(numMin, numMin)
            })
        } else if (newTipo === 'range' && numMin) {
            onChange?.({
                tipo: 'range',
                dias_min: numMin,
                dias_max: numMax || numMin,
                display: buildDisplay(numMin, numMax || numMin)
            })
        } else if (!numMin) {
            onChange?.(null)
        }
    }

    const handleTipoChange = (newTipo: DuracaoTipo) => {
        setTipo(newTipo)
        if (newTipo === 'indefinido') {
            setDiasMin('')
            setDiasMax('')
            emitChange('indefinido', '', '')
            onSave?.()
        } else if (newTipo === 'fixo') {
            setDiasMax(diasMin)
            emitChange('fixo', diasMin, diasMin)
        } else {
            emitChange('range', diasMin, diasMax)
        }
    }

    const handleMinChange = (val: string) => {
        const num = val === '' ? '' as const : parseInt(val)
        setDiasMin(num)
        if (tipo === 'fixo') {
            setDiasMax(num)
            emitChange('fixo', num, num)
        } else {
            emitChange('range', num, diasMax)
        }
    }

    const handleMaxChange = (val: string) => {
        const num = val === '' ? '' as const : parseInt(val)
        setDiasMax(num)
        emitChange('range', diasMin, num)
    }

    // Display Mode
    if (readOnly || !onChange) {
        return (
            <FieldWrapper label={label} required={required} helpText={helpText}>
                {value?.display ? (
                    <div className="flex items-center gap-2 text-xs text-gray-900">
                        <Clock className="h-4 w-4 text-gray-400" />
                        <span>{value.display}</span>
                    </div>
                ) : (
                    <DisplayValue value={null} />
                )}
            </FieldWrapper>
        )
    }

    const isIndefinido = tipo === 'indefinido'

    return (
        <FieldWrapper label={label} required={required} error={error} helpText={helpText}>
            <div className="space-y-3">
                {/* Tipo toggle: Fixo / Range */}
                <div className="flex gap-1 p-1 bg-gray-100 rounded-lg">
                    <button
                        type="button"
                        onClick={() => handleTipoChange('fixo')}
                        className={cn(
                            "flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-all",
                            tipo === 'fixo'
                                ? "bg-white text-gray-900 shadow-sm"
                                : "text-gray-500 hover:text-gray-700"
                        )}
                    >
                        Dias fixos
                    </button>
                    <button
                        type="button"
                        onClick={() => handleTipoChange('range')}
                        className={cn(
                            "flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-all",
                            tipo === 'range'
                                ? "bg-white text-gray-900 shadow-sm"
                                : "text-gray-500 hover:text-gray-700"
                        )}
                    >
                        Faixa de dias
                    </button>
                </div>

                {/* Inputs */}
                {!isIndefinido && tipo === 'fixo' && (
                    <div className="relative">
                        <input
                            type="number"
                            min="1"
                            max="365"
                            value={diasMin}
                            onChange={(e) => handleMinChange(e.target.value)}
                            onBlur={() => onSave?.()}
                            placeholder="7"
                            className="w-full px-3 py-2 pr-12 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">
                            dias
                        </span>
                    </div>
                )}

                {!isIndefinido && tipo === 'range' && (
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">De</label>
                            <div className="relative">
                                <input
                                    type="number"
                                    min="1"
                                    max="365"
                                    value={diasMin}
                                    onChange={(e) => handleMinChange(e.target.value)}
                                    onBlur={() => onSave?.()}
                                    placeholder="7"
                                    className="w-full px-3 py-2 pr-12 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                                />
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">
                                    dias
                                </span>
                            </div>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Até</label>
                            <div className="relative">
                                <input
                                    type="number"
                                    min="1"
                                    max="365"
                                    value={diasMax}
                                    onChange={(e) => handleMaxChange(e.target.value)}
                                    onBlur={() => onSave?.()}
                                    placeholder="10"
                                    className="w-full px-3 py-2 pr-12 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                                />
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">
                                    dias
                                </span>
                            </div>
                        </div>
                    </div>
                )}

                {/* Preview */}
                {!isIndefinido && typeof diasMin === 'number' && diasMin > 0 && (
                    <div className="flex items-center gap-2 px-3 py-2 bg-purple-50 rounded-lg border border-purple-100">
                        <Clock className="h-3.5 w-3.5 text-purple-600" />
                        <span className="text-xs font-medium text-purple-900">
                            {buildDisplay(diasMin, tipo === 'range' && typeof diasMax === 'number' ? diasMax : diasMin)}
                        </span>
                    </div>
                )}

                {/* Indefinido checkbox */}
                <label className="flex items-center gap-2 cursor-pointer">
                    <input
                        type="checkbox"
                        checked={isIndefinido}
                        onChange={() => handleTipoChange(isIndefinido ? 'fixo' : 'indefinido')}
                        className="h-4 w-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                    />
                    <span className="text-xs text-gray-600">Não definiu ainda</span>
                </label>
            </div>
        </FieldWrapper>
    )
}
