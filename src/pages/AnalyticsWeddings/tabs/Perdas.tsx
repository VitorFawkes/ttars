import { useState, useMemo } from 'react'
import { Line, LineChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from 'recharts'
import { useWw2LossReasons, type Ww2Motivo, type Ww2MotivoCanal } from '@/hooks/analyticsWeddings/useWw2'
import { FilterBar, type TabProps, type AppliedFilters } from '../components/FilterBar'
import { SectionCard, EmptyState, LoadingSkeleton, ErrorBanner } from '../components/ui'
import { DrillDrawer, type DrillContext } from '../components/DrillDrawer'
import { formatMes, formatNumber } from '../lib/format'

const LINE_COLORS = ['#874B52', '#BD965C', '#0891b2', '#f59e0b', '#64748b']
const FAIXA_ORDER = ['Até R$50 mil', 'R$50-80 mil', 'R$50-100 mil', 'R$80-100 mil', 'R$100-200 mil', 'R$200-500 mil', '+R$500 mil']

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

  // Motivo (closer) × Faixa: pivot — motivos por volume total, faixas na ordem canônica
  const motivoTotais = new Map<string, number>()
  data.motivo_faixa.forEach(r => motivoTotais.set(r.motivo, (motivoTotais.get(r.motivo) ?? 0) + r.qtd))
  const motivosTop = Array.from(motivoTotais.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([m]) => m)
  const faixasPresentes = Array.from(new Set(data.motivo_faixa.map(r => r.faixa)))
  const faixasTop = [...FAIXA_ORDER.filter(f => faixasPresentes.includes(f)), ...faixasPresentes.filter(f => !FAIXA_ORDER.includes(f))]
  const motivoFaixaMap = new Map(data.motivo_faixa.map(r => [`${r.motivo}|${r.faixa}`, r.qtd]))
  const maxQtd = Math.max(...data.motivo_faixa.map(r => r.qtd), 1)

  // Resumo executivo — calculado dos próprios dados (sem chamada extra)
  const totalSdr = data.motivos_sdr.reduce((s, m) => s + m.qtd, 0)
  const totalCloser = data.motivos_closer.reduce((s, m) => s + m.qtd, 0)
  const topSdr = [...data.motivos_sdr].sort((a, b) => b.qtd - a.qtd)[0]
  const topCloser = [...data.motivos_closer].sort((a, b) => b.qtd - a.qtd)[0]

  return (
    <div className="space-y-5">
      {/* Resumo executivo: quanto perdemos e o motivo nº 1 de cada funil */}
      {(totalSdr > 0 || totalCloser > 0) && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <ResumoCard label="Perdas na qualificação (SDR)" valor={totalSdr}
            onClick={() => setDrill({ ...baseCtx, motivoRole: 'sdr', title: 'Perdas na qualificação (SDR)' })} />
          <ResumoCard label="Perdas na negociação (Closer)" valor={totalCloser} destaque
            onClick={() => setDrill({ ...baseCtx, motivoRole: 'closer', title: 'Perdas na negociação (Closer)' })} />
          <ResumoMotivoCard label="Motivo nº 1 — SDR" motivo={topSdr} total={totalSdr}
            onClick={topSdr ? () => setDrill({ ...baseCtx, motivoPerda: topSdr.motivo, motivoRole: 'sdr', title: `Perdas por: ${topSdr.motivo}` }) : undefined} />
          <ResumoMotivoCard label="Motivo nº 1 — Closer" motivo={topCloser} total={totalCloser}
            onClick={topCloser ? () => setDrill({ ...baseCtx, motivoPerda: topCloser.motivo, motivoRole: 'closer', title: `Perdas por: ${topCloser.motivo}` }) : undefined} />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <MotivosLista
          titulo="Motivos de perda — SDR"
          subtitulo="Por que leads caíram na qualificação inicial. Clique pra ver os casais."
          motivos={data.motivos_sdr}
          total={totalSdr}
          onPick={(motivo) => setDrill({ ...baseCtx, motivoPerda: motivo, motivoRole: 'sdr', title: `Perdas por: ${motivo}` })}
        />
        <MotivosLista
          titulo="Motivos de perda — Closer"
          subtitulo="Por que leads caíram na negociação. Clique pra ver os casais."
          motivos={data.motivos_closer}
          total={totalCloser}
          onPick={(motivo) => setDrill({ ...baseCtx, motivoPerda: motivo, motivoRole: 'closer', title: `Perdas por: ${motivo}` })}
        />
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
                            onClick={() => qtd > 0 && setDrill({ ...baseCtx, motivoPerda: motivo, motivoRole: 'closer', faixa: f, title: `${motivo} × ${f}` })}>
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
            <MotivoCanalPivot titulo="1ª reunião (SDR) × motivo SDR" rows={data.motivo_canal ?? []} onCell={(motivo, canal) => setDrill({ ...baseCtx, motivoPerda: motivo, motivoRole: 'sdr', canalSdr: [canal], title: `${motivo} · 1ª reunião por ${canal}` })} />
            <MotivoCanalPivot titulo="Reunião de fechamento (Closer) × motivo Closer" rows={data.motivo_canal_closer ?? []} nota="Canal da reunião Closer registrado desde nov/2025 — períodos antigos têm pouca cobertura." onCell={(motivo, canal) => setDrill({ ...baseCtx, motivoPerda: motivo, motivoRole: 'closer', canalCloser: [canal], title: `${motivo} · fechamento por ${canal}` })} />
          </div>
        </SectionCard>
      )}

      {tendenciaPivot.rows.length > 0 && (
        <SectionCard title="Tendência mensal" subtitle="Top 5 motivos de perda (Closer) ao longo do tempo">
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={tendenciaPivot.rows} margin={{ top: 10, right: 30, left: 0, bottom: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="mes" stroke="#64748b" fontSize={11} tickFormatter={(v) => formatMes(String(v))} />
              <YAxis stroke="#64748b" fontSize={11} />
              <Tooltip contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12 }} labelFormatter={(v) => formatMes(String(v))} />
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

function ResumoCard({ label, valor, destaque, onClick }: { label: string; valor: number; destaque?: boolean; onClick?: () => void }) {
  const inner = (
    <div className={`border rounded-xl p-4 ${destaque ? 'bg-rose-50/60 border-rose-200' : 'bg-white border-ww-sand shadow-ww-lift'} ${onClick ? 'hover:border-rose-300 transition-colors' : ''}`}>
      <div className="text-xs uppercase tracking-wide text-slate-500 font-medium">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums tracking-tight ${destaque ? 'text-rose-700' : 'text-slate-900'}`}>{formatNumber(valor)}</div>
      <div className="mt-0.5 text-xs text-slate-400">no recorte atual</div>
    </div>
  )
  if (onClick) return <button onClick={onClick} className="text-left w-full active:scale-[0.99] transition-transform" title={`Ver casais — ${label}`}>{inner}</button>
  return inner
}

function ResumoMotivoCard({ label, motivo, total, onClick }: { label: string; motivo: Ww2Motivo | undefined; total: number; onClick?: () => void }) {
  const pct = motivo && total > 0 ? Math.round(100 * motivo.qtd / total) : 0
  const inner = (
    <div className={`bg-white border border-ww-sand shadow-ww-lift rounded-xl p-4 ${onClick ? 'hover:border-ww-sand-dk transition-colors' : ''}`}>
      <div className="text-xs uppercase tracking-wide text-slate-500 font-medium">{label}</div>
      {motivo ? (
        <>
          <div className="mt-1 text-sm font-semibold text-slate-900 leading-snug" title={motivo.motivo}>{motivo.motivo}</div>
          <div className="mt-0.5 text-xs text-slate-500 tabular-nums">{formatNumber(motivo.qtd)} perdas · {pct}% do total</div>
        </>
      ) : (
        <div className="mt-1 text-sm text-slate-400">—</div>
      )}
    </div>
  )
  if (onClick && motivo) return <button onClick={onClick} className="text-left w-full active:scale-[0.99] transition-transform" title={`Ver casais — ${motivo.motivo}`}>{inner}</button>
  return inner
}

// Lista de motivos com participação (%) e barra — gestor enxerga o peso de cada motivo,
// não só o número solto. Top 10 visíveis; o resto expande.
function MotivosLista({ titulo, subtitulo, motivos, total, onPick }: {
  titulo: string; subtitulo: string; motivos: Ww2Motivo[]; total: number; onPick: (motivo: string) => void
}) {
  const [verTodos, setVerTodos] = useState(false)
  const sorted = [...motivos].sort((a, b) => b.qtd - a.qtd)
  const visiveis = verTodos ? sorted : sorted.slice(0, 10)
  const max = Math.max(1, ...sorted.map(m => m.qtd))
  return (
    <SectionCard title={titulo} subtitle={subtitulo}>
      {sorted.length === 0 ? <EmptyState message="Sem dados" /> : (
        <>
          <ul className="space-y-1">
            {visiveis.map(m => {
              const pct = total > 0 ? Math.round(100 * m.qtd / total) : 0
              return (
                <li key={m.motivo}
                    className="px-2 py-1.5 rounded cursor-pointer hover:bg-ww-cream/60 transition-colors"
                    onClick={() => onPick(m.motivo)}
                    title={`Ver casais — ${m.motivo}`}>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="flex-1 text-slate-700 truncate">{m.motivo}</span>
                    <span className="text-slate-900 font-medium tabular-nums shrink-0">{formatNumber(m.qtd)}</span>
                    <span className="w-9 text-right text-xs text-slate-400 tabular-nums shrink-0">{pct}%</span>
                  </div>
                  <div className="mt-1 h-1.5 bg-ww-cream rounded-full overflow-hidden">
                    <div className="h-full bg-ww-rosewood/70 rounded-full" style={{ width: `${(m.qtd / max) * 100}%` }} />
                  </div>
                </li>
              )
            })}
          </ul>
          {sorted.length > 10 && (
            <button onClick={() => setVerTodos(v => !v)} className="mt-2 text-xs font-medium text-ww-gold-ink hover:text-ww-n700 transition-colors">
              {verTodos ? '− mostrar menos' : `+ ver todos os ${sorted.length} motivos`}
            </button>
          )}
        </>
      )}
    </SectionCard>
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
