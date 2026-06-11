import { useMemo, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { useWwSerieTemporal, type DateMode, type WwSeriePonto } from '@/hooks/analyticsWeddings/useWw2'
import { SectionCard, EmptyState, LoadingSkeleton } from './ui'
import { formatNumber } from '../lib/format'

type Gran = 'week' | 'month'
type Modo = 'quantidade' | 'conversao'

// Paleta da marca ww: neutro → champagne → rosewood; venda fica verde (semântico)
const MET = [
  { key: 'entrou', label: 'Leads', color: '#94a3b8' },
  { key: 'fez_sdr', label: 'Reuniões SDR', color: '#BD965C' },
  { key: 'fez_closer', label: 'Reuniões Closer', color: '#874B52' },
  { key: 'ganho', label: 'Vendas', color: '#10b981' },
] as const

// Conversão "de barra pra barra" — a passagem entre etapas consecutivas (em barras, não linha)
const CONV_BARRAS = [
  { key: 'taxa_sdr', label: 'Lead → Reunião SDR', color: '#BD965C' },
  { key: 'taxa_closer', label: 'Reunião SDR → Closer', color: '#874B52' },
  { key: 'taxa_ganho', label: 'Reunião Closer → Venda', color: '#10b981' },
] as const

const pct = (num: number, den: number) => (den > 0 ? Math.round((1000 * num) / den) / 10 : 0)

export type SerieMarco = 'entrou' | 'fez_sdr' | 'fez_closer' | 'ganho'

// No modo conversão, clicar na taxa abre a lista do NUMERADOR (quem fez a etapa no período)
const TAXA_PARA_MARCO: Record<string, SerieMarco> = {
  taxa_sdr: 'fez_sdr', taxa_closer: 'fez_closer', taxa_ganho: 'ganho',
}

export function SerieTemporalChart({
  title, subtitle, dateStart, dateEnd, dateMode, incluirElopement,
  origins, faixas, destinos, convidados, consultorIds, tipos, canalSdr, canalCloser, defaultModo = 'quantidade',
  onPointClick,
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
  /** Clique numa barra → drill da lista de casais daquele período/marco */
  onPointClick?: (ponto: WwSeriePonto, marco: SerieMarco, janela: { dateStart: string; dateEnd: string }) => void
}) {
  const [gran, setGran] = useState<Gran>('month')
  const [modo, setModo] = useState<Modo>(defaultModo)

  // periodo vem do banco como YYYY-MM-DD (início do bucket) — converte pra janela fechada
  const janelaDe = (periodo: string): { dateStart: string; dateEnd: string } => {
    const start = new Date(`${periodo}T00:00:00Z`)
    const end = new Date(start)
    if (gran === 'week') end.setUTCDate(end.getUTCDate() + 7)
    else end.setUTCMonth(end.getUTCMonth() + 1)
    end.setUTCSeconds(end.getUTCSeconds() - 1)
    return { dateStart: start.toISOString(), dateEnd: end.toISOString() }
  }
  const handleBar = (marco: SerieMarco) => (d: unknown) => {
    const p = (d as { payload?: WwSeriePonto })?.payload
    if (!p || !onPointClick) return
    onPointClick(p, marco, janelaDe(p.periodo))
  }

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
                <Bar key={m.key} dataKey={m.key} name={m.label} fill={m.color} radius={[3, 3, 0, 0]} maxBarSize={26}
                  onClick={onPointClick ? handleBar(m.key) : undefined}
                  cursor={onPointClick ? 'pointer' : undefined} />
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
                <Bar key={c.key} dataKey={c.key} name={c.label} fill={c.color} radius={[3, 3, 0, 0]} maxBarSize={22}
                  onClick={onPointClick ? handleBar(TAXA_PARA_MARCO[c.key]) : undefined}
                  cursor={onPointClick ? 'pointer' : undefined} />
              ))}
            </BarChart>
          )}
        </ResponsiveContainer>
      )}
    </SectionCard>
  )
}
