import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Users, Loader2 } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/database.types'

type Product = Database['public']['Enums']['app_product']

interface CreateGroupModalProps {
    isOpen: boolean
    onClose: () => void
    onSuccess?: (groupId: string) => void
}

export default function CreateGroupModal({ isOpen, onClose, onSuccess }: CreateGroupModalProps) {
    const queryClient = useQueryClient()
    const [formData, setFormData] = useState({
        titulo: '',
        produto: 'TRIPS' as Product,
        group_capacity: '',
        data_viagem_inicio: '',
        data_viagem_fim: '',
        origem: ''
    })
    const [errors, setErrors] = useState<{ titulo?: string }>({})

    // Reset form when modal opens
    /* eslint-disable react-hooks/set-state-in-effect */
    useEffect(() => {
        if (isOpen) {
            setFormData({
                titulo: '',
                produto: 'TRIPS',
                group_capacity: '',
                data_viagem_inicio: '',
                data_viagem_fim: '',
                origem: ''
            })
            setErrors({})
        }
    }, [isOpen])
    /* eslint-enable react-hooks/set-state-in-effect */

    const createGroupMutation = useMutation({
        mutationFn: async () => {
            // Get pipeline for product
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data: pipeline } = await (supabase.from('pipelines') as any)
                .select('id')
                .eq('produto', formData.produto)
                .single()

            if (!pipeline) throw new Error('Pipeline não encontrado para este produto')

            // Get first stage (sorted by phase order then stage order)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data: stagesData } = await (supabase.from('pipeline_stages') as any)
                .select('id, ordem, pipeline_phases!pipeline_stages_phase_id_fkey(order_index)')
                .eq('pipeline_id', pipeline.id)
                .eq('ativo', true)

            if (!stagesData || stagesData.length === 0) throw new Error('Nenhuma etapa encontrada')

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            stagesData.sort((a: any, b: any) => {
                const phaseA = a.pipeline_phases?.order_index ?? 999
                const phaseB = b.pipeline_phases?.order_index ?? 999
                if (phaseA !== phaseB) return phaseA - phaseB
                return a.ordem - b.ordem
            })
            const firstStage = stagesData[0]

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data: card, error } = await (supabase.from('cards') as any)
                .insert({
                    titulo: formData.titulo.trim(),
                    produto: formData.produto,
                    is_group_parent: true,
                    group_capacity: formData.group_capacity ? parseInt(formData.group_capacity) : null,
                    data_viagem_inicio: formData.data_viagem_inicio || null,
                    data_viagem_fim: formData.data_viagem_fim || null,
                    origem: formData.origem.trim() || null,
                    pipeline_stage_id: firstStage.id,
                    status_comercial: 'em_andamento',
                    moeda: 'BRL'
                })
                .select('id')
                .single()

            if (error) throw error
            return card
        },
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ['groups-gallery'] })
            queryClient.invalidateQueries({ queryKey: ['cards'] })
            onClose()
            if (onSuccess && data?.id) {
                onSuccess(data.id)
            }
        }
    })

    const handleSubmit = () => {
        const newErrors: typeof errors = {}
        if (!formData.titulo.trim()) {
            newErrors.titulo = 'Título é obrigatório'
        }
        if (Object.keys(newErrors).length > 0) {
            setErrors(newErrors)
            return
        }
        createGroupMutation.mutate()
    }

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-xl">
                        <Users className="w-5 h-5 text-indigo-600" />
                        Novo Grupo
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
                                if (errors.titulo) setErrors({})
                            }}
                            placeholder="Ex: Excursão Disney Dezembro 2026"
                            className={errors.titulo ? 'border-red-300 focus:border-red-500' : ''}
                            autoFocus
                        />
                        {errors.titulo && (
                            <p className="text-red-500 text-xs mt-1">{errors.titulo}</p>
                        )}
                    </div>

                    {/* Produto */}
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">
                            Produto
                        </label>
                        <select
                            value={formData.produto}
                            onChange={(e) => setFormData({ ...formData, produto: e.target.value as Product })}
                            className="w-full h-10 px-3 rounded-md border border-slate-200 bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        >
                            <option value="TRIPS">Viagens</option>
                            <option value="WEDDING">Casamentos</option>
                            <option value="CORP">Corporativo</option>
                        </select>
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
                                onChange={(e) => setFormData({ ...formData, data_viagem_inicio: e.target.value })}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1.5">
                                Data fim
                            </label>
                            <Input
                                type="date"
                                value={formData.data_viagem_fim}
                                onChange={(e) => setFormData({ ...formData, data_viagem_fim: e.target.value })}
                            />
                        </div>
                    </div>

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

                    {createGroupMutation.isError && (
                        <p className="text-red-500 text-sm">
                            Erro ao criar grupo: {(createGroupMutation.error as Error).message}
                        </p>
                    )}
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={onClose} disabled={createGroupMutation.isPending}>
                        Cancelar
                    </Button>
                    <Button
                        onClick={handleSubmit}
                        disabled={createGroupMutation.isPending}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white"
                    >
                        {createGroupMutation.isPending ? (
                            <>
                                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                Criando...
                            </>
                        ) : (
                            'Criar Grupo'
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
