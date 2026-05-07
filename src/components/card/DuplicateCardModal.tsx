import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Copy, Loader2 } from 'lucide-react'
import { useToast } from '@/contexts/ToastContext'
import { useDuplicateCard } from '@/hooks/useDuplicateCard'

interface Props {
    open: boolean
    onClose: () => void
    card: {
        id: string
        titulo?: string | null
    }
}

export default function DuplicateCardModal({ open, onClose, card }: Props) {
    const navigate = useNavigate()
    const { toast } = useToast()
    const duplicate = useDuplicateCard()
    const [titulo, setTitulo] = useState('')

    useEffect(() => {
        if (open) {
            setTitulo(`Cópia de ${card.titulo ?? ''}`.trim())
        }
    }, [open, card.titulo])

    const handleConfirm = async () => {
        const novoTitulo = titulo.trim()
        if (!novoTitulo) return
        try {
            const result = await duplicate.mutateAsync({ sourceId: card.id, novoTitulo })
            toast({
                type: 'success',
                title: 'Card duplicado',
                description: 'Abrindo o card novo para você ajustar o cliente.',
            })
            onClose()
            navigate(`/cards/${result.new_card_id}`)
        } catch (err) {
            toast({
                type: 'error',
                title: 'Não consegui duplicar',
                description: (err as Error).message || 'Tente novamente.',
            })
        }
    }

    return (
        <Dialog open={open} onOpenChange={v => !v && !duplicate.isPending && onClose()}>
            <DialogContent className="sm:max-w-[480px]">
                <DialogHeader>
                    <DialogTitle className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                        <Copy className="h-5 w-5 text-blue-600" />
                        Duplicar card
                    </DialogTitle>
                    <p className="text-sm text-slate-500 mt-1">
                        Vou criar um card novo aproveitando os dados da viagem, mas sem cliente — pra você usar como base de uma nova oportunidade.
                    </p>
                </DialogHeader>

                <div className="space-y-4 py-2">
                    <div>
                        <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-1.5">
                            Título do novo card
                        </label>
                        <Input
                            value={titulo}
                            onChange={e => setTitulo(e.target.value)}
                            placeholder="Ex: Lua de mel — Maldivas — modelo"
                            disabled={duplicate.isPending}
                            autoFocus
                        />
                    </div>

                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700 space-y-2">
                        <div>
                            <p className="font-semibold text-slate-900 mb-1">Vai copiar:</p>
                            <ul className="list-disc list-inside space-y-0.5 ml-1">
                                <li>Itens da viagem (destinos, fornecedores, datas, valores estimados)</li>
                                <li>Datas tentativas, época e duração</li>
                                <li>Briefing inicial e tags</li>
                            </ul>
                        </div>
                        <div>
                            <p className="font-semibold text-slate-900 mb-1">Não copia:</p>
                            <ul className="list-disc list-inside space-y-0.5 ml-1">
                                <li>Cliente principal e contatos vinculados</li>
                                <li>Tarefas, mensagens, propostas e histórico</li>
                                <li>Time (donos), número de venda Monde, valores cobrados</li>
                            </ul>
                        </div>
                        <p className="text-slate-500 pt-1 border-t border-slate-200">
                            O novo card volta para a primeira etapa do funil e fica com você como dono.
                        </p>
                    </div>
                </div>

                <DialogFooter className="gap-2">
                    <Button variant="outline" onClick={onClose} disabled={duplicate.isPending}>
                        Cancelar
                    </Button>
                    <Button
                        onClick={handleConfirm}
                        disabled={duplicate.isPending || titulo.trim().length === 0}
                        className="bg-blue-600 hover:bg-blue-700 text-white"
                    >
                        {duplicate.isPending ? (
                            <>
                                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                Duplicando...
                            </>
                        ) : (
                            <>
                                <Copy className="h-4 w-4 mr-2" />
                                Duplicar
                            </>
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
