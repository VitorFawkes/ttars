import { MapPin } from 'lucide-react'
import { FieldWrapper } from './BaseField'
import type { BaseFieldProps } from './BaseField'
import { useState, useEffect } from 'react'

export default function DestinosField({
    label,
    value,
    onChange,
    onSave,
    readOnly = false,
    required = false,
    error,
    helpText
}: BaseFieldProps) {
    const destinos = (value as string[] | null | undefined) || []

    // Local state for the text input
    // Initialize with joined string
    const [textValue, setTextValue] = useState(destinos.join(', '))

    // Update local state if external value changes (and we're not currently editing to avoid fighting)
    // We'll trust the initial render and onBlur sync mostly, but this helps if data comes from elsewhere
    useEffect(() => {
        setTextValue(destinos.join(', '))
    }, [value])

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setTextValue(e.target.value)
    }

    const handleBlur = () => {
        if (!onChange) return

        // Parse the comma-separated string back into an array
        const newDestinos = textValue
            .split(',')
            .map(s => s.trim())
            .filter(s => s.length > 0)

        // Only trigger update if actually changed to avoid unnecessary saves
        const currentJoined = destinos.join(', ')
        const newJoined = newDestinos.join(', ')

        if (currentJoined !== newJoined) {
            onChange(newDestinos)
            setTimeout(() => onSave?.(), 100)
        }
    }

    if (readOnly || !onChange) {
        return (
            <FieldWrapper label={label} required={required} helpText={helpText}>
                {destinos.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                        {destinos.map((destino, idx) => (
                            <span
                                key={idx}
                                className="inline-flex items-center gap-1 px-2.5 py-1 bg-indigo-100 text-indigo-700 rounded-full text-sm"
                            >
                                <MapPin className="h-3 w-3" />
                                {destino}
                            </span>
                        ))}
                    </div>
                ) : (
                    <span className="text-sm text-gray-400 italic">Nenhum destino informado</span>
                )}
            </FieldWrapper>
        )
    }

    return (
        <FieldWrapper label={label} required={required} error={error} helpText={helpText}>
            <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <MapPin className="h-4 w-4 text-gray-400" />
                </div>
                <input
                    type="text"
                    value={textValue}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    placeholder="Ex: Paris, Londres, Roma"
                    className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                />
            </div>
            {/* Real-time preview to reassure user of data structure */}
            {textValue && (
                <div className="mt-2">
                    <p className="text-xs text-gray-500 mb-1">
                        O sistema identificou {textValue.split(',').filter(s => s.trim()).length} destinos:
                    </p>
                    <div className="flex flex-wrap gap-2">
                        {textValue.split(',').map(s => s.trim()).filter(s => s).map((destino, idx) => (
                            <span
                                key={idx}
                                className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs border border-gray-200"
                            >
                                <MapPin className="h-3 w-3" />
                                {destino}
                            </span>
                        ))}
                    </div>
                </div>
            )}
        </FieldWrapper>
    )
}
