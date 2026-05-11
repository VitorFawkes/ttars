import { useState, useEffect, useCallback } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { MessageSquare, Check, Loader2 } from 'lucide-react'
import type { Database } from '../../database.types'

type Card = Database['public']['Tables']['cards']['Row']

interface ObservacoesLivresProps {
    card: Card
}

export default function ObservacoesLivres({ card }: ObservacoesLivresProps) {
    const queryClient = useQueryClient()
    const productData = (card.produto_data as any) || {}
    const observacoes = (productData as any).observacoes || ''

    const [editedObs, setEditedObs] = useState(observacoes)
    const [isDirty, setIsDirty] = useState(false)

    // Sync state when card changes
    useEffect(() => {
        const obs = (card.produto_data as any)?.observacoes || ''
        setEditedObs(obs)
        setIsDirty(false)
        // eslint-disable-next-line react-hooks/set-state-in-effect
    }, [card.produto_data])

    const updateObsMutation = useMutation({
        mutationFn: async (newObs: string) => {
            const { error } = await (supabase.from('cards') as any)
                .update({
                    produto_data: {
                        ...productData,
                        observacoes: newObs
                    }
                })
                .eq('id', card.id)
            if (error) throw error
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['card', card.id!] })
            setIsDirty(false)
        }
    })

    const handleSave = useCallback(() => {
        updateObsMutation.mutate(editedObs)
    }, [editedObs, updateObsMutation])

    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const value = e.target.value
        setEditedObs(value)
        setIsDirty(value !== ((card.produto_data as any)?.observacoes || ''))
    }

    // Handle Enter to save (Shift+Enter for new line)
    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            handleSave()
        }
    }

    return (
        <div className="rounded-xl border border-gray-300 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-blue-100 rounded-lg">
                        <MessageSquare className="h-4 w-4 text-blue-600" />
                    </div>
                    <h3 className="text-sm font-semibold text-gray-900">Observações</h3>
                </div>
                {updateObsMutation.isPending ? (
                    <div className="flex items-center gap-1.5 text-xs text-gray-500">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Salvando...
                    </div>
                ) : isDirty ? (
                    <button
                        onClick={handleSave}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-medium hover:bg-indigo-700 transition-colors"
                    >
                        <Check className="h-3 w-3" />
                        Salvar Alterações
                    </button>
                ) : updateObsMutation.isSuccess ? (
                    <div className="flex items-center gap-1.5 text-xs text-green-600">
                        <Check className="h-3 w-3" />
                        Salvo
                    </div>
                ) : null}
            </div>

            <div className="space-y-3">
                <textarea
                    value={editedObs}
                    onChange={handleChange}
                    onKeyDown={handleKeyDown}
                    className="w-full px-4 py-3 text-sm border border-gray-300 rounded-lg shadow-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-shadow resize-none bg-white"
                    placeholder="Observações gerais sobre o card, anotações do vendedor, etc..."
                    rows={4}
                />
                <p className="text-xs text-gray-400">💡 Enter para salvar, Shift+Enter para nova linha</p>
            </div>
        </div>
    )
}
