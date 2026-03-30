import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog'
import { Button } from '../ui/Button'
import { Trophy, ArrowRight, CheckCircle } from 'lucide-react'

interface WinOptionsModalProps {
    isOpen: boolean
    onClose: () => void
    onChoosePosVenda: () => void
    onChooseDirectWin: () => void
}

export default function WinOptionsModal({
    isOpen,
    onClose,
    onChoosePosVenda,
    onChooseDirectWin
}: WinOptionsModalProps) {
    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[440px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-green-700">
                        <Trophy className="h-5 w-5" />
                        Marcar como Ganho
                    </DialogTitle>
                </DialogHeader>

                <div className="py-4 space-y-3">
                    <p className="text-sm text-gray-600">
                        Este card precisa de acompanhamento pós-venda?
                    </p>

                    <button
                        onClick={onChoosePosVenda}
                        className="w-full flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:border-indigo-300 hover:bg-indigo-50/50 transition-all text-left group"
                    >
                        <div className="p-2 rounded-md bg-indigo-100 text-indigo-600 group-hover:bg-indigo-200 transition-colors">
                            <ArrowRight className="h-4 w-4" />
                        </div>
                        <div className="flex-1">
                            <div className="text-sm font-medium text-gray-900">Sim, enviar para Pós-Venda</div>
                            <div className="text-xs text-gray-500">O card será transferido para a equipe de pós-venda</div>
                        </div>
                    </button>

                    <button
                        onClick={onChooseDirectWin}
                        className="w-full flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:border-green-300 hover:bg-green-50/50 transition-all text-left group"
                    >
                        <div className="p-2 rounded-md bg-green-100 text-green-600 group-hover:bg-green-200 transition-colors">
                            <CheckCircle className="h-4 w-4" />
                        </div>
                        <div className="flex-1">
                            <div className="text-sm font-medium text-gray-900">Não, fechar venda diretamente</div>
                            <div className="text-xs text-gray-500">Para vendas que não precisam de acompanhamento (passagens, seguros, etc.)</div>
                        </div>
                    </button>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>
                        Cancelar
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
