import { useMemo } from 'react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import {
  Briefcase, Trophy, ListX, Clock, AlertTriangle, FileQuestion, PhoneOff,
  Activity, TrendingUp, Calendar, ExternalLink, Loader2, ArrowRight, X,
} from 'lucide-react'
import { usePlannerProfile, type PlannerProfile } from '@/hooks/analytics/usePlannerProfile'
import { usePlannerActivities, type PlannerActivity } from '@/hooks/analytics/usePlannerActivities'
import { useDrillDownStore } from '@/hooks/analytics/useAnalyticsDrillDown'
import { formatCurrency } from '@/utils/whatsappFormatters'
import { cn } from '@/lib/utils'

interface Props {
  planner: { id: string; nome: string } | null
  onClose: () => void
}

const ORIGEM_LABELS: Record<string, string> = {
  manual: 'Planner direto',
  whatsapp: 'WhatsApp (Julia)',
  active_campaign: 'Active Campaign',
  mkt: 'Marketing',
  indicacao: 'Indicação',
  carteira_propria: 'Carteira própria',
  carteira_wg: 'Carteira WG',
  sorrento: 'Sorrento',
  weddings: 'Weddings (cruzado)',
  sem_origem: 'Sem origem',
}

const PHASE_COLORS: Record<string, string> = {
  sdr: '#6366f1',
  planner: '#8b5cf6',
  pos_venda: '#10b981',
  resolucao: '#f97316',
}

function pct(v: number): string {
  return `${v.toFixed(0)}%`
}

function DeltaText({ value, suffix = '' }: { value: number; suffix?: string }) {
  if (Math.abs(value) < 0.1) return <span className="text-slate-400 text-xs">≈ time</span>
  const positive = value > 0
  return (
    <span className={cn('text-xs font-medium', positive ? 'text-emerald-600' : 'text-rose-600')}>
      {positive ? '+' : ''}{value.toFixed(1)}{suffix} vs time
    </span>
  )
}

function PhasePill({ phase, count }: { phase: string; count: number }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs"
      style={{ background: `${PHASE_COLORS[phase] ?? '#94a3b8'}15`, color: PHASE_COLORS[phase] ?? '#64748b' }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: PHASE_COLORS[phase] ?? '#94a3b8' }} />
      {phase} · {count}
    </span>
  )
}

function Stat({
  label,
  value,
  hint,
  onClick,
  tone = 'default',
}: {
  label: string
  value: string | number
  hint?: React.ReactNode
  onClick?: () => void
  tone?: 'default' | 'warn' | 'danger' | 'success'
}) {
  const valueColor =
    tone === 'danger' ? 'text-rose-700'
    : tone === 'warn' ? 'text-amber-700'
    : tone === 'success' ? 'text-emerald-700'
    : 'text-slate-900'
  const clickable = !!onClick
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!clickable}
      className={cn(
        'flex flex-col items-start gap-0.5 p-3 rounded-lg border border-slate-200 bg-white text-left transition-colors',
        clickable && 'hover:border-indigo-300 hover:bg-indigo-50/30 cursor-pointer',
      )}
    >
      <span className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">{label}</span>
      <span className={cn('text-xl font-bold tabular-nums', valueColor)}>{value}</span>
      {hint && <span className="text-xs text-slate-500 mt-0.5">{hint}</span>}
    </button>
  )
}

function ActivityRow({ activity, type }: { activity: PlannerActivity; type: 'vencidas' | 'hoje' | 'proximos_7d' }) {
  const dot =
    type === 'vencidas' ? 'bg-rose-500'
    : type === 'hoje' ? 'bg-amber-500'
    : 'bg-slate-300'

  const tempoLabel =
    type === 'vencidas' && activity.dias_atraso !== undefined
      ? `há ${activity.dias_atraso}d`
      : type === 'proximos_7d' && activity.dias_pra_vencer !== undefined
      ? `em ${activity.dias_pra_vencer}d`
      : null

  return (
    <a
      href={`/cards/${activity.card_id}`}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-slate-50 group"
    >
      <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', dot)} />
      <div className="flex-1 min-w-0">
        <p className="text-xs text-slate-900 font-medium truncate">{activity.titulo}</p>
        <p className="text-[10px] text-slate-500 truncate">{activity.card_titulo}</p>
      </div>
      {tempoLabel && (
        <span className={cn(
          'text-[10px] tabular-nums whitespace-nowrap',
          type === 'vencidas' ? 'text-rose-600 font-semibold' : 'text-slate-500',
        )}>
          {tempoLabel}
        </span>
      )}
      <ExternalLink className="w-3 h-3 text-slate-300 group-hover:text-indigo-500" />
    </a>
  )
}

function Section({ title, subtitle, children, action }: {
  title: string
  subtitle?: string
  children: React.ReactNode
  action?: React.ReactNode
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-3 border-b border-slate-100 pb-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
          {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

export default function PlannerProfileDrawer({ planner, onClose }: Props) {
  const profile = usePlannerProfile(planner?.id ?? null)
  const activities = usePlannerActivities(planner?.id ?? null)
  const drillDown = useDrillDownStore()

  const data: PlannerProfile | null = profile.data ?? null
  const isLoading = profile.isLoading

  const winRateDelta = useMemo(() => {
    if (!data) return 0
    return data.periodo.win_rate - data.periodo.win_rate_team
  }, [data])

  const diasGanhoDelta = useMemo(() => {
    if (!data) return 0
    return data.periodo.dias_ate_ganho - data.periodo.dias_ate_ganho_team
  }, [data])

  const pctPreenchimentoFaltando = useMemo(() => {
    if (!data || data.preenchimento.total_abertos === 0) return 0
    const semDados = data.preenchimento.sem_briefing + data.preenchimento.sem_contato
    return Math.round((semDados / data.preenchimento.total_abertos) * 100)
  }, [data])

  const openCardsBucket = (label: string, extra: Record<string, unknown> = {}) => {
    if (!planner) return
    drillDown.open({
      label,
      drillSource: 'current_stage',
      drillOwnerId: planner.id,
      ...extra,
    })
  }

  const openClosedDeals = () => {
    if (!planner) return
    drillDown.open({
      label: `Ganhos de ${planner.nome}`,
      drillSource: 'closed_deals',
      drillOwnerId: planner.id,
      drillPhase: 'planner',
    })
  }

  const openLostCards = (motivo?: string | null) => {
    if (!planner) return
    drillDown.open({
      label: motivo ? `Perdidos de ${planner.nome}: ${motivo}` : `Perdidos de ${planner.nome}`,
      drillSource: 'lost_deals',
      drillOwnerId: planner.id,
      drillStatus: 'perdido',
      drillLossReason: motivo ?? undefined,
    })
  }

  const openByStage = (stageId: string, stageNome: string) => {
    if (!planner) return
    drillDown.open({
      label: `${planner.nome} na etapa: ${stageNome}`,
      drillStageId: stageId,
      drillSource: 'current_stage',
      drillOwnerId: planner.id,
    })
  }

  return (
    <Sheet open={!!planner} onOpenChange={(open) => { if (!open) onClose() }}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto p-0">
        <SheetHeader className="px-6 py-4 border-b border-slate-200 sticky top-0 bg-white z-10">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <SheetTitle className="text-lg font-bold text-slate-900 truncate">
                {planner?.nome ?? 'Carregando…'}
              </SheetTitle>
              <SheetDescription className="text-xs text-slate-500 mt-1">
                {data?.header?.rank_position
                  ? `#${data.header.rank_position} no ranking de receita do time`
                  : 'Perfil do Travel Planner'}
              </SheetDescription>
            </div>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-700 p-1 -m-1"
              aria-label="Fechar"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </SheetHeader>

        <div className="px-6 py-6 space-y-8">
          {isLoading && (
            <div className="flex items-center justify-center py-12 text-slate-400">
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
              Carregando perfil…
            </div>
          )}

          {!isLoading && data && (
            <>
              {/* ─── BLOCO A: AGORA ─── */}
              <Section
                title="A. AGORA"
                subtitle="Snapshot do que está em mãos neste momento"
                action={<Activity className="w-4 h-4 text-slate-300" />}
              >
                <div className="grid grid-cols-2 gap-3">
                  <Stat
                    label="Cards abertos"
                    value={data.agora.cards_abertos}
                    onClick={() => openCardsBucket(`Cards abertos de ${planner?.nome}`)}
                    hint="Clique pra ver"
                  />
                  <Stat
                    label="Em risco"
                    value={data.agora.em_risco}
                    tone={data.agora.em_risco > 0 ? 'danger' : 'default'}
                    hint="Sem briefing, sem contato, parados >14d ou SLA violado"
                  />
                  <Stat
                    label="Atendimentos esta semana"
                    value={data.agora.atendimentos_semana}
                    hint={
                      data.agora.delta_semana > 0
                        ? <span className="text-emerald-600">+{data.agora.delta_semana} vs semana anterior</span>
                        : data.agora.delta_semana < 0
                        ? <span className="text-rose-600">{data.agora.delta_semana} vs semana anterior</span>
                        : <span className="text-slate-400">igual à semana anterior</span>
                    }
                  />
                  <Stat
                    label="Posição no ranking"
                    value={`#${data.header.rank_position}`}
                    hint="Por receita no período filtrado"
                  />
                </div>
                {data.agora.por_etapa.length > 0 && (
                  <div className="mt-3 space-y-1.5">
                    <p className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">Cards abertos por etapa</p>
                    <div className="space-y-1">
                      {data.agora.por_etapa.map(s => (
                        <button
                          key={s.stage_id}
                          onClick={() => openByStage(s.stage_id, s.stage_nome)}
                          className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-slate-50 text-left group"
                        >
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: PHASE_COLORS[s.phase_slug] ?? '#94a3b8' }} />
                          <span className="text-xs text-slate-700 group-hover:text-indigo-700 flex-1 truncate">{s.stage_nome}</span>
                          <PhasePill phase={s.phase_slug} count={s.qtd} />
                          <ArrowRight className="w-3 h-3 text-slate-300 group-hover:text-indigo-500" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </Section>

              {/* ─── BLOCO B: PERÍODO ─── */}
              <Section
                title="B. PERÍODO"
                subtitle="Performance no range filtrado, com comparativo do time"
                action={<TrendingUp className="w-4 h-4 text-slate-300" />}
              >
                <div className="grid grid-cols-2 gap-3">
                  <Stat
                    label="Ganhos"
                    value={data.periodo.ganhos}
                    tone="success"
                    onClick={openClosedDeals}
                    hint={`${formatCurrency(data.periodo.faturamento)} faturado`}
                  />
                  <Stat
                    label="Perdidos"
                    value={data.periodo.perdidos}
                    tone={data.periodo.perdidos > 0 ? 'danger' : 'default'}
                    onClick={() => openLostCards()}
                    hint={data.periodo.perdidos > 0 ? 'Clique pra ver motivos' : undefined}
                  />
                  <Stat
                    label="Win rate"
                    value={pct(data.periodo.win_rate)}
                    hint={<DeltaText value={winRateDelta} suffix="pp" />}
                  />
                  <Stat
                    label="Ticket médio"
                    value={data.periodo.ganhos > 0 ? formatCurrency(data.periodo.ticket_medio) : '—'}
                    hint={data.periodo.receita > 0 ? `Receita: ${formatCurrency(data.periodo.receita)}` : undefined}
                  />
                  <Stat
                    label="Tempo típico até ganho"
                    value={data.periodo.dias_ate_ganho > 0 ? `${data.periodo.dias_ate_ganho.toFixed(0)}d` : '—'}
                    hint={data.periodo.dias_ate_ganho > 0 ? <DeltaText value={diasGanhoDelta} suffix="d" /> : undefined}
                  />
                  <Stat
                    label="Quem mais demora pra ganhar"
                    value={data.periodo.dias_ate_ganho_pior > 0 ? `${data.periodo.dias_ate_ganho_pior.toFixed(0)}d` : '—'}
                    hint="Pior caso dos ganhos no período"
                  />
                </div>
                {data.periodo.dias_ate_perda > 0 && (
                  <p className="text-xs text-slate-500 mt-2">
                    Tempo típico até perda: <strong>{data.periodo.dias_ate_perda.toFixed(0)} dias</strong>
                  </p>
                )}
              </Section>

              {/* ─── BLOCO C: PREENCHIMENTO ─── */}
              <Section
                title="C. PREENCHIMENTO"
                subtitle={`Higiene dos ${data.preenchimento.total_abertos} cards abertos`}
                action={
                  pctPreenchimentoFaltando > 0
                    ? <span className="text-xs font-semibold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-md">
                        {pctPreenchimentoFaltando}% faltando dados
                      </span>
                    : <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md">
                        Tudo preenchido
                      </span>
                }
              >
                <div className="grid grid-cols-3 gap-3">
                  <Stat
                    label="Sem briefing"
                    value={data.preenchimento.sem_briefing}
                    tone={data.preenchimento.sem_briefing > 0 ? 'warn' : 'default'}
                    onClick={() => openCardsBucket(`${planner?.nome} — sem briefing`)}
                    hint={data.preenchimento.total_abertos > 0
                      ? `${Math.round(data.preenchimento.sem_briefing / data.preenchimento.total_abertos * 100)}% dos abertos`
                      : undefined}
                  />
                  <Stat
                    label="Sem contato"
                    value={data.preenchimento.sem_contato}
                    tone={data.preenchimento.sem_contato > 0 ? 'warn' : 'default'}
                    onClick={() => openCardsBucket(`${planner?.nome} — sem contato vinculado`)}
                  />
                  <Stat
                    label="Parados >14d"
                    value={data.preenchimento.parados_14d}
                    tone={data.preenchimento.parados_14d > 0 ? 'danger' : 'default'}
                    onClick={() => openCardsBucket(`${planner?.nome} — parados há mais de 14 dias`)}
                  />
                </div>
              </Section>

              {/* ─── BLOCO D: MOTIVOS DE PERDA ─── */}
              {data.motivos_perda.length > 0 && (
                <Section
                  title="D. MOTIVOS DE PERDA"
                  subtitle="Top 5 dela no período (não do time)"
                  action={<ListX className="w-4 h-4 text-slate-300" />}
                >
                  <div className="space-y-1">
                    {data.motivos_perda.map((m, idx) => (
                      <button
                        key={`${m.motivo}-${idx}`}
                        onClick={() => openLostCards(m.motivo)}
                        className="w-full flex items-center justify-between gap-3 px-2 py-1.5 rounded hover:bg-rose-50 text-left group"
                      >
                        <span className="text-xs text-slate-700 group-hover:text-rose-700 truncate flex-1">
                          {m.motivo ?? 'Sem motivo informado'}
                        </span>
                        <span className="text-xs font-semibold text-rose-700 tabular-nums">{m.qtd}</span>
                        <ArrowRight className="w-3 h-3 text-slate-300 group-hover:text-rose-500" />
                      </button>
                    ))}
                  </div>
                </Section>
              )}

              {/* ─── BLOCO E: ORIGEM + FORECAST ─── */}
              <Section
                title="E. ORIGEM + FORECAST"
                subtitle="De onde vêm os leads dela e o que ela prevê fechar"
                action={<Calendar className="w-4 h-4 text-slate-300" />}
              >
                {data.origens.length > 0 && (
                  <div className="space-y-1 mb-3">
                    <p className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">Origem dos leads no período</p>
                    {data.origens.slice(0, 5).map(o => (
                      <div key={o.origem} className="flex items-center gap-2 px-2 py-1 text-xs">
                        <span className="text-slate-700 flex-1 truncate">{ORIGEM_LABELS[o.origem] ?? o.origem}</span>
                        <div className="w-24 h-1.5 bg-slate-100 rounded overflow-hidden">
                          <div className="h-full bg-indigo-500" style={{ width: `${o.pct}%` }} />
                        </div>
                        <span className="w-12 text-right text-slate-700 tabular-nums">{o.leads}</span>
                        <span className="w-12 text-right text-slate-500 tabular-nums">{o.pct.toFixed(0)}%</span>
                      </div>
                    ))}
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3 pt-3 border-t border-slate-100">
                  <Stat
                    label="Previsto fechar próx. 7d"
                    value={data.forecast.prox_7d_qtd}
                    hint={formatCurrency(data.forecast.prox_7d_valor)}
                    tone="warn"
                  />
                  <Stat
                    label="Previsto fechar próx. 30d"
                    value={data.forecast.prox_30d_qtd}
                    hint={formatCurrency(data.forecast.prox_30d_valor)}
                  />
                </div>
              </Section>

              {/* ─── BLOCO F: PRÓXIMAS ATIVIDADES ─── */}
              <Section
                title="F. PRÓXIMAS ATIVIDADES"
                subtitle="Tarefas em aberto agrupadas por urgência. Clique pra abrir o card."
                action={<Clock className="w-4 h-4 text-slate-300" />}
              >
                {activities.isLoading ? (
                  <div className="text-xs text-slate-400 py-2">Carregando atividades…</div>
                ) : !activities.data ? (
                  <div className="text-xs text-slate-400 py-2">Sem atividades em aberto</div>
                ) : (
                  <div className="space-y-3">
                    {activities.data.vencidas.length > 0 && (
                      <div>
                        <p className="text-[10px] text-rose-600 uppercase tracking-wider font-semibold mb-1 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          Vencidas ({activities.data.totais.vencidas})
                        </p>
                        <div className="space-y-0.5">
                          {activities.data.vencidas.map(a => (
                            <ActivityRow key={a.tarefa_id} activity={a} type="vencidas" />
                          ))}
                        </div>
                      </div>
                    )}
                    {activities.data.hoje.length > 0 && (
                      <div>
                        <p className="text-[10px] text-amber-600 uppercase tracking-wider font-semibold mb-1">
                          Hoje ({activities.data.totais.hoje})
                        </p>
                        <div className="space-y-0.5">
                          {activities.data.hoje.map(a => (
                            <ActivityRow key={a.tarefa_id} activity={a} type="hoje" />
                          ))}
                        </div>
                      </div>
                    )}
                    {activities.data.proximos_7d.length > 0 && (
                      <div>
                        <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold mb-1">
                          Próximos 7 dias ({activities.data.totais.proximos_7d})
                        </p>
                        <div className="space-y-0.5">
                          {activities.data.proximos_7d.map(a => (
                            <ActivityRow key={a.tarefa_id} activity={a} type="proximos_7d" />
                          ))}
                        </div>
                      </div>
                    )}
                    {activities.data.totais.vencidas + activities.data.totais.hoje + activities.data.totais.proximos_7d === 0 && (
                      <div className="text-xs text-emerald-700 bg-emerald-50 px-3 py-2 rounded-md">
                        Sem tarefas vencidas ou previstas pros próximos 7 dias. 🎉
                      </div>
                    )}
                  </div>
                )}
              </Section>

              {/* Atalho final: ver todos os cards dela */}
              <div className="pt-4 border-t border-slate-200 flex items-center justify-between gap-3">
                <span className="text-xs text-slate-500">
                  Quer ver a lista de cards dela em vez do perfil?
                </span>
                <button
                  onClick={() => openCardsBucket(`Cards abertos de ${planner?.nome}`)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-slate-200 rounded-md hover:bg-slate-50"
                >
                  <Briefcase className="w-3 h-3" />
                  Ver cards
                </button>
              </div>
            </>
          )}

          {!isLoading && !data && (
            <div className="text-sm text-slate-500 text-center py-8">
              Sem dados pra esse Planner no período selecionado.
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
