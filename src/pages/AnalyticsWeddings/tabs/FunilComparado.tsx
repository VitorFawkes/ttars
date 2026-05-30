import { useState } from 'react'
import { useWwFunilConversao, useWwFunilFilterOptions, useWwFunilRanking, type Ww2Filters, type WwFunilConversaoMarcos, type WwFunilRankingDim, type WwFunilRankingRow } from '@/hooks/analyticsWeddings/useWw2'
import { MultiPill, ConsultorPill } from '../components/FilterPills'
import { FunilColumn } from '../components/FunilColumn'
import { RankingPerfil } from '../components/RankingPerfil'
import { CruzamentoCustom } from '../components/CruzamentoCustom'
import {
  toLinhas, deltasPassagem, biggestDropStep, daysAgo,
  MARCO_KEYS, MARCO_LABELS, MARCOS_TARDIOS, fmtPct, fmtDeltaPp, cumPct,
} from '../lib/funil'
import { formatNumber } from '../lib/format'
import { periodToDates, PERIOD_LABELS, type PeriodOption } from '../lib/dates'

// "É mix ou execução?" — interpreta ONDE a conversão caiu + a variação de volume.
// Queda logo na entrada (marcar 1ª conversa) + muito mais volume = mix de lead.
// Queda depois da 1ª conversa = mais provável execução.
function interpretarQueda(
  a: WwFunilConversaoMarcos | undefined,
  b: WwFunilConversaoMarcos | undefined,
  dropIdx: number | null,
): { titulo: string; texto: string } | null {
  if (!a || !b || dropIdx == null) return null
  const entrouA = a.entrou, entrouB = b.entrou
  if (entrouA === 0 || entrouB === 0) return null
  const dropKey = MARCO_KEYS[dropIdx]
  const ratio = entrouB / entrouA
  const ratioTxt = ratio >= 1.1 ? `${ratio.toFixed(ratio >= 10 ? 0 : 1).replace('.', ',')}× mais leads` : ratio <= 0.9 ? `${(1 / ratio).toFixed(1).replace('.', ',')}× menos leads` : 'volume parecido'

  if (dropKey === 'marcou_sdr') {
    if (ratio >= 1.5) {
      return {
        titulo: 'Parece mudança de mix de leads',
        texto: `Entrou ${ratioTxt} agora, mas a maior parte nem agenda a primeira conversa. Isso costuma ser qualidade/intenção do lead que está chegando — não o trabalho da equipe. Use o ranking acima pra ver quais perfis sumiram, e a aba Marketing pra ver de onde vem esse volume novo.`,
      }
    }
    return {
      titulo: 'A queda está logo na entrada',
      texto: 'A maior perda é em marcar a primeira conversa. Com volume parecido, costuma ser qualidade/intenção do lead que chega — vale olhar origem (aba Marketing) e os perfis no ranking acima.',
    }
  }
  return {
    titulo: 'A queda está depois da primeira conversa',
    texto: `A maior perda é em "${MARCO_LABELS[dropKey]}", já dentro do processo. Aí costuma ser execução: vale ouvir as conversas e revisar a abordagem nessa etapa (volume: ${ratioTxt}).`,
  }
}

type Janela = { dateStart: string; dateEnd: string }
type DateMode = 'cohort' | 'throughput'

const PRESETS: PeriodOption[] = ['7d', '30d', '90d', 'mtd', 'last_month', '12m', 'all']

const MODO_LABEL: Record<DateMode, string> = {
  cohort: 'Conta os leads que entraram no período',
  throughput: 'Conta o que aconteceu no período (reuniões, fechamentos)',
}

function isoToInputDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function inputDateToIso(dateStr: string, isEnd: boolean): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d, isEnd ? 23 : 0, isEnd ? 59 : 0, isEnd ? 59 : 0, isEnd ? 999 : 0).toISOString()
}
function shiftYears(iso: string, years: number): string {
  const d = new Date(iso)
  d.setFullYear(d.getFullYear() + years)
  return d.toISOString()
}

function PeriodPicker({ titulo, legenda, value, onChange }: { titulo: string; legenda: string; value: Janela; onChange: (v: Janela) => void }) {
  const inputCls = 'px-2 py-1 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500'
  return (
    <div className="flex-1 min-w-[260px]">
      <div className="text-xs font-semibold text-slate-700">{titulo}</div>
      <div className="text-[11px] text-slate-400 mb-1.5">{legenda}</div>
      <div className="flex flex-wrap items-center gap-2">
        <select
          value=""
          onChange={(e) => { if (e.target.value) onChange(periodToDates(e.target.value as PeriodOption)) }}
          className={inputCls}
        >
          <option value="">Atalhos…</option>
          {PRESETS.map((p) => <option key={p} value={p}>{PERIOD_LABELS[p]}</option>)}
        </select>
        <input type="date" value={isoToInputDate(value.dateStart)} onChange={(e) => e.target.value && onChange({ ...value, dateStart: inputDateToIso(e.target.value, false) })} className={inputCls} />
        <span className="text-slate-400 text-xs">até</span>
        <input type="date" value={isoToInputDate(value.dateEnd)} onChange={(e) => e.target.value && onChange({ ...value, dateEnd: inputDateToIso(e.target.value, true) })} className={inputCls} />
      </div>
    </div>
  )
}

function ResumoMetrica({ label, a, b, isPct }: { label: string; a: number | null; b: number | null; isPct?: boolean }) {
  const fmt = (v: number | null) => v == null ? '—' : isPct ? fmtPct(v) : formatNumber(v)
  let delta: { txt: string; cls: string } | null = null
  if (a != null && b != null) {
    const d = b - a
    const sign = d > 0 ? '▲' : d < 0 ? '▼' : '—'
    const cls = d > 0 ? 'text-emerald-700' : d < 0 ? 'text-rose-600' : 'text-slate-400'
    const num = isPct ? `${fmtDeltaPp(d)}` : `${d > 0 ? '+' : d < 0 ? '−' : ''}${formatNumber(Math.abs(d))}`
    delta = { txt: `${sign} ${num}`, cls }
  }
  return (
    <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-4">
      <div className="text-xs uppercase tracking-wide text-slate-500 font-medium">{label}</div>
      <div className="mt-1 flex items-baseline gap-2 tabular-nums">
        <span className="text-slate-400 text-sm">{fmt(a)}</span>
        <span className="text-slate-300">→</span>
        <span className="text-2xl font-semibold text-slate-900 tracking-tight">{fmt(b)}</span>
      </div>
      {delta && <div className={`mt-1 text-xs font-medium ${delta.cls}`}>{delta.txt}</div>}
    </div>
  )
}

export function FunilComparado() {
  // Filtros de perfil — valem para os DOIS lados.
  const [faixas, setFaixas] = useState<string[]>([])
  const [convidados, setConvidados] = useState<string[]>([])
  const [destinos, setDestinos] = useState<string[]>([])
  const [origins, setOrigins] = useState<string[]>([])
  const [consultorIds, setConsultorIds] = useState<string[]>([])
  const [dateMode, setDateMode] = useState<DateMode>('cohort')
  const [rankDims, setRankDims] = useState<WwFunilRankingDim[]>(['faixa'])
  const [crossX, setCrossX] = useState<WwFunilRankingDim>('convidados')
  const [crossY, setCrossY] = useState<WwFunilRankingDim>('faixa')

  // Períodos: B = últimos 90 dias (agora); A = mesma janela 1 ano antes (época).
  const [periodoB, setPeriodoB] = useState<Janela>(() => periodToDates('90d'))
  const [periodoA, setPeriodoA] = useState<Janela>(() => {
    const b = periodToDates('90d')
    return { dateStart: shiftYears(b.dateStart, -1), dateEnd: shiftYears(b.dateEnd, -1) }
  })

  const { data: options } = useWwFunilFilterOptions()

  const perfil = { faixas, convidados, destinos, origins, consultorIds }
  const filtersA: Ww2Filters = { ...perfil, dateMode, dateStart: periodoA.dateStart, dateEnd: periodoA.dateEnd }
  const filtersB: Ww2Filters = { ...perfil, dateMode, dateStart: periodoB.dateStart, dateEnd: periodoB.dateEnd }

  const a = useWwFunilConversao(filtersA)
  const b = useWwFunilConversao(filtersB)

  // Ranking "lead bom" calculado sobre o Período A (a época) — mesmo universo do funil.
  const ranking = useWwFunilRanking({
    dateStart: periodoA.dateStart, dateEnd: periodoA.dateEnd, dateMode,
    dimensoes: rankDims, origins, consultorIds,
  })
  // Cruzamento cru (todas as células) — o frontend agrupa em grupos custom.
  const cruz = useWwFunilRanking({
    dateStart: periodoA.dateStart, dateEnd: periodoA.dateEnd, dateMode,
    dimensoes: [crossX, crossY], origins, consultorIds,
  })

  const marcosA: WwFunilConversaoMarcos | undefined = a.data?.filtrado
  const marcosB: WwFunilConversaoMarcos | undefined = b.data?.filtrado

  const hasFilters = faixas.length + convidados.length + destinos.length + origins.length + consultorIds.length > 0
  const clearAll = () => { setFaixas([]); setConvidados([]); setDestinos([]); setOrigins([]); setConsultorIds([]) }

  // Clicar um perfil no ranking define TODAS as dimensões daquele combo como filtro.
  // Re-clicar o combo já ativo limpa essas dimensões.
  const onPickPerfil = (row: WwFunilRankingRow) => {
    const jaAtivo =
      (row.faixa == null || (faixas.length === 1 && faixas[0] === row.faixa)) &&
      (row.convidados == null || (convidados.length === 1 && convidados[0] === row.convidados)) &&
      (row.destino == null || (destinos.length === 1 && destinos[0] === row.destino)) &&
      [row.faixa, row.convidados, row.destino].some((v) => v != null)
    if (row.faixa != null) setFaixas(jaAtivo ? [] : [row.faixa])
    if (row.convidados != null) setConvidados(jaAtivo ? [] : [row.convidados])
    if (row.destino != null) setDestinos(jaAtivo ? [] : [row.destino])
  }

  // Cruzamento personalizado: define eixos e aplica grupos (múltiplos buckets) no filtro.
  const setDimFilter = (dim: WwFunilRankingDim, buckets: string[]) => {
    if (dim === 'faixa') setFaixas(buckets)
    else if (dim === 'convidados') setConvidados(buckets)
    else setDestinos(buckets)
  }
  const onPickCelula = (dx: WwFunilRankingDim, bx: string[], dy: WwFunilRankingDim, by: string[]) => {
    setDimFilter(dx, bx)
    setDimFilter(dy, by)
  }

  const dropIdx = marcosA && marcosB ? biggestDropStep(marcosA, marcosB) : null
  const dropKey = dropIdx != null ? MARCO_KEYS[dropIdx] : null
  const interpretacao = interpretarQueda(marcosA, marcosB, dropIdx)

  const bRecente = daysAgo(periodoB.dateEnd) < 60
  const aRecente = daysAgo(periodoA.dateEnd) < 60
  const periodosIguais = periodoA.dateStart === periodoB.dateStart && periodoA.dateEnd === periodoB.dateEnd

  const linhasA = marcosA ? toLinhas(marcosA) : []
  const linhasB = marcosB ? toLinhas(marcosB) : []
  const deltas = marcosA && marcosB ? deltasPassagem(marcosA, marcosB) : []
  const temTabela = (marcosA?.entrou ?? 0) > 0 || (marcosB?.entrou ?? 0) > 0
  const amostraPequena = ((marcosB?.entrou ?? 0) > 0 && (marcosB?.entrou ?? 0) < 5) || ((marcosA?.entrou ?? 0) > 0 && (marcosA?.entrou ?? 0) < 5)

  const selectCls = 'px-2.5 py-1.5 text-xs font-medium bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500'

  return (
    <div className="space-y-5">
      {/* Controles */}
      <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-4 space-y-3">
        <div>
          <div className="text-xs font-semibold text-slate-700 mb-2">Perfil de lead <span className="font-normal text-slate-400">(o mesmo filtro vale para os dois lados)</span></div>
          <div className="flex flex-wrap items-center gap-2">
            <MultiPill label="💰 Investimento" options={options?.faixas ?? []} selected={faixas} onChange={setFaixas} />
            <MultiPill label="👥 Convidados" options={options?.convidados ?? []} selected={convidados} onChange={setConvidados} />
            <MultiPill label="🏝️ Destino" options={options?.destinos ?? []} selected={destinos} onChange={setDestinos} />
            <MultiPill label="🎯 Origem" options={options?.origens ?? []} selected={origins} onChange={setOrigins} />
            <ConsultorPill options={options?.consultores ?? []} selected={consultorIds} onChange={setConsultorIds} />
            {hasFilters && (
              <button onClick={clearAll} className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition">✕ Limpar perfil</button>
            )}
          </div>
        </div>

        <div className="w-full h-px bg-slate-100" />

        <div className="flex flex-wrap items-start gap-5">
          <PeriodPicker titulo="Período A — a época" legenda="referência (geralmente mais antiga)" value={periodoA} onChange={setPeriodoA} />
          <PeriodPicker titulo="Período B — agora" legenda="período recente que você quer entender" value={periodoB} onChange={setPeriodoB} />
          <div className="min-w-[220px]">
            <div className="text-xs font-semibold text-slate-700">Como contar</div>
            <div className="text-[11px] text-slate-400 mb-1.5">{MODO_LABEL[dateMode]}</div>
            <select value={dateMode} onChange={(e) => setDateMode(e.target.value as DateMode)} className={selectCls}>
              <option value="cohort">Por entrada do lead</option>
              <option value="throughput">Por atividade no período</option>
            </select>
          </div>
        </div>
      </div>

      {periodosIguais && (
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs text-slate-600">
          Os dois períodos estão iguais — ajuste as datas de um dos lados para comparar.
        </div>
      )}

      {bRecente && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
          <strong>O período B é recente.</strong> Casamentos têm ciclo longo — muitos leads que entraram agora ainda vão fechar nas próximas semanas, então as etapas finais (Fez reunião Closer e Ganho) aparecem mais baixas do que realmente serão. Para comparar agora, foque nas etapas iniciais (Entrou → Marcou SDR → Fez SDR), que amadurecem rápido.
        </div>
      )}

      {/* Descobrir lead bom — ranking por taxa de fechamento, com cruzamentos (clicável) */}
      <RankingPerfil
        dims={rankDims}
        onDims={setRankDims}
        data={ranking.data ?? undefined}
        isLoading={ranking.isLoading}
        sel={{ faixas, convidados, destinos }}
        onPick={onPickPerfil}
      />

      {/* Cruzamento personalizado — agrupa faixinhas pra não fragmentar a amostra */}
      <CruzamentoCustom
        key={`${crossX}-${crossY}-${options?.faixas?.length ?? 0}-${options?.convidados?.length ?? 0}-${options?.destinos?.length ?? 0}`}
        eixoX={crossX}
        eixoY={crossY}
        onEixos={(x, y) => { setCrossX(x); setCrossY(y) }}
        options={options ?? undefined}
        data={cruz.data ?? undefined}
        isLoading={cruz.isLoading}
        onPickCelula={onPickCelula}
      />

      {/* Resumo comparativo */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <ResumoMetrica label="Entrou" a={marcosA?.entrou ?? null} b={marcosB?.entrou ?? null} />
        <ResumoMetrica label="Ganho" a={marcosA?.ganho ?? null} b={marcosB?.ganho ?? null} />
        <ResumoMetrica label="Conversão total"
          a={marcosA ? cumPct(marcosA.ganho, marcosA.entrou) : null}
          b={marcosB ? cumPct(marcosB.ganho, marcosB.entrou) : null}
          isPct />
      </div>

      {/* Diagnóstico */}
      {dropIdx != null && marcosA && marcosB && (
        <div className="bg-rose-50 border border-rose-200 rounded-lg p-4">
          <div className="text-sm font-semibold text-rose-900">Onde a conversão mais caiu</div>
          <p className="text-xs text-rose-800 mt-1">
            A maior queda foi na passagem para <strong>{MARCO_LABELS[MARCO_KEYS[dropIdx]]}</strong>:
            de <strong>{fmtPct(linhasA[dropIdx]?.stepPct ?? null)}</strong> na época
            para <strong>{fmtPct(linhasB[dropIdx]?.stepPct ?? null)}</strong> agora
            ({fmtDeltaPp(deltas[dropIdx] ?? null)}).
          </p>
        </div>
      )}

      {/* É mix ou execução? */}
      {interpretacao && (
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
          <div className="text-sm font-semibold text-slate-900">{interpretacao.titulo}</div>
          <p className="text-xs text-slate-600 mt-1">{interpretacao.texto}</p>
        </div>
      )}

      {/* Dois funis lado a lado */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <FunilColumn titulo="Período A — a época" dateStart={periodoA.dateStart} dateEnd={periodoA.dateEnd}
          modoLabel={MODO_LABEL[dateMode]} data={marcosA} isLoading={a.isLoading} error={a.error}
          highlightKey={dropKey} maturingKeys={aRecente ? MARCOS_TARDIOS : []} />
        <FunilColumn titulo="Período B — agora" dateStart={periodoB.dateStart} dateEnd={periodoB.dateEnd}
          modoLabel={MODO_LABEL[dateMode]} data={marcosB} isLoading={b.isLoading} error={b.error}
          highlightKey={dropKey} maturingKeys={bRecente ? MARCOS_TARDIOS : []} />
      </div>

      {/* Tabela comparativa */}
      {temTabela && (
        <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-5 overflow-x-auto">
          <h3 className="text-sm font-semibold text-slate-900 tracking-tight mb-1">Conversão etapa por etapa</h3>
          <p className="text-xs text-slate-500 mb-4">"Passagem" = quanto avançou da etapa anterior. "Do total" = quanto do total que entrou chegou aqui. Δ compara a passagem de agora com a da época.</p>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-slate-500 border-b border-slate-200">
                <th className="text-left font-medium py-2 pr-3">Etapa</th>
                <th className="text-right font-medium py-2 px-2" colSpan={3}>A — a época</th>
                <th className="text-right font-medium py-2 px-2 border-l border-slate-100" colSpan={3}>B — agora</th>
                <th className="text-right font-medium py-2 pl-2 border-l border-slate-100">Δ passagem</th>
              </tr>
              <tr className="text-[10px] text-slate-400 border-b border-slate-100">
                <th></th>
                <th className="text-right py-1 px-2 font-normal">contatos</th>
                <th className="text-right py-1 px-2 font-normal">passagem</th>
                <th className="text-right py-1 px-2 font-normal">do total</th>
                <th className="text-right py-1 px-2 font-normal border-l border-slate-100">contatos</th>
                <th className="text-right py-1 px-2 font-normal">passagem</th>
                <th className="text-right py-1 px-2 font-normal">do total</th>
                <th className="border-l border-slate-100"></th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {MARCO_KEYS.map((key, i) => {
                const la = linhasA[i]
                const lb = linhasB[i]
                const d = deltas[i] ?? null
                const isDrop = dropIdx === i
                const dCls = d == null ? 'text-slate-400' : d > 0 ? 'text-emerald-700' : d < 0 ? 'text-rose-600' : 'text-slate-400'
                return (
                  <tr key={key} className={`border-b border-slate-50 ${isDrop ? 'bg-rose-50' : ''}`}>
                    <td className={`text-left py-2 pr-3 font-medium ${isDrop ? 'text-rose-700' : 'text-slate-700'}`}>{MARCO_LABELS[key]}</td>
                    <td className="text-right py-2 px-2 text-slate-500">{la ? formatNumber(la.count) : '—'}</td>
                    <td className="text-right py-2 px-2 text-slate-500">{la ? fmtPct(la.stepPct) : '—'}</td>
                    <td className="text-right py-2 px-2 text-slate-500">{la ? fmtPct(la.cumPct) : '—'}</td>
                    <td className="text-right py-2 px-2 text-slate-900 font-medium border-l border-slate-100">{lb ? formatNumber(lb.count) : '—'}</td>
                    <td className="text-right py-2 px-2 text-slate-900">{lb ? fmtPct(lb.stepPct) : '—'}</td>
                    <td className="text-right py-2 px-2 text-slate-900">{lb ? fmtPct(lb.cumPct) : '—'}</td>
                    <td className={`text-right py-2 pl-2 font-medium border-l border-slate-100 ${dCls}`}>{fmtDeltaPp(d)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {amostraPequena && (
            <p className="mt-3 text-[11px] text-amber-700">⚠️ Amostra pequena (menos de 5 leads em um dos períodos) — os percentuais podem variar muito.</p>
          )}
        </div>
      )}
    </div>
  )
}
