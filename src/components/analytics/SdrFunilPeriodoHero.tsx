import { Inbox, MessageCircle, CalendarCheck, CheckCircle2, Trophy, XCircle } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import KpiCard from './KpiCard'
import { useSdrFunilPeriodo } from '@/hooks/analytics/useSdrFunilPeriodo'
import { useAnalyticsFilters } from '@/hooks/analytics/useAnalyticsFilters'
import { useDrillDownStore, type DrillDownCard } from '@/hooks/analytics/useAnalyticsDrillDown'
import { supabase } from '@/lib/supabase'

type Metric = 'entraram' | 'conectaram' | 'agendaram' | 'realizaram' | 'qualificados' | 'desqualificados'

function pctOf(num: number, denom: number): string {
  if (!denom) return '·'
  return `${Math.round((num / denom) * 100)}%`
}

/**
 * Topo da tela SDR — funil de pré-venda POR PERÍODO, na linguagem da gestora.
 * Cada número conta o que aconteceu dentro do período selecionado (throughput) e é clicável
 * para ver os leads. Substitui os KPIs antigos que mostravam a "foto do agora" (subcontavam)
 * e rotulavam métricas erradas. Ver useSdrFunilPeriodo / migration 20260622a.
 */
export default function SdrFunilPeriodoHero() {
  const { data, isLoading } = useSdrFunilPeriodo()
  const { dateRange, product, ownerIds, origins, tagIds } = useAnalyticsFilters()
  const drill = useDrillDownStore()

  const d = data ?? {
    entraram: 0, conectaram: 0, agendaram_reuniao: 0,
    realizaram_reuniao: 0, qualificados: 0, desqualificados: 0,
  }

  const openDrill = (metric: Metric, label: string) => {
    drill.open({
      label,
      contextIcon: metric === 'desqualificados' ? 'lost' : 'stage',
      presetKey: `sdr_funil:${metric}:${dateRange.start}:${dateRange.end}:${product}:${ownerIds.join(',')}:${origins.join(',')}:${tagIds.join(',')}`,
      presetLoader: async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPC tipada via JSON
        const { data: rows, error } = await (supabase.rpc as any)('analytics_sdr_funil_periodo_cards', {
          p_metric: metric,
          p_date_start: dateRange.start,
          p_date_end: dateRange.end,
          p_product: product,
          p_owner_ids: ownerIds.length > 0 ? ownerIds : undefined,
          p_origens: origins.length > 0 ? origins : undefined,
          p_tag_ids: tagIds.length > 0 ? tagIds : undefined,
        })
        if (error) throw error
        return (rows as DrillDownCard[] | null) ?? []
      },
    })
  }

  const cards: Array<{
    metric: Metric
    title: string
    value: number
    subtitle: string
    icon: LucideIcon
    color: string
    bgColor: string
  }> = [
    {
      metric: 'entraram', title: 'Entraram (novos leads)', value: d.entraram,
      subtitle: 'leads que chegaram no período', icon: Inbox,
      color: 'text-blue-600', bgColor: 'bg-blue-50',
    },
    {
      metric: 'conectaram', title: 'Conectaram', value: d.conectaram,
      subtitle: `${pctOf(d.conectaram, d.entraram)} dos que entraram`, icon: MessageCircle,
      color: 'text-indigo-600', bgColor: 'bg-indigo-50',
    },
    {
      metric: 'agendaram', title: 'Agendaram reunião', value: d.agendaram_reuniao,
      subtitle: `${pctOf(d.agendaram_reuniao, d.conectaram)} dos conectados`, icon: CalendarCheck,
      color: 'text-purple-600', bgColor: 'bg-purple-50',
    },
    {
      metric: 'realizaram', title: 'Realizaram a reunião', value: d.realizaram_reuniao,
      subtitle: `${pctOf(d.realizaram_reuniao, d.agendaram_reuniao)} das agendadas`, icon: CheckCircle2,
      color: 'text-amber-600', bgColor: 'bg-amber-50',
    },
    {
      metric: 'qualificados', title: 'Qualificados pelo SDR', value: d.qualificados,
      subtitle: `viraram oportunidade · ${pctOf(d.qualificados, d.realizaram_reuniao)} das realizadas`, icon: Trophy,
      color: 'text-emerald-600', bgColor: 'bg-emerald-50',
    },
    {
      metric: 'desqualificados', title: 'Desqualificados pelo SDR', value: d.desqualificados,
      subtitle: 'leads descartados na pré-venda', icon: XCircle,
      color: 'text-rose-600', bgColor: 'bg-rose-50',
    },
  ]

  return (
    <div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {cards.map(c => (
          <KpiCard
            key={c.metric}
            title={c.title}
            value={c.value.toLocaleString('pt-BR')}
            subtitle={c.subtitle}
            icon={c.icon}
            color={c.color}
            bgColor={c.bgColor}
            isLoading={isLoading}
            onClick={() => openDrill(c.metric, c.title)}
            clickHint="Ver leads →"
          />
        ))}
      </div>
      <p className="text-[11px] text-slate-400 mt-2">
        Conta o que aconteceu <strong>no período selecionado</strong> (movimentações registradas no funil),
        não a foto do momento. Clique em qualquer card para ver os leads.
      </p>
    </div>
  )
}
