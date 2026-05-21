import { useEffect, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { X, Trash2 } from 'lucide-react'
import { Button } from '../ui/Button'
import { useUpdateGuest, useDeleteGuest } from '../../hooks/convidados/useGuestMutations'
import { STATUS_RSVP_LABEL, STATUS_RSVP_LIST, type Guest, type StatusRSVP } from '../../hooks/convidados/types'

interface GuestDetailModalProps {
  guest: Guest
  isOpen: boolean
  onClose: () => void
}

export function GuestDetailModal({ guest, isOpen, onClose }: GuestDetailModalProps) {
  const { mutateAsync: updateAsync, isPending: isSaving } = useUpdateGuest()
  const { mutateAsync: deleteAsync, isPending: isDeleting } = useDeleteGuest()

  const [nome, setNome] = useState(guest.nome)
  const [sobrenome, setSobrenome] = useState(guest.sobrenome ?? '')
  const [telefone, setTelefone] = useState(guest.telefone ?? '')
  const [email, setEmail] = useState(guest.email ?? '')
  const [statusRsvp, setStatusRsvp] = useState<StatusRSVP>(guest.status_rsvp)
  const [observacoes, setObservacoes] = useState(guest.observacoes ?? '')
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    setNome(guest.nome)
    setSobrenome(guest.sobrenome ?? '')
    setTelefone(guest.telefone ?? '')
    setEmail(guest.email ?? '')
    setStatusRsvp(guest.status_rsvp)
    setObservacoes(guest.observacoes ?? '')
    setError(null)
    setConfirmDelete(false)
  }, [guest])

  if (!isOpen) return null

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (nome.trim().length === 0) {
      setError('Nome é obrigatório.')
      return
    }
    try {
      await updateAsync({
        id: guest.id,
        contatoId: guest.contato_id,
        patch: {
          nome,
          sobrenome: sobrenome || null,
          telefone: telefone || null,
          email: email || null,
          status_rsvp: statusRsvp,
          observacoes: observacoes || null,
        },
      })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar')
    }
  }

  const handleDelete = async () => {
    try {
      await deleteAsync({ id: guest.id })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao remover')
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md bg-white border border-slate-200 shadow-lg rounded-xl flex flex-col max-h-[90vh]"
      >
        <header className="flex items-center justify-between gap-3 px-5 py-3 border-b border-slate-200">
          <h2 className="text-base font-semibold text-slate-900">Editar convidado</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-slate-100 text-slate-500"
            aria-label="Fechar"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Nome" required>
              <input
                type="text"
                value={nome}
                onChange={e => setNome(e.target.value)}
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
                className="w-full px-3 py-2 border border-slate-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500"
              />
            </Field>
            <Field label="Email">
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                maxLength={200}
                className="w-full px-3 py-2 border border-slate-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500"
              />
            </Field>
          </div>

          <Field label="RSVP">
            <select
              value={statusRsvp}
              onChange={e => setStatusRsvp(e.target.value as StatusRSVP)}
              className="w-full px-3 py-2 border border-slate-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500"
            >
              {STATUS_RSVP_LIST.map(s => (
                <option key={s} value={s}>{STATUS_RSVP_LABEL[s]}</option>
              ))}
            </select>
          </Field>

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

        <footer className="flex items-center justify-between gap-2 px-5 py-3 border-t border-slate-200 bg-slate-50">
          {confirmDelete ? (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-700">Remover este convidado?</span>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={handleDelete}
                disabled={isDeleting}
              >
                {isDeleting ? 'Removendo…' : 'Confirmar'}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setConfirmDelete(false)}
              >
                Cancelar
              </Button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="inline-flex items-center gap-1.5 px-2 py-1.5 text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-md transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Remover
            </button>
          )}
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>Cancelar</Button>
            <Button type="submit" variant="default" size="sm" disabled={isSaving}>
              {isSaving ? 'Salvando…' : 'Salvar'}
            </Button>
          </div>
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
