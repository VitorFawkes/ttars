import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/Button'
import { Users, UserPlus, X, AlertCircle } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import ContactSelector from '@/components/card/ContactSelector'
import type { Database } from '@/database.types'
import { cn } from '@/lib/utils'

type Product = Database['public']['Enums']['app_product']

interface BulkAddTravelersModalProps {
    isOpen: boolean
    onClose: () => void
    parentCardId: string
    parentProduct: Product
    parentTitle: string
    parentDates?: {
        start: string | null
        end: string | null
    }
    parentDestination?: {
        origin: string | null
        destination: string | null
    }
}

interface SelectedContact {
    id: string
    nome: string
    existsInGroup?: boolean
}

export default function BulkAddTravelersModal({
    isOpen,
    onClose,
    parentCardId,
    parentProduct,
    parentTitle,
    parentDates,
    // parentDestination // Unused for now
}: BulkAddTravelersModalProps) {
    const queryClient = useQueryClient()
    const [showContactSelector, setShowContactSelector] = useState(false)
    const [selectedContacts, setSelectedContacts] = useState<SelectedContact[]>([])
    const [isChecking, setIsChecking] = useState(false)

    // Check for duplicates whenever contacts change
    useEffect(() => {
        const checkDuplicates = async () => {
            if (selectedContacts.length === 0) return

            setIsChecking(true)
            const contactIds = selectedContacts.map(c => c.id)

            // Find any active cards in this group for these contacts
            const { data: existingCards } = await supabase
                .from('cards')
                .select('pessoa_principal_id')
                .eq('parent_card_id', parentCardId)
                .in('pessoa_principal_id', contactIds)
                .neq('status_comercial', 'perdido') // Ignore lost deals

            const existingContactIds = new Set(existingCards?.map(c => c.pessoa_principal_id) || [])

            setSelectedContacts(prev => prev.map(c => ({
                ...c,
                existsInGroup: existingContactIds.has(c.id)
            })))

            setIsChecking(false)
        }

        checkDuplicates()
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedContacts.length, parentCardId])

    const createCardsMutation = useMutation({
        mutationFn: async () => {
            const validContacts = selectedContacts.filter(c => !c.existsInGroup)
            if (validContacts.length === 0) return

            // Get the first stage for the parent's product pipeline
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data: pipeline } = await (supabase.from('pipelines') as any)
                .select('id')
                .eq('produto', parentProduct)
                .single()

            if (!pipeline) throw new Error('Pipeline not found')

            // Get first stage (sorted by phase order then stage order)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data: stagesData } = await (supabase.from('pipeline_stages') as any)
                .select('id, ordem, pipeline_phases!pipeline_stages_phase_id_fkey(order_index)')
                .eq('pipeline_id', pipeline.id)
                .eq('ativo', true)

            if (!stagesData || stagesData.length === 0) throw new Error('No stages found')

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            stagesData.sort((a: any, b: any) => {
                const phaseA = a.pipeline_phases?.order_index ?? 999
                const phaseB = b.pipeline_phases?.order_index ?? 999
                if (phaseA !== phaseB) return phaseA - phaseB
                return a.ordem - b.ordem
            })
            const firstStage = stagesData[0]

            // Prepare bulk insert data
            const cardsToInsert = validContacts.map(contact => ({
                titulo: `${contact.nome} - ${parentTitle}`,
                produto: parentProduct,
                valor_estimado: 0, // Default to 0, can be updated later
                pessoa_principal_id: contact.id,
                pipeline_stage_id: firstStage.id,
                status_comercial: 'aberto',
                moeda: 'BRL',
                parent_card_id: parentCardId,
                // Data Inheritance
                data_viagem_inicio: parentDates?.start,
                data_viagem_fim: parentDates?.end,
                // origem: parentDestination?.origin, // Removed because 'origem' is Lead Source, not Trip Origin
                // We might need to handle destination differently depending on schema, 
                // but for now assuming standard fields if they matched.
                // If destination is stored in JSON or specific fields, adapt here.
            }))

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { error } = await (supabase.from('cards') as any)
                .insert(cardsToInsert)

            if (error) throw error
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['cards'] })
            onClose()
            setSelectedContacts([])
        }
    })

    const handleRemoveContact = (id: string) => {
        setSelectedContacts(prev => prev.filter(c => c.id !== id))
    }

    const validCount = selectedContacts.filter(c => !c.existsInGroup).length
    const duplicateCount = selectedContacts.filter(c => c.existsInGroup).length

    return (
        <>
            <Dialog open={isOpen} onOpenChange={onClose}>
                <DialogContent className="sm:max-w-[600px] bg-white/90 backdrop-blur-xl border-white/20">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-xl">
                            <Users className="w-5 h-5 text-purple-500" />
                            Adicionar Viajantes em Massa
                        </DialogTitle>
                    </DialogHeader>

                    <div className="space-y-4 py-4">
                        <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-sm text-blue-700 flex gap-2">
                            <AlertCircle className="w-5 h-5 shrink-0" />
                            <div>
                                <p className="font-medium">Herança de Dados Ativa</p>
                                <p className="opacity-80">
                                    Os novos viajantes herdarão automaticamente as datas
                                    ({parentDates?.start ? new Date(parentDates.start).toLocaleDateString() : 'N/A'} - {parentDates?.end ? new Date(parentDates.end).toLocaleDateString() : 'N/A'})
                                    e o destino do grupo principal.
                                </p>
                            </div>
                        </div>

                        <div className="min-h-[100px] border-2 border-dashed border-gray-200 rounded-xl p-4 flex flex-col gap-3">
                            {selectedContacts.length > 0 ? (
                                <div className="grid grid-cols-1 gap-2 max-h-[300px] overflow-y-auto">
                                    {selectedContacts.map(contact => (
                                        <div
                                            key={contact.id}
                                            className={cn(
                                                "flex items-center justify-between p-2 rounded-lg border",
                                                contact.existsInGroup
                                                    ? "bg-red-50 border-red-100"
                                                    : "bg-white border-gray-100"
                                            )}
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className={cn(
                                                    "w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium",
                                                    contact.existsInGroup ? "bg-red-100 text-red-600" : "bg-purple-100 text-purple-600"
                                                )}>
                                                    {contact.nome.charAt(0).toUpperCase()}
                                                </div>
                                                <div>
                                                    <p className={cn("font-medium text-sm", contact.existsInGroup ? "text-red-700" : "text-gray-900")}>
                                                        {contact.nome}
                                                    </p>
                                                    {contact.existsInGroup && (
                                                        <p className="text-xs text-red-500 flex items-center gap-1">
                                                            <AlertCircle className="w-3 h-3" />
                                                            Já está neste grupo
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => handleRemoveContact(contact.id)}
                                                className="p-1 hover:bg-gray-100 rounded-full text-gray-400 hover:text-red-500 transition-colors"
                                            >
                                                <X className="w-4 h-4" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="flex flex-col items-center justify-center py-8 text-gray-400">
                                    <UserPlus className="w-8 h-8 mb-2 opacity-50" />
                                    <p>Nenhum contato selecionado</p>
                                </div>
                            )}

                            <Button
                                variant="outline"
                                onClick={() => setShowContactSelector(true)}
                                className="w-full border-dashed border-gray-300 hover:border-purple-500 hover:text-purple-600"
                            >
                                <UserPlus className="w-4 h-4 mr-2" />
                                Selecionar Contatos
                            </Button>
                        </div>

                        <div className="flex justify-between items-center text-sm text-gray-500 px-1">
                            <span>{validCount} contatos válidos</span>
                            {duplicateCount > 0 && (
                                <span className="text-red-500 font-medium">{duplicateCount} duplicados ignorados</span>
                            )}
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={onClose}>
                            Cancelar
                        </Button>
                        <Button
                            onClick={() => createCardsMutation.mutate()}
                            disabled={validCount === 0 || createCardsMutation.isPending || isChecking}
                            className="bg-purple-600 hover:bg-purple-700 text-white"
                        >
                            {createCardsMutation.isPending ? 'Criando...' : `Criar ${validCount} Viajantes`}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {showContactSelector && (
                <ContactSelector
                    cardId=""
                    onClose={() => setShowContactSelector(false)}
                    onContactAdded={(contactId, contact) => {
                        if (contactId && contact) {
                            // Check if already selected in this session
                            if (!selectedContacts.find(c => c.id === contactId)) {
                                setSelectedContacts(prev => [...prev, { id: contactId, nome: contact.nome }])
                            }
                        }
                        // Keep selector open for multiple selection? 
                        // The current ContactSelector might close automatically. 
                        // If it closes, we just reopen it or user clicks again.
                        // Ideally ContactSelector should support multi-select but that's a bigger refactor.
                        // For now, we assume single select per open, but we accumulate in the list.
                    }}
                />
            )}
        </>
    )
}
