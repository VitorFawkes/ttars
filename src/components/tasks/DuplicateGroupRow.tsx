import { useMemo } from 'react'
import { ChevronDown, ChevronRight, Check, X } from 'lucide-react'
import { cn } from '../../lib/utils'
import { useFilterOptions } from '../../hooks/useFilterOptions'
import { TASK_TYPE_CONFIG, ORIGEM_CONFIG } from './taskTypeConfig'
import type { DuplicateTaskGroup } from '../../hooks/useDuplicateTasks'

interface Props {
    group: DuplicateTaskGroup
    expanded: boolean
    onToggle: () => void
    selectedIds: Set<string>
    onToggleSelect: (id: string) => void
    onSelectAllExceptOldest: () => void
    onSelectAllExceptNewest: () => void
}

export function DuplicateGroupRow({
    group,
    expanded,
    onToggle,
    selectedIds,
    onToggleSelect,
    onSelectAllExceptOldest,
    onSelectAllExceptNewest,
}: Props) {
    const { data: options } = useFilterOptions()
    const profiles = options?.profiles || []

    const cfg = TASK_TYPE_CONFIG[group.tipo] || TASK_TYPE_CONFIG.tarefa
    const TipoIcon = cfg.icon

    const orderedItems = useMemo(
        () => [...group.items].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()),
        [group.items],
    )

    const allSelected = orderedItems.every(i => selectedIds.has(i.id))

    return (
        <div className="border border-slate-200 rounded-lg bg-white overflow-hidden">
            {/* Cabeçalho do grupo */}
            <button
                onClick={onToggle}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors text-left"
            >
                {expanded ? (
                    <ChevronDown className="h-4 w-4 text-slate-400 flex-shrink-0" />
                ) : (
                    <ChevronRight className="h-4 w-4 text-slate-400 flex-shrink-0" />
                )}
                <div className={cn('flex h-7 w-7 items-center justify-center rounded-md flex-shrink-0', cfg.bg)}>
                    <TipoIcon className={cn('h-4 w-4', cfg.color)} />
                </div>
                <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-900 truncate">
                        {group.titulo_exemplo || group.titulo_norm}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                        {cfg.label} · {group.qtd} tarefas idênticas
                    </div>
                </div>
                <span className="flex-shrink-0 px-2 py-0.5 text-[11px] font-bold rounded-full bg-rose-100 text-rose-700">
                    {group.qtd}
                </span>
            </button>

            {/* Conteúdo expandido */}
            {expanded && (
                <div className="border-t border-slate-100">
                    {/* Atalhos */}
                    <div className="flex items-center gap-2 flex-wrap px-4 py-2 bg-slate-50 border-b border-slate-100">
                        <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Atalhos:</span>
                        <button
                            onClick={onSelectAllExceptOldest}
                            className="px-2 py-1 text-xs font-medium rounded-md border border-slate-200 bg-white hover:bg-slate-100 text-slate-700"
                        >
                            Manter a mais antiga
                        </button>
                        <button
                            onClick={onSelectAllExceptNewest}
                            className="px-2 py-1 text-xs font-medium rounded-md border border-slate-200 bg-white hover:bg-slate-100 text-slate-700"
                        >
                            Manter a mais recente
                        </button>
                        {allSelected && (
                            <span className="ml-auto text-[11px] text-rose-600 font-medium">
                                Todas selecionadas — pelo menos uma deveria ficar
                            </span>
                        )}
                    </div>

                    {/* Linhas das duplicatas */}
                    <div className="divide-y divide-slate-100">
                        {orderedItems.map((item, idx) => {
                            const responsavel = profiles.find(p => p.id === item.responsavel_id)
                            const isOldest = idx === 0
                            const isNewest = idx === orderedItems.length - 1
                            const origemCfg = ORIGEM_CONFIG[item.origem]
                            return (
                                <div
                                    key={item.id}
                                    className={cn(
                                        'flex items-center gap-3 px-4 py-2.5',
                                        selectedIds.has(item.id) && 'bg-rose-50',
                                    )}
                                >
                                    <input
                                        type="checkbox"
                                        checked={selectedIds.has(item.id)}
                                        onChange={() => onToggleSelect(item.id)}
                                        className="h-4 w-4 rounded border-slate-300 text-rose-600 focus:ring-rose-500"
                                    />
                                    <div className="flex-1 min-w-0 grid grid-cols-1 md:grid-cols-4 gap-2 text-xs">
                                        <div>
                                            <div className="text-[10px] text-slate-400 uppercase tracking-wider">Criada</div>
                                            <div className="text-slate-700">
                                                {formatDateTime(item.created_at)}
                                                {isOldest && <span className="ml-1.5 text-emerald-600 font-medium">+ antiga</span>}
                                                {isNewest && idx !== 0 && <span className="ml-1.5 text-blue-600 font-medium">+ recente</span>}
                                            </div>
                                        </div>
                                        <div>
                                            <div className="text-[10px] text-slate-400 uppercase tracking-wider">Vencimento</div>
                                            <div className="text-slate-700">{item.data_vencimento ? formatDateTime(item.data_vencimento) : 'Sem prazo'}</div>
                                        </div>
                                        <div>
                                            <div className="text-[10px] text-slate-400 uppercase tracking-wider">Responsável</div>
                                            <div className="text-slate-700 truncate">
                                                {responsavel?.full_name || responsavel?.email || (item.responsavel_id ? '—' : 'Sem responsável')}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <div>
                                                <div className="text-[10px] text-slate-400 uppercase tracking-wider">Origem</div>
                                                <span className={cn('inline-block mt-0.5 px-1.5 py-0.5 rounded border text-[10px] font-medium', origemCfg.chip)}>
                                                    {origemCfg.label}
                                                </span>
                                            </div>
                                            {item.concluida && (
                                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-emerald-200 bg-emerald-50 text-emerald-700 text-[10px] font-medium">
                                                    <Check className="h-3 w-3" /> Concluída
                                                </span>
                                            )}
                                            {item.status === 'cancelada' && (
                                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-slate-200 bg-slate-50 text-slate-600 text-[10px] font-medium">
                                                    <X className="h-3 w-3" /> Cancelada
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </div>
            )}
        </div>
    )
}

function formatDateTime(iso: string): string {
    try {
        const d = new Date(iso)
        return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
    } catch {
        return iso
    }
}
