import { useState } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useWw2Marketing } from '@/hooks/analyticsWeddings/useWw2'
import { useFilterParams } from '../components/FilterBar'
import { SectionCard, EmptyState, LoadingSkeleton, ErrorBanner } from '../components/ui'
import { DrillDrawer, type DrillContext } from '../components/DrillDrawer'
import { formatCurrency, formatNumber } from '../lib/format'

export function Marketing() {
  const filters = useFilterParams()
  const { data, isLoading, error } = useWw2Marketing(filters)
  const [drill, setDrill] = useState<DrillContext | null>(null)

  if (isLoading) return <LoadingSkeleton rows={5} />
  if (error) return <ErrorBanner error={error as Error} />
  if (!data) return <EmptyState message="Sem dados" />

  const baseCtx = { dateStart: filters.dateStart, dateEnd: filters.dateEnd }

  return (
    <div className="space-y-5">
      <SectionCard title="Performance por origem" subtitle="UTM source consolidado. Clique numa linha pra ver os leads.">
        {data.por_origem.length === 0 ? <EmptyState message="Sem dados" /> : (
          <table className="w-full text-xs">
            <thead className="text-left text-slate-500 border-b border-slate-200">
              <tr>
                <th className="py-2 font-medium">Origem</th>
                <th className="py-2 font-medium text-right">Leads</th>
                <th className="py-2 font-medium text-right">Qualif.</th>
                <th className="py-2 font-medium text-right">Taxa qualif.</th>
                <th className="py-2 font-medium text-right">Fechados</th>
                <th className="py-2 font-medium text-right">Taxa fech.</th>
                <th className="py-2 font-medium text-right">Ticket médio</th>
                <th className="py-2 font-medium text-right">Tempo qualif.</th>
              </tr>
            </thead>
            <tbody>
              {data.por_origem.map(r => (
                <tr key={r.origem} className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer"
                    onClick={() => setDrill({ ...baseCtx, origem: r.origem, title: `Leads da origem ${r.origem}` })}>
                  <td className="py-2 font-medium text-slate-900">{r.origem}</td>
                  <td className="py-2 text-right tabular-nums">{formatNumber(r.leads)}</td>
                  <td className="py-2 text-right tabular-nums">{formatNumber(r.qualificados)}</td>
                  <td className="py-2 text-right">
                    <span className={`text-[11px] font-medium tabular-nums ${r.taxa_qualif >= 30 ? 'text-emerald-700' : 'text-slate-500'}`}>{r.taxa_qualif}%</span>
                  </td>
                  <td className="py-2 text-right tabular-nums text-emerald-600">{formatNumber(r.fechados)}</td>
                  <td className="py-2 text-right">
                    <span className={`px-1.5 py-0.5 rounded text-[11px] font-medium tabular-nums ${r.taxa_fechamento >= 10 ? 'bg-emerald-50 text-emerald-700' : r.taxa_fechamento >= 3 ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>{r.taxa_fechamento}%</span>
                  </td>
                  <td className="py-2 text-right tabular-nums">{r.ticket_medio > 0 ? formatCurrency(r.ticket_medio) : '—'}</td>
                  <td className="py-2 text-right tabular-nums text-slate-500">{r.tempo_qualif_medio_dias ? `${r.tempo_qualif_medio_dias}d` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </SectionCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <SectionCard title="Top campanhas" subtitle="UTM campaign — top 15 por volume">
          {data.por_campaign.length === 0 ? <EmptyState message="Sem dados de campanha" /> : (
            <ResponsiveContainer width="100%" height={Math.max(220, data.por_campaign.length * 22)}>
              <BarChart data={data.por_campaign} layout="vertical" margin={{ top: 5, right: 50, left: 100, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis type="number" stroke="#64748b" fontSize={10} />
                <YAxis dataKey="campaign" type="category" stroke="#64748b" fontSize={9} width={140}
                       tickFormatter={(v) => String(v).length > 25 ? String(v).slice(0, 25) + '…' : String(v)} />
                <Tooltip contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 11 }} />
                <Bar dataKey="leads" fill="#7c3aed" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </SectionCard>

        <SectionCard title="Por medium" subtitle="UTM medium (CPC, organic, email…)">
          {data.por_medium.length === 0 ? <EmptyState message="Sem dados" /> : (
            <ResponsiveContainer width="100%" height={Math.max(180, data.por_medium.length * 32)}>
              <BarChart data={data.por_medium} layout="vertical" margin={{ top: 5, right: 30, left: 80, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis type="number" stroke="#64748b" fontSize={11} />
                <YAxis dataKey="medium" type="category" stroke="#64748b" fontSize={11} width={120} />
                <Tooltip contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="leads" fill="#0891b2" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </SectionCard>
      </div>

      <SectionCard title="Funil por origem" subtitle="Top 5 origens — quantos viram leads, quantos qualificam, quantos fecham">
        {data.funil_origem.length === 0 ? <EmptyState message="Sem dados" /> : (
          <div className="space-y-3">
            {data.funil_origem.map(o => {
              const maxV = o.novo || 1
              return (
                <div key={o.origem} className="border-b border-slate-100 last:border-0 pb-3">
                  <div className="text-sm font-semibold text-slate-800 mb-2">{o.origem}</div>
                  <div className="space-y-1.5">
                    <FunilRow label="Lead novo" value={o.novo} max={maxV} color="#4f46e5" />
                    <FunilRow label="Qualificado SDR" value={o.qualificado} max={maxV} color="#7c3aed" />
                    <FunilRow label="Casamento fechado" value={o.fechado} max={maxV} color="#16a34a" />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </SectionCard>

      <DrillDrawer ctx={drill} onClose={() => setDrill(null)} />
    </div>
  )
}

function FunilRow({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = (value / max) * 100
  return (
    <div className="flex items-center gap-2 text-xs">
      <div className="w-32 text-slate-600">{label}</div>
      <div className="flex-1 bg-slate-100 h-5 rounded relative overflow-hidden">
        <div className="h-full rounded transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
      <div className="w-14 text-right text-slate-700 font-medium tabular-nums">{formatNumber(value)}</div>
    </div>
  )
}
