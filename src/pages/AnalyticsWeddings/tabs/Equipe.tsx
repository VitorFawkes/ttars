import { useState } from 'react'
import { useWw2TeamPerformance, type Ww2TeamRow } from '@/hooks/analyticsWeddings/useWw2'
import { useFilterParams } from '../components/FilterBar'
import { SectionCard, EmptyState, LoadingSkeleton, ErrorBanner } from '../components/ui'
import { DrillDrawer, type DrillContext } from '../components/DrillDrawer'
import { formatCurrency, formatNumber } from '../lib/format'

type Col<T> = { key: string; label: string; render: (row: T) => React.ReactNode; align?: 'left' | 'right'; sort?: (a: T, b: T) => number }

function Table<T extends { user_id: string }>({ rows, cols, onRowClick }: { rows: T[]; cols: Col<T>[]; onRowClick?: (row: T) => void }) {
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  let sorted = rows
  if (sortKey) {
    const col = cols.find(c => c.key === sortKey)
    if (col?.sort) {
      sorted = [...rows].sort((a, b) => sortDir === 'asc' ? col.sort!(a, b) : col.sort!(b, a))
    }
  }

  return (
    <table className="w-full text-xs">
      <thead className="text-left text-slate-500 border-b border-slate-200">
        <tr>
          {cols.map(c => (
            <th key={c.key} className={`py-2 font-medium ${c.align === 'right' ? 'text-right' : ''}`}>
              {c.sort ? (
                <button onClick={() => { setSortKey(c.key); setSortDir(sortKey === c.key && sortDir === 'desc' ? 'asc' : 'desc') }}
                  className="hover:text-slate-700">
                  {c.label} {sortKey === c.key ? (sortDir === 'desc' ? '↓' : '↑') : ''}
                </button>
              ) : c.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {sorted.map(r => (
          <tr key={r.user_id} className={`border-b border-slate-100 hover:bg-slate-50 ${onRowClick ? 'cursor-pointer' : ''}`}
              onClick={() => onRowClick?.(r)}>
            {cols.map(c => (
              <td key={c.key} className={`py-2 ${c.align === 'right' ? 'text-right tabular-nums' : ''}`}>{c.render(r)}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function Equipe() {
  const filters = useFilterParams()
  const { data, isLoading, error } = useWw2TeamPerformance(filters)
  const [drill, setDrill] = useState<DrillContext | null>(null)

  if (isLoading) return <LoadingSkeleton rows={5} />
  if (error) return <ErrorBanner error={error as Error} />
  if (!data) return <EmptyState message="Sem dados" />

  const baseCtx = { dateStart: filters.dateStart, dateEnd: filters.dateEnd }

  return (
    <div className="space-y-5">
      <SectionCard title="SDR — Qualificação inicial" subtitle="Quantos leads cada SDR atendeu e qual % foi qualificado pra Closer.">
        {data.sdr.length === 0 ? <EmptyState message="Sem dados de SDR no período." /> : (
          <Table<Ww2TeamRow>
            rows={data.sdr}
            onRowClick={(r) => setDrill({ ...baseCtx, consultorId: r.user_id, title: `Leads do SDR ${r.nome ?? 'sem nome'}` })}
            cols={[
              { key: 'nome', label: 'SDR', render: r => <span className="font-medium text-slate-900">{r.nome ?? <span className="text-slate-400">sem nome</span>}</span> },
              { key: 'leads', label: 'Leads', align: 'right', render: r => formatNumber(r.leads), sort: (a, b) => a.leads - b.leads },
              { key: 'qualif', label: 'Qualif.', align: 'right', render: r => <span className="text-emerald-600">{formatNumber(r.qualificados ?? 0)}</span>, sort: (a, b) => (a.qualificados ?? 0) - (b.qualificados ?? 0) },
              { key: 'taxa', label: 'Taxa qualif.', align: 'right', render: r => <span className={`px-1.5 py-0.5 rounded text-[11px] font-medium ${(r.taxa_qualif ?? 0) >= 30 ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{r.taxa_qualif ?? 0}%</span>, sort: (a, b) => (a.taxa_qualif ?? 0) - (b.taxa_qualif ?? 0) },
              { key: 'perdidos', label: 'Perdidos', align: 'right', render: r => <span className="text-rose-500">{formatNumber(r.perdidos ?? 0)}</span>, sort: (a, b) => (a.perdidos ?? 0) - (b.perdidos ?? 0) },
              { key: 'tempo', label: 'Tempo médio', align: 'right', render: r => r.tempo_medio_dias ? `${r.tempo_medio_dias}d` : '—', sort: (a, b) => (a.tempo_medio_dias ?? 999) - (b.tempo_medio_dias ?? 999) },
            ]}
          />
        )}
      </SectionCard>

      <SectionCard title="Closer — Negociação e fechamento" subtitle="Performance de quem fecha venda.">
        {data.closer.length === 0 ? <EmptyState message="Sem dados de Closer no período." /> : (
          <Table<Ww2TeamRow>
            rows={data.closer}
            onRowClick={(r) => setDrill({ ...baseCtx, consultorId: r.user_id, title: `Leads do Closer ${r.nome ?? 'sem nome'}` })}
            cols={[
              { key: 'nome', label: 'Closer', render: r => <span className="font-medium text-slate-900">{r.nome ?? <span className="text-slate-400">sem nome</span>}</span> },
              { key: 'leads', label: 'Leads', align: 'right', render: r => formatNumber(r.leads), sort: (a, b) => a.leads - b.leads },
              { key: 'fechados', label: 'Fechados', align: 'right', render: r => <span className="text-emerald-600">{formatNumber(r.fechados ?? 0)}</span>, sort: (a, b) => (a.fechados ?? 0) - (b.fechados ?? 0) },
              { key: 'taxa', label: 'Taxa fech.', align: 'right', render: r => <span className={`px-1.5 py-0.5 rounded text-[11px] font-medium ${(r.taxa_fechamento ?? 0) >= 15 ? 'bg-emerald-50 text-emerald-700' : (r.taxa_fechamento ?? 0) >= 5 ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>{r.taxa_fechamento ?? 0}%</span>, sort: (a, b) => (a.taxa_fechamento ?? 0) - (b.taxa_fechamento ?? 0) },
              { key: 'ticket', label: 'Ticket médio', align: 'right', render: r => formatCurrency(r.ticket_medio), sort: (a, b) => (a.ticket_medio ?? 0) - (b.ticket_medio ?? 0) },
              { key: 'perdidos', label: 'Perdidos', align: 'right', render: r => <span className="text-rose-500">{formatNumber(r.perdidos ?? 0)}</span>, sort: (a, b) => (a.perdidos ?? 0) - (b.perdidos ?? 0) },
              { key: 'tempo', label: 'Tempo médio', align: 'right', render: r => r.tempo_medio_dias ? `${r.tempo_medio_dias}d` : '—', sort: (a, b) => (a.tempo_medio_dias ?? 999) - (b.tempo_medio_dias ?? 999) },
            ]}
          />
        )}
      </SectionCard>

      {data.planner.length > 0 && (
        <SectionCard title="Planejamento" subtitle="Casamentos em andamento e concluídos por planner.">
          <Table<Ww2TeamRow>
            rows={data.planner}
            onRowClick={(r) => setDrill({ ...baseCtx, consultorId: r.user_id, title: `Casamentos do Planner ${r.nome ?? 'sem nome'}` })}
            cols={[
              { key: 'nome', label: 'Planner', render: r => <span className="font-medium text-slate-900">{r.nome ?? <span className="text-slate-400">sem nome</span>}</span> },
              { key: 'em_andamento', label: 'Em andamento', align: 'right', render: r => formatNumber(r.casamentos_em_andamento ?? 0) },
              { key: 'concluidos', label: 'Concluídos', align: 'right', render: r => formatNumber(r.concluidos ?? 0) },
            ]}
          />
        </SectionCard>
      )}

      <DrillDrawer ctx={drill} onClose={() => setDrill(null)} />
    </div>
  )
}
