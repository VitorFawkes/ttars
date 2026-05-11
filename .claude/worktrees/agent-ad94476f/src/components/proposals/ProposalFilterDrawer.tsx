import { X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { PROPOSAL_STATUS_CONFIG } from '@/types/proposals'
import type { ProposalFilters } from '@/hooks/useProposals'
import type { ProposalStatus } from '@/types/proposals'
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'

interface ProposalFilterDrawerProps {
    isOpen: boolean
    onClose: () => void
    filters: ProposalFilters
    setFilters: (filters: ProposalFilters) => void
}

export function ProposalFilterDrawer({
    isOpen,
    onClose,
    filters,
    setFilters,
}: ProposalFilterDrawerProps) {
    const statusOptions = Object.entries(PROPOSAL_STATUS_CONFIG) as [ProposalStatus, typeof PROPOSAL_STATUS_CONFIG[ProposalStatus]][]

    const handleStatusToggle = (status: ProposalStatus) => {
        setFilters({
            ...filters,
            status: filters.status === status ? null : status,
        })
    }

    const handleClear = () => {
        setFilters({})
    }

    return (
        <Drawer open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DrawerContent className="max-w-md">
                <DrawerHeader className="border-b border-gray-100 pb-4">
                    <div className="flex items-center justify-between">
                        <DrawerTitle className="text-xl font-bold text-gray-900">
                            Filtros
                        </DrawerTitle>
                        <button
                            onClick={onClose}
                            className="p-2 hover:bg-gray-100 rounded-full"
                        >
                            <X className="h-5 w-5" />
                        </button>
                    </div>
                </DrawerHeader>

                <div className="p-6 space-y-6">
                    {/* Status Filter */}
                    <div>
                        <h3 className="text-sm font-semibold text-gray-900 mb-3">Status</h3>
                        <div className="grid grid-cols-2 gap-2">
                            {statusOptions.map(([status, config]) => (
                                <button
                                    key={status}
                                    onClick={() => handleStatusToggle(status)}
                                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-all text-sm ${filters.status === status
                                            ? 'border-primary bg-primary/5 text-primary'
                                            : 'border-gray-200 hover:border-gray-300 text-gray-700'
                                        }`}
                                >
                                    <span className={`w-2 h-2 rounded-full ${config.bgColor}`} />
                                    {config.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-3 pt-4 border-t border-gray-100">
                        <Button
                            variant="outline"
                            className="flex-1"
                            onClick={handleClear}
                        >
                            Limpar
                        </Button>
                        <Button
                            className="flex-1"
                            onClick={onClose}
                        >
                            Aplicar
                        </Button>
                    </div>
                </div>
            </DrawerContent>
        </Drawer>
    )
}
