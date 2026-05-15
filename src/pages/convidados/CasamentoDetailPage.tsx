import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  Heart,
  Calendar,
  MapPin,
  Globe,
  ExternalLink,
  Pencil,
  Trash2,
  Settings,
  CheckCircle2,
  MessageSquare,
  Save,
  Search,
  Check,
  X,
  Loader2,
  Plus,
} from 'lucide-react'
import { cn } from '../../lib/utils'
import { useWedding } from '../../hooks/convidados/useWedding'
import { useGuests } from '../../hooks/convidados/useGuests'
import { useUpdateWeddingEtapa } from '../../hooks/convidados/useUpdateWeddingEtapa'
import { NovoGuestModal } from '../../components/convidados/NovoGuestModal'
import { GuestKanbanBoard } from '../../components/convidados/guests/GuestKanbanBoard'
import { Button } from '../../components/ui/Button'

const MONTH_FULL = [
  'janeiro','fevereiro','março','abril','maio','junho',
  'julho','agosto','setembro','outubro','novembro','dezembro',
]

function longDate(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return `${String(d.getDate()).padStart(2, '0')} de ${MONTH_FULL[d.getMonth()]} de ${d.getFullYear()}`
}

function daysUntil(iso: string | null): number | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  d.setHours(0, 0, 0, 0)
  return Math.round((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

export default function CasamentoDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const cardId = id ?? null

  const { data: wedding, isLoading: loadingWedding, isError: errorWedding } = useWedding(cardId)
  const { data: guests = [], isLoading: loadingGuests } = useGuests(cardId)
  const cancelWedding = useUpdateWeddingEtapa()

  const [showAdd, setShowAdd] = useState(false)
  const [search, setSearch] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)

  if (loadingWedding) {
    return (
      <div className="px-6 py-8 flex items-center justify-center text-sm text-slate-500">
        <Loader2 className="w-4 h-4 animate-spin mr-2" /> Carregando casamento…
      </div>
    )
  }

  if (errorWedding || !wedding) {
    return (
      <div className="px-6 py-8">
        <button onClick={() => navigate('/convidados')} className="text-sm text-indigo-600 hover:underline mb-4">
          ← Voltar
        </button>
        <div className="bg-white border border-rose-200 text-rose-700 rounded-xl p-4 text-sm">
          Não consegui carregar este casamento.
        </div>
      </div>
    )
  }

  const dateLong = longDate(wedding.wedding_date)
  const days = daysUntil(wedding.wedding_date)

  const handleDelete = async () => {
    if (!cardId) return
    setConfirmDelete(false)
    await cancelWedding.mutateAsync({ cardId, etapa: 'cancelado' })
    navigate('/convidados')
  }

  return (
    <div className="h-full px-6 py-4 flex flex-col gap-4 overflow-hidden">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <button
            onClick={() => navigate('/convidados')}
            className="mt-1 p-1.5 rounded-md hover:bg-slate-100 text-slate-500 shrink-0"
            aria-label="Voltar"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <Heart className="w-7 h-7 text-rose-500 fill-rose-500 shrink-0" />
              <h1 className="text-2xl font-bold text-slate-900 break-words">{wedding.titulo}</h1>
            </div>
            <div className="flex items-center gap-3 mt-2 flex-wrap text-sm text-slate-600">
              {dateLong && (
                <span className="inline-flex items-center gap-1.5">
                  <Calendar className="w-4 h-4 text-slate-400" />
                  {dateLong}
                </span>
              )}
              {wedding.local && (
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="w-4 h-4 text-slate-400" />
                  {wedding.local}
                </span>
              )}
              {days !== null && (
                <span
                  className={cn(
                    'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border',
                    days < 0
                      ? 'bg-slate-100 text-slate-600 border-slate-200'
                      : 'bg-sky-50 text-sky-700 border-sky-200',
                  )}
                >
                  {days < 0 ? 'Passado' : days === 0 ? 'Hoje' : `Faltam ${days} ${days === 1 ? 'dia' : 'dias'}`}
                </span>
              )}
            </div>
            {wedding.site_url && (
              <a
                href={wedding.site_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm text-indigo-600 hover:underline mt-1"
              >
                <Globe className="w-3.5 h-3.5" /> Site do Casamento
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <a
            href={`/cards/${wedding.id}`}
            target="_blank"
            rel="noopener noreferrer"
            title="Abrir card em nova aba"
            className="inline-flex items-center justify-center gap-1.5 h-9 rounded-md px-3 text-sm font-medium border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors"
          >
            <ExternalLink className="w-4 h-4" /> Acessar card
          </a>
          <Button variant="outline" size="sm" className="gap-1.5" disabled>
            <Pencil className="w-4 h-4" /> Editar
          </Button>
          <div className="relative">
            <Button
              variant="destructive"
              size="sm"
              className="gap-1.5"
              onClick={() => setConfirmDelete(c => !c)}
              disabled={cancelWedding.isPending}
            >
              <Trash2 className="w-4 h-4" /> Excluir
            </Button>
            {confirmDelete && (
              <div className="absolute right-0 top-full mt-1 z-20 w-72 bg-white border border-slate-200 shadow-lg rounded-lg p-3">
                <p className="text-xs text-slate-700 mb-2">
                  Mover este casamento para etapa <strong>Cancelado</strong>?
                </p>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(false)}
                    className="inline-flex items-center gap-1 px-2 py-1 text-xs text-slate-600 hover:text-slate-900 rounded-md"
                  >
                    <X className="w-3 h-3" /> Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleDelete}
                    className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-white bg-rose-600 hover:bg-rose-700 rounded-md"
                  >
                    <Check className="w-3 h-3" /> Confirmar
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Configuração do Fluxo — placeholder */}
      <section className="bg-white border border-slate-200 rounded-xl p-4">
        <header className="flex items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-slate-500" />
            <h2 className="text-base font-semibold text-slate-900">Configuração do Fluxo</h2>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 uppercase">
              <CheckCircle2 className="w-3 h-3" /> Configurado
            </span>
          </div>
        </header>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-1">
            <label className="text-xs font-medium text-slate-700">Posição Inicial no Fluxo</label>
            <select
              disabled
              className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-md text-sm bg-slate-50 text-slate-500 cursor-not-allowed"
              title="Em breve"
            >
              <option>Em breve</option>
            </select>
          </div>
          <div className="md:col-span-1">
            <label className="text-xs font-medium text-slate-700">Data de Início</label>
            <input
              type="date"
              disabled
              className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-md text-sm bg-slate-50 text-slate-500 cursor-not-allowed"
              title="Em breve"
            />
          </div>
          <div className="md:col-span-1 flex flex-col gap-2 justify-end">
            <Button variant="default" size="sm" className="gap-1.5" disabled>
              <Save className="w-4 h-4" /> Salvar Configuração
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5" disabled>
              <MessageSquare className="w-4 h-4" /> Ver Preview
            </Button>
          </div>
        </div>
        <p className="text-[11px] text-slate-400 mt-3">A configuração do fluxo de cadência será habilitada em breve.</p>
      </section>

      {/* Busca + Novo convidado */}
      <div className="flex items-center gap-2">
        <div className="flex-1 relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome ou telefone..."
            className="w-full pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 bg-white"
          />
        </div>
        <Button onClick={() => setShowAdd(true)} className="gap-1.5">
          <Plus className="w-4 h-4" /> Novo convidado
        </Button>
      </div>

      {/* Kanban — ocupa o resto da viewport, com scroll dentro de cada coluna */}
      {loadingGuests ? (
        <div className="p-6 text-center text-sm text-slate-500">
          <Loader2 className="w-4 h-4 animate-spin inline mr-2" /> Carregando convidados…
        </div>
      ) : (
        <div className="flex-1 min-h-0">
          <GuestKanbanBoard guests={guests} search={search} />
        </div>
      )}

      {showAdd && (
        <NovoGuestModal
          isOpen={showAdd}
          onClose={() => setShowAdd(false)}
          defaultCardId={cardId ?? undefined}
          lockedCard
        />
      )}
    </div>
  )
}
