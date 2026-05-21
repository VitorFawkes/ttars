import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { X, ExternalLink, Loader2, AlertTriangle, Check, Crown, Calendar, MapPin, Truck, Package, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { GiftAssignmentFull } from '@/hooks/useAllGiftAssignments'
import { useUpdateGiftNotes, useUpdateGiftStatus, type GiftKanbanStatus } from '@/hooks/useGiftStatusKanban'
import { useBulkGiftStatus } from '@/hooks/useBulkGiftStatus'
import { getGiftItemName } from '@/hooks/useCardGifts'

const formatBRL = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)

function formatDate(iso: string | null): string | null {
    if (!iso) return null
    const [y, m, d] = iso.slice(0, 10).split('-')
    if (!y || !m || !d) return null
    return `${d}/${m}/${y}`
}

const STATUS_OPTIONS: { value: GiftKanbanStatus; label: string; className: string }[] = [
    { value: 'pendente',   label: 'Solicitado',  className: 'bg-slate-200 text-slate-800 hover:bg-slate-300' },
    { value: 'preparando', label: 'Preparando',  className: 'bg-amber-500 text-white hover:bg-amber-600' },
    { value: 'a_enviar',   label: 'A enviar',    className: 'bg-indigo-500 text-white hover:bg-indigo-600' },
    { value: 'enviado',    label: 'Enviado',     className: 'bg-blue-500 text-white hover:bg-blue-600' },
    { value: 'entregue',   label: 'Entregue',    className: 'bg-emerald-500 text-white hover:bg-emerald-600' },
]

interface Props {
    assignment: GiftAssignmentFull
    onClose: () => void
}

export default function GiftDetailSheet({ assignment, onClose }: Props) {
    const navigate = useNavigate()
    const updateNotes = useUpdateGiftNotes()
    const updateStatus = useUpdateGiftStatus()
    const cancelStatus = useBulkGiftStatus()

    const [notes, setNotes] = useState(assignment.notes ?? '')
    const [confirmCancel, setConfirmCancel] = useState(false)
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    // Fecha com ESC
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose()
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [onClose])

    const handleNotesChange = (value: string) => {
        setNotes(value)
        if (debounceRef.current) clearTimeout(debounceRef.current)
        debounceRef.current = setTimeout(() => {
            updateNotes.mutate({ assignmentId: assignment.id, notes: value })
        }, 600)
    }

    const handleStatusChange = (newStatus: GiftKanbanStatus) => {
        if (assignment.status === newStatus) return
        updateStatus.mutate({ assignmentId: assignment.id, newStatus })
    }

    const handleCancel = () => {
        cancelStatus.mutate({
            assignmentIds: [assignment.id],
            newStatus: 'cancelado',
            assignmentItems: { [assignment.id]: assignment.items ?? [] },
        }, {
            onSuccess: () => {
                setConfirmCancel(false)
                onClose()
            },
        })
    }

    const contatoNome = assignment.contato
        ? (assignment.contato.sobrenome ? `${assignment.contato.nome} ${assignment.contato.sobrenome}` : assignment.contato.nome)
        : 'Sem contato'

    const totalCost = assignment.items?.reduce((s, i) => s + i.quantity * i.unit_price_snapshot, 0) ?? 0
    const itemCount = assignment.items?.length ?? 0
    const today = new Date().toISOString().split('T')[0]
    const isOverdue = (assignment.status === 'pendente' || assignment.status === 'preparando' || assignment.status === 'a_enviar') &&
        !!assignment.scheduled_ship_date && assignment.scheduled_ship_date < today

    return (
        <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true">
            <button
                type="button"
                onClick={onClose}
                className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm"
                aria-label="Fechar"
            />
            <aside className="relative ml-auto w-full max-w-md bg-white shadow-2xl h-full flex flex-col">
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
                    <div className="min-w-0 flex-1">
                        <h2 className="text-base font-semibold text-slate-900 truncate">{contatoNome}</h2>
                        {(assignment.card?.titulo || assignment.occasion) && (
                            <p className="text-xs text-slate-500 truncate flex items-center gap-1 mt-0.5">
                                {assignment.gift_type === 'premium' && <Crown className="h-3 w-3 text-pink-500 shrink-0" />}
                                {assignment.card?.titulo || assignment.occasion}
                            </p>
                        )}
                    </div>
                    {assignment.card_id && (
                        <button
                            type="button"
                            onClick={() => navigate(`/cards/${assignment.card_id}`)}
                            className="ml-2 inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800"
                        >
                            <ExternalLink className="h-3 w-3" /> Card
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={onClose}
                        className="ml-2 p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-md"
                        aria-label="Fechar"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
                    {isOverdue && (
                        <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                            <AlertTriangle className="h-4 w-4 shrink-0" />
                            <span>Envio atrasado — agendado para {formatDate(assignment.scheduled_ship_date)}</span>
                        </div>
                    )}

                    <section>
                        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Status</h3>
                        <div className="grid grid-cols-2 gap-1.5">
                            {STATUS_OPTIONS.map(opt => {
                                const active = assignment.status === opt.value
                                return (
                                    <button
                                        key={opt.value}
                                        type="button"
                                        onClick={() => handleStatusChange(opt.value)}
                                        disabled={updateStatus.isPending}
                                        className={cn(
                                            'inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border transition-colors',
                                            active
                                                ? opt.className + ' border-transparent'
                                                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50',
                                            updateStatus.isPending && 'opacity-60 cursor-wait',
                                        )}
                                    >
                                        {active && <Check className="h-3 w-3" strokeWidth={3} />}
                                        {opt.label}
                                    </button>
                                )
                            })}
                        </div>
                    </section>

                    <section>
                        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                            Observação para o pedido
                        </label>
                        <textarea
                            value={notes}
                            onChange={e => handleNotesChange(e.target.value)}
                            placeholder="Endereço alternativo, preferências, instruções para o pacote…"
                            rows={4}
                            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                        />
                        <p className="mt-1 text-[11px] text-slate-400">
                            {updateNotes.isPending ? 'Salvando…' : 'Salva automaticamente.'}
                        </p>
                    </section>

                    <section>
                        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-2">
                            <Package className="h-3 w-3" /> Itens ({itemCount})
                        </h3>
                        {itemCount === 0 ? (
                            <p className="text-xs text-slate-400 italic">Nenhum item no pacote.</p>
                        ) : (
                            <ul className="space-y-1.5">
                                {assignment.items.map(item => (
                                    <li key={item.id} className="flex items-center justify-between gap-2 px-3 py-2 bg-slate-50 rounded-lg">
                                        <span className="text-sm text-slate-700 truncate" title={getGiftItemName(item)}>
                                            {getGiftItemName(item)}
                                        </span>
                                        <span className="text-xs text-slate-500 tabular-nums shrink-0">
                                            {item.quantity}× {formatBRL(item.unit_price_snapshot)}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        )}
                        <div className="mt-2 flex items-center justify-between text-sm">
                            <span className="text-slate-500">Total</span>
                            <span className="font-semibold text-slate-900 tabular-nums">{formatBRL(totalCost)}</span>
                        </div>
                    </section>

                    <section className="space-y-2">
                        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Entrega</h3>
                        {assignment.delivery_address && (
                            <div className="flex items-start gap-2 text-xs text-slate-600">
                                <MapPin className="h-3.5 w-3.5 text-slate-400 shrink-0 mt-0.5" />
                                <span className="break-words">{assignment.delivery_address}</span>
                            </div>
                        )}
                        {assignment.scheduled_ship_date && (
                            <div className="flex items-center gap-2 text-xs text-slate-600">
                                <Calendar className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                                <span>Envio agendado: {formatDate(assignment.scheduled_ship_date)}</span>
                            </div>
                        )}
                        {assignment.delivery_method && (
                            <div className="flex items-center gap-2 text-xs text-slate-600">
                                <Truck className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                                <span>{assignment.delivery_method}</span>
                            </div>
                        )}
                        {!assignment.delivery_address && !assignment.scheduled_ship_date && !assignment.delivery_method && (
                            <p className="text-xs text-slate-400 italic">Sem dados de entrega.</p>
                        )}
                    </section>
                </div>

                <div className="border-t border-slate-200 px-5 py-3 bg-slate-50">
                    {confirmCancel ? (
                        <div className="flex items-center justify-between gap-2">
                            <span className="text-xs text-slate-700">Cancelar e devolver itens ao estoque?</span>
                            <div className="flex items-center gap-1.5">
                                <button
                                    type="button"
                                    onClick={() => setConfirmCancel(false)}
                                    className="px-2.5 py-1 text-xs text-slate-600 hover:text-slate-900 rounded"
                                >
                                    Não
                                </button>
                                <button
                                    type="button"
                                    onClick={handleCancel}
                                    disabled={cancelStatus.isPending}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-white bg-red-600 hover:bg-red-700 rounded disabled:opacity-60"
                                >
                                    {cancelStatus.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                                    Cancelar
                                </button>
                            </div>
                        </div>
                    ) : (
                        <button
                            type="button"
                            onClick={() => setConfirmCancel(true)}
                            disabled={assignment.status === 'cancelado'}
                            className="inline-flex items-center gap-1.5 text-xs text-red-600 hover:text-red-800 disabled:opacity-50"
                        >
                            <Trash2 className="h-3 w-3" /> Cancelar presente
                        </button>
                    )}
                </div>
            </aside>
        </div>
    )
}
