import { useState } from 'react'
import { Trash2, ArrowRight, UserCog, Flag, Loader2, X, Search } from 'lucide-react'
import { Button } from '../ui/Button'
import { useBulkLeadActions } from '../../hooks/useBulkLeadActions'
import { usePipelineStages } from '../../hooks/usePipelineStages'
import { useCurrentProductMeta } from '../../hooks/useCurrentProductMeta'
import { useFilterOptions } from '../../hooks/useFilterOptions'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '../ui/dialog'
import { cn } from '../../lib/utils'

interface LeadsBulkActionsProps {
    selectedIds: string[]
    onClearSelection: () => void
}

export default function LeadsBulkActions({ selectedIds, onClearSelection }: LeadsBulkActionsProps) {
    const { pipelineId } = useCurrentProductMeta()
    const { bulkMoveStage, bulkChangeOwner, bulkChangePriority, bulkDelete, isLoading } = useBulkLeadActions()
    const { data: stages } = usePipelineStages(pipelineId)
    const { data: options } = useFilterOptions()

    const [showMoveModal, setShowMoveModal] = useState(false)
    const [showOwnerModal, setShowOwnerModal] = useState(false)
    const [showPriorityModal, setShowPriorityModal] = useState(false)
    const [showDeleteModal, setShowDeleteModal] = useState(false)

    const [selectedStageId, setSelectedStageId] = useState<string>('')
    const [selectedOwnerId, setSelectedOwnerId] = useState<string>('')
    const [selectedPriority, setSelectedPriority] = useState<string>('')
    const [ownerSearch, setOwnerSearch] = useState('')

    const profiles = options?.profiles || []
    const filteredProfiles = profiles.filter(p =>
        (p.full_name?.toLowerCase() || '').includes(ownerSearch.toLowerCase()) ||
        (p.email?.toLowerCase() || '').includes(ownerSearch.toLowerCase())
    )

    if (selectedIds.length === 0) return null

    const handleMoveStage = async () => {
        if (!selectedStageId) return
        await bulkMoveStage({ cardIds: selectedIds, stageId: selectedStageId })
        setShowMoveModal(false)
        setSelectedStageId('')
        onClearSelection()
    }

    const handleChangeOwner = async () => {
        if (!selectedOwnerId) return
        await bulkChangeOwner({ cardIds: selectedIds, ownerId: selectedOwnerId })
        setShowOwnerModal(false)
        setSelectedOwnerId('')
        onClearSelection()
    }

    const handleChangePriority = async () => {
        if (!selectedPriority) return
        await bulkChangePriority({
            cardIds: selectedIds,
            prioridade: selectedPriority as 'alta' | 'media' | 'baixa'
        })
        setShowPriorityModal(false)
        setSelectedPriority('')
        onClearSelection()
    }

    const handleDelete = async () => {
        await bulkDelete({ cardIds: selectedIds })
        setShowDeleteModal(false)
        onClearSelection()
    }

    return (
        <>
            <div className="flex items-center gap-2 bg-white border border-gray-200 shadow-sm rounded-lg px-4 py-2 animate-in fade-in slide-in-from-bottom-2 duration-200">
                <span className="text-sm font-medium text-gray-700 mr-2">
                    {selectedIds.length} selecionado{selectedIds.length > 1 ? 's' : ''}
                </span>

                <div className="h-5 w-px bg-gray-200 mx-1" />

                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowMoveModal(true)}
                    disabled={isLoading}
                    className="h-8 px-3 text-xs gap-1.5"
                >
                    <ArrowRight className="h-3.5 w-3.5" />
                    Mover Etapa
                </Button>

                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowOwnerModal(true)}
                    disabled={isLoading}
                    className="h-8 px-3 text-xs gap-1.5"
                >
                    <UserCog className="h-3.5 w-3.5" />
                    Alterar Dono
                </Button>

                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowPriorityModal(true)}
                    disabled={isLoading}
                    className="h-8 px-3 text-xs gap-1.5"
                >
                    <Flag className="h-3.5 w-3.5" />
                    Prioridade
                </Button>

                <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setShowDeleteModal(true)}
                    disabled={isLoading}
                    className="h-8 px-3 text-xs gap-1.5"
                >
                    <Trash2 className="h-3.5 w-3.5" />
                    Excluir
                </Button>

                <div className="h-5 w-px bg-gray-200 mx-1" />

                <Button
                    variant="ghost"
                    size="sm"
                    onClick={onClearSelection}
                    className="h-8 px-2 text-xs text-gray-400 hover:text-gray-600"
                >
                    <X className="h-3.5 w-3.5" />
                </Button>
            </div>

            {/* Move Stage Modal */}
            <Dialog open={showMoveModal} onOpenChange={setShowMoveModal}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle>Mover para Etapa</DialogTitle>
                        <DialogDescription>
                            Selecione a etapa de destino para {selectedIds.length} lead(s).
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-4 space-y-2 max-h-[300px] overflow-y-auto">
                        {(stages || []).map(stage => (
                            <label
                                key={stage.id}
                                className={cn(
                                    "flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors border",
                                    selectedStageId === stage.id
                                        ? "border-primary bg-primary/5"
                                        : "border-gray-100 hover:bg-gray-50"
                                )}
                            >
                                <input
                                    type="radio"
                                    name="stage"
                                    value={stage.id}
                                    checked={selectedStageId === stage.id}
                                    onChange={() => setSelectedStageId(stage.id)}
                                    className="sr-only"
                                />
                                <div
                                    className="w-3 h-3 rounded-full"
                                    style={{ backgroundColor: stage.cor || '#6b7280' }}
                                />
                                <span className="text-sm font-medium">{stage.nome}</span>
                            </label>
                        ))}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowMoveModal(false)}>
                            Cancelar
                        </Button>
                        <Button onClick={handleMoveStage} disabled={!selectedStageId || isLoading}>
                            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Mover
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Change Owner Modal */}
            <Dialog open={showOwnerModal} onOpenChange={setShowOwnerModal}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle>Alterar Responsável</DialogTitle>
                        <DialogDescription>
                            Selecione o novo responsável para {selectedIds.length} lead(s).
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-4 space-y-3">
                        <div className="relative">
                            <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                            <input
                                type="text"
                                placeholder="Buscar usuário..."
                                className="w-full pl-9 h-10 rounded-md border border-gray-200 text-sm"
                                value={ownerSearch}
                                onChange={(e) => setOwnerSearch(e.target.value)}
                            />
                        </div>
                        <div className="space-y-1 max-h-[250px] overflow-y-auto">
                            {filteredProfiles.map(profile => (
                                <label
                                    key={profile.id}
                                    className={cn(
                                        "flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors border",
                                        selectedOwnerId === profile.id
                                            ? "border-primary bg-primary/5"
                                            : "border-gray-100 hover:bg-gray-50"
                                    )}
                                >
                                    <input
                                        type="radio"
                                        name="owner"
                                        value={profile.id}
                                        checked={selectedOwnerId === profile.id}
                                        onChange={() => setSelectedOwnerId(profile.id)}
                                        className="sr-only"
                                    />
                                    <div className="flex-1">
                                        <div className="text-sm font-medium">
                                            {profile.full_name || 'Sem nome'}
                                        </div>
                                        <div className="text-xs text-gray-500">{profile.email}</div>
                                    </div>
                                </label>
                            ))}
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowOwnerModal(false)}>
                            Cancelar
                        </Button>
                        <Button onClick={handleChangeOwner} disabled={!selectedOwnerId || isLoading}>
                            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Alterar
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Change Priority Modal */}
            <Dialog open={showPriorityModal} onOpenChange={setShowPriorityModal}>
                <DialogContent className="sm:max-w-[350px]">
                    <DialogHeader>
                        <DialogTitle>Alterar Prioridade</DialogTitle>
                        <DialogDescription>
                            Selecione a nova prioridade para {selectedIds.length} lead(s).
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-4 space-y-2">
                        {[
                            { value: 'alta', label: 'Alta', color: 'bg-red-100 text-red-700 border-red-200' },
                            { value: 'media', label: 'Média', color: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
                            { value: 'baixa', label: 'Baixa', color: 'bg-green-100 text-green-700 border-green-200' }
                        ].map(prio => (
                            <label
                                key={prio.value}
                                className={cn(
                                    "flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors border",
                                    selectedPriority === prio.value
                                        ? "border-primary bg-primary/5"
                                        : "border-gray-100 hover:bg-gray-50"
                                )}
                            >
                                <input
                                    type="radio"
                                    name="priority"
                                    value={prio.value}
                                    checked={selectedPriority === prio.value}
                                    onChange={() => setSelectedPriority(prio.value)}
                                    className="sr-only"
                                />
                                <span className={cn("px-2 py-1 rounded text-sm font-medium", prio.color)}>
                                    {prio.label}
                                </span>
                            </label>
                        ))}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowPriorityModal(false)}>
                            Cancelar
                        </Button>
                        <Button onClick={handleChangePriority} disabled={!selectedPriority || isLoading}>
                            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Alterar
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Delete Confirmation Modal */}
            <Dialog open={showDeleteModal} onOpenChange={setShowDeleteModal}>
                <DialogContent className="sm:max-w-[400px]">
                    <DialogHeader>
                        <DialogTitle className="text-red-600">Excluir Leads</DialogTitle>
                        <DialogDescription>
                            Tem certeza que deseja mover {selectedIds.length} lead(s) para a lixeira?
                            Esta ação pode ser desfeita posteriormente.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="mt-4">
                        <Button variant="outline" onClick={() => setShowDeleteModal(false)}>
                            Cancelar
                        </Button>
                        <Button variant="destructive" onClick={handleDelete} disabled={isLoading}>
                            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Excluir
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    )
}
