import { useState } from 'react'
import {
  useWw2EntradaRealidade,
  type Ww2DimensaoOrdenavel,
  type Ww2DimensaoInvestimento,
  type Ww2DimensaoDestino,
  type Ww2SumarioOrdenavel,
} from '@/hooks/analyticsWeddings/useWw2'
import { useFilterParams } from '../components/FilterBar'
import { SectionCard, EmptyState, LoadingSkeleton, ErrorBanner } from '../components/ui'
import { DrillDrawer, type DrillContext } from '../components/DrillDrawer'
import { formatCurrency, formatNumber } from '../lib/format'

export function EntradaRealidade() {
  const filters = useFilterParams()
  const [onlyFechados, setOnlyFechados] = useState(false)
  const [drill, setDrill] = useState<DrillContext | null>(null)

  const { data, isLoading, error } = useWw2EntradaRealidade({ ...filters, onlyFechados })

  if (isLoading) return <LoadingSkeleton rows={8} />
  if (error) return <ErrorBanner error={error as Error} />
  if (!data) return <EmptyState message="Sem dados" />

  const baseCtx = { dateStart: filters.dateStart, dateEnd: filters.dateEnd }

  return (
    <div className="space-y-5">
      {/* Header com toggle e KPIs */}
      <SectionCard
        title="Entrada × Realidade"
        subtitle="Compara o que o lead disse no formulário inicial × o que a closer refinou DEPOIS da reunião"
        action={
          <button
            onClick={() => setOnlyFechados(!onlyFechados)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition ${
              onlyFechados
                ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
            }`}
          >
            {onlyFechados ? '✓ Apenas fechados' : 'Apenas fechados'}
          </button>
        }
      >
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiBox label="Leads analisados" value={formatNumber(data.total_leads)} sub={onlyFechados ? 'só os fechados' : 'todos no período'} />
          <KpiBox label="Convidados refinados" value={formatNumber(data.convidados.com_refinado)} sub={`de ${formatNumber(data.convidados.com_entrada)} com entrada`} />
          <KpiBox label="Investimento refinado" value={formatNumber(data.investimento.com_refinado)} sub={`de ${formatNumber(data.investimento.com_entrada)} com entrada · ${formatNumber(data.investimento.com_valor_real)} com R$ real`} />
          <KpiBox label="Destino refinado" value={formatNumber(data.destino.com_refinado)} sub={`de ${formatNumber(data.destino.com_entrada)} com entrada`} />
        </div>
      </SectionCard>

      {/* CONVIDADOS */}
      <DimensaoOrdenavelView
        titulo="👥 Convidados — Entrada × Realidade"
        subtitle="O lead disse uma faixa no site. Depois da reunião, a closer refinou. Quem está mais perto do que disse?"
        dim={data.convidados}
        onDrillEntrada={(e) => setDrill({ ...baseCtx, title: `Leads que disseram "${e}" convidados` })}
      />

      {/* INVESTIMENTO */}
      <DimensaoOrdenavelView
        titulo="💰 Investimento — Entrada × Realidade (faixa)"
        subtitle="Comparação das FAIXAS de investimento que o lead declarou."
        dim={data.investimento}
        onDrillEntrada={(e) => setDrill({ ...baseCtx, faixa: e, title: `Leads na faixa ${e}` })}
      />

      <SectionCard
        title="💸 Investimento — Valor REAL do pacote por faixa de entrada"
        subtitle="Em R$, o que cada faixa REALMENTE pagou pelo pacote Welcome. Mostra mediana, p25-p75 (faixa típica), médio, e min-max."
      >
        {data.investimento.valor_pacote_por_faixa.length === 0 ? (
          <EmptyState message="Sem valores de pacote no período" />
        ) : (
          <table className="w-full text-xs">
            <thead className="text-left text-slate-500 border-b border-slate-200">
              <tr>
                <th className="py-2 font-medium">Disse no site</th>
                <th className="py-2 font-medium text-right">n</th>
                <th className="py-2 font-medium text-right">Mín</th>
                <th className="py-2 font-medium text-right">P25</th>
                <th className="py-2 font-medium text-right">Mediano</th>
                <th className="py-2 font-medium text-right">P75</th>
                <th className="py-2 font-medium text-right">Máx</th>
                <th className="py-2 font-medium text-right">Médio</th>
                <th className="py-2 font-medium" style={{ width: '30%' }}>Range visual</th>
              </tr>
            </thead>
            <tbody>
              {data.investimento.valor_pacote_por_faixa
                .sort((a, b) => (b.amostra ?? 0) - (a.amostra ?? 0))
                .map((r) => {
                  const globalMax = Math.max(...data.investimento.valor_pacote_por_faixa.map(v => v.maximo ?? 0), 1)
                  const leftP25 = ((r.p25 ?? 0) / globalMax) * 100
                  const leftP50 = ((r.mediana ?? 0) / globalMax) * 100
                  const widthIQR = (((r.p75 ?? 0) - (r.p25 ?? 0)) / globalMax) * 100
                  const leftMin = ((r.minimo ?? 0) / globalMax) * 100
                  const widthRange = (((r.maximo ?? 0) - (r.minimo ?? 0)) / globalMax) * 100
                  return (
                    <tr key={r.entrada} className="border-b border-slate-100">
                      <td className="py-2 font-medium text-slate-900">{r.entrada}</td>
                      <td className="py-2 text-right tabular-nums">{r.amostra}</td>
                      <td className="py-2 text-right tabular-nums text-slate-500">{formatCurrency(r.minimo ?? 0)}</td>
                      <td className="py-2 text-right tabular-nums text-slate-500">{formatCurrency(r.p25 ?? 0)}</td>
                      <td className="py-2 text-right tabular-nums font-semibold text-slate-900">{formatCurrency(r.mediana ?? 0)}</td>
                      <td className="py-2 text-right tabular-nums text-slate-500">{formatCurrency(r.p75 ?? 0)}</td>
                      <td className="py-2 text-right tabular-nums text-slate-500">{formatCurrency(r.maximo ?? 0)}</td>
                      <td className="py-2 text-right tabular-nums">{formatCurrency(r.media ?? 0)}</td>
                      <td className="py-2 relative h-6">
                        {/* range min-max (cinza claro) */}
                        <div className="absolute top-1/2 -translate-y-1/2 h-1 bg-slate-200 rounded" style={{ left: `${leftMin}%`, width: `${widthRange}%` }} />
                        {/* IQR p25-p75 (indigo) */}
                        <div className="absolute top-1/2 -translate-y-1/2 h-2.5 bg-indigo-400 rounded" style={{ left: `${leftP25}%`, width: `${widthIQR}%` }} />
                        {/* mediana (linha forte) */}
                        <div className="absolute top-1/2 -translate-y-1/2 w-1 h-4 bg-indigo-900 rounded" style={{ left: `${leftP50}%` }} />
                      </td>
                    </tr>
                  )
                })}
            </tbody>
          </table>
        )}
        <p className="mt-3 text-xs text-slate-500">
          <span className="inline-block w-3 h-1 bg-slate-200 align-middle mr-1" /> mín-máx ·
          <span className="inline-block w-3 h-2 bg-indigo-400 align-middle mx-1" /> faixa típica (p25-p75) ·
          <span className="inline-block w-1 h-3 bg-indigo-900 align-middle mx-1" /> mediana
        </p>
      </SectionCard>

      {/* DESTINO */}
      <DimensaoDestinoView
        dim={data.destino}
        onDrillEntrada={(e) => setDrill({ ...baseCtx, destino: e, title: `Leads que disseram "${e}"` })}
      />

      <DrillDrawer ctx={drill} onClose={() => setDrill(null)} />
    </div>
  )
}

function KpiBox({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
      <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">{label}</div>
      <div className="mt-1 text-xl font-semibold text-slate-900">{value}</div>
      <div className="text-[11px] text-slate-500">{sub}</div>
    </div>
  )
}

function DimensaoOrdenavelView({ titulo, subtitle, dim, onDrillEntrada }: {
  titulo: string;
  subtitle: string;
  dim: Ww2DimensaoOrdenavel | Ww2DimensaoInvestimento;
  onDrillEntrada: (entrada: string) => void;
}) {
  if (dim.com_refinado === 0) {
    return (
      <SectionCard title={titulo} subtitle={subtitle}>
        <EmptyState message={`Nenhum lead com valor refinado ainda. Total com entrada: ${formatNumber(dim.com_entrada)}.`} />
      </SectionCard>
    )
  }

  const cats = dim.ordem_categorias
  const matrixMap = new Map(dim.matriz.map(c => [`${c.entrada}|${c.real}`, c.qtd]))
  const maxQtd = Math.max(...dim.matriz.map(c => c.qtd), 1)

  // Ordenar sumário pela ordem das categorias
  const sumarioOrdenado = [...dim.sumario].sort((a, b) => {
    const ia = cats.indexOf(a.entrada); const ib = cats.indexOf(b.entrada)
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib)
  })

  return (
    <SectionCard title={titulo} subtitle={subtitle}>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Sumário: barras manteve/subiu/desceu */}
        <div>
          <div className="text-xs font-medium text-slate-700 mb-2">Comportamento por faixa de entrada</div>
          <div className="space-y-2">
            {sumarioOrdenado.map((s) => <SumarioBarra key={s.entrada} s={s} onClick={() => onDrillEntrada(s.entrada)} />)}
          </div>
          <p className="mt-3 text-[11px] text-slate-500">
            <span className="inline-block w-3 h-2 bg-emerald-500 align-middle mr-1 rounded-sm" /> manteve a faixa ·
            <span className="inline-block w-3 h-2 bg-amber-400 align-middle mx-1 rounded-sm" /> subiu (refinado &gt; entrada) ·
            <span className="inline-block w-3 h-2 bg-rose-400 align-middle mx-1 rounded-sm" /> desceu ·
            <span className="inline-block w-3 h-2 bg-slate-200 align-middle mx-1 rounded-sm" /> sem refinado
          </p>
        </div>

        {/* Matriz N×N */}
        <div>
          <div className="text-xs font-medium text-slate-700 mb-2">Matriz: linha = disse no site / coluna = closer refinou</div>
          <div className="overflow-x-auto">
            <table className="text-[11px]">
              <thead>
                <tr>
                  <th className="px-1.5 py-1 text-left text-slate-500"></th>
                  {cats.map(c => <th key={c} className="px-1.5 py-1 text-center text-slate-500 whitespace-nowrap" title={c}>{c.length > 12 ? c.slice(0, 10) + '…' : c}</th>)}
                </tr>
              </thead>
              <tbody>
                {cats.map(linha => (
                  <tr key={linha}>
                    <td className="px-1.5 py-1 font-medium text-slate-700 whitespace-nowrap text-right">{linha}</td>
                    {cats.map(coluna => {
                      const qtd = matrixMap.get(`${linha}|${coluna}`) ?? 0
                      const intensity = qtd / maxQtd
                      const isDiagonal = linha === coluna
                      const bg = qtd === 0 ? 'transparent' : isDiagonal
                        ? `rgba(16, 185, 129, ${0.15 + intensity * 0.65})`
                        : `rgba(245, 158, 11, ${0.10 + intensity * 0.6})`
                      const color = intensity > 0.5 ? 'white' : 'rgb(15, 23, 42)'
                      return (
                        <td key={coluna} className="px-1.5 py-1 text-center min-w-[44px]" style={{ background: bg, color }}>
                          {qtd > 0 ? qtd : ''}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[11px] text-slate-500">Verde = diagonal (manteve a faixa). Âmbar = mudou (saiu do diagonal).</p>
        </div>
      </div>

      {dim.top_transicoes.length > 0 && (
        <div className="mt-5 pt-4 border-t border-slate-100">
          <div className="text-xs font-medium text-slate-700 mb-2">Top transições (de → para)</div>
          <div className="flex flex-wrap gap-2">
            {dim.top_transicoes.map((t, i) => (
              <div key={i} className="bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1 text-xs">
                <span className="text-slate-700">{t.de}</span>
                <span className="text-amber-600 mx-1">→</span>
                <span className="font-medium text-slate-900">{t.para}</span>
                <span className="text-slate-400 ml-1.5 tabular-nums">×{t.qtd}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </SectionCard>
  )
}

function SumarioBarra({ s, onClick }: { s: Ww2SumarioOrdenavel; onClick: () => void }) {
  const total = s.total || 1
  const wManteve = (s.manteve / total) * 100
  const wSubiu = (s.subiu / total) * 100
  const wDesceu = (s.desceu / total) * 100
  const wSem = (s.sem_real / total) * 100

  return (
    <button onClick={onClick} className="w-full text-left hover:bg-slate-50 -mx-1 px-1 py-1 rounded transition">
      <div className="flex items-center gap-2 text-xs mb-1">
        <span className="w-32 text-slate-700 truncate">{s.entrada}</span>
        <span className="text-slate-400 tabular-nums">{formatNumber(s.total)} leads</span>
        {s.pct_manteve !== null && (
          <span className={`ml-auto text-[11px] tabular-nums font-medium ${
            s.pct_manteve >= 80 ? 'text-emerald-700' :
            s.pct_manteve >= 50 ? 'text-amber-700' :
            'text-rose-600'
          }`}>
            {s.pct_manteve}% manteve
          </span>
        )}
      </div>
      <div className="h-2.5 bg-slate-100 rounded-sm overflow-hidden flex">
        {wManteve > 0 && <div className="bg-emerald-500" style={{ width: `${wManteve}%` }} title={`Manteve: ${s.manteve}`} />}
        {wSubiu > 0 && <div className="bg-amber-400" style={{ width: `${wSubiu}%` }} title={`Subiu: ${s.subiu}`} />}
        {wDesceu > 0 && <div className="bg-rose-400" style={{ width: `${wDesceu}%` }} title={`Desceu: ${s.desceu}`} />}
        {wSem > 0 && <div className="bg-slate-200" style={{ width: `${wSem}%` }} title={`Sem refinado: ${s.sem_real}`} />}
      </div>
    </button>
  )
}

function DimensaoDestinoView({ dim, onDrillEntrada }: { dim: Ww2DimensaoDestino; onDrillEntrada: (e: string) => void }) {
  return (
    <>
      <SectionCard
        title="🏝️ Destino — Entrada × Realidade"
        subtitle="O lead disse onde queria casar. Depois da reunião, qual destino foi confirmado?"
      >
        {dim.sumario.length === 0 ? <EmptyState message="Sem dados" /> : (
          <table className="w-full text-xs">
            <thead className="text-left text-slate-500 border-b border-slate-200">
              <tr>
                <th className="py-2 font-medium">Disse no site</th>
                <th className="py-2 font-medium text-right">Leads</th>
                <th className="py-2 font-medium text-right">Manteve</th>
                <th className="py-2 font-medium text-right">Mudou</th>
                <th className="py-2 font-medium text-right">Sem dado</th>
                <th className="py-2 font-medium text-right">% Manteve</th>
                <th className="py-2 font-medium">Quando muda, vai pra…</th>
              </tr>
            </thead>
            <tbody>
              {dim.sumario.map((s) => (
                <tr key={s.entrada} className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer"
                    onClick={() => onDrillEntrada(s.entrada)}>
                  <td className="py-2 font-medium text-slate-900">{s.entrada}</td>
                  <td className="py-2 text-right tabular-nums">{formatNumber(s.total)}</td>
                  <td className="py-2 text-right tabular-nums text-emerald-600">{formatNumber(s.manteve)}</td>
                  <td className="py-2 text-right tabular-nums text-amber-600">{formatNumber(s.mudou)}</td>
                  <td className="py-2 text-right tabular-nums text-slate-400">{formatNumber(s.sem_real)}</td>
                  <td className="py-2 text-right">
                    {s.pct_manteve !== null && (
                      <span className={`text-[11px] font-medium tabular-nums ${
                        s.pct_manteve >= 80 ? 'text-emerald-700' :
                        s.pct_manteve >= 50 ? 'text-amber-700' :
                        'text-rose-600'
                      }`}>{s.pct_manteve}%</span>
                    )}
                  </td>
                  <td className="py-2 text-slate-700">{s.mais_comum_quando_muda ?? <span className="text-slate-300">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </SectionCard>

      {dim.top_transicoes.length > 0 && (
        <SectionCard title="Top transições de destino" subtitle="Quem disse X, virou Y (excluindo quem manteve)">
          <div className="flex flex-wrap gap-2">
            {dim.top_transicoes.map((t, i) => (
              <div key={i} className="bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1 text-xs">
                <span className="text-slate-700">{t.de}</span>
                <span className="text-amber-600 mx-1">→</span>
                <span className="font-medium text-slate-900">{t.para}</span>
                <span className="text-slate-400 ml-1.5 tabular-nums">×{t.qtd}</span>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {dim.destino_livre_quando_outro.length > 0 && (
        <SectionCard title='✍️ Quem disse "Outro" — escreveu o quê?' subtitle="Texto livre que o casal preencheu quando escolheu 'Outro' no formulário.">
          <ul className="space-y-1.5">
            {dim.destino_livre_quando_outro.map((v, i) => (
              <li key={i} className="text-xs text-slate-700 border-l-2 border-indigo-200 pl-2">
                <span className="font-medium tabular-nums text-slate-400 mr-2">×{v.qtd}</span>
                {v.texto}
              </li>
            ))}
          </ul>
        </SectionCard>
      )}
    </>
  )
}
