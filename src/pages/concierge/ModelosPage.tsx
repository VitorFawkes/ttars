import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Loader2, ExternalLink } from 'lucide-react'
import { useModelosConcierge, useToggleModeloAtivo } from '../../hooks/concierge/useModelosConcierge'
import { TIPO_LABEL, CATEGORIAS_CONCIERGE, categoriasParaProduto, type TipoConcierge } from '../../hooks/concierge/types'
import { useAuth } from '../../contexts/AuthContext'
import { useCurrentProductMeta } from '../../hooks/useCurrentProductMeta'
import { cn } from '../../lib/utils'

function categoriaLabel(key: string | null): string {
  if (!key) return '—'
  return CATEGORIAS_CONCIERGE[key as keyof typeof CATEGORIAS_CONCIERGE]?.label ?? key
}

const FILTROS: Array<{ value: 'todos' | TipoConcierge; label: string }> = [
  { value: 'todos',       label: 'Todos' },
  { value: 'oferta',      label: 'Ofertas' },
  { value: 'reserva',     label: 'Reservas' },
  { value: 'suporte',     label: 'Suporte' },
  { value: 'operacional', label: 'Operacional' },
]

export default function ModelosPage() {
  const { profile } = useAuth()
  const { slug: produtoAtual } = useCurrentProductMeta()
  const { data: modelos, isLoading } = useModelosConcierge()
  const toggle = useToggleModeloAtivo()
  const [filtroTipo, setFiltroTipo] = useState<'todos' | TipoConcierge>('todos')

  const categoriasDoProduto = useMemo(() => {
    return new Set(categoriasParaProduto(produtoAtual).map(c => c.key))
  }, [produtoAtual])

  const modelosFiltrados = useMemo(() => {
    if (!modelos) return []
    return modelos.filter(m => {
      if (m.categoria_concierge && !categoriasDoProduto.has(m.categoria_concierge as never)) return false
      if (filtroTipo !== 'todos' && m.tipo_concierge !== filtroTipo) return false
      return true
    })
  }, [modelos, categoriasDoProduto, filtroTipo])

  const ativos = modelosFiltrados.filter(m => m.template_active).length

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

  // Build timeline range (D-min até D-max)
  const dayOffsets = modelosFiltrados.map(m => m.day_offset ?? 0)
  const minD = dayOffsets.length ? Math.min(...dayOffsets, 0) : -45
  const maxD = dayOffsets.length ? Math.max(...dayOffsets, 0) : 5
  const range = Math.max(maxD - minD, 1)

  return (
    <div className="p-6 space-y-6 max-w-[1200px] mx-auto">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-[20px] font-semibold text-slate-900 tracking-tight">Modelos de cadência</h1>
          <p className="text-[13px] text-slate-500 mt-0.5">
            Cadências automáticas que criam atendimentos no momento certo. As mesmas cadências aparecem em{' '}
            <Link to="/settings/automations" className="text-indigo-600 hover:text-indigo-700 inline-flex items-center gap-0.5">
              Configurações &gt; Automações <ExternalLink className="w-3 h-3" />
            </Link>
            .
          </p>
        </div>
        <div className="text-[12px] text-slate-500">
          <span className="font-mono font-semibold text-slate-900">{ativos}</span> ativos de {modelosFiltrados.length}
        </div>
      </div>

      {/* Filtro por tipo */}
      <div className="flex items-center gap-2">
        {FILTROS.map(f => (
          <button
            key={f.value}
            onClick={() => setFiltroTipo(f.value)}
            className={cn(
              'h-7 px-2.5 text-[12px] rounded-md border transition-colors',
              filtroTipo === f.value ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Timeline visual */}
      {modelosFiltrados.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[13px] font-semibold text-slate-900">Linha do tempo</h2>
            <span className="text-[11.5px] text-slate-500">Em relação à data de embarque (0 = aceite)</span>
          </div>
          <div className="relative pl-2 pr-4 pt-6 pb-2">
            <div className="relative h-8">
              <div className="absolute left-0 right-0 top-1/2 h-px bg-slate-200" />
              {(() => {
                const pct = ((0 - minD) / range) * 100
                return (
                  <div className="absolute top-0 h-full" style={{ left: `${pct}%` }}>
                    <div className="absolute -top-5 left-1/2 -translate-x-1/2 text-[10px] text-slate-500 font-mono whitespace-nowrap">aceite</div>
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-indigo-500 ring-2 ring-white shadow" />
                  </div>
                )
              })()}
              <div className="absolute right-0 top-0 h-full">
                <div className="absolute -top-5 right-0 text-[10px] text-slate-500 font-mono whitespace-nowrap">embarque →</div>
                <div className="absolute top-1/2 right-0 -translate-y-1/2 w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-white shadow" />
              </div>
              {modelosFiltrados.map(m => {
                const pct = (((m.day_offset ?? 0) - minD) / range) * 100
                const tipoCfg = m.tipo_concierge ? TIPO_LABEL[m.tipo_concierge] : null
                if (!tipoCfg) return null
                return (
                  <div
                    key={m.step_id}
                    title={`${m.template_name} (${(m.day_offset ?? 0) === 0 ? 'No aceite' : (m.day_offset ?? 0) > 0 ? `D+${m.day_offset}` : `D${m.day_offset}`})`}
                    className={cn('absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full ring-2 ring-white border', tipoCfg.dotColor, tipoCfg.borderColor)}
                    style={{ left: `${pct}%` }}
                  />
                )
              })}
            </div>
            <div className="flex justify-between mt-2 text-[10.5px] text-slate-400 font-mono">
              <span>D{minD}</span>
              <span>D{Math.round(minD / 2)}</span>
              <span>0</span>
              <span>D+{maxD}</span>
            </div>
          </div>
        </div>
      )}

      {modelosFiltrados.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center shadow-sm">
          <p className="text-sm text-slate-600">Nenhum modelo configurado pra esse produto/filtro.</p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <table className="w-full text-[13px]">
            <thead className="bg-slate-50 text-[11px] text-slate-500 uppercase tracking-wider">
              <tr>
                <th className="text-left px-5 py-2.5 font-semibold">Modelo</th>
                <th className="text-left px-3 py-2.5 font-semibold">Tipo · categoria</th>
                <th className="text-center px-3 py-2.5 font-semibold">Quando dispara</th>
                <th className="text-center px-3 py-2.5 font-semibold">Ativo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {modelosFiltrados.map(m => {
                const tipoCfg = m.tipo_concierge ? TIPO_LABEL[m.tipo_concierge] : null
                const day = m.day_offset ?? 0
                const dayLabel = day === 0 ? 'No aceite' : day > 0 ? `D+${day}` : `D${day}`
                return (
                  <tr key={m.step_id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-5 py-3">
                      <div className="font-medium text-slate-900">{m.template_name}</div>
                      {m.template_description && (
                        <div className="text-[11.5px] text-slate-500 mt-0.5">{m.template_description}</div>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        {tipoCfg && (
                          <span className={cn('inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10.5px] font-semibold', tipoCfg.bgColor, tipoCfg.color)}>
                            <span>{tipoCfg.emoji}</span>
                            {tipoCfg.label}
                          </span>
                        )}
                        <span className="text-[12px] text-slate-700">{categoriaLabel(m.categoria_concierge)}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-center">
                      <span className="font-mono text-[12px] font-semibold text-slate-900 bg-slate-100 px-2 py-0.5 rounded">{dayLabel}</span>
                    </td>
                    <td className="px-3 py-3 text-center">
                      <button
                        onClick={() => toggle.mutate({ template_id: m.template_id, is_active: !m.template_active })}
                        className={cn(
                          'relative inline-flex h-5 w-9 items-center rounded-full transition-colors',
                          m.template_active ? 'bg-emerald-500' : 'bg-slate-200'
                        )}
                      >
                        <span
                          className={cn(
                            'inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform',
                            m.template_active ? 'translate-x-5' : 'translate-x-1'
                          )}
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
