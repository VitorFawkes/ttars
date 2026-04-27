import { Loader2 } from 'lucide-react'
import { useModelosConcierge, useToggleModeloAtivo } from '../../hooks/concierge/useModelosConcierge'
import { TIPO_LABEL, CATEGORIAS_CONCIERGE } from '../../hooks/concierge/types'
import { useAuth } from '../../contexts/AuthContext'

function categoriaLabel(key: string | null): string {
  if (!key) return '—'
  return CATEGORIAS_CONCIERGE[key as keyof typeof CATEGORIAS_CONCIERGE]?.label ?? key
}

export default function ModelosPage() {
  const { profile } = useAuth()
  const { data: modelos, isLoading } = useModelosConcierge()
  const toggle = useToggleModeloAtivo()

  if (!profile?.is_admin) {
    return (
      <div className="p-8">
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center shadow-sm">
          <h2 className="text-base font-semibold text-slate-900">Sem acesso</h2>
          <p className="text-sm text-slate-600 mt-2">Apenas admin pode gerenciar modelos.</p>
        </div>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="p-8 flex items-center justify-center text-slate-500">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Carregando modelos...
      </div>
    )
  }

  return (
    <div className="p-6 space-y-3">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-base font-semibold text-slate-900 tracking-tight">Modelos de Cadência</h1>
        <p className="text-xs text-slate-500">Cadências automáticas que criam atendimentos no momento certo</p>
      </div>

      {!modelos || modelos.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center shadow-sm">
          <p className="text-sm text-slate-600">Nenhum modelo configurado ainda.</p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-600">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Modelo</th>
                <th className="text-left px-4 py-2 font-medium">Tipo</th>
                <th className="text-left px-4 py-2 font-medium">Categoria</th>
                <th className="text-center px-4 py-2 font-medium">Quando</th>
                <th className="text-center px-4 py-2 font-medium">Ativo</th>
              </tr>
            </thead>
            <tbody>
              {modelos.map(m => {
                const tipoCfg = m.tipo_concierge ? TIPO_LABEL[m.tipo_concierge] : null
                const day = m.day_offset ?? 0
                const dayLabel = day === 0 ? 'No aceite' : day > 0 ? `D+${day}` : `D${day}`
                return (
                  <tr key={m.step_id} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <div className="text-sm font-medium text-slate-900">{m.template_name}</div>
                      {m.template_description && (
                        <div className="text-xs text-slate-500 mt-0.5">{m.template_description}</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {tipoCfg && (
                        <span className={`px-2 py-0.5 rounded text-[11px] font-semibold ${tipoCfg.bgColor} ${tipoCfg.color}`}>
                          {tipoCfg.emoji} {tipoCfg.label}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-700">{categoriaLabel(m.categoria_concierge)}</td>
                    <td className="px-4 py-3 text-center text-slate-700 font-mono text-xs">{dayLabel}</td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => toggle.mutate({ template_id: m.template_id, is_active: !m.template_active })}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                          m.template_active ? 'bg-emerald-500' : 'bg-slate-200'
                        }`}
                      >
                        <span
                          className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                            m.template_active ? 'translate-x-5' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
