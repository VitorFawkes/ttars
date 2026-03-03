import { useState, useEffect } from 'react'
import { Calendar, ChevronDown, Check } from 'lucide-react'
import { FieldWrapper, DisplayValue } from './BaseField'
import type { BaseFieldProps } from './BaseField'
import { cn } from '../../../lib/utils'

type EpocaTipo = 'data_exata' | 'mes' | 'range_meses' | 'indefinido'

export interface EpocaViagem {
    tipo: EpocaTipo
    mes_inicio?: number    // 1-12
    mes_fim?: number       // 1-12
    ano?: number           // YYYY
    data_inicio?: string   // YYYY-MM-DD
    data_fim?: string      // YYYY-MM-DD
    display: string
    flexivel: boolean
}

const MESES = [
    { value: 1, label: 'Janeiro' },
    { value: 2, label: 'Fevereiro' },
    { value: 3, label: 'Março' },
    { value: 4, label: 'Abril' },
    { value: 5, label: 'Maio' },
    { value: 6, label: 'Junho' },
    { value: 7, label: 'Julho' },
    { value: 8, label: 'Agosto' },
    { value: 9, label: 'Setembro' },
    { value: 10, label: 'Outubro' },
    { value: 11, label: 'Novembro' },
    { value: 12, label: 'Dezembro' }
]

const TIPOS = [
    { value: 'mes' as EpocaTipo, label: 'Mês específico', description: 'Ex: Setembro 2025' },
    { value: 'range_meses' as EpocaTipo, label: 'Range de meses', description: 'Ex: Agosto a Novembro' },
    { value: 'data_exata' as EpocaTipo, label: 'Datas exatas', description: 'Ex: 15/06 a 20/06/2025' },
    { value: 'indefinido' as EpocaTipo, label: 'Ainda não definido', description: 'Cliente não sabe' }
]

function generateYearOptions() {
    const currentYear = new Date().getFullYear()
    return Array.from({ length: 5 }, (_, i) => ({
        value: currentYear + i,
        label: String(currentYear + i)
    }))
}

function buildDisplay(data: Partial<EpocaViagem>): string {
    const { tipo, mes_inicio, mes_fim, ano, data_inicio, data_fim } = data

    if (tipo === 'indefinido') return 'A definir'

    if (tipo === 'mes' && mes_inicio && ano) {
        return `${MESES[mes_inicio - 1]?.label} ${ano}`
    }

    if (tipo === 'range_meses' && mes_inicio && mes_fim && ano) {
        return `${MESES[mes_inicio - 1]?.label} a ${MESES[mes_fim - 1]?.label} ${ano}`
    }

    if (tipo === 'data_exata' && data_inicio) {
        const formatDate = (d: string) => {
            const [y, m, day] = d.split('-')
            return `${day}/${m}/${y}`
        }
        if (data_fim) {
            return `${formatDate(data_inicio)} a ${formatDate(data_fim)}`
        }
        return formatDate(data_inicio)
    }

    return ''
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- legacy format parsing requires dynamic shape
function parseExistingValue(value: Record<string, any> | null | undefined): EpocaViagem | null {
    if (!value) return null

    // Handle legacy format { inicio, fim, flexivel }
    if (value.inicio && !value.tipo) {
        const inicio = new Date(value.inicio)
        const fim = value.fim ? new Date(value.fim) : null

        return {
            tipo: 'data_exata',
            data_inicio: value.inicio,
            data_fim: value.fim || undefined,
            mes_inicio: inicio.getMonth() + 1,
            mes_fim: fim ? fim.getMonth() + 1 : inicio.getMonth() + 1,
            ano: inicio.getFullYear(),
            display: buildDisplay({
                tipo: 'data_exata',
                data_inicio: value.inicio,
                data_fim: value.fim
            }),
            flexivel: value.flexivel || false
        }
    }

    // Already in new format
    if (value.tipo) {
        return value as EpocaViagem
    }

    return null
}

export default function FlexibleDateField({
    label,
    value,
    onChange,
    onSave,
    readOnly = false,
    required = false,
    error,
    helpText
}: BaseFieldProps) {
    const [localData, setLocalData] = useState<EpocaViagem>(() => {
        const parsed = parseExistingValue(value)
        return parsed || {
            tipo: 'mes',
            ano: new Date().getFullYear(),
            display: '',
            flexivel: false
        }
    })

    const [showTypeDropdown, setShowTypeDropdown] = useState(false)

    // Sync external value → local state
    useEffect(() => {
        const parsed = parseExistingValue(value)
        if (parsed) {
            // eslint-disable-next-line react-hooks/set-state-in-effect -- valid prop→state sync for controlled component
            setLocalData(parsed)
        }
    }, [value])

    const updateData = (updates: Partial<EpocaViagem>) => {
        const newData = { ...localData, ...updates }
        newData.display = buildDisplay(newData)
        setLocalData(newData)
        onChange?.(newData)
    }

    const handleTypeChange = (tipo: EpocaTipo) => {
        const newData: EpocaViagem = {
            tipo,
            ano: localData.ano || new Date().getFullYear(),
            display: '',
            flexivel: localData.flexivel
        }

        // Clear type-specific fields
        if (tipo === 'mes') {
            newData.mes_inicio = localData.mes_inicio || new Date().getMonth() + 1
            newData.mes_fim = newData.mes_inicio
        } else if (tipo === 'range_meses') {
            newData.mes_inicio = localData.mes_inicio || new Date().getMonth() + 1
            newData.mes_fim = localData.mes_fim || (newData.mes_inicio + 2 > 12 ? 12 : newData.mes_inicio + 2)
        } else if (tipo === 'data_exata') {
            newData.data_inicio = localData.data_inicio
            newData.data_fim = localData.data_fim
        }

        newData.display = buildDisplay(newData)
        setLocalData(newData)
        onChange?.(newData)
        setShowTypeDropdown(false)
    }

    // Display Mode
    if (readOnly || !onChange) {
        const parsed = parseExistingValue(value)
        return (
            <FieldWrapper label={label} required={required} helpText={helpText}>
                {parsed?.display ? (
                    <div className="flex items-center gap-2 text-xs text-gray-900">
                        <Calendar className="h-4 w-4 text-gray-400" />
                        <span>{parsed.display}</span>
                        {parsed.flexivel && (
                            <span className="text-xs text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">
                                Flexível
                            </span>
                        )}
                    </div>
                ) : (
                    <DisplayValue value={null} />
                )}
            </FieldWrapper>
        )
    }

    const selectedTipo = TIPOS.find(t => t.value === localData.tipo)
    const years = generateYearOptions()

    return (
        <FieldWrapper label={label} required={required} error={error} helpText={helpText}>
            <div className="space-y-3">
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
                                        localData.tipo === tipo.value && "bg-indigo-50"
                                    )}
                                >
                                    <div className="text-left">
                                        <div className="text-xs font-medium text-gray-900">{tipo.label}</div>
                                        <div className="text-xs text-gray-500">{tipo.description}</div>
                                    </div>
                                    {localData.tipo === tipo.value && (
                                        <Check className="h-4 w-4 text-indigo-600" />
                                    )}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Conditional Inputs */}
                {localData.tipo === 'mes' && (
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Mês</label>
                            <select
                                value={localData.mes_inicio || ''}
                                onChange={(e) => {
                                    const mes = parseInt(e.target.value)
                                    updateData({ mes_inicio: mes, mes_fim: mes })
                                }}
                                onBlur={() => onSave?.()}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-xs bg-white"
                            >
                                <option value="">Selecione...</option>
                                {MESES.map(m => (
                                    <option key={m.value} value={m.value}>{m.label}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Ano</label>
                            <select
                                value={localData.ano || ''}
                                onChange={(e) => updateData({ ano: parseInt(e.target.value) })}
                                onBlur={() => onSave?.()}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-xs bg-white"
                            >
                                {years.map(y => (
                                    <option key={y.value} value={y.value}>{y.label}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                )}

                {localData.tipo === 'range_meses' && (
                    <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">De</label>
                                <select
                                    value={localData.mes_inicio || ''}
                                    onChange={(e) => updateData({ mes_inicio: parseInt(e.target.value) })}
                                    onBlur={() => onSave?.()}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-xs bg-white"
                                >
                                    <option value="">Selecione...</option>
                                    {MESES.map(m => (
                                        <option key={m.value} value={m.value}>{m.label}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">Até</label>
                                <select
                                    value={localData.mes_fim || ''}
                                    onChange={(e) => updateData({ mes_fim: parseInt(e.target.value) })}
                                    onBlur={() => onSave?.()}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-xs bg-white"
                                >
                                    <option value="">Selecione...</option>
                                    {MESES.map(m => (
                                        <option key={m.value} value={m.value}>{m.label}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Ano</label>
                            <select
                                value={localData.ano || ''}
                                onChange={(e) => updateData({ ano: parseInt(e.target.value) })}
                                onBlur={() => onSave?.()}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-xs bg-white"
                            >
                                {years.map(y => (
                                    <option key={y.value} value={y.value}>{y.label}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                )}

                {localData.tipo === 'data_exata' && (
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Data Início</label>
                            <input
                                type="date"
                                value={localData.data_inicio || ''}
                                onChange={(e) => {
                                    const date = e.target.value
                                    const d = new Date(date)
                                    updateData({
                                        data_inicio: date,
                                        mes_inicio: d.getMonth() + 1,
                                        ano: d.getFullYear()
                                    })
                                }}
                                onBlur={() => onSave?.()}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-xs"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Data Fim</label>
                            <input
                                type="date"
                                value={localData.data_fim || ''}
                                onChange={(e) => {
                                    const date = e.target.value
                                    const d = new Date(date)
                                    updateData({
                                        data_fim: date,
                                        mes_fim: d.getMonth() + 1
                                    })
                                }}
                                onBlur={() => onSave?.()}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-xs"
                            />
                        </div>
                    </div>
                )}

                {localData.tipo === 'indefinido' && (
                    <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                        <p className="text-xs text-gray-600 text-center">
                            O cliente ainda não definiu a época da viagem
                        </p>
                    </div>
                )}

                {/* Flexible Toggle */}
                {localData.tipo !== 'indefinido' && (
                    <label className="flex items-center gap-2.5 p-2.5 bg-amber-50 rounded-lg border border-amber-100 cursor-pointer hover:bg-amber-100/50 transition-colors">
                        <input
                            type="checkbox"
                            checked={localData.flexivel}
                            onChange={(e) => updateData({ flexivel: e.target.checked })}
                            className="h-4 w-4 text-amber-600 border-amber-300 rounded focus:ring-amber-500"
                        />
                        <div>
                            <span className="text-xs font-medium text-amber-900">Datas flexíveis</span>
                            <p className="text-xs text-amber-700">Cliente pode ajustar as datas se necessário</p>
                        </div>
                    </label>
                )}

                {/* Preview */}
                {localData.display && (
                    <div className="p-3 bg-indigo-50 rounded-lg border border-indigo-100">
                        <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-indigo-600" />
                            <span className="text-xs font-medium text-indigo-900">{localData.display}</span>
                            {localData.flexivel && (
                                <span className="text-xs text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded">
                                    Flexível
                                </span>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </FieldWrapper>
    )
}
