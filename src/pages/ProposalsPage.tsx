import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Plus, Filter, FileText, Library, Layout, RotateCcw, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'
import { useProposals, useProposalStats, type ProposalFilters } from '@/hooks/useProposals'
import { ProposalStatsBar } from '@/components/proposals/ProposalStatsBar'
import { ProposalGrid } from '@/components/proposals/ProposalGrid'
import { ProposalFilterDrawer } from '@/components/proposals/ProposalFilterDrawer'
import { ProposalActiveFilters } from '@/components/proposals/ProposalActiveFilters'
import { LibraryManager } from '@/components/proposals/LibraryManager'
import { TemplateManager } from '@/components/proposals/TemplateManager'
import { seedProposals } from '@/utils/seedProposals'
import { seedLibraryItems } from '@/utils/seedLibraryItems'
import { seedTemplates } from '@/utils/seedTemplates'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import type { ProposalStatus } from '@/types/proposals'
import { cn } from '@/lib/utils'

type TabType = 'proposals' | 'library' | 'templates'

export default function ProposalsPage() {
    const navigate = useNavigate()
    const [activeTab, setActiveTab] = useState<TabType>('proposals')
    const [filters, setFilters] = useState<ProposalFilters>({})
    const [isFilterDrawerOpen, setIsFilterDrawerOpen] = useState(false)
    const [isSeeding, setIsSeeding] = useState(false)
    const queryClient = useQueryClient()

    const { data: proposals, isLoading, error, isError } = useProposals(filters)
    const { data: stats } = useProposalStats()

    // DEBUG: Log what we're getting from the hook
    console.log('[ProposalsPage] Hook state:', {
        proposals,
        proposalsLength: proposals?.length,
        isLoading,
        isError,
        error: error?.message,
        stats
    })

    const handleSeedAll = async () => {
        setIsSeeding(true)
        console.log('[ProposalsPage] Starting seed all...')

        try {
            console.log('[Seed] Step 1: Templates...')
            await seedTemplates()

            console.log('[Seed] Step 2: Library Items...')
            await seedLibraryItems()

            console.log('[Seed] Step 3: Proposals...')
            await seedProposals()

            console.log('[Seed] Step 4: Invalidating queries...')
            queryClient.invalidateQueries({ queryKey: ['proposals'] })
            queryClient.invalidateQueries({ queryKey: ['proposal-templates'] })
            queryClient.invalidateQueries({ queryKey: ['library'] })
            queryClient.invalidateQueries({ queryKey: ['proposals', 'stats'] })

            console.log('[Seed] Complete!')
            toast.success('Dados de exemplo carregados!')
        } catch (error) {
            console.error('[Seed] Error:', error)
            toast.error('Erro ao carregar dados de exemplo')
        } finally {
            setIsSeeding(false)
        }
    }

    const handleStatusFilter = (status: ProposalStatus | null) => {
        setFilters(prev => ({ ...prev, status }))
    }

    const tabs = [
        { id: 'proposals' as TabType, label: 'Propostas', icon: FileText, count: stats?.total },
        { id: 'library' as TabType, label: 'Biblioteca', icon: Library },
        { id: 'templates' as TabType, label: 'Templates', icon: Layout },
    ]

    return (
        <ErrorBoundary>
            <div className="flex h-full flex-col relative overflow-hidden bg-gray-50/50">
                {/* Header Section */}
                <div className="flex-shrink-0 pt-6 pb-4 px-8 bg-white border-b border-gray-200 z-10">
                    <header className="flex items-center justify-between mb-6">
                        <div>
                            <h1 className="text-3xl font-semibold text-gray-900 tracking-tight">Propostas</h1>
                            <p className="mt-1 text-sm text-gray-500">Gerencie propostas, biblioteca de itens e templates.</p>
                        </div>
                        <div className="flex items-center space-x-3">
                            <Button
                                variant="outline"
                                onClick={handleSeedAll}
                                disabled={isSeeding}
                                title="Carregar propostas, templates e biblioteca de exemplo"
                            >
                                {isSeeding ? (
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                ) : (
                                    <RotateCcw className="h-4 w-4 mr-2" />
                                )}
                                Carregar Exemplos
                            </Button>
                            {activeTab === 'proposals' && (
                                <Button
                                    onClick={() => navigate('/pipeline')}
                                    title="Propostas são criadas a partir de um Card no Funil"
                                    className="bg-primary hover:bg-primary-dark text-white shadow-lg shadow-primary/20"
                                >
                                    <Plus className="h-5 w-5 mr-2" />
                                    Nova Proposta
                                </Button>
                            )}
                        </div>
                    </header>

                    {/* Tabs */}
                    <div className="flex items-center gap-1 mb-6 bg-slate-100 rounded-lg p-1 w-fit">
                        {tabs.map(tab => {
                            const Icon = tab.icon
                            return (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id)}
                                    className={cn(
                                        'flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all duration-200',
                                        activeTab === tab.id
                                            ? 'bg-white text-slate-900 shadow-sm'
                                            : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                                    )}
                                >
                                    <Icon className="h-4 w-4" />
                                    {tab.label}
                                    {tab.count !== undefined && (
                                        <span className={cn(
                                            'text-xs px-1.5 py-0.5 rounded-full',
                                            activeTab === tab.id
                                                ? 'bg-blue-100 text-blue-700'
                                                : 'bg-slate-200 text-slate-600'
                                        )}>
                                            {tab.count}
                                        </span>
                                    )}
                                </button>
                            )
                        })}
                    </div>

                    {/* Proposals Tab Controls */}
                    {activeTab === 'proposals' && (
                        <>
                            {/* Stats Bar */}
                            <div className="mb-6">
                                <ProposalStatsBar
                                    total={stats?.total || 0}
                                    sent={stats?.sent || 0}
                                    accepted={stats?.accepted || 0}
                                    conversionRate={stats?.conversionRate || 0}
                                    onStatusClick={handleStatusFilter}
                                    activeStatus={filters.status || null}
                                />
                            </div>

                            <div className="flex items-center justify-between gap-4">
                                {/* Search Input */}
                                <div className="relative flex-1 max-w-md">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                                    <input
                                        type="text"
                                        placeholder="Buscar por título ou card..."
                                        className="w-full pl-10 h-10 rounded-lg border-slate-200 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 bg-white shadow-sm outline-none transition-all"
                                        value={filters.search || ''}
                                        onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                                    />
                                </div>

                                {/* Active Filters */}
                                <div className="flex-1 px-4 min-w-0">
                                    <ProposalActiveFilters filters={filters} setFilters={setFilters} />
                                </div>

                                {/* Filter Button */}
                                <button
                                    onClick={() => setIsFilterDrawerOpen(true)}
                                    className="flex items-center px-3 py-2 text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 border border-gray-200 rounded-lg shadow-sm transition-all"
                                >
                                    <Filter className="h-4 w-4 mr-2 text-gray-500" />
                                    Filtros
                                </button>
                            </div>
                        </>
                    )}
                </div>

                {/* Main Content */}
                <div className="flex-1 min-h-0 relative px-8 pb-4 overflow-y-auto">
                    {activeTab === 'proposals' && (
                        <ProposalGrid
                            proposals={proposals || []}
                            loading={isLoading}
                            hasFilters={!!(filters.status || filters.search || filters.createdBy)}
                            onClearFilters={() => setFilters({})}
                        />
                    )}

                    {activeTab === 'library' && (
                        <LibraryManager />
                    )}

                    {activeTab === 'templates' && (
                        <div className="py-6">
                            <TemplateManager />
                        </div>
                    )}
                </div>

                {/* Filter Drawer */}
                <ProposalFilterDrawer
                    isOpen={isFilterDrawerOpen}
                    onClose={() => setIsFilterDrawerOpen(false)}
                    filters={filters}
                    setFilters={setFilters}
                />
            </div>
        </ErrorBoundary>
    )
}
