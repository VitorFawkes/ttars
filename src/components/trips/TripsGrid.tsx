import { useState } from 'react'
import { format } from 'date-fns'
import { ArrowUpDown, Calendar, MapPin, User as UserIcon, Plane, Trash2, Download, CheckSquare } from 'lucide-react'
import { useTrips } from '../../hooks/useTrips'
import { useReceitaPermission } from '../../hooks/useReceitaPermission'
import { useTripsFilters, type TripsFilterState } from '../../hooks/useTripsFilters'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/Table'
import { Badge } from '../ui/Badge'
import { Avatar, AvatarFallback } from '../ui/avatar'
import { Checkbox } from '../ui/checkbox'
import { cn } from '../../lib/utils'
import { ColumnToggle } from '../ui/data-grid/ColumnToggle'
import { BulkActions } from '../ui/data-grid/BulkActions'
import { BulkEditModal, type BulkEditField } from '../ui/data-grid/BulkEditModal'
import { useArchiveCard } from '../../hooks/useArchiveCard'
import DeleteCardModal from '../card/DeleteCardModal'
import { supabase } from '../../lib/supabase'
import { toast } from 'sonner'

interface TripsGridProps {
    onCardClick?: (cardId: string) => void
}

export default function TripsGrid({ onCardClick }: TripsGridProps) {
    const { filters, setFilters } = useTripsFilters()
    const { data: trips, isLoading, isError, refetch } = useTrips()
    const receitaPerm = useReceitaPermission()

    // --- State ---
    const [selectedTrips, setSelectedTrips] = useState<string[]>([])
    const [visibleColumns, setVisibleColumns] = useState({
        select: true,
        trip_client: true,
        status: true,
        boarding_date: true,
        destinations: true,
        value: true,
        receita: true,
        concierge: true
    })
    const [showDeleteModal, setShowDeleteModal] = useState(false)
    const [showEditModal, setShowEditModal] = useState(false)
    const { archive, isArchiving } = useArchiveCard()

    // --- Handlers ---
    const handleSort = (field: TripsFilterState['sortBy']) => {
        if (filters.sortBy === field) {
            setFilters({
                ...filters,
                sortDirection: filters.sortDirection === 'asc' ? 'desc' : 'asc'
            })
        } else {
            setFilters({
                ...filters,
                sortBy: field,
                sortDirection: 'asc'
            })
        }
    }

    const handleSelectAll = (checked: boolean) => {
        if (checked && trips) {
            setSelectedTrips(trips.map(t => t.id!))
        } else {
            setSelectedTrips([])
        }
    }

    const handleSelectRow = (tripId: string, checked: boolean) => {
        if (checked) {
            setSelectedTrips(prev => [...prev, tripId])
        } else {
            setSelectedTrips(prev => prev.filter(id => id !== tripId))
        }
    }

    const handleColumnToggle = (columnId: string, isVisible: boolean) => {
        setVisibleColumns(prev => ({ ...prev, [columnId]: isVisible }))
    }

    const handleBulkDelete = () => {
        setShowDeleteModal(true)
    }

    const confirmBulkDelete = async () => {
        for (const id of selectedTrips) {
            await archive(id)
        }
        setSelectedTrips([])
        setShowDeleteModal(false)
        refetch()
    }

    const handleBulkExport = () => {
        if (!trips) return

        const selectedData = trips.filter(t => selectedTrips.includes(t.id!))
        const headers = ['ID', 'Título', 'Cliente', 'Status', 'Data Embarque', 'Destinos', 'Valor']
        if (receitaPerm.canView) headers.push('Receita')
        const csvContent = [
            headers,
            ...selectedData.map(t => {
                const row = [
                    t.id,
                    t.titulo,
                    t.pessoa_nome,
                    t.estado_operacional,
                    t.data_viagem_inicio,
                    Array.isArray(t.destinos) ? t.destinos.join(';') : '',
                    t.valor_display || t.valor_estimado
                ]
                if (receitaPerm.canView) row.push(t.receita)
                return row
            })
        ].map(e => e.join(',')).join('\n')

        const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' })
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.setAttribute('href', url)
        link.setAttribute('download', `viagens_export_${new Date().toISOString()}.csv`)
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)

        toast.success(`${selectedData.length} viagens exportadas com sucesso!`)
    }

    const handleBulkEdit = async (fieldId: string, value: unknown) => {
        try {
            const updates: Record<string, unknown> = {}

            if (fieldId === 'estado_operacional') {
                updates.estado_operacional = value
            } else if (fieldId === 'data_viagem_inicio') {
                updates.data_viagem_inicio = value
            }

            // Perform update
            const { error } = await supabase
                .from('cards')
                .update(updates)
                .in('id', selectedTrips)

            if (error) throw error

            toast.success(`${selectedTrips.length} viagens atualizadas com sucesso!`)
            setSelectedTrips([])
            refetch()
        } catch (error) {
            console.error('Error updating trips:', error)
            toast.error('Erro ao atualizar viagens.')
        }
    }

    const handleBulkStatusUpdate = async () => {
        // Placeholder for status update logic - could open a modal
        toast.info("Funcionalidade de atualização em massa em breve!")
    }

    const SortIcon = ({ field }: { field: TripsFilterState['sortBy'] }) => {
        if (filters.sortBy !== field) return <ArrowUpDown className="ml-2 h-4 w-4 text-gray-400 opacity-0 group-hover:opacity-50" />
        return <ArrowUpDown className={cn("ml-2 h-4 w-4 text-primary", filters.sortDirection === 'asc' ? "" : "rotate-180")} />
    }

    if (isLoading) {
        return (
            <div className="w-full h-full flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
        )
    }

    if (isError) {
        return (
            <div className="w-full h-full flex items-center justify-center text-red-500">
                Erro ao carregar viagens.
            </div>
        )
    }

    if (!trips || trips.length === 0) {
        return (
            <div className="w-full h-full flex flex-col items-center justify-center text-gray-500">
                <Plane className="h-12 w-12 text-gray-300 mb-4" />
                <p>Nenhuma viagem encontrada.</p>
            </div>
        )
    }

    const columnsConfig = [
        { id: 'trip_client', label: 'Viagem / Cliente', isVisible: visibleColumns.trip_client },
        { id: 'status', label: 'Status Operacional', isVisible: visibleColumns.status },
        { id: 'boarding_date', label: 'Data Embarque', isVisible: visibleColumns.boarding_date },
        { id: 'destinations', label: 'Destinos', isVisible: visibleColumns.destinations },
        { id: 'value', label: 'Valor Total', isVisible: visibleColumns.value },
        ...(receitaPerm.canView ? [{ id: 'receita', label: 'Receita', isVisible: visibleColumns.receita }] : []),
        { id: 'concierge', label: 'Concierge', isVisible: visibleColumns.concierge },
    ]

    const bulkEditFields: BulkEditField[] = [
        {
            id: 'estado_operacional',
            label: 'Status Operacional',
            type: 'select',
            options: [
                { label: 'Planejamento', value: 'planejamento' },
                { label: 'Emissão', value: 'emissao' },
                { label: 'Pré-Embarque', value: 'pre_embarque' },
                { label: 'Em Viagem', value: 'em_viagem' },
                { label: 'Finalizado', value: 'finalizado' },
                { label: 'Cancelado', value: 'cancelado' }
            ]
        },
        { id: 'data_viagem_inicio', label: 'Data de Embarque', type: 'date' }
    ]

    return (
        <div className="h-full flex flex-col gap-4">
            {/* Toolbar */}
            <div className="flex items-center justify-between px-1 flex-shrink-0">
                <div className="flex items-center gap-2 h-9">
                    <BulkActions
                        selectedCount={selectedTrips.length}
                        onClearSelection={() => setSelectedTrips([])}
                        actions={[
                            {
                                label: 'Exportar CSV',
                                icon: Download,
                                onClick: handleBulkExport,
                                variant: 'outline'
                            },
                            {
                                label: 'Alterar Status',
                                icon: CheckSquare,
                                onClick: handleBulkStatusUpdate,
                                variant: 'outline'
                            },
                            {
                                label: 'Excluir',
                                icon: Trash2,
                                onClick: handleBulkDelete,
                                variant: 'destructive'
                            }
                        ]}
                    />
                </div>
                <ColumnToggle
                    columns={columnsConfig}
                    onToggle={handleColumnToggle}
                />
            </div>

            <div className="flex-1 overflow-auto bg-white rounded-lg border border-gray-200 shadow-sm">
                <Table>
                    <TableHeader className="sticky top-0 bg-gray-50 z-10">
                        <TableRow>
                            <TableHead className="w-[40px] px-4">
                                <Checkbox
                                    checked={trips && trips.length > 0 && selectedTrips.length === trips.length}
                                    onCheckedChange={(checked) => handleSelectAll(checked as boolean)}
                                />
                            </TableHead>

                            {visibleColumns.trip_client && (
                                <TableHead
                                    className="w-[300px] cursor-pointer group hover:bg-gray-100 transition-colors"
                                    onClick={() => handleSort('created_at')} // Proxy for title/deal
                                >
                                    <div className="flex items-center">
                                        Viagem / Cliente
                                        <SortIcon field="created_at" />
                                    </div>
                                </TableHead>
                            )}

                            {visibleColumns.status && (
                                <TableHead className="w-[150px]">Status Operacional</TableHead>
                            )}

                            {visibleColumns.boarding_date && (
                                <TableHead
                                    className="w-[150px] cursor-pointer group hover:bg-gray-100 transition-colors"
                                    onClick={() => handleSort('data_viagem_inicio')}
                                >
                                    <div className="flex items-center">
                                        Data Embarque
                                        <SortIcon field="data_viagem_inicio" />
                                    </div>
                                </TableHead>
                            )}

                            {visibleColumns.destinations && (
                                <TableHead className="w-[200px]">Destinos</TableHead>
                            )}

                            {visibleColumns.value && (
                                <TableHead
                                    className="w-[150px] cursor-pointer group hover:bg-gray-100 transition-colors text-right"
                                    onClick={() => handleSort('valor_display')}
                                >
                                    <div className="flex items-center justify-end">
                                        Valor Total
                                        <SortIcon field="valor_display" />
                                    </div>
                                </TableHead>
                            )}

                            {receitaPerm.canView && visibleColumns.receita && (
                                <TableHead className="w-[120px] text-right">Receita</TableHead>
                            )}

                            {visibleColumns.concierge && (
                                <TableHead className="w-[150px]">Concierge</TableHead>
                            )}
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {trips.map((trip) => (
                            <TableRow
                                key={trip.id}
                                className="cursor-pointer hover:bg-blue-50/50 transition-colors"
                                onClick={(e) => {
                                    // Prevent navigation if clicking checkbox
                                    if ((e.target as HTMLElement).closest('[role="checkbox"]')) return
                                    onCardClick?.(trip.id!)
                                }}
                            >
                                <TableCell className="px-4">
                                    <Checkbox
                                        checked={selectedTrips.includes(trip.id!)}
                                        onCheckedChange={(checked) => handleSelectRow(trip.id!, checked as boolean)}
                                        onClick={(e) => e.stopPropagation()}
                                    />
                                </TableCell>

                                {visibleColumns.trip_client && (
                                    <TableCell className="font-medium">
                                        <div className="flex flex-col">
                                            <span className="text-gray-900 font-semibold">{trip.titulo}</span>
                                            {trip.pessoa_nome && (
                                                <span className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                                                    <UserIcon className="h-3 w-3" />
                                                    {trip.pessoa_nome}
                                                </span>
                                            )}
                                        </div>
                                    </TableCell>
                                )}

                                {visibleColumns.status && (
                                    <TableCell>
                                        <Badge variant="outline" className={cn(
                                            "whitespace-nowrap capitalize",
                                            trip.estado_operacional === 'planejamento' ? "bg-blue-50 text-blue-700 border-blue-200" : "bg-gray-50 text-gray-600"
                                        )}>
                                            {trip.estado_operacional || 'Não iniciado'}
                                        </Badge>
                                    </TableCell>
                                )}

                                {visibleColumns.boarding_date && (
                                    <TableCell>
                                        {trip.data_viagem_inicio ? (
                                            <div className="flex items-center gap-1.5 text-gray-700 font-medium">
                                                <Calendar className="h-3.5 w-3.5 text-gray-400" />
                                                <span>{format(new Date(trip.data_viagem_inicio), "dd/MM/yy")}</span>
                                            </div>
                                        ) : '-'}
                                    </TableCell>
                                )}

                                {visibleColumns.destinations && (
                                    <TableCell>
                                        {trip.destinos && Array.isArray(trip.destinos) && trip.destinos.length > 0 ? (
                                            <div className="flex items-center gap-1.5 text-gray-600 text-sm">
                                                <MapPin className="h-3.5 w-3.5 text-gray-400" />
                                                <span className="truncate max-w-[180px]">{trip.destinos.join(', ')}</span>
                                            </div>
                                        ) : '-'}
                                    </TableCell>
                                )}

                                {visibleColumns.value && (
                                    <TableCell className="text-right font-mono text-gray-700">
                                        {(trip.valor_display || trip.valor_estimado)
                                            ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(trip.valor_display || trip.valor_estimado || 0)
                                            : '-'
                                        }
                                    </TableCell>
                                )}

                                {receitaPerm.canView && visibleColumns.receita && (
                                    <TableCell className="text-right font-mono text-amber-700">
                                        {trip.receita
                                            ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(trip.receita)
                                            : '-'
                                        }
                                    </TableCell>
                                )}

                                {visibleColumns.concierge && (
                                    <TableCell>
                                        {trip.concierge_nome ? (
                                            <div className="flex items-center gap-2">
                                                <Avatar className="h-6 w-6">
                                                    <AvatarFallback className="text-[10px] bg-purple-100 text-purple-700">
                                                        {trip.concierge_nome.substring(0, 2).toUpperCase()}
                                                    </AvatarFallback>
                                                </Avatar>
                                                <span className="text-sm text-gray-600 truncate max-w-[100px]">
                                                    {trip.concierge_nome.split(' ')[0]}
                                                </span>
                                            </div>
                                        ) : (
                                            <span className="text-sm text-gray-400">-</span>
                                        )}
                                    </TableCell>
                                )}
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>

            <DeleteCardModal
                isOpen={showDeleteModal}
                onClose={() => setShowDeleteModal(false)}
                onConfirm={confirmBulkDelete}
                isLoading={isArchiving}
                cardTitle={`${selectedTrips.length} viagens selecionadas`}
            />

            <BulkEditModal
                isOpen={showEditModal}
                onClose={() => setShowEditModal(false)}
                onConfirm={handleBulkEdit}
                selectedCount={selectedTrips.length}
                fields={bulkEditFields}
            />
        </div>
    )
}
