import { FieldWrapper, DisplayValue } from './BaseField'
import type { BaseFieldProps } from './BaseField'

export default function TextFieldInput({
    label,
    value,
    onChange,
    readOnly = false,
    required = false,
    error,
    helpText
}: BaseFieldProps) {
    if (readOnly || !onChange) {
        return (
            <FieldWrapper label={label} required={required} helpText={helpText}>
                <DisplayValue value={value} />
            </FieldWrapper>
        )
    }

    return (
        <FieldWrapper label={label} required={required} error={error} helpText={helpText}>
            <input
                type="text"
                value={value || ''}
                onChange={(e) => onChange(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                placeholder={`Digite ${label.toLowerCase()}`}
            />
        </FieldWrapper>
    )
}
