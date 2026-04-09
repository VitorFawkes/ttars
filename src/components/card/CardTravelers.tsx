import { useState } from 'react'
import { Users, Loader2, Edit2, Trash2, AlertTriangle } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog'
import { Button } from '../ui/Button'
import PersonDetailDrawer from '../people/PersonDetailDrawer'
import type { Database } from '../../database.types'

type Contato = Database['public']['Tables']['contatos']['Row']
import { supabase } from '../../lib/supabase'
import { calculateAge, formatContactName, getContactInitials } from '../../lib/contactUtils'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

interface CardTravelersProps {
    card: {
        id: string
        produto_data: Record<string, unknown> | null
    }
    embedded?: boolean
    onTravelerClick?: (contact: Contato) => void
}

function TravelerRow({
    contact,
    tipo_viajante,
    onEdit,
    onDelete
}: {
    contact: Contato
    tipo_viajante: string
    onEdit: (contact: Contato) => void
    onDelete: () => void
}) {
    return (
        <div className="border border-transparent hover:border-gray-100 rounded-md transition-all">
            <div className="group flex items-start gap-3 p-2 rounded-md hover:bg-gray-50 transition-colors">
                <div className="h-8 w-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-medium shrink-0">
                    {getContactInitials(contact)}
                </div>
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-gray-900 truncate">{formatContactName(contact) || 'Sem nome'}</p>
                        {tipo_viajante === 'titular' && (
                            <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 text-[10px] rounded-full font-medium">
                                Titular
                            </span>
                        )}
                        {!contact.telefone && (
                            <span
                                className="flex items-center gap-0.5 px-1.5 py-0.5 bg-amber-50 text-amber-600 text-[10px] rounded-full font-medium"
                                title="Telefone pendente — preencha no cadastro do contato"
                            >
                                <AlertTriangle className="h-3 w-3" />
                                Sem telefone
                            </span>
                        )}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-500 mt-0.5">
                        <span>{contact.tipo_pessoa === 'adulto' ? 'Adulto' : 'Criança'}</span>
                        {contact.data_nascimento && (
                            <span>• {calculateAge(contact.data_nascimento)} anos</span>
                        )}
                    </div>
                </div>

                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-2">
                    <button
                        onClick={() => onEdit(contact)}
                        className="p-1 text-gray-400 hover:text-indigo-600 rounded hover:bg-gray-100"
                        title="Editar"
                    >
                        <Edit2 className="h-3.5 w-3.5" />
                    </button>
                    <button
                        onClick={() => onDelete()}
                        className="p-1 text-gray-400 hover:text-red-600 rounded hover:bg-gray-100"
                        title="Remover"
                    >
                        <Trash2 className="h-3.5 w-3.5" />
                    </button>
                </div>
            </div>
        </div>
    )
}

export default function CardTravelers({ card, embedded = false }: CardTravelersProps) {
    const queryClient = useQueryClient()

    const { data: contacts, isLoading } = useQuery({
        queryKey: ['card-contacts', card.id],
        queryFn: async () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- supabase query builder
            const { data, error } = await (supabase.from('cards_contatos') as any)
                .select(`
                    id,
                    tipo_viajante,
                    contato:contatos (*)
                `)
                .eq('card_id', card.id)
                .order('ordem')

            if (error) throw error
            return data as { id: string, tipo_viajante: string, contato: Contato }[]
        },
        enabled: !!card.id
    })

    const [travelerToDelete, setTravelerToDelete] = useState<string | null>(null)
    const [contactToView, setContactToView] = useState<Contato | null>(null)

    const deleteMutation = useMutation({
        mutationFn: async (id: string) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- supabase query builder
            const { error } = await (supabase.from('cards_contatos') as any)
                .delete()
                .eq('id', id)
            if (error) throw error
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['card-contacts', card.id] })
            queryClient.invalidateQueries({ queryKey: ['card-travelers-summary', card.id] })
            setTravelerToDelete(null)
        }
    })

    const handleDelete = (id: string) => {
        setTravelerToDelete(id)
    }

    if (isLoading) {
        return (
            <div className="flex items-center justify-center p-4">
                <Loader2 className="h-5 w-5 animate-spin text-indigo-600" />
            </div>
        )
    }

    // Filter out contacts where the join failed or data is missing
    const validContacts = contacts?.filter(c => c.contato) || []

    // If we have detailed contacts, show them
    if (validContacts.length > 0) {
        const adults = validContacts.filter(c => c.contato.tipo_pessoa === 'adulto' || !c.contato.tipo_pessoa)
        const children = validContacts.filter(c => c.contato.tipo_pessoa === 'crianca')

        const content = (
            <div className="space-y-1">
                {validContacts.map(({ id, tipo_viajante, contato }) => (
                    <TravelerRow
                        key={id}
                        contact={contato}
                        tipo_viajante={tipo_viajante}
                        onEdit={(c) => setContactToView(c)}
                        onDelete={() => handleDelete(id)}
                    />
                ))}

                {!embedded && (
                    <div className="mt-3 pt-3 border-t grid grid-cols-2 gap-4">
                        <div>
                            <span className="text-xs text-gray-500 block">Adultos</span>
                            <span className="text-sm font-semibold text-gray-900">{adults.length}</span>
                        </div>
                        <div>
                            <span className="text-xs text-gray-500 block">Crianças</span>
                            <span className="text-sm font-semibold text-gray-900">{children.length}</span>
                        </div>
                    </div>
                )}

                {/* Delete Confirmation Dialog */}
                <Dialog open={!!travelerToDelete} onOpenChange={(open) => !open && setTravelerToDelete(null)}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Remover Viajante</DialogTitle>
                        </DialogHeader>
                        <p className="text-sm text-gray-600">
                            Tem certeza que deseja remover este viajante? Essa ação não pode ser desfeita.
                        </p>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setTravelerToDelete(null)}>
                                Cancelar
                            </Button>
                            <Button
                                variant="destructive"
                                onClick={() => travelerToDelete && deleteMutation.mutate(travelerToDelete)}
                                disabled={deleteMutation.isPending}
                            >
                                {deleteMutation.isPending ? 'Removendo...' : 'Remover'}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                {/* Person Detail Drawer */}
                <PersonDetailDrawer
                    person={contactToView}
                    onClose={() => setContactToView(null)}
                    onRefresh={() => {
                        queryClient.invalidateQueries({ queryKey: ['card-contacts', card.id] })
                    }}
                />
            </div>
        )

        if (embedded) return content

        return (
            <div className="rounded-lg border bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                        <Users className="h-5 w-5 text-indigo-600" />
                        <h3 className="text-sm font-semibold text-gray-900">Viajantes ({validContacts.length})</h3>
                    </div>
                </div>
                {content}
            </div>
        )
    }

    return null
}
