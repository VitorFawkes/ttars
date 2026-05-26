import { useState } from 'react'
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

  if (isLoading) return <LoadingSkeleton rows={6} />
  if (error) return <ErrorBanner error={error as Error} />
  if (!data) return <EmptyState message="Sem dados" />

  const baseCtx = { dateStart: filters.dateStart, dateEnd: filters.dateEnd }
  const { distribuicoes, cruzamentos, perfil_ideal } = data

  // Helpers pros 3 heatmaps entre dimensões
  const FAIXA_ORDER = ['Até R$50 mil', 'R$50-80 mil', 'R$50-100 mil', 'R$80-100 mil', 'R$100-200 mil', 'R$200-500 mil', 'Mais de R$500 mil']
  const CONV_ORDER = ['Apenas o casal', 'Até 20', '20-50', '50-80', '80-100', '+100']
  const fxc = cruzamentos.faixa_x_convidados ?? []
  const fxcFaixas = FAIXA_ORDER.filter(f => fxc.some(r => r.faixa === f))
  const fxcConvs = CONV_ORDER.filter(c => fxc.some(r => r.convidados === c))
  const fxcMap = new Map(fxc.map(r => [`${r.faixa}|${r.convidados}`, r.qtd]))
  const fxcMax = Math.max(1, ...fxc.map(r => r.qtd))
  const fxl = cruzamentos.faixa_x_local ?? []
  const fxlFaixas = FAIXA_ORDER.filter(f => fxl.some(r => r.faixa === f))
  const fxlLocais = Array.from(new Set(fxl.map(r => r.destino))).slice(0, 10)
  const fxlMap = new Map(fxl.map(r => [`${r.faixa}|${r.destino}`, r.qtd]))
  const fxlMax = Math.max(1, ...fxl.map(r => r.qtd))
  const cxl = cruzamentos.convidados_x_local ?? []
  const cxlConvs = CONV_ORDER.filter(c => cxl.some(r => r.convidados === c))
  const cxlLocais = Array.from(new Set(cxl.map(r => r.destino))).slice(0, 10)
  const cxlMap = new Map(cxl.map(r => [`${r.convidados}|${r.destino}`, r.qtd]))
  const cxlMax = Math.max(1, ...cxl.map(r => r.qtd))

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

      {/* === Cruzamentos entre as 3 dimensões === */}
      <SectionCard title="🔀 Faixa × Nº de convidados" subtitle="Mostra qual faixa de orçamento se cruza com qual tamanho de casamento. Clique numa célula pra ver os leads.">
        {fxc.length === 0 ? <EmptyState message="Sem cruzamento disponível" /> : (
          <div className="overflow-x-auto">
            <table className="text-xs">
              <thead>
                <tr>
                  <th className="px-2 py-1 text-left font-medium text-slate-500">Faixa ↓ / Convidados →</th>
                  {fxcConvs.map(c => <th key={c} className="px-2 py-1 text-center font-medium text-slate-500 whitespace-nowrap">{c}</th>)}
                </tr>
              </thead>
              <tbody>
                {fxcFaixas.map(f => (
                  <tr key={f}>
                    <td className="px-2 py-1 font-medium text-slate-700 whitespace-nowrap">{f}</td>
                    {fxcConvs.map(c => {
                      const qtd = fxcMap.get(`${f}|${c}`) ?? 0
                      const intensity = qtd / fxcMax
                      const bg = qtd === 0 ? 'transparent' : `rgba(79, 70, 229, ${0.08 + intensity * 0.7})`
                      const color = intensity > 0.5 ? 'white' : 'rgb(15, 23, 42)'
                      return (
                        <td key={c} className="px-2 py-1 text-center cursor-pointer hover:opacity-80 min-w-[60px]"
                            style={{ background: bg, color }}
                            onClick={() => qtd > 0 && setDrill({ ...baseCtx, faixa: f, title: `${f} × ${c}` })}>
                          {qtd > 0 ? qtd : ''}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <SectionCard title="🔀 Faixa × Local" subtitle="Onde casa cada faixa de orçamento? Top 10 destinos.">
        {fxl.length === 0 ? <EmptyState message="Sem dados" /> : (
          <div className="overflow-x-auto">
            <table className="text-xs">
              <thead>
                <tr>
                  <th className="px-2 py-1 text-left font-medium text-slate-500">Faixa ↓ / Local →</th>
                  {fxlLocais.map(d => <th key={d} className="px-2 py-1 text-center font-medium text-slate-500 whitespace-nowrap">{d.length > 16 ? d.slice(0,16)+'…' : d}</th>)}
                </tr>
              </thead>
              <tbody>
                {fxlFaixas.map(f => (
                  <tr key={f}>
                    <td className="px-2 py-1 font-medium text-slate-700 whitespace-nowrap">{f}</td>
                    {fxlLocais.map(d => {
                      const qtd = fxlMap.get(`${f}|${d}`) ?? 0
                      const intensity = qtd / fxlMax
                      const bg = qtd === 0 ? 'transparent' : `rgba(8, 145, 178, ${0.08 + intensity * 0.7})`
                      const color = intensity > 0.5 ? 'white' : 'rgb(15, 23, 42)'
                      return (
                        <td key={d} className="px-2 py-1 text-center cursor-pointer hover:opacity-80 min-w-[60px]"
                            style={{ background: bg, color }}
                            onClick={() => qtd > 0 && setDrill({ ...baseCtx, faixa: f, destino: d, title: `${f} × ${d}` })}>
                          {qtd > 0 ? qtd : ''}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <SectionCard title="🔀 Nº de convidados × Local" subtitle="Casamento pequeno casa onde? Grande casa onde?">
        {cxl.length === 0 ? <EmptyState message="Sem dados" /> : (
          <div className="overflow-x-auto">
            <table className="text-xs">
              <thead>
                <tr>
                  <th className="px-2 py-1 text-left font-medium text-slate-500">Convidados ↓ / Local →</th>
                  {cxlLocais.map(d => <th key={d} className="px-2 py-1 text-center font-medium text-slate-500 whitespace-nowrap">{d.length > 16 ? d.slice(0,16)+'…' : d}</th>)}
                </tr>
              </thead>
              <tbody>
                {cxlConvs.map(c => (
                  <tr key={c}>
                    <td className="px-2 py-1 font-medium text-slate-700 whitespace-nowrap">{c}</td>
                    {cxlLocais.map(d => {
                      const qtd = cxlMap.get(`${c}|${d}`) ?? 0
                      const intensity = qtd / cxlMax
                      const bg = qtd === 0 ? 'transparent' : `rgba(22, 163, 74, ${0.08 + intensity * 0.7})`
                      const color = intensity > 0.5 ? 'white' : 'rgb(15, 23, 42)'
                      return (
                        <td key={d} className="px-2 py-1 text-center cursor-pointer hover:opacity-80 min-w-[60px]"
                            style={{ background: bg, color }}
                            onClick={() => qtd > 0 && setDrill({ ...baseCtx, destino: d, title: `${c} convidados × ${d}` })}>
                          {qtd > 0 ? qtd : ''}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

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
