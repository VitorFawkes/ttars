import { useEffect } from 'react'
import { AlertTriangle, X } from 'lucide-react'

interface Props {
    open: boolean
    count: number
    onClose: () => void
    onConfirm: () => void
    isPending: boolean
}

export function BulkDeleteConfirm({ open, count, onClose, onConfirm, isPending }: Props) {
    useEffect(() => {
        if (!open) return
        const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
        document.addEventListener('keydown', esc)
        return () => document.removeEventListener('keydown', esc)
    }, [open, onClose])

    if (!open) return null

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm px-4">
            <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200">
                <div className="flex items-start gap-3 p-5">
                    <div className="flex-shrink-0 h-10 w-10 rounded-full bg-rose-50 flex items-center justify-center">
                        <AlertTriangle className="h-5 w-5 text-rose-600" />
                    </div>
                    <div className="flex-1">
                        <h3 className="text-base font-semibold text-slate-900">
                            Excluir {count} {count === 1 ? 'tarefa' : 'tarefas'}?
                        </h3>
                        <p className="text-sm text-slate-600 mt-1">
                            As tarefas serão removidas da listagem. A ação pode ser revertida pelo banco se necessário (soft-delete).
                        </p>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
                        <X className="h-4 w-4" />
                    </button>
                </div>

                <div className="flex items-center justify-end gap-2 px-5 pb-5">
                    <button
                        onClick={onClose}
                        disabled={isPending}
                        className="px-3 py-1.5 text-sm font-medium rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={onConfirm}
                        disabled={isPending}
                        className="px-3 py-1.5 text-sm font-medium rounded-lg bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-50"
                    >
                        {isPending ? 'Excluindo...' : 'Excluir'}
                    </button>
                </div>
            </div>
        </div>
    )
}
