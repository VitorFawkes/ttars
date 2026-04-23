import { AlertTriangle, ExternalLink, ArrowRightCircle, X, Combine } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { DuplicateCardHit } from '@/hooks/useDuplicateCardDetection'
import { cn } from '@/lib/utils'

const formatBRL = (value: number | null | undefined) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0)

const formatDateBR = (iso: string | null) => {
    if (!iso) return null
    const [y, m, d] = iso.split('-')
    return `${d}/${m}/${y}`
}

interface Props {
    matches: DuplicateCardHit[]
    /** Se true, exibe botão "Usar este" (navega para card). Usado no CreateCardModal antes da criação. */
    /** Se false, exibe botão "Fundir com este" (chama onMergeInto). Usado quando source já existe. */
    preCreation?: boolean
    onIgnore: () => void
    /** Pré-criação: navega para /card/{id} e cancela criação. Pós: funde com source existente. */
    onMergeInto: (targetCardId: string) => void
    className?: string
}

export default function DuplicateCardBanner({ matches, preCreation = false, onIgnore, onMergeInto, className }: Props) {
    if (matches.length === 0) return null

    return (
        <div
            className={cn(
                'rounded-xl border border-amber-200 bg-amber-50 p-4 shadow-sm',
                className,
            )}
        >
            <div className="flex items-start gap-3">
                <div className="shrink-0 mt-0.5">
                    <AlertTriangle className="h-5 w-5 text-amber-600" />
                </div>

                <div className="flex-1 min-w-0 space-y-3">
                    <div>
                        <p className="text-sm font-semibold text-amber-900">
                            {matches.length === 1
                                ? 'Já existe um card parecido para este contato'
                                : `Encontramos ${matches.length} cards parecidos para este contato`}
                        </p>
                        <p className="text-xs text-amber-700 mt-0.5">
                            {preCreation
                                ? 'Mesma pessoa + mesmo produto + datas próximas. Pode ser a mesma viagem — talvez você queira editar um deles em vez de criar um novo.'
                                : 'Mesma pessoa + mesmo produto + datas próximas. Pode ser a mesma viagem.'}
                        </p>
                    </div>

                    <div className="space-y-2">
                        {matches.map(m => {
                            const dateRange = [formatDateBR(m.data_viagem_inicio), formatDateBR(m.data_viagem_fim)]
                                .filter(Boolean)
                                .join(' → ')
                            return (
                                <div
                                    key={m.id}
                                    className="flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-white px-3 py-2"
                                >
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2">
                                            <p className="text-sm font-medium text-slate-900 truncate">
                                                {m.titulo || 'Sem título'}
                                            </p>
                                            {m.stage_nome && (
                                                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 shrink-0">
                                                    {m.stage_nome}
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-3 text-xs text-slate-500 mt-0.5">
                                            {dateRange && <span>{dateRange}</span>}
                                            <span>{formatBRL(m.valor_final ?? m.valor_estimado ?? 0)}</span>
                                            <span>{m.financial_items_count} produto{m.financial_items_count !== 1 ? 's' : ''}</span>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1.5 shrink-0">
                                        <Link
                                            to={`/card/${m.id}`}
                                            target="_blank"
                                            className="flex items-center gap-1 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50 rounded border border-slate-200"
                                            title="Abrir card em nova aba"
                                        >
                                            <ExternalLink className="h-3 w-3" />
                                            Ver
                                        </Link>
                                        <button
                                            type="button"
                                            onClick={() => onMergeInto(m.id)}
                                            className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-white bg-amber-600 hover:bg-amber-700 rounded"
                                            title={preCreation ? 'Abrir este card em vez de criar um novo' : 'Agrupar com este card'}
                                        >
                                            {preCreation ? (
                                                <>
                                                    <ArrowRightCircle className="h-3 w-3" />
                                                    Usar este
                                                </>
                                            ) : (
                                                <>
                                                    <Combine className="h-3 w-3" />
                                                    Agrupar com este
                                                </>
                                            )}
                                        </button>
                                    </div>
                                </div>
                            )
                        })}
                    </div>

                    <div className="flex items-center justify-end pt-1">
                        <button
                            type="button"
                            onClick={onIgnore}
                            className="flex items-center gap-1 text-xs text-amber-800 hover:text-amber-900 font-medium"
                        >
                            <X className="h-3 w-3" />
                            {preCreation ? 'Ignorar e criar mesmo assim' : 'Fechar'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}
