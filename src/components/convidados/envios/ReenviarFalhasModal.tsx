import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { X, Send, Loader2, GripVertical } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { AVAILABLE_FIELDS, type FieldDescriptor, type FieldKey } from '../../../hooks/convidados/useTemplateVarConfig'
import { cn } from '../../../lib/utils'

interface FailedMessage {
  id: string
  contact_id: string | null
  contact_name: string
  contato: { nome: string | null; sobrenome: string | null; telefone: string | null; email: string | null }
  telefone: string
  body_parameters: string[]
  button_parameter: string
}

interface CardExtras {
  titulo: string
  data_viagem_inicio: string | null
  produto_data: Record<string, unknown> | null
}

interface ReenviarFalhasModalProps {
  open: boolean
  onClose: () => void
  loteId: string
  cardId: string
  orgId: string
  phoneNumberId: string
  templateSlug: string
  failures: Array<{
    id: string
    contact_id: string | null
    sender_phone: string | null
    contatos: { nome: string | null; sobrenome: string | null; telefone: string | null; email?: string | null } | null
    metadata: { body_parameters?: string[]; button_parameters?: string[] } | null
  }>
}

// ── helpers de resolução (cópia leve do ConfigurarEnvioModal) ────────────

const MONTHS_FULL = [
  'janeiro','fevereiro','março','abril','maio','junho',
  'julho','agosto','setembro','outubro','novembro','dezembro',
]
function longDate(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${String(d.getDate()).padStart(2, '0')} de ${MONTHS_FULL[d.getMonth()]} de ${d.getFullYear()}`
}
function shortDate(s: string | null): string {
  if (!s) return ''
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return s
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}
function readString(obj: Record<string, unknown> | null, ...keys: string[]): string | null {
  if (!obj) return null
  for (const k of keys) {
    const v = obj[k]
    if (typeof v === 'string' && v.trim().length > 0) return v.trim()
  }
  return null
}
function cleanNomeCasal(titulo: string): string {
  return titulo.replace(/^\s*(DW|D\.?W\.?|Elopement|Elop\.?)\s*[|\-—–]\s*/i, '').trim()
}
function extractCoupleSlug(siteUrl: string | null): string {
  if (!siteUrl) return ''
  try {
    const url = new URL(siteUrl)
    const parts = url.pathname.split('/').filter(Boolean)
    return parts[parts.length - 1] ?? ''
  } catch {
    const m = siteUrl.match(/\/([^/]+)\/?$/)
    return m?.[1] ?? ''
  }
}
function resolveField(
  key: FieldKey,
  contato: { nome: string | null; sobrenome: string | null; telefone: string | null; email: string | null },
  card: { titulo: string; produto_data: Record<string, unknown> | null; data_viagem_inicio: string | null } | null,
): string {
  switch (key) {
    case 'contact.nome':          return contato.nome ?? ''
    case 'contact.sobrenome':     return contato.sobrenome ?? ''
    case 'contact.telefone':      return contato.telefone ?? ''
    case 'contact.email':         return contato.email ?? ''
    case 'card.nome_casal':       return card ? cleanNomeCasal(card.titulo) : ''
    case 'card.codigo_casamento': return card ? extractCoupleSlug(readString(card.produto_data, 'ww_site_casamento', 'site_casamento')) : ''
    case 'card.local':            return card ? (readString(card.produto_data, 'ww_local', 'local') ?? '') : ''
    case 'card.data_evento':      return card ? longDate(card.data_viagem_inicio) : ''
    case 'card.site_casamento':   return card ? (readString(card.produto_data, 'ww_site_casamento', 'site_casamento') ?? '') : ''
    case 'card.data_final_acao':  return card ? shortDate(readString(card.produto_data, 'ww_data_final_acao')) : ''
    case 'card.link_atendimento': return card ? (readString(card.produto_data, 'ww_link_atendimento') ?? '') : ''
  }
}

// ── componente ───────────────────────────────────────────────────────────

export function ReenviarFalhasModal({
  open,
  onClose,
  cardId,
  orgId,
  phoneNumberId,
  templateSlug,
  failures,
}: ReenviarFalhasModalProps) {
  const [items, setItems] = useState<FailedMessage[]>([])
  const [sending, setSending] = useState(false)

  const { data: card } = useQuery<CardExtras | null>({
    queryKey: ['card-extras', cardId],
    enabled: open && !!cardId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cards')
        .select('titulo, data_viagem_inicio, produto_data')
        .eq('id', cardId)
        .maybeSingle()
      if (error) throw error
      return data as CardExtras | null
    },
  })

  useEffect(() => {
    if (!open) return
    const next: FailedMessage[] = failures.map(f => {
      const nome = f.contatos?.nome ?? ''
      const sobre = f.contatos?.sobrenome ?? ''
      return {
        id: f.id,
        contact_id: f.contact_id,
        contact_name: `${nome}${sobre ? ' ' + sobre : ''}`.trim() || '(sem nome)',
        contato: {
          nome: f.contatos?.nome ?? null,
          sobrenome: f.contatos?.sobrenome ?? null,
          telefone: f.contatos?.telefone ?? null,
          email: f.contatos?.email ?? null,
        },
        telefone: f.sender_phone ?? (f.contatos?.telefone ?? '').replace(/\D/g, ''),
        body_parameters: [...(f.metadata?.body_parameters ?? [])],
        button_parameter: f.metadata?.button_parameters?.[0] ?? '',
      }
    })
    setItems(next)
  }, [open, failures])

  const varCount = useMemo(
    () => Math.max(...items.map(i => i.body_parameters.length), 0),
    [items],
  )
  const hasButtonVar = items.some(i => i.button_parameter !== '')

  if (!open) return null

  const updateTelefone = (id: string, value: string) => {
    setItems(prev => prev.map(it => it.id === id ? { ...it, telefone: value.replace(/\D/g, '') } : it))
  }
  const updateVar = (id: string, index: number, value: string) => {
    setItems(prev => prev.map(it => {
      if (it.id !== id) return it
      const next = [...it.body_parameters]
      next[index] = value
      return { ...it, body_parameters: next }
    }))
  }
  const updateButton = (id: string, value: string) => {
    setItems(prev => prev.map(it => it.id === id ? { ...it, button_parameter: value } : it))
  }
  const dropFieldOnVar = (id: string, index: number, fieldKey: FieldKey) => {
    setItems(prev => prev.map(it => {
      if (it.id !== id) return it
      const next = [...it.body_parameters]
      next[index] = resolveField(fieldKey, it.contato, card ?? null)
      return { ...it, body_parameters: next }
    }))
  }
  const dropFieldOnButton = (id: string, fieldKey: FieldKey) => {
    setItems(prev => prev.map(it => {
      if (it.id !== id) return it
      return { ...it, button_parameter: resolveField(fieldKey, it.contato, card ?? null) }
    }))
  }
  const removeItem = (id: string) => {
    setItems(prev => prev.filter(it => it.id !== id))
  }

  const handleSend = async () => {
    if (items.length === 0 || sending) return
    setSending(true)
    try {
      const recipients = items
        .filter(it => it.telefone && it.contact_id)
        .map(it => ({
          to: it.telefone,
          contact_id: it.contact_id as string,
          body_parameters: it.body_parameters,
          button_parameters: it.button_parameter ? [it.button_parameter] : undefined,
        }))

      if (recipients.length === 0) {
        setSending(false)
        return
      }

      const CHUNK = 50
      for (let i = 0; i < recipients.length; i += CHUNK) {
        await supabase.functions.invoke('send-echo-template', {
          body: {
            template_name: templateSlug,
            language: 'pt_BR',
            phone_number_id: phoneNumberId,
            card_id: cardId,
            org_id: orgId,
            recipients: recipients.slice(i, i + CHUNK),
          },
        })
      }
      onClose()
    } catch (err) {
      console.error('[reenviar] falha:', err)
    } finally {
      setSending(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-6xl max-h-[88vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Reenviar falhas</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Arraste campos pra cada linha ou edite à mão · <code className="bg-slate-100 px-1.5 py-0.5 rounded text-[11px]">{templateSlug}</code>
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body: tabela + painel de campos */}
        <div className="flex-1 overflow-auto grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-4 px-6 py-4">
          {/* Tabela editável */}
          <div className="min-w-0 overflow-x-auto">
            {items.length === 0 ? (
              <div className="text-center text-sm text-slate-500 py-8">
                Nenhuma falha pra reenviar.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-xs text-slate-500 uppercase tracking-wide border-b border-slate-200">
                  <tr>
                    <th className="text-left py-2 pr-3 min-w-[10rem]">Contato</th>
                    <th className="text-left py-2 pr-3 w-36">Telefone</th>
                    {Array.from({ length: varCount }, (_, i) => (
                      <th key={i} className="text-left py-2 pr-3 min-w-[10rem]">Var {i + 1}</th>
                    ))}
                    {hasButtonVar && <th className="text-left py-2 pr-3 min-w-[10rem]">Botão</th>}
                    <th className="w-8"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map(it => (
                    <tr key={it.id}>
                      <td className="py-2 pr-3 text-slate-700 font-medium truncate max-w-[10rem]">
                        {it.contact_name}
                      </td>
                      <td className="py-2 pr-3">
                        <input
                          type="text"
                          value={it.telefone}
                          onChange={e => updateTelefone(it.id, e.target.value)}
                          placeholder="5511..."
                          className="w-full h-8 px-2 text-sm border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-400 tabular-nums"
                        />
                      </td>
                      {Array.from({ length: varCount }, (_, i) => (
                        <td key={i} className="py-2 pr-3">
                          <DroppableInput
                            value={it.body_parameters[i] ?? ''}
                            onChange={v => updateVar(it.id, i, v)}
                            onDropField={key => dropFieldOnVar(it.id, i, key)}
                          />
                        </td>
                      ))}
                      {hasButtonVar && (
                        <td className="py-2 pr-3">
                          <DroppableInput
                            value={it.button_parameter}
                            onChange={v => updateButton(it.id, v)}
                            onDropField={key => dropFieldOnButton(it.id, key)}
                          />
                        </td>
                      )}
                      <td className="py-2 text-right">
                        <button
                          type="button"
                          onClick={() => removeItem(it.id)}
                          className="text-slate-400 hover:text-rose-600"
                          title="Remover da lista"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Painel de campos arrastáveis */}
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 self-start lg:sticky lg:top-0">
            <h4 className="text-sm font-semibold text-slate-900 mb-1">Campos Disponíveis</h4>
            <p className="text-xs text-slate-500 mb-3">Arraste pra qualquer Var da tabela</p>
            <FieldGroup
              title="CONTATO"
              fields={AVAILABLE_FIELDS.filter(f => f.group === 'CONTATO')}
            />
            <div className="mt-4">
              <FieldGroup
                title="CASAMENTO"
                fields={AVAILABLE_FIELDS.filter(f => f.group === 'CASAMENTO')}
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-between items-center px-6 py-3 border-t border-slate-200 gap-2">
          <div className="text-xs text-slate-500">
            {items.length === 0 ? '0' : items.length} {items.length === 1 ? 'destinatário' : 'destinatários'}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="h-9 px-4 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSend}
              disabled={items.length === 0 || sending}
              className={cn(
                'inline-flex items-center gap-1.5 h-9 px-4 text-sm font-medium text-white rounded-md transition-colors',
                items.length === 0 || sending ? 'bg-indigo-300 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700',
              )}
            >
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Reenviar ({items.length})
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── DroppableInput ──────────────────────────────────────────────────────

interface DroppableInputProps {
  value: string
  onChange: (v: string) => void
  onDropField: (key: FieldKey) => void
}

function DroppableInput({ value, onChange, onDropField }: DroppableInputProps) {
  const [isOver, setIsOver] = useState(false)
  return (
    <input
      type="text"
      value={value}
      onChange={e => onChange(e.target.value)}
      onDragOver={e => { e.preventDefault(); setIsOver(true) }}
      onDragLeave={() => setIsOver(false)}
      onDrop={e => {
        e.preventDefault()
        setIsOver(false)
        const k = e.dataTransfer.getData('text/x-field-key')
        if (k) onDropField(k as FieldKey)
      }}
      className={cn(
        'w-full h-8 px-2 text-sm border rounded focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-400',
        isOver ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200',
      )}
    />
  )
}

// ── FieldGroup ──────────────────────────────────────────────────────────

function FieldGroup({ title, fields }: { title: string; fields: FieldDescriptor[] }) {
  return (
    <div>
      <h5 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">{title}</h5>
      <div className="space-y-1.5">
        {fields.map(field => (
          <div
            key={field.key}
            draggable
            onDragStart={e => e.dataTransfer.setData('text/x-field-key', field.key)}
            className={cn(
              'flex items-center gap-2 px-2.5 py-1.5 rounded-md cursor-grab text-sm transition-colors',
              title === 'CONTATO'
                ? 'bg-sky-50 border border-sky-100 hover:bg-sky-100'
                : 'bg-rose-50 border border-rose-100 hover:bg-rose-100',
            )}
          >
            <GripVertical className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <div className={cn('text-xs font-medium truncate', title === 'CONTATO' ? 'text-sky-700' : 'text-rose-700')}>
              {field.label}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
