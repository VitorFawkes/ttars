import { useMemo, useState } from 'react'
import { Copy, ChevronDown, ChevronRight, AlertCircle } from 'lucide-react'
import { cn } from '../../lib/utils'
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

type TabKey = 'exact' | 'possible' | 'fuzzy' | 'chain'

const TABS: { key: TabKey; label: string; description: string; toneClass: string }[] = [
    { key: 'exact',    label: 'Quase certas',     description: 'Sinal forte: mesmo passo de cadência, criadas em segundos, mesma importação',  toneClass: 'rose' },
    { key: 'possible', label: 'Possíveis',         description: 'Mesmo título no mesmo card, mas sem sinal forte. Vale revisar antes de excluir', toneClass: 'amber' },
    { key: 'fuzzy',    label: 'Títulos parecidos', description: 'Títulos similares por significado (Criar App / Fazer App)',                       toneClass: 'violet' },
    { key: 'chain',    label: 'Cadeias legítimas', description: 'Reagendamento — provavelmente intencional, não excluir',                          toneClass: 'emerald' },
]

const TONE_BG: Record<string, string> = {
    rose: 'bg-rose-50 text-rose-700 border-rose-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
    violet: 'bg-violet-50 text-violet-700 border-violet-200',
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
}

export function DuplicateTasksView({ scope, selectedIds, onToggleSelect, onSetMany }: Props) {
    const { data: groups, isLoading, error } = useDuplicateTasks({ scope })
    const [activeTab, setActiveTab] = useState<TabKey>('exact')
    const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set())
    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())

    // Contar por tier
    const counts = useMemo(() => {
        const c: Record<TabKey, number> = { exact: 0, possible: 0, fuzzy: 0, chain: 0 }
        if (groups) for (const g of groups) c[g.tier as TabKey]++
        return c
    }, [groups])

    // Filtrar pela aba ativa e agrupar por viagem
    const byCard = useMemo(() => {
        if (!groups) return []
        const filtered = groups.filter(g => g.tier === activeTab)
        const map = new Map<string, {
            card_id: string
            card_titulo: string | null
            card_produto: string | null
            card_stage_nome: string | null
            contato_nome: string | null
            total_extras: number
            groups: DuplicateTaskGroup[]
        }>()
        for (const g of filtered) {
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
    }, [groups, activeTab])

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

    const totalAcrossTiers = counts.exact + counts.possible + counts.fuzzy + counts.chain

    return (
        <div className="px-6 py-4 space-y-3">
            {/* Tabs */}
            <div className="border-b border-slate-200 -mx-6 px-6 pb-px">
                <div className="flex items-center gap-1 overflow-x-auto">
                    {TABS.map((tab) => {
                        const active = activeTab === tab.key
                        const tone = TONE_BG[tab.toneClass]
                        return (
                            <button
                                key={tab.key}
                                onClick={() => setActiveTab(tab.key)}
                                className={cn(
                                    'flex items-center gap-2 px-3 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap',
                                    active
                                        ? 'border-indigo-600 text-slate-900'
                                        : 'border-transparent text-slate-500 hover:text-slate-700',
                                )}
                            >
                                {tab.label}
                                <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded-full border', tone)}>
                                    {counts[tab.key]}
                                </span>
                            </button>
                        )
                    })}
                </div>
            </div>

            {/* Descrição da aba */}
            <div className="text-xs text-slate-500 flex items-start gap-2">
                <Copy className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                <span>{TABS.find(t => t.key === activeTab)!.description}</span>
            </div>

            {byCard.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                    <Copy className="h-12 w-12 mb-3 stroke-1" />
                    <p className="text-sm font-medium text-slate-600">
                        {totalAcrossTiers === 0
                            ? 'Nenhuma duplicata encontrada'
                            : `Nenhum item nesta categoria (${TABS.find(t => t.key === activeTab)!.label})`}
                    </p>
                    {totalAcrossTiers > 0 && (
                        <p className="text-xs mt-1">Tente outra aba — há itens em outras categorias.</p>
                    )}
                </div>
            ) : (
                byCard.map((card) => {
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
                                        {card.contato_nome || '—'} · {card.groups.length} {card.groups.length === 1 ? 'grupo' : 'grupos'}
                                    </div>
                                </div>
                                <span className="flex-shrink-0 px-2 py-0.5 text-[11px] font-bold rounded-full bg-rose-100 text-rose-700 whitespace-nowrap">
                                    {card.total_extras} {card.total_extras === 1 ? 'extra' : 'extras'}
                                </span>
                            </button>

                            {open && (
                                <div className="border-t border-slate-100 p-3 space-y-2 bg-slate-50/30">
                                    {card.groups.map((group, idx) => {
                                        const key = `${group.card_id}|${group.tipo}|${idx}|${group.titulos_distintos.join('+')}`
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
                                                    onSetMany(ordered.slice(1).map(i => i.id), true)
                                                }}
                                                onSelectAllExceptNewest={() => {
                                                    const ordered = [...group.items].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
                                                    onSetMany(ordered.slice(0, ordered.length - 1).map(i => i.id), true)
                                                }}
                                            />
                                        )
                                    })}
                                </div>
                            )}
                        </div>
                    )
                })
            )}
        </div>
    )
}
