import { useState } from 'react'
import { Link } from 'react-router-dom'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { useFilterParams } from '../components/FilterBar'
import { useWwDriftVenda, useWwDriftCombos, type WwDriftVenda, type WwDriftCombos } from '@/hooks/analyticsWeddings/useWw2'
import { SectionCard, EmptyState, LoadingSkeleton, ErrorBanner } from '../components/ui'
import { DrillDrawer, type DrillContext } from '../components/DrillDrawer'
import { OpenInACButton } from '../components/OpenInACButton'
import { ClickableRow } from '../components/ClickableRow'
import { formatCurrency, formatNumber } from '../lib/format'

const FAIXA_ORDER = ['Até R$50 mil', 'R$50-80 mil', 'R$50-100 mil', 'R$80-100 mil', 'R$100-200 mil', 'R$200-500 mil', '+R$500 mil']
const CONV_ORDER = ['Apenas o casal', 'Até 20', '20-50', '50-80', '80-100', '+100']

export function EntradaRealidade() {
  const filters = useFilterParams()
  const { data, isLoading, error } = useWwDriftVenda(filters)
  const { data: combos } = useWwDriftCombos(filters)
  const [drill, setDrill] = useState<DrillContext | null>(null)
  const baseCtx = { dateStart: filters.dateStart, dateEnd: filters.dateEnd }

  if (isLoading) return <LoadingSkeleton rows={10} />
  if (error) return <ErrorBanner error={error as Error} />
  if (!data || data.error) return <EmptyState message={data?.error ?? 'Sem dados'} />

  return (
    <div className="space-y-5">
      <FonteV2Banner data={data} />
      <UniversoHeader data={data} />
      <BreakdownTipo data={data} onTipoClick={(tipo) => setDrill({ ...baseCtx, tipo, status: 'ganho', title: `Casais — ${tipo} fechados` })} />

      {/* Análises cruzadas (Onda 6) — Investimento × Convidados × Destino */}
      {combos && !combos.error && (
        <>
          <TopCombosFechados combos={combos} onComboClick={(faixa, destino) => setDrill({ ...baseCtx, faixa, destino, status: 'ganho', title: `Vendas — ${faixa} + ${destino}` })} />
          <HeatmapTaxaConversao
            titulo="🔥 Onde a conversão acontece — Faixa × Convidados"
            subtitulo="Cada célula mostra entraram → fecharam (taxa). Quanto mais verde, melhor a combinação."
            cells={combos.matriz_faixa_conv}
            xLabel="Faixa"
            yLabel="Convidados"
            xOrder={FAIXA_ORDER}
            yOrder={CONV_ORDER}
            onCellClick={(faixa) => setDrill({ ...baseCtx, faixa, status: 'ganho', title: `Vendas — faixa ${faixa}` })}
          />
          <HeatmapTaxaConversao
            titulo="🔥 Onde a conversão acontece — Faixa × Destino"
            subtitulo="Identifica combos faixa de investimento + destino com maior taxa de fechamento."
            cells={combos.matriz_faixa_destino}
            xLabel="Faixa"
            yLabel="Destino"
            xOrder={FAIXA_ORDER}
            onCellClick={(faixa, destino) => setDrill({ ...baseCtx, faixa, destino, status: 'ganho', title: `Vendas — ${faixa} + ${destino}` })}
          />
          <HeatmapTaxaConversao
            titulo="🔥 Onde a conversão acontece — Convidados × Destino"
            subtitulo="Combos de tamanho de celebração + destino que mais fecham."
            cells={combos.matriz_destino_conv}
            xLabel="Convidados"
            yLabel="Destino"
            xOrder={CONV_ORDER}
            onCellClick={(_conv, destino) => setDrill({ ...baseCtx, destino, status: 'ganho', title: `Vendas — destino ${destino}` })}
          />
        </>
      )}

      <InvestimentoDrift data={data} onCellClick={(fe, fv) => setDrill({ ...baseCtx, faixa: fe, status: 'ganho', title: `Casais — entrou em ${fe}, vendeu em ${fv}` })} />
      <DestinoDrift data={data} onCellClick={(de, dv) => setDrill({ ...baseCtx, destino: de, status: 'ganho', title: `Casais — declarou ${de}, vendeu ${dv}` })} />
      <ConvidadosDrift data={data} />
      <DriftPorConsultor data={data} onConsultorClick={(consultor_id, consultor_nome) => setDrill({ ...baseCtx, consultorId: consultor_id, status: 'ganho', title: `Vendas — ${consultor_nome ?? 'consultor'}` })} />
      <DriftPorMes data={data} />
      <VendasFechadasList data={data} />
      <DrillDrawer ctx={drill} onClose={() => setDrill(null)} />
    </div>
  )
}

// ─── Banner explicando nova fonte (AC direto vs CRM defasado) ──────────────
function FonteV2Banner({ data }: { data: WwDriftVenda }) {
  // Se backend retornou fonte_v2, mostra banner explicativo
  const fonteV2 = (data as unknown as { fonte_v2?: string })?.fonte_v2
  if (!fonteV2) return null
  return (
    <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-sm text-emerald-900">
      <div className="flex items-start gap-3">
        <span className="text-emerald-600 text-lg">✨</span>
        <div className="flex-1">
          <p className="font-medium">Fonte: ActiveCampaign direto (snapshot 28/05/2026)</p>
          <p className="text-emerald-700 text-xs mt-1">
            Universo de {data.total_fechados ?? 150} casamentos fechados — mesma lógica do{' '}
            <a href="https://weddings-kpi.vercel.app/" target="_blank" rel="noreferrer" className="underline">weddings-kpi.vercel.app</a>
            {' '}+ <strong>orçamento total real</strong> (contato AC field 376) e <strong>previsão de convidados</strong> (field 121).
            O CRM continua defasado pra esses ganhos antigos, mas a análise aqui usa AC como fonte de verdade.
          </p>
        </div>
      </div>
    </div>
  )
}

// ─── NOVO Onda 6: Análises cruzadas ricas ───────────────────────────────────
function TopCombosFechados({ combos, onComboClick }: { combos: WwDriftCombos; onComboClick?: (faixa: string, destino: string) => void }) {
  const items = combos.top_combos_fechados ?? []
  if (items.length === 0) return null
  return (
    <SectionCard
      title="🏆 Combos de casamento que MAIS fecham"
      subtitle="Os 10 perfis (faixa + destino + convidados) com mais vendas. Mostra também quantos entraram com aquele perfil e a taxa de conversão. Clique pra ver os casais."
    >
      <div className="border border-slate-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2 text-center font-medium">#</th>
              <th className="px-3 py-2 text-center font-medium">Faixa</th>
              <th className="px-3 py-2 text-center font-medium">Destino</th>
              <th className="px-3 py-2 text-center font-medium">Convidados</th>
              <th className="px-3 py-2 text-center font-medium">Fecharam</th>
              <th className="px-3 py-2 text-center font-medium">Entraram</th>
              <th className="px-3 py-2 text-center font-medium">Taxa</th>
            </tr>
          </thead>
          <tbody>
            {items.map((c, i) => {
              const taxa = c.taxa_pct ?? 0
              const taxaCor = taxa >= 10 ? 'bg-emerald-100 text-emerald-800' : taxa >= 5 ? 'bg-emerald-50 text-emerald-700' : taxa >= 2 ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-600'
              const cells = (
                <>
                  <td className="px-3 py-2 text-slate-400 tabular-nums text-center">{i + 1}</td>
                  <td className="px-3 py-2 text-slate-900 font-medium text-center">{c.faixa}</td>
                  <td className="px-3 py-2 text-slate-700 text-center">{c.destino}</td>
                  <td className="px-3 py-2 text-slate-700 text-center">{c.convidados}</td>
                  <td className="px-3 py-2 text-center tabular-nums text-emerald-700 font-semibold">{c.fechou}</td>
                  <td className="px-3 py-2 text-center tabular-nums text-slate-600">{c.entrou}</td>
                  <td className="px-3 py-2 text-center">
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium tabular-nums ${taxaCor}`}>{taxa}%</span>
                  </td>
                </>
              )
              return onComboClick ? (
                <ClickableRow key={`${c.faixa}-${c.destino}-${c.convidados}`} onClick={() => onComboClick(c.faixa, c.destino)} className="border-t border-slate-100" title={`Ver casais ${c.faixa} + ${c.destino} + ${c.convidados}`}>
                  {cells}
                </ClickableRow>
              ) : <tr key={`${c.faixa}-${c.destino}-${c.convidados}`} className="border-t border-slate-100">{cells}</tr>
            })}
          </tbody>
        </table>
      </div>
    </SectionCard>
  )
}

function HeatmapTaxaConversao({ titulo, subtitulo, cells, xLabel, yLabel, xOrder, yOrder, onCellClick }: {
  titulo: string
  subtitulo: string
  cells: { x: string; y: string; entrou: number; fechou: number; taxa_pct: number | null }[]
  xLabel: string
  yLabel: string
  xOrder?: string[]
  yOrder?: string[]
  onCellClick?: (x: string, y: string) => void
}) {
  if (!cells || cells.length === 0) {
    return (
      <SectionCard title={titulo} subtitle={subtitulo}>
        <EmptyState message="Sem combinações suficientes (mínimo 2 leads)" />
      </SectionCard>
    )
  }
  const xs = xOrder
    ? xOrder.filter(v => cells.some(c => c.x === v))
    : Array.from(new Set(cells.map(c => c.x)))
  const ys = yOrder
    ? yOrder.filter(v => cells.some(c => c.y === v))
    : Array.from(new Set(cells.map(c => c.y))).sort((a, b) => {
        const sa = cells.filter(c => c.y === a).reduce((s, c) => s + c.entrou, 0)
        const sb = cells.filter(c => c.y === b).reduce((s, c) => s + c.entrou, 0)
        return sb - sa
      })
  const cellMap = new Map(cells.map(c => [`${c.x}|${c.y}`, c]))

  return (
    <SectionCard title={titulo} subtitle={subtitulo}>
      <div className="overflow-x-auto border border-slate-200 rounded-lg bg-white">
        <table className="w-full text-xs">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-3 py-2 text-center font-medium text-slate-500 sticky left-0 bg-slate-50 z-10 whitespace-nowrap">{yLabel} ↓ / {xLabel} →</th>
              {xs.map(x => <th key={x} className="px-3 py-2 text-center font-medium text-slate-700 min-w-[90px]">{x}</th>)}
            </tr>
          </thead>
          <tbody>
            {ys.map(y => (
              <tr key={y} className="border-t border-slate-100">
                <td className="px-3 py-2 text-slate-900 font-medium whitespace-nowrap sticky left-0 bg-white z-10">{y}</td>
                {xs.map(x => {
                  const cell = cellMap.get(`${x}|${y}`)
                  if (!cell) return <td key={x} className="px-3 py-2 text-center bg-slate-50 text-slate-300">—</td>
                  const taxa = cell.taxa_pct ?? 0
                  const bg = cell.fechou === 0 ? 'bg-rose-50 text-rose-900'
                    : taxa >= 10 ? 'bg-emerald-200 text-emerald-900'
                    : taxa >= 5 ? 'bg-emerald-100 text-emerald-900'
                    : taxa >= 2 ? 'bg-emerald-50 text-emerald-900'
                    : 'bg-amber-50 text-amber-900'
                  return (
                    <td key={x} className={`p-0 ${bg}`} title={`${cell.entrou} entraram · ${cell.fechou} fecharam · ${taxa}%`}>
                      {onCellClick ? (
                        <button onClick={() => onCellClick(x, y)} className="w-full h-full px-2 py-2 text-center block cursor-pointer hover:ring-2 hover:ring-indigo-400 focus:ring-2 focus:ring-indigo-400 focus:outline-none">
                          <div className="font-semibold text-sm">{taxa}%</div>
                          <div className="text-[10px] opacity-75 mt-0.5">{cell.entrou} → {cell.fechou}</div>
                        </button>
                      ) : (
                        <div className="px-2 py-2 text-center">
                          <div className="font-semibold text-sm">{taxa}%</div>
                          <div className="text-[10px] opacity-75 mt-0.5">{cell.entrou} → {cell.fechou}</div>
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
    </SectionCard>
  )
}

function BreakdownTipo({ data, onTipoClick }: { data: WwDriftVenda; onTipoClick?: (tipo: string) => void }) {
  if (!data.breakdown_tipo || data.breakdown_tipo.length === 0 || data.total_fechados === 0) return null
  return (
    <SectionCard title="👰 Vendas por tipo de casamento" subtitle="DW (Destination Wedding) × Elopment, com valor médio e total contratado em cada categoria. Clique pra ver os casais.">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {data.breakdown_tipo.map(b => {
          const Wrap = onTipoClick ? ('button' as const) : ('div' as const)
          return (
            <Wrap
              key={b.tipo}
              onClick={onTipoClick ? () => onTipoClick(b.tipo) : undefined}
              className={`border border-slate-200 rounded-xl p-4 bg-white text-left w-full ${onTipoClick ? 'hover:border-indigo-300 hover:bg-indigo-50/30 cursor-pointer transition' : ''}`}
            >
              <div className="text-xs uppercase tracking-wide text-slate-500 font-medium">{b.tipo}</div>
              <div className="mt-1 flex items-baseline gap-2">
                <div className="text-2xl font-semibold text-slate-900 tabular-nums">{formatNumber(b.fechados)}</div>
                <div className="text-xs text-slate-500">vendas</div>
              </div>
              <div className="mt-2 text-xs text-slate-600">
                Convidados (média): <strong className="tabular-nums">{b.convidados_medio ? formatNumber(b.convidados_medio) : '—'}</strong>
              </div>
            </Wrap>
          )
        })}
      </div>
    </SectionCard>
  )
}

function VendasFechadasList({ data }: { data: WwDriftVenda }) {
  if (!data.vendas_lista || data.vendas_lista.length === 0) return null
  return (
    <SectionCard
      title={`📋 Lista das ${formatNumber(data.total_fechados)} vendas fechadas`}
      subtitle="Ordenado pela data da venda mais recente. Clique no card pra abrir, ou no botão pra abrir o casal no Active."
    >
      <div className="border border-slate-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2 text-center font-medium">Data da venda</th>
              <th className="px-3 py-2 text-center font-medium">Casal · Card</th>
              <th className="px-3 py-2 text-center font-medium">Tipo</th>
              <th className="px-3 py-2 text-center font-medium">Destino vendido</th>
              <th className="px-3 py-2 text-center font-medium">Convidados</th>
              <th className="px-3 py-2 text-center font-medium">Valor</th>
              <th className="px-3 py-2 text-center font-medium">Closer</th>
              <th className="px-3 py-2 text-center font-medium">Monde</th>
              <th className="px-3 py-2 text-center font-medium">Active</th>
            </tr>
          </thead>
          <tbody>
            {data.vendas_lista.map(v => (
              <tr key={v.card_id} className="border-t border-slate-100 hover:bg-slate-50/60">
                <td className="px-3 py-2 text-slate-700 tabular-nums whitespace-nowrap">
                  {v.data_venda ? new Date(v.data_venda).toLocaleDateString('pt-BR') : '—'}
                </td>
                <td className="px-3 py-2">
                  <Link to={`/cards/${v.card_id}`} className="text-indigo-700 hover:underline font-medium block truncate max-w-xs" title={v.titulo ?? ''}>
                    {v.titulo ?? '—'}
                  </Link>
                  {v.contato_nome && <div className="text-[11px] text-slate-500 mt-0.5">{v.contato_nome}</div>}
                </td>
                <td className="px-3 py-2">
                  {v.tipo_casamento ? (
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${v.tipo_casamento === 'Elopment' ? 'bg-violet-50 text-violet-700' : 'bg-indigo-50 text-indigo-700'}`}>
                      {v.tipo_casamento}
                    </span>
                  ) : <span className="text-slate-400">—</span>}
                </td>
                <td className="px-3 py-2 text-slate-700">{v.destino_vendido ?? '—'}</td>
                <td className="px-3 py-2 text-right tabular-nums font-medium text-slate-900">{v.num_convidados ? formatNumber(v.num_convidados) : '—'}</td>
                <td className="px-3 py-2 text-right tabular-nums text-slate-900">{v.valor_final ? formatCurrency(v.valor_final) : <span className="text-slate-300">—</span>}</td>
                <td className="px-3 py-2 text-slate-600 text-xs">{v.consultor_nome ?? <span className="text-slate-400">—</span>}</td>
                <td className="px-3 py-2 text-right tabular-nums text-xs text-slate-500">{v.monde_venda ?? '—'}</td>
                <td className="px-3 py-2 text-center">
                  <OpenInACButton dealId={v.ac_deal_id} externalId={v.contato_external_id} contactName={v.contato_nome} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  )
}

function DriftPorConsultor({ data, onConsultorClick }: { data: WwDriftVenda; onConsultorClick?: (consultorId: string, consultorNome: string | null) => void }) {
  if (!data.drift_por_consultor || data.drift_por_consultor.length === 0) return null
  return (
    <SectionCard
      title="👤 Drift por closer (quem faz upsell?)"
      subtitle="Pra cada closer, quantas vendas mantiveram a faixa declarada, subiram (upsell) ou desceram. Linha clicável."
    >
      <div className="border border-slate-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2 text-center font-medium">Closer</th>
              <th className="px-3 py-2 text-center font-medium">Vendas</th>
              <th className="px-3 py-2 text-center font-medium">Manteve</th>
              <th className="px-3 py-2 text-center font-medium">Subiu (upsell)</th>
              <th className="px-3 py-2 text-center font-medium">Desceu</th>
            </tr>
          </thead>
          <tbody>
            {data.drift_por_consultor.map(c => {
              const cells = (
                <>
                  <td className="px-3 py-2 text-slate-900 font-medium">{c.consultor_nome ?? <span className="text-slate-400">Sem dono</span>}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatNumber(c.vendas)}</td>
                  <td className="px-3 py-2 text-right">
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium bg-emerald-50 text-emerald-700">
                      {c.manteve} · {c.manteve_pct ?? 0}%
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium bg-indigo-50 text-indigo-700">
                      {c.subiu} · {c.subiu_pct ?? 0}%
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium bg-amber-50 text-amber-700">
                      {c.desceu} · {c.desceu_pct ?? 0}%
                    </span>
                  </td>
                </>
              )
              return onConsultorClick ? (
                <ClickableRow key={c.consultor_id} onClick={() => onConsultorClick(c.consultor_id, c.consultor_nome)} className="border-t border-slate-100" title={`Ver vendas de ${c.consultor_nome ?? 'consultor'}`}>
                  {cells}
                </ClickableRow>
              ) : (
                <tr key={c.consultor_id} className="border-t border-slate-100">{cells}</tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </SectionCard>
  )
}

function DriftPorMes({ data }: { data: WwDriftVenda }) {
  if (!data.drift_por_mes || data.drift_por_mes.length === 0) return null
  return (
    <SectionCard
      title="📅 Evolução da aderência mês a mês"
      subtitle="A % de vendas que MANTIVERAM a faixa declarada ao longo dos meses. Se cair, é sinal de drift crescente."
    >
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={data.drift_por_mes}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="mes" stroke="#64748b" fontSize={11} />
          <YAxis stroke="#64748b" fontSize={11} unit="%" />
          <Tooltip contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12 }} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Line type="monotone" dataKey="manteve_pct" name="Manteve" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
          <Line type="monotone" dataKey="subiu_pct" name="Subiu (upsell)" stroke="#6366f1" strokeWidth={2} dot={{ r: 3 }} />
          <Line type="monotone" dataKey="desceu_pct" name="Desceu" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} />
        </LineChart>
      </ResponsiveContainer>
    </SectionCard>
  )
}

function UniversoHeader({ data }: { data: WwDriftVenda }) {
  const isCohort = data.date_mode === 'cohort'
  const total = data.total_leads
  const fechados = data.total_fechados
  return (
    <div className="bg-gradient-to-r from-indigo-50 to-violet-50 border border-indigo-200 rounded-xl p-5">
      <div className="flex items-baseline justify-between flex-wrap gap-3">
        <div className="max-w-3xl">
          <h2 className="text-base font-semibold text-slate-900">🔄 Entrada × Realidade</h2>
          {isCohort ? (
            <>
              <p className="text-sm text-slate-600 mt-1">
                Universo: <strong>{formatNumber(total)} leads</strong> que entraram no período.
                Desses, <strong className="text-emerald-700">{formatNumber(fechados)} fecharam contrato</strong>.
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Pra ver quantas vendas fecharam dentro do período (independente de quando o lead entrou), troca pra "Data de evento".
              </p>
            </>
          ) : (
            <p className="text-sm text-slate-600 mt-1">
              Universo: <strong className="text-emerald-700">{formatNumber(fechados)} vendas fechadas</strong> nesse período.
            </p>
          )}
          <p className="text-[11px] text-slate-400 mt-1">
            Venda fechada = card tem campo <code className="bg-white px-1 rounded">Data/Hora do Ganho</code> preenchido pelo closer.
          </p>
        </div>
        <div className="text-xs bg-white border border-indigo-200 rounded-lg px-3 py-1.5 text-indigo-700 whitespace-nowrap">
          📅 Modo: <strong>{isCohort ? 'Entrada do lead (cohort)' : 'Data da venda (throughput)'}</strong>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// INVESTIMENTO — entrada × valor R$ vendido
// ─────────────────────────────────────────────────────────────────────────────
function InvestimentoDrift({ data, onCellClick }: { data: WwDriftVenda; onCellClick?: (faixaEntrada: string, faixaVendida: string) => void }) {
  const inv = data.investimento
  const { cobertura, drift, matriz } = inv
  const universo = cobertura.com_ambos

  if (data.total_leads === 0) {
    return (
      <SectionCard title="💰 Investimento — entrada × valor vendido" subtitle="Nenhuma venda no período selecionado">
        <EmptyState message="Sem vendas fechadas no período" />
      </SectionCard>
    )
  }

  // Matriz: faixas presentes na entrada e nas vendidas, na ordem canônica
  const faixasEntrada = FAIXA_ORDER.filter(f => matriz.some(m => m.faixa_e === f))
  const faixasVendida = FAIXA_ORDER.filter(f => matriz.some(m => m.faixa_v === f))
  const matrizMap = new Map(matriz.map(m => [`${m.faixa_e}|${m.faixa_v}`, m]))

  return (
    <SectionCard
      title="💰 Investimento — entrada × valor R$ que vendeu"
      subtitle={`Quanto a faixa que o casal disse no site bate com o valor real do pacote contratado.`}
    >
      <CoberturaBanner
        com_entrada={cobertura.com_entrada}
        com_realidade={cobertura.com_realidade}
        com_ambos={cobertura.com_ambos}
        total_leads={data.total_leads}
        total_fechados={data.total_fechados}
        isCohort={data.date_mode === 'cohort'}
        nome_entrada="faixa no site"
        nome_realidade="valor R$ do pacote"
        avisoQuandoFaltaRealidade="Closer não preencheu o valor R$ do pacote (ww_closer_valor_pacote) nessas vendas."
      />

      {universo === 0 ? (
        <EmptyState message="Nenhuma venda fechada tem entrada + valor real do pacote para comparar" />
      ) : (
        <>
          {/* Resumo do drift */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-5">
            <DriftCard label="Manteve a faixa" value={drift.manteve} total={universo} color="emerald" hint="Vendeu na mesma faixa de R$ que o casal disse" />
            <DriftCard label="Vendeu acima" value={drift.subiu} total={universo} color="indigo" hint="Faixa real do pacote ficou acima do declarado" />
            <DriftCard label="Vendeu abaixo" value={drift.desceu} total={universo} color="amber" hint="Faixa real do pacote ficou abaixo do declarado" />
          </div>

          {/* Matriz de transição */}
          {faixasEntrada.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-slate-700 mb-2 uppercase tracking-wide">Matriz: faixa declarada na entrada × faixa real do pacote vendido</h4>
              <p className="text-xs text-slate-500 mb-2">
                Linha = faixa que o casal declarou no site. Coluna = faixa em que o pacote efetivamente caiu (a partir do valor R$ contratado).
                Cada célula mostra <strong>quantidade de vendas</strong> e <strong>% sobre a linha</strong>.
              </p>
              <div className="mb-3 flex items-center gap-3 text-[11px] text-slate-500">
                <span>Legenda:</span>
                <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-900">manteve faixa</span>
                <span className="px-2 py-0.5 rounded bg-indigo-50 text-indigo-900">vendeu acima</span>
                <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-900">vendeu abaixo</span>
              </div>
              <div className="overflow-x-auto border border-slate-200 rounded-lg">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-3 py-2 text-center font-medium text-slate-500">Entrada ↓ / Vendeu →</th>
                      {faixasVendida.map(fv => (
                        <th key={fv} className="px-3 py-2 text-center font-medium text-slate-700">{fv}</th>
                      ))}
                      <th className="px-3 py-2 text-center font-medium text-slate-500 border-l border-slate-200">Total linha</th>
                    </tr>
                  </thead>
                  <tbody>
                    {faixasEntrada.map(fe => {
                      const rowTotal = faixasVendida.reduce((s, fv) => s + (matrizMap.get(`${fe}|${fv}`)?.qtd ?? 0), 0)
                      return (
                        <tr key={fe} className="border-t border-slate-100">
                          <td className="px-3 py-2 text-slate-900 font-medium whitespace-nowrap">{fe}</td>
                          {faixasVendida.map(fv => {
                            const cell = matrizMap.get(`${fe}|${fv}`)
                            const qtd = cell?.qtd ?? 0
                            const eIdx = FAIXA_ORDER.indexOf(fe)
                            const vIdx = FAIXA_ORDER.indexOf(fv)
                            const pctLinha = rowTotal > 0 ? Math.round(100 * qtd / rowTotal) : 0
                            let bg = 'bg-slate-50'
                            if (qtd > 0) {
                              if (vIdx === eIdx) bg = 'bg-emerald-100 text-emerald-900'
                              else if (vIdx > eIdx) bg = 'bg-indigo-50 text-indigo-900'
                              else bg = 'bg-amber-50 text-amber-900'
                            }
                            const isClick = qtd > 0 && !!onCellClick
                            return (
                              <td key={fv} className={`p-0 ${bg} ${qtd === 0 ? 'text-slate-300' : ''}`}
                                  title={qtd > 0 ? `${qtd} venda(s) — ${pctLinha}% da linha` : 'Nenhuma venda nessa combinação'}>
                                {isClick ? (
                                  <button onClick={() => onCellClick(fe, fv)} className="w-full h-full px-3 py-2 text-center cursor-pointer hover:ring-2 hover:ring-indigo-400 focus:ring-2 focus:ring-indigo-400 focus:outline-none">
                                    <div className="font-semibold text-sm">{qtd}</div>
                                    <div className="text-[10px] opacity-75">{pctLinha}%</div>
                                  </button>
                                ) : qtd > 0 ? (
                                  <div className="px-3 py-2 text-center">
                                    <div className="font-semibold text-sm">{qtd}</div>
                                    <div className="text-[10px] opacity-75">{pctLinha}%</div>
                                  </div>
                                ) : <div className="px-3 py-2 text-center">0</div>}
                              </td>
                            )
                          })}
                          <td className="px-3 py-2 text-center text-slate-700 font-semibold border-l border-slate-200">{rowTotal}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </SectionCard>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// DESTINO — entrada × destino vendido
// ─────────────────────────────────────────────────────────────────────────────
function DestinoDrift({ data, onCellClick }: { data: WwDriftVenda; onCellClick?: (destinoEntrada: string, destinoVendido: string) => void }) {
  const dest = data.destino
  const { cobertura, drift, matriz, top_migracoes } = dest
  const universo = cobertura.com_ambos

  const destinosE = Array.from(new Set(matriz.map(m => m.dest_e)))
  const destinosV = Array.from(new Set(matriz.map(m => m.dest_v)))
  const matrizMap = new Map(matriz.map(m => [`${m.dest_e}|${m.dest_v}`, m.qtd]))

  if (data.total_leads === 0) return null

  return (
    <SectionCard
      title="🏝️  Destino — entrada × destino vendido"
      subtitle="Para onde o casal disse que queria casar × onde a venda efetivamente saiu."
    >
      <CoberturaBanner
        com_entrada={cobertura.com_entrada}
        com_realidade={cobertura.com_vendido}
        com_ambos={cobertura.com_ambos}
        total_leads={data.total_leads}
        total_fechados={data.total_fechados}
        isCohort={data.date_mode === 'cohort'}
        nome_entrada="destino no site"
        nome_realidade="destino vendido"
        avisoQuandoFaltaRealidade="Closer não preencheu o destino contratado nessas vendas."
      />

      {universo === 0 ? (
        <EmptyState message="Nenhuma venda tem entrada + destino vendido para comparar" />
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-5">
            <DriftCard label="Manteve o destino" value={drift.manteve} total={universo} color="emerald" hint="Vendeu para onde disse" />
            <DriftCard label="Migrou de destino" value={drift.mudou} total={universo} color="amber" hint="Mudou entre site e venda" />
          </div>

          {top_migracoes.length > 0 && (
            <div className="mb-5">
              <h4 className="text-xs font-semibold text-slate-700 mb-2 uppercase tracking-wide">Top migrações (quem mudou, foi pra onde)</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {top_migracoes.map((m, i) => (
                  <div key={i} className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 text-xs">
                    <div className="text-slate-600 truncate">{m.de}</div>
                    <div className="text-amber-700 font-medium">→ {m.para}</div>
                    <div className="text-amber-900 font-semibold mt-1">{m.qtd} lead{m.qtd > 1 ? 's' : ''}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {destinosE.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-slate-700 mb-2 uppercase tracking-wide">Matriz completa: destino declarado × destino vendido</h4>
              <p className="text-xs text-slate-500 mb-2">Cada célula mostra <strong>quantidade de vendas</strong> e <strong>% sobre a linha</strong>. Verde = manteve, âmbar = migrou.</p>
              <div className="overflow-x-auto border border-slate-200 rounded-lg">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-3 py-2 text-center font-medium text-slate-500">Entrada ↓ / Vendeu →</th>
                      {destinosV.map(d => <th key={d} className="px-3 py-2 text-center font-medium text-slate-700">{d}</th>)}
                      <th className="px-3 py-2 text-center font-medium text-slate-500 border-l border-slate-200">Total linha</th>
                    </tr>
                  </thead>
                  <tbody>
                    {destinosE.map(de => {
                      const rowTotal = destinosV.reduce((s, dv) => s + (matrizMap.get(`${de}|${dv}`) ?? 0), 0)
                      return (
                        <tr key={de} className="border-t border-slate-100">
                          <td className="px-3 py-2 text-slate-900 font-medium whitespace-nowrap">{de}</td>
                          {destinosV.map(dv => {
                            const qtd = matrizMap.get(`${de}|${dv}`) ?? 0
                            const pctLinha = rowTotal > 0 ? Math.round(100 * qtd / rowTotal) : 0
                            const isDiag = de === dv
                            const bg = qtd === 0 ? 'bg-slate-50 text-slate-300' : isDiag ? 'bg-emerald-100 text-emerald-900' : 'bg-amber-50 text-amber-900'
                            const isClick = qtd > 0 && !!onCellClick
                            return (
                              <td key={dv} className={`p-0 ${bg}`}
                                  title={qtd > 0 ? `${qtd} venda(s) — ${pctLinha}% da linha` : 'Nenhuma venda'}>
                                {isClick ? (
                                  <button onClick={() => onCellClick(de, dv)} className="w-full h-full px-3 py-2 text-center cursor-pointer hover:ring-2 hover:ring-indigo-400 focus:ring-2 focus:ring-indigo-400 focus:outline-none">
                                    <div className="font-semibold text-sm">{qtd}</div>
                                    <div className="text-[10px] opacity-75">{pctLinha}%</div>
                                  </button>
                                ) : qtd > 0 ? (
                                  <div className="px-3 py-2 text-center">
                                    <div className="font-semibold text-sm">{qtd}</div>
                                    <div className="text-[10px] opacity-75">{pctLinha}%</div>
                                  </div>
                                ) : <div className="px-3 py-2 text-center">0</div>}
                              </td>
                            )
                          })}
                          <td className="px-3 py-2 text-center text-slate-700 font-semibold border-l border-slate-200">{rowTotal}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </SectionCard>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// CONVIDADOS — entrada × refinado pela closer
// ─────────────────────────────────────────────────────────────────────────────
function ConvidadosDrift({ data }: { data: WwDriftVenda }) {
  const conv = data.convidados
  const { cobertura, drift, matriz } = conv
  const universo = cobertura.com_ambos
  const matrizMap = new Map(matriz.map(m => [`${m.conv_e}|${m.conv_r}`, m.qtd]))

  if (data.total_leads === 0) return null

  const convE = CONV_ORDER.filter(c => matriz.some(m => m.conv_e === c))
  const convR = CONV_ORDER.filter(c => matriz.some(m => m.conv_r === c))

  return (
    <SectionCard
      title="👥 Convidados — entrada × refinado pela closer"
      subtitle="Não temos campo de convidados confirmado na venda. Usamos o refinado pela closer como melhor aproximação."
    >
      <CoberturaBanner
        com_entrada={cobertura.com_entrada}
        com_realidade={cobertura.com_realidade}
        com_ambos={cobertura.com_ambos}
        total_leads={data.total_leads}
        total_fechados={data.total_fechados}
        isCohort={data.date_mode === 'cohort'}
        nome_entrada="convidados no site"
        nome_realidade="convidados refinado"
        avisoQuandoFaltaRealidade="Closer não refinou o nº de convidados nessas vendas."
      />

      {universo === 0 ? (
        <EmptyState message="Nenhuma venda tem entrada + refinado de convidados para comparar" />
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3 mb-5">
            <DriftCard label="Manteve" value={drift.manteve} total={universo} color="emerald" hint="Confirmou a faixa que disse" />
            <DriftCard label="Aumentou" value={drift.subiu} total={universo} color="indigo" hint="Acabou em faixa maior" />
            <DriftCard label="Diminuiu" value={drift.desceu} total={universo} color="amber" hint="Acabou em faixa menor" />
          </div>

          {convE.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-slate-700 mb-2 uppercase tracking-wide">Matriz de transição: convidados declarado × refinado pela closer</h4>
              <p className="text-xs text-slate-500 mb-2">Cada célula mostra <strong>quantidade de vendas</strong> e <strong>% sobre a linha</strong>. Verde = manteve, azul = aumentou, âmbar = diminuiu.</p>
              <div className="overflow-x-auto border border-slate-200 rounded-lg">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-3 py-2 text-center font-medium text-slate-500">Entrada ↓ / Refinado →</th>
                      {convR.map(c => <th key={c} className="px-3 py-2 text-center font-medium text-slate-700">{c}</th>)}
                      <th className="px-3 py-2 text-center font-medium text-slate-500 border-l border-slate-200">Total linha</th>
                    </tr>
                  </thead>
                  <tbody>
                    {convE.map(ce => {
                      const rowTotal = convR.reduce((s, cr) => s + (matrizMap.get(`${ce}|${cr}`) ?? 0), 0)
                      return (
                        <tr key={ce} className="border-t border-slate-100">
                          <td className="px-3 py-2 text-slate-900 font-medium whitespace-nowrap">{ce}</td>
                          {convR.map(cr => {
                            const qtd = matrizMap.get(`${ce}|${cr}`) ?? 0
                            const pctLinha = rowTotal > 0 ? Math.round(100 * qtd / rowTotal) : 0
                            const eIdx = CONV_ORDER.indexOf(ce)
                            const rIdx = CONV_ORDER.indexOf(cr)
                            let bg = qtd === 0 ? 'bg-slate-50 text-slate-300' : ''
                            if (qtd > 0) {
                              if (eIdx === rIdx) bg = 'bg-emerald-100 text-emerald-900'
                              else if (rIdx > eIdx) bg = 'bg-indigo-50 text-indigo-900'
                              else bg = 'bg-amber-50 text-amber-900'
                            }
                            return (
                              <td key={cr} className={`px-3 py-2 text-center ${bg}`}
                                  title={qtd > 0 ? `${qtd} venda(s) — ${pctLinha}% da linha` : 'Nenhuma venda'}>
                                {qtd > 0 ? (
                                  <div>
                                    <div className="font-semibold text-sm">{qtd}</div>
                                    <div className="text-[10px] opacity-75">{pctLinha}%</div>
                                  </div>
                                ) : '0'}
                              </td>
                            )
                          })}
                          <td className="px-3 py-2 text-center text-slate-700 font-semibold border-l border-slate-200">{rowTotal}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </SectionCard>
  )
}

// ─── Helpers ────────────────────────────────────────────────────────────────
function CoberturaBanner({ com_entrada, com_realidade, com_ambos, total_leads, total_fechados, isCohort, nome_entrada, nome_realidade, avisoQuandoFaltaRealidade }: {
  com_entrada: number; com_realidade: number; com_ambos: number
  total_leads: number; total_fechados: number
  isCohort: boolean
  nome_entrada: string; nome_realidade: string
  avisoQuandoFaltaRealidade?: string
}) {
  const base = isCohort ? total_leads : total_fechados
  if (base === 0) return null
  const labelBase = isCohort ? 'dos leads' : 'das vendas'
  const pctEntrada = Math.round(100 * com_entrada / base)
  // "Tem realidade" só faz sentido percentualmente sobre fechados (porque realidade depende de venda)
  const pctReal = total_fechados > 0 ? Math.round(100 * com_realidade / total_fechados) : 0
  const pctAmbos = base > 0 ? Math.round(100 * com_ambos / base) : 0
  const gapVendasSemRealidade = total_fechados - com_realidade

  return (
    <>
      <div className="mb-2 grid grid-cols-3 gap-2 text-xs">
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-2">
          <div className="text-slate-500">Tem {nome_entrada}</div>
          <div className="text-slate-900 font-semibold mt-0.5">{com_entrada} <span className="text-slate-400 text-[11px] font-normal">({pctEntrada}% {labelBase})</span></div>
        </div>
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-2">
          <div className="text-slate-500">Tem {nome_realidade}</div>
          <div className="text-slate-900 font-semibold mt-0.5">
            {com_realidade}
            {total_fechados > 0 && (
              <span className="text-slate-400 text-[11px] font-normal"> ({pctReal}% das {total_fechados} vendas fechadas)</span>
            )}
          </div>
        </div>
        <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-2">
          <div className="text-indigo-600">Universo p/ comparação</div>
          <div className="text-indigo-900 font-semibold mt-0.5">{com_ambos} <span className="text-indigo-500 text-[11px] font-normal">({pctAmbos}% {labelBase})</span></div>
        </div>
      </div>
      {gapVendasSemRealidade > 0 && avisoQuandoFaltaRealidade && (
        <div className="mb-4 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-900">
          <strong>⚠️ {gapVendasSemRealidade} {gapVendasSemRealidade === 1 ? 'venda fechada não tem' : 'vendas fechadas não têm'} esse dado preenchido.</strong> {avisoQuandoFaltaRealidade}
        </div>
      )}
    </>
  )
}

function DriftCard({ label, value, total, color, hint }: { label: string; value: number; total: number; color: 'emerald' | 'indigo' | 'amber'; hint?: string }) {
  const pct = total > 0 ? Math.round(100 * value / total) : 0
  const colors = {
    emerald: 'bg-emerald-50 border-emerald-200 text-emerald-900',
    indigo:  'bg-indigo-50 border-indigo-200 text-indigo-900',
    amber:   'bg-amber-50 border-amber-200 text-amber-900',
  }
  return (
    <div className={`border rounded-xl p-3 ${colors[color]}`}>
      <div className="text-xs uppercase tracking-wide font-medium opacity-75">{label}</div>
      <div className="mt-1 flex items-baseline gap-2">
        <div className="text-2xl font-semibold tabular-nums">{value}</div>
        <div className="text-sm opacity-75">({pct}%)</div>
      </div>
      {hint && <div className="text-xs opacity-70 mt-0.5">{hint}</div>}
    </div>
  )
}
