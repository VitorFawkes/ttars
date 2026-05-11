import { useState } from 'react'
import { MapPin, Calendar, Truck, Save, Loader2 } from 'lucide-react'

interface GiftDeliveryInfoProps {
    deliveryAddress: string | null
    deliveryDate: string | null
    deliveryMethod: string | null
    budget: number | null
    notes: string | null
    onSave: (data: { delivery_address?: string; delivery_date?: string; delivery_method?: string; budget?: number; notes?: string }) => void
    isSaving: boolean
    readOnly?: boolean
}

const methods = [
    { value: 'correio', label: 'Correio' },
    { value: 'motoboy', label: 'Motoboy' },
    { value: 'consultora', label: 'Via Consultora' },
    { value: 'hotel', label: 'Hotel/Destino' },
]

export default function GiftDeliveryInfo({ deliveryAddress, deliveryDate, deliveryMethod, budget, notes, onSave, isSaving, readOnly }: GiftDeliveryInfoProps) {
    const [form, setForm] = useState({
        delivery_address: deliveryAddress ?? '',
        delivery_date: deliveryDate ?? '',
        delivery_method: deliveryMethod ?? '',
        budget: budget ?? 0,
        notes: notes ?? '',
    })
    const [isDirty, setIsDirty] = useState(false)

    const handleChange = (key: string, value: string | number) => {
        setForm(f => ({ ...f, [key]: value }))
        setIsDirty(true)
    }

    const handleSave = () => {
        onSave({
            delivery_address: form.delivery_address || undefined,
            delivery_date: form.delivery_date || undefined,
            delivery_method: form.delivery_method || undefined,
            budget: form.budget || undefined,
            notes: form.notes || undefined,
        })
        setIsDirty(false)
    }

    return (
        <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
                <div>
                    <label className="flex items-center gap-1.5 text-xs font-medium text-slate-500 mb-1">
                        <MapPin className="h-3 w-3" /> Endereço de entrega
                    </label>
                    <input
                        type="text"
                        value={form.delivery_address}
                        onChange={e => handleChange('delivery_address', e.target.value)}
                        disabled={readOnly}
                        placeholder="Rua, bairro, cidade..."
                        className="w-full px-2.5 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-50"
                    />
                </div>
                <div>
                    <label className="flex items-center gap-1.5 text-xs font-medium text-slate-500 mb-1">
                        <Calendar className="h-3 w-3" /> Data de entrega
                    </label>
                    <input
                        type="date"
                        value={form.delivery_date}
                        onChange={e => handleChange('delivery_date', e.target.value)}
                        disabled={readOnly}
                        className="w-full px-2.5 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-50"
                    />
                </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
                <div>
                    <label className="flex items-center gap-1.5 text-xs font-medium text-slate-500 mb-1">
                        <Truck className="h-3 w-3" /> Método de entrega
                    </label>
                    <select
                        value={form.delivery_method}
                        onChange={e => handleChange('delivery_method', e.target.value)}
                        disabled={readOnly}
                        className="w-full px-2.5 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-50"
                    >
                        <option value="">Selecionar...</option>
                        {methods.map(m => (
                            <option key={m.value} value={m.value}>{m.label}</option>
                        ))}
                    </select>
                </div>
                <div>
                    <label className="text-xs font-medium text-slate-500 mb-1 block">Budget (R$)</label>
                    <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={form.budget}
                        onChange={e => handleChange('budget', parseFloat(e.target.value) || 0)}
                        disabled={readOnly}
                        className="w-full px-2.5 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-50"
                    />
                </div>
            </div>

            <div>
                <label className="text-xs font-medium text-slate-500 mb-1 block">Observações</label>
                <textarea
                    value={form.notes}
                    onChange={e => handleChange('notes', e.target.value)}
                    disabled={readOnly}
                    rows={2}
                    placeholder="Instruções especiais, personalização..."
                    className="w-full px-2.5 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none disabled:bg-slate-50"
                />
            </div>

            {isDirty && !readOnly && (
                <button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white text-xs font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                >
                    {isSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                    Salvar Entrega
                </button>
            )}
        </div>
    )
}
