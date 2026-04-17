import { Calendar } from 'lucide-react'
import { FieldWrapper, DisplayValue } from './BaseField'
import type { BaseFieldProps } from './BaseField'

interface DateRange {
    inicio: string
    fim: string
}

export default function DateRangeField({
    label,
    value,
    onChange,
    onSave,
    readOnly = false,
    required = false,
    error,
    helpText
}: BaseFieldProps) {
    const dateRange = value as DateRange | null | undefined

    const formatDate = (dateStr: string | undefined) => {
        if (!dateStr) return null
        return new Date(dateStr).toLocaleDateString('pt-BR', {
            day: '2-digit',
            month: 'short',
            year: 'numeric'
        })
    }

    if (readOnly || !onChange) {
        return (
            <FieldWrapper label={label} required={required} helpText={helpText}>
                {dateRange?.inicio && dateRange?.fim ? (
                    <div className="flex items-center gap-2 text-sm text-gray-900">
                        <Calendar className="h-4 w-4 text-gray-400" />
                        <span>{formatDate(dateRange.inicio)} - {formatDate(dateRange.fim)}</span>
                    </div>
                ) : (
                    <DisplayValue value={null} />
                )}
            </FieldWrapper>
        )
    }

    return (
        <FieldWrapper label={label} required={required} error={error} helpText={helpText}>
            <div className="grid grid-cols-2 gap-3">
                <div>
                    <label className="block text-xs text-gray-600 mb-1">Data Início</label>
                    <input
                        type="date"
                        value={dateRange?.inicio || ''}
                        onChange={(e) => onChange({ ...dateRange, inicio: e.target.value })}
                        onBlur={() => onSave?.()}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                    />
                </div>
                <div>
                    <label className="block text-xs text-gray-600 mb-1">Data Fim</label>
                    <input
                        type="date"
                        value={dateRange?.fim || ''}
                        onChange={(e) => onChange({ ...dateRange, fim: e.target.value })}
                        onBlur={() => onSave?.()}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                    />
                </div>
            </div>
        </FieldWrapper>
    )
}
