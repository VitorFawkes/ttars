import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  LabelList,
  Cell,
} from 'recharts'

export interface HBarDatum {
  /** chave estável (id) */
  key: string
  /** rótulo no eixo Y */
  label: string
  /** valor da barra */
  value: number
  /** cor opcional da barra (default indigo) */
  color?: string
  /** carga extra repassada no onClick (ex: id pra drill) */
  meta?: unknown
}

interface Props {
  data: HBarDatum[]
  /** formata o valor (eixo + label da barra + tooltip) */
  format?: (v: number) => string
  /** altura por item (px) — default 34 */
  rowHeight?: number
  /** largura reservada pros rótulos do eixo Y */
  labelWidth?: number
  /** trunca rótulos longos */
  maxLabel?: number
  /** cor padrão das barras (sobrescrita por HBarDatum.color quando presente) */
  color?: string
  onBarClick?: (d: HBarDatum) => void
}

const INDIGO = '#6366f1'

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s
}

/**
 * Gráfico de barras horizontais — estilo consistente com PlannerForecastChart
 * (grid #f1f5f9, eixos slate, barras indigo, label à direita). Ordena pela ordem
 * recebida (já vem ordenado pelo chamador). Para leitura de gestor: comparar
 * categorias (origem, consultor, time) de relance.
 */
export default function HBarChart({
  data,
  format = (v) => String(v),
  rowHeight = 34,
  labelWidth = 150,
  maxLabel = 22,
  color = INDIGO,
  onBarClick,
}: Props) {
  const height = Math.max(160, data.length * rowHeight + 28)
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 64, top: 4, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 11, fill: '#64748b' }} tickFormatter={(v: number) => format(v)} />
        <YAxis
          type="category"
          dataKey="label"
          width={labelWidth}
          tick={{ fontSize: 11, fill: '#334155' }}
          tickFormatter={(s: string) => truncate(s, maxLabel)}
        />
        <Tooltip
          formatter={(v: number) => format(v)}
          labelFormatter={(l: string) => l}
          contentStyle={{ fontSize: 12, borderRadius: 8 }}
          cursor={{ fill: '#f8fafc' }}
        />
        <Bar
          dataKey="value"
          radius={[0, 4, 4, 0]}
          cursor={onBarClick ? 'pointer' : 'default'}
          onClick={(d: { payload?: HBarDatum }) => { if (onBarClick && d?.payload) onBarClick(d.payload) }}
          isAnimationActive={false}
        >
          {data.map((d) => <Cell key={d.key} fill={d.color || color} />)}
          <LabelList
            dataKey="value"
            position="right"
            formatter={format as never}
            style={{ fontSize: 11, fontWeight: 600, fill: '#334155' }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
