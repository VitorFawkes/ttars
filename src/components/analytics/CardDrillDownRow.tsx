import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import type { DrillDownCard, DrillSource } from '@/hooks/analytics/useAnalyticsDrillDown'
import { getPhaseBadgeClass } from '@/lib/pipeline/phaseLabels'
import { formatCurrency } from '@/utils/whatsappFormatters'
import { cn } from '@/lib/utils'

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  ganho: { label: 'Ganho', cls: 'bg-emerald-100 text-emerald-700' },
  perdido: { label: 'Perdido', cls: 'bg-rose-100 text-rose-700' },
  aberto: { label: 'Aberto', cls: 'bg-blue-100 text-blue-700' },
}

const AVATAR_COLORS = [
  'bg-indigo-500', 'bg-violet-500', 'bg-pink-500', 'bg-amber-500', 'bg-emerald-500',
  'bg-blue-500', 'bg-purple-500', 'bg-rose-500', 'bg-teal-500', 'bg-orange-500',
]

function getInitials(name: string | null): string {
  if (!name) return '—'
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function getAvatarColor(seed: string | null): string {
  if (!seed) return 'bg-slate-400'
  let hash = 0
  for (let i = 0; i < seed.length; i++) hash = seed.charCodeAt(i) + ((hash << 5) - hash)
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
}

function daysSince(iso: string | null): number | null {
  if (!iso) return null
  const d = new Date(iso)
  if (isNaN(d.getTime())) return null
  return Math.max(0, Math.round((Date.now() - d.getTime()) / 86400000))
}

/** Contexto-tempo da linha 2, que muda conforme o que foi clicado. */
function timeContext(row: DrillDownCard, source?: DrillSource): string {
  if (row.extra_label) return row.extra_label // forecast: "fecha em 5 dias" / "12 dias de atraso"
  switch (source) {
    case 'current_stage': {
      const d = daysSince(row.stage_entered_at)
      return d != null ? `na etapa há ${d} ${d === 1 ? 'dia' : 'dias'}` : 'na etapa'
    }
    case 'closed_deals':
      return `ganho em ${fmtDate(row.data_fechamento)}`
    case 'lost_deals':
      return `perdido em ${fmtDate(row.data_fechamento)}`
    case 'stage_entries':
    case 'macro_funnel':
      return `entrou em ${fmtDate(row.stage_entered_at ?? row.created_at)}`
    default:
      return `criado em ${fmtDate(row.created_at)}`
  }
}

export default function CardDrillDownRow({ row, source }: { row: DrillDownCard; source?: DrillSource }) {
  const status = STATUS_BADGE[row.status_comercial] ?? { label: row.status_comercial || '—', cls: 'bg-slate-100 text-slate-600' }
  const initials = getInitials(row.dono_atual_nome)
  const avatarColor = getAvatarColor(row.dono_atual_nome)

  return (
    <Link
      to={`/cards/${row.id}`}
      className="group flex items-center gap-3 px-4 py-3 border-b border-slate-100 hover:bg-slate-50 transition-colors"
    >
      <div className="flex-1 min-w-0">
        {/* Linha 1: título + valor */}
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-slate-800 truncate group-hover:text-indigo-700" title={row.titulo}>
            {row.titulo || '(sem título)'}
          </span>
          {row.pessoa_nome && (
            <span className="text-[11px] text-slate-400 truncate hidden sm:inline">· {row.pessoa_nome}</span>
          )}
        </div>
        {/* Linha 2: dono · etapa · status · contexto-tempo */}
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <span className="flex items-center gap-1.5 text-[11px] text-slate-500">
            <span className={cn('w-4 h-4 rounded-full text-white text-[8px] font-bold flex items-center justify-center shrink-0', avatarColor)}>
              {initials}
            </span>
            <span className="truncate max-w-[120px]">{row.dono_atual_nome || 'Sem responsável'}</span>
          </span>
          {row.etapa_nome && (
            <span className={cn('inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border', getPhaseBadgeClass(row.fase))}>
              {row.etapa_nome}
            </span>
          )}
          <span className={cn('inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium', status.cls)}>
            {status.label}
          </span>
          <span className="text-[11px] text-slate-400">{timeContext(row, source)}</span>
        </div>
      </div>
      <div className="text-right shrink-0">
        <div className="text-sm font-bold text-slate-900 tabular-nums">{formatCurrency(row.valor_display || 0)}</div>
        {row.data_prevista && (
          <div className="text-[10px] text-slate-400 tabular-nums">prev. {fmtDate(row.data_prevista)}</div>
        )}
      </div>
      <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-indigo-400 shrink-0" />
    </Link>
  )
}
