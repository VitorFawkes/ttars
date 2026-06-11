import { useState } from 'react'
import { useWw2Overview, type Ww2Conversao, type DrillMarco } from '@/hooks/analyticsWeddings/useWw2'
import { FilterBar, type TabProps, type AppliedFilters } from '../components/FilterBar'
import { SectionCard, KpiCard, EmptyState, LoadingSkeleton, ErrorBanner } from '../components/ui'
import { DrillDrawer, type DrillContext } from '../components/DrillDrawer'
import { SerieTemporalChart } from '../components/SerieTemporalChart'
import { formatCurrency, formatNumber } from '../lib/format'

// Etapas do funil (ordem da RPC ww2_overview 'conversoes') → marco do drill
const ETAPA_MARCO: Record<number, DrillMarco> = {
  1: 'entrou', 2: 'marcou_sdr', 3: 'fez_sdr', 4: 'marcou_closer', 5: 'fez_closer', 6: 'ganho',
}
const MARCO_TITULO: Record<string, string> = {
  entrou: 'Leads',
  marcou_sdr: 'Marcou 1ª reunião',
  fez_sdr: 'Fez 1ª reunião',
  marcou_closer: 'Marcou closer',
  fez_closer: 'Fez reunião closer',
  ganho: 'Vendas',
}

export function VisaoGeral({ filters, onFiltersChange }: TabProps) {
  return (
    <div className="space-y-4">
      {/* Pergunta da aba: "como estamos?" — corta por período/modo, tipo, origem, perfil
          (faixa/convidados/destino), consultor e COMO as reuniões aconteceram (canal SDR/Closer) */}
      <FilterBar value={filters} onChange={onFiltersChange} show={['period', 'dateMode', 'tipo', 'origem', 'faixa', 'convidados', 'destino', 'consultor', 'canal_sdr', 'canal_closer']} />
      <VisaoGeralContent filters={filters} />
    </div>
  )
}

function VisaoGeralContent({ filters }: { filters: AppliedFilters }) {
  const { data, isLoading, error } = useWw2Overview(filters)
  const [drill, setDrill] = useState<DrillContext | null>(null)

  if (isLoading) return <LoadingSkeleton rows={6} />
  if (error) return <ErrorBanner error={error as Error} />
  if (!data || data.error) return <EmptyState message={data?.error ?? 'Sem dados'} />

  const { kpis, funnel, conversoes, alertas } = data

  // Funil: agregar por fase, separar Resolução
  const byPhase = funnel.reduce((acc, f) => {
    const k = f.phase_label
    if (!acc[k]) acc[k] = { phase: k, leads: 0, order: f.phase_order ?? 999, slug: f.phase_slug }
    acc[k].leads += f.leads_count
    return acc
  }, {} as Record<string, { phase: string; leads: number; order: number; slug: string }>)
  const phasesData = Object.values(byPhase).sort((a, b) => a.order - b.order)
  const activePhases = phasesData.filter(p => !/resolu/i.test(p.phase))
  const resolutionLeads = phasesData.find(p => /resolu/i.test(p.phase))?.leads ?? 0

  const openDrill = (ctx: DrillContext) => setDrill(ctx)
  // Auditoria 2026-06-11: o drill respeita o MESMO recorte dos números clicados (todos os chips)
  const baseCtx = {
    dateStart: filters.dateStart, dateEnd: filters.dateEnd, dateMode: filters.dateMode,
    origins: filters.origins, faixas: filters.faixas, destinos: filters.destinos,
    convidadosList: filters.convidados, tipos: filters.tipos, consultorIds: filters.consultorIds,
    canalSdr: filters.canalSdr, canalCloser: filters.canalCloser,
  }
  // Tendência: janela de 12 meses terminando no fim do período do filtro (trend precisa de range longo)
  const trend12Start = new Date(new Date(filters.dateEnd).getTime() - 365 * 24 * 60 * 60 * 1000).toISOString()

  return (
    <div className="space-y-5">
      {/* KPIs com comparação */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard
          label={`Leads ${kpis.mode === 'cohort' ? 'criados' : 'movimentados'}`}
          value={formatNumber(kpis.leads)}
          prevValue={kpis.leads_prev}
          hint={`Período anterior: ${formatNumber(kpis.leads_prev)}`}
          onClick={() => openDrill({ ...baseCtx, marco: 'entrou', title: 'Leads criados no período' })}
        />
        <KpiCard
          label="Reuniões SDR feitas"
          value={formatNumber(kpis.reunioes)}
          prevValue={kpis.reunioes_prev}
          hint={`Anterior: ${formatNumber(kpis.reunioes_prev)}`}
          onClick={() => openDrill({ ...baseCtx, marco: 'fez_sdr', title: 'Casais que fizeram a 1ª reunião' })}
        />
        <KpiCard
          label="Marcou reunião Closer"
          value={formatNumber(kpis.propostas)}
          prevValue={kpis.propostas_prev}
          hint={`Anterior: ${formatNumber(kpis.propostas_prev)}`}
          onClick={() => openDrill({ ...baseCtx, marco: 'marcou_closer', title: 'Casais que marcaram reunião com a closer' })}
        />
        <KpiCard
          label="Casamentos fechados"
          value={formatNumber(kpis.fechados)}
          prevValue={kpis.fechados_prev}
          hint={kpis.ticket_medio ? `Ticket médio: ${formatCurrency(kpis.ticket_medio)}` : `Anterior: ${formatNumber(kpis.fechados_prev)}`}
          onClick={() => openDrill({ ...baseCtx, marco: 'ganho', title: 'Casamentos fechados' })}
        />
      </div>

      {/* Tendência ao longo do tempo (#7) — vendas/reuniões/leads por período */}
      <SerieTemporalChart
        title="📈 Ao longo do tempo — leads, reuniões e vendas"
        subtitle="Últimos 12 meses. Quantos entraram, fizeram reunião e fecharam em cada período. Troque mês/semana e quantidade/conversão. Clique numa barra pra ver os casais."
        dateStart={trend12Start}
        dateEnd={filters.dateEnd}
        dateMode={filters.dateMode}
        origins={filters.origins}
        faixas={filters.faixas}
        destinos={filters.destinos}
        convidados={filters.convidados}
        consultorIds={filters.consultorIds}
        tipos={filters.tipos}
        canalSdr={filters.canalSdr}
        canalCloser={filters.canalCloser}
        onPointClick={(p, marco, janela) => openDrill({
          ...baseCtx,
          dateStart: janela.dateStart,
          dateEnd: janela.dateEnd,
          marco,
          title: `${MARCO_TITULO[marco]} — ${p.label}`,
        })}
      />

      {/* Funil etapa a etapa (a estrela) + onde os leads estão agora (estoque por fase) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <SectionCard
          className="lg:col-span-2"
          title="Funil de vendas — etapa por etapa"
          subtitle={filters.dateMode === 'cohort'
            ? 'Dos leads que chegaram no período, até onde cada um foi (mesmo que depois). A % é a passagem da etapa anterior. Clique numa etapa pra ver os casais.'
            : 'O que aconteceu dentro do período, etapa a etapa. A % é a passagem da etapa anterior. Clique numa etapa pra ver os casais.'}
        >
          {conversoes.length === 0 ? <EmptyState message="Sem dados" /> : (
            <FunilEtapas
              conversoes={conversoes}
              onEtapaClick={(c) => {
                const marco = ETAPA_MARCO[c.phase_order]
                if (marco) openDrill({ ...baseCtx, marco, title: `${c.phase_label} — casais da etapa` })
              }}
            />
          )}
        </SectionCard>

        <SectionCard
          title="Onde estão agora — por fase"
          subtitle={resolutionLeads > 0
            ? `Posição atual dos leads do recorte. ${formatNumber(resolutionLeads)} em Resolução (perdidos/cancelados) fora da lista. Clique pra ver os casais.`
            : 'Posição atual dos leads do recorte. Clique pra ver os casais.'}
        >
          {activePhases.length === 0 ? <EmptyState message="Nenhum lead nas fases ativas pra esse filtro." /> : (
            <div className="space-y-2">
              {(() => {
                const maxFase = Math.max(1, ...activePhases.map(p => p.leads))
                return activePhases.map(p => (
                  <button
                    key={p.phase}
                    onClick={() => openDrill({ ...baseCtx, phaseSlug: p.slug, title: `Leads na fase ${p.phase}` })}
                    className="w-full text-left group"
                    title={`Ver casais — ${p.phase}`}
                  >
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="text-slate-700 group-hover:text-ww-gold-ink transition-colors">{p.phase}</span>
                      <span className="text-slate-900 font-semibold tabular-nums">{formatNumber(p.leads)}</span>
                    </div>
                    <div className="h-2.5 bg-ww-cream rounded-full overflow-hidden">
                      <div className="h-full bg-ww-gold rounded-full group-hover:bg-ww-gold-ink transition-colors" style={{ width: `${(p.leads / maxFase) * 100}%` }} />
                    </div>
                  </button>
                ))
              })()}
            </div>
          )}
        </SectionCard>
      </div>

      {/* Alertas */}
      <SectionCard title="⚠️ Alertas — leads parados há mais de 7 dias" subtitle="Top 8 por dias parados. Clique pra abrir o card.">
        {alertas.length === 0 ? (
          <EmptyState message="Nenhum lead parado. Tudo fluindo." />
        ) : (
          <table className="w-full text-xs">
            <thead className="text-slate-500">
              <tr>
                <th className="py-2 font-medium text-left">Card</th>
                <th className="py-2 font-medium text-left">Etapa</th>
                <th className="py-2 font-medium text-left">Fase</th>
                <th className="py-2 font-medium text-right">Valor</th>
                <th className="py-2 font-medium text-right">Parado há</th>
              </tr>
            </thead>
            <tbody>
              {alertas.map(a => (
                <tr key={a.card_id} className="border-t border-slate-100 hover:bg-ww-cream/40 transition-colors">
                  <td className="py-2">
                    <a href={`/cards/${a.card_id}`} className="text-indigo-700 hover:underline font-medium">{a.titulo.slice(0, 60)}{a.titulo.length > 60 ? '…' : ''}</a>
                  </td>
                  <td className="py-2 text-slate-700">{a.stage_name}</td>
                  <td className="py-2 text-slate-500">{a.phase_label}</td>
                  <td className="py-2 text-right tabular-nums text-slate-700">{a.valor_estimado ? formatCurrency(a.valor_estimado) : '—'}</td>
                  <td className="py-2 text-right">
                    <span className={`tabular-nums font-medium ${a.dias_parado > 14 ? 'text-rose-600' : 'text-amber-600'}`}>{a.dias_parado}d</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </SectionCard>

      <DrillDrawer ctx={drill} onClose={() => setDrill(null)} />
    </div>
  )
}

// Funil de marcos de venda (Entrou → Marcou/Fez 1ª reunião → Marcou/Fez closer → Ganhou).
// Barra = % do total que chegou na etapa; badge = passagem da etapa anterior, com a MESMA
// régua semântica do Funil comparado (verde = passa bem, vermelho = trava).
function corPassagem(p: number | null): string {
  if (p == null) return 'bg-slate-100 text-slate-400'
  if (p >= 60) return 'bg-emerald-100 text-emerald-800'
  if (p >= 45) return 'bg-emerald-50 text-emerald-700'
  if (p >= 25) return 'bg-amber-50 text-amber-700'
  return 'bg-rose-50 text-rose-600'
}

function FunilEtapas({ conversoes, onEtapaClick }: { conversoes: Ww2Conversao[]; onEtapaClick?: (c: Ww2Conversao) => void }) {
  const base = conversoes[0]?.leads ?? 0
  if (base === 0) return <EmptyState message="Nenhum lead no recorte" />
  return (
    <div className="space-y-1.5">
      {/* cabeçalho das colunas */}
      <div className="flex items-center gap-3 pb-1">
        <span className="w-36 shrink-0" />
        <span className="flex-1" />
        <span className="w-16 shrink-0 text-right text-[10px] uppercase tracking-wide text-slate-400">pessoas</span>
        <span className="w-16 shrink-0 text-right text-[10px] uppercase tracking-wide text-slate-400">passagem</span>
      </div>
      {conversoes.map((c, idx) => {
        const pctDoTopo = base > 0 ? (c.leads / base) * 100 : 0
        return (
          <button
            key={c.phase_label}
            onClick={onEtapaClick ? () => onEtapaClick(c) : undefined}
            disabled={!onEtapaClick}
            className={`w-full flex items-center gap-3 py-1 text-left rounded ${onEtapaClick ? 'group cursor-pointer hover:bg-ww-cream/40 transition-colors' : ''}`}
            title={onEtapaClick ? `Ver casais — ${c.phase_label}` : undefined}
          >
            <span className="w-36 shrink-0 text-sm text-slate-700 truncate group-hover:text-ww-gold-ink transition-colors" title={c.phase_label}>{c.phase_label}</span>
            <div className="flex-1 h-5 bg-ww-cream/70 rounded overflow-hidden" title={`${formatNumber(c.leads)} de ${formatNumber(base)} (${Math.round(pctDoTopo)}% do total)`}>
              <div
                className={`h-full rounded ${idx === 0 ? 'bg-ww-gold' : 'bg-ww-gold/80'} group-hover:bg-ww-gold-ink transition-colors`}
                style={{ width: `${Math.max(1.5, pctDoTopo)}%` }}
              />
            </div>
            <span className="w-16 shrink-0 text-right text-sm font-semibold text-slate-900 tabular-nums">{formatNumber(c.leads)}</span>
            <span className="w-16 shrink-0 text-right">
              {idx === 0 ? (
                <span className="text-[11px] text-slate-400">base</span>
              ) : (
                <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-medium tabular-nums ${corPassagem(c.taxa_vs_anterior)}`}>
                  {c.taxa_vs_anterior != null ? `${c.taxa_vs_anterior}%` : '—'}
                </span>
              )}
            </span>
          </button>
        )
      })}
      <p className="text-[11px] text-slate-400 pt-2 border-t border-slate-100">
        Barra = quanto do total chega à etapa · <span className="text-emerald-700">verde</span> = passagem boa, <span className="text-rose-600">vermelho</span> = etapa que trava.
      </p>
    </div>
  )
}
