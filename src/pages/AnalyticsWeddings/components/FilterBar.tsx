import { useSearchParams } from 'react-router-dom'
import { useMemo, useState, useEffect } from 'react'
import { useWw2FilterOptions } from '@/hooks/analyticsWeddings/useWw2'
import { type PeriodOption, PERIOD_LABELS, periodToDates } from '../lib/dates'

export type AppliedFilters = {
  dateStart: string
  dateEnd: string
  dateMode: 'cohort' | 'throughput'
  origins: string[]
  faixas: string[]
  destinos: string[]
  tipos: string[]
  consultorIds: string[]
  period: PeriodOption
}

function parseList(v: string | null): string[] {
  return v ? v.split(',').filter(Boolean) : []
}

export function useFilterParams(): AppliedFilters {
  const [params] = useSearchParams()
  const period = (params.get('period') as PeriodOption) || '30d'
  const dateMode = (params.get('dateMode') as 'cohort' | 'throughput') || 'cohort'
  const { dateStart, dateEnd } = useMemo(() => periodToDates(period), [period])
  return {
    period, dateMode, dateStart, dateEnd,
    origins: parseList(params.get('origins')),
    faixas: parseList(params.get('faixas')),
    destinos: parseList(params.get('destinos')),
    tipos: parseList(params.get('tipos')),
    consultorIds: parseList(params.get('consultorIds')),
  }
}

function useDropdown() {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (!open) return
    const close = () => setOpen(false)
    const t = setTimeout(() => document.addEventListener('click', close, { once: true }), 0)
    return () => { clearTimeout(t); document.removeEventListener('click', close) }
  }, [open])
  return { open, setOpen }
}

type ConsultorOption = { id: string; nome: string }

function MultiPill({ label, options, selected, onChange }: { label: string; options: string[]; selected: string[]; onChange: (n: string[]) => void }) {
  const { open, setOpen } = useDropdown()
  const display = selected.length === 0 ? 'todos' : `${selected.length}`
  return (
    <div className="relative" onClick={(e) => e.stopPropagation()}>
      <button onClick={() => setOpen(!open)}
        className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition ${
          selected.length === 0
            ? 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
            : 'bg-indigo-50 border-indigo-300 text-indigo-700'
        }`}>
        {label}: <span className="font-semibold">{display}</span>
      </button>
      {open && (
        <div className="absolute z-50 mt-1 left-0 bg-white border border-slate-200 rounded-lg shadow-lg max-h-72 overflow-y-auto w-72">
          <div className="p-2 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white">
            <span className="text-xs font-medium text-slate-600">{label}</span>
            {selected.length > 0 && <button onClick={() => onChange([])} className="text-xs text-indigo-600 hover:text-indigo-700">limpar</button>}
          </div>
          <div className="p-1">
            {options.length === 0
              ? <div className="px-3 py-2 text-xs text-slate-500">Nenhuma opção</div>
              : options.map(opt => {
                  const isSel = selected.includes(opt)
                  return (
                    <button key={opt} onClick={() => onChange(isSel ? selected.filter(o => o !== opt) : [...selected, opt])}
                      className={`w-full text-left px-3 py-1.5 text-xs rounded hover:bg-slate-50 flex items-center gap-2 ${isSel ? 'text-indigo-700 font-medium' : 'text-slate-700'}`}>
                      <span className={`w-3.5 h-3.5 inline-block border rounded flex items-center justify-center ${isSel ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300'}`}>
                        {isSel && <svg viewBox="0 0 16 16" className="w-3 h-3"><path d="M13 4L6 11L3 8" stroke="white" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>}
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

function ConsultorPill({ options, selected, onChange }: { options: ConsultorOption[]; selected: string[]; onChange: (n: string[]) => void }) {
  const { open, setOpen } = useDropdown()
  const display = selected.length === 0 ? 'todos' : `${selected.length}`
  return (
    <div className="relative" onClick={(e) => e.stopPropagation()}>
      <button onClick={() => setOpen(!open)}
        className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition ${selected.length > 0 ? 'bg-indigo-50 border-indigo-300 text-indigo-700' : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'}`}>
        👤 Consultor: <span className="font-semibold">{display}</span>
      </button>
      {open && (
        <div className="absolute z-50 mt-1 left-0 bg-white border border-slate-200 rounded-lg shadow-lg max-h-72 overflow-y-auto w-72">
          <div className="p-2 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white">
            <span className="text-xs font-medium text-slate-600">Consultor</span>
            {selected.length > 0 && <button onClick={() => onChange([])} className="text-xs text-indigo-600">limpar</button>}
          </div>
          <div className="p-1">
            {options.length === 0
              ? <div className="px-3 py-2 text-xs text-slate-500">Nenhum consultor</div>
              : options.map(o => {
                  const isSel = selected.includes(o.id)
                  return (
                    <button key={o.id} onClick={() => onChange(isSel ? selected.filter(x => x !== o.id) : [...selected, o.id])}
                      className={`w-full text-left px-3 py-1.5 text-xs rounded hover:bg-slate-50 flex items-center gap-2 ${isSel ? 'text-indigo-700 font-medium' : 'text-slate-700'}`}>
                      <span className={`w-3.5 h-3.5 inline-block border rounded flex items-center justify-center ${isSel ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300'}`}>
                        {isSel && <svg viewBox="0 0 16 16" className="w-3 h-3"><path d="M13 4L6 11L3 8" stroke="white" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                      </span>
                      <span className="truncate">{o.nome}</span>
                    </button>
                  )
                })}
          </div>
        </div>
      )}
    </div>
  )
}

export function FilterBar() {
  const [params, setParams] = useSearchParams()
  const current = useFilterParams()
  const { data: options } = useWw2FilterOptions()

  const setParam = (key: string, value: string | string[] | null) => {
    const next = new URLSearchParams(params)
    if (value == null || (Array.isArray(value) && value.length === 0) || value === '') {
      next.delete(key)
    } else {
      next.set(key, Array.isArray(value) ? value.join(',') : value)
    }
    setParams(next, { replace: true })
  }

  const hasActiveFilters =
    current.origins.length + current.faixas.length + current.destinos.length + current.tipos.length + current.consultorIds.length > 0

  const clearAll = () => {
    const next = new URLSearchParams()
    next.set('period', current.period)
    next.set('dateMode', current.dateMode)
    setParams(next, { replace: true })
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-3 flex flex-wrap items-center gap-2 sticky top-0 z-30">
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-slate-500 font-medium px-1">📅</span>
        <select
          value={current.period}
          onChange={(e) => setParam('period', e.target.value)}
          className="px-2.5 py-1.5 text-xs font-medium bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          {Object.entries(PERIOD_LABELS).filter(([k]) => k !== 'custom').map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-slate-500 font-medium px-1">📊</span>
        <select
          value={current.dateMode}
          onChange={(e) => setParam('dateMode', e.target.value)}
          className="px-2.5 py-1.5 text-xs font-medium bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
          title="Cohort: leads que ENTRARAM no período (onde estão hoje). Throughput: o que ACONTECEU no período (avanços, fechamentos)."
        >
          <option value="cohort">Data de criação (cohort)</option>
          <option value="throughput">Data de evento (atividade)</option>
        </select>
      </div>

      <div className="w-px h-6 bg-slate-200 mx-1" />

      <MultiPill label="🎯 Origem" options={options?.origens ?? []} selected={current.origins} onChange={(v) => setParam('origins', v)} />
      <MultiPill label="💰 Faixa" options={options?.faixas ?? []} selected={current.faixas} onChange={(v) => setParam('faixas', v)} />
      <MultiPill label="🏝️ Destino" options={options?.destinos ?? []} selected={current.destinos} onChange={(v) => setParam('destinos', v)} />
      <MultiPill label="👰 Tipo" options={options?.tipos ?? []} selected={current.tipos} onChange={(v) => setParam('tipos', v)} />
      <ConsultorPill options={options?.consultores ?? []} selected={current.consultorIds} onChange={(v) => setParam('consultorIds', v)} />

      {hasActiveFilters && (
        <button
          onClick={clearAll}
          className="ml-auto px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
        >
          ✕ Limpar
        </button>
      )}
    </div>
  )
}
