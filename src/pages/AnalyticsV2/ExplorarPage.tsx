import { useState } from 'react'
import { Search, Sparkles, Loader2, AlertCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import WidgetCard from './WidgetCard'

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

export default function ExplorarPage() {
  const [question, setQuestion] = useState('')
  const [interpreted, setInterpreted] = useState<InterpretedQuery | null>(null)
  const [rows, setRows] = useState<QueryRow[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
      setInterpreted(iq)

      const { data: result, error: rpcErr } = await supabase.rpc('analytics_explorer_query', {
        p_measure: iq.measure,
        p_group_by: iq.group_by,
        p_cross_with: iq.cross_with,
        p_filters: iq.filters,
        p_from: iq.period.from,
        p_to: iq.period.to,
      } as never)
      if (rpcErr) { setError(`A consulta falhou: ${rpcErr.message}`); return }
      const parsed = result as ExplorerResponse | null
      setRows(parsed?.rows ?? [])
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">🔍 Explorar</h1>
        <p className="text-sm text-slate-500 mt-1">
          Faça uma pergunta em linguagem natural. A IA traduz pra uma consulta estruturada e você vê o resultado.
        </p>
      </header>

      <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-5">
        <label className="text-xs font-medium text-slate-500 mb-2 block">Sua pergunta</label>
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

      {rows && (
        <WidgetCard title="Resultado" subtitle={`${rows.length} ${rows.length === 1 ? 'linha' : 'linhas'}`}>
          {rows.length === 0 ? (
            <div className="h-32 flex items-center justify-center text-sm text-slate-400">Sem resultados para esta consulta</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-slate-500 text-xs">
                  <tr className="border-b border-slate-100">
                    <th className="text-left py-2 font-medium">{interpreted?.group_by ?? 'dim1'}</th>
                    {interpreted?.cross_with && <th className="text-left py-2 font-medium">{interpreted.cross_with}</th>}
                    <th className="text-right py-2 font-medium">{interpreted?.measure ?? 'value'}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} className="border-b border-slate-50 last:border-0">
                      <td className="py-2 font-medium text-slate-900">{String(r.dim1 ?? '—')}</td>
                      {interpreted?.cross_with && <td className="py-2 text-slate-600">{String(r.dim2 ?? '—')}</td>}
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
