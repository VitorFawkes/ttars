import { useState, useMemo } from 'react'
import { X, Copy, Check, Send, MessageCircle, Mail, Hand, Trash2, User, Search, UserPlus, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import { useCardPeople, type CardPerson } from '@/hooks/useCardPeople'
import { useContactSearch, type ContactSearchResult } from '@/hooks/useContactSearch'
import {
  useProposalRecipients,
  useAddProposalRecipient,
  useCreateContactAndAddRecipient,
  useRemoveProposalRecipient,
  useMarkRecipientSent,
  type ProposalRecipient,
} from '@/hooks/useProposalRecipients'

interface SendProposalDrawerProps {
  isOpen: boolean
  onClose: () => void
  proposalId: string
  cardId: string | null
}

function formatRelative(dateIso: string | null): string {
  if (!dateIso) return ''
  const ms = Date.now() - new Date(dateIso).getTime()
  const min = Math.floor(ms / 60000)
  if (min < 1) return 'agora'
  if (min < 60) return `há ${min}min`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `há ${hr}h`
  const d = Math.floor(hr / 24)
  return `há ${d}d`
}

function channelLabel(via: ProposalRecipient['sent_via']): string {
  switch (via) {
    case 'whatsapp':
      return 'WhatsApp'
    case 'email':
      return 'E-mail'
    case 'manual':
      return 'Manualmente'
    default:
      return ''
  }
}

export function SendProposalDrawer({
  isOpen,
  onClose,
  proposalId,
  cardId,
}: SendProposalDrawerProps) {
  const { people = [] } = useCardPeople(cardId ?? undefined)
  const { data: recipients = [], isLoading: recipientsLoading } =
    useProposalRecipients(isOpen ? proposalId : undefined)

  const addRecipient = useAddProposalRecipient()
  const removeRecipient = useRemoveProposalRecipient()
  const markSent = useMarkRecipientSent()

  const recipientContatoIds = useMemo(
    () => new Set(recipients.map((r) => r.contato_id)),
    [recipients],
  )

  // contatos do card que ainda não foram adicionados como recipient
  const availablePeople = useMemo(
    () => people.filter((p) => !recipientContatoIds.has(p.id)),
    [people, recipientContatoIds],
  )

  if (!isOpen) return null

  const handleAddCardPerson = (person: CardPerson) => {
    const isPrimary = person.role === 'primary' && recipients.length === 0
    addRecipient.mutate({ proposalId, contatoId: person.id, isPrimary })
  }

  const handleAddExistingContact = (contato: ContactSearchResult) => {
    if (recipientContatoIds.has(contato.id)) {
      toast.info(`${contato.nome} já está na lista`)
      return
    }
    addRecipient.mutate({
      proposalId,
      contatoId: contato.id,
      isPrimary: recipients.length === 0,
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
              <Send className="h-5 w-5 text-emerald-600" />
              Enviar proposta
            </h2>
            <p className="text-sm text-slate-500 mt-0.5">
              Cada destinatário recebe um link único e personalizado.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {/* Lista atual de destinatários */}
          {recipientsLoading ? (
            <div className="text-center py-6 text-sm text-slate-500">
              Carregando...
            </div>
          ) : recipients.length === 0 ? (
            <div className="text-center py-6 text-sm text-slate-500 border border-dashed border-slate-200 rounded-xl">
              Nenhum destinatário adicionado ainda. Escolha um dos contatos
              abaixo.
            </div>
          ) : (
            <div className="space-y-3">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Destinatários
              </h3>
              {recipients.map((r) => (
                <RecipientCard
                  key={r.id}
                  recipient={r}
                  onCopyLink={async () => {
                    const url = `${window.location.origin}/p/${r.recipient_token}`
                    await navigator.clipboard.writeText(url)
                    toast.success(
                      `Link de ${r.contato.nome} copiado!`,
                    )
                  }}
                  onMarkSent={(via) =>
                    markSent.mutate({ id: r.id, proposalId, sentVia: via })
                  }
                  onRemove={() =>
                    removeRecipient.mutate({ id: r.id, proposalId })
                  }
                />
              ))}
            </div>
          )}

          {/* Sugestões: contatos do card já vinculado (atalho) */}
          {availablePeople.length > 0 && (
            <div className="space-y-2 pt-2">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                {cardId ? 'Pessoas vinculadas a esse card' : 'Sugestões'}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {availablePeople.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => handleAddCardPerson(p)}
                    className="flex items-center gap-3 px-3 py-2.5 border border-slate-200 rounded-xl hover:border-emerald-400 hover:bg-emerald-50/40 transition-all text-left"
                  >
                    <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0">
                      <User className="h-4 w-4 text-slate-500" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-900 truncate">
                        {p.nome} {p.sobrenome ?? ''}
                      </p>
                      <p className="text-xs text-slate-500 truncate">
                        {p.role === 'primary' ? 'Titular' : 'Acompanhante'}
                        {p.email ? ` • ${p.email}` : ''}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Busca / criação rápida — funciona com ou sem card */}
          <ContactPicker
            proposalId={proposalId}
            existingContatoIds={recipientContatoIds}
            isFirstRecipient={recipients.length === 0}
            onPickedExisting={handleAddExistingContact}
          />
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-200 flex items-center justify-between">
          <p className="text-xs text-slate-500">
            Os links continuam válidos depois que você fechar.
          </p>
          <Button onClick={onClose} size="sm">
            Pronto
          </Button>
        </div>
      </div>
    </div>
  )
}

interface RecipientCardProps {
  recipient: ProposalRecipient
  onCopyLink: () => void
  onMarkSent: (via: 'whatsapp' | 'email' | 'manual') => void
  onRemove: () => void
}

function RecipientCard({
  recipient,
  onCopyLink,
  onMarkSent,
  onRemove,
}: RecipientCardProps) {
  const [showSentMenu, setShowSentMenu] = useState(false)
  const [justCopied, setJustCopied] = useState(false)

  const handleCopy = async () => {
    await onCopyLink()
    setJustCopied(true)
    setTimeout(() => setJustCopied(false), 1500)
  }

  const hasOpened = !!recipient.first_opened_at
  const wasSent = !!recipient.sent_at

  return (
    <div className="border border-slate-200 rounded-xl p-3 bg-white">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
          <User className="h-5 w-5 text-emerald-700" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-slate-900 truncate">
              {recipient.contato.nome} {recipient.contato.sobrenome ?? ''}
            </p>
            {recipient.is_primary && (
              <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-700 text-[10px] rounded font-medium">
                Titular
              </span>
            )}
          </div>
          {recipient.contato.email && (
            <p className="text-xs text-slate-500 truncate">
              {recipient.contato.email}
            </p>
          )}
          {/* Status */}
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
            {hasOpened ? (
              <span className="inline-flex items-center gap-1 text-emerald-700">
                <Check className="h-3 w-3" />
                Aberto {formatRelative(recipient.last_opened_at)}
                {recipient.open_count > 1 && ` (${recipient.open_count}x)`}
              </span>
            ) : wasSent ? (
              <span className="text-slate-500">
                Enviado {formatRelative(recipient.sent_at)} via{' '}
                {channelLabel(recipient.sent_via)} — ainda não abriu
              </span>
            ) : (
              <span className="text-amber-700">Não enviado ainda</span>
            )}
          </div>
        </div>
        <button
          onClick={onRemove}
          className="text-slate-300 hover:text-red-500 transition-colors"
          title="Remover destinatário"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      <div className="flex items-center gap-2 mt-3">
        <Button
          variant="outline"
          size="sm"
          onClick={handleCopy}
          className={cn(
            'gap-1.5 text-xs h-8 flex-1',
            justCopied && 'border-emerald-400 text-emerald-700',
          )}
        >
          {justCopied ? (
            <Check className="h-3.5 w-3.5" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
          {justCopied ? 'Copiado!' : 'Copiar link'}
        </Button>
        <div className="relative">
          <Button
            variant={wasSent ? 'ghost' : 'outline'}
            size="sm"
            onClick={() => setShowSentMenu(!showSentMenu)}
            className="gap-1.5 text-xs h-8"
          >
            <Send className="h-3.5 w-3.5" />
            {wasSent ? 'Marcar de novo' : 'Marcar enviado'}
          </Button>
          {showSentMenu && (
            <div className="absolute right-0 top-full mt-1 w-44 bg-white rounded-lg border border-slate-200 shadow-lg z-10 overflow-hidden">
              <button
                onClick={() => {
                  setShowSentMenu(false)
                  onMarkSent('whatsapp')
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                <MessageCircle className="h-4 w-4 text-emerald-600" />
                WhatsApp
              </button>
              <button
                onClick={() => {
                  setShowSentMenu(false)
                  onMarkSent('email')
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                <Mail className="h-4 w-4 text-blue-600" />
                E-mail
              </button>
              <button
                onClick={() => {
                  setShowSentMenu(false)
                  onMarkSent('manual')
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                <Hand className="h-4 w-4 text-slate-500" />
                Manualmente
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// ContactPicker — busca contato existente OU cria novo inline
// Funciona mesmo quando a proposta não tem card vinculado.
// ────────────────────────────────────────────────────────────────────────────
interface ContactPickerProps {
  proposalId: string
  existingContatoIds: Set<string>
  isFirstRecipient: boolean
  onPickedExisting: (c: ContactSearchResult) => void
}

function ContactPicker({
  proposalId,
  existingContatoIds,
  isFirstRecipient,
  onPickedExisting,
}: ContactPickerProps) {
  const [term, setTerm] = useState('')
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [draftNome, setDraftNome] = useState('')
  const [draftSobrenome, setDraftSobrenome] = useState('')
  const [draftEmail, setDraftEmail] = useState('')
  const [draftTelefone, setDraftTelefone] = useState('')

  const createContact = useCreateContactAndAddRecipient()

  const { data: results = [], isFetching } = useContactSearch(term, {
    limit: 6,
  })

  const trimmed = term.trim()
  const hasMinChars = trimmed.length >= 2
  const filteredResults = results.filter((r) => !existingContatoIds.has(r.id))

  const openCreateForm = () => {
    // Splitar nome / sobrenome a partir do que o consultor digitou
    const parts = trimmed.split(/\s+/)
    setDraftNome(parts[0] ?? '')
    setDraftSobrenome(parts.slice(1).join(' '))
    setDraftEmail('')
    setDraftTelefone('')
    setShowCreateForm(true)
  }

  const handleCreate = () => {
    if (!draftNome.trim()) {
      toast.error('Nome é obrigatório')
      return
    }
    createContact.mutate(
      {
        proposalId,
        isPrimary: isFirstRecipient,
        draft: {
          nome: draftNome,
          sobrenome: draftSobrenome,
          email: draftEmail,
          telefone: draftTelefone,
        },
      },
      {
        onSuccess: () => {
          setShowCreateForm(false)
          setTerm('')
          toast.success(`${draftNome} adicionado como destinatário!`)
        },
      },
    )
  }

  if (showCreateForm) {
    return (
      <div className="space-y-3 pt-2 border-t border-slate-100">
        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
          <UserPlus className="h-3.5 w-3.5" />
          Novo contato
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <input
            value={draftNome}
            onChange={(e) => setDraftNome(e.target.value)}
            placeholder="Nome*"
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-emerald-400"
            autoFocus
          />
          <input
            value={draftSobrenome}
            onChange={(e) => setDraftSobrenome(e.target.value)}
            placeholder="Sobrenome"
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-emerald-400"
          />
          <input
            value={draftEmail}
            onChange={(e) => setDraftEmail(e.target.value)}
            placeholder="E-mail (opcional)"
            type="email"
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-emerald-400"
          />
          <input
            value={draftTelefone}
            onChange={(e) => setDraftTelefone(e.target.value)}
            placeholder="Telefone (opcional)"
            type="tel"
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-emerald-400"
          />
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={handleCreate}
            disabled={createContact.isPending || !draftNome.trim()}
            className="gap-1.5 text-xs h-8"
          >
            {createContact.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Check className="h-3.5 w-3.5" />
            )}
            Criar e adicionar
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setShowCreateForm(false)}
            className="text-xs h-8"
          >
            Cancelar
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-2 pt-2 border-t border-slate-100">
      <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
        Buscar ou criar destinatário
      </h3>
      <div className="relative">
        <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Digite o nome, e-mail ou telefone..."
          className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-emerald-400"
        />
        {isFetching && hasMinChars && (
          <Loader2 className="h-4 w-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 animate-spin" />
        )}
      </div>

      {hasMinChars && filteredResults.length > 0 && (
        <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 overflow-hidden">
          {filteredResults.map((c) => (
            <button
              key={c.id}
              onClick={() => {
                onPickedExisting(c)
                setTerm('')
              }}
              className="w-full px-3 py-2 hover:bg-slate-50 flex items-center gap-3 text-left transition-colors"
            >
              <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0">
                <User className="h-4 w-4 text-slate-500" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-900 truncate">
                  {c.nome} {c.sobrenome ?? ''}
                </p>
                <p className="text-xs text-slate-500 truncate">
                  {c.email ?? c.telefone ?? '—'}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}

      {hasMinChars && filteredResults.length === 0 && !isFetching && (
        <button
          onClick={openCreateForm}
          className="w-full px-3 py-2.5 border border-dashed border-emerald-300 rounded-lg text-sm text-emerald-700 hover:bg-emerald-50 flex items-center gap-2 transition-colors"
        >
          <UserPlus className="h-4 w-4" />
          Criar novo contato: <strong>"{trimmed}"</strong>
        </button>
      )}

      {hasMinChars && filteredResults.length > 0 && (
        <button
          onClick={openCreateForm}
          className="text-xs text-slate-500 hover:text-emerald-700 flex items-center gap-1.5 px-1"
        >
          <UserPlus className="h-3 w-3" />
          Não é nenhum desses? Criar novo
        </button>
      )}

      {!hasMinChars && (
        <p className="text-xs text-slate-400 px-1">
          Digite pelo menos 2 letras pra buscar contatos do CRM, ou crie um novo.
        </p>
      )}
    </div>
  )
}
