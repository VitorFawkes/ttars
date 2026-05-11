import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/Button'
import { Combine, ArrowRight, Loader2, ExternalLink, User, Calendar, Wallet, Package, AlertCircle } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { AutoMergePreflightInfo } from '@/hooks/useAutoMergePreflight'

interface Props {
    open: boolean
    info: AutoMergePreflightInfo | undefined
    isLoading: boolean
    isExecuting: boolean
    targetStageNome: string | null
    onCancel: () => void
    onConfirm: () => void
}

const formatBRL = (value: number | null | undefined) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0)

const formatDateBR = (iso: string | null) => {
    if (!iso) return null
    const [y, m, d] = iso.split('-')
    return `${d}/${m}/${y}`
}

const statusLabel = (status: string): { text: string; className: string } => {
    if (status === 'aberto') return { text: 'Aberto', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' }
    if (status === 'ganho') return { text: 'Ganho', className: 'bg-indigo-50 text-indigo-700 border-indigo-200' }
    if (status === 'perdido') return { text: 'Perdido', className: 'bg-rose-50 text-rose-700 border-rose-200' }
    return { text: status, className: 'bg-slate-100 text-slate-700 border-slate-200' }
}

export default function AutoMergeOnMoveModal({
    open,
    info,
    isLoading,
    isExecuting,
    targetStageNome,
    onCancel,
    onConfirm,
}: Props) {
    const parent = info?.parent
    const showLoading = isLoading && !info
    const willReopen = parent?.will_be_reopened === true
    const valor = parent?.valor_final ?? parent?.valor_estimado ?? 0
    const dateRange = parent
        ? [formatDateBR(parent.data_viagem_inicio), formatDateBR(parent.data_viagem_fim)].filter(Boolean).join(' → ')
        : null
    const status = parent ? statusLabel(parent.status_comercial) : null

    return (
        <Dialog open={open} onOpenChange={v => !v && !isExecuting && onCancel()}>
            <DialogContent className="sm:max-w-[600px]">
                <DialogHeader>
                    <DialogTitle className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                        <Combine className="h-5 w-5 text-amber-600" />
                        Este sub-card vai juntar ao card principal
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-4 py-2">
                    {showLoading && (
                        <div className="flex items-center justify-center py-8">
                            <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                        </div>
                    )}

                    {!showLoading && parent && (
                        <>
                            {/* Card pai (destino) */}
                            <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 space-y-3">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0 flex-1">
                                        <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700 mb-1">
                                            Card principal (destino)
                                        </p>
                                        <p className="text-base font-semibold text-slate-900 truncate">
                                            {parent.titulo || 'Sem título'}
                                        </p>
                                    </div>
                                    <Link
                                        to={`/cards/${parent.id}`}
                                        target="_blank"
                                        className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-emerald-700 bg-white border border-emerald-300 rounded-md hover:bg-emerald-100 transition-colors"
                                        title="Abrir o card principal em nova aba"
                                    >
                                        <ExternalLink className="h-3 w-3" />
                                        Abrir card
                                    </Link>
                                </div>

                                <div className="grid grid-cols-2 gap-3 text-xs">
                                    {parent.pessoa_nome && (
                                        <div className="flex items-center gap-1.5 text-slate-700">
                                            <User className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                                            <span className="truncate">{parent.pessoa_nome}</span>
                                        </div>
                                    )}
                                    {status && (
                                        <div className="flex items-center gap-1.5">
                                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${status.className}`}>
                                                {status.text}
                                            </span>
                                            {parent.stage_nome && (
                                                <span className="text-slate-600 truncate">em {parent.stage_nome}</span>
                                            )}
                                        </div>
                                    )}
                                    {dateRange && (
                                        <div className="flex items-center gap-1.5 text-slate-700">
                                            <Calendar className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                                            <span className="truncate">{dateRange}</span>
                                        </div>
                                    )}
                                    <div className="flex items-center gap-1.5 text-slate-700">
                                        <Wallet className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                                        <span className="font-medium">{formatBRL(valor)}</span>
                                    </div>
                                    <div className="flex items-center gap-1.5 text-slate-700">
                                        <Package className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                                        <span>
                                            {parent.items_count} produto{parent.items_count === 1 ? '' : 's'} hoje
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Aviso de reabertura, se aplicável */}
                            {willReopen && targetStageNome && (
                                <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-3 flex gap-2">
                                    <AlertCircle className="h-4 w-4 text-indigo-600 shrink-0 mt-0.5" />
                                    <div className="text-xs text-indigo-900 space-y-0.5">
                                        <p className="font-semibold">
                                            O card principal {parent.archived ? 'está arquivado' :
                                                parent.status_comercial !== 'aberto' ? `está marcado como "${status?.text.toLowerCase()}"` :
                                                'ainda não está em Pós-venda'}.
                                        </p>
                                        <p>
                                            Vamos reabrir e mover ele para <strong>{targetStageNome}</strong>{' '}
                                            antes de juntar com este sub-card.
                                        </p>
                                    </div>
                                </div>
                            )}

                            {/* O que vai acontecer */}
                            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 flex gap-2">
                                <Combine className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                                <div className="text-xs text-amber-900 space-y-1">
                                    <p className="font-semibold">O que vai acontecer ao confirmar:</p>
                                    <ul className="list-disc list-inside space-y-0.5 ml-1">
                                        <li>Os produtos, viajantes, contatos e histórico do sub-card vão pro card principal</li>
                                        <li>O sub-card fica arquivado (recuperável na Lixeira)</li>
                                        {willReopen && targetStageNome && (
                                            <li>O card principal volta para "Aberto" e é movido para <strong>{targetStageNome}</strong></li>
                                        )}
                                        <li>O valor e a receita do card principal são recalculados</li>
                                    </ul>
                                </div>
                            </div>
                        </>
                    )}

                    {!showLoading && !parent && (
                        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                            Não foi possível carregar as informações do card principal.
                        </div>
                    )}
                </div>

                <DialogFooter className="gap-2">
                    <Button variant="outline" onClick={onCancel} disabled={isExecuting}>
                        Cancelar
                    </Button>
                    <Button
                        onClick={onConfirm}
                        disabled={isExecuting || showLoading || !parent}
                        className="bg-amber-600 hover:bg-amber-700 text-white"
                    >
                        {isExecuting ? (
                            <>
                                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                Juntando...
                            </>
                        ) : (
                            <>
                                <ArrowRight className="h-4 w-4 mr-2" />
                                Confirmar e juntar
                            </>
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
