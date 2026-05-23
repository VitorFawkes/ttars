import { useState } from 'react'
import {
  UserX,
  PhoneOff,
  AlertTriangle,
  Clock,
  ListTodo,
  FileQuestion,
  Briefcase,
  ChevronLeft,
  ChevronRight,
  Loader2,
  ExternalLink,
  Download,
} from 'lucide-react'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import KpiCard from '@/components/analytics/KpiCard'
import { useSaudeSummary } from '@/hooks/analytics/useSaudeSummary'
import { useSaudeTarefasVencidas } from '@/hooks/analytics/useSaudeTarefasVencidas'
import { useSaudeList, type SaudeBucket } from '@/hooks/analytics/useSaudeList'
import { useCardsTravados } from '@/hooks/analytics/useCardsTravados'
import { Lock } from 'lucide-react'
import { formatCurrency } from '@/utils/whatsappFormatters'
import WidgetCard from './WidgetCard'
import { cn } from '@/lib/utils'

const BUCKET_LABELS: Record<SaudeBucket, string> = {
  sem_dono: 'Cards sem dono',
  sem_contato: 'Cards sem contato vinculado',
  sla_violado: 'Cards com SLA violado',
  sem_atividade_7d: 'Cards sem atividade há 7+ dias',
  sem_atividade_14d: 'Cards sem atividade há 14+ dias',
  sem_atividade_30d: 'Cards sem atividade há 30+ dias',
  sem_briefing: 'Cards sem briefing',
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

function PriorityBadge({ prioridade }: { prioridade: string | null }) {
  if (!prioridade) return <span className="text-xs text-slate-400">—</span>
  const styles: Record<string, string> = {
    alta: 'bg-rose-50 text-rose-700 border-rose-200',
    media: 'bg-amber-50 text-amber-700 border-amber-200',
    baixa: 'bg-slate-50 text-slate-600 border-slate-200',
  }
  const cls = styles[prioridade.toLowerCase()] ?? styles.baixa
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-medium uppercase tracking-wide', cls)}>
      {prioridade}
    </span>
  )
}

function DaysOverdueBadge({ dias }: { dias: number }) {
  const color =
    dias >= 14
      ? 'bg-rose-100 text-rose-800'
      : dias >= 7
        ? 'bg-orange-100 text-orange-800'
        : 'bg-amber-100 text-amber-800'
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold tabular-nums', color)}>
      {dias}d
    </span>
  )
}

const PHASE_OPTIONS: { value: string | null; label: string }[] = [
  { value: null, label: 'Todas as fases' },
  { value: 'sdr', label: 'SDR' },
  { value: 'planner', label: 'Planner' },
  { value: 'pos_venda', label: 'Pós-venda' },
]

export default function SaudeView() {
  const [page, setPage] = useState(0)
  const [activeBucket, setActiveBucket] = useState<SaudeBucket | null>(null)
  const [phase, setPhase] = useState<string | null>(null)
  const summary = useSaudeSummary(phase)
  const tarefas = useSaudeTarefasVencidas(page, true)
  const travados = useCardsTravados()

  const s = summary.data
  const loading = summary.isLoading
  const totalAbertos = s?.total_abertos ?? 0

  function pct(v: number): string {
    if (!totalAbertos) return ''
    return ` (${((v / totalAbertos) * 100).toFixed(0)}%)`
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Saúde Operacional</h1>
          <p className="text-sm text-slate-500 mt-1">
            Cards em risco e tarefas vencidas — clique em qualquer indicador pra ver os cards por trás.
          </p>
        </div>
        <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl px-3 py-2 shadow-sm">
          <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">Fase</span>
          <div className="flex rounded-lg border border-slate-200 overflow-hidden">
            {PHASE_OPTIONS.map(opt => (
              <button
                key={opt.label}
                onClick={() => setPhase(opt.value)}
                className={cn(
                  'px-2.5 py-1.5 text-[11px] font-medium transition-colors',
                  phase === opt.value
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-600 hover:bg-slate-50'
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Total abertos */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Cards abertos no total"
          value={s?.total_abertos ?? 0}
          icon={Briefcase}
          color="text-blue-600"
          bgColor="bg-blue-50"
          isLoading={loading}
          subtitle="Base de referência das métricas abaixo"
        />
        <KpiCard
          title="SLA violado"
          value={s?.sla_violado ?? 0}
          icon={AlertTriangle}
          color="text-rose-600"
          bgColor="bg-rose-50"
          isLoading={loading}
          subtitle={s ? `${s.sla_violado}${pct(s.sla_violado)}` : undefined}
          onClick={() => s && s.sla_violado > 0 && setActiveBucket('sla_violado')}
          clickHint="Ver os cards"
        />
        <KpiCard
          title="Tarefas vencidas"
          value={s?.tarefas_vencidas ?? 0}
          icon={ListTodo}
          color="text-rose-600"
          bgColor="bg-rose-50"
          isLoading={loading}
          subtitle="Soma de tasks com prazo passado"
        />
        <KpiCard
          title="Sem briefing"
          value={s?.sem_briefing ?? 0}
          icon={FileQuestion}
          color="text-amber-600"
          bgColor="bg-amber-50"
          isLoading={loading}
          subtitle={s ? `${s.sem_briefing}${pct(s.sem_briefing)}` : undefined}
          onClick={() => s && s.sem_briefing > 0 && setActiveBucket('sem_briefing')}
          clickHint="Ver os cards"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Sem dono"
          value={s?.sem_dono ?? 0}
          icon={UserX}
          color="text-orange-600"
          bgColor="bg-orange-50"
          isLoading={loading}
          subtitle={s ? `${s.sem_dono}${pct(s.sem_dono)}` : undefined}
          onClick={() => s && s.sem_dono > 0 && setActiveBucket('sem_dono')}
          clickHint="Ver os cards"
        />
        <KpiCard
          title="Sem contato vinculado"
          value={s?.sem_contato ?? 0}
          icon={PhoneOff}
          color="text-orange-600"
          bgColor="bg-orange-50"
          isLoading={loading}
          subtitle={s ? `${s.sem_contato}${pct(s.sem_contato)}` : undefined}
          onClick={() => s && s.sem_contato > 0 && setActiveBucket('sem_contato')}
          clickHint="Ver os cards"
        />
        <KpiCard
          title="Parados >14 dias"
          value={s?.sem_atividade_14d ?? 0}
          icon={Clock}
          color="text-orange-600"
          bgColor="bg-orange-50"
          isLoading={loading}
          subtitle="Sem atividade nos últimos 14d"
          onClick={() => s && s.sem_atividade_14d > 0 && setActiveBucket('sem_atividade_14d')}
          clickHint="Ver os cards"
        />
        <KpiCard
          title="Parados >30 dias"
          value={s?.sem_atividade_30d ?? 0}
          icon={Clock}
          color="text-rose-600"
          bgColor="bg-rose-50"
          isLoading={loading}
          subtitle="Sem atividade nos últimos 30d"
          onClick={() => s && s.sem_atividade_30d > 0 && setActiveBucket('sem_atividade_30d')}
          clickHint="Ver os cards"
        />
      </div>

      {/* Bloco de progressão de inatividade */}
      <WidgetCard
        title="Curva de inatividade"
        subtitle="Quanto mais o card fica sem atividade, mais frio o lead — clique em qualquer bucket pra abrir a lista"
      >
        <div className="grid grid-cols-3 gap-4">
          <InactivityBucket
            label="7 dias sem atividade"
            value={s?.sem_atividade_7d ?? 0}
            total={totalAbertos}
            tone="amber"
            loading={loading}
            onClick={() => s && s.sem_atividade_7d > 0 && setActiveBucket('sem_atividade_7d')}
          />
          <InactivityBucket
            label="14 dias sem atividade"
            value={s?.sem_atividade_14d ?? 0}
            total={totalAbertos}
            tone="orange"
            loading={loading}
            onClick={() => s && s.sem_atividade_14d > 0 && setActiveBucket('sem_atividade_14d')}
          />
          <InactivityBucket
            label="30 dias sem atividade"
            value={s?.sem_atividade_30d ?? 0}
            total={totalAbertos}
            tone="rose"
            loading={loading}
            onClick={() => s && s.sem_atividade_30d > 0 && setActiveBucket('sem_atividade_30d')}
          />
        </div>
      </WidgetCard>

      {/* Cards travados em quality gate */}
      <WidgetCard
        title="Cards travados em quality gate"
        subtitle="Cards em Proposta Enviada ou Pós-venda sem orçamento ou data prevista de fechamento — o consultor não consegue avançar sem preencher"
        action={
          travados.isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
          ) : travados.data && travados.data.totalCount > 0 ? (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-700 bg-rose-50 px-2 py-1 rounded-md">
              <Lock className="w-3.5 h-3.5" />
              {travados.data.totalCount.toLocaleString('pt-BR')} {travados.data.totalCount === 1 ? 'card' : 'cards'}
            </span>
          ) : (
            <span className="text-xs text-emerald-700 bg-emerald-50 px-2 py-1 rounded-md font-medium">Tudo certo</span>
          )
        }
      >
        {travados.isLoading ? (
          <div className="h-20 bg-slate-50 rounded-lg animate-pulse" />
        ) : !travados.data || travados.data.rows.length === 0 ? (
          <div className="text-sm text-slate-500 py-3">
            Nenhum card travado. Consultores preenchendo bem. ✅
          </div>
        ) : (
          <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white">
                <tr className="border-b border-slate-100 text-xs text-slate-500 uppercase tracking-wider">
                  <th className="text-left py-2 font-medium">Card</th>
                  <th className="text-left py-2 font-medium">Dono</th>
                  <th className="text-left py-2 font-medium">Etapa</th>
                  <th className="text-right py-2 font-medium">Travado há</th>
                  <th className="text-left py-2 font-medium">Falta</th>
                </tr>
              </thead>
              <tbody>
                {travados.data.rows.map(row => (
                  <tr key={row.card_id} className="border-b border-slate-50 hover:bg-slate-50">
                    <td className="py-2.5 text-slate-900 font-medium max-w-[200px] truncate">
                      <a
                        href={`/cards/${row.card_id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:text-indigo-600 inline-flex items-center gap-1"
                      >
                        {row.titulo}
                        <ExternalLink className="w-3 h-3 opacity-50" />
                      </a>
                    </td>
                    <td className="py-2.5 text-slate-600">{row.dono_atual_nome ?? '—'}</td>
                    <td className="py-2.5 text-slate-600 text-xs">{row.stage_atual_nome}</td>
                    <td className="py-2.5 text-right tabular-nums">
                      <span className={cn(
                        'inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold',
                        row.dias_travado >= 14 ? 'bg-rose-100 text-rose-800' :
                          row.dias_travado >= 7 ? 'bg-orange-100 text-orange-800' :
                            'bg-amber-100 text-amber-800'
                      )}>
                        {row.dias_travado}d
                      </span>
                    </td>
                    <td className="py-2.5">
                      <div className="flex gap-1 flex-wrap">
                        {row.falta_orcamento && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wide bg-rose-50 text-rose-700">
                            Orçamento
                          </span>
                        )}
                        {row.falta_data_prev && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wide bg-amber-50 text-amber-700">
                            Data prev.
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </WidgetCard>

      {/* Tabela de tarefas vencidas */}
      <WidgetCard
        title="Tarefas vencidas"
        subtitle={
          tarefas.data
            ? `${tarefas.data.totalCount} tarefa${tarefas.data.totalCount === 1 ? '' : 's'} atrasada${tarefas.data.totalCount === 1 ? '' : 's'}`
            : 'Carregando...'
        }
      >
        {tarefas.isLoading ? (
          <div className="h-40 flex items-center justify-center text-slate-400">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : tarefas.error ? (
          <div className="h-32 flex items-center justify-center text-sm text-rose-600">
            Erro ao carregar tarefas vencidas
          </div>
        ) : !tarefas.data || tarefas.data.rows.length === 0 ? (
          <div className="h-32 flex items-center justify-center text-sm text-slate-400">
            Nenhuma tarefa vencida — bom trabalho!
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-xs text-slate-500 uppercase tracking-wider">
                    <th className="text-left py-2 font-medium">Tarefa</th>
                    <th className="text-left py-2 font-medium">Card</th>
                    <th className="text-left py-2 font-medium">Responsável</th>
                    <th className="text-left py-2 font-medium">Vencimento</th>
                    <th className="text-left py-2 font-medium">Atraso</th>
                    <th className="text-left py-2 font-medium">Prioridade</th>
                  </tr>
                </thead>
                <tbody>
                  {tarefas.data.rows.map(row => (
                    <tr key={row.tarefa_id} className="border-b border-slate-50 hover:bg-slate-50">
                      <td className="py-2.5 text-slate-900 font-medium">{row.titulo}</td>
                      <td className="py-2.5 text-slate-600 truncate max-w-[240px]">
                        <a
                          href={`/cards/${row.card_id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:text-indigo-600 inline-flex items-center gap-1"
                        >
                          {row.card_titulo}
                          <ExternalLink className="w-3 h-3 opacity-50" />
                        </a>
                      </td>
                      <td className="py-2.5 text-slate-600">{row.responsavel_nome ?? '—'}</td>
                      <td className="py-2.5 text-slate-600 tabular-nums">{formatDate(row.data_vencimento)}</td>
                      <td className="py-2.5">
                        <DaysOverdueBadge dias={row.dias_vencida} />
                      </td>
                      <td className="py-2.5">
                        <PriorityBadge prioridade={row.prioridade} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {tarefas.data.totalPages > 1 && (
              <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-100">
                <p className="text-xs text-slate-500">
                  Página {page + 1} de {tarefas.data.totalPages}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage(p => Math.max(0, p - 1))}
                    disabled={page === 0}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                    Anterior
                  </button>
                  <button
                    onClick={() => setPage(p => Math.min(tarefas.data!.totalPages - 1, p + 1))}
                    disabled={page >= tarefas.data.totalPages - 1}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Próxima
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </WidgetCard>

      <SaudeBucketDrawer
        bucket={activeBucket}
        phase={phase}
        onClose={() => setActiveBucket(null)}
      />
    </div>
  )
}

function InactivityBucket({
  label,
  value,
  total,
  tone,
  loading,
  onClick,
}: {
  label: string
  value: number
  total: number
  tone: 'amber' | 'orange' | 'rose'
  loading: boolean
  onClick?: () => void
}) {
  const percentage = total > 0 ? Math.round((value / total) * 100) : 0
  const toneClasses: Record<typeof tone, { bar: string; text: string; bg: string }> = {
    amber: { bar: 'bg-amber-400', text: 'text-amber-700', bg: 'bg-amber-50' },
    orange: { bar: 'bg-orange-500', text: 'text-orange-700', bg: 'bg-orange-50' },
    rose: { bar: 'bg-rose-500', text: 'text-rose-700', bg: 'bg-rose-50' },
  }
  const cls = toneClasses[tone]

  if (loading) {
    return (
      <div className="bg-slate-50 rounded-xl p-4 animate-pulse">
        <div className="h-3 w-24 bg-slate-200 rounded mb-3" />
        <div className="h-7 w-12 bg-slate-200 rounded mb-3" />
        <div className="h-2 w-full bg-slate-200 rounded" />
      </div>
    )
  }

  const Wrapper = onClick && value > 0 ? 'button' : 'div'

  return (
    <Wrapper
      onClick={onClick && value > 0 ? onClick : undefined}
      className={cn(
        'rounded-xl p-4 text-left w-full',
        cls.bg,
        onClick && value > 0 && 'hover:ring-2 hover:ring-slate-300 transition-shadow cursor-pointer'
      )}
    >
      <p className="text-xs font-medium text-slate-600 mb-1">{label}</p>
      <p className={cn('text-2xl font-bold tracking-tight tabular-nums', cls.text)}>
        {value}
        {total > 0 && (
          <span className="text-sm font-medium text-slate-500 ml-1.5">({percentage}%)</span>
        )}
      </p>
      <div className="mt-2 h-1.5 w-full bg-white rounded-full overflow-hidden">
        <div className={cn('h-full', cls.bar)} style={{ width: `${Math.min(percentage, 100)}%` }} />
      </div>
    </Wrapper>
  )
}

function SaudeBucketDrawer({
  bucket,
  phase,
  onClose,
}: {
  bucket: SaudeBucket | null
  phase: string | null
  onClose: () => void
}) {
  const [page, setPage] = useState(0)
  const list = useSaudeList(bucket, page, 'dias_parado', phase)

  function handleExportCSV() {
    if (!list.data?.rows.length || !bucket) return
    const headers = ['Card', 'Etapa', 'Dono', 'Contato', 'Valor', 'Dias parado', 'SLA excedido (h)']
    const rows = list.data.rows.map(r => [
      r.titulo,
      r.stage_nome,
      r.dono_atual_nome ?? '',
      r.pessoa_nome ?? '',
      String(r.valor_display ?? 0),
      String(r.dias_parado ?? 0),
      r.horas_sla_excedidas ? String(r.horas_sla_excedidas) : '',
    ])
    const csv = [
      headers.join(','),
      ...rows.map(row => row.map(v => v.includes(',') || v.includes('"') ? `"${v.replace(/"/g, '""')}"` : v).join(',')),
    ].join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `saude-${bucket}-${Date.now()}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Sheet open={!!bucket} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="sm:max-w-3xl w-full overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-slate-900 tracking-tight">
            {bucket ? BUCKET_LABELS[bucket] : ''}
          </SheetTitle>
          <SheetDescription className="text-xs text-slate-500">
            {list.data ? `${list.data.totalCount} card${list.data.totalCount === 1 ? '' : 's'}` : 'Carregando...'}
          </SheetDescription>
        </SheetHeader>

        {list.data && list.data.rows.length > 0 && (
          <div className="flex justify-end mt-2">
            <button
              onClick={handleExportCSV}
              className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-indigo-600 px-2.5 py-1.5 rounded-lg hover:bg-slate-100"
            >
              <Download className="w-3.5 h-3.5" />
              CSV
            </button>
          </div>
        )}

        <div className="mt-4">
          {list.isLoading ? (
            <div className="h-40 flex items-center justify-center text-slate-400">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          ) : list.error ? (
            <div className="h-32 flex items-center justify-center text-sm text-rose-600">
              Erro ao carregar cards
            </div>
          ) : !list.data || list.data.rows.length === 0 ? (
            <div className="h-32 flex items-center justify-center text-sm text-slate-400">
              Nenhum card nessa categoria
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-xs text-slate-500 uppercase tracking-wider">
                      <th className="text-left py-2 font-medium">Card</th>
                      <th className="text-left py-2 font-medium">Etapa</th>
                      <th className="text-left py-2 font-medium">Dono</th>
                      <th className="text-right py-2 font-medium">Valor</th>
                      <th className="text-right py-2 font-medium">Dias parado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.data.rows.map(row => (
                      <tr key={row.card_id} className="border-b border-slate-50 hover:bg-slate-50">
                        <td className="py-2.5 text-slate-900 font-medium max-w-[200px] truncate">
                          <a
                            href={`/cards/${row.card_id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:text-indigo-600 inline-flex items-center gap-1"
                          >
                            {row.titulo}
                            <ExternalLink className="w-3 h-3 opacity-50" />
                          </a>
                        </td>
                        <td className="py-2.5 text-slate-600">{row.stage_nome}</td>
                        <td className="py-2.5 text-slate-600">{row.dono_atual_nome ?? '—'}</td>
                        <td className="py-2.5 text-right text-slate-700 tabular-nums">
                          {formatCurrency(row.valor_display ?? 0)}
                        </td>
                        <td className="py-2.5 text-right tabular-nums">
                          <span className={cn(
                            'inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold',
                            row.dias_parado >= 30 ? 'bg-rose-100 text-rose-800' :
                              row.dias_parado >= 14 ? 'bg-orange-100 text-orange-800' :
                                row.dias_parado >= 7 ? 'bg-amber-100 text-amber-800' :
                                  'text-slate-500'
                          )}>
                            {row.dias_parado}d
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {(list.data.totalPages ?? 0) > 1 && (
                <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-100">
                  <p className="text-xs text-slate-500">
                    Página {page + 1} de {list.data.totalPages ?? 1}
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setPage(p => Math.max(0, p - 1))}
                      disabled={page === 0}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                      Anterior
                    </button>
                    <button
                      onClick={() => setPage(p => Math.min((list.data?.totalPages ?? 1) - 1, p + 1))}
                      disabled={page >= (list.data.totalPages ?? 1) - 1}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Próxima
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
