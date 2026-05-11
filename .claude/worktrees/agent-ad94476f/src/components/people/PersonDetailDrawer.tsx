import { useState } from 'react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { Drawer, DrawerContent, DrawerHeader, DrawerBody, DrawerTitle, DrawerClose } from '../ui/drawer'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../ui/tabs'
import { Badge } from '../ui/Badge'
import ContactForm from '../card/ContactForm'
import type { Person } from '../../hooks/usePeopleIntelligence'
import type { Database } from '../../database.types'
import { Loader2, Plane, Crown, Calendar, DollarSign, MapPin, FileText, Trash2, Database as DatabaseIcon, Gift, Clock, Truck, Check, PackageCheck, Package, RefreshCw } from 'lucide-react'
import { formatContactName, getContactInitials } from '../../lib/contactUtils'
import { mergeContactData } from '../../lib/contactMerge'
import { toast } from 'sonner'
import { ContactProposalsWidget } from '../proposals/ContactProposalsWidget'
import ContactDetailsViewer from '../card/ContactDetailsViewer'
import { useDeleteContact } from '../../hooks/useDeleteContact'
import { useMondeImportPerson } from '../../hooks/useMondeSearch'
import { useContactGifts } from '../../hooks/useContactGifts'
import { getGiftItemName } from '../../hooks/useCardGifts'
import { cn } from '../../lib/utils'
import {
    AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
    AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction
} from '../ui/alert-dialog'

type Card = Database['public']['Tables']['cards']['Row']

interface PersonDetailDrawerProps {
    person: Person | null
    card?: Card
    onClose: () => void
    onRefresh?: () => void
}

export default function PersonDetailDrawer({ person, card, onClose, onRefresh }: PersonDetailDrawerProps) {
    const navigate = useNavigate()
    const [activeTab, setActiveTab] = useState('info')
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
    const { softDelete, isDeleting } = useDeleteContact({
        onSuccess: () => { onRefresh?.(); onClose() }
    })
    const mondeImport = useMondeImportPerson()

    // Auto-fetch stats when not provided (e.g. when opened from CardDetail)
    const { data: fetchedStats } = useQuery({
        queryKey: ['contact-stats', person?.id],
        queryFn: async () => {
            const { data } = await supabase
                .from('contact_stats')
                .select('*')
                .eq('contact_id', person!.id)
                .maybeSingle()
            return data
        },
        enabled: !!person?.id && !person?.stats
    })

    const stats = person?.stats || fetchedStats

    // Fetch Trips
    const { data: trips, isLoading: loadingTrips } = useQuery({
        queryKey: ['person-trips', person?.id],
        queryFn: async () => {
            if (!person?.id) return []

            // Fetch cards where user is main contact OR traveler (excluir deletados)
            const { data: mainCards } = await supabase
                .from('cards')
                .select('*')
                .eq('pessoa_principal_id', person.id)
                .is('deleted_at', null)

            const { data: travelerCards } = await supabase
                .from('cards')
                .select('*, cards_contatos!inner(contato_id)')
                .eq('cards_contatos.contato_id', person.id)
                .is('deleted_at', null)

            // Merge and dedup
            const allCards = [...(mainCards || []), ...(travelerCards || [])]
            const uniqueCards = Array.from(new Map(allCards.map(c => [c.id, c])).values())

            // Sort by date desc
            return uniqueCards.sort((a, b) =>
                new Date(b.data_viagem_inicio || 0).getTime() - new Date(a.data_viagem_inicio || 0).getTime()
            ) as Card[]
        },
        enabled: !!person?.id
    })

    const handleSaveContact = async () => {
        // Refresh parent data after save
        if (onRefresh) onRefresh()
        onClose()
    }

    if (!person) return null

    return (
        <Drawer open={!!person} onOpenChange={(open) => !open && onClose()}>
            <DrawerContent className="max-w-2xl">
                <DrawerHeader className="border-b border-gray-100 pb-4">
                    <div className="flex items-start justify-between">
                        <div className="flex items-center gap-4">
                            <div className="h-16 w-16 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 text-2xl font-bold">
                                {getContactInitials(person)}
                            </div>
                            <div>
                                <DrawerTitle className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                                    {formatContactName(person) || 'Sem Nome'}
                                    {stats?.is_group_leader && (
                                        <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-200 border-amber-200">
                                            <Crown className="h-3 w-3 mr-1" />
                                            Líder de Grupo
                                        </Badge>
                                    )}
                                </DrawerTitle>
                                <div className="flex items-center gap-2 mt-1 text-sm text-gray-500">
                                    <span>{person.tipo_pessoa === 'adulto' ? 'Adulto' : 'Não Adulto'}</span>
                                    <span>•</span>
                                    <span>{person.email || 'Sem email'}</span>
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            {person.monde_person_id && (
                                <button
                                    onClick={async () => {
                                        try {
                                            await mondeImport.mutateAsync({
                                                mondePersonId: person.monde_person_id!,
                                                forceUpdate: true,
                                            })
                                            toast.success('Dados atualizados do Monde')
                                            onRefresh?.()
                                        } catch {
                                            // Error handled by mutation
                                        }
                                    }}
                                    disabled={mondeImport.isPending}
                                    className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                                    title="Atualizar dados do Monde"
                                >
                                    {mondeImport.isPending ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                        <RefreshCw className="h-4 w-4" />
                                    )}
                                </button>
                            )}
                            <button
                                onClick={() => setShowDeleteConfirm(true)}
                                className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                title="Excluir contato"
                            >
                                <Trash2 className="h-4 w-4" />
                            </button>
                            <DrawerClose onClick={onClose} />
                        </div>
                    </div>

                    {/* Quick Stats */}
                    <div className="grid grid-cols-3 gap-4 mt-6">
                        <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                            <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
                                <DollarSign className="h-3 w-3" />
                                Valor Total
                            </div>
                            <div className="text-lg font-semibold text-gray-900">
                                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(stats?.total_spend || 0)}
                            </div>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                            <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
                                <Plane className="h-3 w-3" />
                                Viagens
                            </div>
                            <div className="text-lg font-semibold text-gray-900">
                                {stats?.total_trips || 0}
                            </div>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                            <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
                                <Calendar className="h-3 w-3" />
                                Última Viagem
                            </div>
                            <div className="text-sm font-medium text-gray-900 truncate">
                                {stats?.last_trip_date
                                    ? format(new Date(stats.last_trip_date!), "MMM yyyy", { locale: ptBR })
                                    : 'Nunca'}
                            </div>
                        </div>
                    </div>
                </DrawerHeader>

                <DrawerBody>
                    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                        <TabsList className="w-full justify-start mb-6 bg-gray-100/50 p-1">
                            <TabsTrigger value="info" className="flex-1">Informações</TabsTrigger>
                            <TabsTrigger value="proposals" className="flex-1">
                                <FileText className="h-3.5 w-3.5 mr-1" />
                                Propostas
                            </TabsTrigger>
                            <TabsTrigger value="trips" className="flex-1">Viagens</TabsTrigger>
                            <TabsTrigger value="gifts" className="flex-1">
                                <Gift className="h-3.5 w-3.5 mr-1" />
                                Presentes
                            </TabsTrigger>
                            {card && (
                                <TabsTrigger value="integration" className="flex-1">
                                    <DatabaseIcon className="h-3.5 w-3.5 mr-1" />
                                    Integração
                                </TabsTrigger>
                            )}
                        </TabsList>

                        <TabsContent value="info" className="mt-0">
                            <ContactForm
                                key={person.id}
                                contact={person}
                                onSave={handleSaveContact}
                                onCancel={onClose}
                                onSelectExisting={async (contactId, mergeData) => {
                                    if (mergeData && Object.keys(mergeData).length > 0) {
                                        try {
                                            await mergeContactData(contactId, mergeData)
                                            toast.success('Dados mesclados ao contato existente')
                                        } catch (err) {
                                            console.error('Error merging contact data:', err)
                                            toast.error('Erro ao mesclar dados')
                                        }
                                    }
                                    onRefresh?.()
                                    onClose()
                                }}
                            />
                        </TabsContent>

                        <TabsContent value="proposals" className="mt-0">
                            <ContactProposalsWidget contactId={person.id} />
                        </TabsContent>

                        <TabsContent value="trips" className="mt-0 space-y-4">
                            {loadingTrips ? (
                                <div className="flex justify-center py-8">
                                    <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
                                </div>
                            ) : trips?.length === 0 ? (
                                <div className="text-center py-12 text-gray-400 bg-gray-50 rounded-lg border border-dashed border-gray-200">
                                    <Plane className="h-8 w-8 mx-auto mb-2 opacity-50" />
                                    <p>Nenhuma viagem encontrada</p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {trips?.map((trip) => (
                                        <div
                                            key={trip.id}
                                            onClick={() => { onClose(); navigate(`/cards/${trip.id}`) }}
                                            className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md hover:border-indigo-300 transition-all cursor-pointer"
                                        >
                                            <div className="flex justify-between items-start mb-2">
                                                <h4 className="font-semibold text-gray-900">{trip.titulo}</h4>
                                                <Badge variant={trip.status_comercial === 'ganho' ? 'default' : 'secondary'}>
                                                    {trip.status_comercial || 'Em Aberto'}
                                                </Badge>
                                            </div>

                                            <div className="grid grid-cols-2 gap-y-2 text-sm text-gray-600">
                                                <div className="flex items-center gap-2">
                                                    <Calendar className="h-3.5 w-3.5 text-gray-400" />
                                                    {trip.data_viagem_inicio ? format(new Date(trip.data_viagem_inicio), "dd/MM/yyyy") : 'Data indefinida'}
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <DollarSign className="h-3.5 w-3.5 text-gray-400" />
                                                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(trip.valor_final || trip.valor_estimado || 0)}
                                                </div>
                                                {trip.produto_data && typeof trip.produto_data === 'object' && 'destinos' in trip.produto_data && (
                                                    <div className="col-span-2 flex items-center gap-2 mt-1">
                                                        <MapPin className="h-3.5 w-3.5 text-gray-400" />
                                                        <span className="truncate">
                                                            {Array.isArray((trip.produto_data as Record<string, unknown>).destinos)
                                                                ? ((trip.produto_data as Record<string, unknown>).destinos as string[]).join(', ')
                                                                : 'Destino não informado'}
                                                        </span>
                                                    </div>
                                                )}
                                            </div>

                                            {trip.is_group_parent && (
                                                <div className="mt-3 pt-3 border-t border-gray-100 flex items-center gap-2 text-xs text-amber-600 font-medium">
                                                    <Crown className="h-3 w-3" />
                                                    Viagem Mãe (Grupo)
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </TabsContent>

                        <TabsContent value="gifts" className="mt-0">
                            <ContactGiftsTab personId={person.id} onNavigate={(cardId) => { onClose(); navigate(`/cards/${cardId}`) }} />
                        </TabsContent>

                        {card && (
                            <TabsContent value="integration" className="mt-0">
                                <ContactDetailsViewer contact={person as unknown as Database['public']['Tables']['contatos']['Row']} card={card} />
                            </TabsContent>
                        )}
                    </Tabs>
                </DrawerBody>
            </DrawerContent>

            <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Excluir contato?</AlertDialogTitle>
                        <AlertDialogDescription>
                            O contato &quot;{person.nome}{person.sobrenome ? ` ${person.sobrenome}` : ''}&quot; será movido para a lixeira.
                            Você poderá restaurá-lo depois.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => softDelete(person.id)}
                            className="bg-red-600 hover:bg-red-700 text-white"
                            disabled={isDeleting}
                        >
                            {isDeleting ? 'Excluindo...' : 'Excluir'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </Drawer >
    )
}

const GIFT_STATUS_CONFIG: Record<string, { icon: typeof Clock; label: string; color: string }> = {
    pendente: { icon: Clock, label: 'Pendente', color: 'bg-slate-100 text-slate-600' },
    preparando: { icon: PackageCheck, label: 'Preparando', color: 'bg-amber-100 text-amber-700' },
    enviado: { icon: Truck, label: 'Enviado', color: 'bg-blue-100 text-blue-700' },
    entregue: { icon: Check, label: 'Entregue', color: 'bg-emerald-100 text-emerald-700' },
    cancelado: { icon: Clock, label: 'Cancelado', color: 'bg-red-100 text-red-700' },
}

function ContactGiftsTab({ personId, onNavigate }: { personId: string; onNavigate: (cardId: string) => void }) {
    const { gifts, isLoading } = useContactGifts(personId)

    if (isLoading) {
        return (
            <div className="flex justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
            </div>
        )
    }

    if (gifts.length === 0) {
        return (
            <div className="text-center py-12 text-gray-400 bg-gray-50 rounded-lg border border-dashed border-gray-200">
                <Gift className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>Nenhum presente registrado</p>
            </div>
        )
    }

    const formatBRL = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)

    return (
        <div className="space-y-3">
            {gifts.map(gift => {
                const status = GIFT_STATUS_CONFIG[gift.status] || GIFT_STATUS_CONFIG.pendente
                const StatusIcon = status.icon
                const totalCost = gift.items?.reduce((s, i) => s + i.quantity * i.unit_price_snapshot, 0) ?? 0
                const hasCard = !!gift.card
                const tripTitle = gift.card?.titulo || 'Presente histórico'

                return (
                    <div
                        key={gift.id}
                        onClick={() => hasCard && onNavigate(gift.card!.id)}
                        className={cn(
                            "bg-white border border-gray-200 rounded-lg p-4 transition-all",
                            hasCard && "hover:shadow-md hover:border-pink-300 cursor-pointer"
                        )}
                    >
                        <div className="flex justify-between items-start mb-3">
                            <div>
                                <h4 className="font-semibold text-gray-900 text-sm">{tripTitle}</h4>
                                {gift.card?.data_viagem_inicio && (
                                    <p className="text-xs text-gray-400 mt-0.5">
                                        <Calendar className="h-3 w-3 inline mr-1" />
                                        {format(new Date(gift.card.data_viagem_inicio), "dd/MM/yyyy")}
                                    </p>
                                )}
                            </div>
                            <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium', status.color)}>
                                <StatusIcon className="h-3 w-3" />
                                {status.label}
                            </span>
                        </div>

                        {/* Items */}
                        {gift.items?.length > 0 && (
                            <div className="space-y-1 mb-3">
                                {gift.items.map(item => (
                                    <div key={item.id} className="flex items-center gap-2 text-xs text-gray-600">
                                        <Package className="h-3 w-3 text-gray-400 flex-shrink-0" />
                                        <span className="flex-1 truncate">{getGiftItemName(item)}</span>
                                        <span className="text-gray-400">{item.quantity}x</span>
                                        <span className="font-medium">{formatBRL(item.unit_price_snapshot * item.quantity)}</span>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Footer */}
                        <div className="flex items-center justify-between pt-2 border-t border-gray-100 text-xs">
                            <div className="flex items-center gap-3 text-gray-400">
                                {gift.scheduled_ship_date && (
                                    <span>
                                        <Truck className="h-3 w-3 inline mr-1" />
                                        Envio: {format(new Date(gift.scheduled_ship_date + 'T12:00:00'), "dd/MM/yyyy")}
                                    </span>
                                )}
                                {gift.shipped_at && (
                                    <span>Enviado: {format(new Date(gift.shipped_at), "dd/MM HH:mm")}</span>
                                )}
                                {gift.delivered_at && (
                                    <span>Entregue: {format(new Date(gift.delivered_at), "dd/MM HH:mm")}</span>
                                )}
                            </div>
                            <span className="font-semibold text-gray-700">{formatBRL(totalCost)}</span>
                        </div>
                    </div>
                )
            })}
        </div>
    )
}
