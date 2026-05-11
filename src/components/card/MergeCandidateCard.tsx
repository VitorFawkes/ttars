import type { ReactNode } from 'react'
import { Check, Calendar, Package, AlertTriangle, MapPin, Trophy, XCircle, CircleDot } from 'lucide-react'
import { cn } from '@/lib/utils'
import { highlightMatch } from '@/lib/highlightMatch'

export interface MergeCandidate {
    id: string
    titulo: string | null
    valor_display: number | null
    pessoa_principal_id: string | null
    pessoa_principal_nome: string | null
    data_viagem_inicio: string | null
    dias_ate_viagem: number | null
    destinos: unknown
    etapa_nome: string | null
    fase: string | null
    dono_relevante_nome: string | null
    dono_relevante_role: 'sdr' | 'planner' | 'pos' | 'concierge' | null
    status_comercial: string | null
    is_group_parent: boolean
    parent_card_id: string | null
    parent_card_title: string | null
    card_type: string | null
    prods_total: number
    tempo_sem_contato: number | null
    archived_at: string | null
    match_reason: 'mesmo_contato' | 'titulo' | 'contato' | 'outro'
}

interface Props {
    candidate: MergeCandidate
    selected: boolean
    searchTerm: string
    onSelect: () => void
}

const formatBRL = (value: number | null | undefined) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0)

const formatDateBR = (iso: string | null) => {
    if (!iso) return null
    const [y, m, d] = iso.split('-')
    return `${d}/${m}/${y}`
}

function getInitials(name: string | null): string {
    if (!name) return '?'
    const parts = name.trim().split(/\s+/).filter(Boolean)
    if (parts.length === 0) return '?'
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

const AVATAR_COLORS = [
    'bg-rose-100 text-rose-700',
    'bg-orange-100 text-orange-700',
    'bg-amber-100 text-amber-700',
    'bg-lime-100 text-lime-700',
    'bg-emerald-100 text-emerald-700',
    'bg-teal-100 text-teal-700',
    'bg-sky-100 text-sky-700',
    'bg-indigo-100 text-indigo-700',
    'bg-violet-100 text-violet-700',
    'bg-pink-100 text-pink-700',
]

function getAvatarColor(seed: string | null): string {
    if (!seed) return 'bg-slate-100 text-slate-600'
    let hash = 0
    for (let i = 0; i < seed.length; i++) {
        hash = (hash * 31 + seed.charCodeAt(i)) | 0
    }
    return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

function getDestinosResumo(destinos: unknown): string | null {
    if (!destinos) return null
    if (Array.isArray(destinos)) {
        const nomes = destinos
            .map(d => {
                if (typeof d === 'string') return d
                if (d && typeof d === 'object') {
                    const obj = d as Record<string, unknown>
                    return (obj.nome ?? obj.cidade ?? obj.label ?? obj.name ?? null) as string | null
                }
                return null
            })
            .filter((s): s is string => !!s && s.trim().length > 0)
        if (nomes.length === 0) return null
        if (nomes.length === 1) return nomes[0]
        if (nomes.length === 2) return `${nomes[0]} → ${nomes[1]}`
        return `${nomes[0]} → ${nomes[nomes.length - 1]} (+${nomes.length - 2})`
    }
    return null
}

const ROLE_LABEL: Record<string, string> = {
    sdr: 'SDR',
    planner: 'Planner',
    pos: 'Pós',
    concierge: 'Concierge',
}

function StatusIndicator({ status }: { status: string | null }): ReactNode {
    if (!status) return null
    if (status === 'ganho') {
        return (
            <span className="inline-flex items-center gap-0.5 text-emerald-700 text-[11px] font-medium">
                <Trophy className="w-3 h-3" /> ganho
            </span>
        )
    }
    if (status === 'perdido') {
        return (
            <span className="inline-flex items-center gap-0.5 text-rose-600 text-[11px] font-medium">
                <XCircle className="w-3 h-3" /> perdido
            </span>
        )
    }
    return (
        <span className="inline-flex items-center gap-0.5 text-slate-500 text-[11px]">
            <CircleDot className="w-3 h-3" /> aberto
        </span>
    )
}

function WarningChip({ children }: { children: ReactNode }) {
    return (
        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-700 border border-amber-200">
            <AlertTriangle className="w-2.5 h-2.5" /> {children}
        </span>
    )
}

function MatchReasonChip({ reason }: { reason: MergeCandidate['match_reason'] }) {
    if (reason === 'mesmo_contato') {
        return (
            <span className="text-[10px] text-slate-500 italic">mesmo contato</span>
        )
    }
    if (reason === 'titulo') {
        return (
            <span className="text-[10px] text-indigo-600 italic">match no título</span>
        )
    }
    if (reason === 'contato') {
        return (
            <span className="text-[10px] text-indigo-600 italic">match no contato</span>
        )
    }
    return null
}

export function MergeCandidateCard({ candidate, selected, searchTerm, onSelect }: Props) {
    const valor = candidate.valor_display ?? 0
    const initials = getInitials(candidate.pessoa_principal_nome)
    const avatarColor = getAvatarColor(candidate.pessoa_principal_id)
    const destinosResumo = getDestinosResumo(candidate.destinos)
    const dataInicio = formatDateBR(candidate.data_viagem_inicio)
    const diasAteViagem = candidate.dias_ate_viagem
    const isPosVenda = candidate.fase?.toLowerCase().includes('pos') || candidate.fase?.toLowerCase().includes('pós')

    const dataLabel = dataInicio
        ? diasAteViagem !== null && diasAteViagem !== undefined
            ? diasAteViagem > 0
                ? `${dataInicio} (em ${diasAteViagem}d)`
                : diasAteViagem === 0
                    ? `${dataInicio} (hoje)`
                    : isPosVenda
                        ? `${dataInicio}`
                        : `${dataInicio} (passou)`
            : dataInicio
        : null

    const donoLabel = candidate.dono_relevante_nome
        ? `${candidate.dono_relevante_nome.split(' ')[0]}${candidate.dono_relevante_role ? ` (${ROLE_LABEL[candidate.dono_relevante_role] ?? ''})` : ''}`
        : null

    return (
        <button
            type="button"
            onClick={onSelect}
            className={cn(
                'w-full text-left px-3 py-3 rounded-lg border transition-all',
                selected
                    ? 'border-indigo-500 bg-indigo-50 ring-1 ring-indigo-500'
                    : 'border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-300',
            )}
        >
            <div className="flex items-start gap-3">
                {/* Avatar */}
                <div className={cn(
                    'shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-xs font-semibold',
                    avatarColor,
                )}>
                    {initials}
                </div>

                <div className="flex-1 min-w-0">
                    {/* Linha 1: título + valor */}
                    <div className="flex items-baseline justify-between gap-2">
                        <p className="text-sm font-medium text-slate-900 truncate">
                            {highlightMatch(candidate.titulo || 'Sem título', searchTerm)}
                        </p>
                        <span className="text-sm font-semibold text-slate-900 shrink-0">
                            {formatBRL(valor)}
                        </span>
                    </div>

                    {/* Linha 2: contato · destino */}
                    {(candidate.pessoa_principal_nome || destinosResumo) && (
                        <p className="text-xs text-slate-600 mt-0.5 truncate">
                            {candidate.pessoa_principal_nome && (
                                <span>{highlightMatch(candidate.pessoa_principal_nome, searchTerm)}</span>
                            )}
                            {candidate.pessoa_principal_nome && destinosResumo && <span className="text-slate-300"> · </span>}
                            {destinosResumo && (
                                <span className="inline-flex items-center gap-0.5">
                                    <MapPin className="w-3 h-3 inline text-slate-400" />
                                    {destinosResumo}
                                </span>
                            )}
                        </p>
                    )}

                    {/* Linha 3: etapa · status · dono · dias sem contato */}
                    <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                        {candidate.etapa_nome && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-indigo-50 text-indigo-700 border border-indigo-100">
                                {candidate.etapa_nome}
                            </span>
                        )}
                        <StatusIndicator status={candidate.status_comercial} />
                        {donoLabel && (
                            <span className="text-[11px] text-slate-500">{donoLabel}</span>
                        )}
                        {candidate.tempo_sem_contato !== null && candidate.tempo_sem_contato !== undefined && candidate.tempo_sem_contato >= 7 && (
                            <span className={cn(
                                'text-[11px]',
                                candidate.tempo_sem_contato >= 30 ? 'text-rose-600 font-medium' : 'text-amber-600',
                            )}>
                                · {candidate.tempo_sem_contato}d sem contato
                            </span>
                        )}
                    </div>

                    {/* Linha 4: data viagem + produtos + alertas */}
                    <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-500 flex-wrap">
                        {dataLabel && (
                            <span className="inline-flex items-center gap-0.5">
                                <Calendar className="w-3 h-3" />
                                {dataLabel}
                            </span>
                        )}
                        {dataLabel && <span className="text-slate-300">·</span>}
                        <span className="inline-flex items-center gap-0.5">
                            <Package className="w-3 h-3" />
                            {candidate.prods_total} produto{candidate.prods_total === 1 ? '' : 's'}
                        </span>
                        {candidate.is_group_parent && <WarningChip>Grupo pai</WarningChip>}
                        {candidate.card_type === 'sub_card' && <WarningChip>Sub-card</WarningChip>}
                        {candidate.parent_card_id && !candidate.is_group_parent && candidate.card_type !== 'sub_card' && (
                            <WarningChip>Vinculado a grupo</WarningChip>
                        )}
                        {candidate.archived_at && <WarningChip>Arquivado</WarningChip>}
                        <span className="ml-auto">
                            <MatchReasonChip reason={candidate.match_reason} />
                        </span>
                    </div>
                </div>

                {selected && (
                    <Check className="w-4 h-4 text-indigo-600 shrink-0 mt-1" />
                )}
            </div>
        </button>
    )
}
