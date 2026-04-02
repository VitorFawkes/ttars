import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Plus, User, X, Users } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import ContactSelector from '@/components/card/ContactSelector'
import { formatContactName } from '@/lib/contactUtils'

interface CreateChildCardModalProps {
    isOpen: boolean
    onClose: () => void
    parentCardId: string
    parentProduct: string
    parentTitle: string
}

export default function CreateChildCardModal({ isOpen, onClose, parentCardId, parentProduct, parentTitle }: CreateChildCardModalProps) {
    const queryClient = useQueryClient()
    const [showContactSelector, setShowContactSelector] = useState(false)
    const [formData, setFormData] = useState({
        titulo: '',
        valor_estimado: '',
        pessoa_principal_id: null as string | null,
        pessoa_principal_nome: null as string | null
    })

    const createCardMutation = useMutation({
        mutationFn: async () => {
            // Get the first stage for the parent's product pipeline
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- supabase query builder
            const { data: pipeline } = await (supabase.from('pipelines') as any)
                .select('id')
                .eq('produto', parentProduct)
                .single()

            if (!pipeline) throw new Error('Pipeline not found')

            // Get first stage (sorted by phase order then stage order)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- supabase query builder
            const { data: stagesData } = await (supabase.from('pipeline_stages') as any)
                .select('id, ordem, pipeline_phases!pipeline_stages_phase_id_fkey(order_index)')
                .eq('pipeline_id', pipeline.id)
                .eq('ativo', true)

            if (!stagesData || stagesData.length === 0) throw new Error('No stages found')

            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- supabase query builder
            stagesData.sort((a: any, b: any) => {
                const phaseA = a.pipeline_phases?.order_index ?? 999
                const phaseB = b.pipeline_phases?.order_index ?? 999
                if (phaseA !== phaseB) return phaseA - phaseB
                return a.ordem - b.ordem
            })
            const firstStage = stagesData[0]

            // Create the card linked to the parent
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- supabase query builder
            const { data: card, error } = await (supabase.from('cards') as any)
                .insert({
                    titulo: formData.titulo,
                    produto: parentProduct,
                    valor_estimado: parseFloat(formData.valor_estimado) || 0,
                    pessoa_principal_id: formData.pessoa_principal_id,
                    pipeline_stage_id: firstStage.id,
                    status_comercial: 'aberto',
                    moeda: 'BRL',
                    parent_card_id: parentCardId // THE KEY LINK
                })
                .select()
                .single()

            if (error) throw error

            return card
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['cards'] })
            onClose()
            setFormData({
                titulo: '',
                valor_estimado: '',
                pessoa_principal_id: null,
                pessoa_principal_nome: null
            })
        }
    })

    const handleSave = () => {
        if (!formData.titulo || !formData.pessoa_principal_id) return
        createCardMutation.mutate()
    }

    // Auto-generate title when contact is selected if title is empty
    const handleContactSelect = (contactId: string, contactName: string) => {
        setFormData(prev => ({
            ...prev,
            pessoa_principal_id: contactId,
            pessoa_principal_nome: contactName,
            titulo: prev.titulo || `${contactName} - ${parentTitle}` // Smart default
        }))
        setShowContactSelector(false)
    }

    return (
        <>
            <Dialog open={isOpen} onOpenChange={onClose}>
                <DialogContent className="sm:max-w-[500px] bg-white/90 backdrop-blur-xl border-white/20">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-xl">
                            <Users className="w-5 h-5 text-purple-500" />
                            Novo Viajante (Sub-Deal)
                        </DialogTitle>
                    </DialogHeader>

                    <div className="space-y-4 py-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Contato Principal <span className="text-red-500">*</span>
                            </label>

                            {formData.pessoa_principal_id ? (
                                <div className="flex items-center justify-between p-3 border rounded-md bg-gray-50">
                                    <div className="flex items-center gap-3">
                                        <div className="h-8 w-8 rounded-full bg-purple-100 flex items-center justify-center text-purple-700">
                                            <User className="h-4 w-4" />
                                        </div>
                                        <div>
                                            <p className="text-sm font-medium text-gray-900">{formData.pessoa_principal_nome}</p>
                                            <p className="text-xs text-gray-500">Selecionado</p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => setFormData({ ...formData, pessoa_principal_id: null, pessoa_principal_nome: null })}
                                        className="text-gray-400 hover:text-red-500 p-1"
                                    >
                                        <X className="h-4 w-4" />
                                    </button>
                                </div>
                            ) : (
                                <button
                                    onClick={() => setShowContactSelector(true)}
                                    className="w-full flex items-center justify-center gap-2 p-3 border-2 border-dashed border-gray-300 rounded-md text-gray-500 hover:border-purple-500 hover:text-purple-600 transition-colors"
                                >
                                    <Plus className="h-4 w-4" />
                                    Selecionar Contato
                                </button>
                            )}
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Título do Card <span className="text-red-500">*</span>
                            </label>
                            <Input
                                type="text"
                                value={formData.titulo}
                                onChange={(e) => setFormData({ ...formData, titulo: e.target.value })}
                                placeholder="Ex: João Silva - Disney 2025"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Valor Estimado</label>
                            <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">R$</span>
                                <Input
                                    type="number"
                                    value={formData.valor_estimado}
                                    onChange={(e) => setFormData({ ...formData, valor_estimado: e.target.value })}
                                    className="pl-9"
                                    placeholder="0,00"
                                />
                            </div>
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={onClose}>
                            Cancelar
                        </Button>
                        <Button
                            onClick={handleSave}
                            disabled={!formData.titulo || !formData.pessoa_principal_id || createCardMutation.isPending}
                            className="bg-purple-600 hover:bg-purple-700 text-white"
                        >
                            {createCardMutation.isPending ? 'Criando...' : 'Criar Viajante'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {showContactSelector && (
                <ContactSelector
                    cardId="" // Not needed for selection only
                    onClose={() => setShowContactSelector(false)}
                    onContactAdded={(contactId, contact) => {
                        if (contactId) {
                            // If contact object is passed directly
                            if (contact) {
                                handleContactSelect(contactId, contact.nome || 'Sem Nome')
                            } else {
                                // Fallback fetch
                                supabase.from('contatos').select('nome, sobrenome').eq('id', contactId).single().then(({ data }) => {
                                    if (data) handleContactSelect(contactId, formatContactName(data) || 'Sem Nome')
                                })
                            }
                        }
                    }}
                />
            )}
        </>
    )
}
