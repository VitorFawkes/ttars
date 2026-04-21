import { useState, useEffect } from 'react'
import { Search, Sparkles, Loader2, AlertCircle, Download, Save, Link2, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import WidgetCard from './WidgetCard'
import { useSavedViews } from '@/hooks/analyticsV2/useSavedViews'

interface InterpretedQuery {
  measure: string
  group_by: string
  cross_with: string | null
  filters: Record<string, unknown>
  period: { from: string; to: string }
  viz: string
  confidence: number
  explanation: string
}

interface QueryRow {
  dim1: string | number | null
  dim2: string | number | null
  value: number | null
}

interface ExplorerResponse {
  measure: string
  group_by: string
  cross_with: string | null
  rows: QueryRow[]
}

interface PivotState {
  measure: string
  group_by: string
  cross_with: string | null
  from: string
  to: string
  viz: 'table' | 'bar' | 'line' | 'heatmap'
}

export default function ExplorarPage() {
  const [question, setQuestion] = useState('')
  const [interpreted, setInterpreted] = useState<InterpretedQuery | null>(null)
  const [rows, setRows] = useState<QueryRow[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [pivot, setPivot] = useState<PivotState>({
    measure: 'count_cards',
    group_by: 'stage',
    cross_with: null,
    from: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    to: new Date().toISOString().split('T')[0],
    viz: 'table',
  })

  const { save: saveView, views, delete: deleteView } = useSavedViews()
  const [showSaveModal, setShowSaveModal] = useState(false)
  const [saveName, setSaveName] = useState('')
  const [saveDescription, setSaveDescription] = useState('')
  const [savingView, setSavingView] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const stateB64 = params.get('state')
    if (stateB64) {
      try {
        const state = JSON.parse(atob(stateB64)) as PivotState
        setPivot(state)
        // Auto-executa ao abrir link compartilhado
        void executeQuery(state.measure, state.group_by, state.cross_with, state.from, state.to)
      } catch {
        // Ignorar se inválido
      }
    }
  }, [])

  async function executeQuery(
    measure: string,
    group_by: string,
    cross_with: string | null,
    from: string,
    to: string
  ) {
    setLoading(true)
    setError(null)
    try {
      const { data: result, error: rpcErr } = await supabase.rpc('analytics_explorer_query', {
        p_measure: measure,
        p_group_by: group_by,
        p_cross_with: cross_with,
        p_filters: {},
        p_from: from,
        p_to: to,
      } as never)
      if (rpcErr) {
        setError(`A consulta falhou: ${rpcErr.message}`)
        return
      }
      const parsed = result as ExplorerResponse | null
      setRows(parsed?.rows ?? [])
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  async function handleAsk() {
    const q = question.trim()
    if (!q) return
    setLoading(true); setError(null); setInterpreted(null); setRows(null)
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData?.session?.access_token
      if (!token) { setError('Sua sessão expirou. Faça login de novo.'); return }

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
      const res = await fetch(`${supabaseUrl}/functions/v1/analytics-ai-interpret`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q }),
      })
      const body = await res.json()
      if (!res.ok) {
        setError(body?.error === 'rate_limited'
          ? 'Você atingiu o limite de 30 perguntas por hora. Tente mais tarde.'
          : `Não consegui interpretar: ${body?.error ?? 'erro desconhecido'}`)
        return
      }

      const iq = body.query as InterpretedQuery

      if (iq.confidence < 0.5) {
        setInterpreted(iq)
        setError(
          `Confiança baixa (${Math.round(iq.confidence * 100)}%). ` +
          'Por favor, ajuste a consulta usando os controles de pivot abaixo.'
        )
        return
      }

      setInterpreted(iq)
      setPivot({
        measure: iq.measure,
        group_by: iq.group_by,
        cross_with: iq.cross_with,
        from: iq.period.from,
        to: iq.period.to,
        viz: iq.viz as PivotState['viz'],
      })

      await executeQuery(iq.measure, iq.group_by, iq.cross_with, iq.period.from, iq.period.to)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  async function handleExecutePivot() {
    await executeQuery(pivot.measure, pivot.group_by, pivot.cross_with, pivot.from, pivot.to)
  }

  function downloadCSV() {
    if (!rows || rows.length === 0) return

    const headers = [
      pivot.group_by,
      pivot.cross_with ? pivot.cross_with : null,
      pivot.measure,
    ].filter(Boolean)

    const csvRows = rows.map(r => [
      escapeCSV(String(r.dim1 ?? '')),
      pivot.cross_with ? escapeCSV(String(r.dim2 ?? '')) : null,
      escapeCSV(String(r.value ?? '')),
    ].filter((v): v is string => v !== null))

    const csvContent = [
      headers.join(','),
      ...csvRows.map(row => row.join(',')),
    ].join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    link.setAttribute('href', url)
    link.setAttribute('download', `explorar_${new Date().toISOString().split('T')[0]}.csv`)
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  function escapeCSV(str: string): string {
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`
    }
    return str
  }

  function shareLink() {
    const stateB64 = btoa(JSON.stringify(pivot))
    const url = new URL(window.location.href)
    url.searchParams.set('state', stateB64)
    navigator.clipboard.writeText(url.toString()).then(() => {
      alert('Link compartilhável copiado!')
    })
  }

  async function handleSaveView() {
    if (!saveName.trim()) {
      setError('Nome da visão não pode estar vazio')
      return
    }
    setSavingView(true)
    try {
      const success = await saveView(saveName, pivot, pivot.viz, saveDescription)
      if (success) {
        setSaveName('')
        setSaveDescription('')
        setShowSaveModal(false)
      } else {
        setError('Erro ao salvar visão')
      }
    } finally {
      setSavingView(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">🔍 Explorar</h1>
        <p className="text-sm text-slate-500 mt-1">
          Faça uma pergunta ou configure manualmente os parâmetros de pivot.
        </p>
      </header>

      <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-5">
        <label className="text-xs font-medium text-slate-500 mb-2 block">Sua pergunta (opcional)</label>
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={question}
              onChange={e => setQuestion(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAsk() } }}
              placeholder="Ex: qual a conversão por dono nos últimos 30 dias?"
              className="w-full pl-10 pr-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300"
              maxLength={500}
            />
          </div>
          <button
            onClick={handleAsk}
            disabled={loading || !question.trim()}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            Perguntar
          </button>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {[
            'Receita por mês nos últimos 90 dias',
            'Conversão para Planner por dono',
            'Top 10 destinos por receita',
            'Ticket médio por origem',
          ].map(s => (
            <button key={s} onClick={() => setQuestion(s)}
              className="text-xs text-slate-600 bg-slate-50 hover:bg-slate-100 px-2.5 py-1 rounded-md">
              {s}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-red-700">{error}</div>
        </div>
      )}

      {interpreted && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="w-4 h-4 text-amber-600" />
            <span className="text-xs font-semibold text-amber-700 uppercase tracking-wide">Entendi assim</span>
            <span className="ml-auto text-xs text-amber-600">
              Confiança: {Math.round(interpreted.confidence * 100)}%
            </span>
          </div>
          <p className="text-sm text-amber-900">{interpreted.explanation}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Chip>métrica: {interpreted.measure}</Chip>
            <Chip>agrupar por: {interpreted.group_by}</Chip>
            {interpreted.cross_with && <Chip>cruzar com: {interpreted.cross_with}</Chip>}
            <Chip>período: {interpreted.period.from} → {interpreted.period.to}</Chip>
          </div>
        </div>
      )}

      <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-5">
        <h2 className="text-sm font-semibold text-slate-900 mb-4">Pivot Manual</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <div>
            <label className="text-xs font-medium text-slate-500 mb-1 block">Métrica</label>
            <select
              value={pivot.measure}
              onChange={e => setPivot({ ...pivot, measure: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-100"
            >
              <option value="count_cards"># de cards</option>
              <option value="sum_revenue">Receita total</option>
              <option value="avg_ticket">Ticket médio</option>
              <option value="count_ganho_sdr"># handoffs SDR</option>
              <option value="count_ganho_planner"># ganhos Planner</option>
              <option value="conversion_planner_pct">% conversão</option>
              <option value="avg_quality_score">Score qualidade médio</option>
              <option value="avg_days_to_planner_win">Dias até ganho</option>
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-500 mb-1 block">Agrupar por</label>
            <select
              value={pivot.group_by}
              onChange={e => setPivot({ ...pivot, group_by: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-100"
            >
              <option value="stage">Etapa</option>
              <option value="owner">Dono</option>
              <option value="sdr_owner">SDR</option>
              <option value="planner_owner">Planner</option>
              <option value="phase">Seção</option>
              <option value="origem">Origem</option>
              <option value="destino">Destino</option>
              <option value="month">Mês</option>
              <option value="week">Semana</option>
              <option value="day">Dia</option>
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-500 mb-1 block">Cruzar com</label>
            <select
              value={pivot.cross_with ?? ''}
              onChange={e => setPivot({ ...pivot, cross_with: e.target.value || null })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-100"
            >
              <option value="">— Nenhum —</option>
              <option value="stage">Etapa</option>
              <option value="owner">Dono</option>
              <option value="origem">Origem</option>
              <option value="month">Mês</option>
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-500 mb-1 block">Visualização</label>
            <select
              value={pivot.viz}
              onChange={e => setPivot({ ...pivot, viz: e.target.value as PivotState['viz'] })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-100"
            >
              <option value="table">Tabela</option>
              <option value="bar">Gráfico de barras</option>
              <option value="line">Linha</option>
              <option value="heatmap">Heatmap</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <div>
            <label className="text-xs font-medium text-slate-500 mb-1 block">De</label>
            <input
              type="date"
              value={pivot.from}
              onChange={e => setPivot({ ...pivot, from: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-100"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500 mb-1 block">Até</label>
            <input
              type="date"
              value={pivot.to}
              onChange={e => setPivot({ ...pivot, to: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-100"
            />
          </div>
        </div>

        <button
          onClick={handleExecutePivot}
          disabled={loading}
          className="w-full px-4 py-2.5 bg-slate-900 text-white rounded-lg text-sm font-medium hover:bg-slate-800 disabled:opacity-50"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin inline mr-2" /> : null}
          Executar
        </button>
      </div>

      {rows && (
        <WidgetCard title="Resultado" subtitle={`${rows.length} ${rows.length === 1 ? 'linha' : 'linhas'}`}>
          <div className="flex gap-2 mb-4">
            <button
              onClick={downloadCSV}
              disabled={rows.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              CSV
            </button>
            <button
              onClick={shareLink}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100"
            >
              <Link2 className="w-4 h-4" />
              Compartilhar
            </button>
            <button
              onClick={() => setShowSaveModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100"
            >
              <Save className="w-4 h-4" />
              Salvar visão
            </button>
          </div>

          {rows.length === 0 ? (
            <div className="h-32 flex items-center justify-center text-sm text-slate-400">Sem resultados para esta consulta</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-slate-500 text-xs">
                  <tr className="border-b border-slate-100">
                    <th className="text-left py-2 font-medium">{pivot.group_by}</th>
                    {pivot.cross_with && <th className="text-left py-2 font-medium">{pivot.cross_with}</th>}
                    <th className="text-right py-2 font-medium">{pivot.measure}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} className="border-b border-slate-50 last:border-0">
                      <td className="py-2 font-medium text-slate-900">{String(r.dim1 ?? '—')}</td>
                      {pivot.cross_with && <td className="py-2 text-slate-600">{String(r.dim2 ?? '—')}</td>}
                      <td className="py-2 text-right text-slate-700 tabular-nums">
                        {r.value == null ? '—' : typeof r.value === 'number' ? r.value.toLocaleString('pt-BR') : r.value}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </WidgetCard>
      )}

      {views.length > 0 && (
        <WidgetCard title="Visões Salvas" subtitle={`${views.length} ${views.length === 1 ? 'visão' : 'visões'}`}>
          <div className="space-y-2">
            {views.map(v => (
              <div key={v.id} className="flex items-center justify-between p-2 bg-slate-50 rounded-lg group hover:bg-slate-100">
                <button
                  onClick={() => {
                    setPivot({ ...v.query_spec, cross_with: v.query_spec.cross_with ?? null, viz: v.viz })
                    handleExecutePivot()
                  }}
                  className="text-sm font-medium text-slate-900 hover:text-indigo-600 flex-1 text-left"
                >
                  {v.name}
                </button>
                <button
                  onClick={() => deleteView(v.id)}
                  className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-100 rounded"
                >
                  <Trash2 className="w-4 h-4 text-red-500" />
                </button>
              </div>
            ))}
          </div>
        </WidgetCard>
      )}

      {showSaveModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 rounded-lg">
          <div className="bg-white rounded-xl p-6 max-w-md w-full">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Salvar Visão</h2>
            <input
              type="text"
              value={saveName}
              onChange={e => setSaveName(e.target.value)}
              placeholder="Nome da visão"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-indigo-100"
            />
            <input
              type="text"
              value={saveDescription}
              onChange={e => setSaveDescription(e.target.value)}
              placeholder="Descrição (opcional)"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-indigo-100"
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowSaveModal(false)}
                className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveView}
                disabled={savingView || !saveName.trim()}
                className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
              >
                {savingView ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[10px] bg-white border border-amber-200 text-amber-800 px-2 py-0.5 rounded font-medium">
      {children}
    </span>
  )
}
