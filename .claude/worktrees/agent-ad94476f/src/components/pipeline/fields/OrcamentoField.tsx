import { DollarSign } from 'lucide-react'
import { FieldWrapper } from './BaseField'
import type { BaseFieldProps } from './BaseField'

interface Orcamento {
    total: number
    por_pessoa?: number
}

export default function OrcamentoField({
    label,
    value,
    onChange,
    onSave,
    readOnly = false,
    required = false,
    error,
    helpText
}: BaseFieldProps) {
    const orcamento = (value as Orcamento | null | undefined) || { total: 0 }

    const formatCurrency = (val: number) => {
        return new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL',
            maximumFractionDigits: 0
        }).format(val)
    }

    const updateTotal = (val: number) => {
        if (onChange) onChange({ ...orcamento, total: Math.max(0, val) })
    }

    const updatePorPessoa = (val: number) => {
        if (onChange) onChange({ ...orcamento, por_pessoa: Math.max(0, val) })
    }

    if (readOnly || !onChange) {
        return (
            <FieldWrapper label={label} required={required} helpText={helpText}>
                <div className="space-y-1">
                    <div className="flex items-center gap-2 text-sm text-gray-900">
                        <DollarSign className="h-4 w-4 text-gray-400" />
                        <span className="font-medium">{formatCurrency(orcamento.total)}</span>
                        <span className="text-gray-500">total</span>
                    </div>
                    {orcamento.por_pessoa && orcamento.por_pessoa > 0 && (
                        <div className="text-xs text-gray-600 ml-6">
                            {formatCurrency(orcamento.por_pessoa)} por pessoa
                        </div>
                    )}
                </div>
            </FieldWrapper>
        )
    }

    return (
        <FieldWrapper label={label} required={required} error={error} helpText={helpText}>
            <div className="grid grid-cols-2 gap-3">
                <div>
                    <label className="block text-xs text-gray-600 mb-1">Orçamento Total</label>
                    <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">R$</span>
                        <input
                            type="number"
                            min="0"
                            step="100"
                            value={orcamento.total}
                            onChange={(e) => updateTotal(parseFloat(e.target.value) || 0)}
                            onBlur={() => onSave?.()}
                            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                        />
                    </div>
                </div>
                <div>
                    <label className="block text-xs text-gray-600 mb-1">Por Pessoa (opcional)</label>
                    <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">R$</span>
                        <input
                            type="number"
                            min="0"
                            step="100"
                            value={orcamento.por_pessoa || ''}
                            onChange={(e) => updatePorPessoa(parseFloat(e.target.value) || 0)}
                            onBlur={() => onSave?.()}
                            placeholder="0"
                            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                        />
                    </div>
                </div>
            </div>
        </FieldWrapper>
    )
}
