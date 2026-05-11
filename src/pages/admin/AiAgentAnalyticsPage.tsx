import { useState, useMemo, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  BarChart3, Bot, TrendingUp, TrendingDown, Users, MessageSquare,
  ArrowUpRight, Zap, DollarSign, Brain,
} from 'lucide-react'

import { useAiAgents } from '@/hooks/useAiAgents'
import { useAiAgentMetrics } from '@/hooks/useAiConversations'
import { useCurrentProductMeta } from '@/hooks/useCurrentProductMeta'
import AdminPageHeader from '../../components/admin/ui/AdminPageHeader'
import { Select } from '@/components/ui/Select'
import { Badge } from '@/components/ui/Badge'
import { cn } from '@/lib/utils'

function StatCard({
  icon: Icon,
  label,
  value,
  subtitle,
  trend,
  color = 'slate',
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string | number
  subtitle?: string
  trend?: { value: number; label: string }
  color?: string
}) {
  const colorMap: Record<string, string> = {
    indigo: 'bg-indigo-50 text-indigo-600',
    green: 'bg-green-50 text-green-600',
    red: 'bg-red-50 text-red-600',
    amber: 'bg-amber-50 text-amber-600',
    blue: 'bg-blue-50 text-blue-600',
    purple: 'bg-purple-50 text-purple-600',
    slate: 'bg-slate-50 text-slate-600',
  }

  return (
    <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-4">
      <div className="flex items-start justify-between">
        <div className={cn('p-2 rounded-lg', colorMap[color])}>
          <Icon className="w-4 h-4" />
        </div>
        {trend && (
          <div className={cn(
            'flex items-center gap-0.5 text-xs font-medium',
            trend.value >= 0 ? 'text-green-600' : 'text-red-600'
          )}>
            {trend.value >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {Math.abs(trend.value)}%
          </div>
        )}
      </div>
      <p className="text-2xl font-bold text-slate-900 mt-3">{value}</p>
      <p className="text-xs text-slate-500 mt-0.5">{label}</p>
      {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
    </div>
  )
}

function MiniBarChart({ data, maxVal }: { data: number[]; maxVal: number }) {
  return (
    <div className="flex items-end gap-0.5 h-12">
      {data.map((val, i) => (
        <div
          key={i}
          className="flex-1 bg-indigo-200 rounded-t-sm min-h-[2px] transition-all hover:bg-indigo-400"
          style={{ height: `${maxVal > 0 ? (val / maxVal) * 100 : 0}%` }}
          title={`${val}`}
        />
      ))}
    </div>
  )
}

export default function AiAgentAnalyticsPage() {
  const { slug: currentProduct } = useCurrentProductMeta()
  const { agents } = useAiAgents(currentProduct)
  const [searchParams] = useSearchParams()
  const agentFromUrl = searchParams.get('agent') || ''
  const [selectedAgentId, setSelectedAgentId] = useState<string>(agentFromUrl)
  const [period, setPeriod] = useState<string>('30')

  // Sync URL changes into state
  useEffect(() => {
    if (agentFromUrl && agentFromUrl !== selectedAgentId) {
      setSelectedAgentId(agentFromUrl)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentFromUrl])

  const { data: metrics = [] } = useAiAgentMetrics(
    selectedAgentId || agents[0]?.id,
    parseInt(period),
  )

  const activeAgentId = selectedAgentId || agents[0]?.id
  const activeAgent = agents.find(a => a.id === activeAgentId)

  // Aggregate metrics
  const totals = useMemo(() => {
    if (metrics.length === 0) return null

    const totalStarted = metrics.reduce((s, m) => s + m.conversations_started, 0)
    const totalCompleted = metrics.reduce((s, m) => s + m.conversations_completed, 0)
    const totalEscalated = metrics.reduce((s, m) => s + m.conversations_escalated, 0)
    const totalInputTokens = metrics.reduce((s, m) => s + m.total_input_tokens, 0)
    const totalOutputTokens = metrics.reduce((s, m) => s + m.total_output_tokens, 0)

    const avgResolution = totalStarted > 0 ? (totalCompleted / totalStarted) * 100 : 0
    const avgHandoff = totalStarted > 0 ? (totalEscalated / totalStarted) * 100 : 0

    const avgTurns = metrics.filter(m => m.avg_turns_per_conversation != null)
    const meanTurns = avgTurns.length > 0
      ? avgTurns.reduce((s, m) => s + (m.avg_turns_per_conversation || 0), 0) / avgTurns.length
      : 0

    // Custo estimado (Claude Sonnet: ~$3/M input, ~$15/M output)
    const estimatedCost = (totalInputTokens * 3 / 1_000_000) + (totalOutputTokens * 15 / 1_000_000)

    return {
      totalStarted,
      totalCompleted,
      totalEscalated,
      avgResolution,
      avgHandoff,
      meanTurns: Math.round(meanTurns * 10) / 10,
      totalTokens: totalInputTokens + totalOutputTokens,
      estimatedCost: Math.round(estimatedCost * 100) / 100,
      dailyConversations: metrics.map(m => m.conversations_started),
      dailyEscalations: metrics.map(m => m.conversations_escalated),
    }
  }, [metrics])

  const maxDaily = totals
    ? Math.max(...totals.dailyConversations, 1)
    : 1

  return (
    <>
      <AdminPageHeader
        title="Analytics de Agentes IA"
        subtitle="Performance, custos e métricas dos agentes de WhatsApp"
        icon={<BarChart3 className="w-5 h-5" />}
      />

      {/* Filtros */}
      <div className="flex gap-3 mb-6">
        <div className="w-56">
          <Select
            value={selectedAgentId}
            onChange={(v: string) => setSelectedAgentId(v)}
            options={[
              ...agents.map(a => ({ value: a.id, label: a.nome })),
            ]}
            placeholder="Selecione um agente"
          />
        </div>
        <div className="w-40">
          <Select
            value={period}
            onChange={(v: string) => setPeriod(v)}
            options={[
              { value: '7', label: 'Últimos 7 dias' },
              { value: '14', label: 'Últimos 14 dias' },
              { value: '30', label: 'Últimos 30 dias' },
              { value: '90', label: 'Últimos 90 dias' },
            ]}
          />
        </div>
      </div>

      {!activeAgent ? (
        <div className="p-12 text-center bg-slate-50 border border-dashed border-slate-200 rounded-xl">
          <BarChart3 className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-600 font-medium">Nenhum agente disponível</p>
          <p className="text-sm text-slate-500 mt-1">Crie um agente primeiro para ver analytics</p>
        </div>
      ) : !totals || totals.totalStarted === 0 ? (
        <div className="space-y-6">
          {/* Agent info card */}
          <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-6">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-indigo-50 rounded-lg">
                <Bot className="w-5 h-5 text-indigo-600" />
              </div>
              <div>
                <p className="font-semibold text-slate-900">{activeAgent.nome}</p>
                <p className="text-sm text-slate-500">{activeAgent.persona || activeAgent.tipo}</p>
              </div>
              <Badge
                variant="outline"
                className={cn('ml-auto', activeAgent.ativa ? 'text-green-700 bg-green-50' : 'text-slate-500')}
              >
                {activeAgent.ativa ? 'Ativo' : 'Inativo'}
              </Badge>
            </div>
          </div>

          <div className="p-12 text-center bg-slate-50 border border-dashed border-slate-200 rounded-xl">
            <BarChart3 className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-600 font-medium">Sem dados no período</p>
            <p className="text-sm text-slate-500 mt-1">
              Os dados aparecem quando o agente começar a processar conversas
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Agent info */}
          <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-4 flex items-center gap-3">
            <div className="p-2 bg-indigo-50 rounded-lg">
              <Bot className="w-5 h-5 text-indigo-600" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-slate-900">{activeAgent.nome}</p>
              <p className="text-xs text-slate-500">
                {activeAgent.tipo} | {activeAgent.modelo} | temp: {activeAgent.temperature}
              </p>
            </div>
            <Badge
              variant="outline"
              className={cn(activeAgent.ativa ? 'text-green-700 bg-green-50' : 'text-slate-500')}
            >
              {activeAgent.ativa ? 'Ativo' : 'Inativo'}
            </Badge>
          </div>

          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard
              icon={MessageSquare}
              label="Conversas"
              value={totals.totalStarted}
              subtitle={`${totals.totalCompleted} completas`}
              color="indigo"
            />
            <StatCard
              icon={Users}
              label="Taxa de Resolução"
              value={`${Math.round(totals.avgResolution)}%`}
              subtitle="Resolvido sem humano"
              color="green"
            />
            <StatCard
              icon={ArrowUpRight}
              label="Taxa de Escalação"
              value={`${Math.round(totals.avgHandoff)}%`}
              subtitle={`${totals.totalEscalated} escaladas`}
              color={totals.avgHandoff > 30 ? 'red' : 'amber'}
            />
            <StatCard
              icon={Zap}
              label="Turns Médio"
              value={totals.meanTurns}
              subtitle="Mensagens por conversa"
              color="blue"
            />
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Conversas por dia */}
            <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-slate-900">Conversas por Dia</h3>
                <span className="text-xs text-slate-400">{metrics.length} dias</span>
              </div>
              <MiniBarChart data={totals.dailyConversations} maxVal={maxDaily} />
              <div className="flex justify-between mt-1 text-xs text-slate-400">
                <span>{metrics[0]?.date_bucket ? new Date(metrics[0].date_bucket).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : ''}</span>
                <span>{metrics[metrics.length - 1]?.date_bucket ? new Date(metrics[metrics.length - 1].date_bucket).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : ''}</span>
              </div>
            </div>

            {/* Escalações por dia */}
            <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-slate-900">Escalações por Dia</h3>
                <span className="text-xs text-red-400">{totals.totalEscalated} total</span>
              </div>
              <MiniBarChart
                data={totals.dailyEscalations}
                maxVal={Math.max(...totals.dailyEscalations, 1)}
              />
              <div className="flex justify-between mt-1 text-xs text-slate-400">
                <span>{metrics[0]?.date_bucket ? new Date(metrics[0].date_bucket).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : ''}</span>
                <span>{metrics[metrics.length - 1]?.date_bucket ? new Date(metrics[metrics.length - 1].date_bucket).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : ''}</span>
              </div>
            </div>
          </div>

          {/* Custo & Tokens */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <StatCard
              icon={Brain}
              label="Tokens Consumidos"
              value={totals.totalTokens > 1000
                ? `${(totals.totalTokens / 1000).toFixed(1)}k`
                : totals.totalTokens}
              subtitle="Input + Output"
              color="purple"
            />
            <StatCard
              icon={DollarSign}
              label="Custo Estimado"
              value={`$${totals.estimatedCost.toFixed(2)}`}
              subtitle="Baseado em pricing Claude Sonnet"
              color="amber"
            />
            <StatCard
              icon={DollarSign}
              label="Custo por Conversa"
              value={totals.totalStarted > 0
                ? `$${(totals.estimatedCost / totals.totalStarted).toFixed(3)}`
                : '$0'}
              subtitle="Média por conversa"
              color="green"
            />
          </div>

          {/* Daily breakdown table */}
          <div className="bg-white border border-slate-200 shadow-sm rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100">
              <h3 className="text-sm font-semibold text-slate-900">Detalhamento Diário</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 text-xs">
                    <th className="px-4 py-2 text-left font-medium">Data</th>
                    <th className="px-4 py-2 text-right font-medium">Conversas</th>
                    <th className="px-4 py-2 text-right font-medium">Completas</th>
                    <th className="px-4 py-2 text-right font-medium">Escaladas</th>
                    <th className="px-4 py-2 text-right font-medium">Resolução</th>
                    <th className="px-4 py-2 text-right font-medium">Tokens</th>
                  </tr>
                </thead>
                <tbody>
                  {[...metrics].reverse().slice(0, 14).map((m) => {
                    const resolution = m.conversations_started > 0
                      ? Math.round((m.conversations_completed / m.conversations_started) * 100)
                      : 0
                    return (
                      <tr key={m.date_bucket} className="border-t border-slate-50 hover:bg-slate-50/50">
                        <td className="px-4 py-2 text-slate-700">
                          {new Date(m.date_bucket).toLocaleDateString('pt-BR', {
                            weekday: 'short', day: '2-digit', month: '2-digit',
                          })}
                        </td>
                        <td className="px-4 py-2 text-right font-medium text-slate-900">
                          {m.conversations_started}
                        </td>
                        <td className="px-4 py-2 text-right text-green-600">
                          {m.conversations_completed}
                        </td>
                        <td className="px-4 py-2 text-right text-red-600">
                          {m.conversations_escalated}
                        </td>
                        <td className="px-4 py-2 text-right">
                          <span className={cn(
                            'font-medium',
                            resolution >= 80 ? 'text-green-600' : resolution >= 50 ? 'text-amber-600' : 'text-red-600'
                          )}>
                            {resolution}%
                          </span>
                        </td>
                        <td className="px-4 py-2 text-right text-slate-500">
                          {((m.total_input_tokens + m.total_output_tokens) / 1000).toFixed(1)}k
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
