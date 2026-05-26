import { useCallback, useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { X, Save, Send, GripVertical, Heart, Users, Loader2, AlertCircle, Eye } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { useGuests } from '../../../hooks/convidados/useGuests'
import { useWhatsAppLinhas } from '../../../hooks/useWhatsAppLinhas'
import { parseTemplateBody, useWhatsAppTemplates } from '../../../hooks/useWhatsAppTemplates'
import {
  AVAILABLE_FIELDS,
  useTemplateVarConfig,
  type FieldDescriptor,
  type FieldKey,
  type TemplateVarConfig,
} from '../../../hooks/convidados/useTemplateVarConfig'
import { cn } from '../../../lib/utils'

interface ConfigurarEnvioModalProps {
  open: boolean
  onClose: () => void
  cardId: string
  weddingTitulo: string
  templateSlug: string
  /** Quando passado, restringe os destinatários a esses IDs de wedding_guests
   *  e ignora o filtro padrão "excluir nao_vai". Usado pela aba Envio Específico
   *  para mandar template ad-hoc para um público escolhido manualmente. */
  targetGuestIds?: string[]
}

interface CardExtras {
  titulo: string
  data_viagem_inicio: string | null
  produto_data: Record<string, unknown> | null
}

const MONTHS_FULL = [
  'janeiro','fevereiro','março','abril','maio','junho',
  'julho','agosto','setembro','outubro','novembro','dezembro',
]

function longDate(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return `${String(d.getDate()).padStart(2, '0')} de ${MONTHS_FULL[d.getMonth()]} de ${d.getFullYear()}`
}

function shortDate(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
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

/** Remove prefixos do tipo "DW |", "DW —", "Elopement |" do título do card —
 *  o título "limpo" é o que aparece na mensagem do convidado. */
function cleanNomeCasal(titulo: string): string {
  return titulo
    .replace(/^\s*(DW|D\.?W\.?|Elopement|Elop\.?)\s*[|\-—–]\s*/i, '')
    .trim()
}

/** Extrai o slug do casal a partir da URL do site Wedme.
 *  Ex: https://www.wedme.com.br/chriseguilherme/  →  chriseguilherme */
function extractCoupleSlug(siteUrl: string | null): string {
  if (!siteUrl) return ''
  try {
    const url = new URL(siteUrl)
    const parts = url.pathname.split('/').filter(Boolean)
    return parts[parts.length - 1] ?? ''
  } catch {
    // URL inválida — tenta extração textual
    const m = siteUrl.match(/\/([^/]+)\/?$/)
    return m?.[1] ?? ''
  }
}

/** Resolve o valor de um FieldKey pra um contato específico. */
function resolveField(
  key: FieldKey | null,
  contato: { nome: string | null; sobrenome: string | null; telefone: string | null; email: string | null },
  card: { titulo: string; produto_data: Record<string, unknown> | null; data_viagem_inicio: string | null },
): string {
  if (!key) return ''
  switch (key) {
    case 'contact.nome':          return contato.nome ?? ''
    case 'contact.sobrenome':     return contato.sobrenome ?? ''
    case 'contact.telefone':      return contato.telefone ?? ''
    case 'contact.email':         return contato.email ?? ''
    case 'card.nome_casal':       return cleanNomeCasal(card.titulo)
    case 'card.codigo_casamento': return extractCoupleSlug(readString(card.produto_data, 'ww_site_casamento', 'site_casamento'))
    case 'card.local':            return readString(card.produto_data, 'ww_local', 'local') ?? ''
    case 'card.data_evento':      return longDate(card.data_viagem_inicio) ?? ''
    case 'card.site_casamento':   return readString(card.produto_data, 'ww_site_casamento', 'site_casamento') ?? ''
    case 'card.data_final_acao':  return shortDate(readString(card.produto_data, 'ww_data_final_acao')) ?? ''
    case 'card.link_atendimento': return readString(card.produto_data, 'ww_link_atendimento') ?? ''
  }
}

function fieldPreview(
  key: FieldKey,
  card: { titulo: string; produto_data: Record<string, unknown> | null; data_viagem_inicio: string | null },
  firstContact?: { nome: string | null; sobrenome: string | null; telefone: string | null; email: string | null },
): string {
  // Resolve usando placeholder de contato — assim "Link do Casal" e "Nome do Casal"
  // ficam preenchidos no painel direito mesmo antes de termos o primeiro contato.
  const stub = firstContact ?? { nome: null, sobrenome: null, telefone: null, email: null }
  return resolveField(key, stub, card) || '—'
}

export function ConfigurarEnvioModal({ open, onClose, cardId, weddingTitulo, templateSlug, targetGuestIds }: ConfigurarEnvioModalProps) {
  const { config, isLoading: configLoading, save, isSaving } = useTemplateVarConfig(templateSlug)
  const { data: guests = [], isLoading: guestsLoading } = useGuests(cardId)
  const { data: linhas = [] } = useWhatsAppLinhas('WEDDING')
  const [phoneNumberId, setPhoneNumberId] = useState<string | null>(null)
  const { data: templates = [], isLoading: templatesLoading } = useWhatsAppTemplates(phoneNumberId)
  const selectedTemplate = useMemo(
    () => templates.find(t => t.name === templateSlug) ?? null,
    [templates, templateSlug],
  )
  // Detecta dinamicamente do template real da Meta quantas vars o body tem e
  // se há placeholder em URL de botão. Enquanto o template não chega da API,
  // varCount=0 e o componente mostra um skeleton no lugar dos slots.
  const parsedTemplate = useMemo(
    () => selectedTemplate ? parseTemplateBody(selectedTemplate) : null,
    [selectedTemplate],
  )
  const varCount = parsedTemplate?.paramCount ?? 0
  const showButton = (parsedTemplate?.buttonUrlParamCount ?? 0) > 0
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

  // Estado local (draft) do mapping — sincroniza com config carregado.
  const [vars, setVars] = useState<(FieldKey | null)[]>([])
  const [buttonVar, setButtonVar] = useState<FieldKey | null>(null)
  const [savedFlash, setSavedFlash] = useState(false)

  useEffect(() => {
    if (!open) return
    const next: (FieldKey | null)[] = Array.from({ length: varCount }, (_, i) => config.vars[i] ?? null)
    setVars(next)
    setButtonVar(config.buttonVar)
    // Linha: respeita config salvo; senão, default pra "Convidados" se existir.
    setPhoneNumberId(prev => prev ?? config.phoneNumberId)
    setSavedFlash(false)
  }, [open, config, varCount])

  // Default da linha pra "Convidados" quando não há nada salvo ainda.
  useEffect(() => {
    if (!open) return
    if (phoneNumberId) return
    if (linhas.length === 0) return
    const convidados = linhas.find(l => l.phone_number_label === 'Convidados') ?? linhas[0]
    if (convidados?.phone_number_id) {
      setPhoneNumberId(convidados.phone_number_id)
    }
  }, [open, phoneNumberId, linhas])

  // Envio padrão = quem ainda não respondeu definitivamente.
  // Exclui 'nao_vai' (declinou) e 'confirmado' (já confirmou — não precisa
  // mais ser lembrado). Mantém 'sem_reacao' e 'intencao'.
  // Quando `targetGuestIds` veio (aba Envio Específico), respeita a seleção
  // manual do usuário — inclusive permitindo qualquer status — e continua
  // filtrando por telefone presente.
  const recipients = useMemo(() => {
    if (targetGuestIds && targetGuestIds.length > 0) {
      const set = new Set(targetGuestIds)
      return guests.filter(g => set.has(g.id) && (g.telefone ?? '').trim().length > 0)
    }
    return guests.filter(g =>
      g.status_rsvp !== 'nao_vai' &&
      g.status_rsvp !== 'confirmado' &&
      (g.telefone ?? '').trim().length > 0,
    )
  }, [guests, targetGuestIds])

  const firstContact = recipients[0] ?? null

  // ── Drag-and-drop ─────────────────────────────────────────────────────

  const handleDropOnVar = useCallback((index: number, fieldKey: FieldKey) => {
    setVars(prev => {
      const next = [...prev]
      next[index] = fieldKey
      return next
    })
  }, [])

  const handleDropOnButton = useCallback((fieldKey: FieldKey) => {
    setButtonVar(fieldKey)
  }, [])

  const handleClearVar = useCallback((index: number) => {
    setVars(prev => {
      const next = [...prev]
      next[index] = null
      return next
    })
  }, [])

  // ── Salvar Padrão ─────────────────────────────────────────────────────

  const handleSave = useCallback(async () => {
    const next: TemplateVarConfig = {
      vars,
      buttonVar: showButton ? buttonVar : null,
      phoneNumberId,
    }
    await save(next)
    setSavedFlash(true)
    setTimeout(() => setSavedFlash(false), 2000)
  }, [vars, buttonVar, phoneNumberId, showButton, save])

  // ── Enviar ────────────────────────────────────────────────────────────

  const handleSend = useCallback(() => {
    if (!card || !phoneNumberId || recipients.length === 0) return

    // Resolve body_parameters por destinatário. `contact_id` é necessário
    // pra edge function registrar em whatsapp_messages — sem isso o trigger
    // não consegue espelhar o "Não vou ao evento" pro casamento correto.
    const payloadRecipients = recipients.map(g => ({
      to: (g.telefone ?? '').replace(/\D/g, ''),
      contact_id: g.contato_id,
      body_parameters: vars.map(varKey => resolveField(varKey, g, card)),
      button_parameters: showButton && buttonVar ? [resolveField(buttonVar, g, card)] : undefined,
    }))

    // Fire-and-forget: fecha o modal imediatamente e dispara em background.
    // O progresso é refletido na aba "Envios do dia" via realtime no envio_lotes.
    const orgId = recipients[0]?.org_id ?? null
    const CHUNK = 50
    ;(async () => {
      for (let i = 0; i < payloadRecipients.length; i += CHUNK) {
        const slice = payloadRecipients.slice(i, i + CHUNK)
        try {
          await supabase.functions.invoke('send-echo-template', {
            body: {
              template_name: templateSlug,
              language: 'pt_BR',
              phone_number_id: phoneNumberId,
              card_id: cardId,
              org_id: orgId,
              recipients: slice,
            },
          })
        } catch (err) {
          console.error('[send-echo-template] background invoke falhou:', err)
        }
      }
    })()

    onClose()
  }, [card, phoneNumberId, recipients, vars, buttonVar, showButton, templateSlug, cardId, onClose])

  if (!open) return null

  const canSend = !!phoneNumberId && recipients.length > 0 && vars.every(v => v !== null) && !!card

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-7xl max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-900">Configurar Envio</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body: 3 colunas (preview | config | campos) */}
        <div className="flex-1 overflow-y-auto px-6 py-4 grid grid-cols-1 lg:grid-cols-[minmax(340px,1fr)_minmax(0,1fr)_280px] gap-4">
          {/* Coluna 1 — Preview da mensagem (sticky) */}
          <div className="lg:sticky lg:top-0 lg:self-start">
            <MessagePreview
              template={selectedTemplate}
              templatesLoading={templatesLoading}
              phoneNumberId={phoneNumberId}
              vars={vars}
              buttonVar={buttonVar}
              firstContact={firstContact}
              card={card}
              templateSlug={templateSlug}
              weddingTitulo={weddingTitulo}
            />
          </div>

          {/* Coluna 2 — Cabeçalho do casamento + linha + vars + contatos */}
          <div className="flex flex-col gap-4 min-w-0">
            <div className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                  <Heart className="w-4 h-4 text-rose-500" />
                  {weddingTitulo}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Template: <code className="bg-white border border-slate-200 px-1.5 py-0.5 rounded text-[11px]">{templateSlug}</code>
                </p>
              </div>
              <div className="flex items-center gap-1.5 text-sm text-slate-700">
                <Users className="w-4 h-4 text-indigo-500" />
                <span className="font-semibold text-indigo-600 tabular-nums">{recipients.length}</span>
              </div>
            </div>

            {/* Linha WhatsApp */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-700">Linha WhatsApp</label>
              <select
                value={phoneNumberId ?? ''}
                onChange={e => setPhoneNumberId(e.target.value || null)}
                className="w-full h-9 px-3 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-400"
              >
                <option value="">Selecionar linha...</option>
                {linhas.map(l => (
                  <option key={l.phone_number_id ?? l.id} value={l.phone_number_id ?? ''}>
                    {l.phone_number_label}
                  </option>
                ))}
              </select>
            </div>

            {/* Vars */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-medium text-slate-700">Variáveis do Corpo ({varCount})</h4>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={isSaving || configLoading || !parsedTemplate}
                  className="inline-flex items-center gap-1.5 h-8 px-3 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 disabled:opacity-50"
                >
                  <Save className="w-3.5 h-3.5" />
                  {isSaving ? 'Salvando…' : savedFlash ? 'Salvo ✓' : 'Salvar Padrão'}
                </button>
              </div>
              {!parsedTemplate && templatesLoading ? (
                <div className="space-y-2">
                  {[0, 1, 2].map(i => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="text-xs font-medium text-slate-300 w-12 shrink-0">···</span>
                      <div className="flex-1 h-9 rounded-md bg-slate-100 animate-pulse" />
                    </div>
                  ))}
                </div>
              ) : !parsedTemplate ? (
                <div className="text-xs text-slate-500 italic px-1 py-2">
                  Selecione a linha WhatsApp para carregar o template.
                </div>
              ) : varCount === 0 ? (
                <div className="text-xs text-slate-500 italic px-1 py-2">
                  Este template não tem variáveis a preencher.
                </div>
              ) : (
                <div className="space-y-2">
                  {vars.map((varKey, i) => (
                    <VarSlot
                      key={i}
                      label={`Var ${i + 1}`}
                      fieldKey={varKey}
                      preview={varKey ? fieldPreview(varKey, card ?? { titulo: weddingTitulo, produto_data: null, data_viagem_inicio: null }, firstContact ?? undefined) : null}
                      onDrop={fieldKey => handleDropOnVar(i, fieldKey)}
                      onClear={() => handleClearVar(i)}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Variável do botão — só aparece se o template real tem {{N}} numa URL de botão. */}
            {showButton && (
              <div>
                <h4 className="text-sm font-medium text-slate-700 mb-2">Variável do Botão</h4>
                <VarSlot
                  label="Botão"
                  fieldKey={buttonVar}
                  preview={buttonVar ? fieldPreview(buttonVar, card ?? { titulo: weddingTitulo, produto_data: null, data_viagem_inicio: null }, firstContact ?? undefined) : null}
                  onDrop={fieldKey => handleDropOnButton(fieldKey)}
                  onClear={() => setButtonVar(null)}
                />
              </div>
            )}

            {/* Lista de contatos */}
            <div>
              <h4 className="text-sm font-medium text-slate-700 mb-2">
                Contatos ({recipients.length})
              </h4>
              {guestsLoading ? (
                <div className="text-sm text-slate-500 italic">Carregando…</div>
              ) : recipients.length === 0 ? (
                <div className="text-sm text-amber-700 bg-amber-50 border border-amber-100 rounded-md px-3 py-2">
                  Nenhum convidado ativo com telefone neste casamento.
                </div>
              ) : (
                <div className="border border-slate-200 rounded-md max-h-44 overflow-y-auto divide-y divide-slate-100">
                  {recipients.map(g => (
                    <div key={g.id} className="flex items-center justify-between px-3 py-2 text-sm">
                      <span className="text-slate-800 truncate">
                        {g.nome}{g.sobrenome ? ` ${g.sobrenome}` : ''}
                      </span>
                      <span className="text-xs text-slate-500 tabular-nums shrink-0 ml-2">{g.telefone}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>

          {/* Coluna direita: campos arrastáveis */}
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
            <h4 className="text-sm font-semibold text-slate-900 mb-1">Campos Disponíveis</h4>
            <p className="text-xs text-slate-500 mb-3">Arraste para as variáveis</p>
            <FieldGroup title="CONTATO" fields={AVAILABLE_FIELDS.filter(f => f.group === 'CONTATO')} firstContact={firstContact} card={card ?? null} />
            <div className="mt-4">
              <FieldGroup title="CASAMENTO" fields={AVAILABLE_FIELDS.filter(f => f.group === 'CASAMENTO')} firstContact={firstContact} card={card ?? null} />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-3 border-t border-slate-200">
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
            disabled={!canSend}
            className={cn(
              'inline-flex items-center gap-1.5 h-9 px-4 text-sm font-medium text-white rounded-md transition-colors',
              canSend ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-indigo-300 cursor-not-allowed',
            )}
          >
            <Send className="w-4 h-4" />
            Enviar ({recipients.length})
          </button>
        </div>
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────
// Sub-components
// ────────────────────────────────────────────────────────────────────────

interface MessagePreviewProps {
  template: import('../../../hooks/useWhatsAppTemplates').WhatsAppTemplate | null
  templatesLoading: boolean
  phoneNumberId: string | null
  vars: (FieldKey | null)[]
  buttonVar: FieldKey | null
  firstContact: { nome: string | null; sobrenome: string | null; telefone: string | null; email: string | null } | null
  card: CardExtras | null | undefined
  templateSlug: string
  weddingTitulo: string
}

/** Renderiza o corpo do template HSM com as variáveis substituídas pelos
 *  valores do primeiro convidado da lista. Mostra também header/footer/botões
 *  se o template tiver. Quando o template ainda não foi carregado, mostra
 *  um placeholder explicativo. */
function MessagePreview({
  template,
  templatesLoading,
  phoneNumberId,
  vars,
  buttonVar,
  firstContact,
  card,
  templateSlug,
  weddingTitulo,
}: MessagePreviewProps) {
  if (!phoneNumberId) {
    return (
      <div className="border border-dashed border-slate-300 rounded-lg p-3 bg-slate-50 flex items-center gap-2 text-xs text-slate-500">
        <Eye className="w-4 h-4 shrink-0" />
        <span>Selecione a linha WhatsApp para carregar o preview do template.</span>
      </div>
    )
  }
  if (templatesLoading) {
    return (
      <div className="border border-slate-200 rounded-lg p-3 bg-slate-50 flex items-center gap-2 text-xs text-slate-500">
        <Loader2 className="w-4 h-4 animate-spin shrink-0" />
        <span>Carregando templates da Meta…</span>
      </div>
    )
  }
  if (!template) {
    return (
      <div className="border border-amber-200 rounded-lg p-3 bg-amber-50 flex items-start gap-2 text-xs text-amber-800">
        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
        <span>
          Template <code className="bg-white px-1 rounded">{templateSlug}</code> não encontrado
          (ou não aprovado) na Meta para essa linha. Aprove o template antes de enviar.
        </span>
      </div>
    )
  }

  const cardForResolve = card ?? { titulo: weddingTitulo, produto_data: null, data_viagem_inicio: null }
  const contactForResolve = firstContact ?? { nome: '{nome}', sobrenome: '{sobrenome}', telefone: '{telefone}', email: '{email}' }

  // Substitui {{N}} pelos valores resolvidos (1-indexed).
  const renderText = (text: string): string =>
    text.replace(/\{\{\s*(\d+)\s*\}\}/g, (_match, n) => {
      const idx = parseInt(n, 10) - 1
      if (idx < 0 || idx >= vars.length) return `{{${n}}}`
      const value = resolveField(vars[idx], contactForResolve, cardForResolve)
      return value || `{{${n}}}`
    })

  const header = template.components.find(c => c.type === 'HEADER')
  const body = template.components.find(c => c.type === 'BODY')
  const footer = template.components.find(c => c.type === 'FOOTER')
  const buttons = template.components.find(c => c.type === 'BUTTONS')

  const buttonValue = buttonVar ? resolveField(buttonVar, contactForResolve, cardForResolve) : ''

  return (
    <div className="border border-slate-200 rounded-lg bg-emerald-50/30 p-3 space-y-2">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 uppercase tracking-wide">
        <Eye className="w-3.5 h-3.5" />
        Preview da mensagem
        {firstContact && (
          <span className="ml-auto text-[10px] font-normal text-slate-500 normal-case tracking-normal">
            usando dados de {firstContact.nome ?? '(primeiro contato)'}
          </span>
        )}
      </div>
      <div className="bg-white border border-emerald-200 rounded-lg shadow-sm p-3 space-y-2 text-sm">
        {header?.text && (
          <p className="font-semibold text-slate-900 whitespace-pre-wrap">{renderText(header.text)}</p>
        )}
        {body?.text && (
          <p className="text-slate-800 whitespace-pre-wrap leading-relaxed">{renderText(body.text)}</p>
        )}
        {footer?.text && (
          <p className="text-xs text-slate-500 whitespace-pre-wrap pt-1 border-t border-slate-100">
            {renderText(footer.text)}
          </p>
        )}
        {buttons?.buttons && buttons.buttons.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1.5 border-t border-slate-100">
            {buttons.buttons.map((b, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-700 text-xs font-medium"
                title={b.url ? renderText(b.url).replace(/\{\{1\}\}/g, buttonValue) : undefined}
              >
                {b.text}
                {b.type === 'URL' && buttonValue && (
                  <span className="text-[10px] text-indigo-500 max-w-[14rem] truncate">→ {buttonValue}</span>
                )}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

interface VarSlotProps {
  label: string
  fieldKey: FieldKey | null
  preview: string | null
  onDrop: (fieldKey: FieldKey) => void
  onClear: () => void
}

function VarSlot({ label, fieldKey, preview, onDrop, onClear }: VarSlotProps) {
  const [isOver, setIsOver] = useState(false)
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-medium text-slate-500 w-12 shrink-0">{label}</span>
      <div
        onDragOver={e => { e.preventDefault(); setIsOver(true) }}
        onDragLeave={() => setIsOver(false)}
        onDrop={e => {
          e.preventDefault()
          setIsOver(false)
          const k = e.dataTransfer.getData('text/x-field-key')
          if (k) onDrop(k as FieldKey)
        }}
        className={cn(
          'flex-1 min-w-0 h-9 px-3 flex items-center justify-between border rounded-md text-sm transition-colors',
          isOver
            ? 'border-indigo-400 bg-indigo-50'
            : fieldKey
            ? 'border-slate-200 bg-white'
            : 'border-dashed border-slate-300 bg-slate-50 text-slate-400',
        )}
      >
        {fieldKey ? (
          <>
            <span className="truncate text-slate-800">{preview || '(vazio)'}</span>
            <button
              type="button"
              onClick={onClear}
              className="ml-2 text-slate-400 hover:text-rose-600 shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </>
        ) : (
          <span>Arraste um campo</span>
        )}
      </div>
    </div>
  )
}

interface FieldGroupProps {
  title: string
  fields: FieldDescriptor[]
  firstContact?: { nome: string | null; sobrenome: string | null; telefone: string | null; email: string | null } | null
  card?: { titulo: string; produto_data: Record<string, unknown> | null; data_viagem_inicio: string | null } | null
}

function FieldGroup({ title, fields, firstContact, card }: FieldGroupProps) {
  return (
    <div>
      <h5 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">{title}</h5>
      <div className="space-y-1.5">
        {fields.map(field => {
          const preview = card
            ? fieldPreview(field.key, card, firstContact ?? undefined)
            : null
          return (
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
              <div className="min-w-0 flex-1">
                <div className={cn('text-xs font-medium truncate', title === 'CONTATO' ? 'text-sky-700' : 'text-rose-700')}>
                  {field.label}
                </div>
                {preview && (
                  <div className="text-[10px] text-slate-500 truncate">{preview}</div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
