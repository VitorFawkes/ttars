import { Archive, AlertTriangle, Loader2 } from 'lucide-react'
import { Button } from '../ui/Button'

interface DeleteCardModalProps {
    isOpen: boolean
    onClose: () => void
    onConfirm: () => void
    isLoading?: boolean
    cardTitle?: string
}

export default function DeleteCardModal({
    isOpen,
    onClose,
    onConfirm,
    isLoading = false,
    cardTitle
}: DeleteCardModalProps) {
    if (!isOpen) return null

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center"
            onClick={(e) => e.stopPropagation()}
        >
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* Modal */}
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="px-6 py-5 border-b border-gray-100">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-red-100 rounded-full">
                            <Archive className="h-5 w-5 text-red-600" />
                        </div>
                        <h2 className="text-lg font-semibold text-gray-900">
                            Arquivar Viagem
                        </h2>
                    </div>
                </div>

                {/* Content */}
                <div className="px-6 py-5 space-y-4">
                    {cardTitle && (
                        <div className="px-3 py-2 bg-gray-50 rounded-lg border border-gray-200">
                            <p className="text-sm text-gray-500">Viagem:</p>
                            <p className="font-medium text-gray-900 truncate">{cardTitle}</p>
                        </div>
                    )}

                    <div className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                        <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                        <div className="text-sm">
                            <p className="font-medium text-amber-800">
                                Os dados serão preservados
                            </p>
                            <p className="text-amber-700 mt-1">
                                A viagem será arquivada e poderá ser restaurada a qualquer momento em Configurações → Arquivados.
                            </p>
                        </div>
                    </div>
                </div>

                {/* Actions */}
                <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-3">
                    <Button
                        variant="outline"
                        onClick={onClose}
                        disabled={isLoading}
                    >
                        Cancelar
                    </Button>
                    <Button
                        variant="destructive"
                        onClick={onConfirm}
                        disabled={isLoading}
                        className="gap-2"
                    >
                        {isLoading ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                            <Archive className="h-4 w-4" />
                        )}
                        Arquivar Viagem
                    </Button>
                </div>
            </div>
        </div>
    )
}
