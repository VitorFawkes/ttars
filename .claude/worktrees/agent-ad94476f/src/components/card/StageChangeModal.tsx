import { useState, useMemo } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog'
import { Button } from '../ui/Button'
import UserSelector from '../card/UserSelector'
import { AlertTriangle } from 'lucide-react'
import { useTeams } from '../../hooks/useTeams'

interface StageChangeModalProps {
    isOpen: boolean
    onClose: () => void
    onConfirm: (newOwnerId: string) => void
    currentOwnerId: string | null
    sdrName?: string
    targetStageName: string
    targetPhaseId?: string    // UUID direto da pipeline_phases
    targetPhaseName?: string  // Label para exibicao no modal
}

export default function StageChangeModal({
    isOpen,
    onClose,
    onConfirm,
    currentOwnerId,
    sdrName,
    targetStageName,
    targetPhaseId,
    targetPhaseName
}: StageChangeModalProps) {
    const [selectedOwnerId, setSelectedOwnerId] = useState<string | null>(null)
    const [showAllUsers, setShowAllUsers] = useState(false)
    const { teams } = useTeams()

    // Reset state when modal opens with new data
    const [prevKey, setPrevKey] = useState('')
    const resetKey = `${currentOwnerId}-${isOpen}`
    if (resetKey !== prevKey) {
        setPrevKey(resetKey)
        setSelectedOwnerId(currentOwnerId)
        setShowAllUsers(false)
    }

    const handleConfirm = () => {
        if (selectedOwnerId) {
            onConfirm(selectedOwnerId)
        }
    }

    const phaseLabel = targetPhaseName || 'Responsável'

    // Encontrar times que pertencem a fase alvo — direto por phase_id, sem mapeamento
    const phaseTeamIds = useMemo(() => {
        if (!targetPhaseId || showAllUsers) return undefined
        const matchingTeams = teams.filter(t => t.phase_id === targetPhaseId)
        if (matchingTeams.length === 0) return undefined // Nenhum time configurado — fail-open
        return matchingTeams.map(t => t.id)
    }, [targetPhaseId, showAllUsers, teams])

    const isFiltered = phaseTeamIds !== undefined

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-amber-600">
                        <AlertTriangle className="h-5 w-5" />
                        Definição de Responsável
                    </DialogTitle>
                </DialogHeader>

                <div className="py-4 space-y-4">
                    <p className="text-sm text-gray-600">
                        O card está entrando na etapa <strong>{targetStageName}</strong>.
                        {targetPhaseId ? (
                            <> Esta etapa exige um responsável da fase <strong>{phaseLabel}</strong>.</>
                        ) : (
                            <> Verifique o responsável pelo card.</>
                        )}
                    </p>

                    {sdrName && (
                        <div className="bg-blue-50 p-3 rounded-md border border-blue-100 text-sm text-blue-800">
                            <span className="font-semibold">Nota:</span> O SDR original ({sdrName}) permanecerá vinculado.
                        </div>
                    )}

                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <label className="text-sm font-medium text-gray-700">Selecionar {phaseLabel}</label>
                            {isFiltered && (
                                <button
                                    type="button"
                                    onClick={() => setShowAllUsers(true)}
                                    className="text-xs text-indigo-600 hover:text-indigo-700 font-medium"
                                >
                                    Mostrar todos
                                </button>
                            )}
                        </div>
                        <UserSelector
                            currentUserId={selectedOwnerId}
                            onSelect={setSelectedOwnerId}
                            teamIds={phaseTeamIds}
                        />
                        <p className="text-xs text-gray-500">
                            {isFiltered
                                ? `Mostrando membros dos times de ${phaseLabel}.`
                                : 'Se o responsável atual já for adequado, apenas confirme.'
                            }
                        </p>
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>
                        Cancelar
                    </Button>
                    <Button
                        onClick={handleConfirm}
                        disabled={!selectedOwnerId}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white"
                    >
                        {selectedOwnerId === currentOwnerId ? 'Manter Dono e Mover' : 'Confirmar e Mover'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
