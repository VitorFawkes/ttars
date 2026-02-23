import { useState } from 'react'
import { Database, UploadCloud, AlertTriangle, RefreshCw } from 'lucide-react'
import { useLeadsFilters } from '../hooks/useLeadsFilters'
import { useLeadsQuery } from '../hooks/useLeadsQuery'
import { useLeadsColumns } from '../hooks/useLeadsColumns'
import LeadsFilters from '../components/leads/LeadsFilters'
import LeadsTable from '../components/leads/LeadsTable'
import LeadsBulkActions from '../components/leads/LeadsBulkActions'
import LeadsExport from '../components/leads/LeadsExport'
import LeadsPagination from '../components/leads/LeadsPagination'
import LeadsStatsBar from '../components/leads/LeadsStatsBar'
import { ColumnManager } from '../components/ui/data-grid/ColumnManager'
import DealImportModal from '../components/kanban/DealImportModal'

export default function Leads() {
    const { filters, setPage, setPageSize } = useLeadsFilters()
    const { data: queryResult, isLoading, isError, refetch } = useLeadsQuery({ filters })
    const { columns, setColumns } = useLeadsColumns()
    const [selectedIds, setSelectedIds] = useState<string[]>([])
    const [isImportModalOpen, setIsImportModalOpen] = useState(false)

    const leads = queryResult?.data || []
    const total = queryResult?.total || 0
    const totalPages = queryResult?.totalPages || 1

    const handleSelectAll = (checked: boolean) => {
        if (checked && leads) {
            setSelectedIds(leads.map(l => l.id!))
        } else {
            setSelectedIds([])
        }
    }

    const handleSelectRow = (id: string, checked: boolean) => {
        if (checked) {
            setSelectedIds(prev => [...prev, id])
        } else {
            setSelectedIds(prev => prev.filter(i => i !== id))
        }
    }

    const handleClearSelection = () => {
        setSelectedIds([])
    }

    return (
        <div className="flex flex-col h-full bg-gray-50">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-gray-200">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-primary/10 rounded-lg">
                        <Database className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold text-gray-900">Gestão de Leads</h1>
                        <p className="text-sm text-gray-500">
                            {isLoading ? 'Carregando...' : isError ? 'Erro ao carregar dados' : `${total} leads encontrados`}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <ColumnManager
                        columns={columns}
                        onChange={setColumns}
                    />
                    <button
                        onClick={() => setIsImportModalOpen(true)}
                        className="flex items-center px-4 py-2 text-sm font-medium text-slate-700 bg-white hover:bg-slate-50 border border-gray-200 rounded-lg shadow-sm transition-all"
                    >
                        <UploadCloud className="h-4 w-4 mr-1.5" />
                        Importar
                    </button>
                    <LeadsExport leads={leads} selectedIds={selectedIds.length > 0 ? selectedIds : undefined} />
                </div>
            </div>

            {/* Stats Bar */}
            {leads.length > 0 && (
                <LeadsStatsBar leads={leads} />
            )}

            {/* Filters */}
            <LeadsFilters />

            {/* Bulk Actions Bar */}
            {selectedIds.length > 0 && (
                <div className="px-6 py-3 bg-gray-50 border-b border-gray-200">
                    <LeadsBulkActions
                        selectedIds={selectedIds}
                        onClearSelection={handleClearSelection}
                    />
                </div>
            )}

            {/* Table */}
            <div className="flex-1 overflow-auto p-6">
                {isError ? (
                    <div className="flex flex-col items-center justify-center py-16 text-center">
                        <div className="rounded-full bg-amber-100 p-3 mb-4">
                            <AlertTriangle className="h-6 w-6 text-amber-600" />
                        </div>
                        <h3 className="text-base font-semibold text-slate-900">Não foi possível carregar os leads</h3>
                        <p className="text-sm text-slate-500 mt-1 max-w-sm">
                            Verifique sua conexão e tente novamente. Se o problema persistir, os servidores podem estar temporariamente indisponíveis.
                        </p>
                        <button
                            onClick={() => refetch()}
                            className="mt-4 inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors"
                        >
                            <RefreshCw className="h-4 w-4" />
                            Tentar novamente
                        </button>
                    </div>
                ) : (
                    <LeadsTable
                        leads={leads}
                        selectedIds={selectedIds}
                        onSelectAll={handleSelectAll}
                        onSelectRow={handleSelectRow}
                        isLoading={isLoading}
                    />
                )}
            </div>

            {/* Pagination */}
            {total > 0 && (
                <LeadsPagination
                    page={filters.page}
                    pageSize={filters.pageSize}
                    total={total}
                    totalPages={totalPages}
                    onPageChange={setPage}
                    onPageSizeChange={setPageSize}
                />
            )}

            <DealImportModal
                isOpen={isImportModalOpen}
                onClose={() => setIsImportModalOpen(false)}
                currentProduct={'TRIPS'}
                onSuccess={() => {
                    window.location.reload()
                }}
            />
        </div>
    )
}
