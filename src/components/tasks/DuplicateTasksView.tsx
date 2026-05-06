import { useMemo, useState } from 'react'
import { Copy, ChevronDown, ChevronRight, AlertCircle } from 'lucide-react'
import { useDuplicateTasks } from '../../hooks/useDuplicateTasks'
import { DuplicateGroupRow } from './DuplicateGroupRow'
import type { TaskScopeFilter } from '../../hooks/useTaskFilters'
import type { DuplicateTaskGroup } from '../../hooks/useDuplicateTasks'

interface Props {
    scope: TaskScopeFilter
    selectedIds: Set<string>
    onToggleSelect: (id: string) => void
    onSetMany: (ids: string[], selected: boolean) => void
}

export function DuplicateTasksView({ scope, selectedIds, onToggleSelect, onSetMany }: Props) {
    const { data: groups, isLoading, error } = useDuplicateTasks({ scope })
    const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set())
    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())

    const byCard = useMemo(() => {
        if (!groups) return []
        const map = new Map<string, { card_id: string; card_titulo: string | null; card_produto: string | null; card_stage_nome: string | null; contato_nome: string | null; total_extras: number; groups: DuplicateTaskGroup[] }>()
        for (const g of groups) {
            const key = g.card_id
            if (!map.has(key)) {
                map.set(key, {
                    card_id: g.card_id,
                    card_titulo: g.card_titulo,
                    card_produto: g.card_produto,
                    card_stage_nome: g.card_stage_nome,
                    contato_nome: g.contato_nome,
                    total_extras: 0,
                    groups: [],
                })
            }
            const entry = map.get(key)!
            entry.groups.push(g)
            entry.total_extras += g.qtd - 1
        }
        return Array.from(map.values()).sort((a, b) => b.total_extras - a.total_extras)
    }, [groups])

    if (isLoading) {
        return (
            <div className="px-6 py-8 space-y-3">
                {[1, 2, 3].map(i => (
                    <div key={i} className="h-20 bg-slate-100 rounded-lg animate-pulse" />
                ))}
            </div>
        )
    }

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center py-20 text-rose-500">
                <AlertCircle className="h-12 w-12 mb-3 stroke-1" />
                <p className="text-sm font-medium">Erro ao buscar duplicadas</p>
                <p className="text-xs mt-1 text-rose-400">{(error as Error).message}</p>
            </div>
        )
    }

    if (byCard.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                <Copy className="h-12 w-12 mb-3 stroke-1" />
                <p className="text-sm font-medium text-slate-600">Nenhuma duplicata encontrada</p>
                <p className="text-xs mt-1">Não há tarefas duplicadas no escopo atual. ✨</p>
            </div>
        )
    }

    const toggleCard = (id: string) => {
        setExpandedCards(prev => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
    }

    const toggleGroup = (key: string) => {
        setExpandedGroups(prev => {
            const next = new Set(prev)
            if (next.has(key)) next.delete(key)
            else next.add(key)
            return next
        })
    }

    return (
        <div className="px-6 py-4 space-y-3">
            <div className="flex items-center gap-2 text-xs text-slate-500 mb-2">
                <Copy className="h-3.5 w-3.5" />
                <span>
                    {byCard.length} {byCard.length === 1 ? 'viagem' : 'viagens'} com duplicadas — ordenadas por nº de tarefas extras
                </span>
            </div>

            {byCard.map((card) => {
                const open = expandedCards.has(card.card_id)
                return (
                    <div key={card.card_id} className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                        <button
                            onClick={() => toggleCard(card.card_id)}
                            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors text-left"
                        >
                            {open ? (
                                <ChevronDown className="h-4 w-4 text-slate-400 flex-shrink-0" />
                            ) : (
                                <ChevronRight className="h-4 w-4 text-slate-400 flex-shrink-0" />
                            )}
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                    <a
                                        href={`/cards/${card.card_id}`}
                                        onClick={(e) => e.stopPropagation()}
                                        className="text-sm font-semibold text-slate-900 hover:text-indigo-700 truncate"
                                    >
                                        {card.card_titulo || 'Sem título'}
                                    </a>
                                    {card.card_stage_nome && (
                                        <span className="text-[11px] px-1.5 py-0.5 rounded border border-slate-200 bg-slate-50 text-slate-600 font-medium">
                                            {card.card_stage_nome}
                                        </span>
                                    )}
                                </div>
                                <div className="text-xs text-slate-500 mt-0.5 truncate">
                                    {card.contato_nome || '—'} · {card.groups.length} {card.groups.length === 1 ? 'grupo' : 'grupos'} de duplicatas
                                </div>
                            </div>
                            <span className="flex-shrink-0 px-2 py-0.5 text-[11px] font-bold rounded-full bg-rose-100 text-rose-700 whitespace-nowrap">
                                {card.total_extras} {card.total_extras === 1 ? 'extra' : 'extras'}
                            </span>
                        </button>

                        {open && (
                            <div className="border-t border-slate-100 p-3 space-y-2 bg-slate-50/30">
                                {card.groups.map((group) => {
                                    const key = `${group.card_id}|${group.tipo}|${group.titulo_norm}`
                                    return (
                                        <DuplicateGroupRow
                                            key={key}
                                            group={group}
                                            expanded={expandedGroups.has(key)}
                                            onToggle={() => toggleGroup(key)}
                                            selectedIds={selectedIds}
                                            onToggleSelect={onToggleSelect}
                                            onSelectAllExceptOldest={() => {
                                                const ordered = [...group.items].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
                                                const ids = ordered.slice(1).map(i => i.id)
                                                onSetMany(ids, true)
                                            }}
                                            onSelectAllExceptNewest={() => {
                                                const ordered = [...group.items].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
                                                const ids = ordered.slice(0, ordered.length - 1).map(i => i.id)
                                                onSetMany(ids, true)
                                            }}
                                        />
                                    )
                                })}
                            </div>
                        )}
                    </div>
                )
            })}
        </div>
    )
}

