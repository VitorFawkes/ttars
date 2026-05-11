import { CheckCircle2, AlertTriangle, XCircle, ArrowRight } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../ui/dialog'
import { Button } from '../ui/Button'

type Props = {
    open: boolean
    onClose: () => void
    score: number
    threshold: number
    qualificado: boolean
    disqualified: boolean
    fallbackAction: string | null
}

const SUGESTAO_ALTA = {
    titulo: 'Agendar reunião com Wedding Planner',
    descricao: 'Lead com fit alto. Próximo passo natural: marcar a reunião direto com a planner.',
}
const SUGESTAO_MEDIA = {
    titulo: 'Aquecer antes de agendar',
    descricao: 'Lead está acima do mínimo mas com sinais médios. Adicione a uma cadência de aquecimento por WhatsApp antes de marcar reunião.',
}
const SUGESTAO_BAIXA = {
    titulo: 'Enviar material informativo ou encerrar',
    descricao: 'Lead não bateu o mínimo. Envie o guia Welcome ou encerre cordialmente.',
}
const SUGESTAO_DISQUALIFY = {
    titulo: 'Encerrar cordialmente',
    descricao: 'Lead desqualificado (destino fora do catálogo sem flexibilidade). Encerre a conversa de forma educada.',
}

export function ProximoPassoModal({ open, onClose, score, threshold, qualificado, disqualified, fallbackAction }: Props) {
    let sugestao = SUGESTAO_BAIXA
    let Icon = AlertTriangle
    let color = 'text-slate-700'

    if (disqualified) {
        sugestao = SUGESTAO_DISQUALIFY
        Icon = XCircle
        color = 'text-rose-700'
    } else if (qualificado && score >= threshold + 10) {
        sugestao = SUGESTAO_ALTA
        Icon = CheckCircle2
        color = 'text-emerald-700'
    } else if (qualificado) {
        sugestao = SUGESTAO_MEDIA
        Icon = CheckCircle2
        color = 'text-amber-700'
    }

    return (
        <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Icon className={`w-5 h-5 ${color}`} />
                        Pontuação registrada — score {score}
                    </DialogTitle>
                    <DialogDescription>Sugestão de próximo passo baseada no score.</DialogDescription>
                </DialogHeader>
                <div className="py-2">
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                        <h4 className={`text-sm font-semibold ${color} flex items-center gap-1.5`}>
                            <ArrowRight className="w-4 h-4" />
                            {sugestao.titulo}
                        </h4>
                        <p className="text-sm text-slate-600 mt-1">{sugestao.descricao}</p>
                        {fallbackAction && !disqualified && !qualificado && (
                            <p className="text-xs text-slate-500 mt-2">
                                Ação fallback da Estela: <span className="font-mono">{fallbackAction}</span>
                            </p>
                        )}
                    </div>
                </div>
                <DialogFooter>
                    <Button onClick={onClose}>Fechar</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
