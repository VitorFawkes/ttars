import { useState } from 'react'
import { DollarSign, Check, X, Edit2 } from 'lucide-react'
import { cn } from '../../lib/utils'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'


// Define locally as it's missing in database.types
interface TripsProdutoData {
    taxa_planejamento?: string;
    taxa_valor?: number;
    taxa_status?: string;
    taxa_data_status?: string;
    taxa_alterado_por?: string;
    taxa_meio_pagamento?: string;
    taxa_codigo_transacao?: string;
    taxa_ativa?: boolean;
    [key: string]: any;
}

interface TaxaPlanejamentoCardProps {
    card: {
        id: string | null
        produto_data?: any
        [key: string]: any
    }
}

export default function TaxaPlanejamentoCard({ card }: TaxaPlanejamentoCardProps) {
    const queryClient = useQueryClient()
    const [isEditing, setIsEditing] = useState(false)
    const productData = (card.produto_data as TripsProdutoData) || {}
    const taxa = productData.taxa_planejamento || {} as any

    const [editedTaxa, setEditedTaxa] = useState(taxa)

    const updateTaxaMutation = useMutation({
        mutationFn: async (newTaxaData: typeof taxa) => {
            const { error } = await (supabase.from('cards') as any)
                .update({
                    produto_data: {
                        ...productData,
                        taxa_planejamento: newTaxaData
                    }
                })
                .eq('id', card.id)
            if (error) throw error
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['card', card.id] })
            setIsEditing(false)
        }
    })

    const statusLabels = {
        'nao_ativa': 'Não Ativa',
        'pendente': 'Pendente',
        'paga': 'Paga',
        'cortesia': 'Cortesia',
        'nao_aplicavel': 'N/A'
    }

    const statusColors = {
        'nao_ativa': 'bg-gray-100 text-gray-700',
        'pendente': 'bg-yellow-100 text-yellow-800',
        'paga': 'bg-green-100 text-green-800',
        'cortesia': 'bg-blue-100 text-blue-800',
        'nao_aplicavel': 'bg-gray-100 text-gray-500'
    }

    const handleSave = () => {
        updateTaxaMutation.mutate(editedTaxa)
    }

    const handleCancel = () => {
        setEditedTaxa(taxa)
        setIsEditing(false)
    }

    return (
        <div className="rounded-lg border bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    <DollarSign className="h-5 w-5 text-indigo-600" />
                    <h3 className="text-sm font-semibold text-gray-900">Taxa de Planejamento</h3>
                </div>
                {!isEditing && (
                    <button
                        onClick={() => setIsEditing(true)}
                        className="p-1 hover:bg-gray-100 rounded"
                    >
                        <Edit2 className="h-3.5 w-3.5 text-gray-500" />
                    </button>
                )}
            </div>

            {isEditing ? (
                <div className="space-y-3">
                    <div>
                        <label className="text-xs text-gray-600 block mb-1">Status</label>
                        <select
                            value={editedTaxa.status || 'nao_ativa'}
                            onChange={(e) => setEditedTaxa({ ...editedTaxa, status: e.target.value as any })}
                            className="w-full text-sm border-gray-300 rounded-md"
                        >
                            {Object.entries(statusLabels).map(([value, label]) => (
                                <option key={value} value={value}>{label}</option>
                            ))}
                        </select>
                    </div>

                    {editedTaxa.status !== 'nao_ativa' && editedTaxa.status !== 'nao_aplicavel' && (
                        <>
                            <div>
                                <label className="text-xs text-gray-600 block mb-1">Valor (R$)</label>
                                <input
                                    type="number"
                                    value={editedTaxa.valor || ''}
                                    onChange={(e) => setEditedTaxa({ ...editedTaxa, valor: parseFloat(e.target.value) || 0 })}
                                    className="w-full text-sm border-gray-300 rounded-md"
                                    placeholder="0.00"
                                />
                            </div>

                            {editedTaxa.status === 'cortesia' && (
                                <div>
                                    <label className="text-xs text-gray-600 block mb-1">Autorizada por</label>
                                    <input
                                        type="text"
                                        value={editedTaxa.autorizada_por || ''}
                                        onChange={(e) => setEditedTaxa({ ...editedTaxa, autorizada_por: e.target.value })}
                                        className="w-full text-sm border-gray-300 rounded-md"
                                    />
                                </div>
                            )}
                        </>
                    )}

                    <div className="flex gap-2">
                        <button
                            onClick={handleSave}
                            disabled={updateTaxaMutation.isPending}
                            className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 bg-indigo-600 text-white rounded-md text-sm hover:bg-indigo-700 disabled:opacity-50"
                        >
                            <Check className="h-3.5 w-3.5" />
                            Salvar
                        </button>
                        <button
                            onClick={handleCancel}
                            className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 border border-gray-300 text-gray-700 rounded-md text-sm hover:bg-gray-50"
                        >
                            <X className="h-3.5 w-3.5" />
                            Cancelar
                        </button>
                    </div>
                </div>
            ) : (
                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-600">Status</span>
                        <span className={cn(
                            "px-2 py-0.5 rounded-full text-xs font-medium",
                            statusColors[taxa.status as keyof typeof statusColors] || statusColors['nao_ativa']
                        )}>
                            {statusLabels[taxa.status as keyof typeof statusLabels] || 'Não Definido'}
                        </span>
                    </div>

                    {taxa.valor && (
                        <div className="flex items-center justify-between">
                            <span className="text-xs text-gray-600">Valor</span>
                            <span className="text-sm font-semibold text-gray-900">
                                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(taxa.valor)}
                            </span>
                        </div>
                    )}

                    {taxa.data_envio && (
                        <div className="flex items-center justify-between">
                            <span className="text-xs text-gray-600">Enviada em</span>
                            <span className="text-xs text-gray-900">
                                {new Date(taxa.data_envio).toLocaleDateString('pt-BR')}
                            </span>
                        </div>
                    )}

                    {taxa.data_pagamento && (
                        <div className="flex items-center justify-between">
                            <span className="text-xs text-gray-600">Paga em</span>
                            <span className="text-xs text-gray-900">
                                {new Date(taxa.data_pagamento).toLocaleDateString('pt-BR')}
                            </span>
                        </div>
                    )}

                    {taxa.autorizada_por && (
                        <div className="flex items-center justify-between">
                            <span className="text-xs text-gray-600">Autorizada por</span>
                            <span className="text-xs text-gray-900">{taxa.autorizada_por}</span>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
