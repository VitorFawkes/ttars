import { useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { Button } from '../ui/Button'
import { useWeddings } from '../../hooks/convidados/useWeddings'
import { useCreateGuest } from '../../hooks/convidados/useGuestMutations'

interface NovoGuestModalProps {
  isOpen: boolean
  onClose: () => void
  defaultCardId?: string
  lockedCard?: boolean
}

export function NovoGuestModal({ isOpen, onClose, defaultCardId, lockedCard }: NovoGuestModalProps) {
  const { data: weddings = [], isLoading: loadingWeddings } = useWeddings()
  const { mutateAsync, isPending } = useCreateGuest()

  const [cardId, setCardId] = useState(defaultCardId ?? '')
  const [nome, setNome] = useState('')
  const [sobrenome, setSobrenome] = useState('')
  const [telefone, setTelefone] = useState('')
  const [email, setEmail] = useState('')
  const [observacoes, setObservacoes] = useState('')
  const [error, setError] = useState<string | null>(null)

  if (!isOpen) return null

  const lockedWedding = lockedCard
    ? weddings.find(w => w.id === defaultCardId)
    : null

  const resetForm = () => {
    setCardId(defaultCardId ?? '')
    setNome('')
    setSobrenome('')
    setTelefone('')
    setEmail('')
    setObservacoes('')
    setError(null)
  }

  const close = () => {
    resetForm()
    onClose()
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!cardId) {
      setError('Selecione um casamento.')
      return
    }
    if (nome.trim().length === 0) {
      setError('Nome é obrigatório.')
      return
    }
    try {
      await mutateAsync({
        card_id: cardId,
        nome,
        sobrenome: sobrenome || null,
        telefone: telefone || null,
        email: email || null,
        observacoes: observacoes || null,
      })
      close()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar')
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md bg-white border border-slate-200 shadow-lg rounded-xl flex flex-col max-h-[90vh]"
      >
        <header className="flex items-center justify-between gap-3 px-5 py-3 border-b border-slate-200">
          <h2 className="text-base font-semibold text-slate-900">Novo convidado</h2>
          <button
            type="button"
            onClick={close}
            className="p-1 rounded hover:bg-slate-100 text-slate-500"
            aria-label="Fechar"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          <Field label="Casamento" required>
            {lockedCard && lockedWedding ? (
              <div className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-md text-sm text-slate-700">
                {lockedWedding.titulo}
              </div>
            ) : (
              <select
                value={cardId}
                onChange={e => setCardId(e.target.value)}
                disabled={loadingWeddings}
                className="w-full px-3 py-2 border border-slate-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500"
              >
                <option value="">Selecione…</option>
                {weddings.map(w => (
                  <option key={w.id} value={w.id}>{w.titulo}</option>
                ))}
              </select>
            )}
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Nome" required>
              <input
                type="text"
                value={nome}
                onChange={e => setNome(e.target.value)}
                autoFocus
                maxLength={200}
                className="w-full px-3 py-2 border border-slate-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500"
              />
            </Field>
            <Field label="Sobrenome">
              <input
                type="text"
                value={sobrenome}
                onChange={e => setSobrenome(e.target.value)}
                maxLength={200}
                className="w-full px-3 py-2 border border-slate-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500"
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Telefone">
              <input
                type="tel"
                value={telefone}
                onChange={e => setTelefone(e.target.value)}
                maxLength={50}
                placeholder="(11) 99999-9999"
                className="w-full px-3 py-2 border border-slate-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500"
              />
            </Field>
            <Field label="Email">
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                maxLength={200}
                placeholder="convidado@email.com"
                className="w-full px-3 py-2 border border-slate-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500"
              />
            </Field>
          </div>

          <Field label="Observações">
            <textarea
              value={observacoes}
              onChange={e => setObservacoes(e.target.value)}
              maxLength={2000}
              rows={3}
              className="w-full px-3 py-2 border border-slate-200 rounded-md text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500"
            />
          </Field>

          {error && (
            <div className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-md px-3 py-2">
              {error}
            </div>
          )}
        </div>

        <footer className="flex items-center justify-end gap-2 px-5 py-3 border-t border-slate-200 bg-slate-50">
          <Button type="button" variant="outline" size="sm" onClick={close}>Cancelar</Button>
          <Button type="submit" variant="default" size="sm" disabled={isPending}>
            {isPending ? 'Salvando…' : 'Adicionar'}
          </Button>
        </footer>
      </form>
    </div>,
    document.body,
  )
}

interface FieldProps {
  label: string
  required?: boolean
  children: React.ReactNode
}

function Field({ label, required, children }: FieldProps) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-slate-700">
        {label} {required && <span className="text-rose-600">*</span>}
      </span>
      {children}
    </label>
  )
}
