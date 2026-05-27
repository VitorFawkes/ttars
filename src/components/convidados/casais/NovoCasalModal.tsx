import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Check, Sparkles, Copy, ExternalLink, Send, CheckCircle2, Loader2 } from 'lucide-react'
import { cn } from '../../../lib/utils'
import { gerarCodigo, isValidCodigo } from '../../../lib/convidados/gerarCodigo'
import { formatPhoneBR, isValidPhoneBR, phoneDigits } from '../../../lib/convidados/formatPhoneBR'
import { buildLinkCasal, buildWhatsappLink } from '../../../lib/convidados/buildLink'
import { useCreateCasal } from '../../../hooks/convidados/casais/useCasalMutations'

interface NovoCasalModalProps {
  open: boolean
  onClose: () => void
  defaultCardId?: string | null
  defaultCardTitulo?: string | null
}

type Step = 'form' | 'share'

export function NovoCasalModal({ open, onClose, defaultCardId, defaultCardTitulo }: NovoCasalModalProps) {
  const [step, setStep] = useState<Step>('form')
  const [nome, setNome] = useState('')
  const [whatsapp, setWhatsapp] = useState('')
  const [codigo, setCodigo] = useState(() => gerarCodigo())
  const [created, setCreated] = useState<{ codigo: string; nome: string; whatsapp: string } | null>(null)
  const [errors, setErrors] = useState<{ nome?: string; codigo?: string; whatsapp?: string }>({})
  const create = useCreateCasal()
  const nomeRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setStep('form'); setErrors({}); setNome(''); setWhatsapp('')
      setCodigo(gerarCodigo()); setCreated(null)
      setTimeout(() => nomeRef.current?.focus(), 50)
    }
  }, [open])

  const handleRegenCodigo = useCallback(() => setCodigo(gerarCodigo()), [])

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    const errs: typeof errors = {}
    if (!nome.trim()) errs.nome = 'Informe o nome do casal'
    const codeUp = codigo.toUpperCase().trim()
    if (!isValidCodigo(codeUp)) errs.codigo = 'Apenas A-Z, 0-9, hífen (4-16 chars)'
    if (!isValidPhoneBR(whatsapp)) errs.whatsapp = 'Informe um WhatsApp válido'
    setErrors(errs)
    if (Object.keys(errs).length > 0) return

    try {
      await create.mutateAsync({
        nome_casal: nome.trim(), whatsapp, codigo: codeUp,
        card_id: defaultCardId || null,
      })
      setCreated({ codigo: codeUp, nome: nome.trim(), whatsapp })
      setStep('share')
    } catch (err) {
      const msg = (err as Error).message || 'Erro ao criar casal'
      if (msg.includes('duplicate') || msg.includes('unique')) {
        setErrors({ codigo: 'Esse código já existe — gere outro' })
      } else {
        setErrors({ nome: msg })
      }
    }
  }, [nome, codigo, whatsapp, create, defaultCardId])

  if (!open) return null

  const node = (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: 'rgba(33,31,29,0.42)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      role="dialog" aria-modal="true">
      <div className="w-full max-w-[520px] max-h-[90vh] overflow-y-auto bg-white rounded-xl shadow-ww-modal flex flex-col"
        onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between gap-3 px-5 py-3 border-b border-ww-sand">
          <h2 className="font-ww-serif italic text-lg text-ww-n700">
            {step === 'form' ? 'Novo casal' : 'Casal cadastrado'}
          </h2>
          <button type="button" onClick={onClose}
            className="p-1 rounded hover:bg-ww-cream text-ww-n500" aria-label="Fechar">
            <X className="w-4 h-4" />
          </button>
        </header>

        {step === 'form' ? (
          <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-4">
            {defaultCardTitulo && (
              <p className="text-xs text-ww-n500 italic">
                Vinculando ao casamento: <span className="text-ww-n700">{defaultCardTitulo}</span>
              </p>
            )}

            <Field label="Nome do casal" hint="Como vocês querem aparecer (ex: Maria & João)" error={errors.nome}>
              <input ref={nomeRef} value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Maria & João"
                className={cn(inputCls, errors.nome && inputErrCls)} />
            </Field>

            <Field label="Código do casamento" hint="Será parte do link compartilhado com o casal" error={errors.codigo}
              rightAction={
                <button type="button" onClick={handleRegenCodigo}
                  className="text-[11px] text-ww-gold-ink hover:text-ww-gold inline-flex items-center gap-1">
                  <Sparkles className="w-3 h-3" /> Gerar outro
                </button>
              }>
              <input value={codigo} onChange={(e) => setCodigo(e.target.value.toUpperCase())}
                className={cn(inputCls, 'font-mono uppercase tracking-wider', errors.codigo && inputErrCls)} />
            </Field>

            <Field label="WhatsApp do contato" hint="Para receber o link e tirar dúvidas" error={errors.whatsapp}>
              <div className="flex items-stretch border border-ww-sand-dk rounded-md focus-within:ring-2 focus-within:ring-ww-gold/30 focus-within:border-ww-gold">
                <span className="inline-flex items-center px-2 text-xs text-ww-n500 border-r border-ww-sand-dk bg-ww-paper rounded-l-md">+55</span>
                <input value={whatsapp} onChange={(e) => setWhatsapp(formatPhoneBR(e.target.value))}
                  placeholder="48 99999-9999" inputMode="numeric"
                  className="flex-1 px-3 py-2 text-sm bg-transparent rounded-r-md focus:outline-none" />
              </div>
            </Field>

            <footer className="flex items-center justify-end gap-2 pt-2 border-t border-ww-sand">
              <button type="button" onClick={onClose}
                className="px-3 h-9 text-sm text-ww-n600 hover:text-ww-n700">Cancelar</button>
              <button type="submit" disabled={create.isPending}
                className="inline-flex items-center gap-1.5 px-3 h-9 text-sm font-medium rounded-md bg-ww-gold text-white hover:bg-ww-gold-ink disabled:opacity-60 disabled:cursor-wait transition-colors">
                {create.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Cadastrar casal
              </button>
            </footer>
          </form>
        ) : created ? (
          <ShareView casal={created} onClose={onClose} />
        ) : null}
      </div>
    </div>
  )
  return createPortal(node, document.body)
}

const inputCls = 'w-full px-3 py-2 text-sm border border-ww-sand-dk rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-ww-gold/30 focus:border-ww-gold'
const inputErrCls = 'border-red-300 focus:border-red-500 focus:ring-red-200'

interface FieldProps {
  label: string
  hint?: string
  error?: string
  children: React.ReactNode
  rightAction?: React.ReactNode
}
function Field({ label, hint, error, children, rightAction }: FieldProps) {
  return (
    <label className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-ww-n600">{label}</span>
        {rightAction}
      </div>
      {children}
      {hint && !error && <span className="text-[11px] italic text-ww-n400">{hint}</span>}
      {error && <span className="text-[11px] text-red-600">{error}</span>}
    </label>
  )
}

function ShareView({ casal, onClose }: { casal: { codigo: string; nome: string; whatsapp: string }; onClose: () => void }) {
  const link = useMemo(() => buildLinkCasal(casal.codigo), [casal.codigo])
  const wa = useMemo(() => buildWhatsappLink(phoneDigits(casal.whatsapp), casal.codigo), [casal.whatsapp, casal.codigo])
  const [copied, setCopied] = useState(false)
  const handleCopy = async () => {
    try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1800) } catch { /* ignore */ }
  }

  return (
    <div className="p-5 flex flex-col gap-4">
      <div className="flex justify-center">
        <div className="w-14 h-14 rounded-full bg-emerald-50 border-2 border-emerald-200 flex items-center justify-center">
          <CheckCircle2 className="w-7 h-7 text-emerald-600" />
        </div>
      </div>
      <div className="text-center">
        <h3 className="font-ww-serif italic text-xl text-ww-n700">{casal.nome}</h3>
        <p className="text-sm text-ww-n500 mt-0.5">já tem um link próprio.</p>
      </div>

      <div className="bg-ww-paper border border-ww-sand rounded-md p-3 flex items-center gap-2">
        <code className="font-mono text-[12px] text-ww-n700 truncate flex-1">{link}</code>
        <button type="button" onClick={handleCopy}
          className={cn('inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium border transition-colors',
            copied ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-white border-ww-sand text-ww-n600 hover:bg-ww-cream')}>
          {copied ? <CheckCircle2 className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
          {copied ? 'Copiado' : 'Copiar'}
        </button>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        {wa && (
          <a href={wa} target="_blank" rel="noopener noreferrer"
            className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 h-10 text-sm font-medium rounded-md bg-[#25D366] text-white hover:bg-[#128C7E] transition-colors">
            <Send className="w-4 h-4" /> Enviar via WhatsApp
          </a>
        )}
        <a href={link} target="_blank" rel="noopener noreferrer"
          className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 h-10 text-sm font-medium rounded-md bg-ww-gold text-white hover:bg-ww-gold-ink transition-colors">
          <ExternalLink className="w-4 h-4" /> Abrir lista
        </a>
      </div>

      <footer className="flex items-center justify-center pt-1">
        <button type="button" onClick={onClose} className="px-3 h-9 text-sm text-ww-n600 hover:text-ww-n700">Concluir</button>
      </footer>
    </div>
  )
}
