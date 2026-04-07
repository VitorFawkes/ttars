import { useMemo, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog'
import { Button } from '../ui/Button'
import { ClipboardCheck, AlertTriangle, ExternalLink } from 'lucide-react'
import { getCardFieldValue } from '../../lib/cardFieldValues'
import type { StageFieldConfirmation } from '../../hooks/useStageFieldConfirmations'

interface FieldConfirmationModalProps {
    isOpen: boolean
    onClose: () => void
    onConfirm: () => void
    onEditCard?: () => void
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- card shape varia (CardDetail/Kanban)
    card: any
    targetStageName: string
    fields: StageFieldConfirmation[]
}

export default function FieldConfirmationModal({
    isOpen,
    onClose,
    onConfirm,
    onEditCard,
    card,
    targetStageName,
    fields,
}: FieldConfirmationModalProps) {
    const [confirmed, setConfirmed] = useState<Record<string, boolean>>({})

    const resolved = useMemo(() => {
        return fields.map(f => ({
            ...f,
            value: getCardFieldValue(card, f.field_key),
            label: f.field_label || humanizeKey(f.field_key),
        }))
    }, [fields, card])

    const allConfirmed = resolved.every(f => confirmed[f.field_key])

    // Reset quando abrir
    const [prevOpen, setPrevOpen] = useState(false)
    if (isOpen !== prevOpen) {
        setPrevOpen(isOpen)
        if (isOpen) setConfirmed({})
    }

    const handleToggle = (key: string) => {
        setConfirmed(prev => ({ ...prev, [key]: !prev[key] }))
    }

    const handleConfirmAll = () => {
        onConfirm()
    }

    return (
        <Dialog open={isOpen} onOpenChange={open => { if (!open) onClose() }}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-lg">
                        <div className="p-2 rounded-lg bg-amber-100">
                            <ClipboardCheck className="h-5 w-5 text-amber-600" />
                        </div>
                        Confira os campos antes de mover
                    </DialogTitle>
                </DialogHeader>

                <div className="py-2 space-y-4">
                    <p className="text-sm text-slate-600">
                        Antes de mover para <span className="font-semibold text-slate-900">{targetStageName}</span>, confirme se os campos abaixo estão corretos.
                    </p>

                    <div className="space-y-2">
                        {resolved.map(field => {
                            const isChecked = !!confirmed[field.field_key]
                            const isEmpty = field.value.isEmpty
                            return (
                                <label
                                    key={field.field_key}
                                    className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                                        isChecked
                                            ? 'bg-emerald-50 border-emerald-200'
                                            : isEmpty
                                                ? 'bg-amber-50 border-amber-200'
                                                : 'bg-white border-slate-200 hover:border-slate-300'
                                    }`}
                                >
                                    <input
                                        type="checkbox"
                                        checked={isChecked}
                                        onChange={() => handleToggle(field.field_key)}
                                        className="mt-0.5 w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                                    />
                                    <div className="flex-1 min-w-0">
                                        <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                                            {field.label}
                                        </p>
                                        {isEmpty ? (
                                            <div className="flex items-start gap-1.5 mt-1">
                                                <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />
                                                <p className="text-sm text-amber-700">Nenhum valor definido</p>
                                            </div>
                                        ) : (
                                            <p className="text-sm font-semibold text-slate-900 break-words">
                                                {field.value.display}
                                            </p>
                                        )}
                                    </div>
                                </label>
                            )
                        })}
                    </div>

                    {onEditCard && (
                        <button
                            type="button"
                            onClick={onEditCard}
                            className="text-xs text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
                        >
                            <ExternalLink className="h-3 w-3" />
                            Abrir card para editar
                        </button>
                    )}
                </div>

                <DialogFooter className="gap-2 sm:gap-0">
                    <Button variant="outline" onClick={onClose}>
                        Cancelar
                    </Button>
                    <Button onClick={handleConfirmAll} disabled={!allConfirmed}>
                        Está tudo correto
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

function humanizeKey(key: string): string {
    return key
        .replace(/_/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase())
}
