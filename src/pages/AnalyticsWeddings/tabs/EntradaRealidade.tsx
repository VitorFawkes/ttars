import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useOrg } from '@/contexts/OrgContext'
import { useFilterParams } from '../components/FilterBar'
import { SectionCard, EmptyState, LoadingSkeleton, ErrorBanner } from '../components/ui'
import { DrillDrawer, type DrillContext } from '../components/DrillDrawer'
import { formatCurrency, formatNumber } from '../lib/format'

type Stats = { com_entrada: number; com_refinado: number; com_ambos: number; manteve: number; mudou: number; com_valor_pacote?: number }
type MatrizCelula = { e: string; r: string; qtd: number }
type MatrizDimensao = { stats: Stats; categorias: string[]; matriz: MatrizCelula[] }
type ValorPorFaixa = { entrada: string; amostra: number; p25: number | null; mediana: number | null; p75: number | null; media: number | null; minimo: number | null; maximo: number | null; amostra_suficiente: boolean }
type ValorPorCategoria = { categoria: string; amostra: number; p25: number | null; mediana: number | null; p75: number | null; media: number | null; minimo: number | null; maximo: number | null }
type CrossCelula = { inv?: string; conv?: string; dest?: string; qtd: number }

type EntradaRealidadeData = {
  total_leads: number
  total_fechados: number
  convidados: MatrizDimensao
  investimento: MatrizDimensao & { valores_por_faixa_entrada: ValorPorFaixa[] }
  destino: MatrizDimensao & { destino_livre_quando_outro: { texto: string; qtd: number }[] }
  cross_real: {
    investimento_x_convidados: CrossCelula[]
    investimento_x_destino: CrossCelula[]
    convidados_x_destino: CrossCelula[]
    valor_pacote_por_convidados: ValorPorCategoria[]
    valor_pacote_por_destino: ValorPorCategoria[]
  }
  error?: string
}

export function EntradaRealidade() {
  const filters = useFilterParams()
  const { org } = useOrg()
  const [onlyFechados, setOnlyFechados] = useState(false)
  const [drill, setDrill] = useState<DrillContext | null>(null)

  const { data, isLoading, error } = useQuery({
    queryKey: ['ww2', 'er-v3', org?.id, filters.dateStart, filters.dateEnd, filters.origins, onlyFechados],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc('ww2_entrada_realidade', {
        p_date_start: filters.dateStart,
        p_date_end: filters.dateEnd,
        p_org_id: org?.id,
        p_origins: filters.origins?.length ? filters.origins : null,
        p_only_fechados: onlyFechados,
      })
      if (error) throw error
      return data as EntradaRealidadeData
    },
    enabled: !!org?.id,
    staleTime: 60_000,
  })

  if (isLoading) return <LoadingSkeleton rows={10} />
  if (error) return <ErrorBanner error={error as Error} />
  if (!data || data.error) return <EmptyState message={data?.error ?? 'Sem dados'} />

  const baseCtx = { dateStart: filters.dateStart, dateEnd: filters.dateEnd }

  return (
    <div className="space-y-5">
      <SectionCard
        title="🔄 Entrada × Realidade"
        subtitle="Comparação completa: o que o lead disse no formulário × o que a closer refinou depois. Matrizes de transição, valores reais, perfil real dos casamentos."
        action={
          <button
            onClick={() => setOnlyFechados(!onlyFechados)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition ${
              onlyFechados ? 'bg-emerald-50 border-emerald-300 text-emerald-700' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
            }`}
          >
            {onlyFechados ? '✓ Apenas fechados' : 'Apenas fechados'}
          </button>
        }
      >
        <CoverageBanner data={data} />
      </SectionCard>

      <MatrizDimensaoView
        title="👥 Convidados — matriz de transição completa"
        subtitle="Linha = o que o lead disse no site. Coluna = o que a closer confirmou depois. Cada célula = quantos leads. % é da LINHA (do total que disse aquela faixa)."
        dim={data.convidados}
        onDrill={(e) => setDrill({ ...baseCtx, title: `Leads que disseram "${e}" convidados` })}
      />

      <MatrizDimensaoView
        title="💰 Investimento — matriz de transição completa"
        subtitle="A faixa que o lead declarou no site × a faixa refinada pela closer."
        dim={data.investimento}
        onDrill={(e) => setDrill({ ...baseCtx, faixa: e, title: `Leads na faixa ${e}` })}
      />

      <ValoresPacotePorFaixaEntrada valores={data.investimento.valores_por_faixa_entrada} stats={data.investimento.stats} />

      <MatrizDimensaoView
        title="🏝️ Destino — matriz de transição completa"
        subtitle="Onde o lead disse que queria casar × onde efetivamente casou."
        dim={data.destino}
        onDrill={(e) => setDrill({ ...baseCtx, destino: e, title: `Leads que disseram "${e}"` })}
      />

      {data.destino.destino_livre_quando_outro?.length > 0 && (
        <SectionCard title='✍️ Quem disse "Outro" no formulário — escreveu o quê?' subtitle="Texto livre do que o casal escreveu.">
          <ul className="space-y-1.5">
            {data.destino.destino_livre_quando_outro.map((v, i) => (
              <li key={i} className="text-xs text-slate-700 border-l-2 border-indigo-200 pl-2">
                <span className="font-medium tabular-nums text-slate-400 mr-2">×{v.qtd}</span>{v.texto}
              </li>
            ))}
          </ul>
        </SectionCard>
      )}

      {/* === PERFIL REAL DOS CASAMENTOS === */}
      <div className="pt-3">
        <h2 className="text-lg font-semibold text-slate-900 tracking-tight">🎯 Perfil REAL dos casamentos</h2>
        <p className="text-xs text-slate-500 mt-1">Cruzamentos entre dimensões usando os valores <strong>refinados</strong> pela closer (não o que disseram no site). Mostra como os casamentos REAIS se distribuem.</p>
      </div>

      <CrossMatriz
        title="Faixa real × Nº convidados real"
        subtitle="Quanto investe casamento de cada tamanho? (ambos refinados pela closer)"
        data={data.cross_real.investimento_x_convidados}
        rows={data.investimento.categorias}
        cols={data.convidados.categorias}
        getRow={(c) => c.inv!}
        getCol={(c) => c.conv!}
        cellColor="emerald"
        onDrill={(row, col) => setDrill({ ...baseCtx, faixa: row, title: `${row} × ${col} convidados` })}
      />

      <CrossMatriz
        title="Faixa real × Local real"
        subtitle="Quanto investe casamento em cada destino? (ambos refinados)"
        data={data.cross_real.investimento_x_destino}
        rows={data.investimento.categorias}
        cols={data.destino.categorias}
        getRow={(c) => c.inv!}
        getCol={(c) => c.dest!}
        cellColor="indigo"
        onDrill={(row, col) => setDrill({ ...baseCtx, faixa: row, destino: col, title: `${row} × ${col}` })}
      />

      <CrossMatriz
        title="Nº convidados real × Local real"
        subtitle="Casamento de cada tamanho casa onde?"
        data={data.cross_real.convidados_x_destino}
        rows={data.convidados.categorias}
        cols={data.destino.categorias}
        getRow={(c) => c.conv!}
        getCol={(c) => c.dest!}
        cellColor="purple"
        onDrill={(row, col) => setDrill({ ...baseCtx, destino: col, title: `${row} convidados × ${col}` })}
      />

      <ValorPacotePorCategoria
        title="💸 Valor real do pacote × Nº convidados real"
        subtitle="Distribuição estatística (min, p25, mediana, p75, máx) do valor de pacote para cada tamanho de casamento."
        data={data.cross_real.valor_pacote_por_convidados}
      />

      <ValorPacotePorCategoria
        title="💸 Valor real do pacote × Local real"
        subtitle="Distribuição estatística do valor de pacote para cada destino."
        data={data.cross_real.valor_pacote_por_destino}
      />

      <DrillDrawer ctx={drill} onClose={() => setDrill(null)} />
    </div>
  )
}

function CoverageBanner({ data }: { data: EntradaRealidadeData }) {
  const cards = [
    { dim: 'Convidados', s: data.convidados.stats, color: 'indigo' as const },
    { dim: 'Investimento', s: data.investimento.stats, color: 'emerald' as const },
    { dim: 'Destino', s: data.destino.stats, color: 'purple' as const },
  ]
  return (
    <div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {cards.map(({ dim, s, color }) => {
          const pctRefin = s.com_entrada > 0 ? Math.round(100 * s.com_refinado / s.com_entrada) : 0
          const pctManteve = s.com_ambos > 0 ? Math.round(100 * s.manteve / s.com_ambos) : 0
          const colorClasses: Record<string, string> = {
            indigo: 'from-indigo-50 to-white border-indigo-100',
            emerald: 'from-emerald-50 to-white border-emerald-100',
            purple: 'from-purple-50 to-white border-purple-100',
          }
          return (
            <div key={dim} className={`bg-gradient-to-br ${colorClasses[color]} border rounded-lg p-4`}>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{dim}</div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                <div>
                  <div className="text-slate-500">Tem entrada</div>
                  <div className="text-lg font-semibold text-slate-900 tabular-nums">{formatNumber(s.com_entrada)}</div>
                </div>
                <div>
                  <div className="text-slate-500">Tem refinado</div>
                  <div className="text-lg font-semibold text-slate-900 tabular-nums">{formatNumber(s.com_refinado)}</div>
                  <div className="text-[10px] text-slate-500">{pctRefin}% dos com entrada</div>
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-slate-100 text-xs">
                <div className="text-slate-500">Universo de análise (tem ambos)</div>
                <div className="flex items-baseline gap-2">
                  <span className="text-xl font-semibold text-slate-900 tabular-nums">{formatNumber(s.com_ambos)}</span>
                  <span className="text-slate-500">leads</span>
                </div>
                <div className="mt-1 text-[11px]">
                  <span className="text-emerald-700 font-medium">{s.manteve} mantiveram ({pctManteve}%)</span>
                  <span className="text-slate-400 mx-1">·</span>
                  <span className="text-amber-700 font-medium">{s.mudou} mudaram</span>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function MatrizDimensaoView({ title, subtitle, dim, onDrill }: {
  title: string
  subtitle: string
  dim: MatrizDimensao
  onDrill: (entrada: string) => void
}) {
  if (dim.stats.com_ambos < 10) {
    return (
      <SectionCard title={title} subtitle={`Universo ${dim.stats.com_ambos} leads — insuficiente.`}>
        <EmptyState message="Aguardando mais refinamentos da closer. Tente um período mais longo no filtro." />
      </SectionCard>
    )
  }

  // Aviso quando NENHUM lead mudou (só diagonal visível)
  const semVariacao = dim.stats.mudou === 0 && dim.stats.com_ambos > 0

  const cats = dim.categorias ?? []
  const cellMap = new Map(dim.matriz.map(c => [`${c.e}|${c.r}`, c.qtd]))
  const rowTotals = new Map<string, number>()
  cats.forEach(cat => {
    rowTotals.set(cat, dim.matriz.filter(c => c.e === cat).reduce((s, c) => s + c.qtd, 0))
  })

  // Detectar categorias fora da ordem padrão (destinos que apareceram extras)
  const allRowCats = Array.from(new Set([...cats, ...dim.matriz.map(c => c.e)]))
  const allColCats = Array.from(new Set([...cats, ...dim.matriz.map(c => c.r)]))

  return (
    <SectionCard title={title} subtitle={subtitle}>
      {semVariacao && (
        <div className="mb-4 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded p-3">
          <strong>⚠ Nesse período, todos os {dim.stats.com_ambos} leads refinados confirmaram a mesma categoria que disseram no site.</strong> Sem mudanças pra analisar.
          {' '}Tente um período mais longo (Últimos 90 dias, 12 meses ou Tudo) pra ver mais movimento entre as faixas.
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="text-xs border-collapse">
          <thead>
            <tr>
              <th className="sticky left-0 bg-white px-3 py-2 text-left font-medium text-slate-500 border-b border-slate-200">
                Entrada ↓ / Refinado →
              </th>
              {allColCats.map(c => (
                <th key={c} className="px-2 py-2 text-center font-medium text-slate-500 border-b border-slate-200 whitespace-nowrap" style={{ minWidth: 80 }}>
                  {c}
                </th>
              ))}
              <th className="px-3 py-2 text-right font-medium text-slate-500 border-b border-slate-200 bg-slate-50">Total linha</th>
            </tr>
          </thead>
          <tbody>
            {allRowCats.map(rowCat => {
              const rowTotal = rowTotals.get(rowCat) ?? dim.matriz.filter(c => c.e === rowCat).reduce((s, c) => s + c.qtd, 0)
              if (rowTotal === 0) return null
              return (
                <tr key={rowCat} className="hover:bg-slate-50">
                  <td className="sticky left-0 bg-white hover:bg-slate-50 px-3 py-2 font-medium text-slate-800 border-b border-slate-100 whitespace-nowrap">
                    <button onClick={() => onDrill(rowCat)} className="text-left hover:text-indigo-700">
                      {rowCat}
                    </button>
                  </td>
                  {allColCats.map(colCat => {
                    const qtd = cellMap.get(`${rowCat}|${colCat}`) ?? 0
                    if (qtd === 0) {
                      return <td key={colCat} className="px-2 py-2 text-center text-slate-300 border-b border-slate-100">—</td>
                    }
                    const isDiagonal = rowCat === colCat
                    const pctOfRow = rowTotal > 0 ? (qtd / rowTotal) * 100 : 0
                    const intensity = pctOfRow / 100
                    const bg = isDiagonal
                      ? `rgba(16, 185, 129, ${0.15 + intensity * 0.6})`
                      : `rgba(245, 158, 11, ${0.10 + intensity * 0.55})`
                    const textColor = intensity > 0.5 ? 'white' : 'rgb(15, 23, 42)'
                    return (
                      <td key={colCat}
                          className="px-2 py-2 text-center border-b border-slate-100 cursor-pointer hover:opacity-80 transition"
                          style={{ background: bg, color: textColor }}
                          onClick={() => onDrill(rowCat)}>
                        <div className="font-semibold tabular-nums">{qtd}</div>
                        <div className="text-[10px] opacity-80 tabular-nums">{Math.round(pctOfRow)}%</div>
                      </td>
                    )
                  })}
                  <td className="px-3 py-2 text-right font-semibold text-slate-700 border-b border-slate-100 bg-slate-50 tabular-nums">
                    {formatNumber(rowTotal)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-[11px] text-slate-500">
        <span className="inline-block w-3 h-3 align-middle mr-1 rounded-sm" style={{ background: 'rgba(16,185,129,0.55)' }} /> diagonal = manteve a faixa ·
        <span className="inline-block w-3 h-3 align-middle mx-1 rounded-sm" style={{ background: 'rgba(245,158,11,0.5)' }} /> fora da diagonal = mudou ·
        % é da linha (entrada)
      </p>
    </SectionCard>
  )
}

function CrossMatriz({ title, subtitle, data, rows, cols, getRow, getCol, cellColor, onDrill }: {
  title: string
  subtitle: string
  data: CrossCelula[]
  rows: string[]
  cols: string[]
  getRow: (c: CrossCelula) => string
  getCol: (c: CrossCelula) => string
  cellColor: 'emerald' | 'indigo' | 'purple'
  onDrill: (row: string, col: string) => void
}) {
  if (data.length === 0) {
    return <SectionCard title={title} subtitle={subtitle}><EmptyState message="Sem dados suficientes ainda." /></SectionCard>
  }
  const cellMap = new Map(data.map(c => [`${getRow(c)}|${getCol(c)}`, c.qtd]))

  const allRows = Array.from(new Set([...rows, ...data.map(getRow)]))
  const allCols = Array.from(new Set([...cols, ...data.map(getCol)]))

  // Totais por linha/coluna
  const rowTotals = new Map<string, number>()
  const colTotals = new Map<string, number>()
  allRows.forEach(r => rowTotals.set(r, data.filter(c => getRow(c) === r).reduce((s, c) => s + c.qtd, 0)))
  allCols.forEach(c => colTotals.set(c, data.filter(cc => getCol(cc) === c).reduce((s, cc) => s + cc.qtd, 0)))
  const grandTotal = data.reduce((s, c) => s + c.qtd, 0)

  const colors: Record<string, string> = {
    emerald: 'rgba(16, 185, 129',
    indigo: 'rgba(79, 70, 229',
    purple: 'rgba(147, 51, 234',
  }
  const baseColor = colors[cellColor]

  // Cor proporcional ao % do TOTAL GERAL (mostra hot spots)
  const maxQtd = Math.max(...data.map(c => c.qtd), 1)

  return (
    <SectionCard title={title} subtitle={subtitle}>
      <div className="overflow-x-auto">
        <table className="text-xs border-collapse">
          <thead>
            <tr>
              <th className="sticky left-0 bg-white px-3 py-2 text-left font-medium text-slate-500 border-b border-slate-200"></th>
              {allCols.map(c => (
                <th key={c} className="px-2 py-2 text-center font-medium text-slate-500 border-b border-slate-200 whitespace-nowrap" style={{ minWidth: 70 }}>
                  {c.length > 14 ? c.slice(0, 14) + '…' : c}
                </th>
              ))}
              <th className="px-3 py-2 text-right font-medium text-slate-600 border-b border-slate-200 bg-slate-50">Total</th>
            </tr>
          </thead>
          <tbody>
            {allRows.map(rowCat => {
              const rowTotal = rowTotals.get(rowCat) ?? 0
              if (rowTotal === 0) return null
              return (
                <tr key={rowCat} className="hover:bg-slate-50">
                  <td className="sticky left-0 bg-white hover:bg-slate-50 px-3 py-2 font-medium text-slate-800 border-b border-slate-100 whitespace-nowrap">{rowCat}</td>
                  {allCols.map(colCat => {
                    const qtd = cellMap.get(`${rowCat}|${colCat}`) ?? 0
                    if (qtd === 0) return <td key={colCat} className="px-2 py-2 text-center text-slate-300 border-b border-slate-100">—</td>
                    const intensity = qtd / maxQtd
                    const bg = `${baseColor}, ${0.10 + intensity * 0.75})`
                    const textColor = intensity > 0.5 ? 'white' : 'rgb(15, 23, 42)'
                    const pctOfRow = rowTotal > 0 ? Math.round((qtd / rowTotal) * 100) : 0
                    return (
                      <td key={colCat}
                          className="px-2 py-2 text-center border-b border-slate-100 cursor-pointer hover:opacity-80 transition"
                          style={{ background: bg, color: textColor }}
                          onClick={() => onDrill(rowCat, colCat)}
                          title={`${qtd} casais · ${pctOfRow}% dos que ${rowCat.toLowerCase()}`}>
                        <div className="font-semibold tabular-nums">{qtd}</div>
                        <div className="text-[10px] opacity-80 tabular-nums">{pctOfRow}%</div>
                      </td>
                    )
                  })}
                  <td className="px-3 py-2 text-right font-semibold text-slate-700 border-b border-slate-100 bg-slate-50 tabular-nums">{formatNumber(rowTotal)}</td>
                </tr>
              )
            })}
            <tr className="bg-slate-50">
              <td className="sticky left-0 bg-slate-50 px-3 py-2 font-semibold text-slate-600 border-t-2 border-slate-200">Total coluna</td>
              {allCols.map(colCat => {
                const t = colTotals.get(colCat) ?? 0
                return (
                  <td key={colCat} className="px-2 py-2 text-center font-semibold text-slate-600 border-t-2 border-slate-200 tabular-nums">
                    {t > 0 ? formatNumber(t) : '—'}
                  </td>
                )
              })}
              <td className="px-3 py-2 text-right font-bold text-slate-900 border-t-2 border-slate-200 tabular-nums">{formatNumber(grandTotal)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-[11px] text-slate-500">Cada célula: número absoluto + % da linha. Clique pra ver os leads.</p>
    </SectionCard>
  )
}

function ValoresPacotePorFaixaEntrada({ valores, stats }: { valores: ValorPorFaixa[]; stats: Stats }) {
  if (!valores || valores.length === 0 || (stats.com_valor_pacote ?? 0) < 10) return null
  const globalMax = Math.max(...valores.map(v => v.maximo ?? 0), 1)
  return (
    <SectionCard
      title="💸 Valor REAL do pacote por faixa de entrada"
      subtitle={`${stats.com_valor_pacote} contratos com valor (excluindo outliers <R$5k). Mostra range completo: min, p25-p75 (faixa típica), mediana, máx.`}
    >
      <table className="w-full text-xs">
        <thead className="text-left text-slate-500 border-b border-slate-200">
          <tr>
            <th className="py-2 font-medium">Disse no site</th>
            <th className="py-2 font-medium text-right">n</th>
            <th className="py-2 font-medium text-right">Mín</th>
            <th className="py-2 font-medium text-right">P25</th>
            <th className="py-2 font-medium text-right">Mediana</th>
            <th className="py-2 font-medium text-right">P75</th>
            <th className="py-2 font-medium text-right">Máx</th>
            <th className="py-2 font-medium" style={{ width: '35%' }}>Faixa real</th>
          </tr>
        </thead>
        <tbody>
          {valores.map((r) => <ValorRow key={r.entrada} v={r} globalMax={globalMax} />)}
        </tbody>
      </table>
      <p className="mt-3 text-[11px] text-slate-500">
        <span className="inline-block w-3 h-1 bg-slate-200 align-middle mr-1" /> min-máx ·
        <span className="inline-block w-3 h-2 bg-indigo-400 align-middle mx-1" /> p25-p75 ·
        <span className="inline-block w-1 h-3 bg-indigo-900 align-middle mx-1" /> mediana
      </p>
    </SectionCard>
  )
}

function ValorPacotePorCategoria({ title, subtitle, data }: {
  title: string
  subtitle: string
  data: ValorPorCategoria[]
}) {
  if (!data || data.length === 0) return null
  const globalMax = Math.max(...data.map(v => v.maximo ?? 0), 1)
  return (
    <SectionCard title={title} subtitle={subtitle}>
      <table className="w-full text-xs">
        <thead className="text-left text-slate-500 border-b border-slate-200">
          <tr>
            <th className="py-2 font-medium">Categoria refinada</th>
            <th className="py-2 font-medium text-right">n</th>
            <th className="py-2 font-medium text-right">Mín</th>
            <th className="py-2 font-medium text-right">P25</th>
            <th className="py-2 font-medium text-right">Mediana</th>
            <th className="py-2 font-medium text-right">P75</th>
            <th className="py-2 font-medium text-right">Máx</th>
            <th className="py-2 font-medium" style={{ width: '35%' }}>Faixa real</th>
          </tr>
        </thead>
        <tbody>
          {data.map((r) => (
            <tr key={r.categoria} className="border-b border-slate-100">
              <td className="py-2 font-medium text-slate-900">
                {r.categoria}
                {r.amostra < 10 && <span className="ml-1 text-[10px] text-amber-600">(n&lt;10)</span>}
              </td>
              <td className="py-2 text-right tabular-nums">{r.amostra}</td>
              <td className="py-2 text-right tabular-nums text-slate-500">{formatCurrency(r.minimo ?? 0)}</td>
              <td className="py-2 text-right tabular-nums text-slate-500">{formatCurrency(r.p25 ?? 0)}</td>
              <td className="py-2 text-right tabular-nums font-semibold text-slate-900">{formatCurrency(r.mediana ?? 0)}</td>
              <td className="py-2 text-right tabular-nums text-slate-500">{formatCurrency(r.p75 ?? 0)}</td>
              <td className="py-2 text-right tabular-nums text-slate-500">{formatCurrency(r.maximo ?? 0)}</td>
              <td className="py-2"><RangeBar v={r} globalMax={globalMax} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </SectionCard>
  )
}

function ValorRow({ v, globalMax }: { v: ValorPorFaixa; globalMax: number }) {
  return (
    <tr className="border-b border-slate-100">
      <td className="py-2 font-medium text-slate-900">
        {v.entrada}
        {!v.amostra_suficiente && <span className="ml-1 text-[10px] text-amber-600">(n&lt;10)</span>}
      </td>
      <td className="py-2 text-right tabular-nums">{v.amostra}</td>
      <td className="py-2 text-right tabular-nums text-slate-500">{formatCurrency(v.minimo ?? 0)}</td>
      <td className="py-2 text-right tabular-nums text-slate-500">{formatCurrency(v.p25 ?? 0)}</td>
      <td className="py-2 text-right tabular-nums font-semibold text-slate-900">{formatCurrency(v.mediana ?? 0)}</td>
      <td className="py-2 text-right tabular-nums text-slate-500">{formatCurrency(v.p75 ?? 0)}</td>
      <td className="py-2 text-right tabular-nums text-slate-500">{formatCurrency(v.maximo ?? 0)}</td>
      <td className="py-2"><RangeBar v={v} globalMax={globalMax} /></td>
    </tr>
  )
}

function RangeBar({ v, globalMax }: { v: { p25: number | null; p75: number | null; mediana: number | null; minimo: number | null; maximo: number | null }; globalMax: number }) {
  const leftMin = ((v.minimo ?? 0) / globalMax) * 100
  const widthRange = (((v.maximo ?? 0) - (v.minimo ?? 0)) / globalMax) * 100
  const leftP25 = ((v.p25 ?? 0) / globalMax) * 100
  const widthIQR = (((v.p75 ?? 0) - (v.p25 ?? 0)) / globalMax) * 100
  const leftP50 = ((v.mediana ?? 0) / globalMax) * 100
  return (
    <div className="relative h-6">
      <div className="absolute top-1/2 -translate-y-1/2 h-1 bg-slate-200 rounded" style={{ left: `${leftMin}%`, width: `${widthRange}%` }} />
      <div className="absolute top-1/2 -translate-y-1/2 h-2.5 bg-indigo-400 rounded" style={{ left: `${leftP25}%`, width: `${widthIQR}%` }} />
      <div className="absolute top-1/2 -translate-y-1/2 w-1 h-4 bg-indigo-900 rounded" style={{ left: `${leftP50}%` }} />
    </div>
  )
}
