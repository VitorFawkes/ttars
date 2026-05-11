import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { X, Plus, Trash2, Save, Send, Loader2 } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'

interface ProposalBuilderModalProps {
    cardId: string
    isOpen: boolean
    onClose: () => void
}

interface ProposalItem {
    id: string
    type: 'flight' | 'hotel' | 'service' | 'other'
    description: string
    price: number
}

export default function ProposalBuilderModal({ cardId, isOpen, onClose }: ProposalBuilderModalProps) {
    const { user } = useAuth()
    const queryClient = useQueryClient()
    const [title, setTitle] = useState('')
    const [validUntil, setValidUntil] = useState('')
    const [items, setItems] = useState<ProposalItem[]>([])
    const [saving, setSaving] = useState(false)

    const addItem = () => {
        setItems([
            ...items,
            {
                id: crypto.randomUUID(),
                type: 'service',
                description: '',
                price: 0
            }
        ])
    }

    const updateItem = (id: string, field: keyof ProposalItem, value: unknown) => {
        setItems(items.map(item => item.id === id ? { ...item, [field]: value } : item))
    }

    const removeItem = (id: string) => {
        setItems(items.filter(item => item.id !== id))
    }

    const totalPrice = items.reduce((sum, item) => sum + (Number(item.price) || 0), 0)

    const saveProposalMutation = useMutation({
        mutationFn: async (status: 'draft' | 'sent') => {
            if (!user) throw new Error('User not authenticated')

            const content = {
                title,
                items,
                totalPrice
            }

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { error } = await (supabase.from('proposals') as any).insert({
                card_id: cardId,
                status,
                content,
                valid_until: validUntil || null,
                created_by: user.id,
                version: 1
            })

            if (error) throw error

            // Log activity
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (supabase.from('activities') as any).insert({
                card_id: cardId,
                tipo: status === 'sent' ? 'proposal_sent' : 'proposal_created',
                descricao: status === 'sent' ? `Proposta enviada: ${title}` : `Rascunho de proposta criado: ${title}`,
                created_by: user.id
            })
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['activity-feed', cardId] })
            onClose()
            // Reset form
            setTitle('')
            setValidUntil('')
            setItems([])
        },
        onError: (error) => {
            console.error('Error saving proposal:', error)
            alert('Erro ao salvar proposta')
        }
    })

    const handleSave = async (status: 'draft' | 'sent') => {
        if (!title) {
            alert('Por favor, informe um título para a proposta.')
            return
        }
        setSaving(true)
        try {
            await saveProposalMutation.mutateAsync(status)
        } finally {
            setSaving(false)
        }
    }

    if (!isOpen) return null

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-4xl bg-white rounded-lg shadow-xl flex flex-col max-h-[90vh]">
                <div className="flex items-center justify-between px-6 py-4 border-b">
                    <h3 className="text-lg font-semibold text-gray-900">Nova Proposta</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-500">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <div className="p-6 overflow-y-auto flex-1 space-y-6">
                    {/* Header Info */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Título da Proposta</label>
                            <input
                                type="text"
                                value={title}
                                onChange={e => setTitle(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                                placeholder="Ex: Roteiro Itália 2024"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Validade</label>
                            <input
                                type="date"
                                value={validUntil}
                                onChange={e => setValidUntil(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                            />
                        </div>
                    </div>

                    {/* Items */}
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <h4 className="text-sm font-medium text-gray-900">Itens da Proposta</h4>
                            <button
                                onClick={addItem}
                                className="flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-700 font-medium"
                            >
                                <Plus className="h-4 w-4" />
                                Adicionar Item
                            </button>
                        </div>

                        <div className="space-y-3">
                            {items.length === 0 && (
                                <div className="text-center py-8 border-2 border-dashed border-gray-200 rounded-lg text-gray-500 text-sm">
                                    Nenhum item adicionado. Clique em "Adicionar Item" para começar.
                                </div>
                            )}

                            {items.map((item) => (
                                <div key={item.id} className="flex gap-3 items-start p-3 bg-gray-50 rounded-lg border border-gray-200">
                                    <select
                                        value={item.type}
                                        onChange={e => updateItem(item.id, 'type', e.target.value)}
                                        className="w-32 px-2 py-1.5 text-sm border border-gray-300 rounded-md"
                                    >
                                        <option value="flight">Voo</option>
                                        <option value="hotel">Hotel</option>
                                        <option value="service">Serviço</option>
                                        <option value="other">Outro</option>
                                    </select>

                                    <input
                                        type="text"
                                        value={item.description}
                                        onChange={e => updateItem(item.id, 'description', e.target.value)}
                                        className="flex-1 px-2 py-1.5 text-sm border border-gray-300 rounded-md"
                                        placeholder="Descrição do item"
                                    />

                                    <div className="relative w-32">
                                        <span className="absolute left-2 top-1.5 text-gray-500 text-sm">R$</span>
                                        <input
                                            type="number"
                                            value={item.price}
                                            onChange={e => updateItem(item.id, 'price', Number(e.target.value))}
                                            className="w-full pl-8 pr-2 py-1.5 text-sm border border-gray-300 rounded-md text-right"
                                            placeholder="0,00"
                                        />
                                    </div>

                                    <button
                                        onClick={() => removeItem(item.id)}
                                        className="p-1.5 text-gray-400 hover:text-red-500"
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Total */}
                    <div className="flex justify-end pt-4 border-t">
                        <div className="text-right">
                            <span className="text-sm text-gray-500 mr-2">Total Estimado:</span>
                            <span className="text-xl font-bold text-gray-900">
                                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalPrice)}
                            </span>
                        </div>
                    </div>
                </div>

                <div className="px-6 py-4 border-t bg-gray-50 flex justify-end gap-3 rounded-b-lg">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={() => handleSave('draft')}
                        disabled={saving}
                        className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                    >
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        Salvar Rascunho
                    </button>
                    <button
                        onClick={() => handleSave('sent')}
                        disabled={saving}
                        className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 border border-transparent rounded-md hover:bg-indigo-700"
                    >
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                        Gerar e Enviar
                    </button>
                </div>
            </div>
        </div>
    )
}
