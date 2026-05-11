import { useState, useMemo } from 'react'
import { CheckCircle2, XCircle, Phone, MessageSquare } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog'
import { Button } from '../ui/Button'
import { Label } from '../ui/label'
import { Textarea } from '../ui/textarea'
import { useTaskOutcomes } from '../../hooks/useTaskOutcomes'
import type { Database } from '../../database.types'

type TaskOutcome = Database['public']['Tables']['task_type_outcomes']['Row']

interface TaskOutcomeModalProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    taskTipo: string
    onConfirm: (outcome: string, feedback: string) => void
}

export function TaskOutcomeModal({ open, onOpenChange, taskTipo, onConfirm }: TaskOutcomeModalProps) {
    const [outcomeResult, setOutcomeResult] = useState('')
    const [outcomeFeedback, setOutcomeFeedback] = useState('')
    const [lastOpenState, setLastOpenState] = useState(false)

    const { data: outcomes } = useTaskOutcomes()

    // Reset state when modal opens (without useEffect + setState)
    const defaultOutcome = useMemo(() => {
        if (!outcomes) return ''
        const filtered = outcomes.filter(o => o.tipo === taskTipo)
        return filtered.length > 0 ? filtered[0].outcome_key : ''
    }, [outcomes, taskTipo])

    // Detect open transition and reset
    if (open && !lastOpenState) {
        setLastOpenState(true)
        setOutcomeResult(defaultOutcome)
        setOutcomeFeedback('')
    } else if (!open && lastOpenState) {
        setLastOpenState(false)
    }

    const renderOutcomeButtons = (filteredOutcomes: TaskOutcome[]) => {
        return filteredOutcomes.map((outcome) => (
            <button
                key={outcome.outcome_key}
                onClick={() => setOutcomeResult(outcome.outcome_key)}
                className={`relative flex flex-col items-center justify-center gap-2 p-4 rounded-xl border-2 transition-all duration-200 hover:scale-[1.02] ${outcomeResult === outcome.outcome_key
                    ? 'border-indigo-500 bg-indigo-50/50 text-indigo-700 shadow-sm'
                    : 'border-gray-100 bg-white text-gray-600 hover:border-indigo-200 hover:bg-indigo-50/30'
                    }`}
            >
                <div className={`p-2 rounded-full ${outcomeResult === outcome.outcome_key ? 'bg-indigo-100' : 'bg-gray-100'}`}>
                    {outcome.is_success ? (
                        <CheckCircle2 className={`w-5 h-5 ${outcomeResult === outcome.outcome_key ? 'text-indigo-600' : 'text-gray-500'}`} />
                    ) : (
                        <XCircle className={`w-5 h-5 ${outcomeResult === outcome.outcome_key ? 'text-indigo-600' : 'text-gray-500'}`} />
                    )}
                </div>
                <span className="font-medium text-xs">{outcome.outcome_label}</span>
                {outcomeResult === outcome.outcome_key && (
                    <div className="absolute top-2 right-2 w-2 h-2 bg-indigo-500 rounded-full animate-pulse" />
                )}
            </button>
        ))
    }

    const taskLabel = (taskTipo === 'ligacao' || taskTipo === 'contato' || taskTipo === 'whatsapp') ? 'contato' : 'tarefa'

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[500px] p-0 gap-0 max-h-[85vh] flex flex-col">
                <DialogHeader className="px-6 pt-6 pb-4 border-b border-gray-50 bg-gray-50/30 flex-shrink-0">
                    <DialogTitle className="text-xl font-semibold text-gray-900">Como foi essa {taskLabel}?</DialogTitle>
                    <p className="text-xs text-gray-500 mt-1">Registre o resultado para manter o histórico atualizado.</p>
                </DialogHeader>

                <div className="p-6 space-y-6 overflow-y-auto max-h-[50vh]">
                    <div className="space-y-3">
                        <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Resultado</Label>
                        <div className="w-full">
                            {(taskTipo === 'contato' || taskTipo === 'ligacao' || taskTipo === 'whatsapp') ? (
                                <div className="space-y-5">
                                    <div>
                                        <div className="flex items-center gap-1.5 mb-3 text-xs font-bold text-green-700 bg-green-50 w-fit px-2 py-1 rounded border border-green-100">
                                            <MessageSquare className="w-3.5 h-3.5" />
                                            <span>WHATSAPP</span>
                                        </div>
                                        <div className="grid grid-cols-2 gap-3">
                                            {renderOutcomeButtons(outcomes?.filter((o) => ['respondido', 'visualizado', 'enviado'].includes(o.outcome_key)) || [])}
                                        </div>
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-1.5 mb-3 text-xs font-bold text-cyan-700 bg-cyan-50 w-fit px-2 py-1 rounded border border-cyan-100">
                                            <Phone className="w-3.5 h-3.5" />
                                            <span>LIGACAO</span>
                                        </div>
                                        <div className="grid grid-cols-2 gap-3">
                                            {renderOutcomeButtons(outcomes?.filter((o) => ['atendeu', 'nao_atendeu', 'caixa_postal', 'numero_invalido'].includes(o.outcome_key)) || [])}
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="grid grid-cols-2 gap-3">
                                    {renderOutcomeButtons(outcomes?.filter((o) => o.tipo === taskTipo) || [])}
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="space-y-3">
                        <Label htmlFor="outcome-feedback" className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                            Feedback / Observacoes
                        </Label>
                        <Textarea
                            id="outcome-feedback"
                            value={outcomeFeedback}
                            onChange={(e) => setOutcomeFeedback(e.target.value)}
                            placeholder="Descreva os pontos principais, proximos passos ou motivos..."
                            className="min-h-[100px] resize-none border-gray-200 focus:border-indigo-500 focus:ring-indigo-500 bg-gray-50/30"
                        />
                    </div>
                </div>

                <DialogFooter className="px-6 py-4 bg-gray-50 border-t border-gray-100 sm:justify-between items-center">
                    <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-gray-500 hover:text-gray-700">
                        Cancelar
                    </Button>
                    <Button
                        onClick={() => {
                            if (outcomeResult) {
                                onConfirm(outcomeResult, outcomeFeedback)
                                onOpenChange(false)
                            }
                        }}
                        disabled={!outcomeResult}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 shadow-sm transition-all hover:shadow-md"
                    >
                        Confirmar Conclusao
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
