import { useMemo, useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  useWwFunilSlot,
  useWw2FilterOptions,
  type WwSlotData,
  type WwSlotParams,
  type WwSlotSegmentBy,
  type WwSlotMarcos,
  type WwSlotTempos,
  type WwTempoBucket,
  type WwSlotPerfilGanhos,
  type WwSlotPerfilBucket,
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
const MES_LABELS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

type SlotKey = 'a' | 'b'

// ── Helpers ───────────────────────────────────────────────────────────────
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

function lastNMonths(n: number): string[] {
  // Retorna ['2026-05', '2026-04', ...] (mais recente primeiro)
  const out: string[] = []
  const d = new Date()
  for (let i = 0; i < n; i++) {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    out.push(`${y}-${m}`)
    d.setMonth(d.getMonth() - 1)
  }
  return out
}

function fmtMes(yyyymm: string): string {
  const [y, m] = yyyymm.split('-')
  return `${MES_LABELS[parseInt(m, 10) - 1]}/${y.slice(2)}`
}

// ── URL state ─────────────────────────────────────────────────────────────
type SlotState = {
  modo: 'cohort' | 'em_jogo'  // cohort = leads entrando nos meses; em_jogo = pipeline atual
  meses: string[]              // YYYY-MM (vazio = todos)
  faixas: string[]
  convidados: string[]
  destinos: string[]
  origens: string[]
  tipos: string[]
  consultorIds: string[]
}

function defaultSlot(slot: SlotKey): SlotState {
  const months24 = lastNMonths(24)
  if (slot === 'a') {
    // A default: ano passado inteiro
    const now = new Date()
    const lastYear = now.getFullYear() - 1
    const meses = months24.filter(m => m.startsWith(`${lastYear}-`))
    return {
      modo: 'cohort',
      meses,
      faixas: [], convidados: [], destinos: [],
      origens: [], tipos: [], consultorIds: [],
    }
  }
  // B default: em jogo agora
  return {
    modo: 'em_jogo',
    meses: [],
    faixas: [], convidados: [], destinos: [],
    origens: [], tipos: [], consultorIds: [],
  }
}

function parseList(v: string | null): string[] {
  return v ? v.split(',').filter(Boolean) : []
}

function readSlotFromUrl(params: URLSearchParams, slot: SlotKey): SlotState {
  const d = defaultSlot(slot)
  const p = (k: string) => params.get(`fp_${slot}_${k}`)
  const modo = p('modo') as 'cohort' | 'em_jogo' | null
  // Quando params estão vazios, retorna default; quando params existem, usa eles
  const hasAny = ['modo', 'meses', 'faixas', 'conv', 'dest', 'origens', 'tipos', 'cons'].some(k => params.has(`fp_${slot}_${k}`))
  if (!hasAny) return d
  return {
    modo: modo ?? d.modo,
    meses: parseList(p('meses')),
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
  set('modo', s.modo)
  set('meses', s.meses.join(','))
  set('faixas', s.faixas.join(','))
  set('conv', s.convidados.join(','))
  set('dest', s.destinos.join(','))
  set('origens', s.origens.join(','))
  set('tipos', s.tipos.join(','))
  set('cons', s.consultorIds.join(','))
}

function slotToRpcParams(s: SlotState, segmentBy: WwSlotSegmentBy): WwSlotParams {
  const now = new Date()
  return {
    populacao: s.modo === 'em_jogo' ? 'em_jogo' : 'todos',
    dateAxis: 'entry',
    // dateStart/dateEnd só usados quando meses está vazio (cohort full history)
    dateStart: '2020-01-01T00:00:00Z',
    dateEnd: now.toISOString(),
    segmentBy,
    faixas: s.faixas.length ? s.faixas : undefined,
    convidados: s.convidados.length ? s.convidados : undefined,
    destinos: s.destinos.length ? s.destinos : undefined,
    origins: s.origens.length ? s.origens : undefined,
    tipos: s.tipos.length ? s.tipos : undefined,
    consultorIds: s.consultorIds.length ? s.consultorIds : undefined,
    meses: s.modo === 'cohort' && s.meses.length ? s.meses : undefined,
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

  // Aplicar perfil dos ganhos do outro slot como filtro deste
  const applyProfileFrom = (target: SlotKey, perfil: WwSlotPerfilGanhos | null) => {
    if (!perfil) return
    const patch: Partial<SlotState> = {}
    if (perfil.faixa?.[0]?.bucket && perfil.faixa[0].bucket !== '— sem informação') {
      patch.faixas = [perfil.faixa[0].bucket]
    }
    if (perfil.convidados?.[0]?.bucket && perfil.convidados[0].bucket !== '— sem informação') {
      patch.convidados = [perfil.convidados[0].bucket]
    }
    if (perfil.destino?.[0]?.bucket && perfil.destino[0].bucket !== '— sem informação') {
      patch.destinos = [perfil.destino[0].bucket]
    }
    updateSlot(target, patch)
  }

  return (
    <div className="space-y-5">
      <Header />
      <Toolbar
        segmentBy={segmentBy}
        onSegmentChange={setSegmentBy}
        onSwap={swapAB}
        onDuplicate={duplicateAtoB}
      />

      <div className="grid grid-cols-1 md:grid-cols-[1fr_64px_1fr] gap-3 items-stretch">
        <SlotPanel
          slotKey="a"
          accent="indigo"
          state={slotA}
          onChange={(p) => updateSlot('a', p)}
          query={queryA}
          segmentBy={segmentBy}
          onApplyToOther={() => applyProfileFrom('b', queryA.data?.perfil_ganhos ?? null)}
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
          onApplyToOther={() => applyProfileFrom('a', queryB.data?.perfil_ganhos ?? null)}
        />
      </div>

      {queryA.data && queryB.data && segmentBy === 'none' && (
        <CompareTable dataA={queryA.data} dataB={queryB.data} />
      )}

      <ProjecaoBanner dataA={queryA.data ?? null} dataB={queryB.data ?? null} stateB={slotB} />

      <TemposCompare dataA={queryA.data ?? null} dataB={queryB.data ?? null} />

      <ParadosCompare dataA={queryA.data ?? null} dataB={queryB.data ?? null} stateA={slotA} stateB={slotB} />

      <Diagnostico dataA={queryA.data ?? null} dataB={queryB.data ?? null} />
    </div>
  )
}

// ── Header ────────────────────────────────────────────────────────────────
function Header() {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5">
      <h2 className="text-base font-semibold text-slate-900 tracking-tight">🎯 Funil por perfil — comparação livre</h2>
      <p className="text-sm text-slate-500 mt-1.5">
        Cada slot é uma coorte de leads. Selecione os <strong>meses de entrada</strong> (ou "Em jogo agora")
        e veja o <strong>funil completo</strong> dessa coorte — incluindo a conversão real até ganho. Dentro de cada slot,
        a seção <strong>"Perfil dos ganhos do recorte"</strong> mostra que tipo de lead virou ganho (faixa, convidados, destino),
        com botão "Aplicar perfil ao outro slot" pra comparar o mesmo perfil em dois recortes diferentes.
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
  slotKey, accent, state, onChange, query, segmentBy, onApplyToOther,
}: {
  slotKey: SlotKey
  accent: 'indigo' | 'slate'
  state: SlotState
  onChange: (patch: Partial<SlotState>) => void
  query: ReturnType<typeof useWwFunilSlot>
  segmentBy: WwSlotSegmentBy
  onApplyToOther: () => void
}) {
  const borderClass = accent === 'indigo' ? 'border-l-4 border-l-indigo-600' : 'border-l-4 border-l-slate-700'
  const labelTxt = accent === 'indigo' ? 'text-indigo-700' : 'text-slate-700'

  return (
    <div className={`bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex flex-col ${borderClass}`}>
      <div className="px-4 pt-3 pb-3 border-b border-slate-100">
        <div className={`text-[10px] font-semibold uppercase tracking-wider ${labelTxt}`}>
          Slot {slotKey.toUpperCase()}
        </div>
        <SlotConfig state={state} onChange={onChange} />
      </div>
      <div className="p-4 flex-1 space-y-4">
        {query.isLoading && <LoadingSkeleton rows={6} />}
        {query.error && <ErrorBanner error={query.error as Error} />}
        {query.data && !query.data.error && (
          <>
            <SlotHero data={query.data} />
            {segmentBy === 'none'
              ? <FunilBarras data={query.data} />
              : <FunilTabela data={query.data} />
            }
            <PerfilGanhosBlock data={query.data} onApplyToOther={onApplyToOther} otherSlotLetter={slotKey === 'a' ? 'B' : 'A'} />
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

  return (
    <div className="mt-2 space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="inline-flex rounded border border-slate-200 overflow-hidden bg-slate-50">
          <button
            onClick={() => onChange({ modo: 'cohort' })}
            className={`text-xs px-2.5 py-1 font-medium transition ${
              state.modo === 'cohort' ? 'bg-indigo-600 text-white' : 'text-slate-700 hover:bg-slate-100'
            }`}
          >
            📅 Coorte por entrada
          </button>
          <button
            onClick={() => onChange({ modo: 'em_jogo' })}
            className={`text-xs px-2.5 py-1 font-medium transition ${
              state.modo === 'em_jogo' ? 'bg-indigo-600 text-white' : 'text-slate-700 hover:bg-slate-100'
            }`}
          >
            🎲 Em jogo agora
          </button>
        </div>
      </div>

      {state.modo === 'cohort' && (
        <SeletorMeses selected={state.meses} onChange={(v) => onChange({ meses: v })} />
      )}

      <div className="flex items-center gap-1.5 flex-wrap pt-1">
        <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wide mr-1">Filtros:</span>
        <MiniMulti label="Faixa" options={FAIXAS_OPTIONS} selected={state.faixas} onChange={(v) => onChange({ faixas: v })} />
        <MiniMulti label="Conv." options={CONVIDADOS_OPTIONS} selected={state.convidados} onChange={(v) => onChange({ convidados: v })} />
        <MiniMulti label="Dest." options={filterOpts?.destinos ?? []} selected={state.destinos} onChange={(v) => onChange({ destinos: v })} />
        <MiniMulti label="Origem" options={filterOpts?.origens ?? []} selected={state.origens} onChange={(v) => onChange({ origens: v })} />
        <MiniMulti label="Tipo" options={filterOpts?.tipos ?? []} selected={state.tipos} onChange={(v) => onChange({ tipos: v })} />
        {(state.faixas.length + state.convidados.length + state.destinos.length + state.origens.length + state.tipos.length) > 0 && (
          <button
            onClick={() => onChange({ faixas: [], convidados: [], destinos: [], origens: [], tipos: [] })}
            className="text-[10px] text-slate-500 hover:text-rose-600 underline ml-1"
          >
            limpar
          </button>
        )}
      </div>
    </div>
  )
}

// ── Seletor de Meses ──────────────────────────────────────────────────────
function SeletorMeses({ selected, onChange }: { selected: string[]; onChange: (v: string[]) => void }) {
  const months = useMemo(() => lastNMonths(24), [])
  const toggle = (m: string) => {
    if (selected.includes(m)) onChange(selected.filter(x => x !== m))
    else onChange([...selected, m])
  }
  const allYear = (y: number) => {
    const target = months.filter(m => m.startsWith(`${y}-`))
    const allIn = target.every(m => selected.includes(m))
    if (allIn) onChange(selected.filter(m => !target.includes(m)))
    else onChange(Array.from(new Set([...selected, ...target])))
  }
  const years = Array.from(new Set(months.map(m => parseInt(m.slice(0, 4), 10))))
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wide">Meses de entrada:</span>
        {years.map(y => {
          const target = months.filter(m => m.startsWith(`${y}-`))
          const allIn = target.length > 0 && target.every(m => selected.includes(m))
          return (
            <button
              key={y}
              onClick={() => allYear(y)}
              className={`text-[10px] px-1.5 py-0.5 rounded border transition ${
                allIn ? 'bg-indigo-50 border-indigo-300 text-indigo-700' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
              }`}
            >
              {y}
            </button>
          )
        })}
        {selected.length > 0 && (
          <button onClick={() => onChange([])} className="text-[10px] text-slate-500 hover:text-rose-600 underline ml-1">
            limpar ({selected.length})
          </button>
        )}
        {selected.length === 0 && (
          <span className="text-[10px] text-slate-400">nenhum = todos os meses</span>
        )}
      </div>
      <div className="flex flex-wrap gap-1">
        {months.map(m => {
          const isSel = selected.includes(m)
          return (
            <button
              key={m}
              onClick={() => toggle(m)}
              className={`text-[10px] font-medium px-1.5 py-0.5 rounded border transition tabular-nums ${
                isSel
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
              }`}
            >
              {fmtMes(m)}
            </button>
          )
        })}
      </div>
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

// ── Slot Hero ────────────────────────────────────────────────────────────
function SlotHero({ data }: { data: WwSlotData }) {
  const taxa = data.total > 0 ? (data.marcos.ganho / data.total) * 100 : 0
  return (
    <div>
      <div className="flex items-baseline gap-3">
        <div className="text-4xl font-semibold text-slate-900 tabular-nums">
          {fmtPct(taxa, 1)}
        </div>
        <div className="text-xs text-slate-500">
          {formatNumber(data.total)} leads · {formatNumber(data.marcos.ganho)} ganhos
        </div>
      </div>
      <div className="text-[10px] text-slate-400 uppercase tracking-wide font-medium mt-0.5">
        {data.config.populacao === 'em_jogo' ? 'Pipeline atual (em jogo)' : 'Conversão da coorte'}
      </div>
    </div>
  )
}

// ── Funil de Barras ──────────────────────────────────────────────────────
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
    if (i > 0 && prev != null && prev > 0) {
      const drop = 1 - (count / prev)
      if (drop > piorDrop) { piorDrop = drop; piorIdx = i }
    }
  }
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

// ── Funil Tabela ─────────────────────────────────────────────────────────
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
                  {fmtPct(taxaFinal, 1)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── Perfil dos Ganhos do Recorte ─────────────────────────────────────────
function PerfilGanhosBlock({
  data, onApplyToOther, otherSlotLetter,
}: {
  data: WwSlotData
  onApplyToOther: () => void
  otherSlotLetter: string
}) {
  const p = data.perfil_ganhos
  if (!p || p.total_ganhos === 0) {
    return (
      <div className="border-t border-slate-100 pt-3 mt-3">
        <div className="text-[10px] uppercase tracking-wide text-slate-500 font-medium mb-1">Perfil dos ganhos do recorte</div>
        <div className="text-xs text-slate-400">Sem ganhos neste recorte ainda.</div>
      </div>
    )
  }
  const top1 = (arr: WwSlotPerfilBucket[] | null) => arr && arr.length > 0 ? arr[0] : null
  const topFaixa = top1(p.faixa)
  const topConv  = top1(p.convidados)
  const topDest  = top1(p.destino)

  return (
    <div className="border-t border-slate-100 pt-3 mt-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-wide text-slate-500 font-medium">
          Perfil dos {p.total_ganhos} ganhos do recorte
        </div>
        <button
          onClick={onApplyToOther}
          className="text-[10px] px-2 py-0.5 rounded border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
          title="Aplica os top buckets (faixa, convidados, destino) como filtro no outro slot"
        >
          → Aplicar ao Slot {otherSlotLetter}
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2 text-[11px]">
        <PerfilDim label="💰 Faixa" items={p.faixa} highlight={topFaixa?.bucket} />
        <PerfilDim label="👥 Convidados" items={p.convidados} highlight={topConv?.bucket} />
        <PerfilDim label="🏝 Destino" items={p.destino} highlight={topDest?.bucket} />
      </div>
    </div>
  )
}

function PerfilDim({ label, items, highlight }: { label: string; items: WwSlotPerfilBucket[] | null; highlight?: string }) {
  if (!items || items.length === 0) {
    return (
      <div>
        <div className="text-[10px] text-slate-500 font-medium mb-1">{label}</div>
        <div className="text-[10px] text-slate-400">sem dados</div>
      </div>
    )
  }
  return (
    <div>
      <div className="text-[10px] text-slate-500 font-medium mb-1">{label}</div>
      <div className="space-y-0.5">
        {items.slice(0, 3).map(b => {
          const isTop = b.bucket === highlight
          return (
            <div
              key={b.bucket}
              className={`flex items-center justify-between px-1.5 py-0.5 rounded ${
                isTop ? 'bg-indigo-50 text-indigo-900' : 'text-slate-700'
              }`}
            >
              <span className="truncate" title={b.bucket}>{b.bucket}</span>
              <span className="tabular-nums font-medium">{fmtPct(b.pct, 0)}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Coluna central de deltas ─────────────────────────────────────────────
function DeltaColumn({
  dataA, dataB, segmentBy,
}: {
  dataA: WwSlotData | null
  dataB: WwSlotData | null
  segmentBy: WwSlotSegmentBy
}) {
  if (segmentBy !== 'none' || !dataA || !dataB) {
    return <div className="hidden md:block" />
  }
  const linhasA = calcLinhas(dataA.marcos, dataA.total)
  const linhasB = calcLinhas(dataB.marcos, dataB.total)
  let maxAbsIdx = -1
  let maxAbs = 0
  for (let i = 0; i < MARCOS.length; i++) {
    const d = Math.abs(linhasA[i].pctTotal - linhasB[i].pctTotal)
    if (d > maxAbs) { maxAbs = d; maxAbsIdx = i }
  }
  return (
    <div className="hidden md:flex flex-col items-center pt-[135px]">
      <div className="text-[10px] uppercase tracking-wide text-slate-400 font-medium mb-1">Δ pp</div>
      <div className="space-y-1.5 w-full">
        {MARCOS.map((m, i) => {
          const dPct = linhasA[i].pctTotal - linhasB[i].pctTotal
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
              <span className={`inline-flex items-center gap-0.5 ${sizeCls} ${cls} ${isHighlight ? 'border rounded px-1 py-0.5' : ''}`}>
                <span>{arrow}</span>
                {abs >= 3 && <span className="tabular-nums">{abs.toFixed(0)}</span>}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Tabela comparativa ───────────────────────────────────────────────────
function CompareTable({ dataA, dataB }: { dataA: WwSlotData; dataB: WwSlotData }) {
  const linhasA = calcLinhas(dataA.marcos, dataA.total)
  const linhasB = calcLinhas(dataB.marcos, dataB.total)
  return (
    <SectionCard title="📊 Comparação marco a marco" subtitle="N · % da etapa anterior · % da entrada. Δ é diferença de % cumulativo (A − B) em pontos percentuais.">
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

// ── Projeção ─────────────────────────────────────────────────────────────
function ProjecaoBanner({
  dataA, dataB, stateB,
}: {
  dataA: WwSlotData | null
  dataB: WwSlotData | null
  stateB: SlotState
}) {
  if (!dataA || !dataB) return null
  if (stateB.modo !== 'em_jogo') return null
  if (dataA.total === 0 || dataA.marcos.ganho === 0) return null
  const taxaA = dataA.marcos.ganho / dataA.total
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
            Não é previsão certa — é o que aconteceria se o pipeline atual converter na mesma taxa do recorte de referência.
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Tempos ──────────────────────────────────────────────────────────────
const TRANSICOES: { key: keyof WwSlotTempos; label: string }[] = [
  { key: 'entrou_marcou_sdr', label: 'Entrou → Agendou SDR' },
  { key: 'marcou_sdr_marcou_closer', label: 'Agendou SDR → Agendou Closer' },
  { key: 'marcou_closer_ganho', label: 'Agendou Closer → Ganho' },
]

function TemposCompare({ dataA, dataB }: { dataA: WwSlotData | null; dataB: WwSlotData | null }) {
  if (!dataA && !dataB) return null
  const anyHasData = TRANSICOES.some(t => dataA?.tempos[t.key]?.amostra || dataB?.tempos[t.key]?.amostra)
  if (!anyHasData) return null
  return (
    <SectionCard
      title="⏱ Tempo entre marcos"
      subtitle="Buckets de dias. Verde = rápido. Vermelho = lento. Compare se o funil de A vs B está esticando."
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
  const showA = stateA.modo === 'em_jogo' && dataA?.parados
  const showB = stateB.modo === 'em_jogo' && dataB?.parados
  if (!showA && !showB) return null
  return (
    <SectionCard
      title="🐢 Cards parados (apenas para slots Em jogo)"
      subtitle="Cards sem movimento há +14 dias, por marco onde estão. Cutucar."
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {showA ? <ParadosList data={dataA} accent="indigo" letter="A" /> : <div className="text-xs text-slate-400 py-6 text-center">Slot A não é "Em jogo"</div>}
        {showB ? <ParadosList data={dataB} accent="slate" letter="B" /> : <div className="text-xs text-slate-400 py-6 text-center">Slot B não é "Em jogo"</div>}
      </div>
    </SectionCard>
  )
}

function ParadosList({ data, accent, letter }: { data: WwSlotData; accent: 'indigo' | 'slate'; letter: string }) {
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
      <div className={`text-[10px] uppercase tracking-wide ${labelTxt} font-medium mb-2`}>Slot {letter}</div>
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

// ── Diagnóstico ─────────────────────────────────────────────────────────
function Diagnostico({ dataA, dataB }: { dataA: WwSlotData | null; dataB: WwSlotData | null }) {
  if (!dataA || !dataB) return null
  if (dataA.total === 0 && dataB.total === 0) return null

  const perfilA = dataA.perfil_ganhos
  const perfilB = dataB.perfil_ganhos

  let piorMarco: { idx: number; delta: number } | null = null
  const linhasA = calcLinhas(dataA.marcos, dataA.total)
  const linhasB = calcLinhas(dataB.marcos, dataB.total)
  for (let i = 1; i < MARCOS.length; i++) {
    const delta = linhasA[i].pctTotal - linhasB[i].pctTotal
    if (delta > 3 && (!piorMarco || delta > piorMarco.delta)) {
      piorMarco = { idx: i, delta }
    }
  }

  const describePerfil = (p: WwSlotPerfilGanhos | null) => {
    if (!p || p.total_ganhos === 0) return 'sem ganhos no recorte'
    const f = p.faixa?.[0]?.bucket ?? '—'
    const c = p.convidados?.[0]?.bucket ?? '—'
    const d = p.destino?.[0]?.bucket ?? '—'
    return `${f} · ${c} · ${d}`
  }

  return (
    <SectionCard title="💡 Diagnóstico" subtitle="Leitura factual dos dois recortes. Mostra o perfil dominante dos ganhos de cada lado e onde o funil mais diverge.">
      <ul className="space-y-1.5 text-sm">
        <li className="flex items-start gap-2">
          <span className="text-indigo-600 mt-0.5">●</span>
          <span className="text-slate-700">
            <strong>Perfil dominante dos ganhos em A:</strong> {describePerfil(perfilA)}
            {perfilA && perfilA.total_ganhos > 0 && (
              <span className="text-slate-400"> ({perfilA.total_ganhos} ganhos)</span>
            )}
          </span>
        </li>
        <li className="flex items-start gap-2">
          <span className="text-slate-700 mt-0.5">●</span>
          <span className="text-slate-700">
            <strong>Perfil dominante dos ganhos em B:</strong> {describePerfil(perfilB)}
            {perfilB && perfilB.total_ganhos > 0 && (
              <span className="text-slate-400"> ({perfilB.total_ganhos} ganhos)</span>
            )}
          </span>
        </li>
        {piorMarco && (
          <li className="flex items-start gap-2">
            <span className="text-amber-600 mt-0.5">⚠</span>
            <span className="text-slate-700">
              <strong>Marco com maior queda de B vs A:</strong>{' '}
              {MARCOS[piorMarco.idx].label} — B chega com {fmtPct(linhasB[piorMarco.idx].pctTotal, 1)} vs {fmtPct(linhasA[piorMarco.idx].pctTotal, 1)} em A ({piorMarco.delta.toFixed(1)}pp a menos).
            </span>
          </li>
        )}
      </ul>
    </SectionCard>
  )
}
