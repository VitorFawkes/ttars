import { useState, useMemo } from 'react'
import {
    X,
    ChevronLeft,
    ChevronRight,
    Check,
    Loader2,
    Building2,
    Calendar,
    Package,
    CheckCircle2,
    Code,
    Eye,
    AlertTriangle
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { cn } from '@/lib/utils'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useProposal } from '@/hooks/useProposal'
import { useCreateMondeSale, useSentProposalItems } from '@/hooks/useMondeSales'

interface MondeCreateSaleModalProps {
    cardId: string
    proposalId?: string | null
    onClose: () => void
}

interface SelectableItem {
    id: string
    type: 'proposal_item' | 'proposal_flight' | 'card_financial_item'
    itemType: string
    title: string
    description?: string
    supplier: string | null
    price: number
    isSold: boolean
    soldInfo?: { saleDate: string; mondeSaleId: string }
}

type Step = 'select' | 'info' | 'confirm'

export default function MondeCreateSaleModal({
    cardId,
    proposalId,
    onClose
}: MondeCreateSaleModalProps) {
    const [step, setStep] = useState<Step>('select')
    const [selectedItems, setSelectedItems] = useState<Record<string, { selected: boolean; supplier: string }>>({})
    const [saleDateManual, setSaleDateManual] = useState<string | null>(null)

    const hasProposal = !!proposalId
    const { data: proposal, isLoading: isLoadingProposal } = useProposal(proposalId || '')
    const { data: sentItems, isLoading: isLoadingSent } = useSentProposalItems(cardId)
    const { mutate: createSale, isPending: isCreating } = useCreateMondeSale()

    // Fetch card data: dates + owner/contato for payload preview
    const { data: cardData } = useQuery({
        queryKey: ['card-monde-data', cardId],
        queryFn: async () => {
            const { data } = await supabase
                .from('cards')
                .select(`
                    data_fechamento, data_viagem_inicio, data_viagem_fim, ganho_planner_at, receita, valor_final,
                    contato:contatos!cards_pessoa_principal_id_fkey(id, nome, sobrenome, email, telefone, cpf),
                    owner:profiles!cards_vendas_owner_id_profiles_fkey(id, nome),
                    dono:profiles!cards_dono_atual_id_profiles_fkey(id, nome)
                `)
                .eq('id', cardId)
                .single()
            return data
        },
    })

    // Fetch CNPJ for payload preview
    const { data: mondeCnpj } = useQuery({
        queryKey: ['monde-cnpj'],
        queryFn: async () => {
            const { data } = await supabase
                .from('integration_settings')
                .select('value')
                .eq('key', 'MONDE_CNPJ')
                .single()
            return data?.value || null
        },
    })

    // Fetch card_financial_items when no proposal
    const { data: cardFinancialItems, isLoading: isLoadingFinancial } = useQuery({
        queryKey: ['card-financial-items', cardId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('card_financial_items')
                .select('*')
                .eq('card_id', cardId)
            if (error) return []
            return data || []
        },
        enabled: !hasProposal,
    })

    const isLoading = (hasProposal ? isLoadingProposal || isLoadingSent : isLoadingFinancial)

    // Derived sale_date: manual override > ganho_planner_at > data_fechamento > today
    const saleDate = useMemo(() => {
        if (saleDateManual !== null) return saleDateManual
        if (cardData) {
            const d = cardData.ganho_planner_at || cardData.data_fechamento || ''
            return d ? d.split('T')[0] : new Date().toISOString().split('T')[0]
        }
        return new Date().toISOString().split('T')[0]
    }, [saleDateManual, cardData])

    // Build selectable items from proposal OR card_financial_items
    const selectableItems = useMemo(() => {
        // Path A: From proposal
        if (hasProposal && proposal?.active_version) {
            const items: SelectableItem[] = []
            const sentItemIds = new Set(sentItems?.itemIds || [])
            const sentFlightIds = new Set(sentItems?.flightIds || [])

            const sections = proposal.active_version.sections || []
            for (const section of sections) {
                for (const item of section.items || []) {
                    const isSold = sentItemIds.has(item.id)
                    const soldDetail = sentItems?.details?.find(d => d.proposal_item_id === item.id)

                    items.push({
                        id: item.id,
                        type: 'proposal_item',
                        itemType: item.item_type,
                        title: item.title,
                        description: item.description || undefined,
                        supplier: item.supplier || (item.rich_content as Record<string, string>)?.supplier || null,
                        price: item.base_price || 0,
                        isSold,
                        soldInfo: soldDetail && soldDetail.sale_date ? {
                            saleDate: soldDetail.sale_date,
                            mondeSaleId: soldDetail.monde_sale_id || ''
                        } : undefined
                    })
                }
            }

            const flights = proposal.active_version.flights || []
            for (const flight of flights) {
                if (!flight.is_selected) continue
                const isSold = sentFlightIds.has(flight.id)
                const soldDetail = sentItems?.details?.find(d => d.proposal_flight_id === flight.id)

                items.push({
                    id: flight.id,
                    type: 'proposal_flight',
                    itemType: 'flight',
                    title: `${flight.origin_city || flight.origin_airport} → ${flight.destination_city || flight.destination_airport}`,
                    description: flight.flight_number
                        ? `Voo ${flight.flight_number} - ${flight.airline_name || 'N/A'}`
                        : flight.airline_name || undefined,
                    supplier: flight.airline_name || null,
                    price: flight.price_total || flight.price_per_person || 0,
                    isSold,
                    soldInfo: soldDetail && soldDetail.sale_date ? {
                        saleDate: soldDetail.sale_date,
                        mondeSaleId: soldDetail.monde_sale_id || ''
                    } : undefined
                })
            }

            return items
        }

        // Path B: From card_financial_items (no proposal)
        if (!hasProposal && cardFinancialItems) {
            return cardFinancialItems.map((fi): SelectableItem => ({
                id: fi.id,
                type: 'card_financial_item',
                itemType: fi.product_type || 'custom',
                title: fi.description || 'Item financeiro',
                description: undefined,
                supplier: null,
                price: fi.sale_value || 0,
                isSold: false,
            }))
        }

        return []
    }, [hasProposal, proposal, sentItems, cardFinancialItems])

    // Group items by type
    const groupedItems = useMemo(() => {
        const groups: Record<string, SelectableItem[]> = {}
        for (const item of selectableItems) {
            const type = item.itemType
            if (!groups[type]) groups[type] = []
            groups[type].push(item)
        }
        return groups
    }, [selectableItems])

    // Calculate totals
    const selectedCount = Object.values(selectedItems).filter(i => i.selected).length
    const selectedTotal = selectableItems
        .filter(item => selectedItems[item.id]?.selected)
        .reduce((sum, item) => sum + item.price, 0)

    const pendingItems = selectableItems.filter(item => !item.isSold)

    // Toggle item selection
    const toggleItem = (id: string, supplier: string | null) => {
        setSelectedItems(prev => ({
            ...prev,
            [id]: {
                selected: !prev[id]?.selected,
                supplier: prev[id]?.supplier || supplier || ''
            }
        }))
    }

    // Update supplier
    const updateSupplier = (id: string, supplier: string) => {
        setSelectedItems(prev => ({
            ...prev,
            [id]: { ...prev[id], supplier }
        }))
    }

    // Select all pending
    const selectAllPending = () => {
        const newSelected: Record<string, { selected: boolean; supplier: string }> = {}
        for (const item of pendingItems) {
            newSelected[item.id] = {
                selected: true,
                supplier: item.supplier || ''
            }
        }
        setSelectedItems(newSelected)
    }

    // Handle submit
    const handleSubmit = () => {
        const items = selectableItems
            .filter(item => selectedItems[item.id]?.selected)
            .map(item => ({
                proposal_item_id: item.type === 'proposal_item' ? item.id : undefined,
                proposal_flight_id: item.type === 'proposal_flight' ? item.id : undefined,
                card_financial_item_id: item.type === 'card_financial_item' ? item.id : undefined,
                supplier: selectedItems[item.id]?.supplier || undefined
            }))
            .filter(item => item.proposal_item_id || item.proposal_flight_id || item.card_financial_item_id)

        createSale({
            card_id: cardId,
            proposal_id: proposalId || null,
            sale_date: saleDate || new Date().toISOString().split('T')[0],
            travel_start_date: cardData?.data_viagem_inicio?.split('T')[0] || null,
            travel_end_date: cardData?.data_viagem_fim?.split('T')[0] || null,
            items
        }, {
            onSuccess: () => {
                onClose()
            }
        })
    }

    const getTypeLabel = (type: string) => {
        const labels: Record<string, string> = {
            hotel: 'Hotéis',
            flight: 'Voos',
            transfer: 'Transfers',
            experience: 'Experiências',
            insurance: 'Seguros',
            service: 'Serviços',
            fee: 'Taxas',
            custom: 'Outros'
        }
        return labels[type] || type
    }

    // Estado para mostrar/esconder o preview do payload
    const [showPayloadPreview, setShowPayloadPreview] = useState(false)

    // Gerar preview do payload espelhando buildMondePayload do dispatch
    // Structure validated via real POST tests (Feb 2026)
    const mondePayloadPreview = useMemo(() => {
        const selectedItemsList = selectableItems.filter(item => selectedItems[item.id]?.selected)
        if (selectedItemsList.length === 0) return null

        const travelStart = cardData?.data_viagem_inicio?.split('T')[0] || saleDate
        const travelEnd = cardData?.data_viagem_fim?.split('T')[0] || travelStart

        // travel_agent (REQUIRED) — card owner
        const agent = (cardData?.owner || cardData?.dono) as { id?: string; nome?: string } | null
        const travelAgent = {
            external_id: agent?.id || '(auto-generated)',
            name: agent?.nome || 'Agente não informado',
        }

        // payer (REQUIRED) — card contato
        const contato = cardData?.contato as { id?: string; nome?: string; sobrenome?: string; email?: string; telefone?: string; cpf?: string } | null
        const payerName = contato
            ? [contato.nome, contato.sobrenome].filter(Boolean).join(' ')
            : 'Pagante não informado'
        const payer = {
            person_kind: 'individual',
            external_id: contato?.id || '(auto-generated)',
            name: payerName,
            ...(contato?.cpf && { cpf_cnpj: contato.cpf.replace(/\D/g, '') }),
            ...(contato?.email && { email: contato.email }),
            ...(contato?.telefone && { mobile_number: contato.telefone.replace(/\D/g, '') }),
        }

        // Default passenger (payer = main traveler)
        const defaultPassenger = {
            person: {
                external_id: contato?.id || '(auto-generated)',
                name: payerName,
            },
        }

        // Receita: distribute commission_amount proportionally (mirrors dispatch logic)
        const cardReceita = cardData?.receita as number | null | undefined
        const totalValue = selectedItemsList.reduce((sum, i) => sum + i.price, 0)

        // Helper: build product base fields
        const makeBase = (item: SelectableItem) => {
            const supplierName = selectedItems[item.id]?.supplier || item.supplier || 'Não informado'
            const commission = cardReceita && totalValue > 0
                ? Math.round((item.price / totalValue) * cardReceita * 100) / 100
                : undefined
            return {
                external_id: item.id,
                currency: 'BRL',
                value: item.price,
                supplier: { external_id: '(auto-generated)', name: supplierName },
                passengers: [defaultPassenger],
                ...(commission ? { commission_amount: commission } : {}),
            }
        }

        // Products — same logic as dispatch (7 types, no airline_tickets)
        const hotels: Array<Record<string, unknown>> = []
        const transfers: Array<Record<string, unknown>> = []
        const insurances: Array<Record<string, unknown>> = []
        const cruises: Array<Record<string, unknown>> = []
        const trainTickets: Array<Record<string, unknown>> = []
        const carRentals: Array<Record<string, unknown>> = []
        const travelPackages: Array<Record<string, unknown>> = []

        for (const item of selectedItemsList) {
            const base = makeBase(item)

            switch (item.itemType) {
                case 'hotel':
                case 'accommodation':
                    hotels.push({
                        ...base,
                        check_in: travelStart,
                        check_out: travelEnd,
                        booking_number: `WC-${item.id.substring(0, 8)}`,
                    })
                    break
                case 'flight':
                case 'aereo':
                    // airline_tickets is IGNORED by API → map as travel_package
                    // destination is REQUIRED enum: "national" | "international"
                    travelPackages.push({
                        ...base,
                        begin_date: travelStart,
                        booking_number: `WC-${item.id.substring(0, 8)}`,
                        package_name: item.title || 'Passagem Aérea',
                        destination: 'international',
                    })
                    break
                case 'transfer':
                case 'ground_transportation':
                    transfers.push({
                        ...base,
                        locator: `WC-${item.id.substring(0, 8)}`,
                        segments: [{ date: travelStart }],
                    })
                    break
                case 'insurance':
                case 'seguro':
                    insurances.push({
                        ...base,
                        begin_date: travelStart,
                        end_date: travelEnd,
                    })
                    break
                case 'cruise':
                    cruises.push({
                        ...base,
                        departure_date: travelStart,
                        arrival_date: travelEnd,
                        booking_number: `WC-${item.id.substring(0, 8)}`,
                    })
                    break
                case 'train_ticket':
                    trainTickets.push({
                        ...base,
                        locator: `WC-${item.id.substring(0, 8)}`,
                        segments: [{ departure_date: travelStart }],
                    })
                    break
                case 'car_rental':
                    carRentals.push({
                        ...base,
                        pickup_date: travelStart,
                        dropoff_date: travelEnd,
                        booking_number: `WC-${item.id.substring(0, 8)}`,
                    })
                    break
                case 'experiencia':
                default:
                    // Fallback: travel_package (most flexible Monde type)
                    // destination is REQUIRED enum: "national" | "international"
                    travelPackages.push({
                        ...base,
                        begin_date: travelStart,
                        end_date: travelEnd,
                        booking_number: `WC-${item.id.substring(0, 8)}`,
                        package_name: item.title,
                        destination: 'international',
                    })
            }
        }

        const payload: Record<string, unknown> = {
            company_identifier: mondeCnpj || 'CNPJ_NAO_CONFIGURADO',
            sale_date: saleDate,
            // operation_id removed — Monde rejects unregistered operation IDs with 422
            travel_agent: travelAgent,
            payer: payer,
        }

        if (hotels.length > 0) payload.hotels = hotels
        if (transfers.length > 0) payload.ground_transportations = transfers
        if (insurances.length > 0) payload.insurances = insurances
        if (cruises.length > 0) payload.cruises = cruises
        if (trainTickets.length > 0) payload.train_tickets = trainTickets
        if (carRentals.length > 0) payload.car_rentals = carRentals
        if (travelPackages.length > 0) payload.travel_packages = travelPackages
        // NOTE: airline_tickets intentionally excluded — silently ignored by Monde API

        return payload
    }, [selectableItems, selectedItems, saleDate, cardData, mondeCnpj])

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b">
                    <div className="flex items-center gap-3">
                        <Building2 className="w-5 h-5 text-indigo-600" />
                        <h2 className="text-lg font-semibold text-gray-900">
                            Enviar para Monde
                        </h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1 rounded-lg hover:bg-gray-100"
                    >
                        <X className="w-5 h-5 text-gray-500" />
                    </button>
                </div>

                {/* Progress */}
                <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 border-b">
                    {(['select', 'info', 'confirm'] as Step[]).map((s, i) => (
                        <div key={s} className="flex items-center gap-2">
                            <div className={cn(
                                'w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium',
                                step === s ? 'bg-indigo-600 text-white' :
                                    i < ['select', 'info', 'confirm'].indexOf(step)
                                        ? 'bg-green-600 text-white'
                                        : 'bg-gray-200 text-gray-600'
                            )}>
                                {i < ['select', 'info', 'confirm'].indexOf(step) ? (
                                    <Check className="w-3 h-3" />
                                ) : (
                                    i + 1
                                )}
                            </div>
                            <span className={cn(
                                'text-sm',
                                step === s ? 'text-gray-900 font-medium' : 'text-gray-500'
                            )}>
                                {s === 'select' && 'Selecionar Items'}
                                {s === 'info' && 'Informações'}
                                {s === 'confirm' && 'Confirmação'}
                            </span>
                            {i < 2 && <ChevronRight className="w-4 h-4 text-gray-300" />}
                        </div>
                    ))}
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-4">
                    {isLoading ? (
                        <div className="flex items-center justify-center py-12">
                            <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
                        </div>
                    ) : step === 'select' ? (
                        <div className="space-y-4">
                            {/* CPF warning */}
                            {cardData && !(cardData.contato as { cpf?: string } | null)?.cpf && (
                                <div className="flex items-start gap-2.5 p-3 rounded-lg bg-amber-50 border border-amber-200">
                                    <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                                    <div>
                                        <p className="text-sm font-medium text-amber-800">Contato sem CPF</p>
                                        <p className="text-xs text-amber-600 mt-0.5">
                                            Recomendamos preencher o CPF do contato antes de enviar ao Monde para evitar duplicação de cadastro.
                                        </p>
                                    </div>
                                </div>
                            )}
                            {/* Select all button */}
                            {pendingItems.length > 0 && (
                                <div className="flex items-center justify-between">
                                    <p className="text-sm text-gray-500">
                                        {pendingItems.length} item(s) disponível(is) para envio
                                    </p>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={selectAllPending}
                                    >
                                        Selecionar todos
                                    </Button>
                                </div>
                            )}

                            {/* Items by type */}
                            {Object.entries(groupedItems).map(([type, items]) => (
                                <div key={type} className="space-y-2">
                                    <h3 className="text-sm font-medium text-gray-700 flex items-center gap-2">
                                        <Package className="w-4 h-4" />
                                        {getTypeLabel(type)}
                                    </h3>
                                    <div className="space-y-2">
                                        {items.map(item => (
                                            <ItemCard
                                                key={item.id}
                                                item={item}
                                                isSelected={selectedItems[item.id]?.selected || false}
                                                supplier={selectedItems[item.id]?.supplier || item.supplier || ''}
                                                onToggle={() => toggleItem(item.id, item.supplier)}
                                                onSupplierChange={(s) => updateSupplier(item.id, s)}
                                            />
                                        ))}
                                    </div>
                                </div>
                            ))}

                            {selectableItems.length === 0 && (
                                <div className="text-center py-8 text-gray-500">
                                    {hasProposal ? 'Nenhum item encontrado na proposta' : 'Nenhum item financeiro encontrado'}
                                </div>
                            )}
                        </div>
                    ) : step === 'info' ? (
                        <div className="space-y-6">
                            {/* Sale date */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    <Calendar className="w-4 h-4 inline mr-2" />
                                    Data de Fechamento da Venda
                                </label>
                                <Input
                                    type="date"
                                    value={saleDate}
                                    onChange={(e) => setSaleDateManual(e.target.value)}
                                    className="w-full max-w-xs"
                                />
                                <p className="text-xs text-gray-500 mt-1">
                                    Esta data será usada para controle de comissão mensal
                                </p>
                            </div>

                            {/* Summary */}
                            <div className="p-4 bg-gray-50 rounded-lg">
                                <h3 className="text-sm font-medium text-gray-900 mb-3">Resumo da Venda</h3>
                                <div className="space-y-2 text-sm">
                                    {selectableItems
                                        .filter(item => selectedItems[item.id]?.selected)
                                        .map(item => (
                                            <div key={item.id} className="flex justify-between">
                                                <span className="text-gray-600">
                                                    {item.title}
                                                    {selectedItems[item.id]?.supplier && (
                                                        <span className="text-gray-400 ml-1">
                                                            ({selectedItems[item.id].supplier})
                                                        </span>
                                                    )}
                                                </span>
                                                <span className="font-medium">
                                                    {new Intl.NumberFormat('pt-BR', {
                                                        style: 'currency',
                                                        currency: 'BRL'
                                                    }).format(item.price)}
                                                </span>
                                            </div>
                                        ))}
                                    <div className="flex justify-between pt-2 border-t border-gray-200 font-semibold">
                                        <span>Total</span>
                                        <span className="text-indigo-600">
                                            {new Intl.NumberFormat('pt-BR', {
                                                style: 'currency',
                                                currency: 'BRL'
                                            }).format(selectedTotal)}
                                        </span>
                                    </div>
                                    {cardData?.receita != null && (
                                        <div className="flex justify-between pt-2 border-t border-gray-200 text-sm">
                                            <span className="text-gray-600">Receita (Margem)</span>
                                            <span className="font-medium text-emerald-600">
                                                {new Intl.NumberFormat('pt-BR', {
                                                    style: 'currency',
                                                    currency: 'BRL'
                                                }).format(cardData.receita)}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="py-4">
                            {isCreating ? (
                                <div className="space-y-4 text-center">
                                    <Loader2 className="w-12 h-12 animate-spin text-indigo-600 mx-auto" />
                                    <p className="text-gray-600">Criando venda...</p>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {/* Resumo */}
                                    <div className="text-center">
                                        <CheckCircle2 className="w-10 h-10 text-green-600 mx-auto" />
                                        <h3 className="text-lg font-semibold text-gray-900 mt-2">
                                            Confirmar Envio
                                        </h3>
                                        <p className="text-gray-600">
                                            {selectedCount} item(s) • {new Date(saleDate).toLocaleDateString('pt-BR')}
                                        </p>
                                        <p className="text-2xl font-bold text-indigo-600 mt-1">
                                            {new Intl.NumberFormat('pt-BR', {
                                                style: 'currency',
                                                currency: 'BRL'
                                            }).format(selectedTotal)}
                                        </p>
                                        {cardData?.receita != null && (
                                            <p className="text-sm text-emerald-600 mt-1">
                                                Receita (Margem): {new Intl.NumberFormat('pt-BR', {
                                                    style: 'currency',
                                                    currency: 'BRL'
                                                }).format(cardData.receita)}
                                            </p>
                                        )}
                                    </div>

                                    {/* Toggle Preview */}
                                    <div className="border-t pt-4">
                                        <button
                                            onClick={() => setShowPayloadPreview(!showPayloadPreview)}
                                            className="flex items-center gap-2 text-sm text-indigo-600 hover:text-indigo-800 mx-auto"
                                        >
                                            {showPayloadPreview ? (
                                                <Eye className="w-4 h-4" />
                                            ) : (
                                                <Code className="w-4 h-4" />
                                            )}
                                            {showPayloadPreview ? 'Ocultar' : 'Ver'} payload JSON (Monde API)
                                        </button>
                                    </div>

                                    {/* Payload Preview */}
                                    {showPayloadPreview && (
                                        <div className="mt-4">
                                            <div className="flex items-center justify-between mb-2">
                                                <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                    Preview do Payload (Monde API V3)
                                                </span>
                                                <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded">
                                                    Shadow Mode Ativo
                                                </span>
                                            </div>
                                            <pre className="bg-gray-900 text-green-400 p-4 rounded-lg text-xs overflow-x-auto max-h-64 overflow-y-auto">
                                                {JSON.stringify(mondePayloadPreview, null, 2)}
                                            </pre>
                                            <p className="text-xs text-gray-500 mt-2 text-center">
                                                Este é o formato que será enviado para{' '}
                                                <code className="bg-gray-100 px-1 rounded">POST /api/v3/sales</code>
                                            </p>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between p-4 border-t bg-gray-50">
                    <div className="text-sm text-gray-600">
                        {step === 'select' && selectedCount > 0 && (
                            <span>
                                {selectedCount} item(s) selecionado(s) •{' '}
                                <span className="font-medium text-indigo-600">
                                    {new Intl.NumberFormat('pt-BR', {
                                        style: 'currency',
                                        currency: 'BRL'
                                    }).format(selectedTotal)}
                                </span>
                            </span>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        {step !== 'select' && (
                            <Button
                                variant="outline"
                                onClick={() => setStep(step === 'info' ? 'select' : 'info')}
                                disabled={isCreating}
                            >
                                <ChevronLeft className="w-4 h-4 mr-1" />
                                Voltar
                            </Button>
                        )}
                        {step === 'select' && (
                            <Button
                                onClick={() => setStep('info')}
                                disabled={selectedCount === 0}
                            >
                                Próximo
                                <ChevronRight className="w-4 h-4 ml-1" />
                            </Button>
                        )}
                        {step === 'info' && (
                            <Button onClick={() => setStep('confirm')}>
                                Revisar
                                <ChevronRight className="w-4 h-4 ml-1" />
                            </Button>
                        )}
                        {step === 'confirm' && (
                            <Button
                                onClick={handleSubmit}
                                disabled={isCreating}
                                className="bg-green-600 hover:bg-green-700"
                            >
                                {isCreating ? (
                                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                ) : (
                                    <Check className="w-4 h-4 mr-2" />
                                )}
                                Confirmar Envio
                            </Button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}

// ============================================
// ItemCard Component
// ============================================
interface ItemCardProps {
    item: SelectableItem
    isSelected: boolean
    supplier: string
    onToggle: () => void
    onSupplierChange: (supplier: string) => void
}

function ItemCard({ item, isSelected, supplier, onToggle, onSupplierChange }: ItemCardProps) {
    const formattedPrice = new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    }).format(item.price)

    return (
        <div
            className={cn(
                'p-3 rounded-lg border transition-colors',
                item.isSold
                    ? 'bg-gray-50 border-gray-200 opacity-60'
                    : isSelected
                        ? 'bg-indigo-50 border-indigo-300'
                        : 'bg-white border-gray-200 hover:border-gray-300'
            )}
        >
            <div className="flex items-start gap-3">
                {/* Checkbox */}
                <button
                    onClick={onToggle}
                    disabled={item.isSold}
                    className={cn(
                        'mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors',
                        item.isSold
                            ? 'bg-gray-200 border-gray-300 cursor-not-allowed'
                            : isSelected
                                ? 'bg-indigo-600 border-indigo-600'
                                : 'border-gray-300 hover:border-indigo-400'
                    )}
                >
                    {(isSelected || item.isSold) && (
                        <Check className="w-3 h-3 text-white" />
                    )}
                </button>

                {/* Content */}
                <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">
                                {item.title}
                            </p>
                            {item.description && (
                                <p className="text-xs text-gray-500 truncate">
                                    {item.description}
                                </p>
                            )}
                        </div>
                        <span className="text-sm font-medium text-gray-900 whitespace-nowrap">
                            {formattedPrice}
                        </span>
                    </div>

                    {/* Sold badge */}
                    {item.isSold && item.soldInfo && (
                        <div className="flex items-center gap-1 mt-2 text-xs text-green-700">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>
                                Enviado em {new Date(item.soldInfo.saleDate).toLocaleDateString('pt-BR')}
                            </span>
                        </div>
                    )}

                    {/* Supplier input */}
                    {!item.isSold && isSelected && (
                        <div className="mt-2">
                            <Input
                                type="text"
                                placeholder="Fornecedor (ex: Hotelbeds, LATAM)"
                                value={supplier}
                                onChange={(e) => onSupplierChange(e.target.value)}
                                className="text-xs h-8"
                                onClick={(e) => e.stopPropagation()}
                            />
                        </div>
                    )}

                    {/* Show existing supplier if not selected */}
                    {!item.isSold && !isSelected && item.supplier && (
                        <p className="text-xs text-gray-400 mt-1">
                            Fornecedor: {item.supplier}
                        </p>
                    )}
                </div>
            </div>
        </div>
    )
}
