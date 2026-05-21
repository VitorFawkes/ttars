import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { X, CheckCircle2, AlertTriangle, Phone, Loader2, RefreshCw } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { sbAny } from '../../../hooks/convidados/_supabaseUntyped'
import { cn } from '../../../lib/utils'

interface RelatorioEnvioModalProps {
  open: boolean
  onClose: () => void
  loteId: string
  weddingTitulo: string
  templateSlug: string
}

interface MessageRow {
  id: string
  contact_id: string | null
  whatsapp_message_id: string | null
  has_error: boolean | null
  error_message: string | null
  ack_status: number | null
  status: string | null
  sender_phone: string | null
  created_at: string
  metadata: {
    body_parameters?: string[]
    button_parameters?: string[]
  } | null
  contatos: {
    nome: string | null
    sobrenome: string | null
    telefone: string | null
  } | null
}

interface LoteRow {
  id: string
  card_id: string
  org_id: string
  status: 'enviando' | 'concluido' | 'erro'
  total: number
  sent: number
  failed: number
  started_at: string
  finished_at: string | null
  template_slug: string
  phone_number_id: string
}

const ACK_LABEL: Record<number, string> = {
  0: 'Pendente',
  2: 'Enviada',
  3: 'Entregue',
  4: 'Lida',
}

export function RelatorioEnvioModal({ open, onClose, loteId, weddingTitulo, templateSlug }: RelatorioEnvioModalProps) {
  const [resending, setResending] = useState(false)

  const loteQuery = useQuery<LoteRow | null>({
    queryKey: ['envio-lote-detail', loteId],
    enabled: open && !!loteId,
    queryFn: async () => {
      const { data, error } = await sbAny
        .from('envio_lotes')
        .select('id, card_id, org_id, status, total, sent, failed, started_at, finished_at, template_slug, phone_number_id')
        .eq('id', loteId)
        .maybeSingle()
      if (error) throw error
      return data as LoteRow | null
    },
  })

  const messagesQuery = useQuery<MessageRow[]>({
    queryKey: ['envio-lote-messages', loteId],
    enabled: open && !!loteId,
    queryFn: async () => {
      const { data, error } = await sbAny
        .from('whatsapp_messages')
        .select('id, contact_id, whatsapp_message_id, has_error, error_message, ack_status, status, sender_phone, created_at, metadata, contatos:contact_id(nome, sobrenome, telefone)')
        .eq('metadata->>envio_lote_id', loteId)
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data ?? []) as MessageRow[]
    },
  })

  const failedMessages = (messagesQuery.data ?? []).filter(m => m.has_error)

  const handleResend = async () => {
    const lote = loteQuery.data
    if (!lote || failedMessages.length === 0 || resending) return
    setResending(true)
    try {
      // Monta recipients a partir dos failed messages do lote
      const recipients = failedMessages
        .map(m => {
          const tel = (m.sender_phone || m.contatos?.telefone || '').replace(/\D/g, '')
          if (!tel || !m.contact_id) return null
          return {
            to: tel,
            contact_id: m.contact_id,
            body_parameters: m.metadata?.body_parameters ?? [],
            button_parameters: m.metadata?.button_parameters ?? undefined,
          }
        })
        .filter((r): r is NonNullable<typeof r> => r !== null)

      if (recipients.length === 0) {
        setResending(false)
        return
      }

      const CHUNK = 50
      for (let i = 0; i < recipients.length; i += CHUNK) {
        await supabase.functions.invoke('send-echo-template', {
          body: {
            template_name: lote.template_slug,
            language: 'pt_BR',
            phone_number_id: lote.phone_number_id,
            card_id: lote.card_id,
            org_id: lote.org_id,
            recipients: recipients.slice(i, i + CHUNK),
          },
        })
      }
      onClose()
    } catch (err) {
      console.error('[resend] falha:', err)
    } finally {
      setResending(false)
    }
  }

  if (!open) return null

  const lote = loteQuery.data
  const messages = messagesQuery.data ?? []
  const enviando = lote?.status === 'enviando'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Relatório do envio</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {weddingTitulo} · <code className="bg-slate-100 px-1.5 py-0.5 rounded text-[11px]">{templateSlug}</code>
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Resumo */}
        <div className="px-6 py-4 border-b border-slate-200 grid grid-cols-3 gap-4">
          <Stat label="Total" value={messages.length || (lote?.total ?? 0)} tone="slate" />
          <Stat label="Enviadas" value={messages.filter(m => !m.has_error).length} tone="emerald" />
          <Stat label="Falhas" value={failedMessages.length} tone={failedMessages.length > 0 ? 'rose' : 'slate'} />
        </div>

        {enviando && (
          <div className="px-6 py-3 bg-indigo-50 border-b border-indigo-100 flex items-center gap-2 text-sm text-indigo-700">
            <Loader2 className="w-4 h-4 animate-spin" />
            Disparo em andamento — a lista atualiza sozinha.
          </div>
        )}

        {/* Lista de mensagens */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {messagesQuery.isLoading ? (
            <div className="text-center text-sm text-slate-500 py-8">Carregando…</div>
          ) : messages.length === 0 ? (
            <div className="text-center text-sm text-slate-500 py-8">
              {enviando ? 'Ainda nenhuma mensagem registrada.' : 'Sem registros de mensagens.'}
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {messages.map(m => {
                const nome = m.contatos?.nome ?? '(sem nome)'
                const sobre = m.contatos?.sobrenome ?? ''
                const tel = m.contatos?.telefone ?? ''
                const ackLabel = m.ack_status != null ? ACK_LABEL[m.ack_status] : null
                return (
                  <li key={m.id} className="py-2 flex items-start gap-3">
                    {m.has_error ? (
                      <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                    ) : (
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="font-medium text-slate-900 truncate">{nome}{sobre ? ` ${sobre}` : ''}</span>
                        {tel && (
                          <span className="text-xs text-slate-500 inline-flex items-center gap-1">
                            <Phone className="w-3 h-3" /> {tel}
                          </span>
                        )}
                      </div>
                      {m.has_error ? (
                        <p className="text-xs text-rose-700 mt-0.5">{m.error_message ?? 'Falha sem motivo registrado'}</p>
                      ) : ackLabel ? (
                        <p className="text-xs text-slate-500 mt-0.5">Status: <span className="font-medium text-slate-700">{ackLabel}</span></p>
                      ) : (
                        <p className="text-xs text-emerald-700 mt-0.5">Enviada com sucesso</p>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <div className="flex justify-between items-center px-6 py-3 border-t border-slate-200 gap-2">
          <div className="text-xs text-slate-500">
            {failedMessages.length > 0
              ? `${failedMessages.length} ${failedMessages.length === 1 ? 'falha pode' : 'falhas podem'} ser reenviada${failedMessages.length === 1 ? '' : 's'}`
              : ''}
          </div>
          <div className="flex items-center gap-2">
            {failedMessages.length > 0 && !enviando && (
              <button
                type="button"
                onClick={handleResend}
                disabled={resending}
                className={cn(
                  'inline-flex items-center gap-1.5 h-9 px-3 text-sm font-medium text-white rounded-md transition-colors',
                  resending ? 'bg-indigo-300 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700',
                )}
              >
                {resending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                Reenviar falhas ({failedMessages.length})
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="h-9 px-4 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50"
            >
              Fechar
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

interface StatProps {
  label: string
  value: number
  tone: 'slate' | 'emerald' | 'rose'
}

function Stat({ label, value, tone }: StatProps) {
  const toneClass = {
    slate: 'text-slate-700',
    emerald: 'text-emerald-600',
    rose: 'text-rose-600',
  }[tone]
  return (
    <div className="text-center">
      <div className={cn('text-2xl font-bold tabular-nums', toneClass)}>{value}</div>
      <div className="text-xs text-slate-500 mt-0.5">{label}</div>
    </div>
  )
}
