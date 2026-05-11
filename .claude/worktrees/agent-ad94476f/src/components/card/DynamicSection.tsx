import { useState } from 'react'
import { useFieldConfig } from '../../hooks/useFieldConfig'
import { Pencil, Check, X } from 'lucide-react'
import type { Database } from '../../database.types'

type Card = Database['public']['Views']['view_cards_acoes']['Row']

interface DynamicSectionProps {
    stageId: string
    section: string
    card: Card
    title?: string
    onUpdate: (fieldKey: string, value: any) => Promise<void>
}

export default function DynamicSection({ stageId, section, card, title, onUpdate }: DynamicSectionProps) {
    const { getVisibleFields } = useFieldConfig()
    const fields = getVisibleFields(stageId, section)
    const [editingField, setEditingField] = useState<string | null>(null)
    const [tempValue, setTempValue] = useState<any>(null)
    const [saving, setSaving] = useState(false)

    if (fields.length === 0) return null

    const handleEdit = (key: string, currentValue: any) => {
        setEditingField(key)
        setTempValue(currentValue)
    }

    const handleCancel = () => {
        setEditingField(null)
        setTempValue(null)
    }

    const handleSave = async (key: string) => {
        setSaving(true)
        try {
            await onUpdate(key, tempValue)
            setEditingField(null)
        } catch (error) {
            console.error('Failed to save field', key, error)
            alert('Erro ao salvar campo')
        } finally {
            setSaving(false)
        }
    }

    // Helper to get value from card (handling JSON if needed, though for now assuming flat or simple mapping)
    // For complex JSON fields like 'orcamento', we might need specialized logic or pass a specialized getter.
    // For this generic component, we'll assume direct access or simple path.
    const getValue = (key: string) => {
        // TODO: Handle nested JSON paths if key contains dots or is known to be in produto_data
        // For now, check card[key]
        return (card as any)[key]
    }

    return (
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden mb-6">
            {title && (
                <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
                    <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">{title}</h3>
                </div>
            )}
            <div className="p-4 space-y-4">
                {fields.map(field => {
                    const value = getValue(field.key)
                    const isEditing = editingField === field.key

                    return (
                        <div key={field.key} className="group">
                            <div className="flex items-center justify-between mb-1">
                                <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                                    {field.label}
                                    {field.isRequired && <span className="text-red-500 ml-0.5">*</span>}
                                </label>
                                {!isEditing && (
                                    <button
                                        onClick={() => handleEdit(field.key, value)}
                                        className="opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-100 rounded text-gray-400 hover:text-indigo-600 transition-all"
                                    >
                                        <Pencil className="w-3 h-3" />
                                    </button>
                                )}
                            </div>

                            {isEditing ? (
                                <div className="flex items-center gap-2">
                                    {/* Input based on type */}
                                    {field.type === 'text' && (
                                        <input
                                            type="text"
                                            value={tempValue || ''}
                                            onChange={e => setTempValue(e.target.value)}
                                            className="flex-1 text-sm border-gray-300 rounded-md shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                                            autoFocus
                                        />
                                    )}
                                    {field.type === 'number' && (
                                        <input
                                            type="number"
                                            value={tempValue || ''}
                                            onChange={e => setTempValue(e.target.value)}
                                            className="flex-1 text-sm border-gray-300 rounded-md shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                                            autoFocus
                                        />
                                    )}
                                    {field.type === 'currency' && (
                                        <input
                                            type="number"
                                            step="0.01"
                                            value={tempValue || ''}
                                            onChange={e => setTempValue(e.target.value)}
                                            className="flex-1 text-sm border-gray-300 rounded-md shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                                            autoFocus
                                        />
                                    )}
                                    {field.type === 'date' && (
                                        <input
                                            type="date"
                                            value={tempValue ? new Date(tempValue).toISOString().split('T')[0] : ''}
                                            onChange={e => setTempValue(e.target.value)}
                                            className="flex-1 text-sm border-gray-300 rounded-md shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                                            autoFocus
                                        />
                                    )}
                                    {field.type === 'boolean' && (
                                        <input
                                            type="checkbox"
                                            checked={!!tempValue}
                                            onChange={e => setTempValue(e.target.checked)}
                                            className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                                        />
                                    )}

                                    {/* Actions */}
                                    <button
                                        onClick={() => handleSave(field.key)}
                                        disabled={saving}
                                        className="p-1.5 bg-green-50 text-green-600 rounded hover:bg-green-100 disabled:opacity-50"
                                    >
                                        <Check className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={handleCancel}
                                        disabled={saving}
                                        className="p-1.5 bg-gray-50 text-gray-600 rounded hover:bg-gray-100 disabled:opacity-50"
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>
                            ) : (
                                <div className="text-sm text-gray-900 min-h-[20px]">
                                    {/* Display based on type */}
                                    {field.type === 'currency' && value ? (
                                        new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
                                    ) : field.type === 'date' && value ? (
                                        new Date(value).toLocaleDateString('pt-BR')
                                    ) : field.type === 'boolean' ? (
                                        value ? 'Sim' : 'Não'
                                    ) : (
                                        value || <span className="text-gray-400 italic">Vazio</span>
                                    )}
                                </div>
                            )}
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
