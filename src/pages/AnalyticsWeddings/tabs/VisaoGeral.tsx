import { useState } from 'react'
import { Link } from 'react-router-dom'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { useWw2Overview, useWwAgenda, type Ww2Conversao, type DrillMarco, type WwAgendaItem, type WwAgendaPorDia, type WwAgendaDesfechos, type WwAgendaDesfechoItem } from '@/hooks/analyticsWeddings/useWw2'
import { FilterBar, type TabProps, type AppliedFilters } from '../components/FilterBar'
import { SectionCard, KpiCard, EmptyState, LoadingSkeleton, ErrorBanner } from '../components/ui'
import { DrillDrawer, type DrillContext } from '../components/DrillDrawer'
import { SerieTemporalChart } from '../components/SerieTemporalChart'
import { OpenInACButton } from '../components/OpenInACButton'
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

// No modo atividade as reuniões contam pela DATA da reunião dentro do período —
// os rótulos respondem direto "quantas marcaram × quantas aconteceram" (comparecimento).
const ROTULO_ATIVIDADE: Record<number, string> = {
  1: 'Entrou',
  2: '1ª reunião marcada',
  3: '1ª reunião aconteceu',
  4: 'Reunião closer marcada',
  5: 'Reunião closer aconteceu',
  6: 'Ganhou',
}

export function VisaoGeral({ filters, onFiltersChange }: TabProps) {
  return (
    <div className="space-y-4">
      {/* Pergunta da aba: "como estamos?" — corta por período/modo, tipo, origem, perfil
          (faixa/convidados/destino), consultor e COMO as reuniões aconteceram (canal SDR/Closer) */}
      <FilterBar value={filters} onChange={onFiltersChange} show={['period', 'dateMode', 'status', 'tipo', 'origem', 'faixa', 'convidados', 'destino', 'consultor', 'canal_sdr', 'canal_closer']} />
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

  // "Onde estão agora" (v9): cada linha do funnel é uma ETAPA real ("SDR · Lead", "Closer · Negociação"…).
  // Agrupa por macro (phase_slug = sdr/closer), tira o prefixo do rótulo e ordena pela ordem do funil.
  const semPrefixo = (s: string) => s.replace(/^(SDR|Closer)\s*·\s*/i, '')
  const macroMap = new Map<string, { slug: string; total: number; stages: { slug: string; label: string; n: number; order: number }[] }>()
  for (const f of funnel) {
    if (f.phase_slug !== 'sdr' && f.phase_slug !== 'closer') continue
    let m = macroMap.get(f.phase_slug)
    if (!m) { m = { slug: f.phase_slug, total: 0, stages: [] }; macroMap.set(f.phase_slug, m) }
    m.total += f.leads_count
    m.stages.push({ slug: f.stage_slug, label: semPrefixo(f.stage_name), n: f.leads_count, order: f.stage_order ?? 0 })
  }
  const MACRO_META: Record<string, { nome: string; sub: string; barra: string; ponto: string; texto: string }> = {
    sdr:    { nome: 'SDR',    sub: 'Pré-venda',  barra: 'bg-ww-gold',     ponto: 'bg-ww-gold',     texto: 'text-ww-gold-ink' },
    closer: { nome: 'Closer', sub: 'Fechamento', barra: 'bg-ww-rosewood', ponto: 'bg-ww-rosewood', texto: 'text-ww-rosewood' },
  }
  const macros = (['sdr', 'closer'] as const)
    .map(slug => macroMap.get(slug))
    .filter((m): m is NonNullable<typeof m> => !!m)
    .map(m => ({ ...m, ...MACRO_META[m.slug], stages: [...m.stages].sort((a, b) => a.order - b.order) }))
  const totalAtivos = macros.reduce((s, m) => s + m.total, 0)

  const openDrill = (ctx: DrillContext) => setDrill(ctx)
  // Auditoria 2026-06-11: o drill respeita o MESMO recorte dos números clicados (todos os chips)
  const baseCtx = {
    dateStart: filters.dateStart, dateEnd: filters.dateEnd, dateMode: filters.dateMode,
    origins: filters.origins, faixas: filters.faixas, destinos: filters.destinos,
    convidadosList: filters.convidados, tipos: filters.tipos, consultorIds: filters.consultorIds,
    canalSdr: filters.canalSdr, canalCloser: filters.canalCloser, statusLead: filters.statusLead,
  }

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

      {/* Agenda — o FUTURO: reuniões marcadas (campo 6 = SDR, campo 18 = Closer) + vencidas sem registro */}
      <AgendaReunioes filters={filters} />

      {/* Tendência ao longo do tempo (#7) — vendas/reuniões/leads no período do filtro */}
      <SerieTemporalChart
        title="📈 Ao longo do tempo: o funil completo"
        subtitle="Leads, reuniões marcadas e feitas (SDR e Closer) e vendas em cada período do recorte. Troque mês/semana e quantidade/conversão. Clique numa barra pra ver os casais."
        dateStart={filters.dateStart}
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
        statusLead={filters.statusLead}
        onPointClick={(p, marco, janela) => openDrill({
          ...baseCtx,
          dateStart: janela.dateStart,
          dateEnd: janela.dateEnd,
          marco,
          title: `${MARCO_TITULO[marco]}: ${p.label}`,
        })}
      />

      {/* Funil etapa a etapa (a estrela) + onde os leads estão agora (estoque por fase) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <SectionCard
          className="lg:col-span-2"
          title="Funil de vendas: etapa por etapa"
          subtitle={filters.dateMode === 'cohort'
            ? 'Dos leads que chegaram no período, até onde cada um foi (mesmo que depois). A % é a passagem da etapa anterior. Clique numa etapa pra ver os casais.'
            : 'O que aconteceu no período, reuniões contam pela DATA da reunião. A % entre "marcada" e "aconteceu" é o comparecimento. Clique numa etapa pra ver os casais.'}
        >
          {conversoes.length === 0 ? <EmptyState message="Sem dados" /> : (
            <FunilEtapas
              conversoes={filters.dateMode === 'throughput'
                ? conversoes.map(c => ({ ...c, phase_label: ROTULO_ATIVIDADE[c.phase_order] ?? c.phase_label }))
                : conversoes}
              onEtapaClick={(c) => {
                const marco = ETAPA_MARCO[c.phase_order]
                if (marco) openDrill({ ...baseCtx, marco, title: `${c.phase_label}: casais da etapa` })
              }}
            />
          )}
        </SectionCard>

        <SectionCard
          title="Onde estão agora"
          subtitle="Casais em aberto, na etapa em que estão hoje. Fechados e perdidos saem, já estão nos números do topo. Clique numa etapa pra ver os casais."
        >
          {totalAtivos === 0 ? <EmptyState message="Nenhum casal em aberto pra esse filtro." /> : (
            <div className="space-y-5">
              {macros.map(m => {
                // Barras com escala POR macro (SDR costuma ter muito mais que Closer — escala global
                // esconderia a distribuição interna). Os números absolutos preservam a magnitude.
                const maxStage = Math.max(1, ...m.stages.map(s => s.n))
                return (
                  <div key={m.slug}>
                    <div className="flex items-center gap-2 mb-2.5">
                      <span className={`w-2 h-2 rounded-full ${m.ponto}`} />
                      <span className={`text-sm font-semibold tracking-tight ${m.texto}`}>{m.nome}</span>
                      <span className="text-[11px] uppercase tracking-wide text-ww-n400">{m.sub}</span>
                      <span className="flex-1 border-t border-dashed border-ww-sand/70" />
                      <span className="text-xs text-slate-500 tabular-nums"><span className="font-semibold text-slate-700">{formatNumber(m.total)}</span> {m.total === 1 ? 'casal' : 'casais'}</span>
                    </div>
                    <div className="space-y-2 pl-4">
                      {m.stages.map(s => (
                        <button
                          key={s.slug}
                          onClick={() => openDrill({ ...baseCtx, phaseSlug: s.slug, title: `${m.nome} · ${s.label}` })}
                          className="w-full text-left group"
                          title={`Ver casais: ${m.nome} · ${s.label}`}
                        >
                          <div className="flex items-center justify-between text-sm mb-1">
                            <span className="text-slate-600 group-hover:text-slate-900 transition-colors">{s.label}</span>
                            <span className="text-slate-900 font-semibold tabular-nums">{formatNumber(s.n)}</span>
                          </div>
                          <div className="h-1.5 bg-ww-cream rounded-full overflow-hidden">
                            <div className={`h-full ${m.barra} rounded-full opacity-85 group-hover:opacity-100 transition-opacity`} style={{ width: `${s.n > 0 ? Math.max(4, (s.n / maxStage) * 100) : 0}%` }} />
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </SectionCard>
      </div>

      {/* Alertas */}
      <SectionCard title="⚠️ Alertas: leads parados há mais de 7 dias" subtitle="Top 8 por dias parados. Clique pra abrir o card.">
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
                <th className="py-2 font-medium text-right">Active</th>
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
                  <td className="py-2 text-right">
                    <div className="inline-flex justify-end"><OpenInACButton dealId={a.ac_deal_id} contactName={a.titulo} /></div>
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

// ── Agenda de reuniões — próximos dias + vencidas sem registro ──────────────
const TZ = 'America/Sao_Paulo'
const diaLabel = (iso: string): string => {
  const d = new Date(iso)
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0)
  const amanha = new Date(hoje); amanha.setDate(amanha.getDate() + 1)
  const dia = new Date(d); dia.setHours(0, 0, 0, 0)
  if (dia.getTime() === hoje.getTime()) return 'Hoje'
  if (dia.getTime() === amanha.getTime()) return 'Amanhã'
  return d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', timeZone: TZ })
}
const horaLabel = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: TZ })

function ReuniaoChip({ reuniao }: { reuniao: 'sdr' | 'closer' }) {
  return reuniao === 'sdr'
    ? <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide bg-ww-gold-soft text-ww-gold-ink">SDR</span>
    : <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide bg-ww-rosewood/10 text-ww-rosewood">Closer</span>
}

function AgendaLinha({ it, extra, mostrarDia = false }: { it: WwAgendaItem; extra?: React.ReactNode; mostrarDia?: boolean }) {
  const nome = (it.casal ?? 'Casal sem nome').replace(/^(DW|EW|Elopement)\s*\|\s*/i, '')
  const dataTxt = new Date(it.quando).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: TZ })
  return (
    <div className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-ww-cream/50 transition-colors">
      {mostrarDia ? (
        <span className="w-12 sm:w-[88px] shrink-0 text-xs tabular-nums text-ww-n600 font-medium">
          {dataTxt}<span className="hidden sm:inline"> {horaLabel(it.quando)}</span>
        </span>
      ) : (
        <span className="w-12 shrink-0 text-xs tabular-nums text-ww-n600 font-medium">{horaLabel(it.quando)}</span>
      )}
      <ReuniaoChip reuniao={it.reuniao} />
      {it.card_id
        ? <Link to={`/cards/${it.card_id}`} className="flex-1 min-w-0 truncate text-sm text-slate-800 hover:text-ww-gold-ink hover:underline" title={it.casal ?? ''}>{nome}</Link>
        : <span className="flex-1 min-w-0 truncate text-sm text-slate-800" title={it.casal ?? ''}>{nome}</span>}
      {it.tipo && !mostrarDia && <span className="hidden sm:inline shrink-0 text-[10px] text-ww-n400">{it.tipo}</span>}
      {extra}
      <OpenInACButton dealId={it.ac_deal_id} contactName={it.casal} />
    </div>
  )
}

// chave YYYY-MM-DD do dia em Brasília (en-CA formata como ISO)
const diaKeyBRT = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: TZ })

// a lista mostra só 7 dias; a janela da RPC é maior (28d) pra alimentar o gráfico
const filtraProximos7d = (itens: WwAgendaItem[]) => {
  const corte = Date.now() + 7 * 86_400_000
  return itens.filter(p => new Date(p.quando).getTime() <= corte)
}

const COR_SDR = '#BD965C'    // mesmas cores da série temporal — legenda já ensinada
const COR_CLOSER = '#874B52'

function AgendaGrafico({ porDia }: { porDia: WwAgendaPorDia[] }) {
  const [escala, setEscala] = useState<'dia' | 'semana'>('dia')
  const mapa = new Map(porDia.map(d => [d.dia, d]))

  let rows: { label: string; SDR: number; Closer: number }[]
  if (escala === 'dia') {
    rows = Array.from({ length: 14 }, (_, i) => {
      const d = new Date(); d.setDate(d.getDate() + i)
      const key = diaKeyBRT(d)
      const v = mapa.get(key)
      const wd = d.toLocaleDateString('pt-BR', { weekday: 'short', timeZone: TZ }).replace('.', '')
      const dm = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: TZ })
      return { label: `${wd} ${dm.slice(0, 5)}`, SDR: v?.sdr ?? 0, Closer: v?.closer ?? 0 }
    })
  } else {
    const semanas = new Map<string, { label: string; SDR: number; Closer: number }>()
    for (let i = 0; i < 28; i++) {
      const d = new Date(); d.setDate(d.getDate() + i)
      const key = diaKeyBRT(d)
      const [y, m, dd] = key.split('-').map(Number)
      const local = new Date(y, m - 1, dd, 12)
      const seg = new Date(local); seg.setDate(seg.getDate() - ((seg.getDay() + 6) % 7))
      const segKey = `${seg.getFullYear()}-${String(seg.getMonth() + 1).padStart(2, '0')}-${String(seg.getDate()).padStart(2, '0')}`
      if (!semanas.has(segKey)) {
        const dom = new Date(seg); dom.setDate(dom.getDate() + 6)
        const fmt = (x: Date) => `${String(x.getDate()).padStart(2, '0')}/${String(x.getMonth() + 1).padStart(2, '0')}`
        semanas.set(segKey, { label: `${fmt(seg)}–${fmt(dom)}`, SDR: 0, Closer: 0 })
      }
      const v = mapa.get(key)
      if (v) { const s = semanas.get(segKey)!; s.SDR += v.sdr; s.Closer += v.closer }
    }
    rows = [...semanas.values()]
  }

  return (
    <div>
      <div className="flex items-center gap-1 mb-3">
        {(['dia', 'semana'] as const).map(e => (
          <button
            key={e}
            onClick={() => setEscala(e)}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${escala === e ? 'bg-ww-gold-soft text-ww-gold-ink' : 'text-ww-n500 hover:bg-ww-cream'}`}
          >
            {e === 'dia' ? 'Por dia (14 dias)' : 'Por semana (4 semanas)'}
          </button>
        ))}
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={rows} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis dataKey="label" stroke="#64748b" fontSize={10} tickLine={false} interval={0} angle={escala === 'dia' ? -38 : 0} textAnchor={escala === 'dia' ? 'end' : 'middle'} height={escala === 'dia' ? 46 : 24} />
          <YAxis stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
          <Tooltip contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12 }} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar dataKey="SDR" stackId="a" fill={COR_SDR} maxBarSize={28} />
          <Bar dataKey="Closer" stackId="a" fill={COR_CLOSER} radius={[3, 3, 0, 0]} maxBarSize={28} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

// rótulos/cores das categorias de desfecho (contagem usa plural, item usa singular)
const DESFECHO_CATS = [
  { conta: 'feitas', item: 'feita', label: 'Feitas', dot: 'bg-emerald-500' },
  { conta: 'nao_aconteceu', item: 'nao_aconteceu', label: 'Não aconteceu (registrado)', dot: 'bg-amber-500' },
  { conta: 'reagendando', item: 'reagendando', label: 'Em reagendamento', dot: 'bg-sky-500' },
  { conta: 'perdidas', item: 'perdida', label: 'Perdidas', dot: 'bg-rose-500' },
  { conta: 'sem_registro', item: 'sem_registro', label: 'Sem registro', dot: 'bg-slate-400' },
] as const

function DesfechosCard({ desfechos }: { desfechos: WwAgendaDesfechos }) {
  const pct = (n: number, base: number) => base > 0 ? `${Math.round((n / base) * 100)}%` : '—'
  const itens = desfechos.itens ?? []
  return (
    <div className="space-y-3">
      <table className="w-full text-xs">
        <thead className="text-slate-500">
          <tr>
            <th className="py-1.5 font-medium text-left">Desfecho</th>
            <th className="py-1.5 font-medium text-right">SDR</th>
            <th className="py-1.5 font-medium text-right">Closer</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-t border-slate-100">
            <td className="py-1.5 font-medium text-slate-700">Marcadas</td>
            <td className="py-1.5 text-right font-semibold tabular-nums">{desfechos.sdr.marcadas}</td>
            <td className="py-1.5 text-right font-semibold tabular-nums">{desfechos.closer.marcadas}</td>
          </tr>
          {DESFECHO_CATS.map(c => (
            <tr key={c.conta} className="border-t border-slate-100">
              <td className="py-1.5">
                <span className="inline-flex items-center gap-1.5 text-slate-700">
                  <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />{c.label}
                </span>
              </td>
              <td className="py-1.5 text-right tabular-nums">
                {desfechos.sdr[c.conta]}{c.conta === 'feitas' && <span className="text-ww-n400"> · {pct(desfechos.sdr.feitas, desfechos.sdr.marcadas)}</span>}
              </td>
              <td className="py-1.5 text-right tabular-nums">
                {desfechos.closer[c.conta]}{c.conta === 'feitas' && <span className="text-ww-n400"> · {pct(desfechos.closer.feitas, desfechos.closer.marcadas)}</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {DESFECHO_CATS.filter(c => c.conta !== 'feitas').map(c => {
        const lista = itens.filter(i => i.categoria === c.item)
        if (lista.length === 0) return null
        return (
          <details key={c.item} className="group">
            <summary className="cursor-pointer text-[11px] font-medium text-ww-n500 hover:text-ww-gold-ink transition-colors select-none">
              Ver {c.label.toLowerCase()} ({lista.length})
            </summary>
            <div className="mt-1 space-y-0.5">
              {lista.map(it => (
                <div key={`${it.ac_deal_id}-${it.reuniao}`}>
                  <AgendaLinha it={it} mostrarDia />
                  {it.motivo && <div className="pl-2 -mt-1 pb-1 text-[10px] text-ww-n400 truncate" title={it.motivo}>↳ {it.motivo}</div>}
                </div>
              ))}
            </div>
          </details>
        )
      })}
    </div>
  )
}

// Gráfico do desfecho das reuniões marcadas, semana a semana (mesmas cores/categorias da tabela).
const DESF_SERIES = [
  { key: 'feita', label: 'Feita', cor: '#10b981' },
  { key: 'nao_aconteceu', label: 'Não aconteceu', cor: '#f59e0b' },
  { key: 'reagendando', label: 'Em reagendamento', cor: '#0ea5e9' },
  { key: 'perdida', label: 'Perdida', cor: '#f43f5e' },
  { key: 'sem_registro', label: 'Sem registro', cor: '#94a3b8' },
] as const

function DesfechosGrafico({ itens }: { itens: WwAgendaDesfechoItem[] }) {
  // Bucketiza pela data da reunião em semanas (segunda→domingo, BRT) — mesma lógica do AgendaGrafico.
  const semanas = new Map<string, { ord: string; label: string; feita: number; nao_aconteceu: number; reagendando: number; perdida: number; sem_registro: number }>()
  for (const it of itens) {
    const key = diaKeyBRT(new Date(it.quando))
    const [y, m, dd] = key.split('-').map(Number)
    const local = new Date(y, m - 1, dd, 12)
    const seg = new Date(local); seg.setDate(seg.getDate() - ((seg.getDay() + 6) % 7))
    const segKey = `${seg.getFullYear()}-${String(seg.getMonth() + 1).padStart(2, '0')}-${String(seg.getDate()).padStart(2, '0')}`
    if (!semanas.has(segKey)) {
      const dom = new Date(seg); dom.setDate(dom.getDate() + 6)
      const fmt = (x: Date) => `${String(x.getDate()).padStart(2, '0')}/${String(x.getMonth() + 1).padStart(2, '0')}`
      semanas.set(segKey, { ord: segKey, label: `${fmt(seg)}–${fmt(dom)}`, feita: 0, nao_aconteceu: 0, reagendando: 0, perdida: 0, sem_registro: 0 })
    }
    const row = semanas.get(segKey)!
    if (it.categoria in row) (row as unknown as Record<string, number>)[it.categoria] += 1
  }
  const rows = [...semanas.values()].sort((a, b) => a.ord.localeCompare(b.ord))
  if (rows.length === 0) return <EmptyState message="Sem reuniões marcadas no período pra montar o gráfico." />
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={rows} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
        <XAxis dataKey="label" stroke="#64748b" fontSize={11} tickLine={false} />
        <YAxis stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
        <Tooltip contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12 }} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        {DESF_SERIES.map((s, i) => (
          <Bar key={s.key} dataKey={s.key} name={s.label} stackId="d" fill={s.cor} maxBarSize={56} radius={i === DESF_SERIES.length - 1 ? [3, 3, 0, 0] : undefined} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
}

function AgendaReunioes({ filters }: { filters: AppliedFilters }) {
  const { data, isLoading } = useWwAgenda({
    origins: filters.origins, tipos: filters.tipos, faixas: filters.faixas,
    destinos: filters.destinos, convidados: filters.convidados, consultorIds: filters.consultorIds,
  })
  if (isLoading) return <LoadingSkeleton rows={3} />
  if (!data || data.error) return null

  const proximas = filtraProximos7d(data.proximas ?? [])
  const pendentes = data.pendentes ?? []
  const hoje = proximas.filter(p => diaLabel(p.quando) === 'Hoje')
  const porDia = proximas.reduce((acc, p) => {
    const k = diaLabel(p.quando)
    ;(acc[k] = acc[k] ?? []).push(p)
    return acc
  }, {} as Record<string, WwAgendaItem[]>)

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <SectionCard
          className="lg:col-span-2"
          title="📅 Agenda de reuniões: próximos 7 dias"
          subtitle={`Reuniões marcadas no Active (1ª reunião do SDR e fechamento da Closer). Hoje: ${hoje.filter(p => p.reuniao === 'sdr').length} SDR · ${hoje.filter(p => p.reuniao === 'closer').length} Closer. Filtros de tipo de reunião não se aplicam aqui, a reunião ainda vai acontecer.`}
        >
          {proximas.length === 0 ? (
            <EmptyState message="Nenhuma reunião marcada para os próximos 7 dias." />
          ) : (
            <div className="space-y-3">
              {Object.entries(porDia).map(([dia, itens]) => (
                <div key={dia}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-xs font-semibold uppercase tracking-wide ${dia === 'Hoje' ? 'text-ww-gold-ink' : 'text-ww-n500'}`}>{dia}</span>
                    <span className="text-[11px] text-ww-n400 tabular-nums">{itens.length} reuni{itens.length === 1 ? 'ão' : 'ões'}</span>
                    <span className="flex-1 border-t border-ww-sand/60" />
                  </div>
                  <div className="space-y-0.5">
                    {itens.map(it => <AgendaLinha key={`${it.ac_deal_id}-${it.reuniao}`} it={it} />)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="⏰ Vencidas sem registro"
          subtitle="A data passou e ninguém registrou como foi nem moveu o casal. Cobre o registro ou remarque; sem isso a reunião não conta no placar."
        >
          {pendentes.length === 0 ? (
            <EmptyState message="Nada vencido, registros em dia." />
          ) : (
            <div className="space-y-0.5">
              {pendentes.map(it => (
                <AgendaLinha
                  key={`${it.ac_deal_id}-${it.reuniao}`}
                  it={it}
                  mostrarDia
                  extra={<span className="shrink-0 text-[11px] font-medium tabular-nums text-rose-600">{(it.dias_atraso ?? 0) === 0 ? 'hoje' : `${it.dias_atraso}d`}</span>}
                />
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <SectionCard
          className="lg:col-span-2"
          title="📆 Volume de reuniões marcadas: dias e semanas à frente"
          subtitle="Quantas reuniões já estão na agenda do time. Dia vazio = espaço pra agendar mais."
        >
          <AgendaGrafico porDia={data.por_dia ?? []} />
        </SectionCard>

        <SectionCard
          title={`🧭 Desfechos: últimos ${data.desfechos?.janela_dias ?? 30} dias`}
          subtitle="O que aconteceu com cada reunião marcada: feita, não aconteceu, em reagendamento, perdida ou ainda sem registro."
        >
          {data.desfechos ? <DesfechosCard desfechos={data.desfechos} /> : <EmptyState message="Sem reuniões marcadas no período." />}
        </SectionCard>
      </div>

      {(data.desfechos?.itens?.length ?? 0) > 0 && (
        <SectionCard
          title={`📊 Desfecho das reuniões ao longo do tempo: últimos ${data.desfechos?.janela_dias ?? 30} dias`}
          subtitle="Reuniões marcadas, semana a semana, pela cor do que aconteceu: feita, não aconteceu, em reagendamento, perdida ou ainda sem registro."
        >
          <DesfechosGrafico itens={data.desfechos?.itens ?? []} />
        </SectionCard>
      )}
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
            title={onEtapaClick ? `Ver casais: ${c.phase_label}` : undefined}
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
