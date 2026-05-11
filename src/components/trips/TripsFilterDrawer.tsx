import { X } from 'lucide-react'
import { useTripsFilters } from '../../hooks/useTripsFilters'
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '../ui/drawer'
import { Button } from '../ui/Button'
import { Label } from '../ui/label'
import { Input } from '../ui/Input'
import { Checkbox } from '../ui/checkbox'

interface TripsFilterDrawerProps {
    isOpen: boolean
    onClose: () => void
}

const OPERATIONAL_STATUSES = [
    { id: 'planejamento', label: 'Planejamento' },
    { id: 'reservado', label: 'Reservado' },
    { id: 'emitido', label: 'Emitido' },
    { id: 'em_viagem', label: 'Em Viagem' },
    { id: 'finalizado', label: 'Finalizado' },
    { id: 'cancelado', label: 'Cancelado' }
]

export default function TripsFilterDrawer({ isOpen, onClose }: TripsFilterDrawerProps) {
    const { filters, setFilters, resetFilters } = useTripsFilters()

    const handleStatusChange = (statusId: string, checked: boolean) => {
        const current = filters.operationalStatus || []
        if (checked) {
            setFilters({ ...filters, operationalStatus: [...current, statusId] })
        } else {
            setFilters({ ...filters, operationalStatus: current.filter(id => id !== statusId) })
        }
    }

    return (
        <Drawer open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DrawerContent className="h-full w-[400px] ml-auto rounded-l-xl rounded-r-none border-l border-gray-200 bg-white shadow-xl focus:outline-none">
                <div className="flex flex-col h-full">
                    <DrawerHeader className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
                        <DrawerTitle className="text-lg font-semibold text-gray-900">Filtros de Viagem</DrawerTitle>
                        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full hover:bg-gray-100" onClick={onClose}>
                            <X className="h-4 w-4 text-gray-500" />
                        </Button>
                    </DrawerHeader>

                    <div className="flex-1 overflow-y-auto px-6 py-6 space-y-8">
                        {/* Date Range */}
                        <div className="space-y-4">
                            <h3 className="text-sm font-medium text-gray-900">Período da Viagem</h3>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label className="text-xs text-gray-500">De</Label>
                                    <Input
                                        type="date"
                                        value={filters.startDate || ''}
                                        onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
                                        className="w-full"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-xs text-gray-500">Até</Label>
                                    <Input
                                        type="date"
                                        value={filters.endDate || ''}
                                        onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
                                        className="w-full"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Operational Status */}
                        <div className="space-y-4">
                            <h3 className="text-sm font-medium text-gray-900">Status Operacional</h3>
                            <div className="space-y-3">
                                {OPERATIONAL_STATUSES.map((status) => (
                                    <div key={status.id} className="flex items-center space-x-3">
                                        <Checkbox
                                            id={`status-${status.id}`}
                                            checked={filters.operationalStatus?.includes(status.id)}
                                            onCheckedChange={(checked) => handleStatusChange(status.id, checked as boolean)}
                                        />
                                        <label
                                            htmlFor={`status-${status.id}`}
                                            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 text-gray-700"
                                        >
                                            {status.label}
                                        </label>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="border-t border-gray-100 px-6 py-4 bg-gray-50 flex items-center justify-between gap-4">
                        <Button
                            variant="outline"
                            onClick={resetFilters}
                            className="flex-1 bg-white border-gray-200 hover:bg-gray-50 text-gray-700"
                        >
                            Limpar
                        </Button>
                        <Button
                            onClick={onClose}
                            className="flex-1 bg-primary hover:bg-primary-dark text-white shadow-sm"
                        >
                            Aplicar Filtros
                        </Button>
                    </div>
                </div>
            </DrawerContent>
        </Drawer>
    )
}
