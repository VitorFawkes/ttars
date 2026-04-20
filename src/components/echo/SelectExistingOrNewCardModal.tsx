import { useMemo } from 'react'
import { MapPin, Calendar, DollarSign, User, Clock, ArrowRight, Plus } from 'lucide-react'
import { formatDistanceToNow, format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'

export interface EchoOpenCard {
    id: string
    titulo: string | null
    produto: string | null
    pipeline_stage_id: string | null
    etapa_nome: string | null
    fase_nome: string | null
    fase_slug: string | null
    destinos: string[] | null
    epoca: unknown
    valor_estimado: number | null
    updated_at: string
    created_at: string
    dono_nome: string | null
}

interface Props {
    cards: EchoOpenCard[]
    contactName: string
    phoneLabel: string | null
    creatingNew: boolean
    onSelectExisting: (cardId: string) => void
    onCreateNew: () => void
}

const brl = (n: number | null) =>
    n == null ? null : n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })

const formatEpoca = (epoca: unknown): string | null => {
    if (!epoca || typeof epoca !== 'object') return null
    const e = epoca as Record<string, unknown>
    if (typeof e.start === 'string' && typeof e.end === 'string') {
        try {
            const start = format(parseISO(e.start), 'dd MMM', { locale: ptBR })
            const end = format(parseISO(e.end), 'dd MMM yyyy', { locale: ptBR })
            return `${start} – ${end}`
        } catch {
            return `${e.start} – ${e.end}`
        }
    }
    if (typeof e.mes === 'string' && typeof e.ano === 'number') {
        return `${e.mes} ${e.ano}`
    }
    return null
}

export default function SelectExistingOrNewCardModal({
    cards,
    contactName,
    phoneLabel,
    creatingNew,
    onSelectExisting,
    onCreateNew,
}: Props) {
    const sortedCards = useMemo(
        () => [...cards].sort((a, b) => b.updated_at.localeCompare(a.updated_at)),
        [cards]
    )

    return (
        <div className="min-h-[60vh] flex flex-col items-center justify-start px-4 py-8 bg-slate-50">
            <div className="w-full max-w-2xl">
                <header className="mb-6">
                    <h1 className="text-xl font-semibold text-slate-900 tracking-tight">
                        {contactName} já tem {cards.length === 1 ? 'uma viagem aberta' : `${cards.length} viagens abertas`}
                    </h1>
                    <p className="mt-1.5 text-sm text-slate-600">
                        {phoneLabel && (
                            <>
                                Conversa pela linha <span className="font-medium text-slate-700">{phoneLabel}</span>.
                                {' '}
                            </>
                        )}
                        Continuar numa viagem existente ou criar uma nova?
                    </p>
                </header>

                <div className="space-y-2.5">
                    {sortedCards.map((card) => (
                        <button
                            key={card.id}
                            type="button"
                            onClick={() => onSelectExisting(card.id)}
                            disabled={creatingNew}
                            className="group w-full text-left bg-white border border-slate-200 hover:border-indigo-300 hover:shadow-sm transition-all rounded-xl p-4 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <div className="flex items-start justify-between gap-4">
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1.5">
                                        <span className="inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700">
                                            {card.fase_nome || 'Pipeline'}
                                        </span>
                                        {card.etapa_nome && (
                                            <span className="text-xs text-slate-500">{card.etapa_nome}</span>
                                        )}
                                    </div>
                                    <h3 className="font-medium text-slate-900 truncate">{card.titulo || 'Sem título'}</h3>
                                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
                                        {card.destinos && card.destinos.length > 0 && (
                                            <span className="inline-flex items-center gap-1">
                                                <MapPin className="w-3.5 h-3.5 text-slate-400" />
                                                {card.destinos.join(', ')}
                                            </span>
                                        )}
                                        {formatEpoca(card.epoca) && (
                                            <span className="inline-flex items-center gap-1">
                                                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                                                {formatEpoca(card.epoca)}
                                            </span>
                                        )}
                                        {brl(card.valor_estimado) && (
                                            <span className="inline-flex items-center gap-1">
                                                <DollarSign className="w-3.5 h-3.5 text-slate-400" />
                                                {brl(card.valor_estimado)}
                                            </span>
                                        )}
                                        {card.dono_nome && (
                                            <span className="inline-flex items-center gap-1">
                                                <User className="w-3.5 h-3.5 text-slate-400" />
                                                {card.dono_nome}
                                            </span>
                                        )}
                                        <span className="inline-flex items-center gap-1 text-slate-500">
                                            <Clock className="w-3.5 h-3.5 text-slate-400" />
                                            {formatDistanceToNow(parseISO(card.updated_at), { addSuffix: true, locale: ptBR })}
                                        </span>
                                    </div>
                                </div>
                                <ArrowRight className="w-5 h-5 text-slate-300 group-hover:text-indigo-500 shrink-0 mt-1" />
                            </div>
                        </button>
                    ))}
                </div>

                <div className="mt-5 pt-5 border-t border-slate-200">
                    <button
                        type="button"
                        onClick={onCreateNew}
                        disabled={creatingNew}
                        className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-xl shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                        <Plus className="w-4 h-4" />
                        {creatingNew ? 'Criando nova viagem…' : 'É uma nova viagem — criar card'}
                    </button>
                    <p className="mt-2 text-xs text-slate-500 text-center">
                        Use esta opção quando o cliente está planejando uma viagem diferente das que já estão em andamento.
                    </p>
                </div>
            </div>
        </div>
    )
}
