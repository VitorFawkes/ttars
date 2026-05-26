import { useState, useMemo } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Cell, Pie, PieChart } from 'recharts'
import { useWw2LeadQuality } from '@/hooks/analyticsWeddings/useWw2'
import { useFilterParams } from '../components/FilterBar'
import { SectionCard, EmptyState, LoadingSkeleton, ErrorBanner } from '../components/ui'
import { DrillDrawer, type DrillContext } from '../components/DrillDrawer'
import { formatNumber } from '../lib/format'

const COLORS = ['#4f46e5', '#7c3aed', '#0891b2', '#16a34a', '#f59e0b', '#ef4444', '#64748b', '#0ea5e9']

export function Qualidade() {
  const filters = useFilterParams()
  const { data, isLoading, error } = useWw2LeadQuality(filters)
  const [drill, setDrill] = useState<DrillContext | null>(null)

  // ⚠️ hooks SEMPRE antes de early returns
  const maxQtd = useMemo(() => {
    const items = data?.cruzamentos?.origem_faixa ?? []
    return Math.max(...items.map(r => r.qtd), 1)
  }, [data?.cruzamentos?.origem_faixa])

  if (isLoading) return <LoadingSkeleton rows={6} />
  if (error) return <ErrorBanner error={error as Error} />
  if (!data) return <EmptyState message="Sem dados" />

  const baseCtx = { dateStart: filters.dateStart, dateEnd: filters.dateEnd }
  const { distribuicoes, cruzamentos, perfil_ideal } = data

  // Matriz origem × faixa: pivot pra heatmap
  const origins = Array.from(new Set(cruzamentos.origem_faixa.map(r => r.origem)))
  const faixas = Array.from(new Set(cruzamentos.origem_faixa.map(r => r.faixa)))
  const matrixMap = new Map(cruzamentos.origem_faixa.map(r => [`${r.origem}|${r.faixa}`, r.qtd]))

  return (
    <div className="space-y-5">
      {/* Perfil ideal */}
      {perfil_ideal.total_fechados > 0 && (
        <SectionCard title="🎯 Perfil do lead ideal" subtitle={`Baseado em ${formatNumber(perfil_ideal.total_fechados)} casamentos fechados — quem mais aparece nos contratos fechados.`}>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <PerfilCard label="Faixa mais comum" value={perfil_ideal.faixa_top ?? '—'} icon="💰" />
            <PerfilCard label="Tamanho típico" value={perfil_ideal.convidados_top ?? '—'} icon="👥" />
            <PerfilCard label="Destino preferido" value={perfil_ideal.destino_top ?? '—'} icon="🏝️" />
            <PerfilCard label="Origem que mais converte" value={perfil_ideal.origem_top ?? '—'} icon="🎯" />
          </div>
        </SectionCard>
      )}

      {/* Distribuições */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <SectionCard title="Faixa de investimento" subtitle={`${distribuicoes.faixa.reduce((s, d) => s + d.qtd, 0)} leads informaram`}>
          {distribuicoes.faixa.length === 0 ? <EmptyState message="Sem dados" /> : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={distribuicoes.faixa} margin={{ top: 10, right: 10, left: 0, bottom: 50 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="label" stroke="#64748b" fontSize={10} angle={-25} textAnchor="end" height={60} interval={0} />
                <YAxis stroke="#64748b" fontSize={11} />
                <Tooltip
                  contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12 }}
                  formatter={(v: number, _n, p: { payload?: { pct?: number } }) => [`${formatNumber(v)} leads (${p.payload?.pct ?? 0}%)`, '']}
                />
                <Bar dataKey="qtd" fill="#7c3aed" radius={[4, 4, 0, 0]} cursor="pointer"
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  onClick={(p: any) => setDrill({ ...baseCtx, faixa: p.label, title: `Leads na faixa ${p.label}` })} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </SectionCard>

        <SectionCard title="Número de convidados" subtitle={`${distribuicoes.convidados.reduce((s, d) => s + d.qtd, 0)} leads informaram`}>
          {distribuicoes.convidados.length === 0 ? <EmptyState message="Sem dados" /> : (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={distribuicoes.convidados} dataKey="qtd" nameKey="label" cx="50%" cy="50%" innerRadius={50} outerRadius={95}
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  label={(entry: any) => `${entry.label} (${entry.pct}%)`} labelLine={false} fontSize={10}>
                  {distribuicoes.convidados.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </SectionCard>
      </div>

      <SectionCard title="Top destinos" subtitle="Onde os leads dizem que querem casar">
        {distribuicoes.destino.length === 0 ? <EmptyState message="Sem dados" /> : (
          <ResponsiveContainer width="100%" height={Math.max(220, distribuicoes.destino.length * 28)}>
            <BarChart data={distribuicoes.destino} layout="vertical" margin={{ top: 5, right: 50, left: 100, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis type="number" stroke="#64748b" fontSize={11} />
              <YAxis dataKey="label" type="category" stroke="#64748b" fontSize={11} width={150} />
              <Tooltip contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12 }} />
              <Bar dataKey="qtd" fill="#0891b2" radius={[0, 4, 4, 0]} cursor="pointer"
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                onClick={(p: any) => setDrill({ ...baseCtx, destino: p.label, title: `Leads do destino ${p.label}` })} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </SectionCard>

      {/* Cruzamentos */}
      <SectionCard title="Faixa × Conversão" subtitle="Qual faixa de investimento converte mais?">
        {cruzamentos.faixa_conv.length === 0 ? <EmptyState message="Sem dados" /> : (
          <table className="w-full text-xs">
            <thead className="text-left text-slate-500 border-b border-slate-200">
              <tr>
                <th className="py-2 font-medium">Faixa</th>
                <th className="py-2 font-medium text-right">Leads</th>
                <th className="py-2 font-medium text-right">Fechados</th>
                <th className="py-2 font-medium text-right">Taxa de fechamento</th>
              </tr>
            </thead>
            <tbody>
              {cruzamentos.faixa_conv.map(r => (
                <tr key={r.faixa} className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer"
                    onClick={() => setDrill({ ...baseCtx, faixa: r.faixa, title: `Leads na faixa ${r.faixa}` })}>
                  <td className="py-2 font-medium text-slate-900">{r.faixa}</td>
                  <td className="py-2 text-right tabular-nums">{formatNumber(r.leads)}</td>
                  <td className="py-2 text-right tabular-nums text-emerald-600">{formatNumber(r.fechados)}</td>
                  <td className="py-2 text-right">
                    <span className={`inline-flex items-center justify-end gap-2 px-2 py-0.5 rounded text-[11px] font-medium ${r.taxa >= 10 ? 'bg-emerald-50 text-emerald-700' : r.taxa >= 3 ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>
                      {r.taxa}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </SectionCard>

      <SectionCard title="Destino × Conversão" subtitle="Qual destino fecha mais (mínimo 5 leads)">
        {cruzamentos.destino_conv.length === 0 ? <EmptyState message="Sem dados suficientes (precisa de pelo menos 5 leads por destino)" /> : (
          <table className="w-full text-xs">
            <thead className="text-left text-slate-500 border-b border-slate-200">
              <tr>
                <th className="py-2 font-medium">Destino</th>
                <th className="py-2 font-medium text-right">Leads</th>
                <th className="py-2 font-medium text-right">Fechados</th>
                <th className="py-2 font-medium text-right">Taxa</th>
              </tr>
            </thead>
            <tbody>
              {cruzamentos.destino_conv.map(r => (
                <tr key={r.destino} className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer"
                    onClick={() => setDrill({ ...baseCtx, destino: r.destino, title: `Leads do destino ${r.destino}` })}>
                  <td className="py-2 font-medium text-slate-900">{r.destino}</td>
                  <td className="py-2 text-right tabular-nums">{formatNumber(r.leads)}</td>
                  <td className="py-2 text-right tabular-nums text-emerald-600">{formatNumber(r.fechados)}</td>
                  <td className="py-2 text-right"><span className={`text-[11px] font-medium tabular-nums ${r.taxa >= 10 ? 'text-emerald-700' : r.taxa >= 3 ? 'text-amber-700' : 'text-slate-500'}`}>{r.taxa}%</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </SectionCard>

      {origins.length > 0 && faixas.length > 0 && (
        <SectionCard title="Origem × Faixa de investimento" subtitle="Heatmap — onde se concentram os leads de cada origem">
          <div className="overflow-x-auto">
            <table className="text-xs">
              <thead>
                <tr>
                  <th className="px-2 py-1 text-left font-medium text-slate-500">Origem ↓ / Faixa →</th>
                  {faixas.map(f => <th key={f} className="px-2 py-1 text-center font-medium text-slate-500 whitespace-nowrap">{f}</th>)}
                </tr>
              </thead>
              <tbody>
                {origins.map(o => (
                  <tr key={o}>
                    <td className="px-2 py-1 font-medium text-slate-700 whitespace-nowrap">{o.length > 30 ? o.slice(0, 30) + '…' : o}</td>
                    {faixas.map(f => {
                      const qtd = matrixMap.get(`${o}|${f}`) ?? 0
                      const intensity = qtd / maxQtd
                      const bg = qtd === 0 ? 'transparent' : `rgba(79, 70, 229, ${0.1 + intensity * 0.7})`
                      const color = intensity > 0.5 ? 'white' : 'rgb(15, 23, 42)'
                      return (
                        <td key={f} className="px-2 py-1 text-center cursor-pointer hover:opacity-80"
                            style={{ background: bg, color }}
                            onClick={() => qtd > 0 && setDrill({ ...baseCtx, origem: o, faixa: f, title: `${o} × ${f}` })}>
                          {qtd > 0 ? qtd : ''}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}

      <DrillDrawer ctx={drill} onClose={() => setDrill(null)} />
    </div>
  )
}

function PerfilCard({ label, value, icon }: { label: string; value: string; icon: string }) {
  return (
    <div className="bg-gradient-to-br from-indigo-50 to-white border border-indigo-100 rounded-xl p-4">
      <div className="text-2xl mb-1">{icon}</div>
      <div className="text-xs uppercase tracking-wide text-slate-500 font-medium">{label}</div>
      <div className="mt-1 text-sm font-semibold text-slate-900">{value}</div>
    </div>
  )
}
