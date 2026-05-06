import { X } from 'lucide-react'
import { cn } from '../../lib/utils'
import { useFilterOptions } from '../../hooks/useFilterOptions'
import { TASK_TYPE_CONFIG, ORIGEM_CONFIG, PRIORIDADE_CONFIG, OUTCOME_LABELS } from './taskTypeConfig'
import type { TaskFilterState, TaskSituacao } from '../../hooks/useTaskFilters'

const FASE_LABELS: Record<string, string> = {
    sdr: 'SDR',
    planner: 'Planner',
    'pos-venda': 'Pós-venda',
    concierge: 'Concierge',
    resolucao: 'Resolução',
}

const SITUACAO_LABELS: Record<TaskSituacao, string> = {
    abertas: 'Abertas',
    atrasadas: 'Atrasadas',
    hoje: 'Hoje',
    esta_semana: 'Esta semana',
    concluidas: 'Concluídas',
    reagendadas: 'Reagendadas',
    canceladas: 'Canceladas',
    tudo: 'Tudo',
}

const STATUS_COMERCIAL_LABELS: Record<string, string> = {
    aberto: 'Em aberto',
    ganho: 'Ganho',
    perdido: 'Perdido',
    sem_pos_venda: 'Sem pós-venda',
}

const URGENCIA_LABELS: Record<string, string> = {
    sem_responsavel: 'Sem responsável',
    sem_prazo: 'Sem prazo',
    sem_descricao: 'Sem descrição',
    sem_resultado: 'Concluída sem resultado',
}

interface Props {
    filters: TaskFilterState
    setFilters: (partial: Partial<TaskFilterState>) => void
    onReset: () => void
}

type Tone = 'blue' | 'green' | 'amber' | 'rose' | 'violet' | 'slate'

export function ActiveTaskFilters({ filters, setFilters, onReset }: Props) {
    const { data: options } = useFilterOptions()
    const profiles = options?.profiles || []

    const chips: { key: string; label: string; tone: Tone; onRemove: () => void }[] = []

    if (filters.search) {
        chips.push({ key: 'search', label: `“${filters.search}”`, tone: 'blue', onRemove: () => setFilters({ search: '' }) })
    }

    if (filters.situacao !== 'abertas') {
        const tone: Tone = filters.situacao === 'atrasadas' ? 'rose'
            : filters.situacao === 'concluidas' ? 'green'
            : filters.situacao === 'canceladas' ? 'slate'
            : 'amber'
        chips.push({
            key: 'situacao',
            label: SITUACAO_LABELS[filters.situacao],
            tone,
            onRemove: () => setFilters({ situacao: 'abertas' }),
        })
    }

    if (filters.situacao === 'concluidas' && filters.janelaConclusao !== 'sempre' && !filters.conclusaoFrom && !filters.conclusaoTo) {
        const labels: Record<string, string> = {
            hoje: 'Hoje', ontem: 'Ontem', esta_semana: 'Esta semana', este_mes: 'Este mês',
        }
        chips.push({
            key: 'janela',
            label: `Concluídas: ${labels[filters.janelaConclusao]}`,
            tone: 'green',
            onRemove: () => setFilters({ janelaConclusao: 'sempre' }),
        })
    }

    if (filters.scope !== 'minhas') {
        chips.push({
            key: 'scope',
            label: filters.scope === 'meu_time' ? 'Meu time' : 'Todas',
            tone: 'blue',
            onRemove: () => setFilters({ scope: 'minhas' }),
        })
    }

    filters.tipos.forEach((tipo) => {
        const cfg = TASK_TYPE_CONFIG[tipo]
        chips.push({
            key: `tipo:${tipo}`,
            label: `Tipo: ${cfg?.label || tipo}`,
            tone: 'blue',
            onRemove: () => setFilters({ tipos: filters.tipos.filter(t => t !== tipo) }),
        })
    })

    filters.prioridades.forEach((p) => {
        const cfg = PRIORIDADE_CONFIG[p]
        chips.push({
            key: `prio:${p}`,
            label: `Prioridade: ${cfg?.label || p}`,
            tone: p === 'alta' ? 'rose' : 'amber',
            onRemove: () => setFilters({ prioridades: filters.prioridades.filter(x => x !== p) }),
        })
    })

    filters.origens.forEach((o) => {
        const cfg = ORIGEM_CONFIG[o]
        chips.push({
            key: `origem:${o}`,
            label: `Origem: ${cfg?.label || o}`,
            tone: 'blue',
            onRemove: () => setFilters({ origens: filters.origens.filter(x => x !== o) }),
        })
    })

    filters.resultados.forEach((r) => {
        chips.push({
            key: `resultado:${r}`,
            label: `Resultado: ${OUTCOME_LABELS[r] || r}`,
            tone: 'green',
            onRemove: () => setFilters({ resultados: filters.resultados.filter(x => x !== r) }),
        })
    })

    filters.fases.forEach((slug) => {
        chips.push({
            key: `fase:${slug}`,
            label: `Fase resp.: ${FASE_LABELS[slug] || slug}`,
            tone: 'blue',
            onRemove: () => setFilters({ fases: filters.fases.filter(x => x !== slug) }),
        })
    })

    filters.responsavelIds.forEach((id) => {
        const profile = profiles.find(p => p.id === id)
        const name = profile?.full_name || profile?.email || id.slice(0, 6)
        chips.push({
            key: `quem:${id}`,
            label: `Pessoa: ${name}`,
            tone: 'blue',
            onRemove: () => setFilters({ responsavelIds: filters.responsavelIds.filter(x => x !== id) }),
        })
    })

    filters.cardFases.forEach((slug) => {
        chips.push({
            key: `cardfase:${slug}`,
            label: `Viagem em: ${FASE_LABELS[slug] || slug}`,
            tone: 'violet',
            onRemove: () => setFilters({ cardFases: filters.cardFases.filter(x => x !== slug) }),
        })
    })

    filters.cardStatusComercial.forEach((s) => {
        const tone: Tone = s === 'ganho' ? 'green' : s === 'perdido' ? 'rose' : 'blue'
        chips.push({
            key: `cardstatus:${s}`,
            label: `Viagem: ${STATUS_COMERCIAL_LABELS[s] || s}`,
            tone,
            onRemove: () => setFilters({ cardStatusComercial: filters.cardStatusComercial.filter(x => x !== s) }),
        })
    })

    filters.urgencia.forEach((u) => {
        chips.push({
            key: `urgencia:${u}`,
            label: URGENCIA_LABELS[u] || u,
            tone: 'amber',
            onRemove: () => setFilters({ urgencia: filters.urgencia.filter(x => x !== u) }),
        })
    })

    if (typeof filters.atrasadaMaisDias === 'number') {
        chips.push({
            key: 'atraso',
            label: `Atraso > ${filters.atrasadaMaisDias} dias`,
            tone: 'rose',
            onRemove: () => setFilters({ atrasadaMaisDias: undefined }),
        })
    }

    if (filters.vencimentoFrom || filters.vencimentoTo) {
        chips.push({
            key: 'venc',
            label: `Vencimento: ${formatRange(filters.vencimentoFrom, filters.vencimentoTo)}`,
            tone: 'amber',
            onRemove: () => setFilters({ vencimentoFrom: undefined, vencimentoTo: undefined }),
        })
    }
    if (filters.criacaoFrom || filters.criacaoTo) {
        chips.push({
            key: 'cria',
            label: `Criação: ${formatRange(filters.criacaoFrom, filters.criacaoTo)}`,
            tone: 'blue',
            onRemove: () => setFilters({ criacaoFrom: undefined, criacaoTo: undefined }),
        })
    }
    if (filters.conclusaoFrom || filters.conclusaoTo) {
        chips.push({
            key: 'concl',
            label: `Conclusão: ${formatRange(filters.conclusaoFrom, filters.conclusaoTo)}`,
            tone: 'green',
            onRemove: () => setFilters({ conclusaoFrom: undefined, conclusaoTo: undefined }),
        })
    }

    if (chips.length === 0) return null

    return (
        <div className="flex items-center gap-2 flex-wrap">
            {chips.map(c => (
                <Chip key={c.key} tone={c.tone} onRemove={c.onRemove}>
                    {c.label}
                </Chip>
            ))}
            <button
                onClick={onReset}
                className="text-xs text-slate-500 hover:text-slate-700 underline ml-1"
            >
                Limpar tudo
            </button>
        </div>
    )
}

function Chip({
    children,
    tone,
    onRemove,
}: {
    children: React.ReactNode
    tone: Tone
    onRemove: () => void
}) {
    const tones: Record<Tone, string> = {
        blue:    'bg-indigo-50 border-indigo-200 text-indigo-700',
        green:   'bg-emerald-50 border-emerald-200 text-emerald-700',
        amber:   'bg-amber-50 border-amber-200 text-amber-700',
        rose:    'bg-rose-50 border-rose-200 text-rose-700',
        violet:  'bg-violet-50 border-violet-200 text-violet-700',
        slate:   'bg-slate-100 border-slate-200 text-slate-700',
    }
    return (
        <span className={cn(
            'inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-medium rounded-full border',
            tones[tone],
        )}>
            {children}
            <button
                onClick={onRemove}
                className="opacity-60 hover:opacity-100"
                aria-label="Remover filtro"
            >
                <X className="h-3 w-3" />
            </button>
        </span>
    )
}

function formatRange(from?: string, to?: string): string {
    const f = from ? formatDateBr(from) : '...'
    const t = to ? formatDateBr(to) : '...'
    return `${f} → ${t}`
}

function formatDateBr(iso: string): string {
    const [y, m, d] = iso.split('-')
    return `${d}/${m}/${y.slice(2)}`
}
