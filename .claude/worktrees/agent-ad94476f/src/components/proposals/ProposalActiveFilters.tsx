import { X } from 'lucide-react'
import { PROPOSAL_STATUS_CONFIG } from '@/types/proposals'
import type { ProposalFilters } from '@/hooks/useProposals'

interface ProposalActiveFiltersProps {
    filters: ProposalFilters
    setFilters: (filters: ProposalFilters) => void
}

export function ProposalActiveFilters({ filters, setFilters }: ProposalActiveFiltersProps) {
    const activeFilters: { key: string; label: string; onRemove: () => void }[] = []

    if (filters.status) {
        const config = PROPOSAL_STATUS_CONFIG[filters.status]
        activeFilters.push({
            key: 'status',
            label: `Status: ${config.label}`,
            onRemove: () => setFilters({ ...filters, status: null }),
        })
    }

    if (filters.search) {
        activeFilters.push({
            key: 'search',
            label: `Busca: "${filters.search}"`,
            onRemove: () => setFilters({ ...filters, search: '' }),
        })
    }

    if (activeFilters.length === 0) return null

    return (
        <div className="flex items-center gap-2 overflow-x-auto">
            {activeFilters.map((filter) => (
                <span
                    key={filter.key}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium whitespace-nowrap"
                >
                    {filter.label}
                    <button
                        onClick={filter.onRemove}
                        className="p-0.5 hover:bg-primary/20 rounded-full"
                    >
                        <X className="h-3 w-3" />
                    </button>
                </span>
            ))}

            {activeFilters.length > 0 && (
                <button
                    onClick={() => setFilters({})}
                    className="text-xs text-gray-500 hover:text-gray-700 whitespace-nowrap"
                >
                    Limpar todos
                </button>
            )}
        </div>
    )
}
