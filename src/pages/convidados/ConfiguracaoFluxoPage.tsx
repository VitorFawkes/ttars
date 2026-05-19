import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Calendar, Save, RotateCcw, Settings, Plus, Pencil, Trash2, Check, X } from 'lucide-react'
import { cn } from '../../lib/utils'
import { Button } from '../../components/ui/Button'
import {
  FLUXO_CATEGORIAS,
  computeFluxoMessages,
  computeFluxoTotalDays,
  totalFluxoMessages,
  useFluxoConfig,
  type FluxoCategoria,
  type FluxoVariation,
} from '../../hooks/convidados/useFluxoConfig'

const MONTH_FULL = [
  'janeiro','fevereiro','março','abril','maio','junho',
  'julho','agosto','setembro','outubro','novembro','dezembro',
]

function formatShortDate(d: Date): string {
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

function formatLongDay(d: Date): string {
  return `${String(d.getDate()).padStart(2, '0')} de ${MONTH_FULL[d.getMonth()]}`
}

export default function ConfiguracaoFluxoPage() {
  const navigate = useNavigate()
  const {
    flows,
    activeId,
    active,
    draft,
    setField,
    save,
    resetToDefault,
    selectFlow,
    createFlow,
    renameFlow,
    deleteFlow,
    hasUnsavedChanges,
    canDelete,
  } = useFluxoConfig()

  const today = useMemo(() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d
  }, [])

  const messages = useMemo(() => computeFluxoMessages(draft, today), [draft, today])
  const totalDays = useMemo(() => computeFluxoTotalDays(draft), [draft])
  const totalMessages = totalFluxoMessages()

  return (
    <div className="px-6 py-4 flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <button
          onClick={() => navigate('/convidados')}
          className="mt-1 p-1.5 rounded-md hover:bg-slate-100 text-slate-500 shrink-0"
          aria-label="Voltar"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold text-slate-900">Configurações do Fluxo</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Crie variações de fluxo com diferentes intervalos entre mensagens
          </p>
        </div>
      </div>

      <FlowSelector
        flows={flows}
        activeId={activeId}
        active={active}
        canDelete={canDelete}
        hasUnsavedChanges={hasUnsavedChanges}
        onSelect={selectFlow}
        onCreate={createFlow}
        onRename={renameFlow}
        onDelete={deleteFlow}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Coluna esquerda — Intervalos */}
        <div className="flex flex-col gap-4">
          <section className="bg-white border border-slate-200 rounded-xl p-5">
            <header className="flex items-center gap-2 mb-4">
              <Settings className="w-5 h-5 text-slate-500" />
              <h2 className="text-lg font-semibold text-slate-900">
                Intervalos por Categoria
                <span className="text-slate-400 font-normal text-sm"> · {active.name}</span>
              </h2>
            </header>

            <div className="flex flex-col gap-5">
              {FLUXO_CATEGORIAS.map(cat => (
                <CategoriaField
                  key={cat.slug}
                  categoria={cat}
                  value={draft[cat.slug]}
                  onChange={(n) => setField(cat.slug, n)}
                />
              ))}
            </div>

            <div className="flex items-center gap-2 mt-6">
              <Button onClick={save} disabled={!hasUnsavedChanges} className="flex-1 gap-1.5">
                <Save className="w-4 h-4" /> Salvar
              </Button>
              <Button onClick={resetToDefault} variant="outline" className="gap-1.5">
                <RotateCcw className="w-4 h-4" /> Padrão
              </Button>
            </div>
            {hasUnsavedChanges && (
              <p className="text-[11px] text-amber-600 mt-2">
                Você tem alterações não salvas neste fluxo.
              </p>
            )}
          </section>

          <section className="bg-slate-100 border border-slate-200 rounded-xl p-4">
            <p className="text-sm font-medium text-slate-700">Duração Total do Fluxo</p>
            <p className="text-3xl font-bold text-slate-900 tabular-nums mt-1">{totalDays} dias</p>
            <p className="text-xs text-slate-500 mt-1">
              Do início ao fim das {totalMessages} mensagens
            </p>
          </section>
        </div>

        {/* Coluna direita — Preview */}
        <section className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col">
          <header className="flex items-center gap-2 mb-3">
            <Calendar className="w-5 h-5 text-slate-500" />
            <h2 className="text-lg font-semibold text-slate-900">Preview do Fluxo</h2>
          </header>
          <p className="text-xs text-slate-500 mb-3">Iniciando em {formatLongDay(today)}:</p>

          <ol className="flex flex-col gap-1.5 max-h-[560px] overflow-y-auto pr-2">
            {messages.map(msg => (
              <li
                key={msg.slug}
                className={cn(
                  'flex items-center justify-between gap-3 px-3 py-2 rounded-md',
                  msg.categoria.bgLight,
                )}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-mono text-[11px] text-slate-500 shrink-0 tabular-nums">
                    #{String(msg.index).padStart(2, '0')}
                  </span>
                  <span className={cn('text-sm font-semibold truncate', msg.categoria.text)}>
                    {msg.slug}
                  </span>
                </div>
                <span className={cn('text-xs tabular-nums shrink-0', msg.categoria.text)}>
                  {formatShortDate(msg.date)}
                </span>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────
// Flow selector — chips horizontais + ações (Novo / Renomear / Excluir)
// ────────────────────────────────────────────────────────────────────────

interface FlowSelectorProps {
  flows: FluxoVariation[]
  activeId: string
  active: FluxoVariation
  canDelete: boolean
  hasUnsavedChanges: boolean
  onSelect: (id: string) => void
  onCreate: (name: string) => string
  onRename: (id: string, name: string) => void
  onDelete: (id: string) => void
}

function FlowSelector({
  flows,
  activeId,
  active,
  canDelete,
  hasUnsavedChanges,
  onSelect,
  onCreate,
  onRename,
  onDelete,
}: FlowSelectorProps) {
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const handleCreate = () => {
    if (!newName.trim()) {
      setCreating(false)
      return
    }
    onCreate(newName.trim())
    setNewName('')
    setCreating(false)
  }

  const handleRename = () => {
    const nm = renameValue.trim()
    if (!nm || nm === active.name) {
      setRenaming(false)
      return
    }
    onRename(active.id, nm)
    setRenaming(false)
  }

  const startRename = () => {
    setRenameValue(active.name)
    setRenaming(true)
  }

  const confirmDelete = () => {
    onDelete(active.id)
    setConfirmingDelete(false)
  }

  return (
    <section className="bg-white border border-slate-200 rounded-xl p-3 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-slate-500 mr-1">Fluxos:</span>
          {flows.map(flow => {
            const isActive = flow.id === activeId
            return (
              <button
                key={flow.id}
                type="button"
                onClick={() => {
                  if (hasUnsavedChanges && !isActive) {
                    const ok = window.confirm(
                      `Você tem alterações não salvas em "${active.name}". Trocar para "${flow.name}" e descartar as mudanças?`,
                    )
                    if (!ok) return
                  }
                  onSelect(flow.id)
                }}
                className={cn(
                  'inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium border transition-colors',
                  isActive
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50',
                )}
              >
                {flow.name}
              </button>
            )
          })}
          {creating ? (
            <div className="inline-flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-full pl-2 pr-1 py-0.5">
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreate()
                  if (e.key === 'Escape') { setCreating(false); setNewName('') }
                }}
                placeholder="Nome do fluxo"
                maxLength={50}
                className="text-xs bg-transparent focus:outline-none w-32 placeholder:text-slate-400"
              />
              <button
                type="button"
                onClick={handleCreate}
                className="h-5 w-5 inline-flex items-center justify-center rounded-full text-emerald-600 hover:bg-emerald-50"
                aria-label="Criar"
              >
                <Check className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={() => { setCreating(false); setNewName('') }}
                className="h-5 w-5 inline-flex items-center justify-center rounded-full text-slate-500 hover:bg-slate-100"
                aria-label="Cancelar"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-medium border border-dashed border-slate-300 text-slate-600 hover:bg-slate-50 hover:text-slate-900"
            >
              <Plus className="w-3 h-3" /> Novo fluxo
            </button>
          )}
        </div>

        <div className="flex items-center gap-1">
          {renaming ? (
            <div className="inline-flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-md pl-2 pr-1 py-0.5">
              <input
                autoFocus
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleRename()
                  if (e.key === 'Escape') setRenaming(false)
                }}
                maxLength={50}
                className="text-xs bg-transparent focus:outline-none w-40"
              />
              <button
                type="button"
                onClick={handleRename}
                className="h-5 w-5 inline-flex items-center justify-center rounded text-emerald-600 hover:bg-emerald-50"
                aria-label="Confirmar"
              >
                <Check className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={() => setRenaming(false)}
                className="h-5 w-5 inline-flex items-center justify-center rounded text-slate-500 hover:bg-slate-100"
                aria-label="Cancelar"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={startRename}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs text-slate-600 hover:text-slate-900 hover:bg-slate-50"
              title="Renomear"
            >
              <Pencil className="w-3.5 h-3.5" /> Renomear
            </button>
          )}
          <div className="relative">
            <button
              type="button"
              onClick={() => canDelete && setConfirmingDelete(c => !c)}
              disabled={!canDelete}
              className={cn(
                'inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs',
                canDelete
                  ? 'text-rose-600 hover:text-rose-700 hover:bg-rose-50'
                  : 'text-slate-300 cursor-not-allowed',
              )}
              title={canDelete ? 'Excluir este fluxo' : 'Não dá pra excluir o último fluxo'}
            >
              <Trash2 className="w-3.5 h-3.5" /> Excluir
            </button>
            {confirmingDelete && (
              <div className="absolute right-0 top-full mt-1 z-20 w-64 bg-white border border-slate-200 shadow-lg rounded-lg p-3">
                <p className="text-xs text-slate-700 mb-2">
                  Excluir o fluxo <strong>{active.name}</strong>? Esta ação não pode ser desfeita.
                </p>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmingDelete(false)}
                    className="inline-flex items-center gap-1 px-2 py-1 text-xs text-slate-600 hover:text-slate-900 rounded-md"
                  >
                    <X className="w-3 h-3" /> Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={confirmDelete}
                    className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-white bg-rose-600 hover:bg-rose-700 rounded-md"
                  >
                    <Check className="w-3 h-3" /> Excluir
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}

interface CategoriaFieldProps {
  categoria: FluxoCategoria
  value: number
  onChange: (n: number) => void
}

function CategoriaField({ categoria, value, onChange }: CategoriaFieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <span className={cn('w-2.5 h-2.5 rounded-full shrink-0', categoria.dot)} />
        <h3 className="text-sm font-semibold text-slate-900">
          {categoria.label} <span className="text-slate-400 font-normal">({categoria.description})</span>
        </h3>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="number"
          min={1}
          max={365}
          value={value}
          onChange={(e) => onChange(parseInt(e.target.value || '0', 10))}
          className="w-20 px-3 py-2 border border-slate-200 rounded-md text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500"
        />
        <span className="text-sm text-slate-700">dias entre mensagens</span>
      </div>
      <p className="text-xs text-slate-500">
        {categoria.count} mensagens com intervalos de {value} {value === 1 ? 'dia' : 'dias'}
      </p>
    </div>
  )
}
