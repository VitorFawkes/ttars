import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Search, MapPin, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { useViagensList, useCriarViagem } from '@/hooks/viagem/useViagemInterna'
import type { ViagemEstado } from '@/types/viagem'

const ESTADO_LABEL: Record<string, string> = {
  desenho: 'Desenho',
  em_recomendacao: 'Em recomendação',
  em_aprovacao: 'Em aprovação',
  confirmada: 'Confirmada',
  em_montagem: 'Em montagem',
  aguardando_embarque: 'Aguardando embarque',
  em_andamento: 'Em andamento',
  pos_viagem: 'Pós-viagem',
  concluida: 'Concluída',
}

const ESTADO_COLOR: Record<string, string> = {
  desenho: 'bg-slate-100 text-slate-700',
  em_recomendacao: 'bg-blue-100 text-blue-700',
  em_aprovacao: 'bg-indigo-100 text-indigo-700',
  confirmada: 'bg-emerald-100 text-emerald-700',
  em_montagem: 'bg-violet-100 text-violet-700',
  aguardando_embarque: 'bg-amber-100 text-amber-700',
  em_andamento: 'bg-orange-100 text-orange-700',
  pos_viagem: 'bg-slate-100 text-slate-700',
  concluida: 'bg-slate-200 text-slate-800',
}

function formatBRL(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value ?? 0)
}

function formatDate(iso: string | null) {
  if (!iso) return null
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
}

interface NovaViagemModalProps {
  onClose: () => void
  onCreated: (id: string) => void
}

function NovaViagemModal({ onClose, onCreated }: NovaViagemModalProps) {
  const [titulo, setTitulo] = useState('')
  const criarViagem = useCriarViagem()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    criarViagem.mutate(
      { titulo: titulo || null, hidratar: false },
      {
        onSuccess: (result) => onCreated(result.id),
      },
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <h2 className="mb-4 text-base font-semibold text-slate-900">Nova viagem</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Título</label>
            <input
              type="text"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Ex: Paris — João e Maria"
              autoFocus
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <p className="text-xs text-slate-500">
            Você pode atrelar esta viagem a um card depois.
          </p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" size="sm" disabled={criarViagem.isPending}>
              {criarViagem.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Criar'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function ViagensPage() {
  const navigate = useNavigate()
  const [busca, setBusca] = useState('')
  const [estadoFiltro, setEstadoFiltro] = useState<ViagemEstado | null>(null)
  const [showModal, setShowModal] = useState(false)

  const { data: viagens, isLoading } = useViagensList({
    busca: busca || null,
    estado: estadoFiltro,
  })

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Viagens</h1>
          <p className="text-sm text-slate-500">Gerencie todas as viagens da equipe</p>
        </div>
        <Button size="sm" onClick={() => setShowModal(true)} className="gap-1.5">
          <Plus className="h-4 w-4" />
          Nova viagem
        </Button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 border-b border-slate-200 bg-white px-6 py-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar viagem..."
            className="w-full rounded-lg border border-slate-200 py-1.5 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <select
          value={estadoFiltro ?? ''}
          onChange={(e) => setEstadoFiltro((e.target.value as ViagemEstado) || null)}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="">Todos os estados</option>
          {Object.entries(ESTADO_LABEL).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
          </div>
        ) : !viagens?.length ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-500">
            <MapPin className="mb-3 h-10 w-10 text-slate-300" />
            <p className="font-medium">Nenhuma viagem encontrada</p>
            <p className="mt-1 text-sm">Crie uma viagem ou ajuste os filtros.</p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {viagens.map((v) => {
              const color = ESTADO_COLOR[v.estado] ?? 'bg-slate-100 text-slate-700'
              const label = ESTADO_LABEL[v.estado] ?? v.estado
              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => navigate(`/viagens/${v.id}`)}
                  className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-indigo-300 hover:shadow-md"
                >
                  {v.capa_url && (
                    <img
                      src={v.capa_url}
                      alt=""
                      className="h-24 w-full rounded-lg object-cover"
                    />
                  )}
                  <div className="flex items-start justify-between gap-2">
                    <p className="flex-1 font-medium text-slate-900 leading-tight">
                      {v.titulo || 'Viagem sem título'}
                    </p>
                    <Badge variant="outline" className={`${color} shrink-0 border-0 text-xs`}>
                      {label}
                    </Badge>
                  </div>
                  {v.subtitulo && (
                    <p className="text-xs text-slate-500">{v.subtitulo}</p>
                  )}
                  {v.card_titulo && (
                    <p className="text-xs text-indigo-600">🔗 {v.card_titulo}</p>
                  )}
                  {v.total_estimado > 0 && (
                    <p className="text-xs text-slate-500">
                      Total estimado:{' '}
                      <span className="font-medium text-slate-700">{formatBRL(v.total_estimado)}</span>
                    </p>
                  )}
                  <p className="text-xs text-slate-400">
                    Atualizado {formatDate(v.updated_at)}
                  </p>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {showModal && (
        <NovaViagemModal
          onClose={() => setShowModal(false)}
          onCreated={(id) => {
            setShowModal(false)
            navigate(`/viagens/${id}`)
          }}
        />
      )}
    </div>
  )
}
