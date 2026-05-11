import { useMemo, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog'
import { Button } from '../ui/Button'
import UserSelector from './UserSelector'
import { Sparkles } from 'lucide-react'
import { useTeams } from '../../hooks/useTeams'

interface AtivarPosVendaModalProps {
    isOpen: boolean
    onClose: () => void
    onConfirm: (posOwnerId: string) => void
    currentPosOwnerId: string | null
    posVendaPhaseId?: string
    isPending?: boolean
}

export default function AtivarPosVendaModal({
    isOpen,
    onClose,
    onConfirm,
    currentPosOwnerId,
    posVendaPhaseId,
    isPending = false
}: AtivarPosVendaModalProps) {
    const [selectedOwnerId, setSelectedOwnerId] = useState<string | null>(currentPosOwnerId)
    const [showAllUsers, setShowAllUsers] = useState(false)
    const { teams } = useTeams()

    const [prevKey, setPrevKey] = useState('')
    const resetKey = `${currentPosOwnerId}-${isOpen}`
    if (resetKey !== prevKey) {
        setPrevKey(resetKey)
        setSelectedOwnerId(currentPosOwnerId)
        setShowAllUsers(false)
    }

    const phaseTeamIds = useMemo(() => {
        if (!posVendaPhaseId || showAllUsers) return undefined
        const matchingTeams = teams.filter(t => t.phase_id === posVendaPhaseId)
        if (matchingTeams.length === 0) return undefined
        return matchingTeams.map(t => t.id)
    }, [posVendaPhaseId, showAllUsers, teams])

    const isFiltered = phaseTeamIds !== undefined

    const handleConfirm = () => {
        if (selectedOwnerId) onConfirm(selectedOwnerId)
    }

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[440px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-indigo-700">
                        <Sparkles className="h-5 w-5" />
                        Ativar Pós-Venda
                    </DialogTitle>
                </DialogHeader>

                <div className="py-4 space-y-4">
                    <p className="text-sm text-gray-600">
                        Este card está em modo "Sem Pós-Venda" — ninguém da operação está acompanhando
                        e nenhuma cadência/automação dispara. Ao ativar, o pós-venda passa a funcionar
                        normalmente: tarefas, mensagens e cobrança de etapas voltam a rodar.
                    </p>

                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <label className="text-sm font-medium text-gray-700">Quem cuida do Pós-Venda?</label>
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
                                ? 'Mostrando membros dos times de Pós-Venda.'
                                : 'Selecione o responsável.'
                            }
                        </p>
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={onClose} disabled={isPending}>
                        Cancelar
                    </Button>
                    <Button
                        onClick={handleConfirm}
                        disabled={!selectedOwnerId || isPending}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white"
                    >
                        {isPending ? 'Ativando...' : 'Ativar Pós-Venda'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
