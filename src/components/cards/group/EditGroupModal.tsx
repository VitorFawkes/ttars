import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Users, Loader2 } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Database } from '../../../database.types'

type Card = Database['public']['Tables']['cards']['Row']

interface EditGroupModalProps {
    isOpen: boolean
    onClose: () => void
    card: Card
    onSuccess?: () => void
}

const PRODUTO_LABELS: Record<string, string> = {
    TRIPS: 'Viagens',
    WEDDING: 'Casamentos',
    CORP: 'Corporativo',
}

export default function EditGroupModal({ isOpen, onClose, card, onSuccess }: EditGroupModalProps) {
    const queryClient = useQueryClient()
    const [formData, setFormData] = useState({
        titulo: '',
        group_capacity: '',
        data_viagem_inicio: '',
        data_viagem_fim: '',
        origem: '',
    })
    const [errors, setErrors] = useState<{ titulo?: string; datas?: string }>({})

    /* eslint-disable react-hooks/set-state-in-effect */
    useEffect(() => {
        if (isOpen) {
            setFormData({
                titulo: card.titulo ?? '',
                group_capacity: card.group_capacity != null ? String(card.group_capacity) : '',
                data_viagem_inicio: card.data_viagem_inicio ?? '',
                data_viagem_fim: card.data_viagem_fim ?? '',
                origem: card.origem ?? '',
            })
            setErrors({})
        }
    }, [isOpen, card])
    /* eslint-enable react-hooks/set-state-in-effect */

    const updateGroupMutation = useMutation({
        mutationFn: async () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { error } = await (supabase.from('cards') as any)
                .update({
                    titulo: formData.titulo.trim(),
                    group_capacity: formData.group_capacity ? parseInt(formData.group_capacity) : null,
                    data_viagem_inicio: formData.data_viagem_inicio || null,
                    data_viagem_fim: formData.data_viagem_fim || null,
                    origem: formData.origem.trim() || null,
                })
                .eq('id', card.id)

            if (error) throw error
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['groups-gallery'] })
            queryClient.invalidateQueries({ queryKey: ['cards'] })
            queryClient.invalidateQueries({ queryKey: ['card', card.id] })
            onClose()
            onSuccess?.()
        },
    })

    const handleSubmit = () => {
        const newErrors: typeof errors = {}
        if (!formData.titulo.trim()) {
            newErrors.titulo = 'Título é obrigatório'
        }
        if (
            formData.data_viagem_inicio &&
            formData.data_viagem_fim &&
            formData.data_viagem_fim < formData.data_viagem_inicio
        ) {
            newErrors.datas = 'A data de fim não pode ser anterior à data de início'
        }
        if (Object.keys(newErrors).length > 0) {
            setErrors(newErrors)
            return
        }
        updateGroupMutation.mutate()
    }

    const produtoLabel = PRODUTO_LABELS[card.produto ?? 'TRIPS'] ?? card.produto ?? '—'

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-xl">
                        <Users className="w-5 h-5 text-indigo-600" />
                        Editar grupo
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    {/* Título */}
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">
                            Título do Grupo <span className="text-red-500">*</span>
                        </label>
                        <Input
                            value={formData.titulo}
                            onChange={(e) => {
                                setFormData({ ...formData, titulo: e.target.value })
                                if (errors.titulo) setErrors({ ...errors, titulo: undefined })
                            }}
                            placeholder="Ex: Excursão Disney Dezembro 2026"
                            className={errors.titulo ? 'border-red-300 focus:border-red-500' : ''}
                            autoFocus
                        />
                        {errors.titulo && (
                            <p className="text-red-500 text-xs mt-1">{errors.titulo}</p>
                        )}
                    </div>

                    {/* Produto (read-only) */}
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">
                            Produto
                        </label>
                        <div className="h-10 px-3 rounded-md border border-slate-200 bg-slate-50 text-sm text-slate-600 flex items-center">
                            {produtoLabel}
                        </div>
                        <p className="text-xs text-slate-400 mt-1">
                            O produto do grupo não pode ser alterado após a criação.
                        </p>
                    </div>

                    {/* Capacidade */}
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">
                            Capacidade máxima de viajantes
                        </label>
                        <Input
                            type="number"
                            value={formData.group_capacity}
                            onChange={(e) => setFormData({ ...formData, group_capacity: e.target.value })}
                            placeholder="Ex: 30 (opcional)"
                            min="1"
                        />
                    </div>

                    {/* Datas */}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1.5">
                                Data início
                            </label>
                            <Input
                                type="date"
                                value={formData.data_viagem_inicio}
                                onChange={(e) => {
                                    setFormData({ ...formData, data_viagem_inicio: e.target.value })
                                    if (errors.datas) setErrors({ ...errors, datas: undefined })
                                }}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1.5">
                                Data fim
                            </label>
                            <Input
                                type="date"
                                value={formData.data_viagem_fim}
                                onChange={(e) => {
                                    setFormData({ ...formData, data_viagem_fim: e.target.value })
                                    if (errors.datas) setErrors({ ...errors, datas: undefined })
                                }}
                            />
                        </div>
                    </div>
                    {errors.datas && (
                        <p className="text-red-500 text-xs -mt-2">{errors.datas}</p>
                    )}

                    {/* Origem */}
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">
                            Origem
                        </label>
                        <Input
                            value={formData.origem}
                            onChange={(e) => setFormData({ ...formData, origem: e.target.value })}
                            placeholder="Ex: São Paulo (opcional)"
                        />
                    </div>

                    {updateGroupMutation.isError && (
                        <p className="text-red-500 text-sm">
                            Erro ao salvar grupo: {(updateGroupMutation.error as Error).message}
                        </p>
                    )}
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={onClose} disabled={updateGroupMutation.isPending}>
                        Cancelar
                    </Button>
                    <Button
                        onClick={handleSubmit}
                        disabled={updateGroupMutation.isPending}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white"
                    >
                        {updateGroupMutation.isPending ? (
                            <>
                                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                Salvando...
                            </>
                        ) : (
                            'Salvar alterações'
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
