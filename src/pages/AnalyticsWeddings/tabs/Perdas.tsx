import { useState, useMemo } from 'react'
import { Line, LineChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from 'recharts'
import { useWw2LossReasons } from '@/hooks/analyticsWeddings/useWw2'
import { useFilterParams } from '../components/FilterBar'
import { SectionCard, EmptyState, LoadingSkeleton, ErrorBanner } from '../components/ui'
import { DrillDrawer, type DrillContext } from '../components/DrillDrawer'
import { formatNumber } from '../lib/format'

const LINE_COLORS = ['#4f46e5', '#7c3aed', '#0891b2', '#f59e0b', '#ef4444']

export function Perdas() {
  const filters = useFilterParams()
  const { data, isLoading, error } = useWw2LossReasons(filters)
  const [drill, setDrill] = useState<DrillContext | null>(null)

  const tendenciaPivot = useMemo(() => {
    if (!data?.tendencia) return { rows: [], motivos: [] }
    const motivos = Array.from(new Set(data.tendencia.map(t => t.motivo)))
    const meses = Array.from(new Set(data.tendencia.map(t => t.mes))).sort()
    const map = new Map(data.tendencia.map(t => [`${t.mes}|${t.motivo}`, t.qtd]))
    const rows = meses.map(mes => {
      const row: Record<string, string | number> = { mes }
      motivos.forEach(m => { row[m] = map.get(`${mes}|${m}`) ?? 0 })
      return row
    })
    return { rows, motivos }
  }, [data])

  if (isLoading) return <LoadingSkeleton rows={5} />
  if (error) return <ErrorBanner error={error as Error} />
  if (!data) return <EmptyState message="Sem dados" />

  const baseCtx = { dateStart: filters.dateStart, dateEnd: filters.dateEnd }

  // Motivo (closer) × Faixa: pivot
  const motivosTop = Array.from(new Set(data.motivo_faixa.map(r => r.motivo))).slice(0, 10)
  const faixasTop = Array.from(new Set(data.motivo_faixa.map(r => r.faixa)))
  const motivoFaixaMap = new Map(data.motivo_faixa.map(r => [`${r.motivo}|${r.faixa}`, r.qtd]))
  const maxQtd = Math.max(...data.motivo_faixa.map(r => r.qtd), 1)

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <SectionCard title="Motivos de perda — SDR" subtitle="Por que leads caíram na qualificação inicial">
          {data.motivos_sdr.length === 0 ? <EmptyState message="Sem dados" /> : (
            <ul className="space-y-1.5">
              {data.motivos_sdr.map(m => (
                <li key={m.motivo} className="flex items-center gap-2 text-sm hover:bg-slate-50 px-2 py-1.5 rounded cursor-pointer"
                    onClick={() => setDrill({ ...baseCtx, motivoPerda: m.motivo, title: `Perdas por: ${m.motivo}` })}>
                  <span className="flex-1 text-slate-700">{m.motivo}</span>
                  <span className="text-slate-900 font-medium tabular-nums">{formatNumber(m.qtd)}</span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard title="Motivos de perda — Closer" subtitle="Por que leads caíram na negociação">
          {data.motivos_closer.length === 0 ? <EmptyState message="Sem dados" /> : (
            <ul className="space-y-1.5">
              {data.motivos_closer.map(m => (
                <li key={m.motivo} className="flex items-center gap-2 text-sm hover:bg-slate-50 px-2 py-1.5 rounded cursor-pointer"
                    onClick={() => setDrill({ ...baseCtx, motivoPerda: m.motivo, title: `Perdas por: ${m.motivo}` })}>
                  <span className="flex-1 text-slate-700">{m.motivo}</span>
                  <span className="text-slate-900 font-medium tabular-nums">{formatNumber(m.qtd)}</span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>

      {motivosTop.length > 0 && faixasTop.length > 0 && (
        <SectionCard title="Motivo de perda (Closer) × Faixa de investimento" subtitle="Qual faixa fala qual motivo?">
          <div className="overflow-x-auto">
            <table className="text-xs">
              <thead>
                <tr>
                  <th className="px-2 py-1 text-left font-medium text-slate-500">Motivo ↓ / Faixa →</th>
                  {faixasTop.map(f => <th key={f} className="px-2 py-1 text-center font-medium text-slate-500 whitespace-nowrap">{f}</th>)}
                </tr>
              </thead>
              <tbody>
                {motivosTop.map(motivo => (
                  <tr key={motivo}>
                    <td className="px-2 py-1 font-medium text-slate-700 whitespace-nowrap max-w-xs truncate" title={motivo}>{motivo}</td>
                    {faixasTop.map(f => {
                      const qtd = motivoFaixaMap.get(`${motivo}|${f}`) ?? 0
                      const intensity = qtd / maxQtd
                      const bg = qtd === 0 ? 'transparent' : `rgba(239, 68, 68, ${0.1 + intensity * 0.6})`
                      const color = intensity > 0.5 ? 'white' : 'rgb(15, 23, 42)'
                      return (
                        <td key={f} className="px-2 py-1 text-center cursor-pointer hover:opacity-80"
                            style={{ background: bg, color }}
                            onClick={() => qtd > 0 && setDrill({ ...baseCtx, motivoPerda: motivo, faixa: f, title: `${motivo} × ${f}` })}>
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

      {tendenciaPivot.rows.length > 0 && (
        <SectionCard title="Tendência mensal" subtitle="Top 5 motivos de perda (Closer) ao longo do tempo">
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={tendenciaPivot.rows} margin={{ top: 10, right: 30, left: 0, bottom: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="mes" stroke="#64748b" fontSize={11} />
              <YAxis stroke="#64748b" fontSize={11} />
              <Tooltip contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {tendenciaPivot.motivos.map((m, i) => (
                <Line key={m} dataKey={m} stroke={LINE_COLORS[i % LINE_COLORS.length]} strokeWidth={2} dot={{ r: 3 }} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </SectionCard>
      )}

      <DrillDrawer ctx={drill} onClose={() => setDrill(null)} />
    </div>
  )
}
