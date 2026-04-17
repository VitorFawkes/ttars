import type { ReactNode } from 'react'

export interface BaseFieldProps {
    label: string
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- field values are dynamic
    value: any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- field values are dynamic
    onChange?: (value: any) => void
    onSave?: () => void
    readOnly?: boolean
    required?: boolean
    error?: string
    helpText?: string
    cardId?: string
}

interface FieldWrapperProps {
    label: string
    required?: boolean
    error?: string
    helpText?: string
    children: ReactNode
}

export function FieldWrapper({ label, required, error, helpText, children }: FieldWrapperProps) {
    return (
        <div className="space-y-1">
            <label className="block text-xs font-medium text-gray-700">
                {label}
                {required && <span className="text-red-500 ml-1">*</span>}
            </label>
            {children}
            {helpText && !error && (
                <p className="text-xs text-gray-500">{helpText}</p>
            )}
            {error && (
                <p className="text-xs text-red-600">{error}</p>
            )}
        </div>
    )
}

export function DisplayValue({ value, className = '' }: { value: string | number | null | undefined, className?: string }) {
    if (value === null || value === undefined || value === '') {
        return <span className="text-xs text-gray-400 italic">Não informado</span>
    }

    return <span className={`text-xs text-gray-900 ${className}`}>{value}</span>
}
