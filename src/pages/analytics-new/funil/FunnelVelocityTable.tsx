import { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'
import ChartCard from '@/components/analytics/ChartCard'
import { cn } from '@/lib/utils'
import type { FunnelVelocityRow } from '@/hooks/analytics/useFunnelVelocity'
import { getPhaseColor } from './constants'

interface Props {
  isLoading: boolean
  rows: FunnelVelocityRow[]
}

type SortKey = 'stage' | 'cards_passaram' | 'cards_atuais' | 'mediana_dias' | 'p90_dias' | 'media_dias'
type SortDir = 'asc' | 'desc'

function durationBadge(days: number): string {
  if (days > 30) return 'text-rose-600 font-semibold'
  if (days > 14) return 'text-amber-600 font-semibold'
  return 'text-slate-700'
}

interface SortHeaderProps {
  label: string
  sortKey: SortKey
  currentKey: SortKey | null
  dir: SortDir
  onToggle: (k: SortKey) => void
  align?: 'left' | 'right'
  title?: string
}

function SortHeader({ label, sortKey, currentKey, dir, onToggle, align = 'right', title }: SortHeaderProps) {
  const active = currentKey === sortKey
  return (
    <button
      type="button"
      onClick={() => onToggle(sortKey)}
      title={title}
      className={cn(
        'inline-flex items-center gap-1 text-slate-500 font-medium hover:text-slate-700',
        align === 'right' ? 'justify-end' : 'justify-start',
        active && 'text-slate-700'
      )}
    >
      {label}
      {active ? (
        dir === 'desc' ? <ArrowDown className="w-3 h-3" /> : <ArrowUp className="w-3 h-3" />
      ) : (
        <ArrowUpDown className="w-3 h-3 text-slate-300" />
      )}
    </button>
  )
}

export default function FunnelVelocityTable({ isLoading, rows }: Props) {
  const [sortKey, setSortKey] = useState<SortKey | null>(null)
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) {
      setSortDir(d => (d === 'desc' ? 'asc' : 'desc'))
    } else {
      setSortKey(k)
      setSortDir('desc')
    }
  }

  const sorted = useMemo(() => {
    if (!sortKey) return rows // ordem canônica da RPC
    const copy = [...rows]
    copy.sort((a, b) => {
      let va: number | string
      let vb: number | string
      if (sortKey === 'stage') {
        va = a.stage_nome
        vb = b.stage_nome
      } else {
        va = Number(a[sortKey]) || 0
        vb = Number(b[sortKey]) || 0
      }
      if (va < vb) return sortDir === 'desc' ? 1 : -1
      if (va > vb) return sortDir === 'desc' ? -1 : 1
      return 0
    })
    return copy
  }, [rows, sortKey, sortDir])

  return (
    <ChartCard
      title="Velocidade por etapa"
      description="Quantos cards passaram e quanto tempo ficaram em cada etapa — clique nos cabeçalhos pra ordenar"
      colSpan={2}
      isLoading={isLoading}
    >
      <div className="px-4 pb-2 overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-200">
              <th className="text-left py-2.5 pr-3">
                <SortHeader
                  label="Etapa"
                  sortKey="stage"
                  currentKey={sortKey}
                  dir={sortDir}
                  onToggle={toggleSort}
                  align="left"
                />
              </th>
              <th className="text-right py-2.5 px-2">
                <SortHeader
                  label="Passaram"
                  sortKey="cards_passaram"
                  currentKey={sortKey}
                  dir={sortDir}
                  onToggle={toggleSort}
                  title="Cards que saíram dessa etapa no período"
                />
              </th>
              <th className="text-right py-2.5 px-2">
                <SortHeader
                  label="Atuais"
                  sortKey="cards_atuais"
                  currentKey={sortKey}
                  dir={sortDir}
                  onToggle={toggleSort}
                  title="Cards parados nessa etapa agora"
                />
              </th>
              <th className="text-right py-2.5 px-2">
                <SortHeader
                  label="Mediana"
                  sortKey="mediana_dias"
                  currentKey={sortKey}
                  dir={sortDir}
                  onToggle={toggleSort}
                  title="p50 dos dias em etapa — metade dos cards passou em até X dias"
                />
              </th>
              <th className="text-right py-2.5 px-2">
                <SortHeader
                  label="p90"
                  sortKey="p90_dias"
                  currentKey={sortKey}
                  dir={sortDir}
                  onToggle={toggleSort}
                  title="p90 dos dias em etapa — 9 em cada 10 cards passaram em até X dias"
                />
              </th>
              <th className="text-right py-2.5 px-2">
                <SortHeader
                  label="Média"
                  sortKey="media_dias"
                  currentKey={sortKey}
                  dir={sortDir}
                  onToggle={toggleSort}
                />
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(row => {
              const color = getPhaseColor(row.phase_slug)
              return (
                <tr key={row.stage_id} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="py-2 pr-3">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: color }}
                      />
                      <span className="text-slate-700 font-medium truncate max-w-[220px]">
                        {row.stage_nome}
                      </span>
                    </div>
                  </td>
                  <td className="py-2 px-2 text-right tabular-nums text-slate-700 font-semibold">
                    {row.cards_passaram.toLocaleString('pt-BR')}
                  </td>
                  <td className="py-2 px-2 text-right tabular-nums text-slate-500">
                    {row.cards_atuais.toLocaleString('pt-BR')}
                  </td>
                  <td className={cn('py-2 px-2 text-right tabular-nums', durationBadge(row.mediana_dias))}>
                    {row.mediana_dias.toFixed(0)}d
                  </td>
                  <td className={cn('py-2 px-2 text-right tabular-nums', durationBadge(row.p90_dias))}>
                    {row.p90_dias.toFixed(0)}d
                  </td>
                  <td className={cn('py-2 px-2 text-right tabular-nums', durationBadge(row.media_dias))}>
                    {row.media_dias.toFixed(1)}d
                  </td>
                </tr>
              )
            })}
            {sorted.length === 0 && !isLoading && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-slate-400">
                  Sem dados de velocidade no período
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </ChartCard>
  )
}
