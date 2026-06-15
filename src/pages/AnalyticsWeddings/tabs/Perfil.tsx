import { useState, type ReactNode } from 'react'
import { FilterBar, type TabProps, type AppliedFilters } from '../components/FilterBar'
import { useWwLeadIdeal, type WwLeadIdealData, type WwLeadIdealItem, type WwLeadIdealCruzamentoCell, type WwLeadIdealPerfilTop } from '@/hooks/analyticsWeddings/useWw2'
import { SectionCard, EmptyState, LoadingSkeleton, ErrorBanner } from '../components/ui'
import { DrillDrawer, type DrillContext } from '../components/DrillDrawer'
import { LiftBadge } from '../components/LiftBadge'
import { formatNumber } from '../lib/format'

type Dim = 'faixa' | 'destino' | 'convidados'
type Eixo = 'faixa' | 'convidados' | 'destino' | 'origem' | 'canal_sdr' | 'canal_closer' | 'tipo'

// Baldes fundidos (form do site mudou de opções ao longo do tempo) — ver memória
// project_ww_analytics_pipeline_duravel: NUNCA re-dividir 50-80/80-100.
const FAIXA_ORDER = ['Até R$50 mil', 'R$50-100 mil', 'R$100-200 mil', 'R$200-500 mil', '+R$500 mil']
const CONV_ORDER = ['Apenas o casal', 'Até 20', '20-50', '50-100', '+100']

// Eixos do cruzamento livre (substituem as 3 combinações fixas antigas).
const EIXO_OPTS: { id: Eixo; label: string }[] = [
  { id: 'faixa', label: '💰 Faixa' },
  { id: 'convidados', label: '👥 Convidados' },
  { id: 'destino', label: '🏝️ Destino' },
  { id: 'origem', label: '🎯 Origem' },
  { id: 'canal_sdr', label: '🎥 1ª reunião' },
  { id: 'canal_closer', label: '🎥 Reunião fechamento' },
  { id: 'tipo', label: '💍 Tipo' },
]
const eixoLabel = (e: Eixo) => EIXO_OPTS.find(o => o.id === e)?.label ?? e
const eixoOrder = (e: Eixo): string[] | undefined => (e === 'faixa' ? FAIXA_ORDER : e === 'convidados' ? CONV_ORDER : undefined)
// Drill (ww2_drill_down) só conhece estes eixos; nos demais a célula não é clicável.
const DRILL_OK: Eixo[] = ['faixa', 'convidados', 'destino']

// Helpers de data — YYYY-MM-DD pra input[type=date]
const toDateInput = (iso: string) => iso.slice(0, 10)
const fromDateInputStart = (s: string) => new Date(s + 'T00:00:00').toISOString()
const fromDateInputEnd = (s: string) => new Date(s + 'T23:59:59').toISOString()
const monthsAgo = (n: number) => { const d = new Date(); d.setMonth(d.getMonth() - n); return d.toISOString() }

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

  // Janela "atual" — começa igual ao filtro global mas vira editável
  const [atualStart, setAtualStart] = useState<string>(filters.dateStart)
  const [atualEnd, setAtualEnd]     = useState<string>(filters.dateEnd)
  // Janela "histórico" — independente, default últimos 12 meses
  const [histStart, setHistStart] = useState<string>(monthsAgo(12))
  const [histEnd, setHistEnd]     = useState<string>(new Date().toISOString())
  // Atalho ativo de cada janela (some quando a data é editada à mão)
  const [histPreset, setHistPreset]   = useState<HistPresetK | null>('12m')
  const [atualPreset, setAtualPreset] = useState<AtualPresetK | null>('30d')

  const aplicarHistPreset = (k: HistPresetK) => {
    setHistPreset(k)
    setHistStart(k === 'tudo' ? '2020-01-01T00:00:00.000Z' : monthsAgo(parseInt(k)))
    setHistEnd(new Date().toISOString())
  }
  const aplicarAtualPreset = (k: AtualPresetK) => {
    setAtualPreset(k)
    const d = new Date(); d.setDate(d.getDate() - parseInt(k))
    setAtualStart(d.toISOString())
    setAtualEnd(new Date().toISOString())
  }
  const histStartManual  = (v: string) => { setHistPreset(null); setHistStart(v) }
  const histEndManual    = (v: string) => { setHistPreset(null); setHistEnd(v) }
  const atualStartManual = (v: string) => { setAtualPreset(null); setAtualStart(v) }
  const atualEndManual   = (v: string) => { setAtualPreset(null); setAtualEnd(v) }

  const [drill, setDrill] = useState<DrillContext | null>(null)
  const [cruzX, setCruzX] = useState<Eixo>('faixa')
  const [cruzY, setCruzY] = useState<Eixo>('convidados')
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
  const topHist = data.top_perfis_historico ?? []
  const topAtual = data.top_perfis_atual ?? []
  const refLabel = referencia === 'perdido' ? 'perdeu' : 'fechou'
  const refUpper = referencia === 'perdido' ? 'PERDEU' : 'FECHOU'

  const fonteV2 = (data as unknown as { fonte_v2?: string })?.fonte_v2

  return (
    <div className="space-y-5">
      <Header
        data={data}
        referencia={referencia} onReferencia={setReferencia}
        atualStart={atualStart} atualEnd={atualEnd}
        histStart={histStart} histEnd={histEnd}
        onAtualStart={atualStartManual} onAtualEnd={atualEndManual}
        onHistStart={histStartManual} onHistEnd={histEndManual}
        histPreset={histPreset} atualPreset={atualPreset}
        onHistPreset={aplicarHistPreset} onAtualPreset={aplicarAtualPreset}
        mostrarFonte={!!fonteV2}
      />

      <DiagnosticoGeral data={data} />

      {/* Análise cruzada 2D — heatmap com eixos LIVRES (escolha qualquer par) */}
      <SectionCard
        title="🔍 Análise cruzada — Lead ideal vs Pipeline"
        subtitle={`Escolha duas dimensões pra cruzar. Cada célula mostra o % entre quem ${refLabel} (referência) e o % entre os leads novos. Diferenças destacadas em cor.`}
      >
        <div className="flex items-center gap-2 mb-4 flex-wrap">
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
        <HeatmapDuplo
          cells={cruzCells}
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

      {/* Top combos 3D — lado a lado */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <TopPerfisCard
          titulo={`🏆 Top 10 perfis de quem ${refUpper} (referência)`}
          subtitulo={`Combos (faixa + destino + convidados) mais frequentes entre quem ${refLabel} no período de referência. Clique pra ver os casais.`}
          perfis={topHist}
          accent="emerald"
          onPerfilClick={(p) => setDrill({
            dateStart: histStart, dateEnd: histEnd,
            // A aba não tem seletor de modo: o universo de referência é "quem fechou NO período
            // histórico" → ganho pela data do ganho (throughput); perdido não tem data própria → safra.
            dateMode: referencia === 'ganho' ? 'throughput' : 'cohort',
            origins: filters.origins, tipos: filters.tipos,
            faixa: p.faixa, destino: p.destino, convidados: p.convidados,
            marco: referencia === 'perdido' ? 'perdido' : 'ganho',
            title: `Quem ${refLabel} — ${p.faixa} + ${p.destino} + ${p.convidados}`,
            subtitle: 'período de referência',
          })}
        />
        <TopPerfisCard
          titulo="📥 Top 10 perfis dos LEADS NOVOS"
          subtitulo="Combos mais frequentes entre quem entrou no período atual."
          perfis={topAtual}
          accent="indigo"
          onPerfilClick={(p) => setDrill({ ...baseCtx, faixa: p.faixa, destino: p.destino, convidados: p.convidados, title: `Leads novos — ${p.faixa} + ${p.destino} + ${p.convidados}` })}
        />
      </div>

      <ComparacaoDimensao
        titulo="💰 Investimento declarado"
        subtitulo={`À esquerda, perfil de quem ${refLabel} no período de referência. À direita, perfil dos leads novos. Lift acima de 1 = pipeline tem MAIS dessa categoria; abaixo de 1 = MENOS.`}
        dim={dimFaixa}
        ordenarPor={FAIXA_ORDER}
        onCategoriaClick={(cat) => setDrill({ ...baseCtx, faixa: cat, title: `Leads novos — faixa "${cat}"` })}
      />
      <ComparacaoDimensao
        titulo="👥 Nº de convidados declarado"
        subtitulo="Tamanho da celebração que o casal indicou no site."
        dim={dimConvidados}
        ordenarPor={CONV_ORDER}
        onCategoriaClick={(cat) => setDrill({ ...baseCtx, convidados: cat, title: `Leads novos — convidados "${cat}"` })}
      />
      <ComparacaoDimensao
        titulo="🏝️ Destino declarado"
        subtitulo="Para onde o casal disse que queria casar."
        dim={dimDestino}
        onCategoriaClick={(cat) => setDrill({ ...baseCtx, destino: cat, title: `Leads novos — destino "${cat}"` })}
      />
      {dimCanal && (
        <ComparacaoDimensao
          titulo="🎥 Como foi a 1ª reunião"
          subtitulo={`Canal da 1ª reunião (vídeo, WhatsApp, presencial...) entre quem ${refLabel} vs os leads novos. Cobertura parcial — conta só quem teve reunião registrada.`}
          dim={dimCanal}
          onCategoriaClick={(cat) => setDrill({ ...baseCtx, canalSdr: [cat], title: `Leads novos — 1ª reunião por "${cat}"` })}
        />
      )}
      {dimCanalCloser && (
        <ComparacaoDimensao
          titulo="🎥 Como foi a reunião de fechamento"
          subtitulo={`Canal da reunião com a Closer entre quem ${refLabel} vs os leads novos. Registrado desde nov/2025 — períodos antigos têm pouca cobertura.`}
          dim={dimCanalCloser}
          onCategoriaClick={(cat) => setDrill({ ...baseCtx, canalCloser: [cat], title: `Leads novos — fechamento por "${cat}"` })}
        />
      )}

      <DrillDrawer ctx={drill} onClose={() => setDrill(null)} />
    </div>
  )
}

// Atalhos de período de cada janela. parseInt('12m') → 12; 'tudo' tratado à parte.
type HistPresetK = '3m' | '6m' | '12m' | '24m' | 'tudo'
type AtualPresetK = '7d' | '30d' | '60d' | '90d'
const HIST_PRESETS: { k: HistPresetK; label: string }[] = [
  { k: '3m', label: '3m' }, { k: '6m', label: '6m' }, { k: '12m', label: '12m' }, { k: '24m', label: '24m' }, { k: 'tudo', label: 'tudo' },
]
const ATUAL_PRESETS: { k: AtualPresetK; label: string }[] = [
  { k: '7d', label: '7d' }, { k: '30d', label: '30d' }, { k: '60d', label: '60d' }, { k: '90d', label: '90d' },
]

function Header({ data, referencia, onReferencia, atualStart, atualEnd, histStart, histEnd, onAtualStart, onAtualEnd, onHistStart, onHistEnd, histPreset, atualPreset, onHistPreset, onAtualPreset, mostrarFonte }: {
  data: WwLeadIdealData
  referencia: 'ganho' | 'perdido'
  onReferencia: (v: 'ganho' | 'perdido') => void
  atualStart: string; atualEnd: string
  histStart: string; histEnd: string
  onAtualStart: (v: string) => void
  onAtualEnd: (v: string) => void
  onHistStart: (v: string) => void
  onHistEnd: (v: string) => void
  histPreset: HistPresetK | null
  atualPreset: AtualPresetK | null
  onHistPreset: (k: HistPresetK) => void
  onAtualPreset: (k: AtualPresetK) => void
  mostrarFonte: boolean
}) {
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
          start={histStart} end={histEnd}
          onStart={onHistStart} onEnd={onHistEnd}
          presets={HIST_PRESETS}
          preset={histPreset}
          onPreset={(k) => onHistPreset(k as HistPresetK)}
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
          start={atualStart} end={atualEnd}
          onStart={onAtualStart} onEnd={onAtualEnd}
          presets={ATUAL_PRESETS}
          preset={atualPreset}
          onPreset={(k) => onAtualPreset(k as AtualPresetK)}
        />
      </div>

      {mostrarFonte && (
        <p className="mt-3 pt-3 border-t border-ww-sand/60 text-[11px] text-ww-n400">
          ✨ Histórico vem do ActiveCampaign direto — mesma base do dashboard do site, com o perfil de entrada do form do casal (orçamento + convidados + destino).
        </p>
      )}
    </div>
  )
}

const dateInputCls = 'px-1.5 py-1 text-xs bg-white border border-ww-sand rounded-lg text-ww-n700 hover:border-ww-sand-dk focus:outline-none focus:ring-2 focus:ring-ww-gold transition-colors'

// Uma janela da comparação: identidade (cor + rótulo), resultado (nº) e controle de período (atalhos + datas)
function JanelaCard({ dot, label, headerExtra, numero, unidade, descricao, start, end, onStart, onEnd, presets, preset, onPreset }: {
  dot: string
  label: string
  headerExtra?: ReactNode
  numero: string
  unidade: string
  descricao: string
  start: string; end: string
  onStart: (v: string) => void
  onEnd: (v: string) => void
  presets: { k: string; label: string }[]
  preset: string | null
  onPreset: (k: string) => void
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
      <div className="mt-3 pt-3 border-t border-ww-sand/70 flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="inline-flex items-center gap-1">
          {presets.map(p => (
            <button key={p.k} onClick={() => onPreset(p.k)}
              className={`px-2 py-1 text-[11px] font-medium rounded-md border transition-colors active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-ww-gold ${
                preset === p.k
                  ? 'bg-ww-gold-soft border-ww-gold text-ww-gold-ink'
                  : 'bg-white border-ww-sand text-ww-n600 hover:border-ww-sand-dk'
              }`}>
              {p.label}
            </button>
          ))}
        </span>
        {/* mobile: linha inteira com inputs flexíveis (senão o input nativo estoura o card) */}
        <span className="flex w-full md:w-auto md:ml-auto items-center gap-1.5 min-w-0">
          <input type="date" value={toDateInput(start)} onChange={e => e.target.value && onStart(fromDateInputStart(e.target.value))} className={`${dateInputCls} flex-1 min-w-0 md:flex-none`} />
          <span className="text-[11px] text-ww-n400"><span className="hidden md:inline">até</span><span className="md:hidden">–</span></span>
          <input type="date" value={toDateInput(end)} onChange={e => e.target.value && onEnd(fromDateInputEnd(e.target.value))} className={`${dateInputCls} flex-1 min-w-0 md:flex-none`} />
        </span>
      </div>
    </div>
  )
}

function DiagnosticoGeral({ data }: { data: WwLeadIdealData }) {
  const alertas: { dim: string; cat: string; lift: number; delta_pp: number; historico_pct: number; atual_pct: number }[] = []
  for (const d of data.comparacoes) {
    for (const it of d.dados) {
      if (
        it.lift !== null &&
        it.delta_pp !== null &&
        it.historico_qtd >= 3 &&
        Math.abs(it.delta_pp) >= 8
      ) {
        alertas.push({
          dim: d.dimensao, cat: it.categoria, lift: it.lift, delta_pp: it.delta_pp,
          historico_pct: it.historico_pct ?? 0, atual_pct: it.atual_pct ?? 0,
        })
      }
    }
  }
  alertas.sort((a, b) => Math.abs(b.delta_pp) - Math.abs(a.delta_pp))
  const top = alertas.slice(0, 6)

  if (top.length === 0) {
    return (
      <SectionCard title="✅ Pipeline alinhado com o histórico" subtitle="Não detectamos diferenças grandes entre o perfil dos leads novos e o perfil de quem fechou.">
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 text-sm text-emerald-900">
          O marketing continua atraindo o tipo certo. As distribuições por faixa, convidados e destino estão dentro do esperado.
        </div>
      </SectionCard>
    )
  }

  return (
    <SectionCard
      title="🚨 Onde o pipeline está DIFERENTE do histórico"
      subtitle="Categorias em que o que está entrando agora se afastou de quem historicamente fechava."
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {top.map((a) => {
          const subiu = a.delta_pp > 0
          const corBg = subiu ? 'bg-indigo-50 border-indigo-200' : 'bg-amber-50 border-amber-200'
          const corTxt = subiu ? 'text-indigo-900' : 'text-amber-900'
          return (
            <div key={`${a.dim}-${a.cat}`} className={`border rounded-lg p-3 ${corBg}`}>
              <div className="text-xs uppercase tracking-wide text-slate-500">{labelDim(a.dim as Dim)}</div>
              <div className={`text-sm font-semibold ${corTxt} mt-0.5`}>{a.cat}</div>
              <div className="text-xs text-slate-700 mt-2">
                Antes era <strong>{a.historico_pct}%</strong> dos fechamentos. Agora é <strong>{a.atual_pct}%</strong> dos leads novos.
              </div>
              <div className="mt-1.5 text-xs">
                {subiu ? (
                  <span className="text-indigo-700 font-medium">▲ +{a.delta_pp.toFixed(1)} pontos — entra MAIS do que fechava</span>
                ) : (
                  <span className="text-amber-700 font-medium">▼ {a.delta_pp.toFixed(1)} pontos — entra MENOS do que fechava</span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </SectionCard>
  )
}

function HeatmapDuplo({ cells, xOrder, yOrder, xLabel, yLabel, onCellClick }: {
  cells: WwLeadIdealCruzamentoCell[]
  xOrder?: string[]
  yOrder?: string[]
  xLabel: string
  yLabel: string
  onCellClick?: (x: string, y: string) => void
}) {
  if (!cells || cells.length === 0) {
    return <EmptyState message="Sem combinações com amostra suficiente" />
  }
  const xs = xOrder ? xOrder.filter(v => cells.some(c => c.x === v)) : Array.from(new Set(cells.map(c => c.x)))
  const ys = yOrder
    ? yOrder.filter(v => cells.some(c => c.y === v))
    : Array.from(new Set(cells.map(c => c.y))).sort((a, b) => {
        const sa = cells.filter(c => c.y === a).reduce((s, c) => s + c.hist_qtd, 0)
        const sb = cells.filter(c => c.y === b).reduce((s, c) => s + c.hist_qtd, 0)
        return sb - sa
      })
  const cellMap = new Map(cells.map(c => [`${c.x}|${c.y}`, c]))

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 text-[11px] text-slate-500">
        <span>Legenda da cor:</span>
        <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-900">pipeline tem MAIS</span>
        <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700">alinhado</span>
        <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-900">pipeline tem MENOS</span>
        <span className="text-slate-400">· cada célula mostra: hist% / atual%</span>
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
                  if (!cell || (cell.hist_qtd === 0 && cell.atual_qtd === 0)) {
                    return <td key={x} className="px-3 py-2 text-center bg-slate-50 text-slate-300">—</td>
                  }
                  const hp = cell.hist_pct ?? 0
                  const ap = cell.atual_pct ?? 0
                  const delta = ap - hp
                  const bg = Math.abs(delta) < 2 ? 'bg-slate-50 text-slate-700'
                    : delta > 0 ? (delta >= 5 ? 'bg-emerald-100 text-emerald-900' : 'bg-emerald-50 text-emerald-800')
                    : (delta <= -5 ? 'bg-amber-100 text-amber-900' : 'bg-amber-50 text-amber-800')
                  return (
                    <td key={x} className={`p-0 ${bg}`} title={`Hist: ${cell.hist_qtd} (${hp}%) · Atual: ${cell.atual_qtd} (${ap}%) · Δ ${delta >= 0 ? '+' : ''}${delta.toFixed(1)}pp`}>
                      {onCellClick ? (
                        <button onClick={() => onCellClick(x, y)} className="w-full h-full px-2 py-2 text-center block cursor-pointer hover:ring-2 hover:ring-ww-gold focus:ring-2 focus:ring-ww-gold focus:outline-none">
                          <div className="text-[11px] tabular-nums">
                            <span className="text-emerald-700 font-medium">{hp}%</span>
                            <span className="text-slate-400 mx-0.5">/</span>
                            <span className="text-indigo-700 font-medium">{ap}%</span>
                          </div>
                          <div className="text-[10px] opacity-75 mt-0.5">{cell.hist_qtd}→{cell.atual_qtd}</div>
                        </button>
                      ) : (
                        <div className="px-2 py-2 text-center">
                          <div className="text-[11px] tabular-nums">
                            <span className="text-emerald-700 font-medium">{hp}%</span>
                            <span className="text-slate-400 mx-0.5">/</span>
                            <span className="text-indigo-700 font-medium">{ap}%</span>
                          </div>
                          <div className="text-[10px] opacity-75 mt-0.5">{cell.hist_qtd}→{cell.atual_qtd}</div>
                        </div>
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

function TopPerfisCard({ titulo, subtitulo, perfis, accent, onPerfilClick }: {
  titulo: string
  subtitulo: string
  perfis: WwLeadIdealPerfilTop[]
  accent: 'emerald' | 'indigo'
  onPerfilClick?: (p: WwLeadIdealPerfilTop) => void
}) {
  const borderCor = accent === 'emerald' ? 'border-emerald-200' : 'border-indigo-200'
  const bgCor = accent === 'emerald' ? 'bg-emerald-50/40' : 'bg-indigo-50/40'

  return (
    <SectionCard title={titulo} subtitle={subtitulo}>
      {perfis.length === 0 ? <EmptyState message="Sem perfis com amostra suficiente" /> : (
        <div className="space-y-2">
          {perfis.map((p, i) => {
            const Wrap = onPerfilClick ? ('button' as const) : ('div' as const)
            return (
              <Wrap
                key={`${p.faixa}-${p.destino}-${p.convidados}-${i}`}
                onClick={onPerfilClick ? () => onPerfilClick(p) : undefined}
                className={`w-full flex items-center gap-3 p-2.5 border ${borderCor} ${bgCor} rounded-lg text-left ${onPerfilClick ? 'hover:bg-white/60 cursor-pointer transition' : ''}`}
              >
                <div className="text-slate-400 font-mono text-xs w-5 text-right">{i + 1}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-slate-900">{p.faixa}</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    {p.destino} · {p.convidados} convidados
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold text-slate-900 tabular-nums">{p.qtd}</div>
                  <div className="text-[10px] text-slate-500">{p.pct ?? 0}%</div>
                </div>
              </Wrap>
            )
          })}
        </div>
      )}
    </SectionCard>
  )
}

function ComparacaoDimensao({ titulo, subtitulo, dim, ordenarPor, onCategoriaClick }: {
  titulo: string
  subtitulo: string
  dim: { dimensao: string; dados: WwLeadIdealItem[] } | undefined
  ordenarPor?: string[]
  onCategoriaClick?: ((categoria: string) => void) | undefined
}) {
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
        if (ia === -1 && ib === -1) return b.historico_qtd - a.historico_qtd
        if (ia === -1) return 1
        if (ib === -1) return -1
        return ia - ib
      })
    : [...dim.dados].sort((a, b) => b.historico_qtd - a.historico_qtd)

  const maxPct = Math.max(5, ...sorted.flatMap(d => [d.historico_pct ?? 0, d.atual_pct ?? 0]))

  return (
    <SectionCard title={titulo} subtitle={subtitulo}>
      <div className="border border-slate-200 rounded-lg overflow-hidden bg-white">
        <div className="grid grid-cols-12 px-3 py-2 bg-slate-50 border-b border-slate-200 text-[10px] uppercase font-medium tracking-wide text-slate-500">
          <div className="col-span-3 text-center">Categoria</div>
          <div className="col-span-4 text-center">% de quem FECHOU (referência)</div>
          <div className="col-span-1 text-center">Lift</div>
          <div className="col-span-4 text-center">% dos leads que ENTRAM agora</div>
        </div>
        <div className="divide-y divide-slate-100">
          {sorted.map(d => {
            const histPct = d.historico_pct ?? 0
            const atualPct = d.atual_pct ?? 0
            const histBar = (histPct / maxPct) * 100
            const atualBar = (atualPct / maxPct) * 100
            const Wrap = onCategoriaClick ? ('button' as const) : ('div' as const)
            return (
              <Wrap
                key={d.categoria}
                onClick={onCategoriaClick ? () => onCategoriaClick(d.categoria) : undefined}
                className={`w-full grid grid-cols-12 items-center px-3 py-2.5 text-xs text-left ${onCategoriaClick ? 'hover:bg-ww-cream/50 cursor-pointer' : ''}`}
                title={onCategoriaClick ? `Ver leads novos — ${d.categoria}` : undefined}
              >
                <div className="col-span-3 font-medium text-slate-900 truncate" title={d.categoria}>{d.categoria}</div>
                <div className="col-span-4">
                  <div className="flex items-center gap-2 flex-row-reverse">
                    <span className="w-12 text-right tabular-nums text-emerald-700 font-medium">{histPct}%</span>
                    <span className="w-10 text-right text-[10px] text-slate-400 tabular-nums">{d.historico_qtd}</span>
                    <div className="flex-1 h-4 bg-slate-100 rounded-sm overflow-hidden relative">
                      <div className="absolute top-0 right-0 h-full bg-emerald-400" style={{ width: `${histBar}%` }} />
                    </div>
                  </div>
                </div>
                <div className="col-span-1 flex items-center justify-center">
                  <LiftBadge lift={d.lift} size="sm" showDelta={false} />
                </div>
                <div className="col-span-4">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-4 bg-slate-100 rounded-sm overflow-hidden relative">
                      <div className="h-full bg-indigo-400" style={{ width: `${atualBar}%` }} />
                    </div>
                    <span className="w-10 text-left text-[10px] text-slate-400 tabular-nums">{d.atual_qtd}</span>
                    <span className="w-12 text-left tabular-nums text-indigo-700 font-medium">{atualPct}%</span>
                  </div>
                </div>
              </Wrap>
            )
          })}
        </div>
      </div>
    </SectionCard>
  )
}

function labelDim(d: Dim | string): string {
  switch (d) {
    case 'faixa': return 'Faixa de investimento'
    case 'destino': return 'Destino'
    case 'convidados': return 'Nº de convidados'
    case 'origem': return 'Origem'
    case 'canal_sdr': return 'Canal da 1ª reunião'
    case 'canal_closer': return 'Canal da reunião de fechamento'
    case 'tipo': return 'Tipo (DW/Elopement)'
    default: return d
  }
}
