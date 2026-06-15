import { useState } from 'react'
import { Bar, BarChart, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useWw2Marketing, useWwMarketingQualidade, type WwMarketingQualidade } from '@/hooks/analyticsWeddings/useWw2'
import { FilterBar, type TabProps, type AppliedFilters } from '../components/FilterBar'
import { SectionCard, EmptyState, LoadingSkeleton, ErrorBanner } from '../components/ui'
import { DrillDrawer, type DrillContext } from '../components/DrillDrawer'
import { LiftBadge } from '../components/LiftBadge'
import { ClickableRow } from '../components/ClickableRow'
import { MatrixHeatmap } from '../components/MatrixHeatmap'
import { formatCurrency, formatNumber } from '../lib/format'

const FAIXA_ORDER = ['Até R$50 mil', 'R$50-80 mil', 'R$50-100 mil', 'R$80-100 mil', 'R$100-200 mil', 'R$200-500 mil', '+R$500 mil']

export function Marketing({ filters, onFiltersChange }: TabProps) {
  return (
    <div className="space-y-4">
      {/* Pergunta da aba: "de onde vêm os leads bons?" — leitura sempre por safra
          (dateMode saiu: metade da tela ignorava o modo e o filtro mentia).
          Canal SDR/Closer entram como recorte: "qual fonte traz lead que faz reunião por vídeo?" */}
      <FilterBar value={filters} onChange={onFiltersChange} show={['period', 'tipo', 'origem', 'canal_sdr', 'canal_closer']} />
      <MarketingContent filters={filters} />
    </div>
  )
}

function MarketingContent({ filters }: { filters: AppliedFilters }) {
  const { data, isLoading, error } = useWw2Marketing(filters)
  const { data: qualidade } = useWwMarketingQualidade(filters, 2)
  const [drill, setDrill] = useState<DrillContext | null>(null)

  if (isLoading) return <LoadingSkeleton rows={5} />
  if (error) return <ErrorBanner error={error as Error} />
  if (!data) return <EmptyState message="Sem dados" />

  // Auditoria 2026-06-11: drill carrega os filtros ativos da aba junto com o clique
  const baseCtx = {
    dateStart: filters.dateStart, dateEnd: filters.dateEnd,
    origins: filters.origins, tipos: filters.tipos,
    canalSdr: filters.canalSdr, canalCloser: filters.canalCloser,
  }

  return (
    <div className="space-y-5">
      {qualidade && !qualidade.error && <QualidadeFonte data={qualidade} onOrigemClick={(origem) => setDrill({ ...baseCtx, origem, title: `Casais — origem ${origem}` })} onCampanhaClick={(campaign) => setDrill({ ...baseCtx, campaign, title: `Casais — campanha ${campaign}` })} />}
      {qualidade && !qualidade.error && <DropOffPorFase data={qualidade} onOrigemClick={(origem) => setDrill({ ...baseCtx, origem, title: `Casais — origem ${origem}` })} />}

      {/* Origem × faixa declarada (20260611a) — só aparece quando o banco já devolve o cruzamento */}
      {qualidade && !qualidade.error && (qualidade.origem_x_faixa?.length ?? 0) > 0 && (
        <SectionCard
          title="💰 × 🎯  Que bolso cada fonte traz"
          subtitle="Linha = faixa de investimento declarada no site. Coluna = origem do lead. % na célula = taxa de fechamento. Mostra qual fonte traz lead rico — e qual combinação realmente fecha."
        >
          <MatrixHeatmap
            cells={(qualidade.origem_x_faixa ?? []).map(c => ({ linha: c.y, coluna: c.x, entraram: c.entrou, fecharam: c.fechou, taxa_pct: c.taxa_pct }))}
            rowsOrder={FAIXA_ORDER}
            rowLabel="Faixa"
            colLabel="Origem"
            onCellClick={(faixa, origem) => setDrill({ ...baseCtx, faixa, origem, title: `Casais — ${faixa} via ${origem}` })}
          />
        </SectionCard>
      )}

      {/* "Performance por origem" saiu: era a MESMA tabela da "Qualidade da fonte" acima
          (mesmas origens, leads, taxas, ticket) com a coluna de tempo sempre vazia.
          Fica só como FALLBACK se a RPC de qualidade falhar — a aba nunca perde a visão por origem. */}
      {(!qualidade || qualidade.error) && (
        <SectionCard title="Performance por origem" subtitle="UTM source consolidado. Clique numa linha pra ver os leads.">
          {data.por_origem.length === 0 ? <EmptyState message="Sem dados" /> : (
            <table className="w-full text-xs">
              <thead className="text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="py-2 font-medium text-left">Origem</th>
                  <th className="py-2 font-medium text-right">Leads</th>
                  <th className="py-2 font-medium text-right">Qualif.</th>
                  <th className="py-2 font-medium text-right">Taxa qualif.</th>
                  <th className="py-2 font-medium text-right">Fechados</th>
                  <th className="py-2 font-medium text-right">Taxa fech.</th>
                  <th className="py-2 font-medium text-right">Ticket médio</th>
                </tr>
              </thead>
              <tbody>
                {data.por_origem.map(r => (
                  <tr key={r.origem} className="border-b border-slate-100 hover:bg-ww-cream/50 cursor-pointer transition-colors"
                      onClick={() => setDrill({ ...baseCtx, origem: r.origem, title: `Leads da origem ${r.origem}` })}>
                    <td className="py-2 font-medium text-slate-900">{r.origem}</td>
                    <td className="py-2 text-right tabular-nums">{formatNumber(r.leads)}</td>
                    <td className="py-2 text-right tabular-nums">{formatNumber(r.qualificados)}</td>
                    <td className="py-2 text-right">
                      <span className={`text-[11px] font-medium tabular-nums ${r.taxa_qualif >= 30 ? 'text-emerald-700' : 'text-slate-500'}`}>{r.taxa_qualif}%</span>
                    </td>
                    <td className="py-2 text-right tabular-nums text-emerald-600">{formatNumber(r.fechados)}</td>
                    <td className="py-2 text-right">
                      <span className={`px-1.5 py-0.5 rounded text-[11px] font-medium tabular-nums ${r.taxa_fechamento >= 10 ? 'bg-emerald-50 text-emerald-700' : r.taxa_fechamento >= 3 ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>{r.taxa_fechamento}%</span>
                    </td>
                    <td className="py-2 text-right tabular-nums">{r.ticket_medio > 0 ? formatCurrency(r.ticket_medio) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </SectionCard>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <SectionCard title="Top campanhas" subtitle="UTM campaign — top 15 por volume. Clique numa barra pra ver os casais.">
          {data.por_campaign.length === 0 ? <EmptyState message="Sem dados de campanha" /> : (
            <ResponsiveContainer width="100%" height={Math.max(220, data.por_campaign.length * 22)}>
              <BarChart data={data.por_campaign} layout="vertical" margin={{ top: 5, right: 50, left: 100, bottom: 5 }}>
                <XAxis type="number" stroke="#64748b" fontSize={10} hide />
                <YAxis dataKey="campaign" type="category" stroke="#64748b" fontSize={9} width={140}
                       tickFormatter={(v) => String(v).length > 25 ? String(v).slice(0, 25) + '…' : String(v)} />
                <Tooltip contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 11 }} />
                <Bar dataKey="leads" fill="#874B52" radius={[0, 4, 4, 0]} cursor="pointer"
                  onClick={(d: unknown) => {
                    const c = (d as { payload?: { campaign?: string } })?.payload?.campaign
                    if (c) setDrill({ ...baseCtx, campaign: c, title: `Casais — campanha ${c}` })
                  }}>
                  <LabelList dataKey="leads" position="right" fontSize={10} fill="#64748b" formatter={(v: unknown) => formatNumber(Number(v))} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </SectionCard>

        <SectionCard title="Por medium" subtitle="UTM medium (CPC, organic, email…). Clique numa barra pra ver os casais.">
          {data.por_medium.length === 0 ? <EmptyState message="Sem dados" /> : (
            <ResponsiveContainer width="100%" height={Math.max(180, data.por_medium.length * 32)}>
              <BarChart data={data.por_medium} layout="vertical" margin={{ top: 5, right: 40, left: 80, bottom: 5 }}>
                <XAxis type="number" stroke="#64748b" fontSize={11} hide />
                <YAxis dataKey="medium" type="category" stroke="#64748b" fontSize={11} width={120} />
                <Tooltip contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="leads" fill="#BD965C" radius={[0, 4, 4, 0]} cursor="pointer"
                  onClick={(d: unknown) => {
                    const m = (d as { payload?: { medium?: string } })?.payload?.medium
                    if (m) setDrill({ ...baseCtx, medium: m, title: `Casais — medium ${m}` })
                  }}>
                  <LabelList dataKey="leads" position="right" fontSize={10} fill="#64748b" formatter={(v: unknown) => formatNumber(Number(v))} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </SectionCard>
      </div>

      <SectionCard title="Funil por origem" subtitle="Top 5 origens — quantos viram leads, quantos qualificam, quantos fecham. Clique numa linha pra ver os casais.">
        {data.funil_origem.length === 0 ? <EmptyState message="Sem dados" /> : (
          <div className="space-y-3">
            {data.funil_origem.map(o => {
              const maxV = o.novo || 1
              return (
                <div key={o.origem} className="border-b border-slate-100 last:border-0 pb-3">
                  <div className="text-sm font-semibold text-slate-800 mb-2">{o.origem}</div>
                  <div className="space-y-1.5">
                    <FunilRow label="Lead novo" value={o.novo} max={maxV} color="#BD965C"
                      onClick={() => setDrill({ ...baseCtx, origem: o.origem, title: `Casais — origem ${o.origem}` })} />
                    <FunilRow label="Qualificado SDR" value={o.qualificado} max={maxV} color="#874B52"
                      onClick={() => setDrill({ ...baseCtx, origem: o.origem, marco: 'marcou_sdr', title: `Qualificados — origem ${o.origem}` })} />
                    <FunilRow label="Casamento fechado" value={o.fechado} max={maxV} color="#16a34a"
                      onClick={() => setDrill({ ...baseCtx, origem: o.origem, marco: 'ganho', title: `Fechados — origem ${o.origem}` })} />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </SectionCard>

      <DrillDrawer ctx={drill} onClose={() => setDrill(null)} />
    </div>
  )
}

function FunilRow({ label, value, max, color, onClick }: { label: string; value: number; max: number; color: string; onClick?: () => void }) {
  const pct = (value / max) * 100
  const inner = (
    <>
      <div className="w-32 text-slate-600">{label}</div>
      <div className="flex-1 bg-slate-100 h-5 rounded relative overflow-hidden">
        <div className="h-full rounded transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
      <div className="w-14 text-right text-slate-700 font-medium tabular-nums">{formatNumber(value)}</div>
    </>
  )
  if (onClick) {
    return (
      <button onClick={onClick} className="w-full flex items-center gap-2 text-xs text-left rounded hover:bg-slate-50 transition-colors" title={`Ver casais — ${label}`}>
        {inner}
      </button>
    )
  }
  return <div className="flex items-center gap-2 text-xs">{inner}</div>
}

// ─── NOVO Onda 5: Qualidade da fonte ───────────────────────────────────────
function QualidadeFonte({ data, onOrigemClick, onCampanhaClick }: { data: WwMarketingQualidade; onOrigemClick?: (origem: string) => void; onCampanhaClick?: (campaign: string) => void }) {
  const topLiftCampanhas = [...(data.por_campaign ?? [])]
    .filter(c => c.lift_vs_geral !== null && c.lift_vs_geral >= 1.5 && c.leads >= 3)
    .sort((a, b) => (b.lift_vs_geral ?? 0) - (a.lift_vs_geral ?? 0))
    .slice(0, 8)

  return (
    <>
      <SectionCard
        title="🔬 Qualidade da fonte"
        subtitle="Pra cada origem: % qualif (chegou em closer), % fech (virou venda), ticket, e qualidade do dado (email/telefone). Clique pra ver os casais."
      >
        {data.por_origem.length === 0 ? <EmptyState message="Sem dados de origem com amostra suficiente" /> : (
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Origem</th>
                  <th className="px-3 py-2 text-right font-medium">Leads</th>
                  <th className="px-3 py-2 text-right font-medium">Qualif.</th>
                  <th className="px-3 py-2 text-right font-medium">Taxa qualif.</th>
                  <th className="px-3 py-2 text-right font-medium">Fechou</th>
                  <th className="px-3 py-2 text-right font-medium">Taxa fech.</th>
                  <th className="px-3 py-2 text-center font-medium">Lift</th>
                  <th className="px-3 py-2 text-right font-medium">Ticket médio</th>
                  <th className="px-3 py-2 text-right font-medium">% email</th>
                  <th className="px-3 py-2 text-right font-medium">% tel</th>
                </tr>
              </thead>
              <tbody>
                {data.por_origem.map(r => {
                  const cells = (
                    <>
                      <td className="px-3 py-2 text-slate-900 font-medium">{r.origem}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatNumber(r.leads_total)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatNumber(r.qualificados)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-600">{r.taxa_qualif_pct ?? 0}%</td>
                      <td className="px-3 py-2 text-right tabular-nums text-emerald-700 font-medium">{formatNumber(r.fechados)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-emerald-600">{r.taxa_fechamento_pct ?? 0}%</td>
                      <td className="px-3 py-2 text-center"><LiftBadge lift={r.lift_vs_geral} size="sm" showDelta={false} /></td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.ticket_medio ? formatCurrency(r.ticket_medio) : '—'}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        <span className={(r.pct_email_valido ?? 0) >= 80 ? 'text-emerald-700' : (r.pct_email_valido ?? 0) >= 50 ? 'text-amber-700' : 'text-rose-700'}>
                          {r.pct_email_valido ?? 0}%
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        <span className={(r.pct_tel_valido ?? 0) >= 80 ? 'text-emerald-700' : (r.pct_tel_valido ?? 0) >= 50 ? 'text-amber-700' : 'text-rose-700'}>
                          {r.pct_tel_valido ?? 0}%
                        </span>
                      </td>
                    </>
                  )
                  return onOrigemClick ? (
                    <ClickableRow key={r.origem} onClick={() => onOrigemClick(r.origem)} className="border-t border-slate-100" title={`Ver casais — ${r.origem}`}>
                      {cells}
                    </ClickableRow>
                  ) : <tr key={r.origem} className="border-t border-slate-100">{cells}</tr>
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {topLiftCampanhas.length > 0 && (
        <SectionCard
          title="🚀 Campanhas que fecham MAIS que a média"
          subtitle="Lift > 1.5x e pelo menos 3 leads. Clique pra abrir os casais."
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {topLiftCampanhas.map((c, i) => (
              <button
                key={`${c.origem}-${c.campaign}-${i}`}
                onClick={onCampanhaClick ? () => onCampanhaClick(c.campaign) : undefined}
                className="p-3 border border-emerald-200 bg-emerald-50/40 rounded-lg hover:bg-emerald-50 cursor-pointer text-left transition"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs uppercase tracking-wide text-slate-500 truncate">{c.origem} · {c.medium}</div>
                    <div className="text-sm font-medium text-slate-900 truncate" title={c.campaign}>{c.campaign}</div>
                  </div>
                  <LiftBadge lift={c.lift_vs_geral} size="md" showDelta={true} />
                </div>
                <div className="mt-2 text-[11px] text-slate-600 tabular-nums">
                  {c.leads} leads · {c.qualif} qualif · <strong className="text-emerald-700">{c.fechou} fechou ({c.taxa_fech_pct ?? 0}%)</strong>
                  {c.ticket_medio && <span className="ml-1 text-slate-400">· ticket {formatCurrency(c.ticket_medio)}</span>}
                </div>
              </button>
            ))}
          </div>
        </SectionCard>
      )}
    </>
  )
}

function DropOffPorFase({ data, onOrigemClick }: { data: WwMarketingQualidade; onOrigemClick?: (origem: string) => void }) {
  if (!data.dropoff_por_origem || data.dropoff_por_origem.length === 0) return null
  return (
    <SectionCard
      title="📊 Drop-off por fase (em cada origem)"
      subtitle="Em qual fase do funil cada origem mais perde leads. Ajuda a saber qual fonte traz lead que abandona rápido vs vai longe."
    >
      <div className="border border-slate-200 rounded-lg overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Origem</th>
              <th className="px-3 py-2 text-right font-medium">Entrou</th>
              <th className="px-3 py-2 text-right font-medium">Passou SDR</th>
              <th className="px-3 py-2 text-right font-medium">Drop SDR</th>
              <th className="px-3 py-2 text-right font-medium">Chegou Closer</th>
              <th className="px-3 py-2 text-right font-medium">Drop Closer</th>
              <th className="px-3 py-2 text-right font-medium">Fechou</th>
              <th className="px-3 py-2 text-right font-medium">Drop fech.</th>
            </tr>
          </thead>
          <tbody>
            {data.dropoff_por_origem.map(d => {
              const cells = (
                <>
                  <td className="px-3 py-2 text-slate-900 font-medium">{d.origem}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatNumber(d.entrada)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatNumber(d.sdr)}</td>
                  <td className="px-3 py-2 text-right">
                    <DropBadge pct={d.drop_entrada_sdr} />
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatNumber(d.closer)}</td>
                  <td className="px-3 py-2 text-right">
                    <DropBadge pct={d.drop_sdr_closer} />
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-emerald-700 font-medium">{formatNumber(d.fechado)}</td>
                  <td className="px-3 py-2 text-right">
                    <DropBadge pct={d.drop_closer_fechado} />
                  </td>
                </>
              )
              return onOrigemClick ? (
                <ClickableRow key={d.origem} onClick={() => onOrigemClick(d.origem)} className="border-t border-slate-100" title={`Ver casais — ${d.origem}`}>
                  {cells}
                </ClickableRow>
              ) : <tr key={d.origem} className="border-t border-slate-100">{cells}</tr>
            })}
          </tbody>
        </table>
      </div>
    </SectionCard>
  )
}

function DropBadge({ pct }: { pct: number | null }) {
  if (pct === null || pct === undefined) return <span className="text-slate-300">—</span>
  const cor = pct >= 80 ? 'bg-rose-100 text-rose-800' : pct >= 50 ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'
  return <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium tabular-nums ${cor}`}>-{pct}%</span>
}
