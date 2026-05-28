import { useMemo, useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  useWwFunilSlot,
  useWw2FilterOptions,
  type WwSlotData,
  type WwSlotParams,
  type WwSlotPopulacao,
  type WwSlotDateAxis,
  type WwSlotSegmentBy,
  type WwSlotMarcos,
  type WwSlotTempos,
  type WwTempoBucket,
} from '@/hooks/analyticsWeddings/useWw2'
import { SectionCard, LoadingSkeleton, ErrorBanner } from '../components/ui'
import { formatNumber } from '../lib/format'

// ── Constantes ────────────────────────────────────────────────────────────
const MARCOS: { key: keyof WwSlotMarcos; label: string; short: string }[] = [
  { key: 'entrou',         label: '1. Entrou',                 short: 'Entrou' },
  { key: 'marcou_sdr',     label: '2. Agendou SDR',            short: 'Agendou SDR' },
  { key: 'fez_sdr',        label: '3. Fez reunião SDR',        short: 'Fez SDR' },
  { key: 'marcou_closer',  label: '4. Agendou Closer',         short: 'Agendou Closer' },
  { key: 'fez_closer',     label: '5. Fez reunião Closer',     short: 'Fez Closer' },
  { key: 'ganho',          label: '6. Virou ganho',            short: 'Ganho' },
]

const CONVIDADOS_OPTIONS = ['Apenas o casal', 'Até 20', '20-50', '50-80', '80-100', '+100']
const FAIXAS_OPTIONS = ['Até R$50 mil', 'R$50-80 mil', 'R$50-100 mil', 'R$80-100 mil', 'R$100-200 mil', 'R$200-500 mil', '+R$500 mil']

type SlotKey = 'a' | 'b'

// ── Helpers ───────────────────────────────────────────────────────────────
function thisYear(): { start: string; end: string } {
  const y = new Date().getFullYear()
  return { start: `${y}-01-01`, end: `${y}-12-31` }
}

function colorByRate(taxaPrev: number | null): { bar: string; text: string } {
  if (taxaPrev == null) return { bar: 'bg-slate-300', text: 'text-slate-500' }
  if (taxaPrev >= 85) return { bar: 'bg-emerald-600', text: 'text-emerald-700' }
  if (taxaPrev >= 70) return { bar: 'bg-emerald-400', text: 'text-emerald-700' }
  if (taxaPrev >= 50) return { bar: 'bg-amber-400', text: 'text-amber-700' }
  return { bar: 'bg-rose-500', text: 'text-rose-700' }
}

function fmtPct(n: number | null, digits = 1): string {
  if (n == null || !isFinite(n)) return '—'
  return `${n.toFixed(digits)}%`
}

// ── URL state ─────────────────────────────────────────────────────────────
type SlotState = {
  populacao: WwSlotPopulacao
  dateAxis: WwSlotDateAxis
  dateStart: string  // YYYY-MM-DD
  dateEnd: string    // YYYY-MM-DD
  faixas: string[]
  convidados: string[]
  destinos: string[]
  origens: string[]
  tipos: string[]
  consultorIds: string[]
}

function defaultSlot(slot: SlotKey): SlotState {
  const y = thisYear()
  return {
    populacao: slot === 'a' ? 'ganhos' : 'em_jogo',
    dateAxis: slot === 'a' ? 'won' : 'entry',
    dateStart: y.start,
    dateEnd: y.end,
    faixas: [],
    convidados: [],
    destinos: [],
    origens: [],
    tipos: [],
    consultorIds: [],
  }
}

function parseList(v: string | null): string[] {
  return v ? v.split(',').filter(Boolean) : []
}

function readSlotFromUrl(params: URLSearchParams, slot: SlotKey): SlotState {
  const d = defaultSlot(slot)
  const p = (k: string) => params.get(`fp_${slot}_${k}`)
  return {
    populacao: (p('pop') as WwSlotPopulacao) ?? d.populacao,
    dateAxis: (p('axis') as WwSlotDateAxis) ?? d.dateAxis,
    dateStart: p('start') ?? d.dateStart,
    dateEnd: p('end') ?? d.dateEnd,
    faixas: parseList(p('faixas')),
    convidados: parseList(p('conv')),
    destinos: parseList(p('dest')),
    origens: parseList(p('origens')),
    tipos: parseList(p('tipos')),
    consultorIds: parseList(p('cons')),
  }
}

function writeSlotToParams(params: URLSearchParams, slot: SlotKey, s: SlotState) {
  const set = (k: string, v: string) => { if (v) params.set(`fp_${slot}_${k}`, v); else params.delete(`fp_${slot}_${k}`) }
  set('pop', s.populacao)
  set('axis', s.dateAxis)
  set('start', s.dateStart)
  set('end', s.dateEnd)
  set('faixas', s.faixas.join(','))
  set('conv', s.convidados.join(','))
  set('dest', s.destinos.join(','))
  set('origens', s.origens.join(','))
  set('tipos', s.tipos.join(','))
  set('cons', s.consultorIds.join(','))
}

function slotToRpcParams(s: SlotState, segmentBy: WwSlotSegmentBy): WwSlotParams {
  return {
    populacao: s.populacao,
    dateAxis: s.dateAxis,
    dateStart: `${s.dateStart}T00:00:00Z`,
    dateEnd: `${s.dateEnd}T23:59:59Z`,
    segmentBy,
    faixas: s.faixas.length ? s.faixas : undefined,
    convidados: s.convidados.length ? s.convidados : undefined,
    destinos: s.destinos.length ? s.destinos : undefined,
    origins: s.origens.length ? s.origens : undefined,
    tipos: s.tipos.length ? s.tipos : undefined,
    consultorIds: s.consultorIds.length ? s.consultorIds : undefined,
  }
}

// ── Componente principal ──────────────────────────────────────────────────
export function FunilPerfil() {
  const [searchParams, setSearchParams] = useSearchParams()
  const segmentBy = (searchParams.get('fp_segment_by') as WwSlotSegmentBy) || 'none'

  const slotA = useMemo(() => readSlotFromUrl(searchParams, 'a'), [searchParams])
  const slotB = useMemo(() => readSlotFromUrl(searchParams, 'b'), [searchParams])

  const updateSlot = (slot: SlotKey, patch: Partial<SlotState>) => {
    const next = new URLSearchParams(searchParams)
    const current = readSlotFromUrl(next, slot)
    writeSlotToParams(next, slot, { ...current, ...patch })
    setSearchParams(next, { replace: true })
  }

  const setSegmentBy = (v: WwSlotSegmentBy) => {
    const next = new URLSearchParams(searchParams)
    if (v === 'none') next.delete('fp_segment_by')
    else next.set('fp_segment_by', v)
    setSearchParams(next, { replace: true })
  }

  const swapAB = () => {
    const next = new URLSearchParams(searchParams)
    writeSlotToParams(next, 'a', slotB)
    writeSlotToParams(next, 'b', slotA)
    setSearchParams(next, { replace: true })
  }

  const duplicateAtoB = () => {
    const next = new URLSearchParams(searchParams)
    writeSlotToParams(next, 'b', slotA)
    setSearchParams(next, { replace: true })
  }

  const queryA = useWwFunilSlot(slotToRpcParams(slotA, segmentBy))
  const queryB = useWwFunilSlot(slotToRpcParams(slotB, segmentBy))

  return (
    <div className="space-y-5">
      <Header />
      <Toolbar
        segmentBy={segmentBy}
        onSegmentChange={setSegmentBy}
        onSwap={swapAB}
        onDuplicate={duplicateAtoB}
      />

      <div className="grid grid-cols-1 md:grid-cols-[1fr_80px_1fr] gap-3 items-stretch">
        <SlotPanel
          slotKey="a"
          accent="indigo"
          state={slotA}
          onChange={(p) => updateSlot('a', p)}
          query={queryA}
          segmentBy={segmentBy}
        />
        <DeltaColumn
          dataA={queryA.data ?? null}
          dataB={queryB.data ?? null}
          segmentBy={segmentBy}
        />
        <SlotPanel
          slotKey="b"
          accent="slate"
          state={slotB}
          onChange={(p) => updateSlot('b', p)}
          query={queryB}
          segmentBy={segmentBy}
        />
      </div>

      {queryA.data && queryB.data && segmentBy === 'none' && (
        <CompareTable dataA={queryA.data} dataB={queryB.data} />
      )}

      <ProjecaoBanner dataA={queryA.data ?? null} dataB={queryB.data ?? null} stateB={slotB} />

      <TemposCompare dataA={queryA.data ?? null} dataB={queryB.data ?? null} />

      <ParadosCompare dataA={queryA.data ?? null} dataB={queryB.data ?? null} stateA={slotA} stateB={slotB} />

      <TopCombosCompare dataA={queryA.data ?? null} dataB={queryB.data ?? null} stateA={slotA} stateB={slotB} />

      <Diagnostico dataA={queryA.data ?? null} dataB={queryB.data ?? null} stateA={slotA} stateB={slotB} />
    </div>
  )
}

// ── Header ────────────────────────────────────────────────────────────────
function Header() {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5">
      <h2 className="text-base font-semibold text-slate-900 tracking-tight">🎯 Funil por perfil — comparação livre</h2>
      <p className="text-sm text-slate-500 mt-1.5">
        Monte dois recortes (slots) lado a lado para comparar. Cada slot tem sua própria configuração:
        população (ganhos, em jogo, todos), período, eixo de data (entrada ou ganho) e filtros de perfil.
        Use "Quebrar por" para ver o funil dividido por bucket de uma dimensão.
      </p>
    </div>
  )
}

// ── Toolbar ───────────────────────────────────────────────────────────────
function Toolbar({
  segmentBy, onSegmentChange, onSwap, onDuplicate,
}: {
  segmentBy: WwSlotSegmentBy
  onSegmentChange: (v: WwSlotSegmentBy) => void
  onSwap: () => void
  onDuplicate: () => void
}) {
  const opts: { key: WwSlotSegmentBy; label: string }[] = [
    { key: 'none', label: 'Nenhum' },
    { key: 'convidados', label: 'Convidados' },
    { key: 'investimento', label: 'Investimento' },
    { key: 'destino', label: 'Destino' },
  ]
  return (
    <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 flex items-center gap-3 flex-wrap">
      <span className="text-xs font-medium text-slate-600 uppercase tracking-wide">Quebrar por</span>
      <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden bg-slate-50">
        {opts.map(o => (
          <button
            key={o.key}
            onClick={() => onSegmentChange(o.key)}
            className={`px-3 py-1.5 text-xs font-medium transition ${
              segmentBy === o.key ? 'bg-indigo-600 text-white' : 'text-slate-700 hover:bg-slate-100'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
      <div className="flex-1" />
      <button
        onClick={onSwap}
        className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 bg-white text-slate-700 hover:border-slate-300"
      >
        ↔ Inverter A↔B
      </button>
      <button
        onClick={onDuplicate}
        className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 bg-white text-slate-700 hover:border-slate-300"
      >
        ⎘ Duplicar A→B
      </button>
    </div>
  )
}

// ── Slot Panel ────────────────────────────────────────────────────────────
function SlotPanel({
  slotKey, accent, state, onChange, query, segmentBy,
}: {
  slotKey: SlotKey
  accent: 'indigo' | 'slate'
  state: SlotState
  onChange: (patch: Partial<SlotState>) => void
  query: ReturnType<typeof useWwFunilSlot>
  segmentBy: WwSlotSegmentBy
}) {
  const borderClass = accent === 'indigo' ? 'border-l-4 border-l-indigo-600' : 'border-l-4 border-l-slate-700'
  const labelTxt = accent === 'indigo' ? 'text-indigo-700' : 'text-slate-700'

  return (
    <div className={`bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex flex-col ${borderClass}`}>
      <div className="px-4 pt-3 pb-2 border-b border-slate-100">
        <div className={`text-[10px] font-semibold uppercase tracking-wider ${labelTxt}`}>
          Slot {slotKey.toUpperCase()}
        </div>
        <SlotConfig state={state} onChange={onChange} />
      </div>
      <div className="p-4 flex-1">
        {query.isLoading && <LoadingSkeleton rows={6} />}
        {query.error && <ErrorBanner error={query.error as Error} />}
        {query.data && !query.data.error && (
          <>
            <SlotHero data={query.data} />
            {segmentBy === 'none'
              ? <FunilBarras data={query.data} />
              : <FunilTabela data={query.data} />
            }
          </>
        )}
        {query.data?.error && <ErrorBanner error={query.data.error} />}
      </div>
    </div>
  )
}

// ── Slot Config ───────────────────────────────────────────────────────────
function SlotConfig({ state, onChange }: { state: SlotState; onChange: (patch: Partial<SlotState>) => void }) {
  const { data: filterOpts } = useWw2FilterOptions()
  const showDateAxis = state.populacao !== 'em_jogo'
  const showDates = state.populacao !== 'em_jogo'

  return (
    <div className="mt-2 space-y-2">
      {/* Linha 1: população */}
      <div className="flex items-center gap-2">
        <Segmented
          value={state.populacao}
          options={[
            { value: 'ganhos', label: '🏆 Ganhos' },
            { value: 'em_jogo', label: '🎲 Em jogo' },
            { value: 'todos', label: '📋 Todos' },
          ]}
          onChange={(v) => onChange({ populacao: v as WwSlotPopulacao })}
        />
      </div>
      {/* Linha 2: eixo + datas */}
      {showDates && (
        <div className="flex items-center gap-2 flex-wrap">
          {showDateAxis && (
            <Segmented
              value={state.dateAxis}
              options={[
                { value: 'entry', label: 'Entrada' },
                { value: 'won', label: 'Ganho' },
              ]}
              onChange={(v) => onChange({ dateAxis: v as WwSlotDateAxis })}
              size="xs"
            />
          )}
          <input
            type="date"
            value={state.dateStart}
            onChange={(e) => onChange({ dateStart: e.target.value })}
            className="px-2 py-1 text-xs border border-slate-200 rounded bg-white text-slate-700"
          />
          <span className="text-xs text-slate-400">→</span>
          <input
            type="date"
            value={state.dateEnd}
            onChange={(e) => onChange({ dateEnd: e.target.value })}
            className="px-2 py-1 text-xs border border-slate-200 rounded bg-white text-slate-700"
          />
          <YearShortcuts onChange={(s, e) => onChange({ dateStart: s, dateEnd: e })} />
        </div>
      )}
      {/* Linha 3: perfil filtros */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <MiniMulti label="Faixa" options={FAIXAS_OPTIONS} selected={state.faixas} onChange={(v) => onChange({ faixas: v })} />
        <MiniMulti label="Conv." options={CONVIDADOS_OPTIONS} selected={state.convidados} onChange={(v) => onChange({ convidados: v })} />
        <MiniMulti label="Dest." options={filterOpts?.destinos ?? []} selected={state.destinos} onChange={(v) => onChange({ destinos: v })} />
        <MiniMulti label="Origem" options={filterOpts?.origens ?? []} selected={state.origens} onChange={(v) => onChange({ origens: v })} />
        <MiniMulti label="Tipo" options={filterOpts?.tipos ?? []} selected={state.tipos} onChange={(v) => onChange({ tipos: v })} />
      </div>
    </div>
  )
}

function YearShortcuts({ onChange }: { onChange: (s: string, e: string) => void }) {
  const y = new Date().getFullYear()
  return (
    <>
      {[y, y - 1, y - 2].map(year => (
        <button
          key={year}
          onClick={() => onChange(`${year}-01-01`, `${year}-12-31`)}
          className="px-1.5 py-1 text-[10px] font-medium border border-slate-200 rounded bg-white text-slate-600 hover:border-slate-300"
        >
          {year}
        </button>
      ))}
    </>
  )
}

// ── Segmented control ─────────────────────────────────────────────────────
function Segmented<T extends string>({
  value, options, onChange, size = 'sm',
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
  size?: 'xs' | 'sm'
}) {
  const cls = size === 'xs' ? 'text-[11px] px-2 py-1' : 'text-xs px-2.5 py-1'
  return (
    <div className="inline-flex rounded border border-slate-200 overflow-hidden bg-slate-50">
      {options.map(o => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`font-medium transition ${cls} ${
            value === o.value ? 'bg-indigo-600 text-white' : 'text-slate-700 hover:bg-slate-100'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

// ── Mini multiselect ──────────────────────────────────────────────────────
function MiniMulti({
  label, options, selected, onChange,
}: {
  label: string
  options: string[]
  selected: string[]
  onChange: (next: string[]) => void
}) {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (!open) return
    const close = () => setOpen(false)
    const t = setTimeout(() => document.addEventListener('click', close, { once: true }), 0)
    return () => { clearTimeout(t); document.removeEventListener('click', close) }
  }, [open])
  const display = selected.length === 0 ? 'todos' : selected.length === 1 ? selected[0] : `${selected.length}`
  return (
    <div className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        onClick={() => setOpen(!open)}
        className={`px-2 py-1 text-[11px] font-medium rounded border transition ${
          selected.length === 0
            ? 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
            : 'bg-indigo-50 border-indigo-300 text-indigo-700'
        }`}
      >
        {label}: <span className="font-semibold">{display}</span>
      </button>
      {open && (
        <div className="absolute z-30 mt-1 left-0 bg-white border border-slate-200 rounded-lg shadow-lg max-h-60 overflow-y-auto w-52">
          <div className="p-1.5 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white">
            <span className="text-[11px] font-medium text-slate-600">{label}</span>
            {selected.length > 0 && (
              <button onClick={() => onChange([])} className="text-[11px] text-indigo-600 hover:text-indigo-700">limpar</button>
            )}
          </div>
          <div className="p-1">
            {options.length === 0
              ? <div className="px-2 py-1.5 text-[11px] text-slate-400">sem opções</div>
              : options.map(opt => {
                  const isSel = selected.includes(opt)
                  return (
                    <button
                      key={opt}
                      onClick={() => onChange(isSel ? selected.filter(o => o !== opt) : [...selected, opt])}
                      className={`w-full text-left px-2 py-1 text-[11px] rounded hover:bg-slate-50 flex items-center gap-1.5 ${
                        isSel ? 'text-indigo-700 font-medium' : 'text-slate-700'
                      }`}
                    >
                      <span className={`w-3 h-3 inline-block border rounded-sm flex items-center justify-center ${
                        isSel ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300'
                      }`}>
                        {isSel && <svg viewBox="0 0 16 16" className="w-2.5 h-2.5"><path d="M13 4L6 11L3 8" stroke="white" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                      </span>
                      <span className="truncate">{opt}</span>
                    </button>
                  )
                })}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Slot Hero (stat grande) ───────────────────────────────────────────────
function SlotHero({ data }: { data: WwSlotData }) {
  const taxa = data.total > 0 ? (data.marcos.ganho / data.total) * 100 : 0
  return (
    <div className="flex items-baseline gap-3 mb-4">
      <div className="text-4xl font-semibold text-slate-900 tabular-nums">
        {data.config.populacao === 'em_jogo' ? formatNumber(data.total) : fmtPct(taxa, 1)}
      </div>
      <div className="text-xs text-slate-500">
        {data.config.populacao === 'em_jogo'
          ? <span>cards em jogo · 0 ganhos ainda</span>
          : <span>{formatNumber(data.total)} leads · {formatNumber(data.marcos.ganho)} ganhos</span>}
      </div>
    </div>
  )
}

// ── Funil de Barras (segmentBy = 'none') ──────────────────────────────────
type LinhaMarco = {
  key: keyof WwSlotMarcos
  label: string
  short: string
  count: number
  pctTotal: number
  pctPrev: number | null
  prev: number | null
  isGargalo: boolean
}

function calcLinhas(marcos: WwSlotMarcos, total: number): LinhaMarco[] {
  const linhas: LinhaMarco[] = []
  let piorIdx = -1
  let piorDrop = 0

  for (let i = 0; i < MARCOS.length; i++) {
    const m = MARCOS[i]
    const count = marcos[m.key]
    const prev = i > 0 ? marcos[MARCOS[i - 1].key] : null
    const pctTotal = total > 0 ? (count / total) * 100 : 0
    const pctPrev = prev != null && prev > 0 ? (count / prev) * 100 : null
    linhas.push({ key: m.key, label: m.label, short: m.short, count, pctTotal, pctPrev, prev, isGargalo: false })
    // Identifica gargalo: maior queda relativa
    if (i > 0 && prev != null && prev > 0) {
      const drop = 1 - (count / prev)
      if (drop > piorDrop) { piorDrop = drop; piorIdx = i }
    }
  }
  // Só destaca se gargalo é severo (queda > 15%)
  if (piorIdx >= 0 && piorDrop > 0.15) linhas[piorIdx].isGargalo = true
  return linhas
}

function FunilBarras({ data }: { data: WwSlotData }) {
  const linhas = useMemo(() => calcLinhas(data.marcos, data.total), [data])
  return (
    <div className="space-y-1.5">
      {linhas.map((l, i) => {
        const cor = colorByRate(l.pctPrev)
        const bgRow = l.isGargalo ? 'bg-amber-50 border-amber-200' : 'bg-white border-transparent'
        return (
          <div key={l.key}>
            <div className={`rounded-md border px-2 py-1.5 ${bgRow}`}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-medium text-slate-700">{l.short}</span>
                  {l.isGargalo && <span className="text-amber-700 text-xs">⚠</span>}
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-sm font-semibold text-slate-900 tabular-nums">{formatNumber(l.count)}</span>
                  <span className="text-[10px] text-slate-500 tabular-nums w-10 text-right">{fmtPct(l.pctTotal, 0)}</span>
                </div>
              </div>
              <div className="relative h-2 bg-slate-100 rounded-sm overflow-hidden">
                <div className={`absolute top-0 left-0 h-full ${cor.bar} transition-all`} style={{ width: `${Math.max(l.pctTotal, 0.5)}%` }} />
              </div>
              {i > 0 && l.pctPrev != null && (
                <div className="mt-0.5 flex items-center justify-between text-[10px]">
                  <span className={`${cor.text} font-medium`}>{fmtPct(l.pctPrev, 0)} da etapa anterior</span>
                  {l.prev != null && l.prev > l.count && (
                    <span className="text-slate-500">▼ -{formatNumber(l.prev - l.count)}</span>
                  )}
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Funil Tabela (segmentBy ≠ 'none') ─────────────────────────────────────
function FunilTabela({ data }: { data: WwSlotData }) {
  if (!data.segments || data.segments.length === 0) {
    return <div className="text-xs text-slate-400 py-6 text-center">Sem segmentos com dados.</div>
  }
  const segs = data.segments
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[11px]">
        <thead>
          <tr className="text-[10px] uppercase tracking-wide text-slate-500 border-b border-slate-200">
            <th className="text-left py-1.5 pr-2 font-medium">Bucket</th>
            {MARCOS.map(m => (
              <th key={m.key} className="text-right py-1.5 px-1 font-medium">{m.short}</th>
            ))}
            <th className="text-right py-1.5 pl-2 font-medium">Final</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {segs.map(s => {
            const linhas = calcLinhas(s.marcos, s.total)
            const taxaFinal = s.total > 0 ? (s.marcos.ganho / s.total) * 100 : 0
            return (
              <tr key={s.bucket} className="text-slate-700">
                <td className="py-1.5 pr-2 font-medium text-slate-900 truncate max-w-[100px]" title={s.bucket}>{s.bucket}</td>
                {linhas.map((l, i) => {
                  // Cell coloration by % from previous
                  let bgIntensity = ''
                  if (i > 0 && l.pctPrev != null) {
                    const t = l.pctPrev
                    if (t >= 85) bgIntensity = 'bg-emerald-100 text-emerald-900'
                    else if (t >= 70) bgIntensity = 'bg-emerald-50 text-emerald-800'
                    else if (t >= 50) bgIntensity = 'bg-amber-50 text-amber-800'
                    else if (t > 0) bgIntensity = 'bg-rose-50 text-rose-800'
                  }
                  return (
                    <td key={l.key} className={`text-right py-1.5 px-1 tabular-nums ${bgIntensity}`}>
                      <div>{formatNumber(l.count)}</div>
                      {i > 0 && l.pctPrev != null && (
                        <div className="text-[9px] opacity-60">{fmtPct(l.pctPrev, 0)}</div>
                      )}
                    </td>
                  )
                })}
                <td className="text-right py-1.5 pl-2 font-semibold tabular-nums text-slate-900">
                  {data.config.populacao === 'em_jogo' ? '—' : fmtPct(taxaFinal, 1)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── Coluna central de deltas ──────────────────────────────────────────────
function DeltaColumn({
  dataA, dataB, segmentBy,
}: {
  dataA: WwSlotData | null
  dataB: WwSlotData | null
  segmentBy: WwSlotSegmentBy
}) {
  // Só mostra deltas quando segmentBy = 'none' (caso contrário a comparação é uma tabela própria)
  if (segmentBy !== 'none' || !dataA || !dataB) {
    return <div className="hidden md:block" />
  }
  const linhasA = calcLinhas(dataA.marcos, dataA.total)
  const linhasB = calcLinhas(dataB.marcos, dataB.total)
  // Maior |delta pp| de % cumulativo
  let maxAbsIdx = -1
  let maxAbs = 0
  for (let i = 0; i < MARCOS.length; i++) {
    const d = Math.abs(linhasA[i].pctTotal - linhasB[i].pctTotal)
    if (d > maxAbs) { maxAbs = d; maxAbsIdx = i }
  }

  return (
    <div className="hidden md:flex flex-col items-center pt-[112px]">
      {/* pt-[112px] ≈ altura do header + hero do slot, alinhamento aproximado */}
      <div className="text-[10px] uppercase tracking-wide text-slate-400 font-medium mb-1">Δ</div>
      <div className="space-y-1.5 w-full">
        {MARCOS.map((m, i) => {
          const dPct = linhasA[i].pctTotal - linhasB[i].pctTotal  // A - B em pp
          const abs = Math.abs(dPct)
          let cls = 'text-slate-300'
          let arrow = '◯'
          let sizeCls = 'text-[10px]'
          if (abs >= 3) {
            cls = dPct > 0 ? 'text-emerald-700 bg-emerald-50 border-emerald-200' : 'text-rose-700 bg-rose-50 border-rose-200'
            arrow = dPct > 0 ? '↑' : '↓'
            if (i === maxAbsIdx) sizeCls = 'text-xs font-bold'
          }
          const isHighlight = abs >= 3
          return (
            <div key={m.key} className="h-[58px] flex items-center justify-center">
              <span className={`inline-flex items-center gap-0.5 ${sizeCls} ${cls} ${isHighlight ? 'border rounded px-1.5 py-0.5' : ''}`}>
                <span>{arrow}</span>
                {abs >= 3 && <span className="tabular-nums">{abs.toFixed(1)}pp</span>}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Tabela comparativa (segmentBy=none) ───────────────────────────────────
function CompareTable({ dataA, dataB }: { dataA: WwSlotData; dataB: WwSlotData }) {
  const linhasA = calcLinhas(dataA.marcos, dataA.total)
  const linhasB = calcLinhas(dataB.marcos, dataB.total)
  return (
    <SectionCard title="📊 Comparação marco a marco" subtitle="Lado A: % da etapa anterior · da entrada · contagem. Mesma coisa em B. Δ é a diferença de % cumulativo (A − B) em pontos percentuais.">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-[10px] uppercase tracking-wide text-slate-500 border-b border-slate-200">
              <th className="text-left py-2 pr-2 font-medium">Marco</th>
              <th className="text-right py-2 px-2 font-medium" colSpan={3}>Slot A</th>
              <th className="text-center py-2 px-2 font-medium">Δ pp</th>
              <th className="text-right py-2 px-2 font-medium" colSpan={3}>Slot B</th>
            </tr>
            <tr className="text-[9px] text-slate-400 border-b border-slate-100">
              <th></th>
              <th className="text-right px-1">N</th>
              <th className="text-right px-1">% etapa</th>
              <th className="text-right px-1">% entrada</th>
              <th></th>
              <th className="text-right px-1">N</th>
              <th className="text-right px-1">% etapa</th>
              <th className="text-right px-1">% entrada</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {MARCOS.map((m, i) => {
              const a = linhasA[i]
              const b = linhasB[i]
              const dPct = a.pctTotal - b.pctTotal
              const abs = Math.abs(dPct)
              const deltaCls = abs < 3
                ? 'text-slate-400'
                : dPct > 0 ? 'text-emerald-700 bg-emerald-50' : 'text-rose-700 bg-rose-50'
              const corA = colorByRate(a.pctPrev)
              const corB = colorByRate(b.pctPrev)
              return (
                <tr key={m.key} className="text-slate-700">
                  <td className="py-2 pr-2 font-medium text-slate-900">{m.label}</td>
                  <td className="text-right px-1 tabular-nums">{formatNumber(a.count)}</td>
                  <td className={`text-right px-1 tabular-nums ${corA.text}`}>{a.pctPrev != null ? fmtPct(a.pctPrev, 0) : '—'}</td>
                  <td className="text-right px-1 tabular-nums">{fmtPct(a.pctTotal, 1)}</td>
                  <td className={`text-center px-2 tabular-nums font-medium ${deltaCls} rounded`}>
                    {abs < 3 ? '◯' : `${dPct > 0 ? '+' : ''}${dPct.toFixed(1)}`}
                  </td>
                  <td className="text-right px-1 tabular-nums">{formatNumber(b.count)}</td>
                  <td className={`text-right px-1 tabular-nums ${corB.text}`}>{b.pctPrev != null ? fmtPct(b.pctPrev, 0) : '—'}</td>
                  <td className="text-right px-1 tabular-nums">{fmtPct(b.pctTotal, 1)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </SectionCard>
  )
}

// ── Projeção (banner) ─────────────────────────────────────────────────────
function ProjecaoBanner({
  dataA, dataB, stateB,
}: {
  dataA: WwSlotData | null
  dataB: WwSlotData | null
  stateB: SlotState
}) {
  // Só faz sentido se A é ganhos e B é em_jogo
  if (!dataA || !dataB) return null
  if (dataA.config.populacao !== 'ganhos' || stateB.populacao !== 'em_jogo') return null
  const taxaA = dataA.total > 0 ? (dataA.marcos.ganho / dataA.total) : 0
  if (taxaA <= 0) return null
  const projecao = Math.round(dataB.total * taxaA)
  return (
    <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 text-sm">
      <div className="flex items-center gap-3">
        <span className="text-2xl">📈</span>
        <div className="flex-1">
          <div className="font-medium text-slate-900">
            Projeção: <strong>{formatNumber(projecao)} ganhos</strong> aplicando a taxa do Slot A ({fmtPct(taxaA * 100, 1)}) sobre os {formatNumber(dataB.total)} leads em jogo do Slot B.
          </div>
          <div className="text-xs text-slate-600 mt-0.5">
            Cálculo: {formatNumber(dataB.total)} × {fmtPct(taxaA * 100, 1)} = {formatNumber(projecao)}.
            Não é previsão certa — é o que aconteceria se o pipeline atual converter na mesma taxa do recorte de ganhos.
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Tempos entre marcos ──────────────────────────────────────────────────
const TRANSICOES: { key: keyof WwSlotTempos; label: string }[] = [
  { key: 'entrou_marcou_sdr', label: 'Entrou → Agendou SDR' },
  { key: 'marcou_sdr_marcou_closer', label: 'Agendou SDR → Agendou Closer' },
  { key: 'marcou_closer_ganho', label: 'Agendou Closer → Ganho' },
]

function TemposCompare({ dataA, dataB }: { dataA: WwSlotData | null; dataB: WwSlotData | null }) {
  if (!dataA && !dataB) return null
  return (
    <SectionCard
      title="⏱ Tempo entre marcos"
      subtitle="Em buckets de dias. Quanto mais à esquerda (verde), mais rápido. Quanto mais à direita (vermelho), mais lento. Compare A vs B em cada transição para ver se o funil está esticando."
    >
      <div className="space-y-4">
        {TRANSICOES.map(t => (
          <div key={t.key}>
            <div className="text-xs font-medium text-slate-700 mb-1.5">{t.label}</div>
            <div className="grid grid-cols-2 gap-3">
              <TempoBar label="Slot A" bucket={dataA?.tempos[t.key]} accent="indigo" />
              <TempoBar label="Slot B" bucket={dataB?.tempos[t.key]} accent="slate" />
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
  )
}

function TempoBar({ label, bucket, accent }: { label: string; bucket: WwTempoBucket | undefined; accent: 'indigo' | 'slate' }) {
  if (!bucket || bucket.amostra === 0) {
    return (
      <div>
        <div className="text-[10px] text-slate-400 uppercase tracking-wide">{label}</div>
        <div className="h-6 bg-slate-50 border border-slate-100 rounded text-[10px] text-slate-400 flex items-center justify-center mt-1">sem amostra</div>
      </div>
    )
  }
  const segs = [
    { key: 'lt3', label: '<3d', count: bucket.lt3, color: 'bg-emerald-600' },
    { key: 'd3_7', label: '3-7d', count: bucket.d3_7, color: 'bg-emerald-400' },
    { key: 'd7_15', label: '7-15d', count: bucket.d7_15, color: 'bg-amber-400' },
    { key: 'd15_30', label: '15-30d', count: bucket.d15_30, color: 'bg-rose-400' },
    { key: 'ge30', label: '30+d', count: bucket.ge30, color: 'bg-rose-600' },
  ]
  const labelTxt = accent === 'indigo' ? 'text-indigo-600' : 'text-slate-600'
  return (
    <div>
      <div className={`text-[10px] uppercase tracking-wide ${labelTxt} font-medium`}>
        {label} · {bucket.amostra} amostras
      </div>
      <div className="mt-1 flex h-6 overflow-hidden rounded border border-slate-200">
        {segs.map(s => {
          const pct = bucket.amostra > 0 ? (s.count / bucket.amostra) * 100 : 0
          if (pct === 0) return null
          return (
            <div
              key={s.key}
              className={`${s.color} h-full flex items-center justify-center text-[9px] text-white font-medium`}
              style={{ width: `${pct}%` }}
              title={`${s.label}: ${s.count} (${pct.toFixed(0)}%)`}
            >
              {pct >= 12 ? `${pct.toFixed(0)}%` : ''}
            </div>
          )
        })}
      </div>
      <div className="mt-0.5 grid grid-cols-5 gap-0.5 text-[9px] text-slate-500">
        {segs.map(s => <div key={s.key} className="text-center">{s.label}</div>)}
      </div>
    </div>
  )
}

// ── Parados ──────────────────────────────────────────────────────────────
function ParadosCompare({
  dataA, dataB, stateA, stateB,
}: {
  dataA: WwSlotData | null
  dataB: WwSlotData | null
  stateA: SlotState
  stateB: SlotState
}) {
  const showA = stateA.populacao === 'em_jogo' && dataA?.parados
  const showB = stateB.populacao === 'em_jogo' && dataB?.parados
  if (!showA && !showB) return null
  return (
    <SectionCard
      title="🐢 Cards parados (apenas para slots Em jogo)"
      subtitle="Cards que não tiveram movimento há mais de 14 dias, por marco onde estão. Use pra ver onde a equipe precisa cutucar."
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {showA ? <ParadosList data={dataA} accent="indigo" /> : <div className="text-xs text-slate-400 py-6 text-center">Slot A não é "Em jogo"</div>}
        {showB ? <ParadosList data={dataB} accent="slate" /> : <div className="text-xs text-slate-400 py-6 text-center">Slot B não é "Em jogo"</div>}
      </div>
    </SectionCard>
  )
}

function ParadosList({ data, accent }: { data: WwSlotData; accent: 'indigo' | 'slate' }) {
  const parados = data.parados ?? {}
  const order: { key: string; label: string }[] = [
    { key: 'entrou', label: 'Entrou (ainda não agendou SDR)' },
    { key: 'marcou_sdr', label: 'Agendou SDR (ainda não fez)' },
    { key: 'fez_sdr', label: 'Fez SDR (ainda não agendou Closer)' },
    { key: 'marcou_closer', label: 'Agendou Closer (ainda não fez)' },
    { key: 'fez_closer', label: 'Fez Closer (ainda não ganhou)' },
  ]
  const labelTxt = accent === 'indigo' ? 'text-indigo-700' : 'text-slate-700'
  return (
    <div>
      <div className={`text-[10px] uppercase tracking-wide ${labelTxt} font-medium mb-2`}>Slot {accent === 'indigo' ? 'A' : 'B'}</div>
      <div className="space-y-1.5">
        {order.map(o => {
          const p = parados[o.key] as { total: number; parados: number } | undefined
          if (!p || p.total === 0) return null
          const pct = p.total > 0 ? (p.parados / p.total) * 100 : 0
          return (
            <div key={o.key} className="flex items-center justify-between text-xs px-2.5 py-1.5 bg-slate-50 rounded">
              <span className="text-slate-700">{o.label}</span>
              <span className="tabular-nums">
                <strong className={p.parados > 0 ? 'text-amber-700' : 'text-slate-700'}>
                  {formatNumber(p.parados)}
                </strong>
                <span className="text-slate-400"> / {formatNumber(p.total)} ({fmtPct(pct, 0)})</span>
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Top combos ───────────────────────────────────────────────────────────
function TopCombosCompare({
  dataA, dataB, stateA, stateB,
}: {
  dataA: WwSlotData | null
  dataB: WwSlotData | null
  stateA: SlotState
  stateB: SlotState
}) {
  const showA = stateA.populacao === 'ganhos' && dataA?.top_combos && dataA.top_combos.length > 0
  const showB = stateB.populacao === 'ganhos' && dataB?.top_combos && dataB.top_combos.length > 0
  if (!showA && !showB) return null
  return (
    <SectionCard
      title="🏆 Top perfis que ganharam"
      subtitle="Combinações Faixa × Convidados × Destino que mais entregaram ganhos no slot. Pareto direto pra priorizar foco comercial."
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {showA ? <TopCombosList combos={dataA.top_combos ?? []} accent="indigo" /> : <div className="text-xs text-slate-400 py-6 text-center">Slot A não é "Ganhos"</div>}
        {showB ? <TopCombosList combos={dataB.top_combos ?? []} accent="slate" /> : <div className="text-xs text-slate-400 py-6 text-center">Slot B não é "Ganhos"</div>}
      </div>
    </SectionCard>
  )
}

function TopCombosList({ combos, accent }: { combos: { faixa: string; convidados: string; destino: string; qtd: number; pct: number | null }[]; accent: 'indigo' | 'slate' }) {
  const labelTxt = accent === 'indigo' ? 'text-indigo-700' : 'text-slate-700'
  return (
    <div>
      <div className={`text-[10px] uppercase tracking-wide ${labelTxt} font-medium mb-2`}>Slot {accent === 'indigo' ? 'A' : 'B'}</div>
      <div className="space-y-1">
        {combos.map((c, i) => (
          <div key={i} className="flex items-center gap-2 text-xs px-2 py-1.5 bg-slate-50 rounded">
            <span className="text-[10px] text-slate-400 w-4">{i + 1}.</span>
            <span className="flex-1 text-slate-700 truncate">
              {c.faixa} · {c.convidados} · {c.destino}
            </span>
            <span className="tabular-nums">
              <strong className="text-slate-900">{formatNumber(c.qtd)}</strong>
              {c.pct != null && <span className="text-slate-400 ml-1">({fmtPct(c.pct, 0)})</span>}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Diagnóstico estruturado ──────────────────────────────────────────────
function Diagnostico({
  dataA, dataB, stateA, stateB,
}: {
  dataA: WwSlotData | null
  dataB: WwSlotData | null
  stateA: SlotState
  stateB: SlotState
}) {
  if (!dataA || !dataB) return null
  if (dataA.total === 0 && dataB.total === 0) return null

  // 1. Perfil dominante: bucket modal de cada dimensão por slot
  const dominantA = stateA.populacao === 'ganhos' && dataA.top_combos?.[0]
  const dominantB = stateB.populacao === 'ganhos' && dataB.top_combos?.[0]

  // 2. Marco com maior queda de B vs A (em pp cumulativo)
  let piorMarco: { idx: number; delta: number } | null = null
  const linhasA = calcLinhas(dataA.marcos, dataA.total)
  const linhasB = calcLinhas(dataB.marcos, dataB.total)
  for (let i = 1; i < MARCOS.length; i++) {
    const delta = linhasA[i].pctTotal - linhasB[i].pctTotal
    if (delta > 3 && (!piorMarco || delta > piorMarco.delta)) {
      piorMarco = { idx: i, delta }
    }
  }

  return (
    <SectionCard title="💡 Diagnóstico" subtitle="Leitura factual dos dois recortes, sem juízo automático.">
      <ul className="space-y-1.5 text-sm">
        {dominantA && (
          <li className="flex items-start gap-2">
            <span className="text-indigo-600 mt-0.5">●</span>
            <span className="text-slate-700">
              <strong>Perfil que mais ganhou em A:</strong>{' '}
              {dominantA.faixa} · {dominantA.convidados} · {dominantA.destino}
              <span className="text-slate-400"> ({formatNumber(dominantA.qtd)} ganhos · {fmtPct(dominantA.pct, 0)} dos ganhos de A)</span>
            </span>
          </li>
        )}
        {dominantB && (
          <li className="flex items-start gap-2">
            <span className="text-slate-700 mt-0.5">●</span>
            <span className="text-slate-700">
              <strong>Perfil que mais ganhou em B:</strong>{' '}
              {dominantB.faixa} · {dominantB.convidados} · {dominantB.destino}
              <span className="text-slate-400"> ({formatNumber(dominantB.qtd)} ganhos · {fmtPct(dominantB.pct, 0)} dos ganhos de B)</span>
            </span>
          </li>
        )}
        {piorMarco && (
          <li className="flex items-start gap-2">
            <span className="text-amber-600 mt-0.5">⚠</span>
            <span className="text-slate-700">
              <strong>Marco com maior queda de B vs A:</strong>{' '}
              {MARCOS[piorMarco.idx].label} — Slot B chega com {fmtPct(linhasB[piorMarco.idx].pctTotal, 1)} vs {fmtPct(linhasA[piorMarco.idx].pctTotal, 1)} em A ({piorMarco.delta.toFixed(1)}pp a menos).
            </span>
          </li>
        )}
        {!dominantA && !dominantB && !piorMarco && (
          <li className="text-xs text-slate-500">Nada de relevante para destacar entre os dois recortes neste momento.</li>
        )}
      </ul>
    </SectionCard>
  )
}
