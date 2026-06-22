import { useState, type ReactNode } from 'react'
import { FilterBar, type TabProps, type AppliedFilters } from '../components/FilterBar'
import { useWwLeadIdeal, type WwLeadIdealData, type WwLeadIdealItem, type WwLeadIdealCruzamentoCell, type WwLeadIdealPerfilUnif } from '@/hooks/analyticsWeddings/useWw2'
import { useAnalyticsVariant } from '@/hooks/analyticsWeddings/AnalyticsVariantContext'
import { SectionCard, EmptyState, LoadingSkeleton, ErrorBanner } from '../components/ui'
import { DrillDrawer, type DrillContext } from '../components/DrillDrawer'
import { formatNumber } from '../lib/format'
import { periodOptions, periodToDates, type PeriodOption } from '../lib/dates'
import { Crown, TrendingUp, TrendingDown } from 'lucide-react'

type Eixo = 'faixa' | 'convidados' | 'destino' | 'origem' | 'canal_sdr' | 'canal_closer' | 'tipo'

// Baldes fundidos (form do site mudou de opções ao longo do tempo) — ver memória
// project_ww_analytics_pipeline_duravel: NUNCA re-dividir 50-80/80-100.
const FAIXA_ORDER = ['Até R$50 mil', 'R$50-100 mil', 'R$100-200 mil', 'R$200-500 mil', '+R$500 mil']
const CONV_ORDER = ['Apenas o casal', 'Até 20', '20-50', '50-100', '+100']

// Eixos do cruzamento livre (substituem as 3 combinações fixas antigas).
const EIXO_OPTS: { id: Eixo; label: string }[] = [
  { id: 'faixa', label: 'Faixa' },
  { id: 'convidados', label: 'Convidados' },
  { id: 'destino', label: 'Destino' },
  { id: 'origem', label: 'Origem' },
  { id: 'canal_sdr', label: '1ª reunião' },
  { id: 'canal_closer', label: 'Reunião fechamento' },
  { id: 'tipo', label: 'Tipo' },
]
const eixoLabel = (e: Eixo) => EIXO_OPTS.find(o => o.id === e)?.label ?? e
const eixoOrder = (e: Eixo): string[] | undefined => (e === 'faixa' ? FAIXA_ORDER : e === 'convidados' ? CONV_ORDER : undefined)
// Drill (ww2_drill_down) só conhece estes eixos; nos demais a célula não é clicável.
const DRILL_OK: Eixo[] = ['faixa', 'convidados', 'destino']

// Lente do cruzamento: qual par dos 3 números comparar em cada célula (mantém a célula limpa
// com 2 números e dá "vários tipos de análise"). Vendas=quem fechou, Antes=leads na referência, Agora=leads novos.
type LensKey = 'venda_agora' | 'antes_agora' | 'venda_antes'
type LensCfg = {
  leftQtd: (c: WwLeadIdealCruzamentoCell) => number
  leftPct: (c: WwLeadIdealCruzamentoCell) => number
  rightQtd: (c: WwLeadIdealCruzamentoCell) => number
  rightPct: (c: WwLeadIdealCruzamentoCell) => number
  leftLabel: string; rightLabel: string
  leftCls: string; rightCls: string
}
const LENS_OPTS: { key: LensKey; label: string }[] = [
  { key: 'venda_agora', label: 'Vendas × Agora' },
  { key: 'antes_agora', label: 'Antes × Agora' },
  { key: 'venda_antes', label: 'Vendas × Antes' },
]
const LENS: Record<LensKey, LensCfg> = {
  venda_agora: { leftQtd: c => c.hist_qtd, leftPct: c => c.hist_pct ?? 0, rightQtd: c => c.atual_qtd, rightPct: c => c.atual_pct ?? 0, leftLabel: 'vendas', rightLabel: 'leads agora', leftCls: 'text-emerald-700', rightCls: 'text-indigo-700' },
  antes_agora: { leftQtd: c => c.hist_leads_qtd ?? 0, leftPct: c => c.hist_leads_pct ?? 0, rightQtd: c => c.atual_qtd, rightPct: c => c.atual_pct ?? 0, leftLabel: 'leads antes', rightLabel: 'leads agora', leftCls: 'text-ww-gold-ink', rightCls: 'text-indigo-700' },
  venda_antes: { leftQtd: c => c.hist_qtd, leftPct: c => c.hist_pct ?? 0, rightQtd: c => c.hist_leads_qtd ?? 0, rightPct: c => c.hist_leads_pct ?? 0, leftLabel: 'vendas', rightLabel: 'leads antes', leftCls: 'text-emerald-700', rightCls: 'text-ww-gold-ink' },
}

// Helpers de data — YYYY-MM-DD pra input[type=date]
const toDateInput = (iso: string) => iso.slice(0, 10)
const fromDateInputStart = (s: string) => new Date(s + 'T00:00:00').toISOString()
const fromDateInputEnd = (s: string) => new Date(s + 'T23:59:59').toISOString()

export function Perfil({ filters, onFiltersChange }: TabProps) {
  return (
    <div className="space-y-4">
      {/* período vem dos seletores próprios da aba (Referência × Pipeline). Só recorte que NÃO é dimensão
          comparada: filtrar faixa/convidados/destino/canal degenera a própria comparação, e consultor/canais
          quase não existem em lead novo (27%/4%/2% preenchidos) — zerariam o lado "quem está entrando". */}
      <FilterBar value={filters} onChange={onFiltersChange} show={['tipo', 'origem']} />
      <PerfilContent filters={filters} />
    </div>
  )
}

function PerfilContent({ filters }: { filters: AppliedFilters }) {

  // Janela "referência" (quem fechou / leads antes) — mesmos atalhos das outras abas; default 12 meses.
  const [histPeriod, setHistPeriod] = useState<PeriodOption>('12m')
  const [histStart, setHistStart] = useState<string>(() => periodToDates('12m').dateStart)
  const [histEnd, setHistEnd]     = useState<string>(() => periodToDates('12m').dateEnd)
  // Janela "agora" (leads que entram) — default últimos 30 dias.
  const [atualPeriod, setAtualPeriod] = useState<PeriodOption>('30d')
  const [atualStart, setAtualStart] = useState<string>(() => periodToDates('30d').dateStart)
  const [atualEnd, setAtualEnd]     = useState<string>(() => periodToDates('30d').dateEnd)

  const onHistPeriodo  = (p: PeriodOption, s: string, e: string) => { setHistPeriod(p); setHistStart(s); setHistEnd(e) }
  const onAtualPeriodo = (p: PeriodOption, s: string, e: string) => { setAtualPeriod(p); setAtualStart(s); setAtualEnd(e) }

  const [drill, setDrill] = useState<DrillContext | null>(null)
  const [cruzX, setCruzX] = useState<Eixo>('faixa')
  const [cruzY, setCruzY] = useState<Eixo>('convidados')
  const [lens, setLens] = useState<LensKey>('venda_agora')
  const [referencia, setReferencia] = useState<'ganho' | 'perdido'>('ganho')

  const { data, isLoading, error } = useWwLeadIdeal({
    atualStart, atualEnd,
    historicoStart: histStart,
    historicoEnd: histEnd,
    minAmostra: 2,
    origins: filters.origins,
    consultorIds: filters.consultorIds,
    faixas: filters.faixas,
    destinos: filters.destinos,
    convidados: filters.convidados,
    tipos: filters.tipos,
    sdrCanal: filters.canalSdr,
    closerCanal: filters.canalCloser,
    referencia,
    cruzX, cruzY,
  })

  // Auditoria 2026-06-11: drill respeita os filtros ativos da aba (origem/tipo)
  const baseCtx = { dateStart: atualStart, dateEnd: atualEnd, origins: filters.origins, tipos: filters.tipos }

  if (isLoading) return <LoadingSkeleton rows={10} />
  if (error) return <ErrorBanner error={error as Error} />
  if (!data || data.error) return <EmptyState message={data?.error ?? 'Sem dados'} />

  const dims = data.comparacoes
  const dimFaixa = dims.find(d => d.dimensao === 'faixa')
  const dimDestino = dims.find(d => d.dimensao === 'destino')
  const dimConvidados = dims.find(d => d.dimensao === 'convidados')
  const dimCanal = dims.find(d => d.dimensao === 'canal_sdr')
  const dimCanalCloser = dims.find(d => d.dimensao === 'canal_closer')
  const cruzCells = data.cruzamento ?? []
  const topUnif = data.top_perfis_unificado ?? []

  const fonteV2 = (data as unknown as { fonte_v2?: string })?.fonte_v2

  return (
    <div className="space-y-5">
      <Header
        data={data}
        referencia={referencia} onReferencia={setReferencia}
        atualPeriod={atualPeriod} atualStart={atualStart} atualEnd={atualEnd} onAtualPeriodo={onAtualPeriodo}
        histPeriod={histPeriod} histStart={histStart} histEnd={histEnd} onHistPeriodo={onHistPeriodo}
        mostrarFonte={!!fonteV2}
      />

      {/* Cruzamento 2D — escolha 2 dimensões + a "lente" (qual par dos 3 números comparar na célula) */}
      <SectionCard
        title="Cruzamento — duas dimensões ao mesmo tempo"
        subtitle="Cruze duas dimensões (ex: faixa × convidados) e escolha qual par de números comparar em cada célula. A cor destaca onde os dois lados mais divergem."
      >
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <span className="text-xs font-medium text-slate-700">Cruzar:</span>
          <select
            value={cruzX}
            onChange={e => setCruzX(e.target.value as Eixo)}
            className="px-2.5 py-1.5 text-xs font-medium bg-white border border-ww-sand rounded-lg focus:outline-none focus:ring-2 focus:ring-ww-gold"
          >
            {EIXO_OPTS.filter(o => o.id !== cruzY).map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
          <span className="text-xs text-slate-400">×</span>
          <select
            value={cruzY}
            onChange={e => setCruzY(e.target.value as Eixo)}
            className="px-2.5 py-1.5 text-xs font-medium bg-white border border-ww-sand rounded-lg focus:outline-none focus:ring-2 focus:ring-ww-gold"
          >
            {EIXO_OPTS.filter(o => o.id !== cruzX).map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <span className="text-xs font-medium text-slate-700">Comparar:</span>
          <div className="inline-flex items-center gap-0.5 bg-ww-cream rounded-lg p-0.5 flex-wrap">
            {LENS_OPTS.map(o => (
              <button key={o.key} onClick={() => setLens(o.key)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-ww-gold ${
                  lens === o.key ? 'bg-ww-gold text-white shadow-sm' : 'text-ww-n600 hover:text-ww-n700'
                }`}>
                {o.label}
              </button>
            ))}
          </div>
        </div>
        <HeatmapDuplo
          cells={cruzCells}
          lens={LENS[lens]}
          xOrder={eixoOrder(cruzX)}
          yOrder={eixoOrder(cruzY)}
          xLabel={eixoLabel(cruzX)}
          yLabel={eixoLabel(cruzY)}
          onCellClick={DRILL_OK.includes(cruzX) && DRILL_OK.includes(cruzY) ? (x, y) => {
            const ctx: DrillContext = { ...baseCtx, title: `Leads novos — ${x} + ${y}` }
            if (cruzX === 'faixa') ctx.faixa = x; else if (cruzX === 'convidados') ctx.convidados = x; else if (cruzX === 'destino') ctx.destino = x
            if (cruzY === 'faixa') ctx.faixa = y; else if (cruzY === 'convidados') ctx.convidados = y; else if (cruzY === 'destino') ctx.destino = y
            setDrill(ctx)
          } : undefined}
        />
      </SectionCard>

      {/* Top combos UNIFICADO — perfis campeões de venda e se ainda entram como lead */}
      <TopPerfisUnificado
        perfis={topUnif}
        onPerfilClick={(p) => setDrill({ ...baseCtx, faixa: p.faixa, destino: p.destino, convidados: p.convidados, title: `Leads novos — ${p.faixa} + ${p.destino} + ${p.convidados}` })}
      />

      {/* Por categoria — UMA tabela por dimensão com os 3 números (Vendas / Leads antes / Leads agora) */}
      <div className="pt-3 mt-1 border-t border-ww-sand">
        <h3 className="font-ww-serif text-lg font-semibold text-ww-n700 tracking-tight">
          Por categoria — quem vende, quem entrava, quem entra agora
        </h3>
        <p className="text-sm text-ww-n500 mt-1 max-w-3xl">
          Para cada dimensão, lado a lado: <strong className="font-semibold text-ww-n600">Vendas</strong> (quem fechou na referência),
          <strong className="font-semibold text-ww-n600"> Leads (referência)</strong> e <strong className="font-semibold text-ww-n600">Leads (agora)</strong> —
          cada um como % do total do seu período. A coluna <strong className="font-semibold text-ww-n600">Mudança</strong> mostra se a fatia de agora ficou maior ou menor que a de antes. Clique numa linha pra ver os casais.
        </p>
      </div>

      <ComparacaoDimensao
        variant="entradas"
        titulo="Investimento declarado"
        subtitulo="Faixa de orçamento declarada no site."
        dim={dimFaixa}
        ordenarPor={FAIXA_ORDER}
        onCategoriaClick={(cat) => setDrill({ ...baseCtx, faixa: cat, title: `Leads novos — faixa "${cat}"` })}
      />
      <ComparacaoDimensao
        variant="entradas"
        titulo="Nº de convidados declarado"
        subtitulo="Tamanho da celebração indicado no site."
        dim={dimConvidados}
        ordenarPor={CONV_ORDER}
        onCategoriaClick={(cat) => setDrill({ ...baseCtx, convidados: cat, title: `Leads novos — convidados "${cat}"` })}
      />
      <ComparacaoDimensao
        variant="entradas"
        titulo="Destino declarado"
        subtitulo="Para onde o casal disse que queria casar."
        dim={dimDestino}
        onCategoriaClick={(cat) => setDrill({ ...baseCtx, destino: cat, title: `Leads novos — destino "${cat}"` })}
      />
      {dimCanal && (
        <ComparacaoDimensao
          variant="entradas"
          titulo="Como foi a 1ª reunião"
          subtitulo="Canal da 1ª reunião (vídeo, WhatsApp, presencial...). Cobertura parcial — conta só quem teve reunião registrada."
          dim={dimCanal}
          onCategoriaClick={(cat) => setDrill({ ...baseCtx, canalSdr: [cat], title: `Leads novos — 1ª reunião por "${cat}"` })}
        />
      )}
      {dimCanalCloser && (
        <ComparacaoDimensao
          variant="entradas"
          titulo="Como foi a reunião de fechamento"
          subtitulo="Canal da reunião com a Closer. Registrado desde nov/2025 — períodos antigos têm pouca cobertura."
          dim={dimCanalCloser}
          onCategoriaClick={(cat) => setDrill({ ...baseCtx, canalCloser: [cat], title: `Leads novos — fechamento por "${cat}"` })}
        />
      )}

      <DrillDrawer ctx={drill} onClose={() => setDrill(null)} />
    </div>
  )
}

const dateInputCls = 'px-1.5 py-1 text-xs bg-white border border-ww-sand rounded-lg text-ww-n700 hover:border-ww-sand-dk focus:outline-none focus:ring-2 focus:ring-ww-gold transition-colors'

// Seletor de período igual ao das outras abas: dropdown (este mês, ano, últimos X, período livre…)
// + datas só quando "Datas específicas". Trocar uma data não fecha mais o calendário (keepPreviousData).
function PeriodoPicker({ period, start, end, onChange }: {
  period: PeriodOption
  start: string; end: string
  onChange: (period: PeriodOption, start: string, end: string) => void
}) {
  const handleSel = (p: PeriodOption) => {
    if (p === 'custom') onChange('custom', start, end)
    else { const d = periodToDates(p); onChange(p, d.dateStart, d.dateEnd) }
  }
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <select
        value={period}
        onChange={e => handleSel(e.target.value as PeriodOption)}
        className="px-2.5 py-1.5 text-xs font-medium bg-white border border-ww-sand rounded-lg text-ww-n700 hover:border-ww-sand-dk focus:outline-none focus:ring-2 focus:ring-ww-gold transition-colors"
      >
        {periodOptions().map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
      </select>
      {period === 'custom' && (
        <span className="flex items-center gap-1.5 min-w-0">
          <input type="date" value={toDateInput(start)} max={toDateInput(end)}
            onChange={e => e.target.value && onChange('custom', fromDateInputStart(e.target.value), end)}
            className={`${dateInputCls} flex-1 min-w-0 md:flex-none`} />
          <span className="text-[11px] text-ww-n400">até</span>
          <input type="date" value={toDateInput(end)} min={toDateInput(start)}
            onChange={e => e.target.value && onChange('custom', start, fromDateInputEnd(e.target.value))}
            className={`${dateInputCls} flex-1 min-w-0 md:flex-none`} />
        </span>
      )}
    </div>
  )
}

function Header({ data, referencia, onReferencia, atualPeriod, atualStart, atualEnd, onAtualPeriodo, histPeriod, histStart, histEnd, onHistPeriodo, mostrarFonte }: {
  data: WwLeadIdealData
  referencia: 'ganho' | 'perdido'
  onReferencia: (v: 'ganho' | 'perdido') => void
  atualPeriod: PeriodOption; atualStart: string; atualEnd: string
  onAtualPeriodo: (p: PeriodOption, s: string, e: string) => void
  histPeriod: PeriodOption; histStart: string; histEnd: string
  onHistPeriodo: (p: PeriodOption, s: string, e: string) => void
  mostrarFonte: boolean
}) {
  const isNative = useAnalyticsVariant() === 'native'
  const refWord = referencia === 'perdido' ? 'perdas' : 'vendas'
  const refDesc = referencia === 'perdido' ? 'Leads que se perderam no período (com motivo de perda)' : 'Fechamentos que ocorreram no período'

  return (
    <div className="bg-white border border-ww-sand rounded-xl shadow-ww-lift p-5">
      <h2 className="font-ww-serif text-xl font-semibold text-ww-n700 tracking-tight">Lead ideal × Pipeline atual</h2>
      <p className="text-sm text-ww-n500 mt-1 max-w-3xl">
        O perfil de lead que <strong className="font-semibold text-ww-n600">fechava antes</strong> é o mesmo que está{' '}
        <strong className="font-semibold text-ww-n600">entrando agora</strong>? Cada lado tem o próprio período — ajuste as janelas e compare.
      </p>

      <div className="mt-4 grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] items-stretch gap-3">
        <JanelaCard
          dot="bg-emerald-500"
          label="Referência"
          headerExtra={
            <div className="inline-flex items-center gap-0.5 bg-ww-cream rounded-lg p-0.5">
              {([['ganho', 'Quem fechou'], ['perdido', 'Quem perdeu']] as const).map(([k, l]) => (
                <button key={k} onClick={() => onReferencia(k)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-ww-gold ${
                    referencia === k ? 'bg-ww-gold text-white shadow-sm' : 'text-ww-n600 hover:text-ww-n700'
                  }`}>
                  {l}
                </button>
              ))}
            </div>
          }
          numero={formatNumber(data.total_historico)}
          unidade={refWord}
          descricao={refDesc}
          period={histPeriod} start={histStart} end={histEnd}
          onPeriodo={onHistPeriodo}
        />

        {/* Conector — articula visualmente "referência × pipeline" */}
        <div className="hidden md:flex items-center" aria-hidden>
          <span className="w-9 h-9 rounded-full bg-white border-2 border-ww-gold text-ww-gold-ink font-ww-serif text-lg flex items-center justify-center select-none shadow-sm">×</span>
        </div>

        <JanelaCard
          dot="bg-indigo-500"
          label="Entrando agora"
          numero={formatNumber(data.total_atual)}
          unidade="leads novos"
          descricao="Leads que chegaram no período"
          period={atualPeriod} start={atualStart} end={atualEnd}
          onPeriodo={onAtualPeriodo}
        />
      </div>

      {mostrarFonte && (
        <p className="mt-3 pt-3 border-t border-ww-sand/60 text-[11px] text-ww-n400">
          {isNative
            ? 'Histórico vem do funil próprio do ttars (cards Weddings), com o perfil de entrada do form do casal (orçamento + convidados + destino).'
            : 'Histórico vem do ActiveCampaign direto — mesma base do dashboard do site, com o perfil de entrada do form do casal (orçamento + convidados + destino).'}
        </p>
      )}
    </div>
  )
}

// Uma janela da comparação: identidade (cor + rótulo), resultado (nº) e seletor de período.
function JanelaCard({ dot, label, headerExtra, numero, unidade, descricao, period, start, end, onPeriodo }: {
  dot: string
  label: string
  headerExtra?: ReactNode
  numero: string
  unidade: string
  descricao: string
  period: PeriodOption; start: string; end: string
  onPeriodo: (p: PeriodOption, s: string, e: string) => void
}) {
  return (
    <div className="bg-ww-paper/60 border border-ww-sand rounded-lg p-3 md:p-4 flex flex-col">
      {/* min-h casa com a altura do segment (headerExtra) pra alinhar os números dos dois cards */}
      <div className="flex items-center justify-between gap-x-2 gap-y-1.5 flex-wrap min-h-[28px]">
        <span className="inline-flex items-center gap-1.5">
          <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
          <span className="text-[11px] uppercase tracking-wider font-semibold text-ww-n500">{label}</span>
        </span>
        {headerExtra}
      </div>
      <div className="mt-2 flex items-baseline gap-1.5">
        <span className="text-2xl font-semibold text-ww-n700 tabular-nums leading-none">{numero}</span>
        <span className="text-sm text-ww-n500">{unidade}</span>
      </div>
      <div className="text-[11px] text-ww-n400 mt-1">{descricao}</div>
      <div className="mt-3 pt-3 border-t border-ww-sand/70">
        <PeriodoPicker period={period} start={start} end={end} onChange={onPeriodo} />
      </div>
    </div>
  )
}

function HeatmapDuplo({ cells, lens, xOrder, yOrder, xLabel, yLabel, onCellClick }: {
  cells: WwLeadIdealCruzamentoCell[]
  lens: LensCfg
  xOrder?: string[]
  yOrder?: string[]
  xLabel: string
  yLabel: string
  onCellClick?: (x: string, y: string) => void
}) {
  if (!cells || cells.length === 0) {
    return <EmptyState message="Sem combinações com amostra suficiente — ajuste o período ou escolha outras dimensões." />
  }
  const xs = xOrder ? xOrder.filter(v => cells.some(c => c.x === v)) : Array.from(new Set(cells.map(c => c.x)))
  const ys = yOrder
    ? yOrder.filter(v => cells.some(c => c.y === v))
    : Array.from(new Set(cells.map(c => c.y))).sort((a, b) => {
        const sa = cells.filter(c => c.y === a).reduce((s, c) => s + lens.leftQtd(c), 0)
        const sb = cells.filter(c => c.y === b).reduce((s, c) => s + lens.leftQtd(c), 0)
        return sb - sa
      })
  const cellMap = new Map(cells.map(c => [`${c.x}|${c.y}`, c]))

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-x-3 gap-y-1.5 text-[11px] text-slate-500 flex-wrap">
        <span>Cada célula: <span className={`${lens.leftCls} font-medium`}>{lens.leftLabel} %</span> / <span className={`${lens.rightCls} font-medium`}>{lens.rightLabel} %</span> · cor:</span>
        <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-900">mais {lens.rightLabel}</span>
        <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700">parecidos</span>
        <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-900">menos {lens.rightLabel}</span>
      </div>
      <div className="overflow-x-auto border border-slate-200 rounded-lg bg-white">
        <table className="w-full text-xs">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-3 py-2 text-center font-medium text-slate-500 sticky left-0 bg-slate-50 z-10 whitespace-nowrap">{yLabel} ↓ / {xLabel} →</th>
              {xs.map(x => <th key={x} className="px-3 py-2 text-center font-medium text-slate-700 min-w-[110px]">{x}</th>)}
            </tr>
          </thead>
          <tbody>
            {ys.map(y => (
              <tr key={y} className="border-t border-slate-100">
                <td className="px-3 py-2 text-slate-900 font-medium whitespace-nowrap sticky left-0 bg-white z-10">{y}</td>
                {xs.map(x => {
                  const cell = cellMap.get(`${x}|${y}`)
                  const lq = cell ? lens.leftQtd(cell) : 0
                  const rq = cell ? lens.rightQtd(cell) : 0
                  if (!cell || (lq === 0 && rq === 0)) {
                    return <td key={x} className="px-3 py-2 text-center bg-slate-50 text-slate-300">—</td>
                  }
                  const lp = lens.leftPct(cell)
                  const rp = lens.rightPct(cell)
                  const delta = rp - lp
                  const bg = Math.abs(delta) < 2 ? 'bg-slate-50 text-slate-700'
                    : delta > 0 ? (delta >= 5 ? 'bg-emerald-100 text-emerald-900' : 'bg-emerald-50 text-emerald-800')
                    : (delta <= -5 ? 'bg-amber-100 text-amber-900' : 'bg-amber-50 text-amber-800')
                  const inner = (
                    <>
                      <div className="text-[11px] tabular-nums">
                        <span className={`${lens.leftCls} font-medium`}>{lp}%</span>
                        <span className="text-slate-400 mx-0.5">/</span>
                        <span className={`${lens.rightCls} font-medium`}>{rp}%</span>
                      </div>
                      <div className="text-[10px] opacity-75 mt-0.5">{lq}→{rq}</div>
                    </>
                  )
                  return (
                    <td key={x} className={`p-0 ${bg}`} title={`${lens.leftLabel}: ${lq} (${lp}%) · ${lens.rightLabel}: ${rq} (${rp}%) · Δ ${delta >= 0 ? '+' : ''}${delta.toFixed(1)}pp`}>
                      {onCellClick ? (
                        <button onClick={() => onCellClick(x, y)} className="w-full h-full px-2 py-2 text-center block cursor-pointer hover:ring-2 hover:ring-ww-gold focus:ring-2 focus:ring-ww-gold focus:outline-none">
                          {inner}
                        </button>
                      ) : (
                        <div className="px-2 py-2 text-center">{inner}</div>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// Uma célula de número do Top perfis: no mobile o rótulo fica em cima do valor (pra caber 3 lado a lado);
// no desktop o rótulo vem do cabeçalho e a célula só mostra o valor, alinhado à direita.
function NumCellTop({ label, qtd, pct, cls }: { label: string; qtd: number; pct: number | null; cls: string }) {
  return (
    <div className="col-span-4 sm:col-span-2 flex flex-col items-start gap-0 sm:flex-row sm:items-baseline sm:justify-end sm:gap-1.5">
      <span className="sm:hidden text-[9px] uppercase tracking-wide text-slate-400 leading-none mb-0.5">{label}</span>
      <span className="inline-flex items-baseline gap-1">
        <span className="text-[13px] font-semibold text-slate-800 tabular-nums">{formatNumber(qtd)}</span>
        <span className={`text-[10px] tabular-nums font-medium ${cls}`}>{pct ?? 0}%</span>
      </span>
    </div>
  )
}

// Top perfis UNIFICADO: combos (faixa+destino+convidados) ordenados por quem mais vendeu,
// com os 3 números (Vendas / Leads antes / Leads agora) na mesma linha.
function TopPerfisUnificado({ perfis, onPerfilClick }: {
  perfis: WwLeadIdealPerfilUnif[]
  onPerfilClick?: (p: WwLeadIdealPerfilUnif) => void
}) {
  const maxVendas = Math.max(0, ...perfis.map(p => p.vendas))
  return (
    <SectionCard
      title="Top perfis — quem mais vende, e se ainda entra"
      subtitle="Combos (faixa + destino + convidados) ordenados por quem mais fechou na referência. Pra cada um: vendas, leads que entravam antes e leads que entram agora. Clique pra ver os casais."
    >
      {perfis.length === 0 ? <EmptyState message="Sem perfis com amostra suficiente — ajuste o período ou os filtros." /> : (
        <div className="border border-slate-200 rounded-lg overflow-hidden bg-white">
          <div className="hidden sm:grid grid-cols-12 gap-x-3 px-3 py-2 bg-slate-50 border-b border-slate-200 text-[10px] uppercase font-medium tracking-wide text-slate-500">
            <div className="col-span-6">Perfil</div>
            <div className="col-span-2 flex items-center justify-end gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" aria-hidden />Vendas</div>
            <div className="col-span-2 flex items-center justify-end gap-1"><span className="w-1.5 h-1.5 rounded-full bg-ww-gold" aria-hidden />Leads antes</div>
            <div className="col-span-2 flex items-center justify-end gap-1"><span className="w-1.5 h-1.5 rounded-full bg-indigo-500" aria-hidden />Leads agora</div>
          </div>
          <div className="divide-y divide-slate-100">
            {perfis.map((p, i) => {
              const Wrap = onPerfilClick ? ('button' as const) : ('div' as const)
              const isTop = p.vendas > 0 && p.vendas === maxVendas
              return (
                <Wrap
                  key={`${p.faixa}-${p.destino}-${p.convidados}-${i}`}
                  onClick={onPerfilClick ? () => onPerfilClick(p) : undefined}
                  className={`w-full grid grid-cols-12 gap-x-3 gap-y-1.5 items-center px-3 py-2.5 text-left ${onPerfilClick ? 'hover:bg-ww-cream/50 active:bg-ww-cream cursor-pointer transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ww-gold' : ''}`}
                >
                  <div className="col-span-12 sm:col-span-6 flex items-center gap-2 min-w-0">
                    <span className="text-slate-400 font-mono text-xs w-5 text-right shrink-0">{i + 1}</span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1 min-w-0">
                        <span className="text-sm font-medium text-slate-900 truncate">{p.faixa}</span>
                        {isTop && <Crown className="w-3.5 h-3.5 text-ww-gold shrink-0" aria-label="Quem mais vendeu" />}
                      </div>
                      <div className="text-[11px] text-slate-500 truncate">{p.destino} · {p.convidados} convidados</div>
                    </div>
                  </div>
                  <NumCellTop label="Vendas" qtd={p.vendas} pct={p.vendas_pct} cls="text-emerald-700" />
                  <NumCellTop label="Antes" qtd={p.leads_ref} pct={p.leads_ref_pct} cls="text-ww-gold-ink" />
                  <NumCellTop label="Agora" qtd={p.leads_agora} pct={p.leads_agora_pct} cls="text-indigo-700" />
                </Wrap>
              )
            })}
          </div>
        </div>
      )}
    </SectionCard>
  )
}

// variant 'fechou' (default): esquerda = quem FECHOU (referência) × leads agora — comportamento original.
// variant 'entradas': esquerda = QUANTIDADE de leads que ENTRAVAM na referência × quantos entram agora.
//   Mesmo universo dos dois lados (entrada de lead), cada lado como % do total do seu período (soma 100%).
type ComparacaoVariant = 'fechou' | 'entradas'

// Indicador visual da MUDANÇA: a fatia de agora ficou maior ou menor que a de antes?
// Verde pra cima, rosa pra baixo, cinza quando praticamente igual (< 1 ponto).
// `mini` = só a setinha colorida (pro mobile, dentro da célula "agora"); some quando igual.
function MudancaBadge({ antesPct, agoraPct, mini }: { antesPct: number | null; agoraPct: number | null; mini?: boolean }) {
  if (antesPct == null || agoraPct == null) return mini ? null : <span className="text-slate-300 text-xs">—</span>
  const delta = Math.round((agoraPct - antesPct) * 10) / 10
  const flat = Math.abs(delta) < 1
  const up = delta > 0
  if (mini) {
    if (flat) return null
    return up
      ? <TrendingUp className="w-3 h-3 text-emerald-600 shrink-0" aria-label={`entra mais agora (+${delta} pontos)`} />
      : <TrendingDown className="w-3 h-3 text-rose-600 shrink-0" aria-label={`entra menos agora (${delta} pontos)`} />
  }
  if (flat) {
    return <span className="inline-flex items-center h-5 px-1.5 text-[11px] rounded-md border bg-slate-100 text-slate-500 border-slate-200 font-medium">igual</span>
  }
  return (
    <span
      title={`Antes ${antesPct}% → agora ${agoraPct}% (${up ? '+' : ''}${delta} pontos)`}
      className={`inline-flex items-center gap-0.5 h-5 pl-1 pr-1.5 text-[11px] rounded-md border font-medium tabular-nums ${up ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'}`}
    >
      {up ? <TrendingUp className="w-3.5 h-3.5" aria-hidden /> : <TrendingDown className="w-3.5 h-3.5" aria-hidden />}
      {up ? '+' : '−'}{Math.abs(delta)}
    </span>
  )
}

function ComparacaoDimensao({ titulo, subtitulo, dim, ordenarPor, onCategoriaClick, variant = 'fechou' }: {
  titulo: string
  subtitulo: string
  dim: { dimensao: string; dados: WwLeadIdealItem[] } | undefined
  ordenarPor?: string[]
  onCategoriaClick?: ((categoria: string) => void) | undefined
  variant?: ComparacaoVariant
}) {
  const isEnt = variant === 'entradas'
  const leftQtdOf  = (d: WwLeadIdealItem) => isEnt ? (d.historico_leads_qtd ?? 0) : d.historico_qtd
  const leftPctOf  = (d: WwLeadIdealItem) => isEnt ? (d.historico_leads_pct ?? 0) : (d.historico_pct ?? 0)

  if (!dim || dim.dados.length === 0) {
    return (
      <SectionCard title={titulo} subtitle={subtitulo}>
        <EmptyState message="Sem dados suficientes nessa dimensão" />
      </SectionCard>
    )
  }

  const sorted = ordenarPor
    ? [...dim.dados].sort((a, b) => {
        const ia = ordenarPor.indexOf(a.categoria)
        const ib = ordenarPor.indexOf(b.categoria)
        if (ia === -1 && ib === -1) return leftQtdOf(b) - leftQtdOf(a)
        if (ia === -1) return 1
        if (ib === -1) return -1
        return ia - ib
      })
    : [...dim.dados].sort((a, b) => leftQtdOf(b) - leftQtdOf(a))

  const maxPct = Math.max(5, ...sorted.flatMap(d => [leftPctOf(d), d.atual_pct ?? 0]))
  const totLeftQtd  = sorted.reduce((s, d) => s + leftQtdOf(d), 0)
  const totRightQtd = sorted.reduce((s, d) => s + d.atual_qtd, 0)
  // 'entradas' ganha uma coluna "Vendas (ref)" = quantos fecharam por categoria (quem mais vendeu),
  // pra cruzar com o volume de leads. Usa os mesmos dados de quem fechou (historico_qtd/pct).
  const totVendas = sorted.reduce((s, d) => s + d.historico_qtd, 0)
  const maxVendas = Math.max(0, ...sorted.map(d => d.historico_qtd))

  // Marca por lado: referência (esquerda) vs agora (direita). 'fechou' usa verde; 'entradas' usa o dourado da marca.
  const leftBar    = isEnt ? 'bg-ww-gold'      : 'bg-emerald-400'
  const leftPctCls = isEnt ? 'text-ww-gold-ink' : 'text-emerald-700'
  const leftHeader = isEnt ? 'Leads (referência)' : '% de quem FECHOU (referência)'
  const rightHeader = isEnt ? 'Leads (agora)' : '% dos leads que ENTRAM agora'

  // Colunas responsivas: no mobile escondemos as barras (decoração) e a coluna Lift (métrica
  // avançada) pra os números terem espaço; no desktop (sm+) volta ao layout denso.
  // 'entradas' tem 5 colunas (inclui Vendas); 'fechou' mantém as 4 originais.
  // Vendas é coluna no desktop; no mobile vira sub-linha embaixo da categoria (senão não cabe).
  const colCat  = 'col-span-4 sm:col-span-3'
  const colVend = 'hidden sm:block sm:col-span-2'
  const colSide = isEnt ? 'col-span-4 sm:col-span-3' : 'col-span-4'
  const colLift = 'hidden sm:col-span-1'
  // Números: compactos no mobile (auto-width, menor) e densos no desktop (largura fixa + barra).
  const numPct = `text-[10px] sm:text-xs tabular-nums font-medium`
  const numQty = isEnt ? 'text-[10px] sm:text-[11px] font-semibold text-slate-700 tabular-nums' : 'text-[10px] text-slate-400 tabular-nums'

  return (
    <SectionCard title={titulo} subtitle={subtitulo}>
      <div className="border border-slate-200 rounded-lg overflow-hidden bg-white">
        <div className="grid grid-cols-12 gap-x-3 px-3 py-2 bg-slate-50 border-b border-slate-200 text-[10px] uppercase font-medium tracking-wide text-slate-500">
          <div className={`${colCat} text-center`}>Categoria</div>
          {isEnt && <div className={`${colVend} text-center`}>Vendas (ref)</div>}
          <div className={`${colSide} text-center`}>{leftHeader}</div>
          <div className={`${colLift} sm:block text-center`}>Mudança</div>
          <div className={`${colSide} text-center`}>{rightHeader}</div>
        </div>
        <div className="divide-y divide-slate-100">
          {sorted.map(d => {
            const leftPct = leftPctOf(d)
            const atualPct = d.atual_pct ?? 0
            const histBar = (leftPct / maxPct) * 100
            const atualBar = (atualPct / maxPct) * 100
            const Wrap = onCategoriaClick ? ('button' as const) : ('div' as const)
            const isTopSeller = isEnt && d.historico_qtd > 0 && d.historico_qtd === maxVendas
            return (
              <Wrap
                key={d.categoria}
                onClick={onCategoriaClick ? () => onCategoriaClick(d.categoria) : undefined}
                className={`w-full grid grid-cols-12 gap-x-3 items-center px-3 py-2.5 text-xs text-left ${onCategoriaClick ? 'hover:bg-ww-cream/50 active:bg-ww-cream cursor-pointer transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ww-gold' : ''}`}
                title={onCategoriaClick ? `Ver leads novos — ${d.categoria}` : undefined}
              >
                <div className={`${colCat} min-w-0`}>
                  <div className="font-medium text-slate-900 truncate" title={d.categoria}>{d.categoria}</div>
                  {isEnt && (
                    <div className="sm:hidden mt-0.5 flex items-center gap-1 text-[10px] text-slate-500">
                      <span className="uppercase tracking-wide">Vendas</span>
                      <span className="font-semibold text-slate-700 tabular-nums">{formatNumber(d.historico_qtd)}</span>
                      <span className="text-emerald-700 tabular-nums">({d.historico_pct ?? 0}%)</span>
                      {isTopSeller && <Crown className="w-3 h-3 text-ww-gold shrink-0" aria-label="Quem mais vendeu" />}
                    </div>
                  )}
                </div>
                {isEnt && (
                  <div className={colVend}>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-4 bg-slate-100 rounded-sm overflow-hidden relative">
                        <div className="absolute inset-y-0 left-0 bg-emerald-300" style={{ width: `${maxVendas > 0 ? Math.round((d.historico_qtd / maxVendas) * 100) : 0}%` }} />
                      </div>
                      <span className="text-[11px] font-semibold text-slate-700 tabular-nums">{formatNumber(d.historico_qtd)}</span>
                      <span className="text-[10px] tabular-nums text-emerald-700 font-medium">({d.historico_pct ?? 0}%)</span>
                      {isTopSeller && <Crown className="w-3 h-3 text-ww-gold shrink-0" aria-label="Quem mais vendeu na referência" />}
                    </div>
                  </div>
                )}
                <div className={colSide}>
                  <div className="flex items-center gap-1 sm:gap-2 flex-row-reverse">
                    <span className={`sm:w-12 text-right ${numPct} ${leftPctCls}`}>{leftPct}%</span>
                    <span className={`sm:w-10 text-right ${numQty}`}>{formatNumber(leftQtdOf(d))}</span>
                    <div className="hidden sm:block flex-1 h-4 bg-slate-100 rounded-sm overflow-hidden relative">
                      <div className={`absolute top-0 right-0 h-full ${leftBar}`} style={{ width: `${histBar}%` }} />
                    </div>
                  </div>
                </div>
                <div className={`${colLift} sm:flex items-center justify-center`}>
                  <MudancaBadge antesPct={leftPctOf(d)} agoraPct={d.atual_pct} />
                </div>
                <div className={colSide}>
                  <div className="flex items-center gap-1 sm:gap-2">
                    {isEnt && <span className="sm:hidden inline-flex"><MudancaBadge antesPct={leftPctOf(d)} agoraPct={d.atual_pct} mini /></span>}
                    <div className="hidden sm:block flex-1 h-4 bg-slate-100 rounded-sm overflow-hidden relative">
                      <div className="h-full bg-indigo-400" style={{ width: `${atualBar}%` }} />
                    </div>
                    <span className={`sm:w-10 text-left ${numQty}`}>{formatNumber(d.atual_qtd)}</span>
                    <span className={`sm:w-12 text-left ${numPct} text-indigo-700`}>{atualPct}%</span>
                  </div>
                </div>
              </Wrap>
            )
          })}
        </div>
        {isEnt && (
          <div className="grid grid-cols-12 gap-x-3 items-center px-3 py-2 text-xs bg-ww-cream/40 border-t-2 border-ww-sand">
            <div className={`${colCat} font-semibold text-ww-n700`}>
              <div>Total</div>
              <div className="sm:hidden mt-0.5 flex items-center gap-1 text-[10px] font-normal text-slate-500">
                <span className="uppercase tracking-wide">Vendas</span>
                <span className="font-semibold text-ww-n700 tabular-nums">{formatNumber(totVendas)}</span>
                <span className="text-emerald-700">(100%)</span>
              </div>
            </div>
            <div className={colVend}>
              <div className="flex items-center justify-center gap-1">
                <span className="text-[10px] sm:text-[11px] font-semibold text-ww-n700 tabular-nums">{formatNumber(totVendas)}</span>
                <span className="text-[10px] tabular-nums text-emerald-700 font-medium">(100%)</span>
              </div>
            </div>
            <div className={colSide}>
              <div className="flex items-center gap-1 sm:gap-2 flex-row-reverse">
                <span className="sm:w-12 text-right tabular-nums text-ww-n500 font-medium text-[10px] sm:text-xs">100%</span>
                <span className="sm:w-10 text-right text-[10px] sm:text-[11px] font-semibold text-ww-n700 tabular-nums">{formatNumber(totLeftQtd)}</span>
                <div className="hidden sm:block flex-1" />
              </div>
            </div>
            <div className={`${colLift} sm:block`} />
            <div className={colSide}>
              <div className="flex items-center gap-1 sm:gap-2">
                <div className="hidden sm:block flex-1" />
                <span className="sm:w-10 text-left text-[10px] sm:text-[11px] font-semibold text-ww-n700 tabular-nums">{formatNumber(totRightQtd)}</span>
                <span className="sm:w-12 text-left tabular-nums text-ww-n500 font-medium text-[10px] sm:text-xs">100%</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </SectionCard>
  )
}
