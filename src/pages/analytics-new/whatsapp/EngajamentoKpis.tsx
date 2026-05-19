import { Users, MessageCircle, Snowflake, Clock, Activity, Trophy, TrendingDown, MessageSquare } from 'lucide-react'
import KpiCard from '@/components/analytics/KpiCard'
import type { EngajamentoKpis } from '@/types/engagement'

interface Props {
  kpis: EngajamentoKpis | undefined
  isLoading?: boolean
}

function pct(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  return `${value.toFixed(1)}%`
}

function hours(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  if (value < 1) return `${Math.round(value * 60)}min`
  if (value < 24) return `${value.toFixed(1)}h`
  return `${(value / 24).toFixed(1)}d`
}

function num(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  return value.toFixed(1)
}

export default function EngajamentoKpis({ kpis, isLoading }: Props) {
  const cards = [
    {
      title: 'Pessoas no período',
      value: kpis?.total_contacts ?? 0,
      icon: Users,
      color: 'text-indigo-600',
      bgColor: 'bg-indigo-50',
      subtitle: 'contatos únicos com mensagens',
    },
    {
      title: 'Taxa de Resposta',
      value: pct(kpis?.reply_rate),
      icon: MessageCircle,
      color: 'text-emerald-600',
      bgColor: 'bg-emerald-50',
      subtitle: 'responderam pelo menos 1×',
    },
    {
      title: '1ª resposta nossa',
      value: hours(kpis?.frt_median_hours),
      icon: Clock,
      color: 'text-sky-600',
      bgColor: 'bg-sky-50',
      subtitle: 'mediana até o lead receber',
    },
    {
      title: 'Profundidade média',
      value: num(kpis?.depth_avg),
      icon: MessageSquare,
      color: 'text-violet-600',
      bgColor: 'bg-violet-50',
      subtitle: 'mensagens recebidas por pessoa',
    },
    {
      title: 'Respondeu e sumiu',
      value: pct(kpis?.responded_once_left_pct),
      icon: TrendingDown,
      color: 'text-amber-600',
      bgColor: 'bg-amber-50',
      subtitle: 'só 1 inbound e parou 48h+',
    },
    {
      title: 'Nunca respondeu',
      value: pct(kpis?.cold_pct),
      icon: Snowflake,
      color: 'text-slate-600',
      bgColor: 'bg-slate-100',
      subtitle: 'contatos sem nenhum inbound',
    },
    {
      title: 'Ativas agora',
      value: kpis?.active_count ?? 0,
      icon: Activity,
      color: 'text-rose-600',
      bgColor: 'bg-rose-50',
      subtitle: 'inbound nos últimos 7 dias',
    },
    {
      title: 'Taxa de Ganho',
      value: pct(kpis?.win_rate),
      icon: Trophy,
      color: 'text-yellow-600',
      bgColor: 'bg-yellow-50',
      subtitle: 'viraram card ganho ou SDR ganho',
    },
  ]

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {cards.map(card => (
        <KpiCard
          key={card.title}
          title={card.title}
          value={card.value}
          icon={card.icon}
          color={card.color}
          bgColor={card.bgColor}
          subtitle={card.subtitle}
          isLoading={isLoading}
        />
      ))}
    </div>
  )
}
