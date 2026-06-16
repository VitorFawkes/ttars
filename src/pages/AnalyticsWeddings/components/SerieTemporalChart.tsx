import { useMemo, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, LabelList,
} from 'recharts'
import { useWwSerieTemporal, type DateMode, type WwSeriePonto, type StatusLead } from '@/hooks/analyticsWeddings/useWw2'
import { SectionCard, EmptyState, LoadingSkeleton } from './ui'
import { formatNumber } from '../lib/format'

type Gran = 'week' | 'month'
type Modo = 'quantidade' | 'conversao'

// Paleta da marca ww — funil completo em pares (marcada = tom claro, feita = tom cheio);
// neutro → champagne → rosewood; venda fica verde (semântico)
const MET = [
  { key: 'entrou', label: 'Leads', color: '#94a3b8' },
  { key: 'marcou_sdr', label: 'Marcadas SDR', color: '#DCC49A' },
  { key: 'fez_sdr', label: 'Feitas SDR', color: '#BD965C' },
  { key: 'marcou_closer', label: 'Marcadas Closer', color: '#B2858C' },
  { key: 'fez_closer', label: 'Feitas Closer', color: '#874B52' },
  { key: 'ganho', label: 'Vendas', color: '#10b981' },
] as const

// Conversão "de barra pra barra" — a passagem entre etapas consecutivas do funil completo
const CONV_BARRAS = [
  { key: 'taxa_marcou_sdr', label: 'Lead → Marcada SDR', color: '#DCC49A' },
  { key: 'taxa_fez_sdr', label: 'Marcada → Feita SDR', color: '#BD965C' },
  { key: 'taxa_marcou_closer', label: 'Feita SDR → Marcada Closer', color: '#B2858C' },
  { key: 'taxa_fez_closer', label: 'Marcada → Feita Closer', color: '#874B52' },
  { key: 'taxa_ganho', label: 'Feita Closer → Venda', color: '#10b981' },
] as const

const pct = (num: number, den: number) => (den > 0 ? Math.round((1000 * num) / den) / 10 : 0)

// O tooltip do Recharts ordena por nome do dataKey (alfabético) — "fez_closer" vinha antes de
// "fez_sdr". Força a ordem do funil em ambos os modos.
const TOOLTIP_ORDER = [
  'entrou', 'marcou_sdr', 'fez_sdr', 'marcou_closer', 'fez_closer', 'ganho',
  'taxa_marcou_sdr', 'taxa_fez_sdr', 'taxa_marcou_closer', 'taxa_fez_closer', 'taxa_ganho',
]
const tooltipSorter = (item: unknown) =>
  TOOLTIP_ORDER.indexOf(String((item as { dataKey?: string | number })?.dataKey ?? ''))

// Número em cima da barra — desenha sempre que a barra tem largura mínima pro texto caber
// e o valor é > 0 (some no 0 pra não poluir). Com o recorte do filtro são poucas barras,
// então cabem; o tooltip cobre o resto quando ficam apertadas.
const labelSeLarga = (fmt: (n: number) => string) => (props: unknown) => {
  const { x, y, width, value } = (props ?? {}) as { x?: number | string; y?: number | string; width?: number | string; value?: number | string }
  const w = Number(width ?? 0)
  const n = Number(value ?? 0)
  if (w < 8 || !(n > 0)) return <g />
  return (
    <text x={Number(x) + w / 2} y={Number(y) - 4} textAnchor="middle" fontSize={9} fontWeight={600} fill="#475569">
      {fmt(n)}
    </text>
  )
}
const labelValor = labelSeLarga(formatNumber)
const labelPct = labelSeLarga((n) => `${n}%`)

// Legenda na ORDEM DO FUNIL — o recharts monta a legenda em ordem alfabética do dataKey
// (e ignora payload custom nesta versão), então desenhamos a nossa.
function LegendaFunil({ itens }: { itens: ReadonlyArray<{ readonly key: string; readonly label: string; readonly color: string }> }) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 pt-2">
      {itens.map(i => (
        <span key={i.key} className="inline-flex items-center gap-1 text-[11px] text-slate-600">
          <span className="w-2.5 h-2.5 rounded-[3px]" style={{ background: i.color }} />
          {i.label}
        </span>
      ))}
    </div>
  )
}

export type SerieMarco = 'entrou' | 'marcou_sdr' | 'fez_sdr' | 'marcou_closer' | 'fez_closer' | 'ganho'

// No modo conversão, clicar na taxa abre a lista do NUMERADOR (quem passou a etapa no período)
const TAXA_PARA_MARCO: Record<string, SerieMarco> = {
  taxa_marcou_sdr: 'marcou_sdr', taxa_fez_sdr: 'fez_sdr',
  taxa_marcou_closer: 'marcou_closer', taxa_fez_closer: 'fez_closer', taxa_ganho: 'ganho',
}

export function SerieTemporalChart({
  title, subtitle, dateStart, dateEnd, dateMode, incluirElopement,
  origins, faixas, destinos, convidados, consultorIds, tipos, canalSdr, canalCloser, statusLead, defaultModo = 'quantidade',
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
  statusLead?: StatusLead | ''
  defaultModo?: Modo
  /** Clique numa barra → drill da lista de casais daquele período/marco */
  onPointClick?: (ponto: WwSeriePonto, marco: SerieMarco, janela: { dateStart: string; dateEnd: string }) => void
}) {
  // Período curto (≤ ~90 dias) abre por SEMANA pra não virar 1 barra só; longo abre por MÊS.
  // O usuário ainda troca livre no botão.
  const spanDias = (new Date(dateEnd).getTime() - new Date(dateStart).getTime()) / 86_400_000
  const [gran, setGran] = useState<Gran>(spanDias <= 92 ? 'week' : 'month')
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
    origins, faixas, destinos, convidados, consultorIds, tipos, canalSdr, canalCloser, statusLead,
  })

  const rows = useMemo(() => {
    const s = data?.series ?? []
    if (modo === 'quantidade') return s
    return s.map((p: WwSeriePonto) => ({
      ...p,
      taxa_marcou_sdr: pct(p.marcou_sdr ?? 0, p.entrou),
      taxa_fez_sdr: pct(p.fez_sdr, p.marcou_sdr ?? 0),
      taxa_marcou_closer: pct(p.marcou_closer ?? 0, p.fez_sdr),
      taxa_fez_closer: pct(p.fez_closer, p.marcou_closer ?? 0),
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
            <BarChart data={rows} margin={{ top: 16, right: 12, left: 0, bottom: 4 }}>
              <XAxis dataKey="label" stroke="#64748b" fontSize={11} tickLine={false} />
              <YAxis stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip
                contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12 }}
                formatter={(v: number, n: string) => [formatNumber(v), n]}
                itemSorter={tooltipSorter}
              />
              <Legend content={<LegendaFunil itens={MET} />} />
              {MET.map((m) => (
                <Bar key={m.key} dataKey={m.key} name={m.label} fill={m.color} radius={[3, 3, 0, 0]} maxBarSize={22}
                  onClick={onPointClick ? handleBar(m.key) : undefined}
                  cursor={onPointClick ? 'pointer' : undefined}>
                  <LabelList dataKey={m.key} content={labelValor} />
                </Bar>
              ))}
            </BarChart>
          ) : (
            <BarChart data={rows} margin={{ top: 16, right: 12, left: 0, bottom: 4 }}>
              <XAxis dataKey="label" stroke="#64748b" fontSize={11} tickLine={false} />
              <YAxis stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} unit="%" />
              <Tooltip
                contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12 }}
                formatter={(v: number, n: string) => [`${v}%`, n]}
                itemSorter={tooltipSorter}
              />
              <Legend content={<LegendaFunil itens={CONV_BARRAS} />} />
              {CONV_BARRAS.map((c) => (
                <Bar key={c.key} dataKey={c.key} name={c.label} fill={c.color} radius={[3, 3, 0, 0]} maxBarSize={22}
                  onClick={onPointClick ? handleBar(TAXA_PARA_MARCO[c.key]) : undefined}
                  cursor={onPointClick ? 'pointer' : undefined}>
                  <LabelList dataKey={c.key} content={labelPct} />
                </Bar>
              ))}
            </BarChart>
          )}
        </ResponsiveContainer>
      )}
    </SectionCard>
  )
}
