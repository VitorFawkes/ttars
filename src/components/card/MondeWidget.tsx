import { useState } from 'react'
import {
    Building2,
    Plus,
    ChevronRight,
    ChevronDown,
    Clock,
    CheckCircle2,
    AlertCircle,
    Loader2,
    RefreshCw,
    Ban,
    Eye,
    Download,
    Building,
    Plane,
    Car,
    Shield,
    Package,
    Ship,
    TrainFront,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { supabase } from '@/lib/supabase'
import {
    useMondeSalesByCard,
    useCancelMondeSale,
    useRetryMondeSale,
    getMondeSaleStatusInfo,
    type MondeSaleWithItems,
    type MondeSaleItem,
    type MondeSaleStatus
} from '@/hooks/useMondeSales'
import MondeCreateSaleModal from './MondeCreateSaleModal'
import { SectionCollapseToggle } from './DynamicSectionWidget'

// ============================================
// Types
// ============================================
interface MondeWidgetProps {
    cardId: string
    /** @deprecated Now fetched internally. Kept for backward-compat during migration. */
    proposalId?: string | null
    /** @deprecated Now derived internally. Kept for backward-compat during migration. */
    hasAcceptedProposal?: boolean
    card?: unknown
    /** Collapse support — passed by CollapsibleWidgetSection */
    isExpanded?: boolean
    onToggleCollapse?: () => void
}

interface CardContext {
    titulo: string | null
    data_viagem_inicio: string | null
    data_viagem_fim: string | null
    valor_final: number | null
    receita: number | null
    contato: {
        nome: string | null
        sobrenome: string | null
        email: string | null
        telefone: string | null
        cpf: string | null
    } | null
    agent: {
        nome: string | null
        email: string | null
    } | null
    cards_contatos: Array<{
        contatos: {
            nome: string | null
            sobrenome: string | null
        } | null
    }> | null
}

// ============================================
// Main Widget
// ============================================
export default function MondeWidget({
    cardId,
    proposalId: externalProposalId,
    hasAcceptedProposal: externalHasAccepted,
    isExpanded,
    onToggleCollapse,
}: MondeWidgetProps) {
    const navigate = useNavigate()

    // Fetch card context for payer/agent display
    const { data: cardContext } = useQuery({
        queryKey: ['card-monde-context', cardId],
        queryFn: async () => {
            const { data: card, error } = await supabase
                .from('cards')
                .select(`
                    titulo, data_viagem_inicio, data_viagem_fim, valor_final, receita,
                    contato:contatos!cards_pessoa_principal_id_fkey(nome, sobrenome, email, telefone, cpf),
                    agent:profiles!cards_vendas_owner_id_profiles_fkey(nome, email),
                    dono:profiles!cards_dono_atual_id_profiles_fkey(nome, email),
                    cards_contatos(contatos(nome, sobrenome))
                `)
                .eq('id', cardId)
                .single()
            if (error || !card) return null

            return {
                titulo: card.titulo,
                data_viagem_inicio: card.data_viagem_inicio,
                data_viagem_fim: card.data_viagem_fim,
                valor_final: card.valor_final,
                receita: card.receita,
                contato: card.contato as unknown as CardContext['contato'],
                agent: (card.agent || card.dono) as unknown as CardContext['agent'],
                cards_contatos: card.cards_contatos as unknown as CardContext['cards_contatos'],
            }
        },
        enabled: !!cardId,
    })

    // Fetch accepted proposal internally (fallback if not passed from parent)
    const { data: fetchedProposal } = useQuery({
        queryKey: ['card-accepted-proposal', cardId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('proposals')
                .select('id, status')
                .eq('card_id', cardId)
                .eq('status', 'accepted')
                .limit(1)
                .maybeSingle()
            if (error) return null
            return data
        },
        enabled: !!cardId && externalProposalId === undefined,
    })

    const proposalId = externalProposalId ?? fetchedProposal?.id ?? null
    const hasAcceptedProposal = externalHasAccepted ?? !!fetchedProposal

    // Check if card has financial items (no-proposal path)
    const { data: financialItems } = useQuery({
        queryKey: ['card-financial-items-count', cardId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('card_financial_items')
                .select('id')
                .eq('card_id', cardId)
                .limit(1)
            if (error) return []
            return data || []
        },
        enabled: !!cardId && !hasAcceptedProposal,
    })
    const hasFinancialItems = (financialItems || []).length > 0
    const canCreateSale = (hasAcceptedProposal && !!proposalId) || hasFinancialItems

    const { data: sales, isLoading } = useMondeSalesByCard(cardId)
    const { mutate: cancelSale, isPending: isCancelling } = useCancelMondeSale()
    const { mutate: retrySale, isPending: isRetrying } = useRetryMondeSale()

    const [showCreateModal, setShowCreateModal] = useState(false)
    const [expandedSection, setExpandedSection] = useState<'pending' | 'sent' | 'failed' | null>('pending')

    const pendingSales = (sales || []).filter(s => s.status === 'pending' || s.status === 'processing')
    const sentSales = (sales || []).filter(s => s.status === 'sent')
    const failedSales = (sales || []).filter(s => s.status === 'failed')

    const totalSent = sentSales.reduce((sum, s) => sum + (s.total_value || 0), 0)

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
            </div>
        )
    }

    return (
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
            {/* Header — clickable to collapse/expand */}
            <div
                className={cn("px-3 py-2 border-b border-gray-100 flex items-center justify-between", onToggleCollapse && "cursor-pointer hover:bg-gray-50/80 transition-colors")}
                onClick={onToggleCollapse}
            >
                <div className="flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-indigo-500" />
                    <h3 className="text-sm font-semibold text-gray-900">
                        Vendas Monde
                    </h3>
                    {sentSales.length > 0 && (
                        <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-green-100 text-green-700">
                            {sentSales.length} enviada(s)
                        </span>
                    )}
                </div>

                <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                    {canCreateSale && (
                        <>
                            {hasAcceptedProposal && proposalId && (
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => navigate(`/cards/${cardId}/monde-preview?proposalId=${proposalId}`)}
                                    className="text-xs text-indigo-600 hover:text-indigo-800"
                                >
                                    <Eye className="w-3 h-3 mr-1" />
                                    Preview
                                </Button>
                            )}
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setShowCreateModal(true)}
                                className="text-xs"
                            >
                                <Plus className="w-3 h-3 mr-1" />
                                Nova Venda
                            </Button>
                        </>
                    )}
                    {onToggleCollapse && (
                        <SectionCollapseToggle isExpanded={isExpanded ?? true} onToggle={onToggleCollapse} />
                    )}
                </div>
            </div>

            {/* Content */}
            <div className="p-3 space-y-4">

            {/* Summary */}
            {sentSales.length > 0 && (
                <div className="flex items-center gap-4 p-3 bg-green-50 rounded-lg border border-green-100">
                    <CheckCircle2 className="w-5 h-5 text-green-600" />
                    <div>
                        <p className="text-sm font-medium text-green-900">
                            {sentSales.length} venda(s) enviada(s)
                        </p>
                        <p className="text-xs text-green-700">
                            Total: {formatBRL(totalSent)}
                        </p>
                    </div>
                </div>
            )}

            {/* Pending Sales */}
            {pendingSales.length > 0 && (
                <SalesSection
                    title="Aguardando Envio"
                    count={pendingSales.length}
                    icon={<Clock className="w-3 h-3" />}
                    iconColor="text-yellow-500"
                    isExpanded={expandedSection === 'pending'}
                    onToggle={() => setExpandedSection(expandedSection === 'pending' ? null : 'pending')}
                >
                    {pendingSales.map(sale => (
                        <SaleItem
                            key={sale.id}
                            sale={sale}
                            cardContext={cardContext}
                            onCancel={() => cancelSale({ saleId: sale.id, cardId })}
                            isCancelling={isCancelling}
                        />
                    ))}
                </SalesSection>
            )}

            {/* Failed Sales */}
            {failedSales.length > 0 && (
                <SalesSection
                    title="Falha no Envio"
                    count={failedSales.length}
                    icon={<AlertCircle className="w-3 h-3" />}
                    iconColor="text-red-500"
                    isExpanded={expandedSection === 'failed'}
                    onToggle={() => setExpandedSection(expandedSection === 'failed' ? null : 'failed')}
                >
                    {failedSales.map(sale => (
                        <SaleItem
                            key={sale.id}
                            sale={sale}
                            cardContext={cardContext}
                            onRetry={() => retrySale({ saleId: sale.id, cardId })}
                            onCancel={() => cancelSale({ saleId: sale.id, cardId })}
                            isRetrying={isRetrying}
                            isCancelling={isCancelling}
                            showError
                        />
                    ))}
                </SalesSection>
            )}

            {/* Sent Sales */}
            {sentSales.length > 0 && (
                <SalesSection
                    title="Enviadas"
                    count={sentSales.length}
                    icon={<CheckCircle2 className="w-3 h-3" />}
                    iconColor="text-green-500"
                    isExpanded={expandedSection === 'sent'}
                    onToggle={() => setExpandedSection(expandedSection === 'sent' ? null : 'sent')}
                    defaultCollapsed
                >
                    {sentSales.map(sale => (
                        <SaleItem key={sale.id} sale={sale} cardContext={cardContext} />
                    ))}
                </SalesSection>
            )}

            {/* Empty State */}
            {(sales || []).length === 0 && (
                <div className="text-center py-6 bg-gray-50 rounded-lg border border-dashed border-gray-200">
                    <Building2 className="w-8 h-8 mx-auto text-gray-300 mb-2" />
                    <p className="text-sm text-gray-500">
                        Nenhuma venda enviada para o Monde
                    </p>
                    {canCreateSale ? (
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setShowCreateModal(true)}
                            className="mt-3 text-xs"
                        >
                            <Plus className="w-3 h-3 mr-1" />
                            Criar primeira venda
                        </Button>
                    ) : (
                        <p className="text-xs text-gray-400 mt-1">
                            Aceite uma proposta ou adicione itens financeiros para enviar vendas
                        </p>
                    )}
                </div>
            )}

            </div>

            {/* Create Modal */}
            {showCreateModal && canCreateSale && (
                <MondeCreateSaleModal
                    cardId={cardId}
                    proposalId={proposalId}
                    onClose={() => setShowCreateModal(false)}
                />
            )}
        </div>
    )
}

// ============================================
// Helpers
// ============================================
function formatBRL(value: number) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
}

function formatDateBR(dateStr: string | null | undefined): string {
    if (!dateStr) return '-'
    try {
        const d = new Date(dateStr + 'T12:00:00')
        return d.toLocaleDateString('pt-BR')
    } catch {
        return dateStr
    }
}

function formatCPF(cpf: string): string {
    const digits = cpf.replace(/\D/g, '')
    if (digits.length !== 11) return cpf
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`
}

// ============================================
// Item Type Config
// ============================================
const ITEM_TYPE_CONFIG: Record<string, { label: string; icon: typeof Building; color: string; bgColor: string }> = {
    hotel: { label: 'Hotel', icon: Building, color: 'text-blue-700', bgColor: 'bg-blue-50 border-blue-200' },
    accommodation: { label: 'Hotel', icon: Building, color: 'text-blue-700', bgColor: 'bg-blue-50 border-blue-200' },
    flight: { label: 'Voo', icon: Plane, color: 'text-indigo-700', bgColor: 'bg-indigo-50 border-indigo-200' },
    transfer: { label: 'Transfer', icon: Car, color: 'text-orange-700', bgColor: 'bg-orange-50 border-orange-200' },
    ground_transportation: { label: 'Transfer', icon: Car, color: 'text-orange-700', bgColor: 'bg-orange-50 border-orange-200' },
    insurance: { label: 'Seguro', icon: Shield, color: 'text-green-700', bgColor: 'bg-green-50 border-green-200' },
    cruise: { label: 'Cruzeiro', icon: Ship, color: 'text-cyan-700', bgColor: 'bg-cyan-50 border-cyan-200' },
    train_ticket: { label: 'Trem', icon: TrainFront, color: 'text-amber-700', bgColor: 'bg-amber-50 border-amber-200' },
    car_rental: { label: 'Locação Veículo', icon: Car, color: 'text-rose-700', bgColor: 'bg-rose-50 border-rose-200' },
    travel_package: { label: 'Pacote', icon: Package, color: 'text-purple-700', bgColor: 'bg-purple-50 border-purple-200' },
    custom: { label: 'Outros', icon: Package, color: 'text-gray-700', bgColor: 'bg-gray-50 border-gray-200' },
}

function getItemTypeConfig(type: string) {
    return ITEM_TYPE_CONFIG[type] || ITEM_TYPE_CONFIG.custom
}

// ============================================
// Monde field mapping per item type
// ============================================
function getItemMondeFields(item: MondeSaleItem, sale: MondeSaleWithItems): Array<{ label: string; value: string }> {
    const meta = item.item_metadata || {}
    const travelStart = sale.travel_start_date || sale.sale_date
    const travelEnd = sale.travel_end_date || travelStart

    switch (item.item_type) {
        case 'hotel':
        case 'accommodation':
            return [
                { label: 'Fornecedor', value: item.supplier || 'Não informado' },
                { label: 'Check-in', value: formatDateBR((meta.check_in as string) || travelStart) },
                { label: 'Check-out', value: formatDateBR((meta.check_out as string) || travelEnd) },
                ...(meta.city ? [{ label: 'Cidade', value: meta.city as string }] : []),
                { label: 'Quartos', value: String((meta.rooms as number) || 1) },
                { label: 'Valor', value: formatBRL(item.total_price) },
            ]
        case 'flight':
            return [
                { label: 'Cia Aérea', value: item.supplier || 'Não informado' },
                { label: 'Data Partida', value: formatDateBR((meta.departure_datetime as string)?.substring(0, 10) || travelStart) },
                { label: 'Origem', value: (meta.origin_airport as string) || (meta.origin as string) || 'N/A' },
                { label: 'Destino', value: (meta.destination_airport as string) || (meta.destination as string) || 'N/A' },
                ...((meta.flight_number || meta.locator) ? [{ label: 'Localizador', value: (meta.flight_number as string) || (meta.locator as string) || '' }] : []),
                { label: 'Valor', value: formatBRL(item.total_price) },
            ]
        case 'transfer':
        case 'ground_transportation':
            return [
                ...(item.supplier ? [{ label: 'Fornecedor', value: item.supplier }] : []),
                { label: 'Data', value: formatDateBR((meta.date as string) || travelStart) },
                ...(meta.origin ? [{ label: 'Origem', value: meta.origin as string }] : []),
                ...(meta.destination ? [{ label: 'Destino', value: meta.destination as string }] : []),
                { label: 'Valor', value: formatBRL(item.total_price) },
            ]
        case 'insurance':
            return [
                ...(item.supplier ? [{ label: 'Fornecedor', value: item.supplier }] : []),
                { label: 'Início', value: formatDateBR((meta.start_date as string) || travelStart) },
                { label: 'Fim', value: formatDateBR((meta.end_date as string) || travelEnd) },
                { label: 'Valor', value: formatBRL(item.total_price) },
            ]
        case 'cruise':
            return [
                { label: 'Companhia', value: item.supplier || 'Não informado' },
                { label: 'Partida', value: formatDateBR((meta.departure_date as string) || travelStart) },
                { label: 'Chegada', value: formatDateBR((meta.arrival_date as string) || travelEnd) },
                { label: 'Valor', value: formatBRL(item.total_price) },
            ]
        case 'train_ticket':
            return [
                ...(item.supplier ? [{ label: 'Companhia', value: item.supplier }] : []),
                { label: 'Data Partida', value: formatDateBR((meta.departure_date as string) || travelStart) },
                ...(meta.origin ? [{ label: 'Origem', value: meta.origin as string }] : []),
                ...(meta.destination ? [{ label: 'Destino', value: meta.destination as string }] : []),
                { label: 'Valor', value: formatBRL(item.total_price) },
            ]
        case 'car_rental':
            return [
                { label: 'Locadora', value: item.supplier || 'Não informado' },
                { label: 'Retirada', value: formatDateBR((meta.pickup_date as string) || travelStart) },
                { label: 'Devolução', value: formatDateBR((meta.return_date as string) || travelEnd) },
                ...(meta.pickup_location ? [{ label: 'Local Retirada', value: meta.pickup_location as string }] : []),
                ...(meta.return_location ? [{ label: 'Local Devolução', value: meta.return_location as string }] : []),
                { label: 'Valor', value: formatBRL(item.total_price) },
            ]
        case 'travel_package':
            return [
                { label: 'Operadora', value: item.supplier || 'Não informado' },
                { label: 'Início', value: formatDateBR((meta.start_date as string) || travelStart) },
                { label: 'Fim', value: formatDateBR((meta.end_date as string) || travelEnd) },
                ...(item.description ? [{ label: 'Descrição', value: item.description }] : []),
                { label: 'Valor', value: formatBRL(item.total_price) },
            ]
        default:
            return [
                ...(item.supplier ? [{ label: 'Fornecedor', value: item.supplier }] : []),
                ...(item.description ? [{ label: 'Descrição', value: item.description }] : []),
                { label: 'Valor', value: formatBRL(item.total_price) },
            ]
    }
}

// ============================================
// CSV Download — includes card context
// ============================================
function downloadSaleCSV(sale: MondeSaleWithItems, cardContext?: CardContext | null) {
    const contato = cardContext?.contato
    const agent = cardContext?.agent
    const operationId = `WC-${sale.card_id.substring(0, 8)}`
    const statusLabel = getMondeSaleStatusInfo(sale.status as MondeSaleStatus).label

    const rows: string[][] = []

    const suppliers = [...new Set((sale.items || []).map(i => i.supplier).filter(Boolean) as string[])]

    // Metadata section
    rows.push(['Campo', 'Valor'])
    if (cardContext?.titulo) rows.push(['Titulo da Venda', cardContext.titulo])
    rows.push(['Data Venda', formatDateBR(sale.sale_date)])
    rows.push(['Status', statusLabel])
    rows.push(['Operation ID', operationId])
    if (sale.monde_sale_id) rows.push(['Monde ID', sale.monde_sale_id])
    if (sale.monde_sale_number) rows.push(['Monde #', sale.monde_sale_number])
    rows.push(['Início Viagem', formatDateBR(sale.travel_start_date)])
    rows.push(['Fim Viagem', formatDateBR(sale.travel_end_date)])
    rows.push([''])

    // Payer
    if (contato) {
        const payerName = [contato.nome, contato.sobrenome].filter(Boolean).join(' ')
        rows.push(['Pagante', payerName || '-'])
        if (contato.cpf) rows.push(['CPF', formatCPF(contato.cpf)])
        if (contato.email) rows.push(['Email', contato.email])
        if (contato.telefone) rows.push(['Telefone', contato.telefone])
        rows.push([''])
    }

    // Agent
    if (agent) {
        rows.push(['Consultora/Vendedor', agent.nome || '-'])
        if (agent.email) rows.push(['Email Consultor(a)', agent.email])
        rows.push([''])
    }

    // Travelers
    const travelers = (cardContext?.cards_contatos || [])
        .map(p => p.contatos)
        .filter(Boolean)
        .map(c => [c!.nome, c!.sobrenome].filter(Boolean).join(' '))
        .filter(Boolean)
    if (travelers.length > 0) {
        rows.push(['Passageiros', travelers.join(', ')])
        rows.push([''])
    }

    // Suppliers summary
    if (suppliers.length > 0) {
        rows.push(['Fornecedores', suppliers.join(', ')])
        rows.push([''])
    }

    // Items table
    rows.push(['Tipo', 'Título', 'Fornecedor', 'Valor', 'Data Início', 'Data Fim', 'Detalhes'])

    for (const item of sale.items || []) {
        const config = getItemTypeConfig(item.item_type)
        const meta = item.item_metadata || {}
        const travelStart = sale.travel_start_date || sale.sale_date
        const travelEnd = sale.travel_end_date || travelStart

        let dateStart = ''
        let dateEnd = ''
        let details = ''

        switch (item.item_type) {
            case 'hotel':
            case 'accommodation':
                dateStart = formatDateBR((meta.check_in as string) || travelStart)
                dateEnd = formatDateBR((meta.check_out as string) || travelEnd)
                details = [meta.city, `${(meta.rooms as number) || 1} quarto(s)`].filter(Boolean).join('; ')
                break
            case 'flight':
                dateStart = formatDateBR((meta.departure_datetime as string)?.substring(0, 10) || travelStart)
                details = [
                    `${(meta.origin_airport as string) || (meta.origin as string) || '?'} → ${(meta.destination_airport as string) || (meta.destination as string) || '?'}`,
                    (meta.flight_number as string) || (meta.locator as string) || '',
                ].filter(Boolean).join('; ')
                break
            case 'transfer':
            case 'ground_transportation':
                dateStart = formatDateBR((meta.date as string) || travelStart)
                details = [(meta.origin as string), (meta.destination as string)].filter(Boolean).join(' → ')
                break
            case 'insurance':
                dateStart = formatDateBR((meta.start_date as string) || travelStart)
                dateEnd = formatDateBR((meta.end_date as string) || travelEnd)
                break
            case 'cruise':
                dateStart = formatDateBR((meta.departure_date as string) || travelStart)
                dateEnd = formatDateBR((meta.arrival_date as string) || travelEnd)
                break
            case 'train_ticket':
                dateStart = formatDateBR((meta.departure_date as string) || travelStart)
                details = [(meta.origin as string), (meta.destination as string)].filter(Boolean).join(' → ')
                break
            case 'car_rental':
                dateStart = formatDateBR((meta.pickup_date as string) || travelStart)
                dateEnd = formatDateBR((meta.return_date as string) || travelEnd)
                details = [(meta.pickup_location as string), (meta.return_location as string)].filter(Boolean).join(' → ')
                break
            case 'travel_package':
                dateStart = formatDateBR((meta.start_date as string) || travelStart)
                dateEnd = formatDateBR((meta.end_date as string) || travelEnd)
                details = (meta.description as string) || item.description || ''
                break
            default:
                details = item.description || ''
        }

        rows.push([
            config.label,
            item.title,
            item.supplier || '',
            formatBRL(item.total_price),
            dateStart,
            dateEnd,
            details,
        ])
    }

    // Totals
    rows.push([''])
    rows.push(['TOTAL MONDE', '', '', formatBRL(sale.total_value), '', '', ''])
    if (cardContext?.valor_final != null) {
        rows.push(['VALOR TOTAL (FATURAMENTO)', '', '', formatBRL(Number(cardContext.valor_final)), '', '', ''])
    }
    if (cardContext?.receita != null) {
        rows.push(['RECEITA (MARGEM)', '', '', formatBRL(Number(cardContext.receita)), '', '', ''])
    }

    const csvContent = rows
        .map(row => row.map(cell => `"${String(cell || '').replace(/"/g, '""')}"`).join(','))
        .join('\n')

    const BOM = '\uFEFF'
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `monde-venda-${sale.sale_date}-${sale.id.substring(0, 8)}.csv`
    a.click()
    URL.revokeObjectURL(url)
}

// ============================================
// SalesSection Component
// ============================================
interface SalesSectionProps {
    title: string
    count: number
    icon: React.ReactNode
    iconColor: string
    isExpanded: boolean
    onToggle: () => void
    defaultCollapsed?: boolean
    children: React.ReactNode
}

function SalesSection({
    title,
    count,
    icon,
    iconColor,
    isExpanded,
    onToggle,
    children
}: SalesSectionProps) {
    return (
        <div className="space-y-2">
            <button
                onClick={onToggle}
                className="flex items-center gap-2 text-xs font-medium text-gray-600 hover:text-gray-900 w-full"
            >
                <ChevronRight className={cn(
                    'w-3 h-3 transition-transform',
                    isExpanded && 'rotate-90'
                )} />
                <span className={iconColor}>{icon}</span>
                <span>{title} ({count})</span>
            </button>

            {isExpanded && (
                <div className="space-y-2 pl-4">
                    {children}
                </div>
            )}
        </div>
    )
}

// ============================================
// SaleItem Component
// ============================================
interface SaleItemProps {
    sale: MondeSaleWithItems
    cardContext?: CardContext | null
    onCancel?: () => void
    onRetry?: () => void
    isCancelling?: boolean
    isRetrying?: boolean
    showError?: boolean
}

function SaleItem({
    sale,
    cardContext,
    onCancel,
    onRetry,
    isCancelling,
    isRetrying,
    showError
}: SaleItemProps) {
    const [showDetail, setShowDetail] = useState(false)
    const [confirmCancel, setConfirmCancel] = useState(false)
    const statusInfo = getMondeSaleStatusInfo(sale.status as MondeSaleStatus)
    const formattedValue = formatBRL(sale.total_value || 0)
    const formattedDate = formatDateBR(sale.sale_date)

    return (
        <div className="p-3 bg-white rounded-lg border border-gray-200 space-y-2">
            {/* Header */}
            <div className="flex items-start justify-between">
                <div>
                    <div className="flex items-center gap-2">
                        <span className={cn(
                            'px-2 py-0.5 text-xs font-medium rounded-full',
                            statusInfo.color
                        )}>
                            {statusInfo.label}
                        </span>
                        {sale.monde_sale_id && (
                            <span className="text-xs text-gray-500">
                                #{sale.monde_sale_number || sale.monde_sale_id.substring(0, 8)}
                            </span>
                        )}
                    </div>
                    <p className="text-sm font-medium text-gray-900 mt-1">
                        {formattedValue}
                    </p>
                    <p className="text-xs text-gray-500">
                        Data: {formattedDate} · {sale.items?.length || 0} item(s)
                    </p>
                </div>
            </div>

            {/* Error message */}
            {showError && sale.error_message && (
                <div className="p-2 bg-red-50 rounded text-xs text-red-700">
                    {sale.error_message.substring(0, 100)}
                    {sale.error_message.length > 100 && '...'}
                </div>
            )}

            {/* Detail toggle + CSV download */}
            <div className="flex items-center gap-2 pt-1">
                <button
                    onClick={() => setShowDetail(!showDetail)}
                    className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                >
                    {showDetail ? (
                        <ChevronDown className="w-3 h-3" />
                    ) : (
                        <ChevronRight className="w-3 h-3" />
                    )}
                    Ver Detalhes
                </button>
                <button
                    onClick={() => downloadSaleCSV(sale, cardContext)}
                    className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 ml-auto"
                    title="Baixar CSV"
                >
                    <Download className="w-3 h-3" />
                    CSV
                </button>
            </div>

            {/* Expanded Detail View */}
            {showDetail && (
                <SaleDetailView sale={sale} cardContext={cardContext} />
            )}

            {/* Actions */}
            {(onCancel || onRetry) && (
                <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
                    {onRetry && (
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={onRetry}
                            disabled={isRetrying}
                            className="text-xs flex-1"
                        >
                            {isRetrying ? (
                                <Loader2 className="w-3 h-3 animate-spin mr-1" />
                            ) : (
                                <RefreshCw className="w-3 h-3 mr-1" />
                            )}
                            Tentar Novamente
                        </Button>
                    )}
                    {onCancel && !confirmCancel && (
                        <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setConfirmCancel(true)}
                            disabled={isCancelling}
                            className="text-xs text-gray-500 hover:text-red-600"
                            title="Cancelar venda"
                        >
                            <Ban className="w-3 h-3 mr-1" />
                            Cancelar
                        </Button>
                    )}
                    {onCancel && confirmCancel && (
                        <div className="flex items-center gap-1.5 bg-red-50 rounded-md px-2 py-1.5 border border-red-200">
                            <span className="text-xs text-red-700">Cancelar esta venda?</span>
                            <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => { onCancel(); setConfirmCancel(false) }}
                                disabled={isCancelling}
                                className="text-xs text-red-700 hover:bg-red-100 h-6 px-2"
                            >
                                {isCancelling ? (
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                    'Sim'
                                )}
                            </Button>
                            <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setConfirmCancel(false)}
                                className="text-xs text-gray-600 hover:bg-gray-100 h-6 px-2"
                            >
                                Não
                            </Button>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}

// ============================================
// SaleDetailView — Visual preview with full context
// ============================================
function SaleDetailView({ sale, cardContext }: { sale: MondeSaleWithItems; cardContext?: CardContext | null }) {
    const operationId = `WC-${sale.card_id.substring(0, 8)}`
    const contato = cardContext?.contato
    const agent = cardContext?.agent
    const travelers = (cardContext?.cards_contatos || [])
        .map(p => p.contatos)
        .filter(Boolean)
        .map(c => [c!.nome, c!.sobrenome].filter(Boolean).join(' '))
        .filter(Boolean)
    const suppliers = [...new Set((sale.items || []).map(i => i.supplier).filter(Boolean) as string[])]

    return (
        <div className="space-y-3 pt-2 border-t border-gray-100">
            {/* Sale Info */}
            <SectionHeader label="Informações da Venda" />
            {cardContext?.titulo && (
                <p className="text-xs font-semibold text-slate-900 -mt-1">{cardContext.titulo}</p>
            )}
            <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                <InfoField label="Data Venda" value={formatDateBR(sale.sale_date)} />
                <InfoField label="Operation ID" value={operationId} mono />
                {sale.monde_sale_number && (
                    <InfoField label="Viagem N°" value={sale.monde_sale_number} mono />
                )}
                {sale.monde_sale_id && (
                    <InfoField label="Monde ID" value={sale.monde_sale_id.substring(0, 8)} mono />
                )}
                {sale.travel_start_date && (
                    <InfoField label="Início Viagem" value={formatDateBR(sale.travel_start_date)} />
                )}
                {sale.travel_end_date && (
                    <InfoField label="Fim Viagem" value={formatDateBR(sale.travel_end_date)} />
                )}
            </div>

            {/* Payer */}
            {contato && (
                <>
                    <SectionHeader label="Pagante (Payer)" />
                    <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200 space-y-1.5 text-xs">
                        <p className="font-semibold text-slate-900">
                            {[contato.nome, contato.sobrenome].filter(Boolean).join(' ') || 'Não informado'}
                        </p>
                        <div className="grid grid-cols-1 gap-0.5 text-slate-600">
                            {contato.cpf && (
                                <p>CPF: <span className="font-medium text-slate-800">{formatCPF(contato.cpf)}</span></p>
                            )}
                            {contato.email && (
                                <p>Email: <span className="font-medium text-slate-800">{contato.email}</span></p>
                            )}
                            {contato.telefone && (
                                <p>Tel: <span className="font-medium text-slate-800">{contato.telefone}</span></p>
                            )}
                        </div>
                    </div>
                </>
            )}

            {/* Agent */}
            {agent && (
                <>
                    <SectionHeader label="Agente de Viagem" />
                    <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200 text-xs">
                        <p className="font-semibold text-slate-900">{agent.nome || 'Não informado'}</p>
                        {agent.email && <p className="text-slate-500 mt-0.5">{agent.email}</p>}
                    </div>
                </>
            )}

            {/* Travelers */}
            {travelers.length > 0 && (
                <>
                    <SectionHeader label={`Viajantes (${travelers.length})`} />
                    <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200 text-xs space-y-0.5">
                        {travelers.map((name, i) => (
                            <p key={i} className="text-slate-700">{name}</p>
                        ))}
                    </div>
                </>
            )}

            {/* Suppliers summary */}
            {suppliers.length > 0 && (
                <>
                    <SectionHeader label="Fornecedores" />
                    <p className="text-xs text-slate-700 -mt-1">{suppliers.join(', ')}</p>
                </>
            )}

            {/* Items */}
            {sale.items && sale.items.length > 0 && (
                <>
                    <SectionHeader label={`Produtos (${sale.items.length})`} />
                    <div className="space-y-2">
                        {sale.items.map((item, idx) => (
                            <SaleItemDetail key={item.id} item={item} sale={sale} index={idx} />
                        ))}
                    </div>
                </>
            )}

            {/* Totals */}
            <div className="pt-2 border-t border-gray-100 space-y-1">
                <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-gray-600">Total Monde</span>
                    <span className="text-sm font-semibold text-indigo-700">{formatBRL(sale.total_value)}</span>
                </div>
                {cardContext?.valor_final != null && (
                    <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-500">Valor Total (Faturamento)</span>
                        <span className="text-xs font-medium text-gray-700">{formatBRL(Number(cardContext.valor_final))}</span>
                    </div>
                )}
                {cardContext?.receita != null && (
                    <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-500">Receita (Margem)</span>
                        <span className="text-xs font-medium text-green-700">{formatBRL(Number(cardContext.receita))}</span>
                    </div>
                )}
            </div>
        </div>
    )
}

// ============================================
// Detail sub-components
// ============================================
function SectionHeader({ label }: { label: string }) {
    return <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{label}</p>
}

function InfoField({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
    return (
        <div>
            <span className="text-gray-400">{label}</span>
            <p className={cn('text-gray-900 font-medium', mono && 'font-mono text-[11px]')}>{value}</p>
        </div>
    )
}

// ============================================
// SaleItemDetail — Single item visual card
// ============================================
function SaleItemDetail({ item, sale, index }: { item: MondeSaleItem; sale: MondeSaleWithItems; index: number }) {
    const config = getItemTypeConfig(item.item_type)
    const Icon = config.icon
    const fields = getItemMondeFields(item, sale)

    return (
        <div className={cn('rounded-lg border p-2.5 space-y-1.5', config.bgColor)}>
            {/* Item header */}
            <div className="flex items-center gap-1.5">
                <Icon className={cn('w-3.5 h-3.5', config.color)} />
                <span className={cn('text-xs font-semibold', config.color)}>
                    {config.label}
                </span>
                <span className="text-[10px] text-gray-400 ml-auto">#{index + 1}</span>
            </div>

            {/* Item title */}
            <p className="text-xs text-gray-800 font-medium leading-tight truncate" title={item.title}>
                {item.title}
            </p>

            {/* Monde fields */}
            <div className="space-y-0.5">
                {fields.map((field, i) => (
                    <div key={i} className="flex items-baseline justify-between gap-2">
                        <span className="text-[10px] text-gray-500 shrink-0">{field.label}</span>
                        <span className="text-[11px] text-gray-800 font-medium text-right truncate" title={field.value}>
                            {field.value}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    )
}
