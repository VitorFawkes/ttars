import { useState, useEffect } from 'react'
import { DollarSign, ChevronDown, Check, Users, Calculator } from 'lucide-react'
import { FieldWrapper, DisplayValue } from './BaseField'
import type { BaseFieldProps } from './BaseField'
import { cn } from '../../../lib/utils'

type OrcamentoTipo = 'total' | 'por_pessoa' | 'range'

export interface OrcamentoViagem {
    tipo: OrcamentoTipo
    valor?: number              // Valor único (total ou por_pessoa)
    valor_min?: number          // Para range
    valor_max?: number          // Para range
    quantidade_viajantes?: number
    total_calculado?: number    // Auto-calculado
    por_pessoa_calculado?: number // Auto-calculado
    display: string
}

const TIPOS = [
    { value: 'total' as OrcamentoTipo, label: 'Valor total', description: 'Ex: R$ 15.000 para o grupo' },
    { value: 'por_pessoa' as OrcamentoTipo, label: 'Por pessoa', description: 'Ex: R$ 3.000 por viajante' },
    { value: 'range' as OrcamentoTipo, label: 'Faixa de valor', description: 'Ex: R$ 10.000 a R$ 15.000' }
]

function formatCurrency(value: number | undefined): string {
    if (!value) return ''
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(value)
}

function buildDisplay(data: Partial<OrcamentoViagem>): string {
    const { tipo, valor, valor_min, valor_max, quantidade_viajantes } = data

    if (tipo === 'total' && valor) {
        let display = formatCurrency(valor)
        if (quantidade_viajantes && quantidade_viajantes > 0) {
            const porPessoa = valor / quantidade_viajantes
            display += ` (${formatCurrency(porPessoa)}/pessoa)`
        }
        return display
    }

    if (tipo === 'por_pessoa' && valor) {
        let display = `${formatCurrency(valor)}/pessoa`
        if (quantidade_viajantes && quantidade_viajantes > 0) {
            const total = valor * quantidade_viajantes
            display += ` (${formatCurrency(total)} total)`
        }
        return display
    }

    if (tipo === 'range' && valor_min && valor_max) {
        return `${formatCurrency(valor_min)} — ${formatCurrency(valor_max)}`
    }

    return ''
}

function calculateValues(data: Partial<OrcamentoViagem>): Partial<OrcamentoViagem> {
    const result = { ...data }
    const { tipo, valor, valor_min, valor_max, quantidade_viajantes } = data

    if (tipo === 'total' && valor) {
        result.total_calculado = valor
        if (quantidade_viajantes && quantidade_viajantes > 0) {
            result.por_pessoa_calculado = Math.round(valor / quantidade_viajantes)
        }
    }

    if (tipo === 'por_pessoa' && valor) {
        result.por_pessoa_calculado = valor
        if (quantidade_viajantes && quantidade_viajantes > 0) {
            result.total_calculado = valor * quantidade_viajantes
        }
    }

    if (tipo === 'range' && valor_min && valor_max) {
        // Use average for total_calculado
        result.total_calculado = Math.round((valor_min + valor_max) / 2)
        if (quantidade_viajantes && quantidade_viajantes > 0) {
            result.por_pessoa_calculado = Math.round(result.total_calculado / quantidade_viajantes)
        }
    }

    return result
}

// Parse legacy orcamento format { total, por_pessoa }
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- legacy format parsing requires dynamic shape
function parseExistingValue(value: Record<string, any> | null | undefined, viajantes?: number): OrcamentoViagem | null {
    if (!value) return null

    // Already in new format
    if (value.tipo) {
        return { ...(value as unknown as OrcamentoViagem), quantidade_viajantes: viajantes || value.quantidade_viajantes }
    }

    // Legacy format { total, por_pessoa }
    if (value.total || value.por_pessoa) {
        const hasTotal = value.total && value.total > 0
        const hasPorPessoa = value.por_pessoa && value.por_pessoa > 0

        if (hasTotal) {
            const result: OrcamentoViagem = {
                tipo: 'total',
                valor: value.total,
                quantidade_viajantes: viajantes,
                display: ''
            }
            const calculated = calculateValues(result)
            return {
                ...result,
                ...calculated,
                display: buildDisplay({ ...result, ...calculated })
            }
        }

        if (hasPorPessoa) {
            const result: OrcamentoViagem = {
                tipo: 'por_pessoa',
                valor: value.por_pessoa,
                quantidade_viajantes: viajantes,
                display: ''
            }
            const calculated = calculateValues(result)
            return {
                ...result,
                ...calculated,
                display: buildDisplay({ ...result, ...calculated })
            }
        }
    }

    return null
}

interface SmartBudgetFieldProps extends BaseFieldProps {
    quantidadeViajantes?: number
}

export default function SmartBudgetField({
    label,
    value,
    onChange,
    onSave,
    readOnly = false,
    required = false,
    error,
    helpText,
    quantidadeViajantes = 0
}: SmartBudgetFieldProps) {
    const [localData, setLocalData] = useState<OrcamentoViagem>(() => {
        const parsed = parseExistingValue(value, quantidadeViajantes)
        return parsed || {
            tipo: 'total',
            quantidade_viajantes: quantidadeViajantes,
            display: ''
        }
    })

    const [showTypeDropdown, setShowTypeDropdown] = useState(false)

    // Sync external value → local state
    useEffect(() => {
        const parsed = parseExistingValue(value, quantidadeViajantes)
        if (parsed) {
            setLocalData(parsed)
        }
    }, [value, quantidadeViajantes])

    // Update calculations when viajantes changes
    useEffect(() => {
        if (localData.quantidade_viajantes !== quantidadeViajantes) {
            const newData = { ...localData, quantidade_viajantes: quantidadeViajantes }
            const calculated = calculateValues(newData)
            const updated = { ...newData, ...calculated, display: buildDisplay({ ...newData, ...calculated }) }
            setLocalData(updated)
            onChange?.(updated)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally only react to quantidadeViajantes changes
    }, [quantidadeViajantes])

    const updateData = (updates: Partial<OrcamentoViagem>) => {
        const newData = { ...localData, ...updates }
        const calculated = calculateValues(newData)
        const final = { ...newData, ...calculated, display: buildDisplay({ ...newData, ...calculated }) }
        setLocalData(final)
        onChange?.(final)
    }

    const handleTypeChange = (tipo: OrcamentoTipo) => {
        const newData: OrcamentoViagem = {
            tipo,
            quantidade_viajantes: quantidadeViajantes,
            display: ''
        }

        // Try to preserve the value if switching between total/por_pessoa
        if (localData.valor) {
            newData.valor = localData.valor
        }

        const calculated = calculateValues(newData)
        const final = { ...newData, ...calculated, display: buildDisplay({ ...newData, ...calculated }) }
        setLocalData(final)
        onChange?.(final)
        setShowTypeDropdown(false)
    }

    const handleValueChange = (newValue: number) => {
        updateData({ valor: newValue })
    }

    const handleRangeChange = (field: 'valor_min' | 'valor_max', newValue: number) => {
        updateData({ [field]: newValue })
    }

    // Display Mode
    if (readOnly || !onChange) {
        const parsed = parseExistingValue(value, quantidadeViajantes)
        return (
            <FieldWrapper label={label} required={required} helpText={helpText}>
                {parsed?.display ? (
                    <div className="flex items-center gap-2 text-xs text-gray-900">
                        <DollarSign className="h-4 w-4 text-gray-400" />
                        <span className="font-medium">{parsed.display}</span>
                    </div>
                ) : (
                    <DisplayValue value={null} />
                )}
            </FieldWrapper>
        )
    }

    const selectedTipo = TIPOS.find(t => t.value === localData.tipo)

    return (
        <FieldWrapper label={label} required={required} error={error} helpText={helpText}>
            <div className="space-y-3">
                {/* Viajantes Context */}
                {quantidadeViajantes > 0 && (
                    <div className="flex items-center gap-2 px-2.5 py-1.5 bg-blue-50 rounded-lg border border-blue-100">
                        <Users className="h-4 w-4 text-blue-600" />
                        <span className="text-xs text-blue-800">
                            <strong>{quantidadeViajantes}</strong> {quantidadeViajantes === 1 ? 'viajante' : 'viajantes'}
                        </span>
                    </div>
                )}

                {/* Type Selector */}
                <div className="relative">
                    <button
                        type="button"
                        onClick={() => setShowTypeDropdown(!showTypeDropdown)}
                        className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors"
                    >
                        <div className="text-left">
                            <div className="text-xs font-medium text-gray-900">{selectedTipo?.label}</div>
                            <div className="text-xs text-gray-500">{selectedTipo?.description}</div>
                        </div>
                        <ChevronDown className={cn(
                            "h-5 w-5 text-gray-400 transition-transform",
                            showTypeDropdown && "rotate-180"
                        )} />
                    </button>

                    {showTypeDropdown && (
                        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
                            {TIPOS.map(tipo => (
                                <button
                                    key={tipo.value}
                                    type="button"
                                    onClick={() => handleTypeChange(tipo.value)}
                                    className={cn(
                                        "w-full flex items-center justify-between px-3 py-2 hover:bg-gray-50 transition-colors border-b border-gray-100 last:border-0",
                                        localData.tipo === tipo.value && "bg-green-50"
                                    )}
                                >
                                    <div className="text-left">
                                        <div className="text-xs font-medium text-gray-900">{tipo.label}</div>
                                        <div className="text-xs text-gray-500">{tipo.description}</div>
                                    </div>
                                    {localData.tipo === tipo.value && (
                                        <Check className="h-4 w-4 text-green-600" />
                                    )}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Value Input - Total or Por Pessoa */}
                {(localData.tipo === 'total' || localData.tipo === 'por_pessoa') && (
                    <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                            {localData.tipo === 'total' ? 'Valor total' : 'Valor por pessoa'}
                        </label>
                        <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-medium text-xs">R$</span>
                            <input
                                type="number"
                                min="0"
                                step="100"
                                value={localData.valor || ''}
                                onChange={(e) => handleValueChange(parseFloat(e.target.value) || 0)}
                                onBlur={() => onSave?.()}
                                className="w-full pl-10 pr-3 py-1.5 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 text-xs font-semibold"
                                placeholder="0"
                            />
                        </div>
                    </div>
                )}

                {/* Range Inputs */}
                {localData.tipo === 'range' && (
                    <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">Mínimo</label>
                                <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-xs">R$</span>
                                    <input
                                        type="number"
                                        min="0"
                                        step="100"
                                        value={localData.valor_min || ''}
                                        onChange={(e) => handleRangeChange('valor_min', parseFloat(e.target.value) || 0)}
                                        onBlur={() => onSave?.()}
                                        className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 text-xs font-medium"
                                        placeholder="10000"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">Máximo</label>
                                <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-xs">R$</span>
                                    <input
                                        type="number"
                                        min="0"
                                        step="100"
                                        value={localData.valor_max || ''}
                                        onChange={(e) => handleRangeChange('valor_max', parseFloat(e.target.value) || 0)}
                                        onBlur={() => onSave?.()}
                                        className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 text-xs font-medium"
                                        placeholder="15000"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Calculated Values Display */}
                {localData.display && (
                    <div className="p-3 bg-green-50 rounded-lg border border-green-100">
                        <div className="flex items-center gap-2 mb-1.5">
                            <Calculator className="h-3.5 w-3.5 text-green-600" />
                            <span className="text-xs font-bold text-green-900">Resumo</span>
                        </div>

                        <div className="text-xs font-bold text-green-800 mb-1">
                            {localData.display}
                        </div>

                        {/* Show calculated values */}
                        <div className="grid grid-cols-2 gap-2 text-xs">
                            {localData.total_calculado && localData.tipo !== 'total' && (
                                <div className="bg-white/50 rounded px-2 py-1">
                                    <span className="text-green-600">Total:</span>{' '}
                                    <span className="font-medium text-green-800">{formatCurrency(localData.total_calculado)}</span>
                                </div>
                            )}
                            {localData.por_pessoa_calculado && localData.tipo !== 'por_pessoa' && quantidadeViajantes > 0 && (
                                <div className="bg-white/50 rounded px-2 py-1">
                                    <span className="text-green-600">Por pessoa:</span>{' '}
                                    <span className="font-medium text-green-800">{formatCurrency(localData.por_pessoa_calculado)}</span>
                                </div>
                            )}
                        </div>

                        {quantidadeViajantes === 0 && localData.tipo === 'por_pessoa' && (
                            <p className="text-xs text-amber-600 mt-2">
                                Informe a quantidade de viajantes para calcular o total
                            </p>
                        )}
                    </div>
                )}
            </div>
        </FieldWrapper>
    )
}
