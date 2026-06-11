import { useMemo, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { useWwSerieTemporal, type DateMode, type WwSeriePonto } from '@/hooks/analyticsWeddings/useWw2'
import { SectionCard, EmptyState, LoadingSkeleton } from './ui'
import { formatNumber } from '../lib/format'

type Gran = 'week' | 'month'
type Modo = 'quantidade' | 'conversao'

const MET = [
  { key: 'entrou', label: 'Leads', color: '#94a3b8' },
  { key: 'fez_sdr', label: 'Reuniões SDR', color: '#6366f1' },
  { key: 'fez_closer', label: 'Reuniões Closer', color: '#8b5cf6' },
  { key: 'ganho', label: 'Vendas', color: '#10b981' },
] as const

// Conversão "de barra pra barra" — a passagem entre etapas consecutivas (em barras, não linha)
const CONV_BARRAS = [
  { key: 'taxa_sdr', label: 'Lead → Reunião SDR', color: '#6366f1' },
  { key: 'taxa_closer', label: 'Reunião SDR → Closer', color: '#8b5cf6' },
  { key: 'taxa_ganho', label: 'Reunião Closer → Venda', color: '#10b981' },
] as const

const pct = (num: number, den: number) => (den > 0 ? Math.round((1000 * num) / den) / 10 : 0)

export function SerieTemporalChart({
  title, subtitle, dateStart, dateEnd, dateMode, incluirElopement,
  origins, faixas, destinos, convidados, consultorIds, tipos, canalSdr, canalCloser, defaultModo = 'quantidade',
}: {
  title: string
  subtitle?: string
  dateStart: string
  dateEnd: string
  dateMode: DateMode
  incluirElopement?: boolean
  origins?: string[]
  faixas?: string[]
  destinos?: string[]
  convidados?: string[]
  consultorIds?: string[]
  tipos?: string[]
  canalSdr?: string[]
  canalCloser?: string[]
  defaultModo?: Modo
}) {
  const [gran, setGran] = useState<Gran>('month')
  const [modo, setModo] = useState<Modo>(defaultModo)

  const { data, isLoading } = useWwSerieTemporal({
    dateStart, dateEnd, granularidade: gran, dateMode, incluirElopement,
    origins, faixas, destinos, convidados, consultorIds, tipos, canalSdr, canalCloser,
  })

  const rows = useMemo(() => {
    const s = data?.series ?? []
    if (modo === 'quantidade') return s
    return s.map((p: WwSeriePonto) => ({
      ...p,
      taxa_sdr: pct(p.fez_sdr, p.entrou),
      taxa_closer: pct(p.fez_closer, p.fez_sdr),
      taxa_ganho: pct(p.ganho, p.fez_closer),
      taxa_total: pct(p.ganho, p.entrou),
    }))
  }, [data, modo])

  const seg = (active: boolean) =>
    `px-2.5 py-1 rounded-md text-xs font-medium transition-transform active:scale-95 ${active ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`

  const controls = (
    <div className="flex items-center gap-2">
      <div className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-50 p-0.5">
        <button onClick={() => setGran('month')} className={seg(gran === 'month')}>Mês</button>
        <button onClick={() => setGran('week')} className={seg(gran === 'week')}>Semana</button>
      </div>
      <div className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-50 p-0.5">
        <button onClick={() => setModo('quantidade')} className={seg(modo === 'quantidade')}>Quantidade</button>
        <button onClick={() => setModo('conversao')} className={seg(modo === 'conversao')}>Conversão</button>
      </div>
    </div>
  )

  return (
    <SectionCard title={title} subtitle={subtitle} action={controls}>
      {isLoading ? (
        <LoadingSkeleton rows={5} />
      ) : rows.length === 0 ? (
        <EmptyState message="Sem dados no período" />
      ) : (
        <ResponsiveContainer width="100%" height={300}>
          {modo === 'quantidade' ? (
            <BarChart data={rows} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="label" stroke="#64748b" fontSize={11} tickLine={false} />
              <YAxis stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip
                contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12 }}
                formatter={(v: number, n: string) => [formatNumber(v), n]}
              />
              <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
              {MET.map((m) => (
                <Bar key={m.key} dataKey={m.key} name={m.label} fill={m.color} radius={[3, 3, 0, 0]} maxBarSize={26} />
              ))}
            </BarChart>
          ) : (
            <BarChart data={rows} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="label" stroke="#64748b" fontSize={11} tickLine={false} />
              <YAxis stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} unit="%" />
              <Tooltip
                contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12 }}
                formatter={(v: number, n: string) => [`${v}%`, n]}
              />
              <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
              {CONV_BARRAS.map((c) => (
                <Bar key={c.key} dataKey={c.key} name={c.label} fill={c.color} radius={[3, 3, 0, 0]} maxBarSize={22} />
              ))}
            </BarChart>
          )}
        </ResponsiveContainer>
      )}
    </SectionCard>
  )
}
