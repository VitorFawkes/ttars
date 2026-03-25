import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import { Bell, Send, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription
} from '@/components/ui/dialog'

interface NotifyChangeModalProps {
    isOpen: boolean
    onClose: () => void
    cardId: string
    cardTitle?: string
    posOwnerId?: string | null
}

export default function NotifyChangeModal({
    isOpen,
    onClose,
    cardId,
    posOwnerId,
}: NotifyChangeModalProps) {
    const { profile } = useAuth()
    const { toast } = useToast()
    const queryClient = useQueryClient()

    const [titulo, setTitulo] = useState('')
    const [descricao, setDescricao] = useState('')
    const [changeCategory, setChangeCategory] = useState('')

    // Fetch categories (same as SmartTaskModal)
    const { data: categories } = useQuery({
        queryKey: ['activity-categories', 'change_request'],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('activity_categories')
                .select('key, label')
                .eq('scope', 'change_request')
                .eq('visible', true)
                .order('label')
            if (error) throw error
            return data as { key: string; label: string }[]
        },
    })

    const createNotification = useMutation({
        mutationFn: async () => {
            const responsavelId = posOwnerId || profile?.id
            if (!responsavelId) throw new Error('Nenhum responsável encontrado')

            const { error } = await supabase
                .from('tarefas')
                .insert({
                    card_id: cardId,
                    tipo: 'solicitacao_mudanca',
                    titulo,
                    descricao: descricao || null,
                    responsavel_id: responsavelId,
                    data_vencimento: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
                    prioridade: 'alta',
                    metadata: {
                        change_category: changeCategory || null,
                        origem: 'notificacao_direta',
                        notificado_por: profile?.id,
                    },
                    created_by: profile?.id,
                })

            if (error) throw error
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['tarefas', cardId] })
            toast({
                type: 'success',
                title: 'Pós-Venda notificado',
                description: 'Uma tarefa de mudança foi criada para o responsável do Pós-Venda',
            })
            resetAndClose()
        },
        onError: (error: Error) => {
            toast({
                type: 'error',
                title: 'Erro ao notificar',
                description: error.message,
            })
        },
    })

    const resetAndClose = () => {
        setTitulo('')
        setDescricao('')
        setChangeCategory('')
        onClose()
    }

    const canSubmit = titulo.trim().length > 0 && !createNotification.isPending

    return (
        <Dialog open={isOpen} onOpenChange={(open) => { if (!open) resetAndClose() }}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Bell className="w-4 h-4 text-orange-500" />
                        Notificar Alteração
                    </DialogTitle>
                    <DialogDescription>
                        Informe o Pós-Venda sobre uma mudança na viagem que não requer planejamento novo.
                        Uma tarefa será criada automaticamente.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 mt-2">
                    {/* Category */}
                    {categories && categories.length > 0 && (
                        <div>
                            <label className="text-xs font-medium text-gray-700 mb-1 block">
                                Categoria
                            </label>
                            <select
                                value={changeCategory}
                                onChange={(e) => setChangeCategory(e.target.value)}
                                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                            >
                                <option value="">Selecione (opcional)</option>
                                {categories.map((cat) => (
                                    <option key={cat.key} value={cat.key}>
                                        {cat.label}
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}

                    {/* Title */}
                    <div>
                        <label className="text-xs font-medium text-gray-700 mb-1 block">
                            O que mudou? <span className="text-red-500">*</span>
                        </label>
                        <input
                            type="text"
                            value={titulo}
                            onChange={(e) => setTitulo(e.target.value)}
                            placeholder="Ex: Hotel Cancún removido da venda"
                            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                            autoFocus
                        />
                    </div>

                    {/* Description */}
                    <div>
                        <label className="text-xs font-medium text-gray-700 mb-1 block">
                            Detalhes para o Pós-Venda
                        </label>
                        <textarea
                            value={descricao}
                            onChange={(e) => setDescricao(e.target.value)}
                            placeholder="Descreva o que o Pós-Venda precisa saber: produtos removidos, vendas canceladas, ajustes necessários..."
                            rows={3}
                            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent resize-none"
                        />
                    </div>

                    {/* Info box */}
                    <div className="rounded-lg bg-orange-50 border border-orange-200 p-3 text-xs text-orange-700">
                        <p className="font-medium mb-1">O que vai acontecer:</p>
                        <ul className="list-disc pl-4 space-y-0.5">
                            <li>Tarefa criada na aba de tarefas deste card</li>
                            <li>Responsável: dono do Pós-Venda</li>
                            <li>Prazo: 3 dias</li>
                            <li>Prioridade: Alta (aparece no topo)</li>
                        </ul>
                    </div>

                    {/* Actions */}
                    <div className="flex justify-end gap-2 pt-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={resetAndClose}
                        >
                            Cancelar
                        </Button>
                        <Button
                            size="sm"
                            disabled={!canSubmit}
                            onClick={() => createNotification.mutate()}
                            className="bg-orange-600 hover:bg-orange-700 text-white"
                        >
                            {createNotification.isPending ? (
                                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                            ) : (
                                <Send className="w-4 h-4 mr-1" />
                            )}
                            Notificar Pós-Venda
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
}
