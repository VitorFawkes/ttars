import { useState, useCallback, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Search, Plus, Filter } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '../components/ui/Button'
import { ErrorBoundary } from '../components/ui/ErrorBoundary'
import { usePeopleIntelligence, type Person } from '../hooks/usePeopleIntelligence'
import PeopleGrid from '../components/people/PeopleGrid'
import { PeopleFilterDrawer } from '../components/people/PeopleFilterDrawer'
import { PeopleActiveFilters } from '../components/people/PeopleActiveFilters'
import PersonDetailDrawer from '../components/people/PersonDetailDrawer'
import PeopleStatsBar from '../components/people/PeopleStatsBar'
import { Drawer, DrawerContent, DrawerHeader, DrawerBody, DrawerTitle } from '../components/ui/drawer'
import ContactForm from '../components/card/ContactForm'
import ContactImportModal from '../components/people/ContactImportModal'
import { DataQualityBanner } from '../components/people/DataQualityBanner'
import { DataQualityDrawer } from '../components/people/DataQualityDrawer'
import { useContactQuality } from '../hooks/useContactQuality'
import { supabase } from '../lib/supabase'
import { mergeContactData } from '../lib/contactMerge'
import MondeSearchSection from '../components/contacts/MondeSearchSection'

export default function People() {
    const {
        people,
        loading,
        totalCount,
        page,
        setPage,
        filters,
        setFilters,
        sort,
        setSort,
        summaryStats,
        refresh
    } = usePeopleIntelligence()

    const [isFilterDrawerOpen, setIsFilterDrawerOpen] = useState(false)
    const [isNewPersonDrawerOpen, setIsNewPersonDrawerOpen] = useState(false)
    const [isImportModalOpen, setIsImportModalOpen] = useState(false)
    const [isQualityDrawerOpen, setIsQualityDrawerOpen] = useState(false)
    const [selectedPerson, setSelectedPerson] = useState<Person | null>(null)
    const quality = useContactQuality()
    const [searchParams, setSearchParams] = useSearchParams()

    // Deep-link: ?contactId=xxx abre o drawer do contato automaticamente
    useEffect(() => {
        const contactId = searchParams.get('contactId')
        if (!contactId) return
        supabase
            .from('contatos')
            .select('*')
            .eq('id', contactId)
            .single()
            .then(({ data }) => {
                if (data) setSelectedPerson(data as unknown as Person)
                setSearchParams({}, { replace: true })
            })
    }, [searchParams, setSearchParams])

    const handleCreateSuccess = () => {
        setIsNewPersonDrawerOpen(false)
        refresh()
    }

    const handleSelectExisting = useCallback(async (contactId: string, mergeData?: Record<string, string | null>) => {
        // 1. Se tem dados novos para mesclar, faz update no contato existente
        if (mergeData && Object.keys(mergeData).length > 0) {
            try {
                await mergeContactData(contactId, mergeData)
                toast.success('Dados mesclados ao contato existente')
            } catch (err) {
                console.error('Error merging contact data:', err)
                toast.error('Erro ao mesclar dados')
            }
        }

        // 2. Fechar drawer de criação
        setIsNewPersonDrawerOpen(false)

        // 3. Buscar contato existente para abrir no drawer
        const { data: existingContact } = await supabase
            .from('contatos')
            .select('*')
            .eq('id', contactId)
            .single()

        if (existingContact) {
            setSelectedPerson(existingContact as unknown as Person)
        }

        // 4. Refresh lista
        refresh()
    }, [refresh])

    return (
        <ErrorBoundary>
            <div className="flex h-full flex-col relative overflow-hidden bg-gray-50/50">
                {/* Header Section */}
                <div className="flex-shrink-0 pt-6 pb-4 px-8 bg-white/50 backdrop-blur-sm border-b border-gray-200/50 z-10">
                    <header className="flex items-center justify-between mb-6">
                        <div>
                            <h1 className="text-3xl font-semibold text-gray-900 tracking-tight">Contatos</h1>
                            <p className="mt-1 text-sm text-gray-500">Gerencie seus contatos e visualize inteligência de dados.</p>
                        </div>
                        <div className="flex items-center space-x-4">
                            <Button
                                onClick={() => setIsImportModalOpen(true)}
                                variant="outline"
                                className="bg-white hover:bg-gray-50 text-gray-700 border-gray-200"
                            >
                                <Filter className="h-4 w-4 mr-2" />
                                Importar
                            </Button>
                            <Button
                                onClick={() => setIsNewPersonDrawerOpen(true)}
                                className="bg-primary hover:bg-primary-dark text-white shadow-lg shadow-primary/20"
                            >
                                <Plus className="h-5 w-5 mr-2" />
                                Novo Contato
                            </Button>
                        </div>
                    </header>

                    {/* Stats Bar */}
                    <div className="mb-6">
                        <PeopleStatsBar
                            totalPeople={summaryStats.totalPeople}
                            totalSpend={summaryStats.totalSpend}
                            totalTrips={summaryStats.totalTrips}
                            totalLeaders={summaryStats.totalLeaders}
                        />
                    </div>

                    {/* Data Quality Banner */}
                    {!quality.isDismissed && (
                        <div className="mb-6">
                            <DataQualityBanner
                                fixableIssues={quality.fixableIssueCount}
                                isLoading={quality.isLoading}
                                onReview={() => setIsQualityDrawerOpen(true)}
                                onDismiss={quality.dismiss}
                            />
                        </div>
                    )}

                    <div className="flex items-center justify-between gap-4">
                        {/* Search Input */}
                        <div className="relative flex-1 max-w-md">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                            <input
                                type="text"
                                placeholder="Buscar por nome, email ou CPF..."
                                className="w-full pl-10 h-10 rounded-lg border-slate-200 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 bg-white shadow-sm outline-none transition-all"
                                value={filters.search}
                                onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                            />
                        </div>

                        {/* Active Filters */}
                        <div className="flex-1 px-4 min-w-0">
                            <PeopleActiveFilters filters={filters} setFilters={setFilters} />
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
                </div>

                {/* Main Content */}
                <div className="flex-1 min-h-0 relative px-8 pb-4 overflow-y-auto">
                    <PeopleGrid
                        people={people}
                        loading={loading}
                        sort={sort}
                        setSort={setSort}
                        onPersonClick={setSelectedPerson}
                    />

                    {/* Monde search — when no CRM results and user is searching */}
                    {!loading && people.length === 0 && filters.search && filters.search.length >= 2 && (
                        <div className="max-w-md mx-auto -mt-16">
                            <MondeSearchSection
                                searchTerm={filters.search}
                                onPersonImported={async (contatoId) => {
                                    const { data } = await supabase
                                        .from('contatos')
                                        .select('*')
                                        .eq('id', contatoId)
                                        .single()
                                    if (data) setSelectedPerson(data as unknown as Person)
                                    refresh()
                                }}
                            />
                        </div>
                    )}

                    {/* Pagination Footer */}
                    {!loading && totalCount > 0 && (
                        <div className="flex items-center justify-between py-6 mt-4 border-t border-gray-100">
                            <p className="text-sm text-gray-500">
                                Mostrando <span className="font-medium text-gray-900">{people.length}</span> de <span className="font-medium text-gray-900">{totalCount}</span> contatos
                            </p>
                            <div className="flex items-center gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setPage(page - 1)}
                                    disabled={page === 0}
                                    className="h-8 px-3"
                                >
                                    Anterior
                                </Button>
                                <div className="flex items-center gap-1.5 px-2">
                                    <span className="text-sm font-medium text-gray-900">{page + 1}</span>
                                    <span className="text-xs text-gray-400">/</span>
                                    <span className="text-xs text-gray-400 font-medium">{Math.ceil(totalCount / 50)}</span>
                                </div>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setPage(page + 1)}
                                    disabled={(page + 1) * 50 >= totalCount}
                                    className="h-8 px-3"
                                >
                                    Próximo
                                </Button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Drawers */}
                <PeopleFilterDrawer
                    isOpen={isFilterDrawerOpen}
                    onClose={() => setIsFilterDrawerOpen(false)}
                    filters={filters}
                    setFilters={setFilters}
                />

                <PersonDetailDrawer
                    person={selectedPerson}
                    onClose={() => setSelectedPerson(null)}
                    onRefresh={refresh}
                />

                <Drawer open={isNewPersonDrawerOpen} onOpenChange={setIsNewPersonDrawerOpen}>
                    <DrawerContent className="max-w-2xl">
                        <DrawerHeader className="border-b border-gray-100 pb-4">
                            <DrawerTitle className="text-2xl font-bold text-gray-900">
                                Novo Contato
                            </DrawerTitle>
                        </DrawerHeader>
                        <DrawerBody>
                            <ContactForm
                                onSave={handleCreateSuccess}
                                onCancel={() => setIsNewPersonDrawerOpen(false)}
                                onSelectExisting={handleSelectExisting}
                            />
                        </DrawerBody>
                    </DrawerContent>
                </Drawer>

                <ContactImportModal
                    isOpen={isImportModalOpen}
                    onClose={() => setIsImportModalOpen(false)}
                    onSuccess={refresh}
                />

                <DataQualityDrawer
                    isOpen={isQualityDrawerOpen}
                    onClose={() => setIsQualityDrawerOpen(false)}
                    quality={quality}
                    onApplied={refresh}
                />
            </div>
        </ErrorBoundary>
    )
}
