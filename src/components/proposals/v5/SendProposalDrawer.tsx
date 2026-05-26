import { useState, useMemo } from 'react'
import { X, Copy, Check, Send, MessageCircle, Mail, Hand, Trash2, User, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import { useCardPeople, type CardPerson } from '@/hooks/useCardPeople'
import {
  useProposalRecipients,
  useAddProposalRecipient,
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

  // contatos do card que ainda não foram adicionados como recipient
  const availablePeople = useMemo(() => {
    const recipientIds = new Set(recipients.map((r) => r.contato_id))
    return people.filter((p) => !recipientIds.has(p.id))
  }, [people, recipients])

  if (!isOpen) return null

  const handleAdd = (person: CardPerson) => {
    const isPrimary = person.role === 'primary' && recipients.length === 0
    addRecipient.mutate({ proposalId, contatoId: person.id, isPrimary })
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

          {/* Contatos disponíveis pra adicionar */}
          {availablePeople.length > 0 && (
            <div className="space-y-2 pt-2">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                {recipients.length === 0
                  ? 'Contatos do card'
                  : 'Adicionar outro contato'}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {availablePeople.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => handleAdd(p)}
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

          {people.length === 0 && (
            <div className="flex items-start gap-2 px-3 py-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
              <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
              <span>
                Esse card ainda não tem contatos vinculados. Adicione contatos
                ao card pra poder mandar uma proposta personalizada.
              </span>
            </div>
          )}
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
