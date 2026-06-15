import { useState } from 'react'
import { DollarSign, Users, MapPin, Megaphone, UserRound, Video, X, Search } from 'lucide-react'
import { useWwFunilConversao, useWwFunilFilterOptions, useWwFunilRanking, type Ww2Filters, type WwFunilConversaoMarcos, type WwFunilRankingDim, type DrillMarco, type StatusLead } from '@/hooks/analyticsWeddings/useWw2'
import { MultiPill, ConsultorPill, TipoSegment } from '../components/FilterPills'
import { PeriodoSeletor } from '../components/PeriodoSeletor'
import { FunilMatriz } from '../components/FunilMatriz'
import { FunilUnificado } from '../components/FunilUnificado'
import { SerieTemporalChart } from '../components/SerieTemporalChart'
import { CruzamentoCustom } from '../components/CruzamentoCustom'
import { DrillDrawer, type DrillContext } from '../components/DrillDrawer'
import { toLinhas, deltasPassagem, biggestDropStep, daysAgo, MARCO_KEYS, MARCO_LABELS, fmtPct, fmtDeltaPp, cumPct } from '../lib/funil'
import { formatNumber } from '../lib/format'
import { periodToDates, labelDoPeriodo, type Janela } from '../lib/dates'

type DateMode = 'cohort' | 'throughput'

function interpretarQueda(a: WwFunilConversaoMarcos | undefined, b: WwFunilConversaoMarcos | undefined, dropIdx: number | null): { titulo: string; texto: string } | null {
  if (!a || !b || dropIdx == null) return null
  const entrouA = a.entrou, entrouB = b.entrou
  if (entrouA === 0 || entrouB === 0) return null
  const dropKey = MARCO_KEYS[dropIdx]
  const ratio = entrouB / entrouA
  const ratioTxt = ratio >= 1.1 ? `${ratio.toFixed(ratio >= 10 ? 0 : 1).replace('.', ',')}× mais leads` : ratio <= 0.9 ? `${(1 / ratio).toFixed(1).replace('.', ',')}× menos leads` : 'volume parecido'
  if (dropKey === 'marcou_sdr') {
    if (ratio >= 1.5) return { titulo: 'Parece mudança de mix de leads', texto: `Entrou ${ratioTxt} agora, mas a maior parte nem agenda a primeira conversa — costuma ser qualidade/intenção do lead que chega, não o time. Veja o ranking de perfis e a aba Marketing.` }
    return { titulo: 'A queda está logo na entrada', texto: 'A maior perda é em marcar a primeira conversa. Com volume parecido, costuma ser qualidade/intenção do lead — olhe origem (Marketing) e os perfis acima.' }
  }
  return { titulo: 'A queda está depois da primeira conversa', texto: `A maior perda é em "${MARCO_LABELS[dropKey]}", já dentro do processo — costuma ser execução: vale ouvir as conversas e revisar a abordagem (volume: ${ratioTxt}).` }
}

function MetricaInline({ label, a, b, isPct, onClickA, onClickB }: { label: string; a: number | null; b: number | null; isPct?: boolean; onClickA?: () => void; onClickB?: () => void }) {
  const fmt = (v: number | null) => v == null ? '—' : isPct ? fmtPct(v) : formatNumber(v)
  let delta: { txt: string; cls: string } | null = null
  if (a != null && b != null) {
    const d = b - a
    const sign = d > 0 ? '▲' : d < 0 ? '▼' : '—'
    const cls = d > 0 ? 'text-emerald-700' : d < 0 ? 'text-rose-600' : 'text-slate-400'
    delta = { txt: `${sign} ${isPct ? fmtDeltaPp(d) : `${d > 0 ? '+' : d < 0 ? '−' : ''}${formatNumber(Math.abs(d))}`}`, cls }
  }
  const clickCls = 'underline decoration-dotted decoration-slate-300 underline-offset-2 hover:decoration-solid cursor-pointer'
  return (
    <div className="min-w-[120px]">
      <div className="text-xs uppercase tracking-wide text-slate-400 font-semibold">{label}</div>
      <div className="mt-1 flex items-baseline gap-1.5 tabular-nums">
        <span className={`text-sm text-slate-500 ${onClickA ? clickCls : ''}`} onClick={onClickA} title={onClickA ? 'Ver casais do período de referência' : undefined}>{fmt(a)}</span>
        <span className="text-slate-300 text-xs">→</span>
        <span className={`text-2xl font-semibold text-slate-900 tracking-tight ${onClickB ? clickCls : ''}`} onClick={onClickB} title={onClickB ? 'Ver casais do período em foco' : undefined}>{fmt(b)}</span>
      </div>
      {delta && <div className={`text-xs font-medium ${delta.cls}`}>{delta.txt}</div>}
    </div>
  )
}

const ic = 'w-3.5 h-3.5'

export function FunilComparado() {
  const [faixas, setFaixas] = useState<string[]>([])
  const [convidados, setConvidados] = useState<string[]>([])
  const [destinos, setDestinos] = useState<string[]>([])
  const [origins, setOrigins] = useState<string[]>([])
  const [consultorIds, setConsultorIds] = useState<string[]>([])
  const [tipos, setTipos] = useState<string[]>(['DW']) // tipo é lente; DW é o padrão Weddings
  const [canalSdr, setCanalSdr] = useState<string[]>([])
  const [canalCloser, setCanalCloser] = useState<string[]>([])
  const [statusLead, setStatusLead] = useState<StatusLead | ''>('')
  const [maisFiltros, setMaisFiltros] = useState(false)
  const [dateMode, setDateMode] = useState<DateMode>('cohort')
  const [perfilDim, setPerfilDim] = useState<WwFunilRankingDim>('faixa')
  const [crossX, setCrossX] = useState<WwFunilRankingDim>('convidados')
  const [crossY, setCrossY] = useState<WwFunilRankingDim>('faixa')
  const [cruzarAberto, setCruzarAberto] = useState(false)

  const [drill, setDrill] = useState<DrillContext | null>(null)
  const [periodoB, setPeriodoB] = useState<Janela>(() => periodToDates('90d'))
  const [periodoA, setPeriodoA] = useState<Janela>(() => periodToDates('all'))
  const labelA = labelDoPeriodo(periodoA)
  const labelB = labelDoPeriodo(periodoB)

  const { data: options } = useWwFunilFilterOptions()
  const perfil = { faixas, convidados, destinos, origins, consultorIds, tipos, canalSdr, canalCloser, statusLead }
  const filtersA: Ww2Filters = { ...perfil, dateMode, dateStart: periodoA.dateStart, dateEnd: periodoA.dateEnd }
  const filtersB: Ww2Filters = { ...perfil, dateMode, dateStart: periodoB.dateStart, dateEnd: periodoB.dateEnd }
  const a = useWwFunilConversao(filtersA)
  const b = useWwFunilConversao(filtersB)

  // Perfis comparados: ranking nas duas janelas, mesma dimensão (junta no cliente).
  // Quando a dimensão exibida É um filtro ativo (ex: dim=faixa com faixa filtrada), NÃO passa
  // esse filtro — a matriz mostra todos os baldes pra comparação e o chip destaca a linha.
  const fFaixas = perfilDim === 'faixa' ? undefined : faixas
  const fConvidados = perfilDim === 'convidados' ? undefined : convidados
  const fDestinos = perfilDim === 'destino' ? undefined : destinos
  const rankA = useWwFunilRanking({ dateStart: periodoA.dateStart, dateEnd: periodoA.dateEnd, dateMode, dimensoes: [perfilDim], origins, tipos, consultorIds, canalSdr, canalCloser, statusLead, faixas: fFaixas, convidados: fConvidados, destinos: fDestinos })
  const rankB = useWwFunilRanking({ dateStart: periodoB.dateStart, dateEnd: periodoB.dateEnd, dateMode, dimensoes: [perfilDim], origins, tipos, consultorIds, canalSdr, canalCloser, statusLead, faixas: fFaixas, convidados: fConvidados, destinos: fDestinos })
  // Cruzamento (power tool): só janela A. Mesma regra: eixos cruzados não entram como filtro.
  const cruz = useWwFunilRanking({
    dateStart: periodoA.dateStart, dateEnd: periodoA.dateEnd, dateMode, dimensoes: [crossX, crossY], origins, tipos, consultorIds, canalSdr, canalCloser, statusLead,
    faixas: crossX === 'faixa' || crossY === 'faixa' ? undefined : faixas,
    convidados: crossX === 'convidados' || crossY === 'convidados' ? undefined : convidados,
    destinos: crossX === 'destino' || crossY === 'destino' ? undefined : destinos,
  })

  const marcosA = a.data?.filtrado
  const marcosB = b.data?.filtrado
  // tipo (DW/Elopement) é lente — não conta como recorte e "limpar" não mexe nela
  const hasFilters = faixas.length + convidados.length + destinos.length + origins.length + consultorIds.length + canalSdr.length + canalCloser.length + (statusLead ? 1 : 0) > 0
  const clearAll = () => { setFaixas([]); setConvidados([]); setDestinos([]); setOrigins([]); setConsultorIds([]); setCanalSdr([]); setCanalCloser([]); setStatusLead('') }

  // Clicar numa linha do "Funil por perfil" abre a lista de casais daquele
  // recorte (período B, o em foco), carregando TODOS os filtros de perfil ativos.
  const onPickPerfil = (dim: WwFunilRankingDim, bucket: string) => {
    const ctx: DrillContext = {
      dateStart: periodoB.dateStart,
      dateEnd: periodoB.dateEnd,
      dateMode,
      title: `Casais — ${bucket}`,
      subtitle: labelB,
      origins, faixas, destinos, convidadosList: convidados, tipos, consultorIds, canalSdr, canalCloser, statusLead,
    }
    if (dim === 'faixa') ctx.faixa = bucket
    else if (dim === 'convidados') ctx.convidados = bucket
    else if (dim === 'destino') ctx.destino = bucket
    else if (dim === 'canal_sdr') ctx.canalSdr = [bucket]
    else ctx.canalCloser = [bucket]
    setDrill(ctx)
  }
  // Drill genérico por período + marco — carrega os filtros de perfil ativos
  const drillMarco = (janela: Janela, rotulo: string, marco: DrillMarco, titulo: string) => setDrill({
    dateStart: janela.dateStart, dateEnd: janela.dateEnd, dateMode,
    title: titulo, subtitle: rotulo,
    origins, faixas, destinos, convidadosList: convidados, tipos, consultorIds, canalSdr, canalCloser, statusLead,
    marco,
  })
  // Clicar num quadrante do cruzamento abre a LISTA de casais daquele grupo×grupo
  // (eixos cruzados substituem o filtro de perfil daquela dimensão, igual ao hook `cruz`).
  const onPickCelula = (dx: WwFunilRankingDim, bx: string[], dy: WwFunilRankingDim, by: string[]) => {
    const ctx: DrillContext = {
      dateStart: periodoA.dateStart, dateEnd: periodoA.dateEnd, dateMode,
      title: `Casais — ${bx.join(' + ')} × ${by.join(' + ')}`,
      subtitle: labelA,
      origins, tipos, consultorIds, canalSdr: [...canalSdr], canalCloser: [...canalCloser], statusLead,
      faixas: dx === 'faixa' || dy === 'faixa' ? undefined : faixas,
      convidadosList: dx === 'convidados' || dy === 'convidados' ? undefined : convidados,
      destinos: dx === 'destino' || dy === 'destino' ? undefined : destinos,
    }
    const aplicaEixo = (dim: WwFunilRankingDim, buckets: string[]) => {
      if (dim === 'faixa') ctx.faixas = buckets
      else if (dim === 'convidados') ctx.convidadosList = buckets
      else if (dim === 'destino') ctx.destinos = buckets
      else if (dim === 'canal_sdr') ctx.canalSdr = buckets
      else ctx.canalCloser = buckets
    }
    aplicaEixo(dx, bx)
    aplicaEixo(dy, by)
    setDrill(ctx)
  }
  const selPerfil = perfilDim === 'faixa' ? (faixas.length === 1 ? faixas[0] : null) : perfilDim === 'convidados' ? (convidados.length === 1 ? convidados[0] : null) : (destinos.length === 1 ? destinos[0] : null)

  const dropIdx = marcosA && marcosB ? biggestDropStep(marcosA, marcosB) : null
  const bRecente = daysAgo(periodoB.dateEnd) < 60
  const aRecente = daysAgo(periodoA.dateEnd) < 60
  const linhasA = marcosA ? toLinhas(marcosA) : []
  const linhasB = marcosB ? toLinhas(marcosB) : []
  const deltas = marcosA && marcosB ? deltasPassagem(marcosA, marcosB) : []
  const interpretacao = interpretarQueda(marcosA, marcosB, dropIdx)
  const temDados = (marcosA?.entrou ?? 0) > 0 || (marcosB?.entrou ?? 0) > 0
  const amostraPequena = ((marcosB?.entrou ?? 0) > 0 && (marcosB?.entrou ?? 0) < 5) || ((marcosA?.entrou ?? 0) > 0 && (marcosA?.entrou ?? 0) < 5)

  const partes: string[] = []
  if (statusLead) partes.push(statusLead === 'aberto' ? 'só abertos' : 'só perdidos')
  if (faixas.length) partes.push(faixas.join(' ou '))
  if (convidados.length) partes.push(`${convidados.join(' ou ')} convidados`)
  if (destinos.length) partes.push(destinos.join(' ou '))
  if (origins.length) partes.push(origins.join(' ou '))
  if (canalSdr.length) partes.push(`1ª reunião por ${canalSdr.join(' ou ')}`)
  if (canalCloser.length) partes.push(`fechamento por ${canalCloser.join(' ou ')}`)
  const resumoPerfil = partes.length ? partes.join(' · ') : 'todos os perfis de lead'

  return (
    <div className="space-y-5">
      {/* Período */}
      <div className="bg-white border border-ww-sand shadow-ww-lift rounded-xl p-4">
        <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Período</div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-500 font-medium px-1">📊</span>
            <select
              value={dateMode}
              onChange={(e) => setDateMode(e.target.value as DateMode)}
              className="px-2.5 py-1.5 text-xs font-medium bg-white border border-ww-sand rounded-lg focus:outline-none focus:ring-2 focus:ring-ww-gold"
              title="Por safra (criação): leads que ENTRARAM no período. Por período (entrada na etapa): o que ACONTECEU no período (agendou/fez/fechou)."
            >
              <option value="cohort">Data de criação (safra)</option>
              <option value="throughput">Data de entrada na etapa (período)</option>
            </select>
          </div>
        </div>
        <PeriodoSeletor periodoA={periodoA} periodoB={periodoB} onPeriodoA={setPeriodoA} onPeriodoB={setPeriodoB} />
        <p className="text-xs text-slate-400 mt-2">
          {dateMode === 'cohort'
            ? 'Contamos os leads pela data de criação — a "safra" que entrou em cada período.'
            : 'Contamos pelo que aconteceu no período: quem agendou, fez reunião ou fechou dentro da janela.'}
        </p>
      </div>

      {/* Filtro de perfil */}
      <div className="bg-white border border-ww-sand shadow-ww-lift rounded-xl p-4">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Perfil de lead <span className="font-normal normal-case text-slate-400">(vale para os dois lados)</span></div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center gap-0.5 bg-ww-cream rounded-lg p-0.5" title="Status do lead">
            {([['', 'Todos', 'Todos os leads do recorte'], ['aberto', 'Abertos', 'Só quem ainda não ganhou nem perdeu'], ['perdido', 'Perdidos', 'Só quem foi perdido']] as const).map(([st, rotulo, titulo]) => (
              <button
                key={rotulo}
                onClick={() => setStatusLead(st)}
                title={titulo}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-ww-gold ${statusLead === st ? 'bg-ww-gold text-white shadow-sm' : 'text-ww-n600 hover:text-ww-n700'}`}
              >
                {rotulo}
              </button>
            ))}
          </div>
          <div className="w-px h-6 bg-slate-200" />
          <TipoSegment selected={tipos} onChange={setTipos} />
          <div className="w-px h-6 bg-slate-200" />
          <MultiPill label="Investimento" icon={<DollarSign className={ic} />} options={options?.faixas ?? []} selected={faixas} onChange={setFaixas} />
          <MultiPill label="Convidados" icon={<Users className={ic} />} options={options?.convidados ?? []} selected={convidados} onChange={setConvidados} />
          <MultiPill label="Destino" icon={<MapPin className={ic} />} options={options?.destinos ?? []} selected={destinos} onChange={setDestinos} />
          <button onClick={() => setMaisFiltros((v) => !v)} className="px-3 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-700 rounded-lg transition">{maisFiltros ? '− menos filtros' : '+ mais filtros'}</button>
          {maisFiltros && <MultiPill label="Origem" icon={<Megaphone className={ic} />} options={options?.origens ?? []} selected={origins} onChange={setOrigins} />}
          {maisFiltros && <ConsultorPill icon={<UserRound className={ic} />} options={options?.consultores ?? []} selected={consultorIds} onChange={setConsultorIds} />}
          {maisFiltros && <MultiPill label="1ª reunião" icon={<Video className={ic} />} options={options?.canais_sdr ?? []} selected={canalSdr} onChange={setCanalSdr} />}
          {maisFiltros && <MultiPill label="Reunião fechamento" icon={<Video className={ic} />} options={options?.canais_closer ?? []} selected={canalCloser} onChange={setCanalCloser} />}
          {hasFilters && <button onClick={clearAll} className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"><X className={ic} />limpar</button>}
        </div>
        <div className="mt-3 text-sm"><span className="text-slate-400">Olhando:</span> <span className="font-medium text-slate-800">{resumoPerfil}</span></div>
      </div>

      {/* Funil por perfil (matriz) — a estrela */}
      <FunilMatriz dim={perfilDim} onDim={setPerfilDim} rankingA={rankA.data ?? undefined} rankingB={rankB.data ?? undefined}
        labelA={labelA} labelB={labelB} isLoading={rankA.isLoading || rankB.isLoading} selecionado={selPerfil} onPick={onPickPerfil} bRecente={bRecente} />

      {/* Manchete */}
      {temDados && marcosA && marcosB && (
        <div className="bg-white border border-ww-sand shadow-ww-lift rounded-xl p-5">
          <h3 className="text-lg font-semibold tracking-tight text-slate-900">Conversão de {resumoPerfil}</h3>
          <p className="text-sm text-slate-500 mb-3"><span className="font-medium text-slate-700">{labelB}</span> comparado com <span className="font-medium text-slate-700">{labelA}</span></p>
          <div className="flex flex-wrap gap-6">
            <MetricaInline label="Entrou" a={marcosA.entrou} b={marcosB.entrou}
              onClickA={() => drillMarco(periodoA, labelA, 'entrou', 'Casais que entraram no funil')}
              onClickB={() => drillMarco(periodoB, labelB, 'entrou', 'Casais que entraram no funil')} />
            <MetricaInline label="Ganho" a={marcosA.ganho} b={marcosB.ganho}
              onClickA={() => drillMarco(periodoA, labelA, 'ganho', 'Casais que fecharam')}
              onClickB={() => drillMarco(periodoB, labelB, 'ganho', 'Casais que fecharam')} />
            <MetricaInline label="Conversão" a={cumPct(marcosA.ganho, marcosA.entrou)} b={cumPct(marcosB.ganho, marcosB.entrou)} isPct />
          </div>
          {dropIdx != null ? (
            <div className="mt-3 bg-rose-50 border border-rose-200 rounded-lg p-3">
              <p className="text-sm text-rose-800"><strong>Maior queda</strong> na passagem para <strong>{MARCO_LABELS[MARCO_KEYS[dropIdx]]}</strong>: <strong>{fmtPct(linhasA[dropIdx]?.stepPct ?? null)}</strong> em {labelA} → <strong>{fmtPct(linhasB[dropIdx]?.stepPct ?? null)}</strong> em {labelB} ({fmtDeltaPp(deltas[dropIdx] ?? null)}).</p>
              {interpretacao && <p className="text-sm text-rose-800 mt-1.5"><strong>{interpretacao.titulo}.</strong> {interpretacao.texto}</p>}
            </div>
          ) : (
            <div className="mt-3 bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-sm text-emerald-800">A conversão se manteve ou melhorou em todas as etapas neste recorte.</div>
          )}
          {amostraPequena && <p className="mt-2 text-xs text-amber-700">⚠️ Amostra pequena (menos de 5 leads em um dos períodos) — os percentuais podem variar muito.</p>}
        </div>
      )}

      {/* Funil unificado */}
      <FunilUnificado marcosA={marcosA} marcosB={marcosB} labelA={labelA} labelB={labelB} isLoading={a.isLoading || b.isLoading} error={a.error || b.error} dropIdx={dropIdx} aRecente={aRecente} bRecente={bRecente}
        onEtapaClick={(key, periodo) => drillMarco(
          periodo === 'A' ? periodoA : periodoB,
          periodo === 'A' ? labelA : labelB,
          key,
          `${MARCO_LABELS[key]} — casais`,
        )} />

      {/* Evolução do funil mês a mês (#3) — barras por etapa + toggle quantidade/conversão */}
      <SerieTemporalChart
        title="📊 Evolução do funil — período a período"
        subtitle="Leads → reuniões → vendas em cada período. Troque mês/semana e quantidade/conversão."
        dateStart={new Date(new Date(periodoB.dateEnd).getTime() - 365 * 24 * 60 * 60 * 1000).toISOString()}
        dateEnd={periodoB.dateEnd}
        dateMode={dateMode}
        origins={origins}
        faixas={faixas}
        destinos={destinos}
        convidados={convidados}
        consultorIds={consultorIds}
        tipos={tipos}
        canalSdr={canalSdr}
        canalCloser={canalCloser}
        statusLead={statusLead}
        defaultModo="conversao"
        onPointClick={(p, marco, janela) => setDrill({
          dateStart: janela.dateStart, dateEnd: janela.dateEnd, dateMode,
          title: `${MARCO_LABELS[marco]} — ${p.label}`,
          origins, faixas, destinos, convidadosList: convidados, tipos, consultorIds, canalSdr, canalCloser, statusLead,
          marco,
        })}
      />

      {/* Cruzar duas informações — power tool colapsável */}
      <button onClick={() => setCruzarAberto((v) => !v)} className="w-full bg-white border border-ww-sand shadow-ww-lift rounded-xl p-4 flex items-center justify-between text-left hover:border-slate-300 transition">
        <span className="text-sm font-semibold text-slate-900 inline-flex items-center gap-2"><Search className="w-4 h-4 text-ww-gold-ink" />Cruzar duas informações (ex: convidados × investimento)</span>
        <span className="text-xs font-medium text-ww-gold-ink">{cruzarAberto ? 'fechar ▲' : 'abrir ▼'}</span>
      </button>
      {cruzarAberto && (
        <CruzamentoCustom key={`${crossX}-${crossY}-${options?.faixas?.length ?? 0}-${options?.convidados?.length ?? 0}-${options?.destinos?.length ?? 0}`}
          eixoX={crossX} eixoY={crossY} onEixos={(x, y) => { setCrossX(x); setCrossY(y) }} options={options ?? undefined} data={cruz.data ?? undefined} isLoading={cruz.isLoading} onPickCelula={onPickCelula} />
      )}

      <DrillDrawer ctx={drill} onClose={() => setDrill(null)} />
    </div>
  )
}
