import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2, AlertTriangle } from 'lucide-react'
import { usePainelConciergeStats, usePainelPorConcierge, useViagensComFogo, type PainelPeriodo } from '../../hooks/concierge/usePainelConcierge'
import { useAuth } from '../../contexts/AuthContext'

const PERIODOS: { value: PainelPeriodo; label: string }[] = [
  { value: 'semana', label: 'Esta semana' },
  { value: 'mes', label: 'Este mês' },
  { value: 'trimestre', label: 'Trimestre' },
]

function formatBRL(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}

export default function PainelGestorPage() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [periodo, setPeriodo] = useState<PainelPeriodo>('mes')
  const { data: kpis, isLoading: loadingKpis } = usePainelConciergeStats(periodo)
  const { data: porConcierge, isLoading: loadingPC } = usePainelPorConcierge(periodo)
  const { data: comFogo, isLoading: loadingCF } = useViagensComFogo()

  const isAdmin = profile?.is_admin === true
  if (!isAdmin) {
    return (
      <div className="p-8">
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center shadow-sm">
          <h2 className="text-base font-semibold text-slate-900">Sem acesso</h2>
          <p className="text-sm text-slate-600 mt-2">Apenas admin/gestor pode ver o painel.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-base font-semibold text-slate-900 tracking-tight">Painel Concierge</h1>
        <select
          value={periodo}
          onChange={e => setPeriodo(e.target.value as PainelPeriodo)}
          className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg bg-white"
        >
          {PERIODOS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        {loadingKpis ? (
          <div className="col-span-4 text-slate-500 text-sm flex items-center"><Loader2 className="w-4 h-4 animate-spin mr-2" />Carregando...</div>
        ) : kpis ? (
          <>
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
              <div className="text-xs text-slate-500">Total atendimentos</div>
              <div className="text-2xl font-semibold text-slate-900 mt-1">{kpis.total}</div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
              <div className="text-xs text-slate-500">Fechados no período</div>
              <div className="text-2xl font-semibold text-slate-900 mt-1">{kpis.fechados}</div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
              <div className="text-xs text-slate-500">R$ Vendido extra</div>
              <div className="text-2xl font-semibold text-emerald-700 mt-1">{formatBRL(kpis.vendido_extra)}</div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
              <div className="text-xs text-slate-500">% Conversão de oferta</div>
              <div className="text-2xl font-semibold text-purple-700 mt-1">{kpis.taxa_conversao_oferta.toFixed(0)}%</div>
            </div>
          </>
        ) : null}
      </div>

      {/* Por concierge */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm">
        <div className="px-4 py-3 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-900">Por concierge</h2>
        </div>
        {loadingPC ? (
          <div className="p-6 text-sm text-slate-500"><Loader2 className="w-4 h-4 animate-spin inline-block mr-2" />Carregando...</div>
        ) : porConcierge && porConcierge.length > 0 ? (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-600">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Concierge</th>
                <th className="text-right px-4 py-2 font-medium">Ativos</th>
                <th className="text-right px-4 py-2 font-medium">Vencidos</th>
                <th className="text-right px-4 py-2 font-medium">Fechados</th>
                <th className="text-right px-4 py-2 font-medium">R$ Vendido</th>
              </tr>
            </thead>
            <tbody>
              {porConcierge.map(p => (
                <tr key={p.dono_id} className="border-t border-slate-100">
                  <td className="px-4 py-2 text-slate-900">{p.nome}</td>
                  <td className="px-4 py-2 text-right text-slate-700">{p.ativos}</td>
                  <td className={`px-4 py-2 text-right ${p.vencidos > 0 ? 'text-red-600 font-semibold' : 'text-slate-700'}`}>{p.vencidos}</td>
                  <td className="px-4 py-2 text-right text-slate-700">{p.fechados}</td>
                  <td className="px-4 py-2 text-right text-emerald-700 font-medium">{formatBRL(p.vendido)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="p-6 text-sm text-slate-500">Sem dados no período.</div>
        )}
      </div>

      {/* Viagens com fogo */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-red-600" />
          <h2 className="text-sm font-semibold text-slate-900">Viagens com fogo</h2>
        </div>
        {loadingCF ? (
          <div className="p-6 text-sm text-slate-500"><Loader2 className="w-4 h-4 animate-spin inline-block mr-2" />Carregando...</div>
        ) : comFogo && comFogo.length > 0 ? (
          <ul className="divide-y divide-slate-100">
            {comFogo.map(v => (
              <li
                key={v.card_id}
                onClick={() => navigate(`/cards/${v.card_id}`)}
                className="px-4 py-3 cursor-pointer hover:bg-slate-50 flex items-center justify-between"
              >
                <span className="text-sm text-slate-900">{v.card_titulo}</span>
                <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-semibold">
                  {v.vencidos} vencido{v.vencidos === 1 ? '' : 's'}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="p-6 text-sm text-slate-500">Nenhuma viagem com fogo. Bom trabalho do time.</div>
        )}
      </div>
    </div>
  )
}
