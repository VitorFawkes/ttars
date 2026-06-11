import { useState, useMemo } from 'react'
import { Line, LineChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from 'recharts'
import { useWw2LossReasons, type Ww2MotivoCanal } from '@/hooks/analyticsWeddings/useWw2'
import { FilterBar, type TabProps, type AppliedFilters } from '../components/FilterBar'
import { SectionCard, EmptyState, LoadingSkeleton, ErrorBanner } from '../components/ui'
import { DrillDrawer, type DrillContext } from '../components/DrillDrawer'
import { formatNumber } from '../lib/format'

const LINE_COLORS = ['#4f46e5', '#7c3aed', '#0891b2', '#f59e0b', '#ef4444']

export function Perdas({ filters, onFiltersChange }: TabProps) {
  return (
    <div className="space-y-4">
      {/* Pergunta da aba: "por que estamos perdendo?" — corta por perfil (faixa/convidados/destino),
          origem, tipo, consultor e COMO foram as reuniões (canal SDR/Closer) */}
      <FilterBar value={filters} onChange={onFiltersChange} show={['period', 'tipo', 'origem', 'faixa', 'convidados', 'destino', 'consultor', 'canal_sdr', 'canal_closer']} />
      <PerdasContent filters={filters} />
    </div>
  )
}

function PerdasContent({ filters }: { filters: AppliedFilters }) {
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

  // Auditoria 2026-06-11: drill carrega TODOS os filtros ativos da aba junto com o clique
  const baseCtx = {
    dateStart: filters.dateStart, dateEnd: filters.dateEnd,
    origins: filters.origins, faixas: filters.faixas, destinos: filters.destinos,
    convidadosList: filters.convidados, tipos: filters.tipos, consultorIds: filters.consultorIds,
    canalSdr: filters.canalSdr, canalCloser: filters.canalCloser,
  }

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
                <li key={m.motivo} className="flex items-center gap-2 text-sm hover:bg-ww-cream/60 px-2 py-1.5 rounded cursor-pointer transition-colors"
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
                <li key={m.motivo} className="flex items-center gap-2 text-sm hover:bg-ww-cream/60 px-2 py-1.5 rounded cursor-pointer transition-colors"
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
                  <th className="px-2 py-1 text-center font-medium text-slate-500">Motivo ↓ / Faixa →</th>
                  {faixasTop.map(f => <th key={f} className="px-2 py-1 text-center font-medium text-slate-500 whitespace-nowrap">{f}</th>)}
                </tr>
              </thead>
              <tbody>
                {motivosTop.map(motivo => (
                  <tr key={motivo}>
                    <td className="px-2 py-1 font-medium text-slate-700 whitespace-nowrap max-w-[220px] truncate" title={motivo}>{motivo}</td>
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

      {/* Motivo × tipo de reunião (20260611a) — só aparece quando o banco já devolve o cruzamento */}
      {((data.motivo_canal?.length ?? 0) > 0 || (data.motivo_canal_closer?.length ?? 0) > 0) && (
        <SectionCard
          title="Motivo de perda × Tipo de reunião"
          subtitle="Só casais que FIZERAM a reunião. Mostra se o jeito da reunião (Vídeo, WhatsApp…) muda o motivo da perda."
        >
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <MotivoCanalPivot titulo="1ª reunião (SDR) × motivo SDR" rows={data.motivo_canal ?? []} onCell={(motivo, canal) => setDrill({ ...baseCtx, motivoPerda: motivo, canalSdr: [canal], title: `${motivo} · 1ª reunião por ${canal}` })} />
            <MotivoCanalPivot titulo="Reunião de fechamento (Closer) × motivo Closer" rows={data.motivo_canal_closer ?? []} nota="Canal da reunião Closer registrado desde nov/2025 — períodos antigos têm pouca cobertura." onCell={(motivo, canal) => setDrill({ ...baseCtx, motivoPerda: motivo, canalCloser: [canal], title: `${motivo} · fechamento por ${canal}` })} />
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

// Pivot motivo × canal — mesma linguagem visual do Motivo × Faixa (heat vermelho = mais perdas)
function MotivoCanalPivot({ titulo, rows, nota, onCell }: { titulo: string; rows: Ww2MotivoCanal[]; nota?: string; onCell?: (motivo: string, canal: string) => void }) {
  if (rows.length === 0) return (
    <div>
      <h4 className="font-ww-serif text-base font-semibold text-ww-n700 mb-2">{titulo}</h4>
      <p className="text-xs text-ww-n400 italic py-3">Sem reuniões com canal registrado no recorte atual.</p>
    </div>
  )
  const motivos = Array.from(new Set(rows.map(r => r.motivo))).slice(0, 8)
  const canais = Array.from(new Set(rows.map(r => r.canal)))
  const map = new Map(rows.map(r => [`${r.motivo}|${r.canal}`, r.qtd]))
  const totalPorCanal = new Map(canais.map(c => [c, rows.filter(r => r.canal === c).reduce((s, r) => s + r.qtd, 0)]))
  const max = Math.max(...rows.map(r => r.qtd), 1)
  return (
    <div>
      <h4 className="font-ww-serif text-base font-semibold text-ww-n700 mb-2">{titulo}</h4>
      <div className="overflow-x-auto">
        <table className="text-xs w-full">
          <thead>
            <tr>
              <th className="px-2 py-1 text-left font-medium text-slate-500">Motivo ↓ / Reunião →</th>
              {canais.map(c => <th key={c} className="px-2 py-1 text-center font-medium text-slate-500 whitespace-nowrap">{c}</th>)}
            </tr>
          </thead>
          <tbody>
            {motivos.map(motivo => (
              <tr key={motivo}>
                <td className="px-2 py-1 font-medium text-slate-700 max-w-[180px] truncate" title={motivo}>{motivo}</td>
                {canais.map(c => {
                  const qtd = map.get(`${motivo}|${c}`) ?? 0
                  const intensity = qtd / max
                  const bg = qtd === 0 ? 'transparent' : `rgba(239, 68, 68, ${0.1 + intensity * 0.6})`
                  const color = intensity > 0.5 ? 'white' : 'rgb(15, 23, 42)'
                  return (
                    <td key={c} className={`px-2 py-1 text-center tabular-nums transition-opacity ${qtd > 0 && onCell ? 'cursor-pointer hover:opacity-80' : ''}`}
                        style={{ background: bg, color }}
                        onClick={() => qtd > 0 && onCell?.(motivo, c)}>
                      {qtd > 0 ? qtd : ''}
                    </td>
                  )
                })}
              </tr>
            ))}
            <tr className="border-t border-ww-sand/70">
              <td className="px-2 py-1 text-[11px] text-slate-400 italic">Total de perdas pós-reunião</td>
              {canais.map(c => <td key={c} className="px-2 py-1 text-center text-[11px] text-slate-500 tabular-nums">{formatNumber(totalPorCanal.get(c) ?? 0)}</td>)}
            </tr>
          </tbody>
        </table>
      </div>
      {nota && <p className="text-[11px] text-ww-n400 mt-1.5">{nota}</p>}
    </div>
  )
}
