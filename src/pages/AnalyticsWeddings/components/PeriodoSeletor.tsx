import { useState } from 'react'
import { type Janela, periodToDates, anoJanela, labelDoPeriodo } from '../lib/dates'

function isoToInputDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function inputDateToIso(dateStr: string, isEnd: boolean): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d, isEnd ? 23 : 0, isEnd ? 59 : 0, isEnd ? 59 : 0, isEnd ? 999 : 0).toISOString()
}

// Opções iguais nos dois lados.
function opcoes(): { key: string; label: string }[] {
  const y0 = new Date().getFullYear()
  const anos: number[] = []
  for (let y = y0; y >= 2024; y--) anos.push(y)
  return [
    { key: 'tudo', label: 'Período todo' },
    { key: '12m', label: 'Últimos 12 meses' },
    { key: '90d', label: 'Últimos 90 dias' },
    { key: '30d', label: 'Últimos 30 dias' },
    ...anos.map((y) => ({ key: `ano${y}`, label: String(y) })),
    { key: 'custom', label: 'Datas específicas…' },
  ]
}
function janelaDeKey(k: string): Janela | null {
  if (k === 'tudo') return periodToDates('all')
  if (k === '30d' || k === '90d') return periodToDates(k)
  if (k === '12m') return periodToDates('12m')
  if (k.startsWith('ano')) return anoJanela(Number(k.slice(3)))
  return null // custom
}
function keyDeJanela(j: Janela): string {
  const l = labelDoPeriodo(j)
  if (l === 'Período todo') return 'tudo'
  if (l === 'Últimos 12 meses') return '12m'
  if (l === 'Últimos 90 dias') return '90d'
  if (l === 'Últimos 30 dias') return '30d'
  if (/^\d{4}$/.test(l)) return `ano${l}`
  return 'custom'
}

const selectCls = 'px-3 py-1.5 text-sm font-medium bg-white border border-slate-200 rounded-lg text-slate-800 hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500'
const dateCls = 'px-2 py-1 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500'

function PeriodoSelect({ value, onChange }: { value: Janela; onChange: (v: Janela) => void }) {
  const derivado = keyDeJanela(value)
  const [custom, setCustom] = useState(derivado === 'custom')
  const selKey = custom ? 'custom' : derivado
  return (
    <div className="inline-flex items-center gap-2 flex-wrap">
      <select value={selKey} onChange={(e) => {
        const k = e.target.value
        if (k === 'custom') { setCustom(true) } else { setCustom(false); const j = janelaDeKey(k); if (j) onChange(j) }
      }} className={selectCls}>
        {opcoes().map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
      </select>
      {selKey === 'custom' && (
        <span className="inline-flex items-center gap-1.5">
          <input type="date" value={isoToInputDate(value.dateStart)} max={isoToInputDate(value.dateEnd)}
            onChange={(e) => e.target.value && onChange({ ...value, dateStart: inputDateToIso(e.target.value, false) })} className={dateCls} />
          <span className="text-slate-400 text-xs">até</span>
          <input type="date" value={isoToInputDate(value.dateEnd)} min={isoToInputDate(value.dateStart)}
            onChange={(e) => e.target.value && onChange({ ...value, dateEnd: inputDateToIso(e.target.value, true) })} className={dateCls} />
        </span>
      )}
    </div>
  )
}

type Props = {
  periodoA: Janela
  periodoB: Janela
  onPeriodoA: (v: Janela) => void
  onPeriodoB: (v: Janela) => void
}

export function PeriodoSeletor({ periodoA, periodoB, onPeriodoA, onPeriodoB }: Props) {
  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-36 shrink-0 text-sm font-medium text-slate-700">Período principal</span>
        <PeriodoSelect value={periodoB} onChange={onPeriodoB} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-36 shrink-0 text-sm font-medium text-slate-700">Comparar com</span>
        <PeriodoSelect value={periodoA} onChange={onPeriodoA} />
      </div>
      <p className="text-sm text-slate-500">
        Você está vendo <strong className="text-slate-800">{labelDoPeriodo(periodoB)}</strong> comparado com <strong className="text-slate-800">{labelDoPeriodo(periodoA)}</strong>.
      </p>
    </div>
  )
}
